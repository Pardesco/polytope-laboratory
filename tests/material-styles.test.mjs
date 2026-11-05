import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STYLE_LABELS,stylePreset} from '../ui/style-presets.mjs';
import {appearanceOptions} from '../ui/appearance-config.mjs';
import {effectsOptions} from '../ui/effects-config.mjs';
import {applyBackground} from '../ui/viewer-background.mjs';
import {applyViewerAppearance} from '../ui/viewer-appearance.mjs';
import {applyMaterialEffects,prepareMaterialEffects,disposeMaterialEffects,REFLECTION_FACE_LIMIT} from '../ui/viewer-material-effects.mjs';
import {studioFace} from '../ui/procedural-environment.mjs';
import {Viewer} from '../ui/viewer.js';
import {AppearanceControls} from '../ui/appearance-controls.mjs';
import {mountStyleControls} from '../ui/style-controls.mjs';
import {numericControlFixture} from './numeric-control-fixture.mjs';
const triangle={dimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]};
for(const name of Object.keys(STYLE_LABELS))test(`${name} resets a coordinated style while retaining camera and geometry settings`,()=>{
  const original={angles:[1,2,3,4,5,6],camera:{position:[1,2,3]},hiddenCells:[2],surfaceOpacity:.73,appearance:{tint:'#ff0000'}},before=structuredClone(original);
  const view=stylePreset(name,original);assert.equal(view.appearance.style,name);assert.deepEqual(view.camera,original.camera);assert.deepEqual(view.hiddenCells,[2]);assert.deepEqual(original,before);
  assert.deepEqual(appearanceOptions(view.appearance),view.appearance);assert.deepEqual(effectsOptions(view.materialEffects),view.materialEffects);
  assert.deepEqual(stylePreset(name,{...view,appearance:{...view.appearance,tint:'#000000'}}),view);
  if(name==='studio')assert.equal(view.appearance.background,'#e6e8eb');
  if(name==='glass'){assert.equal(view.surfaceOpacity,.24);assert.equal(view.materialEffects.environmentMode,'refraction');}
  if(name==='metal')assert.equal(view.materialEffects.reflectivity,.72);
  if(name==='paper'){assert.equal(view.appearance.keyIntensity,0);assert.equal(view.appearance.edgeColor,'#000000');}
  if(name==='neon'){assert.equal(view.edgeStyle,'cylinder');assert.equal(view.appearance.edgeGlow,2);}
  if(name==='geomag'){assert.equal(view.vertexStyle,'sphere');assert.equal(view.faces,false);assert.equal(view.appearance.vertexMetal,true);}
});
test('saved view JSON retains customized materials, background and selected reset style',()=>{
  const view=stylePreset('glass');view.appearance.backgroundMode='gradient';view.appearance.backgroundBottom='#123456';view.appearance.shininess=90;view.materialEffects.bump='pebbles';
  const restored=JSON.parse(JSON.stringify(view));assert.deepEqual(appearanceOptions(restored.appearance),view.appearance);assert.deepEqual(effectsOptions(restored.materialEffects),view.materialEffects);
});
test('unsupported and unbounded material configurations are refused',()=>{
  for(const field of [{style:'unknown'},{backgroundMode:'image'},{backgroundBottom:'#fff'},{edgeGlow:Infinity},{edgeGlow:4},{vertexMetal:1},{keyDirection:[0,0,0]},{unexpected:true}])assert.throws(()=>appearanceOptions(field));
  for(const field of [{reflection:'url'},{reflectivity:2},{refractiveIndex:NaN},{bumpStrength:-1}])assert.throws(()=>effectsOptions(field));
  assert.throws(()=>stylePreset('unknown'));assert.equal(appearanceOptions({tint:'#ABCDEF'}).tint,'#abcdef');
});
test('gradient texture is retained across draws, disposed on changes, and transparent alpha restores',()=>{
  let alpha=1;const viewer={scene:new THREE.Scene(),renderer:{getClearAlpha:()=>alpha,setClearColor:(_color,a)=>alpha=a}};
  const options=appearanceOptions({backgroundMode:'gradient'});applyBackground(viewer,options);const texture=viewer.scene.background;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
  applyBackground(viewer,options);assert.equal(viewer.scene.background,texture);assert.equal(texture.image.width,1);assert.equal(texture.image.height,256);
  applyBackground(viewer,{...options,backgroundMode:'transparent'});assert.equal(alpha,0);assert.equal(viewer.scene.background,null);assert.equal(disposed,1);
  applyBackground(viewer,{...options,backgroundMode:'solid'});assert.equal(alpha,1);
});
test('procedural studio is deterministic, bounded and has directional highlights',()=>{
  assert.deepEqual(studioFace(0),studioFace(0));assert.equal(studioFace(0).length,32*32*4);
  assert.notDeepEqual(studioFace(2),studioFace(3));assert.ok(new Set(studioFace(0)).size>50);
});
test('Phong styles update real projected source primitives in both dimensions',()=>{
  for(const dimension of [3,4]){
    const model=dimension===3?triangle:{...triangle,dimension:4,vertices:triangle.vertices.map(p=>[...p,0])};
    const viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();viewer.setModel(model);
    viewer.setDisplay(stylePreset('neon',{angles:Array(6).fill(0),projection:'orthographic'}));
    assert.equal(viewer.edgeCylinders.material.emissiveIntensity,2);assert.equal(viewer.edgeCylinders.count,3);
    const geomag=stylePreset('geomag',{angles:Array(6).fill(0),projection:'orthographic'});geomag.materialEffects.reflection='none';viewer.setDisplay(geomag);
    assert.equal(viewer.vertexSpheres.count,3);assert.equal(viewer.surface.visible,false);assert.equal(viewer.vertexSpheres.material.shininess,180);viewer.clear();
  }
});
test('environment ownership applies steel reflection and releases textures',async()=>{
  const viewer={model:triangle,view:stylePreset('geomag'),surface:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshPhongMaterial()),vertexSpheres:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshPhongMaterial())};
  let loaded;const texture=new THREE.CubeTexture(Array.from({length:6},()=>({width:32,height:32})));let disposed=0;texture.addEventListener('dispose',()=>disposed++);
  applyMaterialEffects(viewer,viewer.view,{loadCube:(_urls,callback)=>{loaded=callback;return texture;}});loaded(texture);
  assert.equal(viewer.vertexSpheres.material.envMap,texture);assert.equal((await prepareMaterialEffects(viewer)).reflection,'studio');
  disposeMaterialEffects(viewer);assert.equal(disposed,1);assert.equal(viewer.vertexSpheres.material.envMap,null);
});
test('dense models disable reflection visibly and capture the same bounded fallback',async()=>{
  const viewer={model:{faces:Array(REFLECTION_FACE_LIMIT+1).fill([])},view:stylePreset('metal'),surface:{material:new THREE.MeshPhongMaterial()}};
  applyMaterialEffects(viewer,viewer.view,{loadCube:()=>{throw Error('Must not allocate environment');}});
  assert.match(viewer.appearanceEffectsDiagnostic,/12,000/);assert.equal(viewer.materialEffectsOwner,undefined);assert.equal((await prepareMaterialEffects(viewer)).reflection,'none');
});
test('manual numeric appearance edits preserve the selected preset and background changes',async()=>{
  const current=appearanceOptions({style:'metal'}),values=Object.fromEntries(Object.entries(current).map(([key,value])=>['appearance-'+key,Array.isArray(value)?value.join(', '):String(value)]));
  Object.assign(values,{'appearance-backgroundMode':'gradient','appearance-shininess':'128/2','appearance-apply':'','appearance-reset':'','appearance-cancel':''});
  const fixture=numericControlFixture(AppearanceControls.prototype,values);fixture.state.view.appearance=current;
  let dirty=0;fixture.control.context={...fixture.context,display(){},markDirty(){dirty++;}};fixture.nodes['appearance-status']={};
  const previous=globalThis.document;globalThis.document={activeElement:null};
  try{await fixture.control.apply();assert.equal(fixture.state.view.appearance.style,'metal');assert.equal(fixture.state.view.appearance.backgroundMode,'gradient');assert.equal(fixture.state.view.appearance.shininess,64);assert.equal(dirty,1);}
  finally{globalThis.document=previous;}
});
test('mounted Style picker and Reset publish view-only edits and refuse active export',()=>{
  const picker={},reset={},inputs=Object.fromEntries(['faces-visible','vertices-visible','surface-opacity','render-style'].map(id=>[id,{}]));let mounted,exporting=false,dirty=0;
  const panel={querySelector:selector=>selector==='select'?picker:reset},previous=globalThis.document;
  globalThis.document={createElement:()=>panel,querySelector:()=>({prepend:value=>mounted=value}),getElementById:id=>inputs[id]};
  const state={model:triangle,view:{angles:[1,2,3,4,5,6]}};
  try{
    const controls=mountStyleControls({guard:fn=>fn,getState:()=>state,isExporting:()=>exporting,display(){},markDirty(){dirty++;}});
    assert.equal(mounted.id,'style-settings');picker.value='geomag';picker.onchange();assert.equal(state.view.faces,false);assert.equal(inputs['vertices-visible'].checked,true);assert.equal(dirty,1);
    state.view.appearance.vertexColor='#ff0000';reset.onclick();assert.equal(state.view.appearance.vertexColor,'#bfc8d2');assert.equal(state.model,triangle);
    exporting=true;controls.sync();assert.equal(reset.disabled,true);assert.throws(()=>reset.onclick(),/export/);
  }finally{globalThis.document=previous;}
});
