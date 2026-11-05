import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {StellationDiagramControls,diagramRegions,orbitSelection,selectionReflexibility} from '../ui/stellation-diagram-controls.mjs';
import {StellationControls} from '../ui/stellation.js';

const native=JSON.parse(execFileSync('python',['-B','-c',`import json
from engine.generators import regular
from engine.stellation import arrangement
from engine.stellation_diagrams import diagram_data
m=regular('octahedron');a=arrangement(m)
print(json.dumps({'model':m,'arrangement':a,'graph':diagram_data(a,m)}))`],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true}));

function dom(){
  const registry=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.value='';this.checked=false;this.disabled=false;this.attributes={};this.options=[];}
    set id(value){this._id=value;registry.set(value,this);}get id(){return this._id;}
    set innerHTML(value){
      for(const match of value.matchAll(/<(\w+)\b([^>]*)>/g)){
        const id=/\bid="([^"]+)"/.exec(match[2]);if(!id&&match[1]!=='summary')continue;
        const n=new Element(match[1]);if(id)n.id=id[1];n.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]??'';n.checked=/\bchecked\b/.test(match[2]);this.append(n);
      }
      for(const match of value.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>(.*?)<\/select>/gs)){
        const n=registry.get(match[1]);for(const opt of match[2].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>(.*?)<\/option>/gs)){const item=new Element('option');item.value=opt[1];item.textContent=opt[2];n.append(item);}n.value=n.options[0]?.value??'';
      }
    }
    append(...nodes){for(const n of nodes){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=this;this.children.push(n);if(n.tagName==='OPTION')this.options.push(n);}}
    prepend(n){n.parent=this;this.children.unshift(n);}
    insertBefore(n,reference){if(!reference)this.append(n);else{n.parent=this;this.children.splice(this.children.indexOf(reference),0,n);}}
    before(...nodes){if(this.parent){const p=this.parent,index=p.children.indexOf(this);for(const n of nodes)n.parent=p;p.children.splice(index,0,...nodes);}}
    after(...nodes){if(this.parent){const p=this.parent,index=p.children.indexOf(this);for(const n of nodes)n.parent=p;p.children.splice(index+1,0,...nodes);}}
    replaceChildren(...nodes){this.children=[];this.options=[];this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=value;}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
    querySelectorAll(selector){const all=[];const visit=n=>{for(const child of n.children){all.push(child);visit(child);}};visit(this);return all.filter(n=>selector.startsWith('#')?n.id===selector.slice(1):selector.split(',').some(tag=>n.tagName===tag.toUpperCase()));}
  }
  globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_ns,tag)=>new Element(tag),getElementById:id=>registry.get(id)};
  const root=new Element();root.id='construct-panel';const anchor=new Element();anchor.id='stellation-controls';root.append(anchor);const derivedMode=new Element('select');derivedMode.id='derived-mode';root.append(derivedMode);
  return {registry,Element};
}

function fixture(){
  const {registry}=dom(),state={model:structuredClone(native.model),arrangement:structuredClone(native.arrangement),view:{stellation:{boxScale:3,planeIds:null,selectedRegions:[]}},notes:'source notes'},doc={id:'diagram',states:[state],cursor:0},project={documents:[doc]},calls=[];
  const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,getConfig:()=>state.view.stellation,isExporting:()=>false,guard:fn=>fn,markDirty:()=>calls.push('dirty'),applySelection:()=>calls.push('display-solid'),run:async(op,params,source)=>{calls.push(op);assert.equal(source.id,state.model.id);assert.equal(params.arrangement.id,state.arrangement.id);return structuredClone(native.graph);},commit:async(op,params,label,options)=>{options.verifyPublication();calls.push([op,params,label]);},saveSvg:()=>{}};
  const controls=new StellationDiagramControls(context);return {controls,context,state,doc,project,calls,registry};
}

test('facial polygons disambiguate above/below, use exact native orbits and filter attachments',()=>{
  const {graph,arrangement}=native,diagram=graph.diagrams[0],core=graph.nodes.find(n=>n.selectable&&n.outsidePlaneCount===0).id;
  const below=diagramRegions(graph,arrangement,diagram,[core],{side:'below'}),above=diagramRegions(graph,arrangement,diagram,[core],{side:'above'});
  assert.equal(below.length,above.length);below.forEach((p,i)=>assert.notEqual(p.target,above[i].target));
  const pick=above.find(p=>p.selectable&&p.orbit.length===8);assert.ok(pick);
  assert.equal(orbitSelection(graph,[core],'toggle',pick.target).length,9);
  assert.deepEqual(orbitSelection(graph,orbitSelection(graph,[core],'toggle',pick.target),'toggle',pick.target),[core]);
  assert.equal(orbitSelection(graph,[core],'toggle',pick.target,'individual').length,2);
  const attached=diagramRegions(graph,arrangement,diagram,[core],{side:'above',attachedOnly:true});assert.ok(attached.length<above.length);assert.ok(attached.every(p=>p.attached));
  assert.equal(diagramRegions(graph,arrangement,diagram,[],{attachedOnly:true}).length,0);
});

test('native cell graph cavity policy adds sealed core, preserves openings and does not change inputs',()=>{
  const g=native.graph,core=g.nodes.find(n=>n.selectable&&n.outsidePlaneCount===0).id,shell=g.symmetry.regionIds.filter(i=>i!==core),before=structuredClone(g);
  assert.equal(orbitSelection(g,[],'toggle',shell[0],'full',false).length,8);
  assert.equal(orbitSelection(g,[],'toggle',shell[0],'full',true).length,9);
  assert.deepEqual(orbitSelection(g,shell.slice(1),'fill',null,'individual'),shell.slice(1));assert.deepEqual(g,before);
  const restricted=structuredClone(g);restricted.symmetry.preservesFullGroup=false;assert.throws(()=>orbitSelection(restricted,[],'toggle',shell[0]),/box restricts/);
});

test('actual mounted diagram click changes the expected eight-cell orbit, renders outline and saves undo/redo',async()=>{
  const f=fixture();assert.equal(f.controls.panel.id,'stellation-cell-settings');await f.controls.node('evaluate').onclick();assert.ok(f.calls.includes('stellation-diagram-data'));
  f.controls.face('side').value='above';await f.controls.face('side').onchange();
  const svg=f.controls.faceSvg,polygon=svg.children.find(n=>n.tagName==='POLYGON'&&n.dataset.orbitSize===8);assert.ok(polygon);polygon.onclick({preventDefault(){}});
  assert.equal(f.state.view.stellation.selectedRegions.length,8);assert.ok(f.calls.includes('display-solid'));
  assert.ok(f.controls.faceSvg.children.find(n=>n.attributes['aria-label']==='Current solid outline').attributes.d.length);
  const saved=JSON.parse(JSON.stringify(f.state.view.stellation));f.controls.moveHistory(-1);assert.deepEqual(f.state.view.stellation.selectedRegions,[]);f.controls.moveHistory(1);assert.equal(f.state.view.stellation.selectedRegions.length,8);
  f.state.view.stellation=saved;f.controls.sync();f.controls.moveHistory(-1);assert.deepEqual(f.state.view.stellation.selectedRegions,[]);
  assert.equal(f.controls.face('symmetry').disabled,false);f.controls.face('attached').checked=true;await f.controls.face('attached').onchange();assert.equal(f.controls.faceSvg.children.filter(n=>n.tagName==='POLYGON').length,0);
});

test('make base uses compact replayable signatures and refuses changed selection at publication',async()=>{
  const f=fixture();await f.controls.evaluate();const outer=f.controls.receipt.graph.symmetry.orbits.full.find(row=>row.length===8);f.controls.apply('toggle',outer[0]);await f.controls.makeBase();
  const call=f.calls.find(Array.isArray);assert.equal(call[0],'stellation-make-base');assert.equal(call[1].region_signs.length,8);assert.equal(call[1].arrangement,undefined);assert.deepEqual(call[1].bounds,f.state.arrangement.bounds);
  f.controls.context.commit=async(_op,_params,_label,options)=>{f.state.view.stellation.selectedRegions=[];options.verifyPublication();};await assert.rejects(f.controls.makeBase(),/selection changed/);
});

test('late facial analysis and base construction cancellation discard publication',async()=>{
  let release;
  const g=fixture();g.controls.context.run=()=>new Promise(resolve=>release=resolve);const pending=g.controls.evaluate();g.controls.cancel();release(structuredClone(native.graph));await assert.rejects(pending,{name:'AbortError'});assert.equal(g.controls.receipt,null);
  const h=fixture();await h.controls.evaluate();h.controls.apply('toggle',h.controls.receipt.graph.symmetry.regionIds[0]);let publish;
  h.controls.context.commit=async(_op,_params,_label,options)=>{await new Promise(resolve=>publish=resolve);options.verifyPublication();};const job=h.controls.makeBase();h.controls.cancel();publish();await assert.rejects(job,/canceled/);
});

test('mounted criteria search dispatches native support enumeration and steps through k of N',async()=>{
  const f=fixture(),calls=[],c=new StellationControls({...f.context,getModel:()=>f.state.model,rawNumbers:()=>[],refresh:()=>calls.push('refresh'),run:async(op,params,model)=>{
    calls.push(op);const response=JSON.parse(execFileSync('python',['-B','engine/server.py'],{input:JSON.stringify({op,params,model})+'\n',encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}));assert.equal(response.ok,true,response.error);return response.result;
  }});
  c.$('stellation-symmetry').value='geometric-proper';c.$('stellation-criteria').value='supported';c.$('stellation-merge-mirrors').checked=true;c.$('stellation-criteria').onchange();
  await c.$('stellation-enumerate').onclick();assert.ok(calls.includes('stellation-supported-enumerate'));assert.equal(f.state.stellationSearch.candidates.length,2);assert.match(c.$('stellation-search-status').textContent,/exhausted/);
  c.$('stellation-next').onclick();assert.equal(c.$('stellation-position').textContent,'1 of 2');c.$('stellation-next').onclick();assert.equal(c.$('stellation-position').textContent,'2 of 2');assert.equal(c.$('stellation-next').disabled,true);c.$('stellation-previous').onclick();assert.equal(c.$('stellation-position').textContent,'1 of 2');
});

test('held native enumeration cannot publish after source notes or criterion changes',async()=>{
  for(const change of ['notes','criteria','cancel']){
    const f=fixture();let release;const c=new StellationControls({...f.context,getModel:()=>f.state.model,rawNumbers:()=>[],run:()=>new Promise(resolve=>release=resolve)});
    c.$('stellation-symmetry').value='geometric';const pending=c.$('stellation-enumerate').onclick();
    if(change==='notes')f.state.notes='changed';else if(change==='criteria')c.$('stellation-criteria').onchange();else c.cancelNumeric();
    release({candidates:[]});if(change==='notes')await assert.rejects(pending,/source|notes/);else await pending;assert.equal(f.state.stellationSearch??null,null);
  }
});

test('reflexibility explicitly tests orientation-reversing source actions',()=>{
  const s={preservesFullGroup:true,regionIds:[0,1],actions:[{orientation:1,regionIds:[0,1]},{orientation:-1,regionIds:[1,0]}]};
  assert.equal(selectionReflexibility(s,[0]),'chiral within source group');assert.equal(selectionReflexibility(s,[0,1]),'reflexible within source group');s.preservesFullGroup=false;assert.match(selectionReflexibility(s,[0]),/^unknown/);
});

test('candidate stepping persists k of N, rejects endpoints and stale source/criteria',()=>{
  const state={model:{id:'source'},arrangement:{id:'a',planes:[],bounds:[]},view:{stellation:{searchCandidateIndex:-1}},stellationSearch:{candidates:[{regionIds:[1]},{regionIds:[1,2]}]}},nodes=new Map();
  const c=Object.assign(Object.create(StellationControls.prototype),{getState:()=>state,$:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},markDirty:()=>{},renderSearch:()=>{},refresh:()=>{}});state.stellationSearchBinding=c.searchBinding();
  c.chooseCandidate(0);assert.equal(c.config().searchCandidateIndex,0);assert.deepEqual(c.config().selectedRegions,[1]);c.chooseCandidate(1);assert.deepEqual(c.config().selectedRegions,[1,2]);assert.throws(()=>c.chooseCandidate(2),/endpoint/);
  const saved=JSON.parse(JSON.stringify(state));assert.equal(saved.view.stellation.searchCandidateIndex,1);state.model.id='changed';assert.throws(()=>c.chooseCandidate(0),/Enumerate again/);
});
