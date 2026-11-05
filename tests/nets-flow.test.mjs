import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {NetsFlow,netTypeAvailability,organizeAdvanced} from '../ui/nets-flow.mjs';
import {sourceModel} from './construction-controls-fixture.mjs';

class Node{
  constructor(tag,id='',text=''){this.tagName=tag.toUpperCase();this.id=id;this.textContent=text;this.children=[];this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.classList={add:name=>this.className=((this.className??'')+' '+name).trim()};}
  append(...nodes){for(const n of nodes){n.remove();this.children.push(n);n.parentElement=this;}}
  prepend(...nodes){for(const n of nodes.reverse()){n.remove();this.children.unshift(n);n.parentElement=this;}}
  remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
  after(...nodes){const p=this.parentElement;let index=p.children.indexOf(this);for(const n of nodes){n.remove();p.children.splice(++index,0,n);n.parentElement=p;}}
  replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
  get firstChild(){return this.children[0];}
  get parentNode(){return this.parentElement;}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){this.listeners[k]=fn;}
  closest(selector){for(let n=this;n;n=n.parentElement)if(selector===n.tagName.toLowerCase()||selector==='[data-expert]'&&'data-expert' in n.attributes)return n;return null;}
  querySelectorAll(selector){return this.children.flatMap(n=>[...(selector[0]==='#'?n.id===selector.slice(1):n.tagName.toLowerCase()===selector)?[n]:[],...n.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}
function documentFixture(){
  const body=new Node('body'),doc={body,createElement:tag=>new Node(tag),getElementById:id=>body.querySelector('#'+id)};
  const add=(parent,tag,id,text)=>{const n=new Node(tag,id,text);parent.append(n);return n;};
  const group=(parent,id,title)=>{const n=add(parent,'details',id);add(n,'summary','',title);return n;};
  const field=(parent,id)=>{const label=add(parent,'label');add(label,'span','','Original label');return add(label,'input',id);};
  const panel=add(body,'div','net-panel'),face=add(panel,'div','face-net-controls'),cell=add(panel,'div','cell-net-controls');
  add(face,'div','','3D face net').className='panel-title';add(cell,'div','','4D whole-cell net').className='panel-title';
  const controls=['net-rebuild','net-rearrange','net-summary','net-display','net-undo','net-redo','net-fold-settings','net-layout-settings','net-checks-settings'];
  for(const id of controls)add(face,'button',id);
  for(const id of ['net-length','net-tabs'])field(face,id);
  const fg=group(face,'net-generation-settings','Starting face and separate pieces');field(fg,'net-root');add(fg,'button','net-separate');
  const cg=group(cell,'cell-net-generation-settings','Starting cell and separate pieces');field(cg,'cell-net-root');add(cg,'button','cell-net-separate');
  for(const id of ['cell-net-build','cell-net-summary','cell-net-shrink','cell-net-checks-settings'])add(cell,'button',id);
  const visible=add(face,'section','net-visible-surface-settings');add(visible,'button','net-visible-surface');field(visible,'net-visible-fill');
  const paper=group(face,'net-paper-settings','Paper and export');
  for(const id of ['net-paper','net-paper-orientation','net-paper-margin'])field(paper,id);
  const actions=add(paper,'div','net-export-actions');for(const id of ['net-export-svg','net-export-pdf'])add(actions,'button',id);
  const pages=add(paper,'div');for(const id of ['net-page-prev','net-page-next'])add(pages,'button',id);
  for(const id of ['net-pack','net-paper-status','net-packed-pdf','net-packed-svg','net-assembly-controls','net-fabrication-settings'])add(paper,'div',id);
  add(face,'details','net-tab-settings');add(panel,'details','net-reinforcement-settings');add(panel,'details','coincident-edge-assembly');
  const advanced=add(body,'div','evidence-panel');add(advanced,'div','evidence');add(advanced,'button','validate');add(advanced,'button','symmetry');add(advanced,'div','symmetry-result');
  add(advanced,'div','','Exact rational hull').className='panel-title';field(advanced,'rational-points');add(advanced,'button','rational-hull');group(advanced,'rational-method','Method notes');
  add(advanced,'div','','Numeric contract').className='panel-title';group(advanced,'numeric-method','Method notes');group(advanced,'import-method','Method notes');
  return doc;
}
function flowFixture(){
  const doc=documentFixture(),model={...sourceModel(),interpretation:'convex-polytope',fingerprint:'fp'},state={model,view:{net:{root:0,length:25,tabs:true}}},calls=[];
  const faceEditor={getState:()=>state,guard:fn=>fn,context:{isExporting:()=>false},exports:{busy:false,run:(...args)=>calls.push(['print',...args])},visibleSurface:{busy:false}};
  const fabrication={session:{busy:false},context:{guard:fn=>fn,isExporting:()=>false},apply:action=>calls.push(['fabrication',action])},cellEditor={};
  const original=new Map(doc.body.querySelectorAll('button').map(n=>[n.id,n]));
  for(const [id,n] of original)n.onclick=()=>calls.push([id]);
  const flow=new NetsFlow(doc,{faceEditor,cellEditor,fabrication});return {doc,flow,faceEditor,fabrication,state,calls,original};
}
test('dimension, closure, validation and resource limits give explicit card reasons',()=>{
  const cube={...sourceModel(),interpretation:'convex-polytope'};
  assert.equal(netTypeAvailability(cube).faces,'');assert.match(netTypeAvailability(cube).cells,/4D/);assert.match(netTypeAvailability(cube).surface,/convex/);
  assert.match(netTypeAvailability(null).faces,/Open/);assert.match(netTypeAvailability({...cube,dimension:2}).faces,/3D/);
  assert.match(netTypeAvailability({...cube,faces:cube.faces.slice(1)}).faces,/closed/);
  assert.match(netTypeAvailability({...cube,validation:{passed:false}}).faces,/checks/);
  assert.match(netTypeAvailability({...cube,faces:Array(251).fill([0,1,2])}).faces,/250/);
  const four={dimension:4,faces:[[0,1,2]],cells:[[0],[0]]};assert.equal(netTypeAvailability(four).cells,'');
  assert.match(netTypeAvailability({...four,cells:[[0]]}).cells,/two cells/);assert.match(netTypeAvailability({...four,cells:Array(1025).fill([0])}).cells,/1,024/);
});
test('simple generalized shells keep face unfolding; stars are directed to visible surface',()=>{
  const shell={...sourceModel(),interpretation:'generalized-complex'};assert.equal(netTypeAvailability(shell).faces,'');assert.equal(netTypeAvailability(shell).surface,'');
  const vertices=Array.from({length:5},(_,i)=>[Math.cos(i*2*Math.PI/5),Math.sin(i*2*Math.PI/5),0]),cycle=[0,2,4,1,3];
  const star={...shell,vertices,edges:cycle.map((v,i)=>[v,cycle[(i+1)%5]]),faces:[cycle,[...cycle].reverse(),[],[]]};
  assert.match(netTypeAvailability(star).faces,/Crossing/);assert.equal(netTypeAvailability(star).surface,'');
  assert.match(netTypeAvailability({...shell,metadata:{visibleSurface:{}}}).surface,/ready/);
  assert.match(netTypeAvailability({...shell,embeddingDimension:4}).surface,/three source coordinates/);
  assert.match(netTypeAvailability({...shell,faces:Array(101).fill([0,1,2])}).surface,/100/);
});
test('mounted flow preserves every original button, handler and ID in three ordered steps',()=>{
  const f=flowFixture(),get=id=>f.doc.getElementById(id);
  assert.deepEqual(get('net-panel').children.map(n=>n.id),['nets-step-1','nets-step-2','nets-step-3']);
  for(const [id,original] of f.original){assert.equal(get(id),original,id);get(id).onclick();assert.deepEqual(f.calls.at(-1),[id]);}
  assert.equal(get('net-rebuild').closest('section').id,'nets-step-1');assert.equal(get('cell-net-build').closest('section').id,'nets-step-1');
  assert.equal(get('net-export-svg').closest('section').id,'nets-step-3');assert.equal(get('net-rearrange').closest('section').id,'nets-step-2');
  assert.equal(get('net-paper-settings').querySelector('summary').textContent,'Page and paper options');assert.equal(get('net-tabs').closest('details').id,'net-paper-settings');
  for(const id of ['net-reinforcement-settings','net-fabrication-settings','coincident-edge-assembly'])assert.equal(get(id).getAttribute('data-expert'),'');
  assert.equal(get('net-assembly-controls').closest('details').id,'nets-numbering-options');assert.equal(get('nets-numbering-options').open,undefined);
  assert.equal(f.faceEditor.flow,f.flow);assert.equal(f.fabrication.flow,f.flow);
});
test('cards and output track current layout and busy state; new outputs use guarded existing sessions',()=>{
  const f=flowFixture(),get=id=>f.doc.getElementById(id);assert.equal(get('net-rebuild').disabled,false);assert.equal(get('cell-net-build').disabled,true);assert.equal(get('net-print').disabled,true);
  f.state.netLayout={sourceFingerprint:'fp',root:0,referenceEdgeLengthMm:25,tabs:true,printSource:f.state.model};f.state.netPages={};f.flow.sync();
  assert.equal(get('net-print').disabled,false);get('net-print').onclick();assert.deepEqual(f.calls.at(-1),['print','print',{packed:true}]);
  get('net-export-dxf').onclick();assert.deepEqual(f.calls.at(-1),['fabrication','measure-dxf']);
  f.faceEditor.exports.busy=true;f.flow.sync();assert.equal(get('net-rebuild').disabled,true);assert.match(get('nets-type-faces-reason').textContent,/Finish/);assert.equal(get('net-print').disabled,true);
  f.faceEditor.exports.busy=false;f.fabrication.session.busy=true;f.flow.sync();assert.equal(get('net-export-dxf').disabled,true);
  f.state.model={dimension:4,faces:[[0,1,2]],cells:[[0],[0]]};f.flow.sync();assert.equal(get('cell-net-build').disabled,false);assert.equal(get('net-rebuild').disabled,true);assert.match(get('nets-output-note').textContent,/3D previews/);
});
test('Advanced gets specific headings and method titles, preserves checks and is idempotent',()=>{
  const doc=documentFixture(),validate=doc.getElementById('validate');organizeAdvanced(doc);organizeAdvanced(doc);
  assert.equal(doc.getElementById('validate'),validate);assert.equal(validate.closest('section').id,'advanced-checks');
  assert.equal(doc.getElementById('symmetry').closest('details').id,'advanced-symmetry-checks');
  assert.equal(doc.getElementById('advanced-exact-arithmetic').getAttribute('data-expert'),'');
  assert.equal(doc.getElementById('rational-method').querySelector('summary').textContent,'Rational hull limits and certificates');
  assert.equal(doc.getElementById('numeric-method').querySelector('summary').textContent,'Numerical precision and tolerances');
  assert.equal(doc.getElementById('import-method').querySelector('summary').textContent,'Imported faces and supported operations');
  assert.equal(doc.body.querySelectorAll('#advanced-intro').length,1);
});
test('smoke reveal opens expert tools and nested disclosures, preserving summary keyboard behavior',async()=>{
  const {reveal}=createRequire(import.meta.url)('../scripts/smoke-helpers.cjs'),doc=documentFixture(),expert=doc.getElementById('net-paper-settings'),child=doc.getElementById('net-paper');expert.setAttribute('data-expert','');
  const classes=new Set();doc.body.classList={add:name=>classes.add(name)};const old=globalThis.document;globalThis.document=doc;
  expert.querySelector=selector=>selector===':scope > summary'?{contains:target=>target===expert.children[0]}:null;
  try{await reveal(null,{evaluate:fn=>fn(child)});assert.equal(expert.open,true);assert.equal(classes.has('expert-mode'),true);
    expert.open=false;await reveal(null,{evaluate:fn=>fn(expert.children[0])});assert.equal(expert.open,false);
  }finally{globalThis.document=old;}
});
test('app mounts after legacy grouping and loads its scoped stylesheet',()=>{
  const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');
  const grouping=app.indexOf('organizeNetInspector(document);'),mount=app.indexOf('new NetsFlow(document,');
  assert.ok(grouping>=0&&mount>grouping,'Nets flow mounts after legacy grouping');assert.match(app,/import '\.\/nets-flow.css'/);
});

test('applicable net action leads above closed alternatives across 3D, 4D and invalid sources',()=>{
  const f=flowFixture(),get=id=>f.doc.getElementById(id);
  assert.deepEqual(get('nets-available-types').children.map(n=>n.id),['nets-type-faces']);assert.equal(get('nets-other-types').open,false);
  assert.equal(get('net-length').title.includes('source edge 0'),true);assert.equal(get('net-length').closest('label').firstChild.textContent,'Edge length ');
  const four={name:'Tesseract',dimension:4,faces:[[0,1,2]],cells:[[0],[0]]};f.state.model=four;f.flow.sync();
  assert.deepEqual(get('nets-available-types').children.map(n=>n.id),['nets-type-cells']);assert.equal(get('nets-type-cells-title').textContent,'Unfold Tesseract’s cells');
  assert.equal(get('cell-net-build').textContent,'Generate cell net');assert.equal(get('nets-other-types').open,false);
  assert.equal(f.flow.otherLabel.textContent,'Other net types (2)');assert.equal(f.flow.otherSummary.title,'Needs a 3D model');
  assert.equal(get('nets-type-faces-reason').hidden,false);assert.match(get('nets-type-faces-reason').textContent,/Choose a 3D model/);
  assert.equal(get('cell-net-generation-settings').parentElement,get('nets-type-cells'));assert.equal(get('net-generation-settings').parentElement,get('nets-type-faces'));
  f.state.model={...four,validation:{passed:false}};f.flow.sync();assert.equal(get('nets-available-types').children.length,0);assert.equal(get('cell-net-build').disabled,true);
});
