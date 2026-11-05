import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rotationPath,SymmetryOrientationControls} from '../ui/symmetry-orientation-controls.mjs';
import {rotate} from '../ui/projection.js';
import {REUSABLE_OPERATIONS} from '../desktop/engine-pool.cjs';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {navigationDisplayHarness} from './helpers/navigation-display.mjs';
import {visibilityDOM} from './helpers/visibility-dom.mjs';
const eye=()=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
const rotation=angles=>eye().map((_,i)=>eye().map(row=>rotate(row,angles)[i]));
test('smooth SO(4) transition preserves orthogonality and reaches the exact requested frame',()=>{
  for(const angles of [[180,0,0,0,0,0],[31,72,-57,19,123,-41],[0,0,180,0,0,180]]){
    const start=rotation([12,-8,19,27,4,9]),target=rotation(angles),path=rotationPath(start,target);assert.deepEqual(path(0),start);assert.deepEqual(path(1),target);
    for(let t=.05;t<1;t+=.05){const m=path(t);for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(m[i].reduce((sum,x,k)=>sum+x*m[j][k],0)-(i===j?1:0))<1e-12);const mat=new THREE.Matrix4().set(...m.flat());assert.ok(Math.abs(mat.determinant()-1)<1e-12);}
    const near=path(1-1e-8);assert.ok(near.every((row,i)=>row.every((x,j)=>Math.abs(x-target[i][j])<1e-6)));
  }
});
test('symmetry orientation requests reuse the native worker',()=>assert.ok(REUSABLE_OPERATIONS.has('symmetry-orientation')));
const fixtures=JSON.parse(execFileSync('python',['-c',`import json
from engine.generators import regular
from engine.symmetry_orientation import symmetry_orientation
print(json.dumps([{'model':m,'report':symmetry_orientation(m,'greatest')} for m in [regular('cube'),regular('tesseract')]]))`],{encoding:'utf8'}));
const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');
for(const [i,f] of fixtures.entries())test(`mounted ${i===0?'3D camera':'4D rotation'} orientation lists, transitions and persists without source edits`,async()=>{
  const dom=visibilityDOM(),s={model:structuredClone(f.model),view:{angles:[12,4,7,0,9,3],projection:'orthographic',sectionNormal:[0,0,0,1],sectionOffset:0,derivedMode:'section',faces:true},notes:''},before=JSON.stringify(s.model),h=navigationDisplayHarness(app,s);
  const oldRAF=globalThis.requestAnimationFrame;let elapsed=0,frames=0;
  globalThis.requestAnimationFrame=callback=>setImmediate(()=>{frames++;elapsed+=100;callback(performance.now()+elapsed);});
  try{
    h.scope.renderWorkspace();await h.settle();h.v.controls.enabled=true;h.v.controls.enableDamping=true;let dirty=0;
    const controls=new SymmetryOrientationControls({getState:h.scope.state,getDocument:h.scope.doc,getProject:()=>h.scope.project,guard:fn=>fn,isExporting:()=>false,run:async()=>structuredClone(f.report),viewer:h.v,markDirty:()=>dirty++,display:h.scope.displayBase,stop(){}});
    assert.ok(dom.host.all().some(n=>n.id==='symmetry-orientation-settings'));await controls.node('list').onclick();assert.equal(controls.node('choice').children.length,f.report.choices.length+1);
    controls.node('choice').value='greatest';await controls.node('apply').onclick();assert.ok(frames>=4);assert.equal(dirty,1);assert.equal(JSON.stringify(s.model),before);
    if(i===1){assert.deepEqual(s.view.orientationFrame.matrix,f.report.frame.matrix);assert.deepEqual(s.view.angles,Array(6).fill(0));}else assert.deepEqual(s.view.camera,h.v.cameraState());
    assert.equal(h.v.controls.enabled,true);assert.match(controls.node('result').textContent,/residual/);
  }finally{h.close();dom.restore();if(oldRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRAF;}
});

test('canceled or navigated native orientation cannot publish late choices',async()=>{
  const dom=visibilityDOM(),f=fixtures[0];let current={model:structuredClone(f.model),view:{},notes:''};const doc={id:'source',cursor:0,states:[current]},project={active:0,documents:[doc]};let release;
  try{const controls=new SymmetryOrientationControls({getState:()=>current,getDocument:()=>doc,getProject:()=>project,guard:f=>f,isExporting:()=>false,run:()=>new Promise(resolve=>release=resolve)});
    const pending=controls.load();controls.cancel();release(f.report);await assert.rejects(pending,{name:'AbortError'});assert.equal(controls.node('choice').children.length,1);
    const navigated=controls.load();current={...current,notes:'changed'};release(f.report);await assert.rejects(navigated,/source|changed/i);assert.equal(controls.node('choice').children.length,1);
  }finally{dom.restore();}
});
