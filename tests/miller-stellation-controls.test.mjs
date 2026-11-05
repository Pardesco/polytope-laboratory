import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {StellationControls} from '../ui/stellation.js';
import {millerCandidate} from '../ui/miller-stellation-controls.mjs';
import pool from '../desktop/engine-pool.cjs';

const native=JSON.parse(execFileSync('python',['-B','-c',`import json
from engine.generators import regular
from engine.stellation import arrangement
from engine.server import dispatch
m=regular('icosahedron');a=arrangement(m,box_scale=10)
r=dispatch({'op':'stellation-miller-enumerate','model':m,'params':{'arrangement':a}})
print(json.dumps({'model':m,'arrangement':a,'result':r}))`],{encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true}));

function dom(){
  const registry=new Map();
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.checked=false;this.disabled=false;this.options=[];this.dataset={};}
    set id(v){this._id=v;registry.set(v,this);}get id(){return this._id;}
    set innerHTML(value){
      for(const match of value.matchAll(/<(\w+)\b([^>]*)>/g)){
        const id=/\bid="([^"]+)"/.exec(match[2]);if(!id)continue;const node=new Element(match[1]);node.id=id[1];node.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]??'';node.checked=/\bchecked\b/.test(match[2]);this.append(node);
      }
      for(const match of value.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>(.*?)<\/select>/gs)){
        const node=registry.get(match[1]);for(const opt of match[2].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>(.*?)<\/option>/gs)){const item=new Element('option');item.value=opt[1];item.textContent=opt[2];node.append(item);}node.value=node.options[0]?.value??'';
      }
    }
    append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);if(n.tagName==='OPTION')this.options.push(n);}}
    prepend(n){n.parent=this;this.children.unshift(n);}
    before(...nodes){if(this.parent){const p=this.parent;for(const n of nodes)n.parent=p;p.children.splice(p.children.indexOf(this),0,...nodes);}}
    after(...nodes){if(this.parent){const p=this.parent;for(const n of nodes)n.parent=p;p.children.splice(p.children.indexOf(this)+1,0,...nodes);}}
    insertBefore(n,reference){if(!reference)this.append(n);else{n.parent=this;this.children.splice(this.children.indexOf(reference),0,n);}}
    replaceChildren(...nodes){this.children=[];this.options=[];this.append(...nodes);}
    querySelector(selector){return this.children.find(n=>selector.startsWith('#')?n.id===selector.slice(1):n.tagName===selector.toUpperCase())??null;}
  }
  globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>registry.get(id)};
  const root=new Element();root.id='construct-panel';const mode=new Element('select');mode.id='derived-mode';root.append(mode);
  return registry;
}

function fixture(overrides={}){
  dom();const state={model:structuredClone(native.model),arrangement:structuredClone(native.arrangement),view:{stellation:{boxScale:10,planeIds:null,selectedRegions:[],searchCriteria:'miller'}},notes:'source notes'},doc={id:'miller',states:[state],cursor:0},project={documents:[doc]},calls=[];
  const context={getState:()=>state,getModel:()=>state.model,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,guard:fn=>fn,rawNumbers:()=>{throw Error('Miller must ignore custom generators');},markDirty:()=>calls.push('dirty'),refresh:()=>calls.push('refresh'),run:async(op,params,model)=>{
    calls.push(op);assert.equal(op,'stellation-miller-enumerate');assert.deepEqual(Object.keys(params),['arrangement']);assert.equal(model.id,state.model.id);return structuredClone(native.result);
  },commit:async(op,params,label,options)=>{options.verifyPublication();calls.push({op,params,label});}};
  Object.assign(context,overrides);const controls=new StellationControls(context);controls.sync();return {state,doc,project,calls,context,controls};
}

async function enumerated(){const f=fixture();await f.controls.$('stellation-enumerate').onclick();return f;}

test('mounted Miller selector states the fixed symmetry / mirror policy and disables custom settings',()=>{
  const {controls:c}=fixture();assert.equal(c.$('stellation-criteria').options.at(-1).textContent,"Miller's rules (59 icosahedra)");
  for(const id of ['stellation-symmetry','stellation-generator-ids','stellation-include-seed','stellation-connected','stellation-merge-mirrors'])assert.equal(c.$(id).disabled,true);
  assert.equal(c.$('stellation-miller-base').disabled,true);
  c.$('stellation-criteria').value='supported';c.$('stellation-criteria').onchange();assert.equal(c.$('stellation-symmetry').disabled,false);assert.equal(c.$('stellation-miller-base').hidden,true);
});

test('native 59 dispatch and mounted stepping retain book indices, labels, boundaries and deterministic cell sets',async()=>{
  const f=await enumerated(),c=f.controls;assert.ok(f.calls.includes('stellation-miller-enumerate'));assert.match(c.$('stellation-search-status').textContent,/32 reflexible \+ 27 chiral/);
  assert.equal(c.$('stellation-position').textContent,'0 of 59');
  for(let i=0;i<59;i++){
    c.$('stellation-next').onclick();const row=native.result.candidates[i];assert.equal(c.$('stellation-position').textContent,`${i+1} of 59 — ${row.coxeterLabel}`);assert.deepEqual(f.state.view.stellation.selectedRegions,row.regionIds);assert.equal(millerCandidate(c).bookIndex,i+1);
  }
  assert.equal(c.$('stellation-next').disabled,true);assert.throws(()=>c.chooseCandidate(59),/endpoint/);
  for(let i=57;i>=0;i--){c.$('stellation-previous').onclick();assert.deepEqual(f.state.view.stellation.selectedRegions,native.result.candidates[i].regionIds);}
  assert.equal(c.$('stellation-previous').disabled,true);assert.equal(c.$('stellation-miller-base').disabled,false);
  c.chooseCandidate(6);assert.match(c.$('stellation-position').textContent,/7 of 59 — G/);c.chooseCandidate(7);assert.match(c.$('stellation-position').textContent,/8 of 59 — H/);
});

test('saved UI selection and stepping index restore with the declared criteria',async()=>{
  const f=await enumerated(),c=f.controls;c.chooseCandidate(32);const saved=JSON.parse(JSON.stringify(f.state));
  Object.assign(f.state,saved);c.sync();assert.equal(c.$('stellation-criteria').value,'miller');assert.equal(f.state.view.stellation.searchCandidateIndex,32);assert.match(c.$('stellation-position').textContent,/33 of 59 — f1/);
  c.$('stellation-next').onclick();assert.equal(f.state.view.stellation.searchCandidateIndex,33);assert.equal(millerCandidate(c).coxeterLabel,'e1f1');
});

test('Make base model commits compact replayable native signatures and the displayed book label',async()=>{
  const f=await enumerated(),c=f.controls;c.chooseCandidate(8);await c.$('stellation-miller-base').onclick();
  const call=f.calls.find(x=>typeof x==='object');assert.equal(call.op,'stellation-make-base');assert.equal(call.label,'Miller 9: e1');assert.equal(call.params.region_signs.length,20);assert.equal(call.params.arrangement,undefined);assert.deepEqual(call.params.bounds,native.arrangement.bounds);assert.equal(call.params.box_scale,10);assert.equal(c.baseController,null);
});

test('Make base publication rejects changed source, selection, criterion, observation domain and cancellation',async()=>{
  for(const edit of ['notes','selection','criteria','scale','arrangement','cancel','export']){
    const f=await enumerated(),c=f.controls;c.chooseCandidate(8);let release;
    c.context.commit=async(_op,_params,_label,options)=>{await new Promise(resolve=>release=resolve);options.verifyPublication();};const pending=c.$('stellation-miller-base').onclick();
    if(edit==='notes')f.state.notes='changed';if(edit==='selection')c.chooseCandidate(9);if(edit==='criteria')f.state.view.stellation.searchCriteria='custom';if(edit==='scale')f.state.view.stellation.boxScale=3;if(edit==='arrangement')f.state.arrangement={...f.state.arrangement};if(edit==='cancel')c.cancelNumeric();if(edit==='export')c.context.isExporting=()=>true;
    release();await assert.rejects(pending,/changed|canceled|export/);assert.equal(c.baseController,null);
  }
});

test('current candidate cannot be adopted after an independent cell edit or during a second base job',async()=>{
  const f=await enumerated(),c=f.controls;c.chooseCandidate(0);f.state.view.stellation.selectedRegions=[];assert.equal(millerCandidate(c),null);await assert.rejects(c.$('stellation-miller-base').onclick(),/current Miller/);
  c.chooseCandidate(0);let release;c.context.commit=()=>new Promise(resolve=>release=resolve);const job=c.$('stellation-miller-base').onclick();await assert.rejects(c.$('stellation-miller-base').onclick(),/Finish or cancel/);release();await job;
});

test('held Miller enumeration discards obsolete criteria, canceled work and source-note edits',async()=>{
  for(const edit of ['criteria','cancel','notes']){
    let release;const f=fixture({run:()=>new Promise(resolve=>release=resolve)}),c=f.controls;const pending=c.$('stellation-enumerate').onclick();
    if(edit==='criteria'){c.$('stellation-criteria').value='custom';c.$('stellation-criteria').onchange();}if(edit==='cancel')c.cancelNumeric();if(edit==='notes')f.state.notes='changed';
    release(structuredClone(native.result));if(edit==='notes')await assert.rejects(pending,/notes|source/);else await pending;assert.equal(f.state.stellationSearch??null,null);
  }
});

test('Miller dispatch is desktop-whitelisted and eligible for warm read-only workers',()=>{
  assert.ok(pool.REUSABLE_OPERATIONS.has('stellation-miller-enumerate'));
  assert.match(readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8'),/allowed\.add\('stellation-miller-enumerate'\)/);
});
