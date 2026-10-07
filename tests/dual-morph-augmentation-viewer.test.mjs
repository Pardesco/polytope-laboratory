import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Viewer} from '../ui/viewer.js';
import {morphSourceOwners} from '../ui/dual-morph-picking.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(execFileSync('python',['-B','-c',`import sys,json
from engine.dual_morph_augmentation import prepare_augmentation
from engine.generators import regular
m=regular('cube');m['metadata']['coordinateUnits']='mm';m['metadata']['offColors']={'faces':[{'encoding':'byte','values':[50,100,150,127]} for _ in m['faces']]}
p=prepare_augmentation({'model':m,'notes':'Original literal notes.','view':{'coordinateUnit':'mm'}},radius=2**.5)
print(json.dumps({'source':m,'frames':[p.evaluate(t) for t in (0,.25,.5,.75,1)]}))`],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000}));
function viewer(model){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);
  v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};
  v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};return v;
}
const view={projection:'orthographic',angles:Array(6).fill(0),faces:true,vertices:true,edges:true,surfaceColors:'source',surfaceOpacity:1};
test('new augmentation continuation mounts in actual Viewer buffers with source normalization and midpoint incidence rebuild',()=>{
  const source=structuredClone(data.source),before=structuredClone(source),v=viewer(source),group=v.group,radius=v.radius;
  for(const f of data.frames){v.setMorphFrame(f,source,view);assert.equal(v.model.vertices.length,f.model.vertices.length);assert.equal(v.pointGeometry.attributes.position.count,f.model.vertices.length);assert.equal(v.edgeGeometry.attributes.position.count,f.model.edges.length*2);assert.equal(v.radius,radius);assert.strictEqual(v.group,group);}
  assert.deepEqual(source,before);v.clear();
});
test('augmentation endpoint and intermediaries map every display rank back to actual original source IDs',()=>{
  const source=data.source,fields={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'};
  for(const f of data.frames)for(const [kind,field] of Object.entries(fields))for(let i=0;i<f.model[field].length;i++){
    const owners=morphSourceOwners(f,kind,i);assert.ok(owners.length,`ratio ${f.ratio} ${kind} ${i}`);
    for(const o of owners){assert.equal(o.sourceModelId,source.id);assert.equal(o.sourceFingerprint,source.fingerprint);assert.ok(source[fields[o.kind]][o.id]);}
  }
});
test('actual augmentation face buffers retain literal RGBA alpha and source vertex highlight identities across midpoint',()=>{
  const v=viewer(data.source);v.select([0]);
  for(const f of data.frames.slice(1,4)){
    v.setMorphFrame(f,data.source,view);assert.deepEqual(v.morphSelectedSourceIds,[0]);assert.ok(v.selected.length);
    for(const index of v.selected)assert.ok(morphSourceOwners(f,'vertex',index).some(o=>o.kind==='vertex'&&o.id===0));
    const buffer=v.surfaceGeometry.attributes.color;assert.equal(buffer.itemSize,4);assert.equal(v.surfaceVertexAlpha,true);
    assert.ok(Array.from(buffer.array).some((x,i)=>i%4===3&&Math.abs(x-127/255)<1e-7));
  }v.clear();
});
test('actual augmentation apex pick returns original face ownership without treating the display index as a vertex ID',()=>{
  const f=data.frames[1],v=viewer(data.source);v.setMorphFrame(f,data.source,{...view,pickKind:'vertex'});
  const index=f.model.vertices.findIndex(p=>Math.abs(p[0])<1e-10&&Math.abs(p[1])<1e-10&&p[2]>1),p=v.projected[index].point,q=new THREE.Vector3(...p).project(v.camera);
  let picked;v.onMorphPick=(owners,kind,id)=>picked={owners,kind,id};v.onPick=()=>assert.fail('Display apex index leaked as an original source vertex.');
  const result=v.pickAt((q.x+1)*200,(1-q.y)*200);assert.equal(result.picked.kind,'vertex');assert.ok(picked.owners.some(o=>o.kind==='face'));assert.ok(picked.owners.every(o=>o.kind!=='vertex'));v.clear();
});
