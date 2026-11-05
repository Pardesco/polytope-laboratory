import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitView,projectedRotationRadius} from '../ui/view-camera.mjs';
import {canvasSafeInsets} from '../ui/canvas-overlays.mjs';
import {project,rotate} from '../ui/projection.js';
import {Viewer} from '../ui/viewer.js';

const tesseract=Array.from({length:16},(_,i)=>Array.from({length:4},(_,k)=>i&(1<<k)?.5:-.5));
function cameraFor(fit,aspect,projection){
  const camera=projection==='orthographic'?new THREE.OrthographicCamera(-fit.halfHeight*aspect,fit.halfHeight*aspect,fit.halfHeight,-fit.halfHeight,.01,1000):new THREE.PerspectiveCamera(38,aspect,.01,1000);
  camera.position.fromArray(fit.center).addScaledVector(new THREE.Vector3(...fit.direction),fit.distance);camera.up.fromArray(fit.up);camera.lookAt(new THREE.Vector3(...fit.center));camera.updateMatrixWorld();return camera;
}
const inside=(point,camera,insets)=>{
  const p=new THREE.Vector3(...point).project(camera),left=-1+2*insets.left,right=1-2*insets.right,bottom=-1+2*insets.bottom,top=1-2*insets.top;
  assert.ok(p.x>=left-1e-9&&p.x<=right+1e-9&&p.y>=bottom-1e-9&&p.y<=top+1e-9&&Math.abs(p.z)<1,JSON.stringify({p,left,right,bottom,top}));
};

test('4D circumradius bound contains every pose of the opening tesseract at all Depth distances',()=>{
  for(const distance of [1.15,1.5,3,4])for(const projection of ['orthographic','perspective']){
    const radius=projectedRotationRadius(1,projection,{distance});
    for(let turn=-180;turn<=180;turn+=2)for(const p of tesseract){
      const q=project(rotate(p,[0,0,turn,0,18,0]),projection,{distance});assert.equal(q.clipped,false);assert.ok(Math.hypot(...q.point)<=radius+1e-12);
    }
  }
});

test('a single fit keeps the full default turn inside overlay safe areas in both 3D cameras',()=>{
  for(const [width,height] of [[420,600],[680,500],[1048,718],[1340,718],[1500,850]])for(const projection of ['orthographic','perspective'])for(const distance of [1.15,1.5,4]){
    const insets=canvasSafeInsets(width,height,{bottom:128,widget:{left:width-170,bottom:164}}),aspect=width/height;
    const sphereRadius=projectedRotationRadius(1,'perspective',{distance}),fit=fitView([],{aspect,insets,sphereRadius,projection,direction:[3.2,2.2,4.5]}),camera=cameraFor(fit,aspect,projection);
    for(let turn=-180;turn<180;turn+=5)for(const p of tesseract)inside(project(rotate(p,[0,0,turn,0,18,0]),'perspective',{distance}).point,camera,insets);
  }
});

test('safe-area fit contains off-center geometry in arbitrary observation frames',()=>{
  const points=[[-4,-1,2],[1,3,-5],[2,-3,2],[2,4,1]],before=structuredClone(points),insets={left:.08,right:.2,top:.1,bottom:.22};
  for(const projection of ['orthographic','perspective'])for(const aspect of [.5,1,2.5]){
    const fit=fitView(points,{aspect,insets,projection,direction:[1,-2,3],up:[.2,1,.4]});for(const p of points)inside(p,cameraFor(fit,aspect,projection),insets);
  }
  assert.deepEqual(points,before);
});

test('circumradius fitting refuses an eye inside the ball and unbounded stereographic turns',()=>{
  assert.equal(projectedRotationRadius(1,'stereographic'),null);
  assert.equal(projectedRotationRadius(1,'perspective',{distance:.9}),null);
  assert.equal(projectedRotationRadius(1,'perspective',{distance:1.05,near:.08}),null);
  assert.equal(projectedRotationRadius(NaN),null);
  assert.equal(projectedRotationRadius(1),1);
  assert.throws(()=>fitView([[0,0,0]],{insets:{left:.5,right:.5}}),/safe area/);
});

test('actual Viewer fit uses the rotation bound for source views and explicit clouds for animation framing',()=>{
  const v=Object.create(Viewer.prototype),aspect=1.4,insets={left:.02,right:.2,top:.02,bottom:.16};
  v.model={dimension:4};v.normalized=tesseract;v.view={projection:'perspective'};v.perspectiveSettings={distance:1.5,near:.08};
  v.cameraProjection='orthographic';v.orthographicHalfHeight=1.45;v.aspect=aspect;
  v.perspectiveCamera=new THREE.PerspectiveCamera(38,aspect,.01,1000);v.orthographicCamera=new THREE.OrthographicCamera();v.camera=v.orthographicCamera;v.camera.position.set(3.2,2.2,4.5);
  v.controls={target:new THREE.Vector3()};v.bindControls=()=>{v.camera.lookAt(v.controls.target);v.camera.updateMatrixWorld();};v.getFitInsets=()=>insets;
  v.observationCloud=()=>tesseract.map(p=>project(rotate(p,[0,0,24,0,18,0]),'perspective',v.perspectiveSettings).point);
  v.fit();const boundHeight=v.orthographicHalfHeight;
  for(let turn=-180;turn<180;turn+=10)for(const p of tesseract)inside(project(rotate(p,[0,0,turn,0,18,0]),'perspective',v.perspectiveSettings).point,v.camera,insets);
  v.fit(1.1,[[-.1,-.1,-.1],[.1,.1,.1]]);assert.ok(v.orthographicHalfHeight<boundHeight/2);
});

test('resize republishes an untouched fitted camera but preserves manual and frozen observation',()=>{
  const v=Object.create(Viewer.prototype);let width=700,fits=0,published;
  v.model={dimension:3};v.container={getBoundingClientRect:()=>({width,height:500})};v.renderer={setSize(){}};
  v.cameraProjection='orthographic';v.orthographicHalfHeight=2;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);v.camera=v.orthographicCamera=new THREE.OrthographicCamera();v.controls={enabled:true,target:new THREE.Vector3()};
  v.fitViewportSize='500:500';v.fitCameraSignature=JSON.stringify(v.cameraState());v.fit=()=>{fits++;return v.cameraState();};v.onAutoFit=camera=>published=camera;
  v.resize();assert.equal(fits,1);assert.deepEqual(published,v.cameraState());
  width=800;v.camera.position.z+=1;v.resize();assert.equal(fits,1);
  width=900;v.fitCameraSignature=JSON.stringify(v.cameraState());v.controls.enabled=false;v.resize();assert.equal(fits,1);
});
