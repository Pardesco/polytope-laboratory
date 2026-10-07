import test from 'node:test';
import assert from 'node:assert/strict';
import {captureNativeSource,verifyNativeSource} from '../ui/native-source-binding.mjs';

const source=()=>({id:'literal-tetra',dimension:3,embeddingDimension:3,
  vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
  edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],
  metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'byte',values:[11,22,33,127]},null,null,null],cells:[]},
    offlineAsset:{relativePath:'local.png',hash:'original'},attributes:{literal:[1,2,3]}},
  numeric:{mode:'float64-approximate',certified:false}});
function fixture(){
  const state={model:source(),view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0]},notes:'Original notes'},
    doc={id:'document-1',cursor:0,states:[state]};
  let project={id:'project-1',active:0,documents:[doc]},exporting=false;
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],
    getState:()=>context.getDocument()?.states[context.getDocument().cursor],isExporting:()=>exporting};
  return {state,doc,context,get project(){return project;},setProject:value=>project=value,setExport:value=>exporting=value};
}

test('capture retains stable owner pointers and detached full model signature without source mutations',()=>{
  const f=fixture(),before=structuredClone(f.project),owner=captureNativeSource(f.context);
  assert.equal(owner.project,f.project);assert.equal(owner.document,f.doc);assert.equal(owner.state,f.state);
  assert.equal(owner.cursor,0);assert.equal(owner.notes,'Original notes');assert.equal(owner.unit,'mm');
  assert.deepEqual(JSON.parse(owner.modelSignature),f.state.model);assert.deepEqual(f.project,before);
  verifyNativeSource(f.context,owner);
  f.state.model.metadata.offColors.faces[0].values[3]=0;
  assert.equal(JSON.parse(owner.modelSignature).metadata.offColors.faces[0].values[3],127);
});

test('full geometry, ordered incidence, RGBA, units, IDs and historical metadata changes invalidate ownership',()=>{
  const changes=[f=>f.state.model.id='replacement',f=>f.state.model.vertices[1][0]=2,
    f=>f.state.model.faces[0].reverse(),f=>f.state.model.edges[0].reverse(),
    f=>f.state.model.metadata.offColors.faces[0].values[3]=126,
    f=>f.state.model.metadata.offColors.faces[0].encoding='unit',
    f=>f.state.model.metadata.coordinateUnits='cm',
    f=>f.state.model.metadata.offlineAsset.hash='changed',f=>f.state.model.metadata.attributes.literal.push(4),
    f=>f.state.model.numeric.certified=true,f=>f.state.notes='Edited notes',f=>f.state.view.coordinateUnit='cm'];
  for(const change of changes){const f=fixture(),owner=captureNativeSource(f.context);change(f);
    assert.throws(()=>verifyNativeSource(f.context,owner),/source, units, notes, or attributes changed/);}
});

test('project/document/state reference replacement and active cursor changes reject equal-looking sources',()=>{
  const changes=[f=>f.setProject({...f.project}),f=>f.project.documents[0]={...f.doc},
    f=>f.doc.id='changed-document-id',f=>f.doc.states=[...f.doc.states],
    f=>f.doc.states[0]={...f.state},
    f=>{f.doc.states.push(structuredClone(f.state));f.doc.cursor=1;},
    f=>{f.project.documents.push(structuredClone(f.doc));f.project.active=1;}];
  for(const change of changes){const f=fixture(),owner=captureNativeSource(f.context);change(f);
    assert.throws(()=>verifyNativeSource(f.context,owner),/changed/);}
});

test('camera, rotation, view replacement and unrelated documents do not invalidate geometric ownership',()=>{
  const f=fixture(),owner=captureNativeSource(f.context);
  f.state.view={coordinateUnit:'mm',angles:[32,0,0,0,0,0],camera:{projection:'perspective',zoom:2}};
  f.state.label='Renamed display label';f.project.documents.push(structuredClone(f.doc));
  f.project.documents[1].states[0].notes='Unrelated document edit';
  verifyNativeSource(f.context,owner);
});

test('unit fallback binds absent view unit to model metadata and preserves literal notes',()=>{
  const f=fixture();delete f.state.view.coordinateUnit;
  assert.equal(captureNativeSource(f.context).unit,'mm');
  delete f.state.model.metadata.coordinateUnits;
  assert.equal(captureNativeSource(f.context).unit,'model');
  delete f.state.notes;
  const owner=captureNativeSource(f.context);
  assert.equal(owner.notes,undefined);verifyNativeSource(f.context,owner);
  f.state.notes='';assert.throws(()=>verifyNativeSource(f.context,owner),/changed/);
});

test('export rejects initial capture and publication; missing source rejects explicitly',()=>{
  const f=fixture(),owner=captureNativeSource(f.context);f.setExport(true);
  assert.throws(()=>captureNativeSource(f.context),/Finish animation export/);
  assert.throws(()=>verifyNativeSource(f.context,owner),/cannot publish during animation export/);
  f.setExport(false);verifyNativeSource(f.context,owner);
  f.project.documents=[];
  assert.throws(()=>captureNativeSource(f.context),/Choose a source model/);
});

test('bounded source snapshot rejects cycles, deep structures and accessors without executing attributes',()=>{
  for(const mode of ['cycle','deep','accessor']){
    const f=fixture();let reads=0;
    if(mode==='cycle')f.state.model.metadata.cycle=f.state.model;
    if(mode==='deep'){let node={};f.state.model.metadata.deep=node;for(let i=0;i<70;i++)node=node.next={};}
    if(mode==='accessor')Object.defineProperty(f.state.model.metadata,'secret',{enumerable:true,get(){reads++;return 'bad';}});
    assert.throws(()=>captureNativeSource(f.context));assert.equal(reads,0);
  }
});
