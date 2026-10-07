import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {WorkspaceNumericControls} from '../ui/workspace-numeric-controls.mjs';

const source=()=>({id:'source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
  vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],edges:[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],
  faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]],cells:[],metadata:{coordinateUnits:'mm',
    offColors:{faces:[{encoding:'unit',values:[.2,.3,.4,.5]},null,null,null],cells:[]}}});
function native(request){
  const child=spawnSync('python',['-u','engine/server.py'],{input:JSON.stringify(request)+'\n',encoding:'utf8',
    windowsHide:true,maxBuffer:8*1024*1024,timeout:30000,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  assert.equal(child.status,0,child.stderr);const result=JSON.parse(child.stdout.trim());
  if(!result.ok)throw Error(result.error);return result.result;
}
function fixture(values={}){
  const nodes=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value:String(value)}]));
  const state={model:source(),notes:'retained notes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],
    camera:{zoom:2},sectionNormal:[0,0,1],sectionOffset:0,entity:0}};
  const document={id:'doc',cursor:0,states:[state]};let project={documents:[document],active:0},exporting=false;
  const calls=[],context={getState:()=>project.documents[project.active].states[project.documents[project.active].cursor],
    getDocument:()=>project.documents[project.active],getProject:()=>project,isExporting:()=>exporting,getInput:id=>nodes[id],
    evaluateMany:async(strings,{mode})=>{calls.push(['expressions',[...strings],mode]);return strings.map(text=>{
      const special={'2+3':5,'min(1, 2)':1,'sqrt(4)':2,'1/2':.5,'-2':-2,'1/0':NaN};
      const result=Object.hasOwn(special,text)?special[text]:Number(text);if(!Number.isFinite(result))throw Error('Native expression refusal');
      return mode==='rational'?(text==='1/2'?'1/2':String(result)):result;
    });},
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push(['commit',op,params,options]);return params;},
    generate:async(kind,params,label,options)=>{options.verifyPublication();calls.push(['generate',kind,params,options]);return params;},
    run:async(...args)=>{calls.push(['native',...args]);return {id:'new-model'};},
    addDocument:(...args)=>calls.push(['add',...args]),markDirty:()=>calls.push(['dirty']),refreshDerived:async()=>calls.push(['refresh'])};
  const controls=new WorkspaceNumericControls(context);
  return {controls,context,nodes,state,document,calls,replace:()=>project={...project},export:()=>exporting=true};
}
const deferred=()=>{let resolve;const promise=new Promise(a=>resolve=a);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('section applies nested expressions atomically and preserves latest observer motion',async()=>{
  const f=fixture({'section-normal':'min(1, 2), 0, sqrt(4)','section-depth':'1/2','entity-id':'0','section-offset':'0'});
  const hold=deferred(),original=f.context.evaluateMany;f.context.evaluateMany=async(...args)=>{await hold.promise;return original(...args);};
  const pending=f.controls.section();f.state.view.angles[2]=37;f.state.view.camera.zoom=4;hold.resolve();await pending;
  assert.deepEqual(f.state.view.sectionNormal,[1,0,2]);assert.equal(f.state.view.sectionOffset,.5);
  assert.equal(f.state.view.angles[2],37);assert.equal(f.state.view.camera.zoom,4);
  assert.equal(f.calls.filter(row=>row[0]==='expressions').length,1);
});
test('Next vertex evaluates both normal and current expression depth before event stepping',async()=>{
  const f=fixture({'section-normal':'0, 0, sqrt(4)','section-depth':'1/2','entity-id':'0','section-offset':'0'});
  await f.controls.section(true);assert.equal(f.state.view.sectionOffset,1);assert.equal(f.nodes['section-depth'].value,'1');
  assert.deepEqual(f.state.model,source());
});
test('invalid normal/depth leaves derived view and source untouched',async()=>{
  for(const [normal,depth] of [['0,0,0','1'],['0,1','1'],['1,0,0','1/0']]){
    const f=fixture({'section-normal':normal,'section-depth':depth,'entity-id':'0','section-offset':'0'}),before=structuredClone(f.state);
    await assert.rejects(f.controls.section());assert.deepEqual(f.state,before);
    assert.ok(!f.calls.some(row=>['dirty','refresh'].includes(row[0])));
  }
});
test('block generator ignores unrelated invalid count inputs and validates positive dimensions',async()=>{
  const f=fixture({generator:'block','generator-n':'nonsense','generator-m':'nonsense','block-sizes':'sqrt(4), 2+3, 1/2'});
  await f.controls.generator();assert.deepEqual(f.calls.find(row=>row[0]==='generate').slice(1,3),['block',{sizes:[2,5,.5]}]);
  assert.deepEqual(f.calls[0][1],['sqrt(4)','2+3','1/2']);
});
test('count integrality and cross-parameter caps precede geometry generation',async()=>{
  for(const [kind,n,m] of [['duoprism','1/2','5'],['duoprism','200','200'],['polygon','201','bad'],['waterman','bad','1/2']]){
    const f=fixture({generator:kind,'generator-n':n,'generator-m':m});await assert.rejects(f.controls.generator());
    assert.ok(!f.calls.some(row=>row[0]==='generate'));
  }
});
test('Wythoff weights match family rank and literal ring semantics',async()=>{
  const f=fixture({'coxeter-family':'B3','coxeter-rings':'101','coxeter-weights':'sqrt(4), 0, 1/2'});
  await f.controls.wythoff();assert.deepEqual(f.calls.find(row=>row[0]==='generate')[2],{family:'B3',rings:[1,0,1],weights:[2,0,.5]});
  f.nodes['coxeter-weights'].value='1,1,1';await assert.rejects(f.controls.wythoff(),/weights must match/);
});
test('more than32-coordinate hull uses one bulk job and refuses stale completion',async()=>{
  const rows=Array.from({length:40},(_,i)=>`${i}, ${i+1}, ${i+2}, ${i+3}`).join('\n');
  const f=fixture({'hull-points':rows}),hold=deferred();f.context.run=async(...args)=>{f.calls.push(['native',...args]);await hold.promise;return {id:'hull'};};
  const pending=f.controls.hull();await flush();
  assert.equal(f.calls[0][1].length,160);assert.equal(f.calls.filter(row=>row[0]==='expressions').length,1);
  const nativeCall=f.calls.find(row=>row[0]==='native');assert.equal(nativeCall[2].points.length,40);
  f.nodes['hull-points'].value+='\n1,2,3,4';hold.resolve();await assert.rejects(pending,/target fields changed/);
  assert.ok(!f.calls.some(row=>row[0]==='add'));
});
test('full20,000x4 expression field is not constrained by generic target-signature size',async()=>{
  const f=fixture({'hull-points':Array(20000).fill('2+3, 1/2, -2, sqrt(4)').join('\n')});
  await f.controls.hull();assert.equal(f.calls[0][1].length,80000);
  assert.equal(f.calls.filter(row=>row[0]==='expressions').length,1);
  assert.equal(f.calls.find(row=>row[0]==='native')[2].points.length,20000);
  assert.equal(f.calls.filter(row=>row[0]==='add').length,1);
});
test('actual native parser and rational hull retain exact threshold coordinates',async()=>{
  const f=fixture({'rational-points':'0,0\n4 - 1/10^40,0\n0,1/2'});
  f.context.evaluateMany=async(expressions,{mode})=>native({op:'expression-batch',params:{expressions:[...expressions],mode}}).values;
  f.context.run=async(op,params)=>{f.calls.push(['native',op,params]);return native({op,params});};
  const model=await f.controls.hull(true);
  const input=f.calls.find(row=>row[0]==='native')[2].points;
  assert.notEqual(input[1][0],'4');assert.equal(input[2][1],'1/2');
  assert.ok(model.rationalCoordinates.some(row=>row.includes(input[1][0])));
  assert.equal(model.numeric.certified,true);assert.equal(model.certificate.exhausted,true);
  assert.equal(model.certificate.arithmetic,'Python Fraction');assert.equal(model.certificate.exactFacetCount,3);
});
test('signed nonzero scale remains supported and zero refuses without history mutation',async()=>{
  const f=fixture({'model-scale':'-2'});await f.controls.operation('transform','model-scale','Scale',{},'scale');
  assert.deepEqual(f.calls.find(row=>row[0]==='commit')[2],{scale:-2});
  f.nodes['model-scale'].value='0';await assert.rejects(f.controls.operation('transform','model-scale','Scale',{},'scale'),/nonzero/);
});
test('full source attributes/units/notes and changed project fence late expression completion',async()=>{
  for(const change of [f=>f.state.model.metadata.offColors.faces[0].values[3]=.2,
    f=>f.state.view.coordinateUnit='cm',f=>f.state.notes='changed',f=>f.replace(),f=>f.export(),
    f=>f.nodes['extrusion-height'].value='4']){
    const f=fixture({'extrusion-height':'sqrt(4)'}),hold=deferred();f.context.evaluateMany=()=>hold.promise;
    const pending=f.controls.operation('extrude','extrusion-height','Extrude',{min:0,exclusiveMin:true},'height');
    change(f);hold.resolve([2]);await assert.rejects(pending);
    assert.ok(!f.calls.some(row=>row[0]==='commit'));
  }
});
test('cancel releases ownership even if native evaluator ignores its signal',async()=>{
  const f=fixture({'truncation':'1/2'}),hold=deferred();f.context.evaluateMany=()=>hold.promise;
  const pending=f.controls.operation('truncate','truncation','Truncate',{min:0,max:.5},'amount');f.controls.cancel();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.controls.entry.busy,false);
  hold.resolve([.5]);await flush();assert.ok(!f.calls.some(row=>row[0]==='commit'));
});
