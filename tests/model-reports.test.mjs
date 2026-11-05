import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelReports} from '../ui/model-reports.mjs';
import {NativeJobs} from '../ui/native-jobs.mjs';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {EnginePool}=createRequire(import.meta.url)('../desktop/engine-pool.cjs');
function fixture(){
  let state={model:{id:'source',fingerprint:'unchanged',vertices:[[0,0,0]],metadata:{color:'red'}},notes:'original',view:{coordinateUnit:'mm',angles:[0]}},document={id:'document'},project={documents:[document]};
  const reports=new ModelReports({getProject:()=>project,getDocument:()=>document,getState:()=>state});
  return {reports,state,replaceProject:()=>project={documents:[document]},replaceDocument:()=>document={id:'document'},replaceState:()=>state={...state}};
}
test('manual validation supersedes the validation half of an automatic analysis without discarding its other fields',()=>{
  const f=fixture(),automatic=f.reports.begin(['analysis','validation']),manual=f.reports.begin(['validation']);
  assert.equal(f.reports.current(automatic,'analysis'),true);assert.equal(f.reports.current(automatic,'validation'),false);assert.equal(f.reports.current(manual,'validation'),true);
  const newer=f.reports.begin(['validation']);assert.equal(f.reports.current(manual,'validation'),false);assert.equal(f.reports.current(newer,'validation'),true);
});
test('view, notes and unit-display edits preserve an intrinsic report',()=>{
  const f=fixture(),ticket=f.reports.begin(['analysis']);f.state.view.angles[0]=45;f.state.view.coordinateUnit='cm';f.state.notes='edited';
  assert.equal(f.reports.current(ticket,'analysis'),true);
});
test('project, document, state and in-place model changes refuse late reports even with unchanged IDs and fingerprints',()=>{
  for(const edit of [f=>f.replaceProject(),f=>f.replaceDocument(),f=>f.replaceState(),f=>f.state.model={...f.state.model},f=>f.state.model.vertices[0][0]=4,f=>f.state.model.metadata.color='blue']){
    const f=fixture(),ticket=f.reports.begin(['analysis','validation']);edit(f);assert.equal(f.reports.current(ticket,'analysis'),false);assert.equal(f.reports.current(ticket,'validation'),false);assert.equal(f.reports.owns(ticket,'analysis'),true);
  }
});
test('workspace navigation invalidation refuses old replies even after returning to the original source',()=>{
  const f=fixture(),ticket=f.reports.begin(['analysis','validation']);f.reports.invalidate();assert.equal(f.reports.current(ticket,'analysis'),false);assert.equal(f.reports.owns(ticket,'validation'),false);
  const fresh=f.reports.begin(['analysis','validation']);assert.equal(f.reports.current(fresh,'analysis'),true);assert.equal(f.reports.current(ticket,'validation'),false);
});
test('an empty workspace refuses a report before registering output ownership',()=>{
  const reports=new ModelReports({getProject:()=>({}),getDocument:()=>undefined,getState:()=>undefined});assert.throws(()=>reports.begin(['validation']),/Choose a model/);assert.equal(reports.channels.size,0);
});
test('query targets and channel cancellation stay independent of other reports',()=>{
  const f=fixture();let target=['distance','0, 1'];const ticket=f.reports.begin(['measurement'],{getTarget:()=>target}),identity=f.reports.begin(['identity']);
  target=['distance','0, 3'];assert.equal(f.reports.current(ticket,'measurement'),false);assert.equal(f.reports.current(identity,'identity'),true);
  f.reports.invalidate('measurement');assert.equal(f.reports.owns(ticket,'measurement'),false);assert.equal(f.reports.current(identity,'identity'),true);
});

test('shared analysis is canceled only after its last output channel is superseded',()=>{
  const {reports}=fixture(),automatic=reports.begin(['analysis','validation']);
  const manual=reports.begin(['validation']);
  assert.equal(automatic.signal.aborted,false);
  const newer=reports.begin(['validation']);
  assert.equal(manual.signal.aborted,true);
  assert.equal(automatic.signal.aborted,false);
  reports.invalidate('analysis');
  assert.equal(automatic.signal.aborted,true);
  assert.equal(newer.signal.aborted,false);
  reports.invalidate();
  assert.equal(newer.signal.aborted,true);
});

test('invalidation revokes every output before notifying cancellation listeners',()=>{
  const {reports}=fixture(),ticket=reports.begin(['analysis','validation']);let notifications=0;
  ticket.signal.addEventListener('abort',()=>{
    notifications++;
    assert.equal(reports.owns(ticket,'analysis'),false);
    assert.equal(reports.owns(ticket,'validation'),false);
  });
  reports.invalidate();reports.invalidate();
  assert.equal(notifications,1);
});

test('rapid navigation releases obsolete native analysis workers and rejects late replies',async()=>{
  const {reports}=fixture(),processes=[];
  const pool=new EnginePool({maxWorkers:3,spawnWorker:()=>{
    const proc=new EventEmitter();proc.stdout=new EventEmitter();proc.stderr=new EventEmitter();proc.stdin=new EventEmitter();
    proc.stdout.setEncoding=proc.stderr.setEncoding=()=>{};
    proc.stdin.write=input=>{proc.request=JSON.parse(input);};
    proc.kill=()=>{proc.killed=true;};
    proc.reply=result=>proc.stdout.emit('data',JSON.stringify({id:proc.request.id,ok:true,result})+'\n');
    processes.push(proc);return proc;
  }});
  let sequence=0;
  const jobs=new NativeJobs({id:()=>String(++sequence),now:()=>0,start:()=>{},complete:()=>{},cancel:id=>pool.cancel(id)});
  const canceled=[];
  try{
    for(let index=0;index<10;index++){
      const ticket=reports.begin(['analysis','validation']);
      const job=jobs.run(id=>pool.run({op:'analyze',model:ticket.model},id),'Analyze',{signal:ticket.signal});
      // Observe rejections immediately, including cancellation while IPC is pending.
      const outcome=job.then(value=>({value}),error=>({error}));
      await Promise.resolve();
      assert.equal(pool.workers.size,1);
      assert.equal(jobs.pending.size,1);
      const proc=processes.at(-1);
      if(index<9){
        reports.invalidate();
        assert.equal(proc.killed,true);
        assert.equal(pool.workers.size,0);
        assert.equal(jobs.pending.size,0);
        proc.reply({obsolete:index});
        canceled.push(outcome);
      }else{
        proc.reply({current:true});
        assert.deepEqual(await outcome,{value:{current:true}});
        assert.equal(reports.current(ticket,'analysis'),true);
      }
    }
    for(const outcome of await Promise.all(canceled))assert.equal(outcome.error?.name,'AbortError');
  }finally{pool.dispose();}
});
