import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {numericControlFixture,deferred} from './numeric-control-fixture.mjs';
import {ProjectOpening,RecoverySnapshots} from '../ui/project-workflow.mjs';
import {captureNativeSource,verifyNativeSource} from '../ui/native-source-binding.mjs';
import {DualMorphControls} from '../ui/dual-morph-controls.mjs';

const app=await readFile(new URL('../ui/app.js',import.meta.url),'utf8');
const camera=app.split('\n').filter(line=>line.startsWith('base.onCamera=')||line.startsWith('derived.onCamera=')).join('\n');
const edits=app.slice(app.indexOf('function markPlaybackDirty('),app.indexOf('function error('));
const serialize=app.split('\n').find(line=>line.startsWith('function serialize()'));
function fixture(){
  const f=numericControlFixture(Object.prototype,{}),notes={value:f.state.notes},counts={dirty:0,tabs:0,tours:0,morph:0,fit:0},opening=new ProjectOpening();
  const scope={state:f.context.getState,project:f.project,clone:structuredClone,revision:0,dirty:false,projectOpening:opening,
    imageCapture:null,base:{},derived:{},animation:{exporting:false},tourExporting:false,viewportControls:{orientation:{value:'vertex'}},
    projectionFit:{cancel:()=>counts.fit++},tours:{invalidatePreview:()=>counts.tours++},dualMorph:{sync:()=>counts.morph++},liveSliders:null,
    api:{setDirty:async value=>{assert.equal(value,true);counts.dirty++;}},renderTabs:()=>counts.tabs++,$:()=>notes,
    markDirty(){throw Error('Document-field input must not scan construction panels.');}};
  Object.assign(scope,new Function('scope',`with(scope){${edits}\n${camera}\n${serialize}\nreturn {editNotes,markViewDirty,serialize};}`)(scope));
  return {...f,scope,notes,counts,opening};
}

test('100 actual notes input events advance saved revisions without construction scans or repeated dirty IPC',()=>{
  const f=fixture(),model=structuredClone(f.state.model),view=structuredClone(f.state.view);
  assert.match(app,/\$\('notes'\)\.oninput=editNotes/);
  for(let i=1;i<=100;i++){f.notes.value='Edited notes '+i+' π';f.scope.editNotes();}
  assert.equal(f.scope.revision,100);assert.equal(f.scope.dirty,true);assert.equal(f.counts.dirty,1);assert.equal(f.counts.tabs,1);
  assert.equal(f.counts.tours,100);assert.equal(f.counts.morph,100);assert.equal(f.state.notes,'Edited notes 100 π');
  assert.deepEqual(f.state.model,model);assert.deepEqual(f.state.view,view);
  const saved=f.scope.serialize();assert.equal(saved.documents[0].states[0].notes,f.state.notes);assert.notStrictEqual(saved,f.project);
});

test('clearing notes is saved and repeated unchanged input does no work',()=>{
  const f=fixture();f.notes.value='';f.scope.editNotes();f.scope.editNotes();
  assert.equal(f.state.notes,'');assert.equal(f.scope.serialize().documents[0].states[0].notes,'');assert.equal(f.scope.revision,1);assert.equal(f.counts.morph,1);
});

for(const mode of ['animation','tour'])test(`queued notes edits during ${mode} export restore the input and change no document data`,()=>{
  const f=fixture(),before=structuredClone(f.state);if(mode==='animation')f.scope.animation.exporting=true;else f.scope.tourExporting=true;
  f.notes.value='Queued edit';f.scope.editNotes();assert.equal(f.notes.value,before.notes);assert.deepEqual(f.state,before);
  assert.equal(f.scope.revision,0);assert.deepEqual(f.counts,{dirty:0,tabs:0,tours:0,morph:0,fit:0});
});

test('input from an empty workspace has no mutation or bookkeeping',()=>{
  const f=fixture();f.scope.state=()=>undefined;f.scope.editNotes();assert.equal(f.scope.revision,0);assert.equal(f.scope.dirty,false);
});

test('camera-end callbacks save independent observer fields and retain source ownership',()=>{
  const f=fixture(),owner=captureNativeSource(f.context),before=structuredClone(f.state.model);
  f.scope.base.onCamera({zoom:3});f.scope.derived.onCamera({zoom:4});verifyNativeSource(f.context,owner);
  assert.deepEqual(f.state.view.camera,{zoom:3});assert.deepEqual(f.state.view.derivedCamera,{zoom:4});assert.equal(f.scope.viewportControls.orientation.value,'free');
  assert.equal(f.scope.revision,2);assert.equal(f.counts.fit,1);assert.equal(f.counts.dirty,1);assert.equal(f.counts.tours,2);assert.equal(f.counts.morph,0);assert.deepEqual(f.state.model,before);
  assert.match(app,/markPoseDirty:markViewDirty/);
});

test('notes edits still retire an obsolete prepared morph through actual DualMorphControls.sync',()=>{
  const f=fixture();let invalidated=0;
  const morph=new DualMorphControls(f.context,{mount:false});morph.owner=captureNativeSource(f.context);
  morph.invalidate=()=>{invalidated++;morph.owner=null;};f.scope.dualMorph=morph;
  f.notes.value='A new note';f.scope.editNotes();assert.equal(invalidated,1);assert.equal(morph.owner,null);
});

for(const mode of ['notes','camera'])test(`${mode} edits cancel an in-flight Open before it can replace the document`,async()=>{
  const f=fixture(),gate=deferred();let signal,published=false;
  const pending=f.opening.open({getProject:()=>f.scope.project,getRevision:()=>f.scope.revision,isExporting:()=>false,
    load:options=>{signal=options.signal;return gate.promise;},publish:()=>{published=true;}});
  if(mode==='notes'){f.notes.value='Current note';f.scope.editNotes();}else f.scope.base.onCamera({zoom:8});
  assert.equal(signal.aborted,true);gate.resolve({project:{}});await assert.rejects(pending,{name:'AbortError'});assert.equal(published,false);assert.equal(f.opening.busy,false);
});

test('recovery snapshots capture each changed field revision once and retry after subsequent edits',async()=>{
  const f=fixture(),writes=[],recovery=new RecoverySnapshots({getProject:()=>f.scope.project,getRevision:()=>f.scope.revision,
    shouldSave:()=>f.scope.dirty,snapshot:f.scope.serialize,write:async value=>{writes.push(value);return {path:'recovery.polyproj'};}});
  f.notes.value='Latest note';f.scope.editNotes();assert.equal(await recovery.save(),true);assert.equal(await recovery.save(),false);
  f.scope.derived.onCamera({zoom:2});assert.equal(await recovery.save(),true);assert.equal(writes.length,2);
  assert.equal(writes[0].documents[0].states[0].notes,'Latest note');assert.equal(writes[0].documents[0].states[0].view.derivedCamera,undefined);
  assert.deepEqual(writes[1].documents[0].states[0].view.derivedCamera,{zoom:2});
});
