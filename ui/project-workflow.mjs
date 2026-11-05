/** Keep project replacement atomic across the native file/recovery await. */
export async function openWorkspace(context) {
  if(context.isExporting())throw Error('Finish or cancel animation export before opening a project.');
  const workspace=context.getProject(),revision=context.getRevision();
  const result=await context.load();
  if(!result)return null;
  if(context.isExporting())throw Error('Animation export began while opening the project. The result was discarded.');
  if(context.getProject()!==workspace||context.getRevision()!==revision)throw Error('Workspace changed while opening the project. The result was discarded.');
  // No further await before adoption: the final checks and publication share
  // this continuation, including any queued export microtasks before it.
  context.publish(result);
  return result;
}

/** Open and recovery share one in-flight chooser/read and the existing atomic
 * publication fence. Canceling the native job releases this renderer lock. */
export class ProjectOpening {
  constructor(){this.busy=false;this.job=null;}
  sync(){
    const job=this.job;if(!job||job.publishing||job.controller.signal.aborted)return false;
    const c=job.context;
    if(c.getProject()!==job.project||c.getRevision()!==job.revision||c.isExporting()){
      job.controller.abort();c.onStale?.();return true;
    }
    return false;
  }
  async open(context){
    if(this.busy)throw Error('A file is already opening. Finish or cancel it before opening another.');
    const job={context,project:context.getProject(),revision:context.getRevision(),controller:new AbortController(),publishing:false};
    this.busy=true;this.job=job;
    try{return await openWorkspace({...context,
      load:async()=>{
        const result=await context.load({signal:job.controller.signal});
        if(job.controller.signal.aborted)throw Object.assign(Error('File loading canceled.'),{name:'AbortError'});
        return result;
      },
      publish:result=>{job.publishing=true;context.publish(result);}
    });}finally{if(this.job===job){this.job=null;this.busy=false;}}
  }
}

/** A native Save dialog owns one captured project revision. Repeated commands
 * must not submit a second, potentially older snapshot to the same destination. */
export class ProjectSaving {
  constructor(context){this.context=context;this.busy=false;}
  async save(){
    const c=this.context;
    if(c.isExporting())throw Error('Finish or cancel animation export before saving the project.');
    if(this.busy)throw Error('A project save is already in progress. Finish it before saving again.');
    this.busy=true;
    try{
      c.onBusy?.(true);
      const project=c.getProject(),revision=c.getRevision(),owner=c.start();
      const result=await c.write(c.snapshot());
      if(c.getProject()===project){
        if(result){
          const current=c.getRevision()===revision;c.onSaved({current});
          c.complete(owner,'Saved '+result.path+(current?'':' · newer changes remain unsaved'));
        }else c.complete(owner,'Save canceled.');
      }
      return result;
    }finally{this.busy=false;c.onBusy?.(false);}
  }
}

/** One recovery write at a time. Snapshot only a new revision, and retain the
 * retry obligation until its validated native write actually succeeds. */
export class RecoverySnapshots {
  constructor(context){this.context=context;this.pending=null;this.saved=null;}
  async save(){
    const c=this.context;if(this.pending||!c.shouldSave())return false;
    const project=c.getProject(),revision=c.getRevision();
    if(this.saved?.project.deref()===project&&this.saved.revision===revision)return false;
    const job={project,revision};this.pending=job;
    try{
      const result=await c.write(c.snapshot());
      // Remember only the latest recovery owner without keeping a closed,
      // potentially large workspace alive for the rest of the app session.
      this.saved={project:new WeakRef(project),revision};
      if(c.getProject()===project)c.onSaved?.({result,current:c.getRevision()===revision});
      return true;
    }finally{if(this.pending===job)this.pending=null;}
  }
}
