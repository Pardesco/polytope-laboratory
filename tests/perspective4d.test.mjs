import test from 'node:test';
import assert from 'node:assert/strict';
import {perspective4DSettings,perspectivePoint4D,perspectiveSegment4D,perspectiveTriangle4D} from '../ui/perspective4d.mjs';
import {project,rotate} from '../ui/projection.js';
import {applyDisplayFrame} from '../ui/display-frame.mjs';
import {classifyCellFacing} from '../ui/cell-facing.mjs';

const close=(a,b,tolerance=1e-12)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<tolerance,`${a} != ${b}`));};
const area=triangle=>Math.abs((triangle[1][0]-triangle[0][0])*(triangle[2][1]-triangle[0][1])-(triangle[1][1]-triangle[0][1])*(triangle[2][0]-triangle[0][0]))/2;

test('legacy default eye/near/scale reproduce existing perspective projection exactly',()=>{
  const settings=perspective4DSettings();assert.equal(settings.distance,3);assert.equal(settings.near,.08);assert.equal(settings.scale,'equatorial');assert.deepEqual(settings.eye,[0,0,0,3]);
  for(const point of [[0,0,0,0],[.5,-.2,.7,.5],[-.8,.1,.4,-.1],[1,2,3,2.99]]){
    const current=project(point,'perspective'),result=perspectivePoint4D(point);assert.deepEqual(result.point,current.point);assert.equal(result.clipped,current.clipped);
  }
});

test('equatorial scale preserves W0 coordinates at every distance, with explicit unit-plane alternative',()=>{
  for(const distance of [.1,.6,3,100]){close(perspectivePoint4D([.2,-.4,.7,0],{distance}).point,[.2,-.4,.7]);}
  close(perspectivePoint4D([2,4,6,0],{distance:2,scale:'unit-plane'}).point,[1,2,3]);
});

test('independent finite-eye line intersection gives the declared projection',()=>{
  const distance=2,source=[.3,-.4,.6,.5],eye=[0,0,0,distance],t=distance/(distance-source[3]);
  const intersection=eye.map((x,i)=>x+t*(source[i]-x));close(intersection,[.4,-8/15,.8,0]);close(perspectivePoint4D(source,{distance}).point,intersection.slice(0,3));
});

test('closer eye strengthens relative depth scale and large eye approaches orthographic',()=>{
  for(const distance of [.6,3,100]){
    const near=perspectivePoint4D([.5,0,0,.5],{distance}),far=perspectivePoint4D([.5,0,0,-.5],{distance});assert.equal(near.clipped,false);assert.equal(far.clipped,false);
    assert.ok(Math.abs(near.point[0]/far.point[0]-(distance+.5)/(distance-.5))<1e-12);
  }
  const p=[.4,.3,.1,.8],view=perspectivePoint4D(p,{distance:100});assert.ok(Math.hypot(...view.point.map((x,i)=>x-p[i]))<.006);
});

test('literal normalized tesseract Schlegel eye .6 gives nested cubes and compatible source-plane facing',()=>{
  const vertices=Array.from({length:16},(_,id)=>Array.from({length:4},(_,axis)=>(id>>axis&1)?.5:-.5));
  const displayed=vertices.map(p=>perspectivePoint4D(p,{distance:.6}));assert.ok(displayed.every(p=>!p.clipped));
  vertices.forEach((p,i)=>close(displayed[i].point,p.slice(0,3).map(x=>x*(p[3]===.5?6:6/11))));
  const planes=Array.from({length:8},(_,cell)=>{const normal=Array(4).fill(0);normal[Math.floor(cell/2)]=cell%2?1:-1;return {cell,normal,offset:.5};});
  const facing=classifyCellFacing({supported:true,planes},{projection:'perspective',eye:[0,0,0,.6]});assert.deepEqual(facing.frontCellIds,[7]);assert.equal(facing.backCellIds.length,7);
});

test('SO4 frame then angle rotation applied once before point/segment/virtual triangle projection',()=>{
  const frame=[[0,0,0,-1],[0,1,0,0],[0,0,1,0],[1,0,0,0]],angles=[90,0,0,0,0,0],source=[[.5,0,0,0],[0,.5,0,0],[0,0,.5,0]],before=JSON.stringify({source,frame,angles});
  const raw=source.map(p=>rotate(applyDisplayFrame(p,frame),angles));close(raw[0],[0,0,0,.5]);close(raw[1],[-.5,0,0,0]);close(raw[2],[0,0,.5,0]);
  const point=perspectivePoint4D(raw[1],{distance:2}),edge=perspectiveSegment4D(raw[0],raw[1],{distance:2}),patch=perspectiveTriangle4D(raw,{distance:2});
  close(point.point,[-.5,0,0]);close(edge.segments[0].b,point.point);close(patch.triangles[0].points[1],point.point);assert.equal(JSON.stringify({source,frame,angles}),before);
});

test('near-plane crossing clips the source edge at its true parameter instead of dropping it',()=>{
  const a=[1,0,0,0],b=[1,0,0,1.5],options={distance:1,near:.25},before=JSON.stringify({a,b,options}),result=perspectiveSegment4D(a,b,options),segment=result.segments[0];
  assert.equal(result.clipped,true);assert.equal(result.omitted,false);assert.equal(result.segments.length,1);close(segment.a,[1,0,0]);close(segment.b,[4,0,0]);assert.equal(segment.t0,0);assert.equal(segment.t1,.5);close(segment.points4[1],[1,0,0,.75]);assert.deepEqual(segment.nearBoundary,[false,true]);assert.ok(result.diagnostics.length);
  const reverse=perspectiveSegment4D(b,a,options).segments[0];close(reverse.a,segment.b);close(reverse.b,segment.a);assert.equal(reverse.t0,.5);assert.equal(reverse.t1,1);assert.equal(JSON.stringify({a,b,options}),before);
});

test('both endpoints behind eye or near plane produce no finite source-edge bridge',()=>{
  for(const edge of [[[1,0,0,1.5],[1,1,0,2]],[[1,0,0,.8],[0,1,0,.9]]]){
    const result=perspectiveSegment4D(...edge,{distance:1,near:.25});assert.deepEqual(result.segments,[]);assert.equal(result.clipped,true);assert.equal(result.omitted,true);assert.ok(result.diagnostics.length);
  }
  const point=perspectivePoint4D([1,0,0,1],{distance:1});assert.equal(point.clipped,true);assert.match(point.reason,/near plane/);
});

test('one clipped triangle vertex yields a finite quad with independent area and source barycentrics',()=>{
  const source=[[0,0,0,0],[1,0,0,0],[0,1,0,1.5]],before=JSON.stringify(source),result=perspectiveTriangle4D(source,{distance:1,near:.25});
  assert.equal(result.clipped,true);assert.equal(result.omitted,false);assert.equal(result.triangles.length,2);assert.equal(result.triangles.reduce((s,t)=>s+area(t.points),0),3);
  result.triangles.forEach(triangle=>triangle.points4.forEach((point,i)=>{const bary=triangle.barycentrics[i];assert.ok(bary.every(x=>x>=0&&x<=1));assert.ok(Math.abs(bary.reduce((s,x)=>s+x,0)-1)<1e-12);close(point,[0,1,2,3].map(axis=>bary.reduce((s,x,j)=>s+x*source[j][axis],0)));if(triangle.nearBoundary[i])assert.equal(point[3],.75);}));
  assert.equal(JSON.stringify(source),before);
});

test('two clipped triangle vertices retain one triangle, while near-plane tangency is not a filled patch',()=>{
  const options={distance:1,near:.25},result=perspectiveTriangle4D([[0,0,0,0],[1,0,0,1.5],[0,1,0,1.5]],options);assert.equal(result.triangles.length,1);assert.equal(area(result.triangles[0].points),2);
  for(const source of [[[0,0,0,.75],[1,0,0,1.5],[0,1,0,1.5]],[[0,0,0,.75],[1,0,0,.75],[0,1,0,1.5]]]){const clipped=perspectiveTriangle4D(source,options);assert.deepEqual(clipped.triangles,[]);assert.equal(clipped.omitted,true);}
});

test('near-plane boundary roundoff is finite and inclusive for clipped geometry',()=>{
  const options={distance:.6,near:.08},result=perspectiveSegment4D([1,0,0,0],[1,0,0,1],options);
  assert.equal(result.omitted,false);close(result.segments[0].b,[7.5,0,0]);assert.equal(result.segments[0].points4[1][3],.52);
});

test('invalid distance, near, scale and unsafe bounds reject without executing strings',()=>{
  for(const distance of [0,-1,101,NaN,Infinity,'3',true])assert.throws(()=>perspective4DSettings({distance}),/distance/);
  for(const near of [0,-1,3,4,NaN,Infinity,'.08',false])assert.throws(()=>perspective4DSettings({near}),/near/);
  assert.throws(()=>perspective4DSettings({scale:'__proto__'}),/scale/);assert.throws(()=>perspective4DSettings({maxCoordinate:1000001}),/bound/);
  assert.throws(()=>perspectivePoint4D(['process.exit()',0,0,0]),/finite coordinates/);assert.throws(()=>perspectivePoint4D([1,2,3]),/four finite/);assert.throws(()=>perspectiveTriangle4D([[1,2,3,4],[0,0,0,0]]),/three points/);
});

test('overflow and extreme projected-coordinate cases are explicitly omitted rather than producing Infinity',()=>{
  const settings={distance:1,near:Number.MIN_VALUE},point=perspectivePoint4D([Number.MAX_VALUE,0,0,.5],settings);assert.equal(point.clipped,true);assert.match(point.reason,/bound/);assert.ok(point.point.every(Number.isFinite));
  const result=perspectiveSegment4D([Number.MAX_VALUE,0,0,0],[Number.MAX_VALUE,0,0,2],settings);assert.equal(result.omitted,true);assert.deepEqual(result.segments,[]);assert.ok(result.diagnostics.some(d=>/precision|bound/.test(d)));
  const tiny=perspectiveSegment4D([1,0,0,0],[1,0,0,2],settings);assert.equal(tiny.omitted,true);assert.ok(tiny.diagnostics.some(d=>/precision/.test(d)));
  const huge=perspectiveSegment4D([1,0,0,-Number.MAX_VALUE],[1,0,0,Number.MAX_VALUE],{distance:1,near:.25});assert.equal(huge.omitted,true);assert.ok(huge.diagnostics.some(d=>/finite precision/.test(d)));
});
