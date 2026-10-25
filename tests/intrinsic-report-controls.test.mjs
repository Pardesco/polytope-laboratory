import test from 'node:test';
import assert from 'node:assert/strict';
import {IntrinsicReportControls} from '../ui/intrinsic-report-controls.mjs';
import {ModelReports} from '../ui/model-reports.mjs';
class Node extends EventTarget{constructor(value=''){super();this.value=value;this.textContent='';this.dataset={};}setAttribute(){}edit(value,event='input'){this.value=value;this.dispatchEvent(new Event(event));}}
function fixture(){
 const nodes=new Map([['measurement-kind',new Node('distance')],['measurement-ids',new Node('0, 1')],['measurement-result',new Node()],['regular4d-validation-result',new Node()]]);
 let state={model:{id:'source',metadata:{key:'tesseract'},vertices:[[0,0,0,0],[1,0,0,0]]},notes:'',view:{coordinateUnit:'model',angles:[0]}},document={id:'document'},project={documents:[document]};
 const calls=[],context={getState:()=>state,getDocument:()=>document,getProject:()=>project,getInput:id=>nodes.get(id),rawNumbers:s=>s.split(',').map(Number),format:String,run:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))};context.reports=new ModelReports(context);
 const controls=new IntrinsicReportControls(context);return {nodes,context,controls,calls,state,replace:()=>{state={...state,model:{...state.model,id:'next'}};document={id:'next'};},out:ch=>controls.output(ch),finish:(i,value)=>calls[i].resolve(value)};
}
test('simple measurement captures raw inputs, shows pending feedback and renders a current native result',async()=>{
 const f=fixture(),pending=f.controls.measure();assert.equal(f.out('measurement').dataset.status,'pending');assert.deepEqual(f.calls[0].args.slice(0,4),['measure',{kind:'distance',indices:[0,1]},f.state.model,'Measure intrinsic geometry']);
 f.finish(0,{value:2,units:'model-units'});await pending;assert.equal(f.out('measurement').textContent,'2 model-units');assert.equal(f.out('measurement').dataset.status,'ready');
 f.nodes.get('measurement-ids').edit('0, 3');assert.equal(f.out('measurement').dataset.status,'input');assert.ok(!f.out('measurement').textContent.includes('2 model-units'));
});
test('input edits abort only the pending measurement and refuse its late success',async()=>{
 const f=fixture(),pending=f.controls.measure(),identity=f.controls.identity();f.nodes.get('measurement-kind').edit('angle','change');assert.equal(f.calls[0].args[4].signal.aborted,true);assert.equal(f.calls[1].args[4].signal.aborted,false);
 f.finish(0,{value:2,units:'model-units'});assert.equal(await pending,null);assert.equal(f.out('measurement').dataset.status,'input');
 f.finish(1,{status:'passed',reachedFlags:384,flagCount:384});await identity;assert.equal(f.out('identity').dataset.status,'passed');
});
test('identity clears old receipt attributes while pending and permits notes/unit/observer edits',async()=>{
 const f=fixture();Object.assign(f.out('identity').dataset,{status:'passed',key:'old',flags:'99'});f.out('identity').textContent='old receipt';
 const pending=f.controls.identity();assert.equal(f.out('identity').dataset.status,'pending');assert.equal(f.out('identity').dataset.key,undefined);assert.equal(f.out('identity').dataset.flags,undefined);
 f.state.notes='new note';f.state.view.coordinateUnit='mm';f.state.view.angles[0]=45;f.finish(0,{status:'passed',reachedFlags:384,flagCount:384});await pending;assert.equal(f.out('identity').dataset.key,'tesseract');assert.equal(f.out('identity').dataset.flags,'384');
});
test('superseded replies and failures do not erase the fresh query feedback',async()=>{
 const f=fixture(),old=f.controls.identity(),fresh=f.controls.identity();assert.equal(f.calls[0].args[4].signal.aborted,true);f.calls[0].reject(Error('old native refusal'));assert.equal(await old,null);assert.equal(f.out('identity').dataset.status,'pending');
 f.finish(1,{status:'passed',reachedFlags:384,flagCount:384});await fresh;assert.equal(f.out('identity').dataset.status,'passed');
});
test('source mutations with the same ID refuse publication; navigation reset cancels both channels quietly',async()=>{
 const f=fixture(),pending=f.controls.measure();f.state.model.vertices[0][0]=5;f.finish(0,{value:2,units:'model-units'});assert.equal(await pending,null);assert.equal(f.out('measurement').dataset.status,'input');
 const measurement=f.controls.measure(),identity=f.controls.identity();f.replace();f.context.reports.invalidate();f.controls.reset();assert.equal(f.calls[1].args[4].signal.aborted,true);assert.equal(f.calls[2].args[4].signal.aborted,true);
 f.calls[1].reject(Error('old failure'));f.finish(2,{status:'passed',reachedFlags:384,flagCount:384});assert.equal(await measurement,null);assert.equal(await identity,null);assert.equal(f.out('identity').textContent,'');
});
test('Cancel preserves completed reports and current native failures remain actionable',async()=>{
 const f=fixture(),complete=f.controls.measure();f.finish(0,{value:2,units:'model-units'});await complete;const pending=f.controls.identity();f.controls.cancel();assert.equal(f.out('measurement').dataset.status,'ready');assert.equal(f.out('identity').dataset.status,'canceled');f.finish(1,{status:'passed'});assert.equal(await pending,null);
 const failed=f.controls.measure(),failure=Error('Angle requires three vertices');f.calls[2].reject(failure);await assert.rejects(failed,e=>e===failure);assert.equal(f.out('measurement').dataset.status,'error');
});
