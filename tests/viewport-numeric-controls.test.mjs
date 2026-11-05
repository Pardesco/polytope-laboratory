import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewportControls} from '../ui/viewport-controls.mjs';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {holdObservationControls,transferObservationControls} from '../ui/observation-controls.mjs';

const source=()=>({id:'source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],metadata:{coordinateUnits:'mm'}});
function fixture(text='60/5'){
  const state={model:source(),notes:'retained',view:{rotationSpeed:12,angles:[0,0,0,0,0,0],camera:{zoom:2},coordinateUnit:'mm'}};
  const doc={id:'doc',states:[state],cursor:0};let project={documents:[doc],active:0},exporting=false;
  const calls=[],context={getProject:()=>project,getDocument:()=>project.documents[0],getState:()=>project.documents[0].states[0],
    isExporting:()=>exporting,evaluateMany:async()=>[12],markDirty:()=>calls.push('dirty')};
  const controls=Object.assign(Object.create(ViewportControls.prototype),{context,speed:{value:text}});
  return {controls,context,state,calls,replace:()=>project={...project},export:()=>exporting=true};
}
const deferred=()=>{let resolve;const promise=new Promise(a=>resolve=a);return {promise,resolve};};

function displayFixture(){
  const f=fixture(),nodes=new Map();
  Object.assign(f.state.model,{dimension:4,embeddingDimension:4,cells:[[0,1],[2,3]]});f.state.model.vertices=f.state.model.vertices.map(p=>[...p,0]);
  Object.assign(f.state.view,{projection:'orthographic',faces:true,vertices:false,fillRule:'nonzero',surfaceColors:'source',surfaceOpacity:.5,hiddenCells:[],isolatedCell:null});
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,dataset:{},options:[],setAttribute(){},querySelectorAll:()=>[]});return nodes.get(id);};
  Object.assign(f.context,{getModel:()=>f.state.model,getInput:node,display:()=>f.calls.push('display'),refreshDerived:()=>f.calls.push('derived'),
    cancelProjectionFit:()=>f.calls.push('cancel-fit'),requestProjectionFit:()=>f.calls.push('request-fit')});
  f.controls.sync=()=>f.calls.push('sync');f.controls.restoreDisplayInputs();return {...f,node};
}

test('view settings retain explicit values, derived refresh and projection fitting behavior',()=>{
  const f=displayFixture();f.controls.setDisplayOption('projection','perspective');assert.equal(f.state.view.projection,'perspective');assert.deepEqual(f.calls,['cancel-fit','display','sync','dirty','request-fit']);
  f.calls.length=0;f.controls.setDisplayOption('face-fill-rule','even-odd');assert.equal(f.state.view.fillRule,'even-odd');assert.deepEqual(f.calls,['display','sync','dirty','derived']);
  f.controls.setDisplayOption('faces-visible',false);assert.equal(f.state.view.presentation,'wireframe');assert.equal(f.node('faces-visible').checked,false);
  f.controls.setDisplayOption('vertices-visible',true);assert.equal(f.state.view.vertices,true);
  f.controls.setDisplayOption('surface-opacity','0.73');assert.equal(f.state.view.surfaceOpacity,.73);
  f.controls.setDisplayOption('faces-visible',true);assert.equal(f.state.view.presentation,'translucent');
  f.controls.setDisplayOption('surface-opacity','1');assert.equal(f.state.view.presentation,'solid');
  f.controls.setDisplayOption('surface-colors','cell');assert.equal(f.state.view.surfaceColors,'cell');
});

test('invalid view options restore applied fields and cannot mutate source or display',()=>{
  const cases=[['projection','unknown'],['faces-visible','false'],['vertices-visible',1],['face-fill-rule','bad'],['surface-colors','bad'],
    ['surface-opacity',''],['surface-opacity','NaN'],['surface-opacity','Infinity'],['surface-opacity','0.01'],['surface-opacity','1.1'],['__proto__',{}],['constructor',true]];
  for(const [id,value] of cases){const f=displayFixture(),before=structuredClone(f.state);f.node('surface-opacity').value='unapplied';
    assert.throws(()=>f.controls.setDisplayOption(id,value));assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);assert.equal(f.node('surface-opacity').value,'0.5');}
  const f=displayFixture();f.state.model.embeddingDimension=f.state.model.dimension=3;assert.throws(()=>f.controls.setDisplayOption('projection','perspective'),/available 4D/);
});

test('source cell visibility preserves literal indices and duplicate hiding, with complete reset',()=>{
  const f=displayFixture();f.controls.setCellVisibility('hide','1');f.controls.setCellVisibility('hide','1');assert.deepEqual(f.state.view.hiddenCells,[1]);
  f.controls.setCellVisibility('isolate','0');assert.equal(f.state.view.isolatedCell,0);assert.deepEqual(f.state.view.hiddenCells,[]);
  f.controls.setCellVisibility('all');assert.equal(f.state.view.isolatedCell,null);assert.deepEqual(f.state.view.hiddenCells,[]);
  for(const text of ['', ' ', '-1','1/2','1.0','1e0','2','9007199254740993']){
    const before=structuredClone(f.state);assert.throws(()=>f.controls.setCellVisibility('hide',text),/literal source/);assert.deepEqual(f.state,before);
  }
});

test('actual app view and visibility handlers cannot disturb an active export, even as queued events',async()=>{
  const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8'),f=displayFixture();
  const prefixes=["['face-fill-rule','surface-colors','surface-opacity'].forEach","['projection','faces-visible','vertices-visible'].forEach","$('isolate-cell').onclick=","$('hide-cell').onclick=","$('show-all-cells').onclick="];
  const lines=prefixes.map(prefix=>source.split('\n').find(line=>line.startsWith(prefix)));assert.ok(lines.every(Boolean));
  runInNewContext(lines.join('\n'),{$:f.node,guard:fn=>fn,viewportControls:f.controls});
  const before=structuredClone(f.state);f.export();
  for(const id of ['projection','faces-visible','vertices-visible','face-fill-rule','surface-colors','surface-opacity','isolate-cell','hide-cell','show-all-cells']){
    const node=f.node(id);node.value='changed-draft';node.checked=!node.checked;
    assert.throws(()=>node.onchange?node.onchange():node.onclick(),/export/);assert.deepEqual(f.state,before,id);
  }
  assert.deepEqual(f.calls,[]);assert.equal(f.node('projection').value,'orthographic');assert.equal(f.node('faces-visible').checked,true);
});

test('viewport synchronization disables direct view/cell inputs for export and respects source dimension',t=>{
  const f=displayFixture(),previous=globalThis.document;t.after(()=>{globalThis.document=previous;});
  globalThis.document={getElementById:f.node,body:{dataset:{}},querySelector:()=>({querySelectorAll:()=>[]})};
  for(const [key,id] of Object.entries({camera:'camera-projection',stereo:'stereo-mode',plane:'auto-rotation-plane',speed:'auto-rotation-speed',gesture:'four-dimensional-drag',gestureLabel:'drag-label',orientation:'view-orientation'}))f.controls[key]=f.node(id);
  f.controls.source=f.state;f.context.base={renderer:{domElement:{}}};f.controls.sync=ViewportControls.prototype.sync;
  f.controls.sync();assert.equal(f.node('projection').disabled,false);assert.equal(f.node('isolate-cell').disabled,false);
  f.export();f.controls.sync();
  for(const id of ['projection','faces-visible','vertices-visible','face-fill-rule','surface-colors','surface-opacity','visible-cell-id','isolate-cell','hide-cell','show-all-cells','selection-kind','selection-id','select-entity'])assert.equal(f.node(id).disabled,true,id);
  f.context.isExporting=()=>false;f.state.model.dimension=f.state.model.embeddingDimension=3;f.state.model.cells=[];f.controls.sync();
  assert.equal(f.node('projection').disabled,true);assert.equal(f.node('hide-cell').disabled,true);assert.equal(f.node('faces-visible').disabled,false);
});

test('reset retains its camera behavior when editable and cannot move either camera during export',()=>{
  const f=displayFixture();let baseResets=0,derivedResets=0;
  f.context.base={reset:()=>baseResets++,cameraState:()=>({zoom:1})};f.context.derived={reset:()=>derivedResets++,cameraState:()=>({zoom:2})};
  f.controls.resetView();assert.equal(baseResets,1);assert.equal(derivedResets,1);assert.deepEqual(f.state.view.camera,{zoom:1});assert.deepEqual(f.state.view.derivedCamera,{zoom:2});
  f.calls.length=0;f.export();const before=structuredClone(f.state);assert.throws(()=>f.controls.resetView(),/export/);
  assert.deepEqual(f.state,before);assert.equal(baseResets,1);assert.equal(derivedResets,1);assert.deepEqual(f.calls,[]);
});

test('actual source-selection path refuses highlight changes during export and restores the applied source ID',async()=>{
  const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8'),start=source.indexOf('function selectEntity('),end=source.indexOf('function serialize(',start);
  const f=displayFixture();f.state.view.entitySelection={kind:'edge',index:1};f.node('selection-kind').value='face';f.node('selection-id').value='0';f.export();
  const before=structuredClone(f.state),scope={viewportControls:f.controls,$:f.node,model:()=>f.state.model,state:()=>f.state,
    base:{select(){throw Error('Capture highlight must not change');}},displayBase(){throw Error('Export display must not change');},markDirty(){throw Error('Export state must not change');}};
  runInNewContext(source.slice(start,end),scope);scope.selectEntity();
  assert.deepEqual(f.state,before);assert.equal(f.node('selection-kind').value,'edge');assert.equal(f.node('selection-id').value,'1');
});

test('queued camera-end callbacks during either export cannot persist transient capture cameras',async()=>{
  const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8'),lines=['base.onCamera=','derived.onCamera='].map(prefix=>source.split('\n').find(line=>line.startsWith(prefix)));
  assert.ok(lines.every(Boolean));const f=displayFixture(),base={},derived={},animation={exporting:true};
  const scope={base,derived,animation,tourExporting:false,state:()=>f.state,viewportControls:{orientation:{}},projectionFit:{cancel:()=>f.calls.push('cancel-fit')},markViewDirty:()=>f.calls.push('dirty')};
  runInNewContext(lines.join('\n'),scope);const before=structuredClone(f.state);
  base.onCamera({zoom:5});derived.onCamera({zoom:6});assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
  animation.exporting=false;scope.tourExporting=true;base.onCamera({zoom:7});derived.onCamera({zoom:8});assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
  scope.tourExporting=false;base.onCamera({zoom:1});derived.onCamera({zoom:2});assert.deepEqual(f.state.view.camera,{zoom:1});assert.deepEqual(f.state.view.derivedCamera,{zoom:2});assert.deepEqual(f.calls,['cancel-fit','dirty','dirty']);
});

test('ending a 4D drag cannot release a nested capture lock or touch an unrelated camera',()=>{
  for(const replacement of ['related','independent']){
    const cameraControls=()=>({enabled:true,enableDamping:true,update(){}}),base={controls:cameraControls()},f=displayFixture();
    const dragLock=holdObservationControls([base]),captureLock=holdObservationControls([base]);
    const previous=base.controls;base.controls=cameraControls();
    if(replacement==='related')assert.equal(transferObservationControls(previous,base.controls),true);
    else{base.controls.enabled=false;base.controls.enableDamping=false;}
    let released=0;f.controls.drag={pointer:7,observation:dragLock,canvas:{hasPointerCapture:id=>id===7,releasePointerCapture:()=>released++}};
    f.controls.endDrag();assert.equal(f.controls.drag,null);assert.equal(released,1);assert.equal(base.controls.enabled,false);assert.equal(base.controls.enableDamping,false);
    captureLock.release();assert.equal(base.controls.enabled,replacement==='related');assert.equal(base.controls.enableDamping,replacement==='related');
    f.controls.endDrag();assert.equal(released,1);
  }
});

test('a queued 4D pointer move after export starts releases its drag without changing the view',async()=>{
  const source=await readFile(new URL('../ui/viewport-controls.mjs',import.meta.url),'utf8'),match=source.match(/canvas\.addEventListener\('pointermove',event=>\{([\s\S]*?)\n    \},true\);/);
  assert.ok(match);const f=displayFixture(),base={controls:{enabled:true,enableDamping:true,update(){}}};f.context.base=base;
  f.controls.drag={source:f.state,pointer:7,x:0,y:0,angles:[...f.state.view.angles],observation:holdObservationControls([base])};
  f.export();const before=structuredClone(f.state);
  const handler=new Function('event',match[1]);handler.call(f.controls,{pointerId:7,clientX:30,clientY:40,stopImmediatePropagation(){},preventDefault(){}});
  assert.deepEqual(f.state,before);assert.equal(f.controls.drag,null);assert.equal(base.controls.enabled,true);assert.deepEqual(f.calls,[]);
});
test('expression speed edits preserve independently advancing rotation and latest observer',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.controls.editSpeed();f.state.view.angles[2]=43;f.state.view.camera.zoom=5;
  hold.resolve([-24]);await pending;
  assert.equal(f.state.view.rotationSpeed,-24);assert.equal(f.controls.speed.value,'-24');
  assert.equal(f.state.view.angles[2],43);assert.equal(f.state.view.camera.zoom,5);assert.deepEqual(f.calls,['dirty']);
});
test('failed/native overbudget speed leaves original state untouched',async()=>{
  for(const value of [181,-181,NaN,Infinity]){
    const f=fixture();f.context.evaluateMany=async()=>[value];const before=structuredClone(f.state);
    await assert.rejects(f.controls.editSpeed());assert.deepEqual(f.state,before);assert.deepEqual(f.calls,[]);
  }
});
test('speed text/config/source/units/project/export changes invalidate held results',async()=>{
  for(const change of [f=>f.controls.speed.value='25',f=>f.state.view.rotationSpeed=30,
    f=>f.state.model.vertices[0][0]=.2,f=>f.state.view.coordinateUnit='in',f=>f.state.notes='new',f=>f.replace(),f=>f.export()]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.editSpeed();
    change(f);hold.resolve([24]);await assert.rejects(pending);assert.ok(!f.calls.length);
  }
});
test('speed cancellation refuses ignored native result and clears current edit',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;const pending=f.controls.editSpeed();
  f.controls.cancelNumeric();await assert.rejects(pending,{name:'AbortError'});hold.resolve([24]);
  assert.equal(f.controls.numericEntry,null);assert.deepEqual(f.calls,[]);
});
