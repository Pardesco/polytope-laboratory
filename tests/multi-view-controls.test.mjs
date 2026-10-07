import test from 'node:test';
import assert from 'node:assert/strict';
import {MultiViewControls,multiViewSettings,multiViewGrid} from '../ui/multi-view-controls.mjs';
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.hidden=false;this.events={};this.value='';}
 set innerHTML(html){for(const m of html.matchAll(/<(div|select|button|output)[^>]*id="([^"]+)"/g)){const n=new Node(m[1]);n.id=m[2];this.children.push(n);}}
 append(...nodes){for(const n of nodes)n.parent=this;this.children.push(...nodes);}replaceChildren(...n){this.children=[];this.append(...n);}remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 querySelector(s){return this.all().find(n=>n.id===s.slice(1));}querySelectorAll(s){return this.all().filter(n=>s.split(',').includes(n.tag));}all(){return this.children.flatMap(n=>[n,...n.all()]);}setAttribute(){}addEventListener(k,f){this.events[k]=f;}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}getBoundingClientRect(){return {width:200,height:180};}
}
function fixture(annotations=false){
 const events=[],created=[],saved=[],source={id:'source',dimension:3,embeddingDimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1]],faces:[[0,1,2]],cells:[],metadata:{literal:{rgba:[.2,.4,.6,.8]}}},state={model:source,view:{coordinateUnit:'mm',viewportLayout:'split',camera:{original:true},...(annotations?{elementAnnotations:{entries:[{kind:'vertex',index:0}]}}:{})},notes:'original'};
 let project={},frame=0;const host=new Node('body');globalThis.document={body:host,querySelector:()=>host};
 class Viewer{
  constructor(container,onPick){this.container=container;this.onPick=onPick;this.controls={enabled:true,enableDamping:true,dispose:()=>events.push('controls')};this.observer={disconnect:()=>events.push('observer')};this.renderer={domElement:{width:200,height:180},dispose:()=>events.push('renderer'),forceContextLoss:()=>events.push('context')};this.camera={position:[1,1,1],target:[0,0,0],up:[0,1,0],zoom:1,projection:'orthographic',orthographicHalfHeight:1};created.push(this);}
  setModel(m){assert.ok(Object.isFrozen(m));this.model=m;}setDisplay(v){this.view=v;}resize(){}cameraState(){return structuredClone(this.camera);}restoreCamera(c){this.camera=structuredClone(c);}snap(axis){this.camera.position={x:[3,0,0],y:[0,3,0],z:[0,0,3],isometric:[3,3,3]}[axis];}fit(){}setCameraProjection(p){this.camera.projection=p;}draw(){}clear(){events.push('clear');}async setElementContent(){this.annotated=true;}async prepareCapture(){events.push('capture');if(annotations)assert.ok(this.annotated);return {complete:true};}
 }
 const draw=[],canvas={getContext:()=>({fillRect(){},drawImage(...a){draw.push(a);}}),toDataURL:()=>{events.push('image');return 'data:image/png;base64,grid';}},context={Viewer,createElement:tag=>new Node(tag),getState:()=>state,getSource:()=>state.model,getProject:()=>project,host,mount:n=>host.append(n),requestFrame:()=>++frame,cancelFrame(){},markDirty(){},saveImage:async data=>{saved.push(data);return {path:'grid.png'};},makeCanvas:()=>canvas,describeContent:async()=>{events.push('describe');return {entries:[{}]};},onSelect:(...args)=>events.push(['pick',...args])},controls=new MultiViewControls(context);
 return {controls,context,state,source,events,created,saved,canvas,draw,setProject:p=>project=p};
}
test('one-to-six source views save independent cameras, pick source IDs, maximize, export all panes and release resources',async()=>{
 const f=fixture(true),before=structuredClone(f.state.view);await f.controls.open();await f.controls.setCount(6);assert.equal(f.controls.session.views.length,6);assert.equal(f.events.filter(e=>e==='describe').length,1);
 const records=f.controls.session.views;records[2].viewer.camera.position=[7,8,9];records[2].viewer.onCamera();assert.deepEqual(f.state.view.multiViews.cameras[2].position,[7,8,9]);assert.equal(f.state.view.viewportLayout,before.viewportLayout);assert.deepEqual(f.state.view.camera,before.camera);
 records[1].viewer.onPick(0,1,'face');assert.ok(f.events.some(e=>Array.isArray(e)&&e[0]==='pick'&&e[1]===0&&e[3]==='face'));
 f.controls.maximize(2);assert.equal(records.filter(r=>!r.tile.hidden).length,1);await f.controls.export();assert.equal(f.draw.length,6);assert.equal(f.canvas.width,600);assert.equal(f.canvas.height,360);assert.equal(f.saved.length,1);assert.equal(f.controls.session.maximized,2);assert.ok(f.events.indexOf('image')>f.events.lastIndexOf('capture'));
 const cameras=structuredClone(f.state.view.multiViews.cameras);f.controls.close();assert.equal(f.events.filter(e=>e==='context').length,10);await f.controls.open();assert.deepEqual(f.controls.session.views[2].viewer.cameraState(),cameras[2]);f.controls.close();
});
test('source/workspace changes close the frozen grid and a held capture cannot save late output',async()=>{
 const f=fixture();await f.controls.open();let release,entered;const enteredPromise=new Promise(r=>entered=r);f.controls.session.views[0].viewer.prepareCapture=()=>{entered();return new Promise(r=>release=r);};const pending=f.controls.export();await enteredPromise;f.source.metadata.literal.rgba[3]=.25;f.controls.sync();assert.equal(f.controls.session,null);release();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.saved.length,0);
 await f.controls.open();f.setProject({changed:true});f.controls.sync();assert.equal(f.controls.session,null);f.controls.destroy();
});
test('invalid saved settings and enabled source morph refuse explicitly',async()=>{
 assert.deepEqual(multiViewGrid(6),{columns:3,rows:2});assert.throws(()=>multiViewSettings({version:1,count:7,cameras:[]}));const f=fixture();f.state.view.dualMorph={enabled:true};await assert.rejects(f.controls.open(),/enabled dual morph/);assert.equal(f.created.length,0);
});
