import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MeasurementControls} from '../ui/measurement-controls.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(execFileSync('python',['-B','-c',"import json,runpy;print(json.dumps(runpy.run_path('tests/test_ordinary_face_distances.py')['fixture']()))"],{cwd:root,windowsHide:true,encoding:'utf8',timeout:10000}));
const native=(op,params,model)=>JSON.parse(execFileSync('python',['-B','-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))"],{cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify({op,params,model}),timeout:10000}));
function fixture(){
 const state={model:structuredClone(source),notes:'Literal source notes',view:{coordinateUnit:'mm',angles:[0,0,0,0,0,0],elementAnnotations:null}},document={id:'distance-source',cursor:0,states:[state]},project={active:0,documents:[document]};
 const nodes={},node=(id,value='')=>nodes[id]={value,checked:false,textContent:'',dataset:{}};
 for(const [id,value] of Object.entries({'measure-a-kind':'vertex','measure-a-ids':'6','measure-b-kind':'face','measure-b-ids':'0','measure-ridge':'0','measure-align-offset':'0','measure-align-direction':''}))node(id,value);
 node('measure-bounded').checked=true;node('entity-measure-result');let exporting=false;
 const calls=[],context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>exporting,markDirty(){},rawNumbers:text=>text.trim().split(/[\s,;]+/).map(Number),format:v=>String(v),refresh(){}};
 const controls=Object.assign(Object.create(MeasurementControls.prototype),context,{context,sequence:0,$:id=>nodes[id],run:async(op,params,model,_,options)=>{calls.push({op,params,model,options});return native(op,params,model);}});
 return {state,document,project,nodes,controls,calls,setExport:v=>exporting=v};
}
const params={kind:'flat-distance',bounded:true,entities:[{kind:'vertex',index:6},{kind:'face',index:0}]};

test('existing bounded measurement UI publishes actual concave-region witnesses and native full-source hash',async()=>{
 const f=fixture(),before=structuredClone(f.state.model),result=await f.controls.compute('entity-measure',params);
 assert.ok(Math.abs(result.value-Math.sqrt(2))<1e-8);assert.equal(f.nodes['entity-measure-result'].dataset.operation,'entity-measure');
 assert.match(f.nodes['entity-measure-result'].textContent,/Original-region witnesses: vertex 6 .* face 0/);assert.match(f.nodes['entity-measure-result'].textContent,/source ear-triangle union/);assert.deepEqual(f.state.model,before);assert.notStrictEqual(f.calls[0].model,f.state.model);assert.equal(f.state.notes,'Literal source notes');assert.equal(f.state.view.coordinateUnit,'mm');
});

test('held results refuse source attributes/notes/units/content/targets/cancellation while observer motion remains independent',async()=>{
 for(const change of ['rgba','notes','units','content','target','cancel','observer','export']){
  const f=fixture();let finish;const result=native('entity-measure',params,f.state.model);f.controls.run=(_,__,___,____,options)=>{f.options=options;return new Promise(r=>finish=r);};
  const pending=f.controls.compute('entity-measure',params);while(!finish)await new Promise(r=>setImmediate(r));
  if(change==='rgba')f.state.model.metadata.offColors.faces[0].values[3]=126;
  else if(change==='notes')f.state.notes='changed';else if(change==='units')f.state.view.coordinateUnit='in';
  else if(change==='content')f.state.view.elementAnnotations={entries:[]};else if(change==='target')f.nodes['measure-a-ids'].value='5';
  else if(change==='cancel'){f.controls.cancelNumeric();assert.equal(f.options.signal.aborted,true);}
  else if(change==='observer'){f.state.view.angles[0]=35;f.state.view.camera={position:[7,8,9]};}
  else f.setExport(true);
  finish(result);
  if(change==='observer'){await pending;assert.equal(f.nodes['entity-measure-result'].dataset.operation,'entity-measure');}
  else{await assert.rejects(pending,/changed|cancel|export/i);assert.equal(f.nodes['entity-measure-result'].dataset.operation,undefined);}
 }
 const f=fixture(),bad=native('entity-measure',params,f.state.model);bad.boundedDistanceEvidence.sourceSha256='0'.repeat(64);f.controls.run=async()=>bad;
 await assert.rejects(f.controls.compute('entity-measure',params),/another full source/);assert.equal(f.nodes['entity-measure-result'].dataset.operation,undefined);
});
