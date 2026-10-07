// Bind the actual packaged resources to the tested source and an independent
// fresh Vite build. Mathematical and desktop behavior need separate evidence.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),hash=x=>createHash('sha256').update(x).digest('hex');
async function files(folder,prefix=''){
  const result=[];for(const item of await fs.readdir(folder,{withFileTypes:true})){
    const name=path.posix.join(prefix,item.name);
    if(item.isDirectory())result.push(...await files(path.join(folder,item.name),name));
    else if(item.isFile())result.push(name);
  }return result.sort();
}
async function main(){
  const version=require('../package.json').version;
  const unpacked=path.resolve(process.argv[2]||'release/'+version.split('.').slice(0,2).join('.')+'-candidate/win-unpacked');
  assert.ok(unpacked.startsWith(path.join(root,'release')+path.sep));
  const proofPath=path.join(root,'artifacts','frontend-source-tests-'+version+'.json');
  const proofBytes=await fs.readFile(proofPath),proof=JSON.parse(proofBytes);
  assert.equal(proof.passed,true);assert.equal(proof.sourceUnchanged,true);assert.equal(proof.version,version);
  const verify=async()=>{for(const [file,expected] of Object.entries(proof.sourceHashes))assert.equal(hash(await fs.readFile(path.join(root,file))),expected,file);};
  await verify();const archive=path.join(unpacked,'resources/app.asar'),before=hash(await fs.readFile(archive));
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
  const checked=[];
  for(const directory of ['desktop','dist']){
    const names=await files(path.join(root,directory));
    const packaged=asar.listPackage(archive).map(n=>n.replace(/\\/g,'/').replace(/^\/+/,'')).filter(n=>n.startsWith(directory+'/')&&!asar.statFile(archive,path.join(...n.split('/'))).files).sort();
    assert.deepEqual(packaged,names.map(n=>directory+'/'+n));
    for(const name of names){const relative=directory+'/'+name,bytes=await fs.readFile(path.join(root,relative));assert.ok(bytes.equals(asar.extractFile(archive,path.join(...relative.split('/')))),relative);checked.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}
  }
  const reproduction=path.join(root,'artifacts','frontend-reproduction-'+version);await assert.rejects(()=>fs.access(reproduction));
  const build=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--configLoader','native','--outDir','../artifacts/frontend-reproduction-'+version],{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  await fs.writeFile(path.join(root,'artifacts','frontend-reproduction-'+version+'.log'),(build.stdout||'')+(build.stderr||''));
  assert.equal(build.error,undefined);assert.equal(build.status,0);
  const names=await files(path.join(root,'dist'));assert.deepEqual(await files(reproduction),names);
  for(const name of names)assert.ok((await fs.readFile(path.join(root,'dist',name))).equals(await fs.readFile(path.join(reproduction,name))),name);
  await verify();assert.equal(hash(await fs.readFile(archive)),before);
  const result={version,passed:true,currentInputsUnchanged:true,archive,archiveSha256:before,files:checked,sourceTestProof:proofPath,sourceTestProofSha256:hash(proofBytes),sourceInputCount:Object.keys(proof.sourceHashes).length,freshBuild:{directory:reproduction,files:names,allBytesMatch:true},scope:'Exact packaged frontend/desktop bytes, qualified source bindings and fresh build reproduction; desktop behavior qualified separately'};
  await fs.writeFile(path.join(root,'artifacts','frontend-candidate-'+version+'.json'),JSON.stringify(result,null,2)+'\n');
  console.log('Frontend candidate PASS:',checked.length,'packaged files;',names.length,'freshly reproduced build files.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
