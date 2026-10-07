// Execute the declared frontend suite with complete before/after input hashes.
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function files(folder){
  const result=[];for(const item of await fs.readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,item.name);if(item.isDirectory())result.push(...await files(file));else if(item.isFile())result.push(file);
  }return result;
}
async function snapshot(){
  const inputs=[...await files(path.join(root,'ui')),...await files(path.join(root,'desktop')),
    ...(await files(path.join(root,'tests'))).filter(file=>/\.(?:mjs|cjs|js)$/.test(file)||file.startsWith(path.join(root,'tests','fixtures')+path.sep)),
    ...['development/dense-stereographic-packet.mjs','development/dense-stereographic-budget.mjs','development/conforming-worker-fixtures.mjs'].map(name=>path.join(root,name)),
    ...['package.json','package-lock.json','vite.config.mjs'].map(name=>path.join(root,name))];
  const result={};for(const file of [...new Set(inputs)].sort())result[path.relative(root,file).split(path.sep).join('/')]=hash(await fs.readFile(file));
  return result;
}
async function main(){
  const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const commands=metadata.scripts['test:features'].split(' && ').map(command=>{
    const args=command.split(/\s+/);if(args.shift()!=='node'||args.some(arg=>!/^[-\w./]+$/.test(arg)))
      throw Error('Frontend qualification requires explicit node/file arguments.');
    return args;
  });
  const before=await snapshot(),startedUtc=new Date().toISOString(),runs=[];
  const folder=path.join(root,'artifacts');await fs.mkdir(folder,{recursive:true});
  const logPath=path.join(folder,'frontend-source-tests-'+metadata.version+'.log');
  const log=await fs.open(logPath,'wx');let exitCode=0;
  try{
    for(const args of commands){
      const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
      const chunks=[];for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>chunks.push(chunk));
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?null:code));});
      const output=Buffer.concat(chunks);await log.write(output);process.stdout.write(output);
      runs.push({args,exitCode:code});if(code!==0){exitCode=code??1;break;}
    }
  }finally{await log.close();}
  const after=await snapshot(),changedPaths=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(file=>before[file]!==after[file]).sort();
  const proof={version:metadata.version,startedUtc,finishedUtc:new Date().toISOString(),passed:exitCode===0&&!changedPaths.length,
    exitCode,sourceUnchanged:!changedPaths.length,changedPaths,sourceHashes:before,runs,logPath,
    scope:'Every declared test:features Node command; all UI/desktop/frontend test/helper files, test fixtures, dense independent oracle dependencies and package/build configuration bound before and after',
    qualificationScriptSha256:hash(await fs.readFile(__filename))};
  const destination=path.join(folder,'frontend-source-tests-'+metadata.version+'.json');
  await fs.writeFile(destination,JSON.stringify(proof,null,2)+'\n');
  console.log('Frontend source-qualified evidence: '+destination);if(!proof.passed)process.exitCode=exitCode||1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
