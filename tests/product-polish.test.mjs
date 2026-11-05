import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {updateExportFormatLabels} from '../ui/export-format-labels.mjs';
import {explainAvailability} from '../ui/availability-copy.mjs';
import {GUIDE_REFERENCES} from '../ui/guide-reference-index.mjs';
import {GUIDE_TOPICS,guideContext} from '../ui/user-guide.mjs';
import {groupConstructControls} from '../ui/construct-groups.mjs';
import {labelDiagramPicks,activateDiagramKey} from '../ui/diagram-accessibility.mjs';
import {ElementTypeControls} from '../ui/element-type-controls.mjs';

test('printable encodings and displayed formats restore all intrinsic labels on mode changes',()=>{
  const original=new Map([['stl','STL · triangulated convex 3D solid'],['obj','OBJ · intrinsic 3D boundary'],['off','OFF / 4OFF'],['3mf','3MF · printable shells (mm)']]);
  const options=Array.from(original,([value,textContent])=>({value,textContent}));
  updateExportFormatLabels(options,original,{printable:true});assert.equal(options[0].textContent,'STL · binary printable mesh');assert.equal(options[1].textContent,'OBJ · grouped printable mesh');
  updateExportFormatLabels(options,original,{printable:true,ascii:true});assert.equal(options[0].textContent,'STL · ASCII printable mesh');
  updateExportFormatLabels(options,original,{displayed:true});assert.equal(options[1].textContent,'OBJ · displayed mesh');
  updateExportFormatLabels(options,original);assert.deepEqual(options.map(o=>o.textContent),[...original.values()]);
});

test('disabled explanations support tooltips, assistive text and palette reasons, then restore the normal tooltip',()=>{
  const attrs={},node={id:'adopt',title:'Adopt preview',disabled:true,dataset:{},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k]},panel={querySelectorAll:()=>[node]};
  explainAvailability(panel,'Choose a model.',{adopt:'Solve a preview first.'});
  assert.equal(node.title,'Solve a preview first.');assert.equal(node.dataset.disabledReason,node.title);assert.equal(attrs['aria-description'],node.title);
  node.disabled=false;explainAvailability(panel,'Choose a model.');assert.equal(node.title,'Adopt preview');assert.deepEqual(attrs,{});assert.deepEqual(node.dataset,{});
});

test('every offline feature note exists and is bundled under an existing Guide topic',async()=>{
  const source=await readFile(new URL('../ui/guide-documents.mjs',import.meta.url),'utf8');
  for(const [topic,names] of Object.entries(GUIDE_REFERENCES)){
    assert.ok(GUIDE_TOPICS.some(t=>t.id===topic));assert.equal(new Set(names).size,names.length);
    for(const name of names){assert.ok(source.includes(name.replace('.md','')),name);assert.ok((await readFile(new URL('../docs/'+name,import.meta.url),'utf8')).length>0);}
  }
  assert.equal(guideContext({id:'element-types'}),'selection');assert.equal(guideContext({id:'face-conway-settings'}),'construction');assert.equal(guideContext({id:'face-surgery-settings'}),'augmentation');
  assert.equal(guideContext({id:'element-type-face-1',closest:selector=>selector==='#element-types'?{}:null}),'selection');
});

test('task grouping moves existing controls intact and leaves primary fitting action outside disclosures',()=>{
  class Node{
    constructor(tag='section',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];}
    append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children.splice(n.parentElement.children.indexOf(n),1);this.children.push(n);n.parentElement=this;}}
    after(node){const p=this.parentElement;p.append(node);p.children.splice(p.children.indexOf(node),1);p.children.splice(p.children.indexOf(this)+1,0,node);}
    before(node){this.after(node);const p=this.parentElement;p.children.splice(p.children.indexOf(node),1);p.children.splice(p.children.indexOf(this),0,node);}
  }
  const ids=['modify','fitting-settings','face-conway-settings','faceting-diagram-settings','automatic-faceting-settings','stellation-controls','stellation-cell-settings','face-surgery-settings','create-model-settings'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node('section',id)])),panel=new Node();panel.append(...Object.values(nodes));
  const doc={createElement:tag=>new Node(tag),getElementById:id=>nodes[id]};
  groupConstructControls(doc,panel,nodes.modify);
  assert.equal(nodes['fitting-settings'].parentElement.id,'fit-refine-controls');
  assert.equal(nodes['faceting-diagram-settings'].parentElement.id,'facet-stellate-controls');
  assert.equal(nodes['face-surgery-settings'].parentElement,nodes.modify);
  assert.equal(nodes['stellation-controls'].parentElement.tagName,'DETAILS');assert.equal(nodes['stellation-controls'].parentElement.open,undefined);
  assert.equal(nodes['fitting-settings'].parentElement.tagName,'SECTION');
  assert.deepEqual(panel.children.filter(n=>n.id).map(n=>n.id),['modify','fit-refine-controls','facet-stellate-controls','create-model-settings']);
});

test('diagram picks have names, tooltips and keyboard activation without duplicate text stops',()=>{
  const make=(localName,vertex=null)=>({localName,attrs:{},children:[],getAttribute:key=>key==='data-source-vertex-id'?vertex:null,setAttribute(key,value){this.attrs[key]=value;},append(n){this.children.push(n);}});
  const vertex=make('circle','4'),text=make('text','4'),path=make('path'),root=make('svg');
  root.querySelectorAll=()=>[vertex,text,path];root.ownerDocument={createElementNS:(_ns,name)=>make(name)};
  assert.equal(labelDiagramPicks(root),root);assert.equal(vertex.attrs['aria-label'],'Select source vertex 4');assert.equal(vertex.attrs.tabindex,'0');assert.equal(path.attrs.role,'button');assert.equal(text.attrs.tabindex,undefined);assert.equal(vertex.children[0].textContent,'Select source vertex 4');
  let activated=0,prevented=0;for(const key of ['Enter',' ','Escape'])activateDiagramKey({key,target:{closest:()=>vertex},preventDefault:()=>prevented++},()=>activated++);
  assert.equal(activated,2);assert.equal(prevented,2);
});

test('element types announce startup immediately, defer detailed progress 400 ms and retire it on cancellation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const control=Object.create(ElementTypeControls.prototype),source={model:{id:'progress-fixture',vertices:[],edges:[],faces:[],cells:[]}};
  let finish;Object.assign(control,{sequence:0,panel:{textContent:''},render:()=>{},context:{getState:()=>source,run:()=>new Promise(resolve=>finish=resolve)}});
  const pending=control.refresh();assert.equal(control.panel.textContent,'Finding element types…');t.mock.timers.tick(399);assert.equal(control.panel.textContent,'Finding element types…');
  t.mock.timers.tick(1);assert.match(control.panel.textContent,/computing/);control.cancelNumeric();t.mock.timers.tick(1000);assert.match(control.panel.textContent,/canceled/);
  finish({});await pending;assert.match(control.panel.textContent,/canceled/);
});
