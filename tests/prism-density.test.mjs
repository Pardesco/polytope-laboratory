import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {defaultDocumentView} from '../ui/default-look.mjs';
import {stylePreset} from '../ui/style-presets.mjs';
import {prismEdgeDensity,prismSurfaceOpacity,PRISM_LIMITS} from '../ui/prism-look.mjs';
import {edgeDepthFade} from '../ui/prism-edge-fade.mjs';
import {TargetLines} from '../ui/target-lines.mjs';
import {cpuViewer,seedBenchmarkTypes} from '../scripts/dense-model-benchmark.mjs';
const source=JSON.parse(readFileSync(new URL('./fixtures/element-content-native-cases.json',import.meta.url),'utf8')).fourD.source;
// Repeated source edges are a buffer stress fixture, not a new polytope.
function stress(count){const m=structuredClone(source);m.name+=' density '+count;m.edges=Array.from({length:count},(_,i)=>source.edges[i%source.edges.length]);return m;}
function renderedEdgeColor(object){const attribute=object.geometry.getAttribute('color')||object.geometry.getAttribute('instanceColorStart');return object.material.vertexColors?[attribute.getX(0),attribute.getY(0),attribute.getZ(0)]:object.material.color.toArray();}

test('density reduces edge alpha monotonically without dropping edges and retains a readable minimum',()=>{
  const counts=[96,512,720,1200,7200,10000,100000],alphas=counts.map(n=>prismEdgeDensity(n).opacity);
  assert.equal(alphas[0],1);assert.ok(alphas.every((a,i)=>a>=.08&&a<=1&&(!i||a<=alphas[i-1])));
  assert.ok(prismEdgeDensity(10000).width>1);assert.equal(PRISM_LIMITS.edges,10000);
});

test('only the 4D Prism preset opacity adapts; 3D and explicit user opacity edits remain intact',()=>{
  const view=defaultDocumentView(4),model=stress(7200),opacity=prismSurfaceOpacity(view,model);
  assert.ok(opacity>.025&&opacity<.06);assert.equal(prismSurfaceOpacity({...view,surfaceOpacity:.61},model),.61);
  assert.equal(prismSurfaceOpacity({...view,surfaceOpacity:1},model),1);
  assert.equal(prismSurfaceOpacity({...view,appearance:{style:'glass'}},model),.28);
  assert.equal(prismSurfaceOpacity(view,{...model,dimension:3}),.28);
});

test('7200 edges use one quad batch with borrowed positions, hidden markers and stable attributes during rotation',()=>{
  const model=stress(7200),v=cpuViewer(model),view=defaultDocumentView(4);
  try{
    v.setDisplay(view);const line=v.prismEdges,buffer=line.geometry.attributes.instanceStart.data;
    assert.equal(line.visible,true);assert.equal(v.lines.visible,false);assert.equal(line.geometry.instanceCount,7200);
    assert.equal(buffer.array,v.edgeGeometry.attributes.position.array);assert.equal(v.points.visible,false);assert.equal(v.primitiveCounts.spheres,0);
    assert.ok(line.material.opacity<.3);const color=renderedEdgeColor(line);assert.ok(Math.max(...color)-Math.min(...color)>.02);assert.equal(line.material.depthWrite,false);
    v.setDisplay({...view,angles:[13,0,18,4,0,0]});assert.equal(v.prismEdges,line);assert.equal(line.geometry.attributes.instanceStart.data,buffer);
    assert.equal(buffer.array,v.edgeGeometry.attributes.position.array);v.select([0]);assert.equal(v.highlightGeometry.attributes.position.count,1);
  }finally{v.clear();}
});

test('above 10000 segments native lines retain density tint and fade, with clean legacy-style restoration',()=>{
  const v=cpuViewer(stress(10001)),view=defaultDocumentView(4);
  try{
    v.setDisplay(view);assert.equal(v.lines.visible,true);assert.equal(v.prismEdges,null);assert.ok(v.lines.material.opacity<.23);
    assert.equal(v.edgeGeometry.attributes.position.count,20002);assert.equal(v.lines.material.userData.prismDepthFade.prismDepthStrength.value,1);
    assert.equal(v.points.visible,false);const color=renderedEdgeColor(v.lines);assert.ok(Math.max(...color)-Math.min(...color)>.02);
    v.setDisplay(stylePreset('paper',view));assert.equal(v.lines.material.userData.prismDepthFade.prismDepthStrength.value,0);
    assert.equal(v.lines.material.color.getHexString(),'000000');assert.equal(v.lines.material.vertexColors,false);assert.equal(v.lines.material.opacity,1);
  }finally{v.clear();}
});

test('multiple native type groups tint adjacent edges and manual color-mode changes replace the cached palette',()=>{
  const model=stress(900),v=cpuViewer(model),view=defaultDocumentView(4);seedBenchmarkTypes(model);
  try{
    v.setDisplay(view);const line=v.prismEdges,first=line.geometry.attributes.instanceColorStart;
    assert.equal(line.material.vertexColors,true);assert.equal(first.count,900);
    assert.ok(new Set(Array.from({length:first.count},(_,i)=>first.getX(i)+':'+first.getY(i)+':'+first.getZ(i))).size>1);
    v.setDisplay({...view,angles:[7,2,19,4,0,0]});assert.equal(line.geometry.attributes.instanceColorStart.data,first.data);
    const before=first.data.array.slice();v.setDisplay({...view,surfaceColors:'face'});assert.notDeepEqual(line.geometry.attributes.instanceColorStart.data.array,before);assert.equal(v.prismEdgeTints.mode,'face');
    v.setDisplay({...view,appearance:{...view.appearance,style:'dark-gallery'}});assert.equal(line.visible,false);assert.equal(v.edgeCylinders.visible,true);
  }finally{v.clear();}
});

test('source replacement disposes the quad batch and resets density ownership',()=>{
  const v=cpuViewer(stress(720));v.setDisplay(defaultDocumentView(4));const old=v.prismEdges;let disposed=0;
  old.geometry.addEventListener('dispose',()=>disposed++);v.setModel(stress(1200));v.setDisplay(defaultDocumentView(4));
  assert.equal(disposed,1);assert.notEqual(v.prismEdges,old);assert.ok(v.group.children.includes(v.prismEdges));v.clear();assert.equal(v.prismEdges,null);assert.equal(v.prismEdgeTints,null);
});

test('explicit edge-color edits override automatic type tinting without removing density/depth fade',()=>{
  const v=cpuViewer(stress(720)),view=defaultDocumentView(4);
  try{v.setDisplay({...view,appearance:{...view.appearance,edgeColor:'#cc5577'}});assert.equal(v.prismEdges.material.color.getHexString(),'cc5577');
    assert.ok(v.prismEdges.material.opacity<1);assert.equal(v.prismEdges.material.userData.prismDepthFade.prismDepthStrength.value,1);
    v.setDisplay(view);assert.notEqual(v.prismEdges.material.color.getHexString(),'cc5577');
  }finally{v.clear();}
});

test('depth fade modifies alpha and follows the actual rendering camera and model bounds',()=>{
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0],3));g.computeBoundingSphere();
  const line=new THREE.LineSegments(g,new THREE.LineBasicMaterial()),uniforms=edgeDepthFade(line),camera=new THREE.PerspectiveCamera();
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
  line.material.onBeforeCompile(shader,{});assert.match(shader.vertexShader,/vPrismDepth = -mvPosition.z/);assert.match(shader.fragmentShader,/gl_FragColor.a \*=/);assert.equal(shader.uniforms.prismDepthStrength,uniforms.prismDepthStrength);
  camera.position.z=6;camera.updateMatrixWorld();line.updateMatrixWorld();line.onBeforeRender({},null,camera);
  assert.equal(uniforms.prismDepthNear.value,5);assert.equal(uniforms.prismDepthFar.value,7);
  camera.position.z=10;camera.updateMatrixWorld();line.scale.setScalar(2);line.updateMatrixWorld();line.onBeforeRender({},null,camera);
  assert.equal(uniforms.prismDepthNear.value,8);assert.equal(uniforms.prismDepthFar.value,12);edgeDepthFade(line,0);assert.equal(uniforms.prismDepthStrength.value,0);
  g.dispose();line.material.dispose();
});

test('target PNG/video line replacement preserves tint, alpha, shader fade and camera-dependent depth',()=>{
  const v=cpuViewer(stress(10001));v.setDisplay(defaultDocumentView(4));const scene=new THREE.Scene();scene.add(v.group);const adapter=new TargetLines();
  try{
    adapter.prepare(scene,2);const replacement=adapter.active.find(item=>item.source===v.lines).line;
    assert.equal(replacement.material.opacity,v.lines.material.opacity);assert.deepEqual(replacement.material.color,v.lines.material.color);
    assert.equal(replacement.material.userData.prismDepthFade.prismDepthStrength.value,1);
    replacement.updateMatrixWorld();replacement.onBeforeRender({getViewport:target=>target.set(0,0,1600,1000)},scene,v.camera);
    assert.deepEqual(replacement.material.resolution.toArray(),[1600,1000]);
    assert.ok(replacement.material.userData.prismDepthFade.prismDepthFar.value>replacement.material.userData.prismDepthFade.prismDepthNear.value);
    adapter.restore();assert.equal(v.lines.visible,true);
  }finally{adapter.dispose();v.clear();}
});

test('colored native-line video frames reuse the target GPU color buffer between poses',()=>{
  const model=stress(10001);seedBenchmarkTypes(model);const v=cpuViewer(model),view=defaultDocumentView(4);v.setDisplay(view);
  const scene=new THREE.Scene();scene.add(v.group);const adapter=new TargetLines();
  try{
    adapter.prepare(scene,1);const line=adapter.active.find(item=>item.source===v.lines).line,colors=line.geometry.attributes.instanceColorStart.data;adapter.restore();
    v.setDisplay({...view,angles:[7,4,11,0,0,0]});adapter.prepare(scene,1);assert.equal(line.geometry.attributes.instanceColorStart.data,colors);assert.equal(line.material.vertexColors,true);
  }finally{adapter.dispose();v.clear();}
});
