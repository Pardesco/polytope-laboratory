import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimatedTourLayerFactory} from '../ui/animated-tour-layer.mjs';
function fixture(){
  const nodes=[],calls=[],make=()=>{const n={style:{},dataset:{},append(...children){this.children=children;},remove(){this.removed=true;}};nodes.push(n);return n;};
  class FakeViewer{
    constructor(container){this.container=container;this.calls=[];this.observer={disconnect:()=>this.calls.push('disconnect')};this.controls={dispose:()=>this.calls.push('controls')};this.renderer={dispose:()=>this.calls.push('renderer'),forceContextLoss:()=>this.calls.push('context')};}
    async prepareCapture(){return {ready:true};}async setElementContent(descriptor){this.elementContentLayer=descriptor?{descriptor}:null;return {ready:true};}
    clear(){this.calls.push('clear');}resize(){this.calls.push(['resize',this.container.style.width]);}setModel(m){this.model=m;this.calls.push(['model',m]);}setNet(n){this.calls.push(['net',n]);}setCellNet(n,s){this.calls.push(['cell-net',n,s]);}setFold(n){this.calls.push(['fold',n]);}setDisplay(v){this.calls.push(['view',v]);}restoreCamera(c){this.calls.push(['camera',c]);}fit(){this.calls.push('fit');}draw(){this.calls.push('draw');}
  }
  let current=true,state={model:{id:'cube',dimension:3,fingerprint:'abc'},view:{derivedMode:'section',viewportLayout:'split',sectionNormal:[0,0,1],sectionOffset:.25,surfaceOpacity:.6}};
  const host=make(),factory=createAnimatedTourLayerFactory({host,ViewerClass:FakeViewer,createElement:make,run:async(...args)=>{calls.push(args);return {model:{id:'slice'}};}});
  const layer=factory({slot:0,getState:()=>state,width:800,height:600,isCurrent:()=>current});
  return {layer,nodes,calls,state,setState:s=>state=s,setCurrent:v=>current=v};
}
test('independent half-width panes preserve section parameters and saved camera',async()=>{
  const f=fixture();f.state.view.derivedCamera={position:[1,2,3]};f.layer.prepareLayout(f.state.view);
  await f.layer.refreshDerived();assert.notEqual(f.layer.viewer,f.layer.netViewer);
  assert.equal(f.nodes[2].style.width,'400px');assert.equal(f.nodes[3].style.width,'400px');
  assert.deepEqual(f.calls[0].slice(0,3),['section',{normal:[0,0,1],offset:.25,fill_rule:'nonzero'},f.state.model]);
  assert.deepEqual(f.layer.netViewer.calls.find(c=>c[0]==='camera'),['camera',f.state.view.derivedCamera]);
  f.layer.prepareLayout({viewportLayout:'single'});assert.equal(f.nodes[2].style.width,'800px');
});
test('native results for a replaced preview state are discarded before viewer mutation',async()=>{
  const f=fixture();f.setCurrent(false);await assert.rejects(f.layer.refreshDerived(),{name:'AbortError'});assert.equal(f.calls.length,0);
  f.setCurrent(true);const controller=new AbortController();controller.abort();
  await assert.rejects(f.layer.refreshDerived({signal:controller.signal}),{name:'AbortError'});
});
test('retained net layout and placements are cloned without native regeneration',async()=>{
  const f=fixture();f.state.view.derivedMode='net';f.state.view.net={root:0,length:25,tabs:true,fraction:.4};
  f.state.netLayout={sourceFingerprint:'abc',root:0,referenceEdgeLengthMm:25,tabs:true,placements:[{literal:1}]};
  const before=structuredClone(f.state);await f.layer.refreshDerived();assert.deepEqual(f.state,before);assert.equal(f.calls.length,0);
  const rendered=f.layer.netViewer.calls.find(c=>c[0]==='net')[1];assert.deepEqual(rendered,f.state.netLayout);assert.notEqual(rendered,f.state.netLayout);
  assert.deepEqual(f.layer.netViewer.calls.find(c=>c[0]==='fold'),['fold',.4]);
});
test('unsupported SVG layouts are diagnosed before substituting another derived display',async()=>{
  const f=fixture();f.state.view.derivedMode='net';f.state.view.net={display:'pages'};
  await assert.rejects(f.layer.refreshDerived(),/SVG tour adapter/);assert.equal(f.calls.length,0);
});
test('closing releases both observers, controls, geometry, GPU contexts and host exactly once',async()=>{
  const f=fixture();f.layer.dispose();f.layer.dispose();
  for(const v of [f.layer.viewer,f.layer.netViewer])assert.deepEqual(v.calls,['clear','disconnect','controls','renderer','context']);
  assert.equal(f.nodes[1].removed,true);await assert.rejects(f.layer.refreshDerived(),{name:'AbortError'});
});
