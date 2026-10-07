// Keep each sequential desktop suite's complete runtime proof independently.
// A later failure must not require repeating already qualified suites.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const digest=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
async function main(){
  const names=process.argv.slice(2);
  assert.ok(names.length&&names.every(n=>/^[a-zA-Z][a-zA-Z0-9]*$/.test(n)),'Provide explicit desktop suite names.');
  assert.equal(new Set(names).size,names.length,'Do not repeat a suite.');
  const folder=await fs.mkdtemp(path.join(root,'artifacts','desktop-series-'));
  const scriptSha256=await digest(__filename);
  const result={version:require('../package.json').version,startedUtc:new Date().toISOString(),
    passed:false,scriptSha256,qualifications:[],scope:'Sequential individual suites; each has its own final runtime/runner/harness hashes.'};
  console.log('Series evidence: '+folder);
  for(const name of names){
    const child=spawn(process.execPath,[path.join(root,'scripts','qualify-desktop.cjs'),name],
      {cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk.toString());
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?null:code));});
    const log=path.join(folder,name+'.log');await fs.writeFile(log,output,{flag:'wx'});
    const match=output.match(/^Evidence: (.+)$/m);let qualificationPath=null,qualified=false;
    if(match){
      const directory=path.resolve(match[1].trim());
      assert.ok(directory.startsWith(path.join(root,'artifacts')+path.sep),'Qualification escaped artifacts.');
      qualificationPath=path.join(directory,'result.json');
      const proof=JSON.parse(await fs.readFile(qualificationPath,'utf8'));
      qualified=exitCode===0&&proof.passed===true&&proof.runtimeUnchanged===true&&proof.qualificationScriptUnchanged===true&&
        proof.suites.length===1&&proof.suites[0].name===name&&proof.suites[0].passed===true&&proof.suites[0].scriptUnchanged===true;
    }
    result.qualifications.push({suite:name,passed:qualified,exitCode,path:qualificationPath,log});
    result.finishedUtc=new Date().toISOString();result.scriptUnchanged=await digest(__filename)===scriptSha256;
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(name+': '+(qualified?'PASS':'FAIL')+'; '+qualificationPath);
    if(!qualified||!result.scriptUnchanged){process.stderr.write(output);throw Error('Desktop series stopped at '+name+'; prior successful individual proofs are retained.');}
  }
  result.passed=true;await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
