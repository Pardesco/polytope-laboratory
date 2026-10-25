import test from 'node:test';
import assert from 'node:assert/strict';
import {memorySourceSignature} from '../ui/memory-source-signature.mjs';
import {MEMORY_LIMITS,storeMemory} from '../ui/model-memories.mjs';
import {captureNativeSource,verifyNativeSource} from '../ui/native-source-binding.mjs';

function fixture(){
  const model={id:'literal-source',fingerprint:'same-claimed-fingerprint',dimension:3,vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
    edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],metadata:{}},
    state={model,view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},notes:'literal notes'},
    document={id:'document',cursor:0,states:[state]},project={active:0,documents:[document]};
  return {model,state,document,context:{getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false}};
}
const source=f=>({documentId:f.document.id,modelId:f.model.id});
function compare(f){
  const entry=storeMemory(undefined,1,f.state,source(f)).slots[0],actual=memorySourceSignature(f.state,source(f));
  assert.equal(actual.modelSignature,JSON.stringify(entry.state.model));
  if(entry.state.notes===null||typeof entry.state.notes!=='object')assert.strictEqual(actual.notes,entry.state.notes);
  else assert.notStrictEqual(actual.notes,entry.state.notes);
}

test('signatures exactly match validated detached memory JSON across numeric, Unicode, key order and prototype-looking data',()=>{
  const f=fixture();f.model.metadata={numbers:[-0,1e-9,1e21,Number.MIN_VALUE,Number.MAX_VALUE],
    strings:['quotes " and backslash \\',String.fromCharCode(0),String.fromCharCode(0xd800),'\u20ac\ud83d\ude00'],
    omitted:undefined,shared:[{label:'one'},null,false,true]};
  for(const [key,value] of Object.entries(JSON.parse('{"10":"ten","2":"two","__proto__":{"literal":true},"constructor":"label"}')))
    Object.defineProperty(f.model.metadata,key,{enumerable:true,value});
  Object.defineProperty(f.model.metadata,'toJSON',{value:()=>assert.fail('Hidden toJSON executed'),enumerable:false});
  f.state.view.optional=undefined;compare(f);
  // Null-prototype records and repeated references have the same literal JSON
  // semantics as the existing clone, without treating aliases as cycles.
  const metadata=Object.assign(Object.create(null),f.model.metadata),shared={x:1};metadata.aliases=[shared,shared];f.model.metadata=metadata;compare(f);
  for(const notes of [undefined,null,'',false,123,{text:'object notes'},['array notes']]){f.state.notes=notes;compare(f);}
});

test('deterministic varied metadata matches the memory serializer, including nested records and arrays',()=>{
  let seed=120;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  function value(depth){
    const choice=next()%(depth?6:4);
    if(choice===0)return null;if(choice===1)return (next()-2**31)/10000;
    if(choice===2)return String.fromCharCode(next()%65536)+'"\\'+next();if(choice===3)return next()%2===0;
    if(choice===4)return Array.from({length:next()%6},()=>value(depth-1));
    const result={};for(let i=0,n=next()%6;i<n;i++)Object.defineProperty(result,'field-'+next(),{enumerable:true,value:value(depth-1)});return result;
  }
  const f=fixture();for(let i=0;i<200;i++){f.model.metadata={fixture:i,attributes:value(4)};compare(f);}
});

test('every full-model change invalidates the captured certificate even if caller IDs and validation claims stay fixed',()=>{
  for(const change of [f=>f.model.vertices[0][0]=.25,f=>f.model.edges.reverse(),f=>f.model.faces[0].reverse(),
    f=>f.model.metadata.color=[255,20,30,70],f=>f.model.metadata.texture={hash:'changed'},
    f=>f.model.metadata.extra=Object.assign(Object.create(null),{sameId:true}),f=>f.model.numeric={mode:'rational'},
    f=>f.model.validation={passed:true,certificate:'claimed'},f=>f.model.convexPieces=[structuredClone(f.model)]]){
    const f=fixture(),owner=captureNativeSource(f.context);change(f);assert.throws(()=>verifyNativeSource(f.context,owner),/changed/);
  }
  const f=fixture(),owner=captureNativeSource(f.context);f.model.metadata.ignored=undefined;verifyNativeSource(f.context,owner);
  const forged={...owner};assert.throws(()=>verifyNativeSource(f.context,forged),/source owner changed/);
  f.model.vertices[0][0]=3;owner.modelSignature=JSON.stringify(f.model);assert.throws(()=>verifyNativeSource(f.context,owner),/source owner changed/);
});

test('verification checks the entire state resource envelope, including independently changing view fields',()=>{
  const cases={
    cycle:f=>f.state.view.cycle=f.state,
    deep:f=>{let node=f.state.view;for(let i=0;i<=MEMORY_LIMITS.depth;i++)node=node.child={};},
    nonfinite:f=>f.state.view.invalid=Infinity,
    nonjson:f=>f.state.view.invalid=new Uint8Array([1]),
    bigint:f=>f.state.view.invalid=1n,
    symbol:f=>f.state.view[Symbol('invalid')]=1,
    sparse:f=>f.state.view.invalid=Array(2),
    arrayProperty:f=>{f.state.view.invalid=[1];f.state.view.invalid.custom=2;},
    nodes:f=>f.state.view.invalid=Array(MEMORY_LIMITS.nodesPerSlot+1),
    bytes:f=>f.state.view.invalid='x'.repeat(MEMORY_LIMITS.slotBytes+1),
    utf8:f=>f.state.view.invalid='\u20ac'.repeat(Math.ceil(MEMORY_LIMITS.slotBytes/3)),
  };
  for(const [name,change] of Object.entries(cases)){
    const f=fixture(),owner=captureNativeSource(f.context);change(f);
    assert.throws(()=>storeMemory(undefined,1,f.state,source(f)),name);
    assert.throws(()=>verifyNativeSource(f.context,owner),name);
  }
});

test('accessors in model IDs, metadata, unit fields, state and arrays are refused without invoking them',()=>{
  for(const target of ['model','id','metadata','unit','array']){
    for(const duringCapture of [false,true]){
      const f=fixture(),owner=duringCapture?null:captureNativeSource(f.context);let reads=0;
      const get=()=>{reads++;return 1;};
      if(target==='model')Object.defineProperty(f.state,'model',{enumerable:true,get});
      if(target==='id')Object.defineProperty(f.model,'id',{enumerable:true,get});
      if(target==='metadata')Object.defineProperty(f.model.metadata,'trap',{enumerable:true,get});
      if(target==='unit')Object.defineProperty(f.state.view,'coordinateUnit',{enumerable:false,get});
      if(target==='array'){f.state.view.values=[1];Object.defineProperty(f.state.view.values,'0',{get});}
      assert.throws(()=>duringCapture?captureNativeSource(f.context):verifyNativeSource(f.context,owner));assert.equal(reads,0,target);
    }
  }
});

test('capture still validates source incidence and each later check permits valid independent observer changes',()=>{
  for(const change of [f=>f.model.edges[0]=[0,99],f=>f.model.faces[0]=[0,1,99],f=>f.model.validation={passed:false}]){
    const f=fixture();change(f);assert.throws(()=>captureNativeSource(f.context));
  }
  const f=fixture(),owner=captureNativeSource(f.context);f.state.view={coordinateUnit:'mm',angles:[30,40,0,0,0,0],camera:{zoom:2}};
  f.state.label='Independent display label';verifyNativeSource(f.context,owner);
  f.state.notes={text:'new notes'};assert.throws(()=>verifyNativeSource(f.context,owner),/changed/);
});
