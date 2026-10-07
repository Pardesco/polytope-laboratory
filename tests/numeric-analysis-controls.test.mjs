import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MeasurementControls} from '../ui/measurement-controls.js';
import {SymmetryControls} from '../ui/symmetry-controls.js';
import {StellationControls} from '../ui/stellation.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const model=()=>({id:'numeric-analysis-tetra',name:'Literal source',dimension:3,embeddingDimension:3,
  interpretation:'generalized-complex',vertices:[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]],
  edges:[[2,3],[0,2],[1,3],[0,1],[0,3],[1,2]],faces:[[2,1,0],[3,0,1],[2,3,0],[3,2,1]],cells:[],
  metadata:{coordinateUnits:'mm',offColors:{faces:[{encoding:'unit',values:[.1,.3,.8,.25]},null,null,null],cells:[]}}});
const symmetryIds={'symmetry-generator-ids':'generatorIds','symmetry-method':'method','symmetry-orientation':'orientation',
  'symmetry-stabilize':'stabilize','symmetry-stabilize-id':'stabilizeId','symmetry-frame-limit':'maxFrames',
  'symmetry-orbit-kind':'orbitKind','symmetry-orbit-id':'orbitId','symmetry-action-id':'actionId'};
const symResult=()=>({order:24,properOrder:12,status:'passed',checks:['source metric'],numericMode:'float64-approximate',actions:[]});
function fixture(kind){
  const state={model:model(),notes:'Full source attributes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],
    camera:{position:[1,2,3]},sectionNormal:[0,0,1],sectionOffset:0,derivedMode:'section'}},doc={id:'numeric-analysis-doc',states:[state],cursor:0};
  let project={active:0,documents:[doc]},exporting=false;const calls=[],nodes={};
  const node=(id,value='',type='text')=>nodes[id]={value,checked:false,type,textContent:'',dataset:{},disabled:false};
  for(const id of ['section-normal','section-depth','section-offset','derived-mode','entity-measure-result','symmetry-result','symmetry-orbit-result','symmetry-action-result'])node(id);
  const context={getProject:()=>project,getDocument:()=>project.documents[project.active],getState:()=>context.getDocument().states[context.getDocument().cursor],
    getModel:()=>context.getState().model,isExporting:()=>exporting,guard:fn=>fn,markDirty:()=>calls.push(['dirty']),refresh:()=>calls.push(['refresh']),
    format:x=>String(x),rawNumbers:text=>text.trim().split(/[\s,;]+/).map(Number),
    evaluateMany:async(parts,options)=>{calls.push(['numbers',[...parts],options]);return parts.map(Number);},
    run:async(op,params,source,label,options)=>{calls.push(['run',op,params,source,label,options]);return op==='symmetry'?symResult():{normal:[1,0,0],offset:3,directionPolicy:'supplied',definition:'literal source plane'};}};
  let controls;
  if(kind==='measurement'){
    const values={'measure-a-kind':'vertex','measure-a-ids':'0','measure-b-kind':'vertex','measure-b-ids':'1','measure-ridge':'0',
      'measure-bounded':'','measure-align-offset':'2','measure-align-direction':'1,0,0'};
    for(const [id,value] of Object.entries(values))node(id,value);
    state.view.measurements={aKind:'vertex',aIds:'0',bKind:'vertex',bIds:'1',bounded:false,ridge:0,offset:'0',direction:''};
    controls=Object.assign(Object.create(MeasurementControls.prototype),context,{context,sequence:0,$:id=>nodes[id]});
  }else if(kind==='symmetry'){
    state.view.symmetry={method:'geometric',orientation:'all',stabilize:'none',stabilizeId:0,maxFrames:100000,orbitKind:'vertex',orbitId:0,actionId:0,generatorIds:''};
    for(const [id,key] of Object.entries(symmetryIds))node(id,String(state.view.symmetry[key]),['stabilizeId','orbitId','actionId'].includes(key)?'number':'text');
    controls=Object.assign(Object.create(SymmetryControls.prototype),context,{context,sequence:0,result:null,ids:symmetryIds,$:id=>nodes[id]});
  }else{
    state.view.stellation={boxScale:3,planeIds:null,selectedRegions:[0],diagramPlane:0,display:'solid',searchSymmetry:'geometric',searchGeneratorIds:'',searchIncludeSeed:true,searchConnected:true};
    node('stellation-scale','3');node('stellation-faces','');
    controls=Object.assign(Object.create(StellationControls.prototype),context,{context,sequence:0,searchSequence:0,$:id=>nodes[id]});
  }
  controls.run=(...args)=>context.run(...args);
  return {kind,controls,context,state,doc,nodes,calls,setExport:v=>exporting=v,setProject:v=>project=v,get project(){return project;}};
}
const start=f=>f.kind==='measurement'?f.controls.align():f.kind==='symmetry'?f.controls.compute():f.controls.editScale();
const output=f=>f.kind==='measurement'?f.state.view.sectionOffset:f.kind==='symmetry'?f.state.view.symmetry.maxFrames:f.state.view.stellation.boxScale;
const field=f=>f.nodes[f.kind==='measurement'?'measure-align-offset':f.kind==='symmetry'?'symmetry-frame-limit':'stellation-scale'];

test('measurement batches offset plus nested direction expressions and publishes only current section fields',async()=>{
  const f=fixture('measurement'),hold=deferred();f.nodes['measure-align-offset'].value='sqrt(4)';f.nodes['measure-align-direction'].value='min(1,2), sind(0), 0';
  f.context.evaluateMany=(parts,options)=>{f.calls.push(['numbers',[...parts],options]);return hold.promise;};const job=start(f);
  const old=f.state.view;f.state.view={...old,angles:[35,0,0,0,0,0],camera:{position:[7,8,9]}};hold.resolve([2,1,0,0]);await job;
  assert.deepEqual(f.calls.find(c=>c[0]==='numbers')[1],['sqrt(4)','min(1,2)','sind(0)','0']);
  const run=f.calls.find(c=>c[0]==='run');assert.deepEqual(run[2],{entity:{kind:'vertex',index:0},offset:2,direction:[1,0,0]});
  assert.notEqual(run[3],f.state.model);assert.deepEqual(run[3],f.state.model);assert.ok(run[5].signal instanceof AbortSignal);
  assert.deepEqual(f.state.view.sectionNormal,[1,0,0]);assert.equal(f.state.view.sectionOffset,3);assert.equal(old.sectionOffset,0);
  assert.equal(f.state.view.angles[0],35);assert.deepEqual(f.state.view.camera.position,[7,8,9]);assert.equal(f.nodes['entity-measure-result'].dataset.operation,'align-section');
});
test('measurement retains optional direction and embedded XYZW alignment domain',async()=>{
  const f=fixture('measurement');f.state.model.embeddingDimension=4;f.state.model.vertices=f.state.model.vertices.map(p=>[...p,0]);
  f.nodes['measure-align-direction'].value='0 0 0 1';f.context.run=async(op,p)=>{assert.deepEqual(p.direction,[0,0,0,1]);return {normal:[0,0,0,1],offset:2};};
  await start(f);assert.deepEqual(f.state.view.sectionNormal,[0,0,0,1]);
  const g=fixture('measurement');g.nodes['measure-align-direction'].value='';await start(g);assert.equal('direction' in g.calls.find(c=>c[0]==='run')[2],false);
});
test('alignment rechecks numeric owner after native reply and rejects malformed native planes atomically',async()=>{
  for(const change of ['export','source','field','sectionTarget','invalid','zeroNormal']){
    const f=fixture('measurement'),hold=deferred(),before=structuredClone(f.state.view);f.context.run=()=>hold.promise;const job=start(f);await flush();
    if(change==='export')f.setExport(true);else if(change==='source')f.state.model.metadata.offColors.faces[0].values[3]=.7;
    else if(change==='field')f.nodes['measure-align-direction'].value='0,1,0';else if(change==='sectionTarget')f.state.view.sectionOffset=9;
    hold.resolve({normal:change==='invalid'?[1,NaN,0]:change==='zeroNormal'?[0,0,0]:[1,0,0],offset:3});await assert.rejects(job);
    assert.equal(f.state.view.sectionOffset,change==='sectionTarget'?9:before.sectionOffset);assert.equal(f.calls.some(c=>c[0]==='dirty'||c[0]==='refresh'),false);
  }
});
test('symmetry frame expression stays unpersisted until integer numeric and native search qualify',async()=>{
  const f=fixture('symmetry'),hold=deferred();f.nodes['symmetry-frame-limit'].value='2^10';f.nodes['symmetry-generator-ids'].value='3,1';
  f.controls.save();assert.equal(f.state.view.symmetry.maxFrames,100000);assert.equal(typeof f.state.view.symmetry.maxFrames,'number');
  f.context.evaluateMany=async()=>[1024];f.context.run=(...args)=>{f.calls.push(['run',...args]);return hold.promise;};const job=start(f);await flush();
  assert.equal(f.state.view.symmetry.maxFrames,100000);assert.equal(f.controls.result,null);
  f.state.view.angles=[42,0,0,0,0,0];hold.resolve(symResult());await job;
  assert.deepEqual(f.calls.find(c=>c[0]==='run')[2],{method:'geometric',orientation:'all',max_frames:1024,generator_ids:[3,1]});
  assert.equal(f.state.view.symmetry.maxFrames,1024);assert.equal(f.nodes['symmetry-frame-limit'].value,'1024');assert.equal(f.state.view.angles[0],42);assert.equal(f.controls.result.order,24);
});
test('symmetry full query parameters remain literal and unsupported fractions/expressions cannot become IDs',async()=>{
  const f=fixture('symmetry');f.nodes['symmetry-stabilize'].value='face';f.nodes['symmetry-stabilize-id'].value='2';f.nodes['symmetry-generator-ids'].value='identity';
  await start(f);assert.deepEqual(f.calls.find(c=>c[0]==='run')[2],{method:'geometric',orientation:'all',max_frames:100000,stabilize:{kind:'face',index:2},generator_ids:[]});
  for(const [id,value] of [['symmetry-generator-ids','2^3'],['symmetry-stabilize-id','1.5']]){const g=fixture('symmetry');g.nodes['symmetry-stabilize'].value='face';g.nodes[id].value=value;await assert.rejects(start(g),/literal/);assert.equal(g.calls.some(c=>c[0]==='run'),false);}
});
test('symmetry signed-axis query keeps previous persisted frame bound and omits geometric controls',async()=>{
  const f=fixture('symmetry');f.nodes['symmetry-method'].value='signed-axis';f.nodes['symmetry-frame-limit'].value='ignored text';await start(f);
  assert.deepEqual(f.calls.find(c=>c[0]==='run')[2],{method:'signed-axis'});assert.equal(f.state.view.symmetry.maxFrames,100000);
});
test('symmetry reply cannot publish after whole query or model change; unrelated inspection remains usable',async()=>{
  for(const change of ['generator','orientation','source','savedTarget']){const f=fixture('symmetry'),hold=deferred();f.context.run=()=>hold.promise;const job=start(f);await flush();
    if(change==='generator')f.nodes['symmetry-generator-ids'].value='1';else if(change==='orientation')f.nodes['symmetry-orientation'].value='proper';
    else if(change==='source')f.state.model.vertices[0][0]=2;else f.state.view.symmetry.maxFrames=7;
    hold.resolve(symResult());await assert.rejects(job);assert.equal(f.controls.result,null);assert.equal(f.nodes['symmetry-result'].dataset.order,undefined);}
  const f=fixture('symmetry'),hold=deferred();f.context.run=()=>hold.promise;const job=start(f);await flush();f.nodes['symmetry-orbit-id'].value='2';f.state.view.symmetry.orbitId=2;hold.resolve(symResult());await job;assert.equal(f.state.view.symmetry.orbitId,2);
});
test('stellation scale assignment is atomic and canonical numeric, with literal plane order and current observer',async()=>{
  const f=fixture('stellation'),hold=deferred(),before=structuredClone(f.state.view.stellation);f.nodes['stellation-scale'].value='sqrt(16)';f.nodes['stellation-faces'].value='3,0,1';
  f.context.evaluateMany=()=>hold.promise;const job=start(f);assert.deepEqual(f.state.view.stellation,before);
  f.state.view.angles=[26,0,0,0,0,0];f.state.view.camera={position:[9,8,7]};hold.resolve([4]);await job;
  assert.deepEqual(f.state.view.stellation,{...before,boxScale:4,planeIds:[3,0,1],selectedRegions:null});assert.equal(f.nodes['stellation-scale'].value,'4');
  assert.equal(f.state.view.derivedMode,'stellation');assert.equal(f.state.view.angles[0],26);assert.deepEqual(f.state.view.camera.position,[9,8,7]);assert.equal(f.calls.filter(c=>c[0]==='refresh').length,1);
});
test('stellation source or selected-region settings changed during expression cannot be overwritten',async()=>{
  for(const change of ['source','config','faces','export']){const f=fixture('stellation'),hold=deferred(),before=structuredClone(f.state.view.stellation);f.context.evaluateMany=()=>hold.promise;const job=start(f);
    if(change==='source')f.state.model.metadata.coordinateUnits='cm';else if(change==='config')f.state.view.stellation.selectedRegions=[2];else if(change==='faces')f.nodes['stellation-faces'].value='0';else f.setExport(true);
    hold.resolve([4]);await assert.rejects(job);assert.equal(f.state.view.stellation.boxScale,before.boxScale);assert.equal(f.state.view.derivedMode,'section');assert.equal(f.calls.length,0);}
});
test('stellation invalid literal faces refuse without numeric work or configuration changes',async()=>{
  for(const text of ['0,0','4','-1','1.5','2^1']){const f=fixture('stellation'),before=structuredClone(f.state.view);f.nodes['stellation-faces'].value=text;
    await assert.rejects(start(f),/face indices/);assert.deepEqual(f.state.view,before);assert.equal(f.calls.length,0);}
});
for(const kind of ['measurement','symmetry','stellation']){
  test(`${kind} source/workspace/unit/export/field changes during numeric await refuse all publication`,async()=>{
    for(const change of ['workspace','state','unit','rgba','notes','export','field']){const f=fixture(kind),hold=deferred(),old=output(f);f.context.evaluateMany=()=>hold.promise;const job=start(f);
      if(change==='workspace')f.setProject({...f.project});else if(change==='state')f.doc.states=[structuredClone(f.state)];
      else if(change==='unit')f.state.view.coordinateUnit='cm';else if(change==='rgba')f.state.model.metadata.offColors.faces[0].values[3]=.9;
      else if(change==='notes')f.state.notes='Changed';else if(change==='export')f.setExport(true);else field(f).value='5';
      hold.resolve(kind==='measurement'?[2,1,0,0]:[kind==='symmetry'?1024:4]);await assert.rejects(job);assert.equal(output(f),old);assert.equal(f.calls.some(c=>c[0]==='run'||c[0]==='dirty'||c[0]==='refresh'),false);}
  });
  test(`${kind} cancellation rejects ignored provider and retries without stale publication`,async()=>{
    const f=fixture(kind),hold=deferred();f.context.evaluateMany=()=>hold.promise;const job=start(f);await flush();
    await assert.rejects(start(f),/Finish or cancel/);f.controls.cancelNumeric();await assert.rejects(job,{name:'AbortError'});hold.resolve(kind==='measurement'?[2,1,0,0]:[4]);await flush();
    assert.equal(f.calls.some(c=>c[0]==='run'||c[0]==='dirty'||c[0]==='refresh'),false);
    f.context.evaluateMany=async texts=>texts.map(Number);await start(f);assert.equal(f.controls.numericEntry,null);
  });
  test(`${kind} export and invalid evaluated domains refuse before native/model assignment`,async()=>{
    const f=fixture(kind);f.setExport(true);await assert.rejects(start(f),/export/);assert.equal(f.calls.some(c=>c[0]==='numbers'),false);
    for(const value of kind==='measurement'?[NaN,Infinity]:kind==='symmetry'?[0,1.5,1000001]:[1,101,NaN]){
      const g=fixture(kind),before=output(g);g.context.evaluateMany=async()=>kind==='measurement'?[value,1,0,0]:[value];await assert.rejects(start(g));
      assert.equal(output(g),before);assert.equal(g.calls.some(c=>c[0]==='run'||c[0]==='dirty'||c[0]==='refresh'),false);
    }
  });
}
test('actual native expressions and alignment retain model-unit geometry rather than browser arithmetic',async()=>{
  const f=fixture('measurement'),cwd=fileURLToPath(new URL('../',import.meta.url));f.nodes['measure-align-offset'].value='sqrt(4)';f.nodes['measure-align-direction'].value='sind(30),0,max(0,1)';
  const python=(code,value)=>JSON.parse(execFileSync('python',['-B','-c',code,JSON.stringify(value)],{cwd,encoding:'utf8',windowsHide:true}));
  f.context.evaluateMany=async expressions=>python('import json,sys;from engine.expressions import evaluate;print(json.dumps([evaluate(x)["value"] for x in json.loads(sys.argv[1])]))',expressions);
  f.context.run=async(op,params,source)=>python('import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.loads(sys.argv[1]))))',{op,params,model:source});
  await start(f);const scale=Math.hypot(.5,1);assert.ok(Math.abs(f.state.view.sectionNormal[0]-.5/scale)<1e-12);assert.ok(Math.abs(f.state.view.sectionNormal[2]-1/scale)<1e-12);
  assert.ok(Math.abs(f.state.view.sectionOffset-(2+1.5/scale))<1e-12);assert.equal(f.state.model.metadata.coordinateUnits,'mm');
});
test('actual constructors wire the expression actions and retain literal ID input types',async()=>{
  const prior=globalThis.document;
  try{
    for(const [kind,Class,action] of [['measurement',MeasurementControls,'measure-align-section'],['symmetry',SymmetryControls,'symmetry'],['stellation',StellationControls,'stellation-evaluate']]){
      const f=fixture(kind),nodes=new Map();
      function element(){
        const n={value:'',type:'text',checked:false,dataset:{},append(){},prepend(){},after(){},before(){},insertBefore(){},querySelector(){return {};}};
        Object.defineProperty(n,'id',{get:()=>n._id,set:id=>{n._id=id;nodes.set(id,n);}});
        Object.defineProperty(n,'innerHTML',{set:html=>{for(const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
          const item=element();item.id=match[1];item.value=/\bvalue="([^"]*)"/.exec(match[0])?.[1]??'';
          item.type=/\btype="([^"]*)"/.exec(match[0])?.[1]??'text';item.checked=/\bchecked\b/.test(match[0]);
        }}});return n;
      }
      for(const id of ['measurement-result','symmetry','symmetry-result','construct-panel']){const n=element();n.id=id;}
      globalThis.document={getElementById:id=>nodes.get(id),createElement:element};
      const c=new Class(f.context);let invoked=0;
      if(kind==='measurement')c.align=async()=>{invoked++;};else if(kind==='symmetry')c.compute=async()=>{invoked++;};else c.editScale=async()=>{invoked++;};
      await nodes.get(action).onclick();assert.equal(invoked,1);assert.equal(c.context,f.context);assert.equal(typeof c.cancelNumeric,'function');
      if(kind==='symmetry'){assert.equal(nodes.get('symmetry-frame-limit').type,'text');assert.equal(nodes.get('symmetry-stabilize-id').type,'number');}
      if(kind==='measurement')assert.equal(nodes.get('measure-ridge').type,'number');
      if(kind==='stellation')assert.equal(nodes.get('stellation-plane').type,'number');
    }
  }finally{globalThis.document=prior;}
});
