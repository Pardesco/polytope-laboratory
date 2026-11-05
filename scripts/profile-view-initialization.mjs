// Computation-only comparison of eager-default then requested display versus
// initializing buffers directly in the requested saved view. No browser/GPU.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const input=path.resolve(root,process.argv[2]||'artifacts/model-view-profile-FstP3r/8-before-rotation.polyproj');
const project=JSON.parse(fs.readFileSync(input,'utf8')),document=project.documents[project.active],state=document.states[document.cursor];
assert.equal(state.view.projection,'orthographic','This CPU-only benchmark excludes asynchronous projection workers');
const output=fs.mkdtempSync(path.join(root,'artifacts','view-initialization-'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={passed:false,scope:'Current-source Viewer geometry computation without WebGL, Electron, IPC, annotation decoding or capture; eager vs deferred initialization, not a sealed-release comparison',
  node:process.version,platform:os.platform()+' '+os.release(),cpu:os.cpus()[0]?.model,model:state.model.name,counts:Object.fromEntries(['vertices','edges','faces','cells'].map(key=>[key,state.model[key]?.length??0])),
  input:{path:input,sha256:hash(fs.readFileSync(input))},samples:[],sources:{}};
for(const file of ['ui/viewer.js','ui/geometry-bounds.mjs','scripts/profile-view-initialization.mjs'])result.sources[file]=hash(fs.readFileSync(path.join(root,file)));
function signature(viewer){
  const digest=createHash('sha256');
  for(const field of ['edgeGeometry','pointGeometry','surfaceGeometry'])for(const name of Object.keys(viewer[field].attributes).sort()){
    const attribute=viewer[field].attributes[name],array=attribute.array;digest.update(field+':'+name+':'+attribute.itemSize);digest.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  }
  digest.update(JSON.stringify([viewer.center,viewer.radius,viewer.projected,viewer.sourceTriangles,viewer.visibility]));return digest.digest('hex');
}
try{
  let expected;
  for(let run=-1;run<7;run++)for(const mode of run%2?['deferred','eager']:['eager','deferred']){
    const viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();let displays=0;
    viewer.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);viewer.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);
    viewer.cameraProjection=state.view.cameraProjection||'orthographic';viewer.camera=viewer.cameraProjection==='perspective'?viewer.perspectiveCamera:viewer.orthographicCamera;
    viewer.camera.position.set(0,0,6);viewer.controls={target:new THREE.Vector3(),update(){}};
    viewer.setDisplay=function(...args){displays++;return Viewer.prototype.setDisplay.apply(this,args);};
    try{
      const start=performance.now();viewer.setModel(state.model,{deferDisplay:mode==='deferred'});viewer.setDisplay(structuredClone(state.view));
      const ms=performance.now()-start,identity=signature(viewer);expected??=identity;assert.equal(identity,expected,'Complete buffer/source ownership equality');
      assert.equal(displays,mode==='eager'?2:1);if(run>=0)result.samples.push({run,mode,ms,displayPasses:displays,bufferSha256:identity});
    }finally{viewer.clear();}
  }
  result.comparison=Object.fromEntries(['eager','deferred'].map(mode=>{
    const values=result.samples.filter(s=>s.mode===mode).map(s=>s.ms).sort((a,b)=>a-b);
    return [mode,{medianMs:values[3],iqrMs:(values[4]+values[5])/2-(values[1]+values[2])/2,samples:values.length}];
  }));result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,passed:result.passed,comparison:result.comparison,error:result.error},null,2));
