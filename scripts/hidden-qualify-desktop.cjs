// Current-source development qualification, with an independent native HWND
// watcher active before launch and until the sequential scenario runner exits.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {startHiddenWindowWatch}=require('./windows-hidden-window-watch.cjs');
const {hiddenRuntime}=require('./hidden-runtime.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  const runtime=await hiddenRuntime();
  if(!process.env.POLYTOPE_HIDDEN_CANARY)throw Error('Provide POLYTOPE_HIDDEN_CANARY pointing to a passing runtime canary for the current main source.');
  const canaryPath=path.resolve(process.env.POLYTOPE_HIDDEN_CANARY);
  const canary=JSON.parse(await fs.readFile(canaryPath,'utf8'));
  const mainSha256=createHash('sha256').update(await fs.readFile(path.join(root,'desktop','main.cjs'))).digest('hex');
  assert.equal(canary.passed,true,'Hidden runtime canary has not passed.');
  assert.equal(canary.version,require('../package.json').version);assert.equal(canary.mainSha256,mainSha256,'Hidden window policy changed since runtime qualification.');
  assert.equal(Boolean(canary.packaged),runtime.packaged,'Canary must qualify this development/packaged runtime.');
  assert.equal(canary.executablePath??canary.nativeWatch?.image,runtime.executablePath,'Canary must qualify the exact runtime image.');
  if(runtime.packaged){
    assert.equal(canary.executableSha256,runtime.executableSha256,'Packaged executable changed after its canary.');
    assert.equal(canary.archiveSha256,runtime.archiveSha256,'Packaged archive changed after its canary.');
  }
  assert.equal(canary.nativeWatch?.violations,0);assert.ok(canary.nativeWatch?.checks>=10);
  assert.equal(canary.nativeWatch?.eventHooksArmed,true,'Native show/focus event monitoring must also qualify the canary.');
  assert.equal(canary.qualification?.mode,'hidden-no-focus');assert.equal(canary.initialWindows?.[0]?.visible,false);assert.equal(canary.finalWindows?.[0]?.visible,false);
  const names=process.argv.slice(2);if(!names.length)throw Error('Provide desktop suite names.');
  const folder=await fs.mkdtemp(path.join(root,'artifacts','hidden-qualification-'));
  const watch=await startHiddenWindowWatch({executablePath:runtime.executablePath,evidencePath:path.join(folder,'native-watch.json')});
  const result={...runtime,mainSha256,canaryPath,mode:'hidden-no-focus',scope:runtime.packaged?'Exact unpacked candidate executable/archive; portable wrapper not qualified':'Current development sources; no packaged release qualification',suites:names,startedUtc:new Date().toISOString(),passed:false};
  let output='',error;
  try{
    const env={...process.env,POLYTOPE_TEST_MODE:'hidden-no-focus'};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(process.execPath,[path.join(root,'scripts','qualify-desktop.cjs'),...names],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=chunk.toString();output+=text;process.stdout.write(text);});
    result.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    const match=output.match(/Evidence: ([^\r\n]+)/);if(match)result.desktopEvidence=match[1];
    assert.equal(result.exitCode,0,'Sequential desktop qualification failed.');
    assert.ok(result.desktopEvidence,'Missing actual desktop evidence path.');
    const proof=JSON.parse(await fs.readFile(path.join(result.desktopEvidence,'result.json'),'utf8'));
    assert.equal(proof.passed,true);assert.deepEqual(proof.suites.map(s=>s.name),names);result.desktopResult=proof;
  }catch(e){error=e;result.error=e.stack;}
  finally{
    result.nativeWatch=await watch.stop();result.finishedUtc=new Date().toISOString();
    if(result.nativeWatch.violations!==0)error=error||Error('A test window became visible or foreground.');
    result.passed=!error;await fs.writeFile(path.join(folder,'runner.log'),output);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log('Hidden qualification '+(result.passed?'PASS':'FAIL')+'. Evidence: '+folder);
  }
  if(error)throw error;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
