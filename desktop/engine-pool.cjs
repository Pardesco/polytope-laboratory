// Reuse Python imports for frequent pure calculations. Other jobs stay isolated.
const REUSABLE_OPERATIONS=new Set(['section','net','net-edit','net-fold','net-pack','cell-net','cell-net-edit','export-options','prepare-export','catalog','generate','expression','expression-batch','analyze','validate','dual','prepare-dual-morph','evaluate-dual-morph']);
REUSABLE_OPERATIONS.add('live-construction-preview');
for(const op of ['net-reinforcement','net-measurements','net-reinforcement-pages','net-reinforcement-parts','net-measurement-export'])REUSABLE_OPERATIONS.add(op);
REUSABLE_OPERATIONS.add('element-types');
REUSABLE_OPERATIONS.add('coxeter-build');
REUSABLE_OPERATIONS.add('uniform-compound');
REUSABLE_OPERATIONS.add('information-panel');
REUSABLE_OPERATIONS.add('polychoron-relationships');
REUSABLE_OPERATIONS.add('incidence-truncate-preview');
REUSABLE_OPERATIONS.add('verify-dual-tour');
REUSABLE_OPERATIONS.add('symmetry-orientation');
REUSABLE_OPERATIONS.add('geometry-fit-deviation');
REUSABLE_OPERATIONS.add('symmetry-axes');
for(const op of ['facet-candidates','facet-search','facet-diagram'])REUSABLE_OPERATIONS.add(op);
REUSABLE_OPERATIONS.add('prepare-printable-export');
REUSABLE_OPERATIONS.add('prepare-view-export');
for(const op of ['stellation-cell-graph','stellation-diagram-data','arrangement-diagram','stellation-enumerate','arrangement','stellation-union'])REUSABLE_OPERATIONS.add(op);
REUSABLE_OPERATIONS.add('stellation-supported-enumerate');
REUSABLE_OPERATIONS.add('stellation-miller-enumerate');
// These queries compute from each full JSON-lines request. Reuse imports only;
// no result/identity shortcut or renderer publication guard is introduced.
for(const op of ['measure','entity-measure','entity-info','dihedral','align-section','entity-orientation','cell-facing','vertex-figure','cell','element-content-describe'])REUSABLE_OPERATIONS.add(op);
class EnginePool{
  constructor({spawnWorker,jobs=new Map(),maxWorkers=3,timeoutMs=120000,idleTimeoutMs=60000,maxBytes=128*1024*1024}){
    this.spawnWorker=spawnWorker;this.jobs=jobs;this.maxWorkers=maxWorkers;
    this.timeoutMs=timeoutMs;this.idleTimeoutMs=idleTimeoutMs;this.maxBytes=maxBytes;
    this.workers=new Set();this.idle=[];this.closed=false;
  }
  retire(worker){
    if(worker.dead)return;
    worker.dead=true;clearTimeout(worker.idleTimer);this.workers.delete(worker);
    this.idle=this.idle.filter(w=>w!==worker);worker.proc.kill();
  }
  create(){
    const proc=this.spawnWorker(),worker={proc,active:null,buffer:'',bytes:0,error:'',dead:false};
    this.workers.add(worker);proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
    proc.stdout.on('data',chunk=>this.receive(worker,chunk));
    proc.stderr.on('data',chunk=>{worker.error=(worker.error+chunk).slice(-4000);});
    proc.on('error',e=>this.fail(worker,new Error('Geometry engine could not start: '+e.message)));
    proc.on('exit',code=>this.fail(worker,new Error(code===null?'Job cancelled.':'Engine exited before completing: '+worker.error)));
    proc.stdin.on('error',e=>this.fail(worker,e));
    return worker;
  }
  fail(worker,error){
    if(worker.dead)return;
    if(worker.active)worker.active.finish(error,undefined,false);else this.retire(worker);
  }
  receive(worker,chunk){
    if(worker.dead)return;
    if(!worker.active){this.retire(worker);return;}
    worker.bytes+=Buffer.byteLength(chunk,'utf8');
    if(worker.bytes>this.maxBytes){this.fail(worker,new Error('Engine output exceeds the 128 MiB limit.'));return;}
    worker.buffer+=chunk;const newline=worker.buffer.indexOf('\n');if(newline<0)return;
    let response;
    try{
      response=JSON.parse(worker.buffer.slice(0,newline));
      if(!response||typeof response!=='object'||response.id!==worker.active.id||typeof response.ok!=='boolean'||worker.buffer.slice(newline+1).trim())throw Error('Response identity or framing does not match the active job.');
    }catch(e){this.fail(worker,new Error('Invalid engine response: '+e.message));return;}
    worker.buffer='';worker.bytes=0;
    worker.active.finish(response.ok?null:new Error(response.error||'Geometry operation failed.'),response.result,true);
  }
  run(request,id){
    if(this.closed)return Promise.reject(new Error('Geometry engine is shutting down.'));
    if(this.jobs.has(id))return Promise.reject(new Error('Duplicate job ID.'));
    let input;try{input=JSON.stringify({...request,id})+'\n';}catch(e){return Promise.reject(e);}
    if(Buffer.byteLength(input,'utf8')>this.maxBytes)return Promise.reject(new Error('Engine request exceeds the 128 MiB limit.'));
    const reusable=REUSABLE_OPERATIONS.has(request.op);
    let worker=reusable?this.idle.pop():null;
    if(!worker){
      if(this.workers.size>=this.maxWorkers&&this.idle.length)this.retire(this.idle.pop());
      if(this.workers.size>=this.maxWorkers)return Promise.reject(new Error('Geometry engine workers are busy.'));
      try{worker=this.create();}catch(e){return Promise.reject(new Error('Geometry engine could not start: '+e.message));}
    }
    clearTimeout(worker.idleTimer);worker.buffer='';worker.bytes=0;worker.error='';
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,value,healthy)=>{
        if(settled)return;settled=true;clearTimeout(timer);worker.active=null;this.jobs.delete(id);
        if(healthy&&reusable&&!this.closed&&!worker.dead){
          this.idle.push(worker);worker.idleTimer=setTimeout(()=>this.retire(worker),this.idleTimeoutMs);worker.idleTimer.unref?.();
        }else this.retire(worker);
        error?reject(error):resolve(value);
      };
      const timer=setTimeout(()=>finish(new Error('Job exceeded the two-minute resource limit. Source geometry remains available.'),undefined,false),this.timeoutMs);
      worker.active={id,finish};this.jobs.set(id,worker.proc);
      try{worker.proc.stdin.write(input);}catch(e){finish(e,undefined,false);}
    });
  }
  cancel(id){
    const worker=Array.from(this.workers).find(w=>w.active?.id===id);
    if(!worker)return false;
    worker.active.finish(new Error('Job cancelled.'),undefined,false);return true;
  }
  dispose(){
    this.closed=true;
    for(const worker of Array.from(this.workers)){
      if(worker.active)worker.active.finish(new Error('Geometry engine is shutting down.'),undefined,false);else this.retire(worker);
    }
  }
}
module.exports={EnginePool,REUSABLE_OPERATIONS};
