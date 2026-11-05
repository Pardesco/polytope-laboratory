import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FaceConwayControls,axisIds} from '../ui/face-conway-controls.mjs';
import {SphereProjectionControls} from '../ui/sphere-projection-controls.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';

const fixture=()=>numericControlFixture(FaceConwayControls.prototype,{
  'face-method':'kis','face-height':'1/2','conway-notation':'tI','conway-height':'',
  'zone-fold':'3','zone-axis-ids':'','zone-length':'sqrt(4)','zone-directions':'1,1,1\n0,1,1',
  'subdivide-faces':'','conway-apply':'','zone-inspect-axes':'','zone-from-axes':'','zone-add':'',
  'face-conway-status':'','face-conway-cancel':''});

test('face refinement evaluates height and commits a guarded history operation',async()=>{
  const f=fixture();await f.control.apply('faces');
  assert.deepEqual(f.calls,[['subdivide-faces',{method:'kis',height:.5},'Subdivide faces']]);
  assert.deepEqual(f.expressionCalls[0].parts,['1/2']);assert.ok(f.options[0].signal);
  for(const method of ['centroid','midpoint']){
    const g=fixture();g.nodes['face-method'].value=method;await g.control.apply('faces');
    assert.deepEqual(g.calls[0][1],{method});
  }
});

test('six Conway actions and notation use the current native recipe workflow',async()=>{
  for(const action of ['d','a','k','t','j','e','notation']){
    const f=fixture();await f.control.apply(action);
    assert.deepEqual(f.calls,[['conway',{notation:action==='notation'?'tI':action},'Conway operators']]);
  }
  const f=fixture();f.nodes['conway-notation'].value='kC';f.nodes['conway-height'].value='1/2';await f.control.apply('notation');
  assert.deepEqual(f.calls[0][1],{notation:'kC',height:.5});
  for(const text of ['sC','a C','x','']){
    const g=fixture();g.nodes['conway-notation'].value=text;await assert.rejects(g.control.apply('notation'),/Use d/);assert.equal(g.calls.length,0);
  }
});

test('axis construction supports all of type or explicit literal IDs and expressions for lengths',async()=>{
  const f=fixture();await f.control.apply('axes');
  assert.deepEqual(f.calls[0],[ 'axis-zonohedron',{axis_ids:null,fold:3,edge_length:2},'Symmetry-axis zones']);
  const g=fixture();g.nodes['zone-axis-ids'].value='3, 1, 0';await g.control.apply('axes');
  assert.deepEqual(g.calls[0][1].axis_ids,[3,1,0]);
  for(const raw of ['1/2','sqrt(4)','1,1','-1','9007199254740993'])assert.throws(()=>axisIds(raw));
  assert.equal(axisIds(' '),null);
});

test('zone additions evaluate XYZ expressions and preserve ordered direction rows',async()=>{
  const f=fixture();await f.control.apply('add');
  assert.deepEqual(f.calls[0],['add-zones',{directions:[[1,1,1],[0,1,1]],edge_length:2},'Add zones']);
  const g=fixture();g.nodes['zone-directions'].value='';await assert.rejects(g.control.apply('add'),/XYZ/);
});

test('axis inspection uses a guarded read operation and reports axis IDs and residual',async()=>{
  const f=fixture();let read;
  f.context.run=async(...args)=>{read=args;return {count:4,maximumAxisResidual:1e-15,axes:[[1,1,1]]};};
  await f.control.apply('inspect');assert.equal(read[0],'symmetry-axes');assert.deepEqual(read[1],{fold:3});
  assert.equal(read[2].id,f.state.model.id);assert.ok(read[4].signal);assert.equal(f.calls.length,0);
  assert.match(f.nodes['face-conway-status'].textContent,/4 axes; residual/);
  assert.match(f.nodes['face-conway-status'].textContent,/0: 1.00000/);
});

test('all controls fence source, field and export edits across numeric and native awaits',async()=>{
  for(const mutate of [f=>f.nodes['face-method'].value='midpoint',f=>f.state.notes='Edited',
    f=>f.state.model.vertices[0][0]=.2,f=>f.setExport(true)]){
    const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;
    const pending=f.control.apply('faces');mutate(f);hold.resolve([.5]);await assert.rejects(pending);
    assert.equal(f.calls.length,0);assert.equal(f.control.busy,false);
  }
  const f=fixture(),hold=deferred();let published=false;
  f.context.commit=async(op,params,label,options)=>{await hold.promise;options.verifyPublication();published=true;return f.result;};
  const pending=f.control.apply('axes');await flush();f.nodes['zone-axis-ids'].value='0,1,2';hold.resolve();
  await assert.rejects(pending,/target fields changed/);assert.equal(published,false);
});

test('busy, export and cancellation refuse publication, then allow retry',async()=>{
  const f=fixture(),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.control.apply('faces');await assert.rejects(f.control.apply('faces'),/current construction/);
  f.control.cancel();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.control.busy,false);
  f.setExport(true);await assert.rejects(f.control.apply('a'),/export/);
});

const sphereFixture=()=>numericControlFixture(SphereProjectionControls.prototype,{
  'sphere-project-center':'','sphere-project-radius':'','sphere-project-sphere':'circumsphere',
  'sphere-project-status':'','sphere-project-apply':'','sphere-project-cancel':''});

test('named sphere choices enter history and projection reports edge dispersion',async()=>{
  const f=sphereFixture();f.context.commit=async(op,params,label,options)=>{
    options.verifyPublication();f.calls.push([op,params]);return {states:[{model:{metadata:{sphereProjection:{edgeVariation:{maxMinRatio:1.130826,coefficientOfVariation:.061397}}}}}],cursor:0};
  };
  await f.control.apply();assert.deepEqual(f.calls,[['sphere-project',{sphere:'circumsphere'}]]);
  assert.match(f.nodes['sphere-project-status'].textContent,/1.130826/);assert.match(f.nodes['sphere-project-status'].textContent,/6.1397%/);
});

test('explicit projection remains compatible and changes to sphere choice discard pending work',async()=>{
  const f=sphereFixture();f.nodes['sphere-project-sphere'].value='';f.nodes['sphere-project-radius'].value='sqrt(4)';await f.control.apply();
  assert.deepEqual(f.calls[0][1],{center:null,radius:2});
  const g=sphereFixture(),hold=deferred();g.context.evaluateMany=()=>hold.promise;const pending=g.control.apply();
  g.nodes['sphere-project-sphere'].value='insphere';hold.resolve([0]);await assert.rejects(pending);assert.equal(g.calls.length,0);
});

test('app mounts controls in Construct operations, syncs and cancels them; read axes reuse workers',async()=>{
  const [app,controls,main,pool]=await Promise.all(['ui/app.js','ui/face-conway-controls.mjs','desktop/main.cjs','desktop/engine-pool.cjs'].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
  assert.match(app,/new FaceConwayControls/);assert.match(app,/faceConwayControls\?\.sync\(\)/);
  assert.match(app,/for\(const control of \[faceConwayControls,/);
  assert.match(controls,/getElementById\('truncate'\)\.after\(panel\)/);
  for(const op of ['subdivide-faces','conway','axis-zonohedron','add-zones','symmetry-axes'])assert.ok(main.includes("'"+op+"'"));
  assert.match(pool,/REUSABLE_OPERATIONS.add\('symmetry-axes'\)/);
});

test('constructor mounts a closed Construct disclosure and binds all visible actions',async()=>{
  const old=globalThis.document,f=fixture();let html,mounted,guards=0;
  for(const op of ['d','a','k','t','j','e'])f.nodes['conway-'+op]={value:'',dataset:{conway:op}};
  const panel={...f.panel,open:false,set innerHTML(value){html=value;},
    querySelectorAll:selector=>selector==='[data-conway]'?['d','a','k','t','j','e'].map(op=>f.nodes['conway-'+op]):Object.values(f.nodes)};
  globalThis.document={createElement:tag=>{assert.equal(tag,'details');return panel;},
    getElementById:id=>{assert.equal(id,'truncate');return {after:value=>mounted=value};}};
  f.context.guard=fn=>{guards++;return fn;};
  try{
    const controls=new FaceConwayControls(f.context);assert.equal(mounted,panel);assert.equal(panel.open,false);
    assert.equal(panel.id,'face-conway-settings');assert.equal(guards,11);
    assert.match(html,/id="zone-extension-settings"/);assert.match(html,/id="subdivide-faces"/);
    await f.nodes['conway-a'].onclick();assert.deepEqual(f.calls[0][1],{notation:'a'});assert.equal(controls.busy,false);
  }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
