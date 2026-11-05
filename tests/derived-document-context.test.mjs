import {defaultDocumentView} from '../ui/default-look.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {MemoryControls} from '../ui/memory-controls.mjs';
import {retrieveMemory,storeMemory} from '../ui/model-memories.mjs';
import {GeometryExportSession} from '../ui/geometry-export-session.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
const sourceModel=JSON.parse(await readFile(new URL('./fixtures/element-content-native-fixture.json',import.meta.url),'utf8')).source;
function native(requests){
  const input=requests.map((request,index)=>JSON.stringify({...request,id:'derived-context-'+index})).join('\n')+'\n';
  const lines=execFileSync(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],{cwd:root,input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,
    env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}}).trim().split(/\r?\n/).map(JSON.parse);
  for(const result of lines)assert.equal(result.ok,true,result.error);return lines.map(result=>result.result);
}
const [dual,section,surface]=native([{op:'dual',model:sourceModel,params:{}},{op:'section',model:sourceModel,params:{normal:[0,0,1],offset:.25}},
  {op:'section',model:{...sourceModel,interpretation:'generalized-complex'},params:{normal:[0,0,1],offset:.25,fill_rule:'even-odd'}}]);
const defaultsCode=app.slice(app.indexOf('const defaults='),app.indexOf('let project='));
const documentCode=app.slice(app.indexOf('function initialDocumentState('),app.indexOf('async function commitOperation('));
const derivedCode=app.slice(app.indexOf('function availableDerivedModel('),app.indexOf('function syncCancelAvailability('));
function fixture(model=dual){
  const defaults=new Function('defaultDocumentView',defaultsCode+';return defaults;')(defaultDocumentView);
  const source={model:structuredClone(sourceModel),view:{...defaults(3),coordinateUnit:'cm',fillRule:'even-odd',surfaceColors:'face',
    documentMetadata:{title:'Original title',author:'Randall',reference:'Source reference',description:'Preserve this description'}},notes:'Source notes π'};
  const project={format:'polytope-laboratory',version:1,active:0,documents:[{id:'original',cursor:0,states:[source]}]};
  const calls={dirty:0,navigation:0,promote:[]};let id=0;
  const scope={project,defaults,clone:structuredClone,uid:()=>`context-document-${++id}`,toastTimer:null,$:()=>({hidden:false}),
    state:()=>project.documents[project.active].states[project.documents[project.active].cursor],derivedControls:{pending:null},derivedModel:structuredClone(model),derivedResult:section,
    animation:{exporting:false},tourExporting:false,catalogLoader:{navigationChanged:()=>calls.navigation++},markDirty:()=>calls.dirty++,renderWorkspace(){},renderTabs(){},
    ordinaryCellSections:{promote:result=>{calls.promote.push(result);return 'native section history';}}};
  Object.assign(scope,new Function('scope',`with(scope){${documentCode}${derivedCode}\nreturn {initialDocumentState,addDocument,derivedStateSnapshot,promoteDerivedView};}`)(scope));
  return {scope,source,project,calls};
}

for(const [mode,model] of [['dual',dual],['section',section.model]])test(`promoted ${mode} retains source units, notes, metadata and display semantics without changing geometry`,()=>{
  const f=fixture(model);f.source.view.derivedMode=mode;const before=structuredClone(f.source),geometry=structuredClone(f.scope.derivedModel);
  const promoted=f.scope.promoteDerivedView();
  assert.equal(promoted.view.coordinateUnit,'cm');assert.equal(promoted.notes,'Source notes π');assert.deepEqual(promoted.view.documentMetadata,before.view.documentMetadata);
  assert.equal(promoted.view.fillRule,'even-odd');assert.equal(promoted.view.surfaceColors,'face');assert.deepEqual(promoted.model,geometry);
  assert.notEqual(promoted.model,f.scope.derivedModel);assert.deepEqual(f.source,before);assert.equal(f.project.active,1);assert.equal(f.calls.dirty,1);
  promoted.view.documentMetadata.author='Changed';promoted.model.vertices[0][0]+=1;assert.equal(f.source.view.documentMetadata.author,'Randall');assert.deepEqual(f.scope.derivedModel,geometry);
});

test('derived memory uses the same document context and remains detached on retrieval',async()=>{
  const f=fixture(section.model),control=Object.assign(Object.create(MemoryControls.prototype),{busy:false,nodes:{slot:{value:'1'},source:{value:'derived'}},sync(){},
    context:{getProject:()=>f.project,getState:()=>f.source,getDerivedState:f.scope.derivedStateSnapshot,getSource:()=>({documentId:'original',derivedMode:'section'}),
      isExporting:()=>false,markDirty(){},setStatus(){}}});
  await control.store(1);const memory=retrieveMemory(f.project.memories,1);
  assert.equal(memory.view.coordinateUnit,'cm');assert.equal(memory.notes,f.source.notes);assert.deepEqual(memory.view.documentMetadata,f.source.view.documentMetadata);
  memory.view.documentMetadata.author='Edited';memory.model.vertices[0][0]=123;const again=retrieveMemory(f.project.memories,1);
  assert.equal(again.view.documentMetadata.author,'Randall');assert.deepEqual(again.model,section.model);
  assert.match(app,/getDerivedState:derivedStateSnapshot/);assert.match(app,/promote:promoteDerivedView/);
});

test('source unit fallback and cleared document context override derived model import hints',()=>{
  const f=fixture();delete f.source.view.coordinateUnit;f.source.model.metadata.coordinateUnits='in';delete f.source.view.documentMetadata;f.source.notes='';
  f.scope.derivedModel.metadata={...f.scope.derivedModel.metadata,coordinateUnits:'mm',documentMetadata:{title:'Stale model title'},documentNotes:'Stale model notes'};
  const promoted=f.scope.promoteDerivedView();assert.equal(promoted.view.coordinateUnit,'in');assert.equal(promoted.notes,'');assert.equal(promoted.view.documentMetadata,undefined);
});

test('unknown legacy model unit metadata cannot create an unsupported saved unit',()=>{
  const f=fixture();delete f.source.view.coordinateUnit;f.source.model.metadata.coordinateUnits='unsupported-legacy-unit';
  assert.equal(f.scope.derivedStateSnapshot().view.coordinateUnit,'model');assert.equal(f.scope.promoteDerivedView().view.coordinateUnit,'model');
});

test('new geometry receives dimensional defaults and does not acquire source-bound cameras, indices or annotations',()=>{
  const f=fixture(section.model);f.source.view.camera={position:[1,2,3]};f.source.view.entitySelection={kind:'cell',index:5};
  f.source.view.elementAnnotations={sourceBound:'original'};f.source.view.orientationFrame={sourceBound:'original'};
  const promoted=f.scope.promoteDerivedView();assert.equal(promoted.model.dimension,2);assert.equal(promoted.view.sectionNormal.length,2);assert.equal(promoted.view.derivedMode,'dual');
  for(const field of ['camera','entitySelection','elementAnnotations','orientationFrame'])assert.equal(promoted.view[field],undefined);
  assert.deepEqual(f.source.view.elementAnnotations,{sourceBound:'original'});
});

test('surface-intersection promotion and memory snapshots retain the source-evidence default',()=>{
  assert.equal(surface.model.interpretation,'surface-section');assert.equal(surface.model.faces.length,0);
  const f=fixture(surface.model),memory=f.scope.derivedStateSnapshot(),promoted=f.scope.promoteDerivedView();
  assert.equal(memory.view.derivedMode,'section-evidence');assert.equal(promoted.view.derivedMode,'section-evidence');
  assert.equal(memory.view.coordinateUnit,'cm');assert.equal(promoted.notes,f.source.notes);assert.deepEqual(promoted.model,surface.model);
});

test('ordinary cell sections retain the native history promotion path',()=>{
  const f=fixture();f.source.view.derivedMode='cell-section';assert.equal(f.scope.promoteDerivedView(),'native section history');
  assert.equal(f.calls.promote.length,1);assert.equal(f.calls.promote[0],f.scope.derivedResult);assert.equal(f.project.documents.length,1);
});

for(const unavailable of ['model','pending','animation','tour','capacity'])test(`promotion refuses ${unavailable} before modifying documents`,()=>{
  const f=fixture();
  if(unavailable==='model')f.scope.derivedModel=null;if(unavailable==='pending')f.scope.derivedControls.pending={};
  if(unavailable==='animation')f.scope.animation.exporting=true;if(unavailable==='tour')f.scope.tourExporting=true;
  if(unavailable==='capacity')while(f.project.documents.length<100)f.project.documents.push({id:`other-${f.project.documents.length}`,cursor:0,states:[f.source]});
  const count=f.project.documents.length;assert.throws(()=>f.scope.promoteDerivedView());assert.equal(f.project.documents.length,count);assert.equal(f.calls.dirty,0);assert.equal(f.calls.navigation,0);
});

test('ordinary imports/catalog adds retain their own metadata/defaults and activation behavior',()=>{
  const f=fixture(),model=structuredClone(dual);model.metadata={coordinateUnits:'ft',documentMetadata:{title:'Imported'},documentNotes:'Imported notes'};
  const added=f.scope.addDocument(model,'Import',{activate:false,catalog:true});assert.equal(added.view.coordinateUnit,'ft');assert.equal(added.notes,'Imported notes');
  assert.deepEqual(added.view.documentMetadata,{title:'Imported'});assert.equal(added.view.fillRule,'nonzero');assert.equal(f.project.active,0);assert.equal(f.calls.navigation,0);
});

test('the common document append refuses a full workspace before navigation or dirty changes',()=>{
  const f=fixture();while(f.project.documents.length<100)f.project.documents.push({id:`full-${f.project.documents.length}`,cursor:0,states:[f.source]});
  for(const options of [{},{catalog:true},{activate:false}])assert.throws(()=>f.scope.addDocument(structuredClone(dual),'Import',options),/100 documents/);
  assert.equal(f.project.documents.length,100);assert.equal(f.calls.dirty,0);assert.equal(f.calls.navigation,0);
});

test('native Save/Open and geometry export retain promoted context and apply the declared physical scale',async t=>{
  const f=fixture(section.model);f.source.view.derivedMode='section';f.project.memories=storeMemory(undefined,1,f.scope.derivedStateSnapshot(),{documentId:'original',derivedMode:'section'});
  const promoted=f.scope.promoteDerivedView();
  const folder=await mkdtemp(path.join(os.tmpdir(),'polytope-derived-context-'));t.after(async()=>{
    assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep+'polytope-derived-context-'));await rm(folder,{recursive:true,force:true});
  });const file=path.join(folder,'promoted.polyproj');
  const [,loaded]=native([{op:'save',params:{path:file,project:f.project}},{op:'load',params:{path:file}}]);
  const reopened=loaded.project.documents[1].states[0];assert.equal(reopened.view.coordinateUnit,'cm');assert.equal(reopened.notes,promoted.notes);assert.deepEqual(reopened.view.documentMetadata,promoted.view.documentMetadata);
  const memory=retrieveMemory(loaded.project.memories,1);assert.equal(memory.view.coordinateUnit,'cm');assert.equal(memory.notes,promoted.notes);assert.deepEqual(memory.view.documentMetadata,promoted.view.documentMetadata);
  const session=new GeometryExportSession({getProject:()=>loaded.project,getDocument:()=>loaded.project.documents[1],getState:()=>reopened,isExporting:()=>false,
    getGeometry:()=>reopened.model,getSelection:()=>({source:'base',format:'json',unit:'mm'}),
    describe:async model=>native([{op:'export-options',model,params:{}}])[0],prepare:async(model,params)=>native([{op:'prepare-export',model,params}])[0]});
  const exported=await session.prepare();
  assert.deepEqual(reopened.model.vertices,promoted.model.vertices);assert.equal(exported.report.sourceUnit,'cm');assert.equal(exported.report.targetUnit,'mm');
  const json=JSON.parse(exported.text);assert.equal(json.metadata.documentNotes,promoted.notes);assert.deepEqual(json.metadata.documentMetadata,promoted.view.documentMetadata);
  for(let i=0;i<json.vertices.length;i++)for(let axis=0;axis<json.vertices[i].length;axis++)assert.ok(Math.abs(json.vertices[i][axis]-promoted.model.vertices[i][axis]*10)<1e-10);
});

test('native Save/Open, base and derived JSON exports never resurrect cleared imported notes or metadata',async t=>{
  const f=fixture();f.source.model.metadata.documentNotes='Old imported notes';f.source.model.metadata.documentMetadata={title:'Old imported title'};
  f.source.notes='';delete f.source.view.documentMetadata;
  f.scope.derivedModel.metadata.documentNotes='Old derived notes';f.scope.derivedModel.metadata.documentMetadata={title:'Old derived title'};
  const folder=await mkdtemp(path.join(os.tmpdir(),'polytope-derived-context-'));t.after(async()=>{
    assert.ok(path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep+'polytope-derived-context-'));await rm(folder,{recursive:true,force:true});
  });
  const file=path.join(folder,'cleared.polyproj');
  const [,loaded]=native([{op:'save',params:{path:file,project:f.project}},{op:'load',params:{path:file}}]);
  const document=loaded.project.documents[0],state=document.states[0];assert.equal(state.notes,'');assert.equal(state.view.documentMetadata,undefined);
  for(const source of ['base','derived']){
    const geometry=source==='base'?state.model:f.scope.derivedModel,before=structuredClone(geometry);
    const session=new GeometryExportSession({getProject:()=>loaded.project,getDocument:()=>document,getState:()=>state,isExporting:()=>false,
      getGeometry:()=>geometry,getSelection:()=>({source,format:'json',unit:'cm'}),
      describe:async model=>native([{op:'export-options',model,params:{}}])[0],prepare:async(model,params)=>native([{op:'prepare-export',model,params}])[0]});
    const exported=JSON.parse((await session.prepare()).text);
    assert.equal(exported.metadata.documentNotes,'');assert.deepEqual(exported.metadata.documentMetadata,{});assert.deepEqual(geometry,before);
    const imported=f.scope.initialDocumentState(exported,'Import');assert.equal(imported.notes,'');assert.deepEqual(imported.view.documentMetadata,{});
  }
});
