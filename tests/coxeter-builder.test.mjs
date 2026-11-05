import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COXETER_FAMILIES,diagramState,toggleRing,diagramGeometry,diagramMarkup,moveDiagramFocus,CoxeterBuilder} from '../ui/coxeter-builder.mjs';
import {deferred} from './numeric-control-fixture.mjs';

class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.isConnected=true;}
  append(...nodes){this.children.push(...nodes);for(const n of nodes)n.parentElement=this;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(key,fn){this.listeners[key]=fn;}
  set innerHTML(html){this.html=html;this.children=[];for(const m of html.matchAll(/<(\w+)\b[^>]*id="([^"]+)"[^>]*>/g)){const n=new Node(m[1]);n.id=m[2];const index=n.id.match(/node-(\d)$/);if(index)n.dataset.node=index[1];this.append(n);}}
  all(){return this.children.flatMap(n=>[n,...n.all()]);}
  querySelector(s){return s==='[tabindex="0"]'?this.all().find(n=>n.dataset.node==='0'):this.all().find(n=>n.id===s.slice(1));}
  querySelectorAll(s){return this.all().filter(n=>s==='[data-family]'&&n.dataset.family);}
  focus(){this.focused=true;}
  show(){this.open=true;}
  close(){this.open=false;}
}
function fixture(){
  const body=new Node(),document={body,createElement:tag=>new Node(tag),activeElement:new Node('button')},calls=[],state={id:'source'};let exporting=false;
  const context={document,guard:fn=>fn,getState:()=>state,isExporting:()=>exporting,debounce:10000,
    clearPreview:()=>calls.push(['clear']),preview:async(result,{isCurrent})=>{if(isCurrent())calls.push(['preview',result]);},
    run:async(...args)=>{calls.push(['run',...args]);return shape();},commit:async(...args)=>{args[2].verifyPublication();calls.push(['commit',...args]);}};
  const control=new CoxeterBuilder(context);return {control,context,calls,document,state,setExport:value=>exporting=value};
}
const shape=(name='Cube')=>({name,dimension:3,vertices:Array(8).fill([]),edges:Array(12).fill([]),faces:Array(6).fill([]),cells:[],metadata:{shapeBuilder:{edgeRelativeSpread:1e-15}}});

test('all eight families preserve a nonempty immutable ring mask across every toggle',()=>{
  for(const family of Object.keys(COXETER_FAMILIES)){
    const rank=Number(family.at(-1));assert.equal(diagramState(family).rings.length,rank);
    for(let n=1;n<2**rank;n++){
      const mask=[...n.toString(2).padStart(rank,'0')].map(Number),original=diagramState(family,mask);
      for(let i=0;i<rank;i++){const next=toggleRing(original,i);assert.ok(next.rings.some(Boolean));assert.deepEqual(original.rings,mask);if(mask[i]&&mask.filter(Boolean).length===1)assert.equal(next,original);else assert.equal(next.rings[i],1-mask[i]);}
    }
  }
  assert.throws(()=>diagramState('E8'));assert.throws(()=>diagramState('B3',[0,0,0]));assert.throws(()=>toggleRing(diagramState(),8));
});
test('D4 draws a branch, chains show 4/5 labels, and accessible ring targets stay keyboard reachable',()=>{
  assert.deepEqual(diagramGeometry('D4').edges,[[0,1,3],[1,2,3],[1,3,3]]);
  for(const family of Object.keys(COXETER_FAMILIES)){
    const svg=diagramMarkup(diagramState(family));assert.equal((svg.match(/role="button"/g)||[]).length,Number(family.at(-1)));assert.equal((svg.match(/tabindex="0"/g)||[]).length,1);assert.match(svg,/aria-pressed="true"/);
    if(family==='H4')assert.match(svg,/>5<\/text>/);if(family==='F4')assert.match(svg,/>4<\/text>/);
  }
  assert.equal(moveDiagramFocus(0,'ArrowLeft',4),3);assert.equal(moveDiagramFocus(3,'ArrowDown',4),0);assert.equal(moveDiagramFocus(2,'Space',4),2);
});
test('mounted panel creates family chips, keyboard handlers, snub controls and expert notes',()=>{
  const f=fixture(),c=f.control;c.show();clearTimeout(c.timer);
  assert.equal(c.panel.open,true);assert.equal(c.nodes.families.querySelectorAll('[data-family]').length,8);assert.match(c.panel.html,/<details data-expert>/);
  c.nodes.diagram.listeners.keydown({target:{closest:()=>({dataset:{node:'0'}})},key:'ArrowRight',preventDefault(){}});assert.equal(c.focus,1);
  c.nodes.diagram.listeners.keydown({target:{closest:()=>({dataset:{node:'1'}})},key:' ',preventDefault(){}});clearTimeout(c.timer);assert.deepEqual(c.value.rings,[1,1,0]);
  c.nodes.snub.checked=true;c.nodes.snub.onchange();clearTimeout(c.timer);assert.equal(c.value.snub,true);assert.deepEqual(c.value.rings,[1,1,1]);
  c.toggle(1);clearTimeout(c.timer);assert.equal(c.value.snub,false);
  c.close();assert.equal(c.panel.open,false);assert.equal(f.document.activeElement.focused,true);
});
test('live preview uses cancelable native reads, presents counts, and never commits by itself',async()=>{
  const f=fixture(),c=f.control;c.show();clearTimeout(c.timer);await c.preview();
  const read=f.calls.find(row=>row[0]==='run');assert.equal(read[1],'coxeter-build');assert.ok(read[5].signal instanceof AbortSignal);
  assert.equal(c.nodes.name.textContent,'Cube');assert.match(c.nodes.counts.textContent,/8 vertices · 12 edges · 6 faces/);assert.equal(c.nodes.open.disabled,false);
  assert.equal(f.calls.filter(row=>row[0]==='commit').length,0);assert.equal(f.calls.filter(row=>row[0]==='preview').length,1);c.close();
});
test('stale native replies and delayed presentation cannot publish after selection changes or close',async()=>{
  const f=fixture(),c=f.control;c.show();clearTimeout(c.timer);const old=deferred();let signal;
  f.context.run=(_op,_p,_m,_label,options)=>{signal=options.signal;return old.promise;};const pending=c.preview();
  c.toggle(1);clearTimeout(c.timer);assert.ok(signal.aborted);old.resolve(shape('Obsolete'));await pending;assert.notEqual(c.nodes.name.textContent,'Obsolete');assert.equal(c.receipt,null);
  f.context.run=async()=>shape('Current');const display=deferred();f.context.preview=async()=>display.promise;const presenting=c.preview();await Promise.resolve();c.close();display.resolve();await presenting;assert.equal(c.receipt,null);
});
test('Open as model binds the chosen diagram, prevents duplicate commits, and forwards final ownership checks',async()=>{
  const f=fixture(),c=f.control;c.show();clearTimeout(c.timer);await c.preview();const pending=deferred();let verify,signal;
  f.context.commit=(params,name,options)=>{assert.equal(name,'Cube');assert.deepEqual(params.rings,[1,0,0]);verify=options.verifyPublication;signal=options.signal;return pending.promise;};
  const opening=c.openAsModel();await c.openAsModel();assert.equal(c.committing,true);c.toggle(1);assert.deepEqual(c.value.rings,[1,0,0]);verify();
  c.close();assert.ok(signal.aborted);assert.throws(verify,/changed/);pending.resolve();await opening;assert.equal(c.committing,false);
});
test('native errors stay local, exports close and cancel, and the last ring gives a friendly hint',async()=>{
  const f=fixture(),c=f.control;c.show();clearTimeout(c.timer);c.toggle(0);assert.match(c.nodes.status.textContent,/Keep one/);
  f.context.run=async()=>{throw Error('Native resource limit');};await c.preview();assert.equal(c.nodes.status.textContent,'Native resource limit');assert.equal(c.nodes.open.disabled,true);
  f.setExport(true);c.sync();assert.equal(c.panel.open,false);assert.throws(()=>c.show(),/Finish export/);
});
test('app mounts public entry points, keeps the original Wythoff path, and includes the builder in feature tests',async()=>{
  const [app,pkg,pool]=await Promise.all(['../ui/app.js','../package.json','../desktop/engine-pool.cjs'].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  assert.match(app,/window.openCoxeterBuilder=guard/);assert.match(app,/actions\['Shape builder'\]/);assert.match(app,/commitOperation\('generate',\{kind:'coxeter-builder',\.\.\.params\}/);assert.match(app,/\$\('wythoff'\).onclick/);assert.match(app,/prepend\(openCoxeterBuilderButton\)/);
  assert.match(JSON.parse(pkg).scripts['test:features'],/tests\/coxeter-builder.test.mjs/);assert.match(pool,/REUSABLE_OPERATIONS.add\('coxeter-build'\)/);
});

test('preview uses the same model-aware view initializer as Library documents',async()=>{
  const app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
  const callback=app.slice(app.indexOf('preview:(m,{isCurrent})=>',app.indexOf('coxeterBuilder=new CoxeterBuilder')),app.indexOf('clearPreview:',app.indexOf('coxeterBuilder=new CoxeterBuilder'))).trim().replace(/^preview:/,'').replace(/,$/,'');
  const expected={appearance:{style:'main-viewport'},edges:true,vertices:true,surfaceColors:'cell-type',angles:[1,2,3,4,5,6]},calls=[];
  const viewer={resize(){},setModel:m=>calls.push(['model',m]),setDisplay:view=>calls.push(['view',view]),fit(){}};
  const scope={coxeterPreviewHost:{hidden:true},coxeterPreview:viewer,initialDocumentState:(m,label)=>{calls.push(['initial',m,label]);return {view:expected};}};
  const preview=new Function('scope',`with(scope){return (${callback});}`)(scope),model={dimension:4,edges:Array(7200)};
  preview(model,{isCurrent:()=>true});assert.equal(calls[2][1],expected);assert.deepEqual(calls[1],['initial',model,'Shape preview']);
  calls.length=0;preview(model,{isCurrent:()=>false});assert.equal(calls.length,0);
});
