// Electron scenarios share native input focus and must run sequentially.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const digest=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const {hiddenRuntime}=require('./hidden-runtime.cjs');
const root=path.resolve(__dirname,'..');
const suites={
  netReinforcement:'net-reinforcement-smoke.cjs',
  elementContent:'element-content-smoke.cjs',
  dualMorphs:'dual-morph-smoke.cjs',facetingDiagrams:'faceting-diagram-smoke.cjs',
  automaticFaceting:'automatic-faceting-smoke.cjs',
  core:'desktop-smoke.cjs',graphics:'viewer-graphics-smoke.cjs',design:'ui-design-smoke.cjs',
  workspace:'workspace-ui-smoke.cjs',animation:'animation-smoke.cjs',stars:'star-desktop-smoke.cjs',
  memories:'memories-smoke.cjs',inspection:'inspection-features-smoke.cjs',
  facing:'cell-facing-smoke.cjs',recipes:'recipes-smoke.cjs',units:'units-export-smoke.cjs',
  presentation:'entity-presentation-smoke.cjs',tours:'tours-smoke.cjs',
  stereographic:'stereographic-smoke.cjs',faces:'face-editing-smoke.cjs',picking:'entity-picking-smoke.cjs',
  audits:'library-audit-smoke.cjs',library:'linked-library-smoke.cjs',portable:'portable-smoke.cjs',
  perspective:'perspective4d-smoke.cjs',refinement:'construction-refinement-smoke.cjs',
  tracks:'animation-tracks-smoke.cjs',polygons:'star-polygon-smoke.cjs',products:'polygon-product-smoke.cjs',workers:'stereographic-worker-smoke.cjs',families:'construction-families-smoke.cjs',specialized:'torus-podia-smoke.cjs',waterman:'waterman-smoke.cjs',layers:'layer-join-smoke.cjs',crossed:'crossed-segmentotope-smoke.cjs',augmentation:'augmentation-smoke.cjs',projectionFit:'projection-fit-smoke.cjs',sourceConstruction:'source-construction-smoke.cjs',facePlacement:'face-placement-smoke.cjs',core4d:'convex-core4d-smoke.cjs',surfaceSeams:'stereographic-surface-seams-smoke.cjs',
  sourceZonohedron:'source-zonohedron-smoke.cjs',cellAttributes:'cell-attributes-smoke.cjs',animatedTours:'animated-tours-smoke.cjs',expressions:'expression-entry-smoke.cjs',spring:'spring-relaxation-smoke.cjs',regular4d:'regular4d-catalog-smoke.cjs',workspaceNumeric:'workspace-numeric-smoke.cjs'
};
async function main(){
  const names=process.argv.slice(2);if(!names.length)throw new Error('Provide suite names: '+Object.keys(suites).join(', '));
  for(const name of names)if(!Object.hasOwn(suites,name))throw new Error('Unknown desktop suite: '+name);
  const runtime=names.includes('portable')?null:await hiddenRuntime();
  const folder=await fs.mkdtemp(path.join(root,'artifacts','desktop-qualification-'));
  const result={qualificationScriptSha256:await digest(__filename),version:require('../package.json').version,executable:process.env.POLYTOPE_TEST_EXECUTABLE||null,runtime,startedUtc:new Date().toISOString(),passed:false,suites:[]};
  console.log('Evidence: '+folder);
  for(const name of names){
    const destination=path.join(folder,name);await fs.mkdir(destination);
    const env={...process.env,POLYTOPE_TEST_ARTIFACTS:destination};delete env.ELECTRON_RUN_AS_NODE;
    const started=Date.now(),log=path.join(destination,'run.log'),script=path.join(root,'scripts',suites[name]),scriptSha256=await digest(script);
    const child=spawn(process.execPath,[script],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?null:code));});
    await fs.writeFile(log,output);
    const scriptUnchanged=await digest(script)===scriptSha256;
    const entry={name,script:suites[name],scriptSha256,scriptUnchanged,exitCode,passed:exitCode===0&&scriptUnchanged,seconds:(Date.now()-started)/1000,log};result.suites.push(entry);
    result.finishedUtc=new Date().toISOString();await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log(name+': '+(entry.passed?'PASS':'FAIL')+' ('+entry.seconds+' s)');
    if(!entry.passed){process.stderr.write(output);throw new Error('Desktop qualification stopped at '+name+'. Evidence: '+folder);}
  }
  if(runtime){
    const after=await hiddenRuntime();
    result.runtimeUnchanged=JSON.stringify(after)===JSON.stringify(runtime);
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    assert.equal(result.runtimeUnchanged,true,'Runtime executable/archive or main source changed during qualification.');
  }
  result.qualificationScriptUnchanged=await digest(__filename)===result.qualificationScriptSha256;
  assert.equal(result.qualificationScriptUnchanged,true,'Desktop qualification script changed during execution.');
  result.passed=true;await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
