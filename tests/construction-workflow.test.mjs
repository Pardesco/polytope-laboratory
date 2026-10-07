import test from 'node:test';
import assert from 'node:assert/strict';
import {generateConstruction} from '../ui/construction-workflow.mjs';

function fixture(){
  let project={documents:[]},exporting=false,resolve,reject;
  const calls=[],result={id:'new-model'};
  const context={getProject:()=>project,isExporting:()=>exporting,
    run:(...args)=>{calls.push(args);return new Promise((a,b)=>{resolve=a;reject=b;});},
    addDocument:(...args)=>calls.push(['add',...args])};
  return {context,calls,result,replace:()=>project={documents:[]},export:()=>exporting=true,
    finish:()=>resolve(result),fail:()=>reject(Error('native refusal'))};
}

test('successful native construction publishes once with its requested kind and evaluated parameters',async()=>{
  const f=fixture(),pending=generateConstruction(f.context,'polygon-product',{kind:'wrong',left:{symbol:'5/2',radius:1}},'Product');
  assert.deepEqual(f.calls,[['generate',{kind:'polygon-product',left:{symbol:'5/2',radius:1}},null,'Product']]);
  f.finish();assert.equal(await pending,f.result);assert.deepEqual(f.calls[1],['add',f.result,'Product']);
});
test('replacing the workspace while native generation runs discards the completed result',async()=>{
  const f=fixture(),pending=generateConstruction(f.context,'cupola',{n:5},'Cupola');
  f.replace();f.finish();await assert.rejects(pending,/Workspace changed/);assert.equal(f.calls.length,1);
});
test('export beginning during native construction prevents publication into its locked source',async()=>{
  const f=fixture(),pending=generateConstruction(f.context,'regular-star-polygon',{symbol:'6/2'},'Polygon');
  f.export();f.finish();await assert.rejects(pending,/export began/);assert.equal(f.calls.length,1);
});
test('an already active export prevents native work and a native refusal adds no document',async()=>{
  const busy=fixture();busy.export();await assert.rejects(generateConstruction(busy.context,'cupola',{},'Cupola'),/Finish animation export/);assert.deepEqual(busy.calls,[]);
  const f=fixture(),pending=generateConstruction(f.context,'polygon-product',{},'Product');f.fail();await assert.rejects(pending,/native refusal/);assert.equal(f.calls.length,1);
});
test('source/target publication guard covers both native request and completed document',async()=>{
  const f=fixture();let current=true,checks=0;
  const verifyPublication=()=>{checks++;if(!current)throw Error('Source attributes changed');};
  const pending=generateConstruction(f.context,'cupola',{n:5},'Cupola',{verifyPublication});
  assert.equal(checks,1);current=false;f.finish();
  await assert.rejects(pending,/Source attributes changed/);assert.equal(checks,2);
  assert.equal(f.calls.length,1);
});
test('cancel signal reaches native work and prevents an ignored cancellation from publishing',async()=>{
  const f=fixture(),controller=new AbortController();
  const pending=generateConstruction(f.context,'cupola',{n:5},'Cupola',{signal:controller.signal});
  assert.equal(f.calls[0][4].signal,controller.signal);controller.abort();f.finish();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.length,1);
  const already=fixture();await assert.rejects(generateConstruction(already.context,'cupola',{},'Cupola',{signal:controller.signal}),{name:'AbortError'});
  assert.equal(already.calls.length,0);
});
