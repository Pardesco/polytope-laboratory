/** Small read-only queries own their inputs, source and visible feedback. */
export class IntrinsicReportControls {
  constructor(context){
    this.context=context;this.jobs=new Map();
    for(const id of ['measurement-kind','measurement-ids'])for(const event of ['input','change'])this.node(id).addEventListener(event,()=>this.clear('measurement','Inputs changed. Measure again.','input'));
    for(const channel of ['measurement','identity'])this.output(channel).setAttribute('role','status');
  }
  node(id){return this.context.getInput(id);}
  output(channel){return this.node(channel==='measurement'?'measurement-result':'regular4d-validation-result');}
  cancelJob(channel){const job=this.jobs.get(channel);if(job){this.jobs.delete(channel);job.controller.abort();}}
  clear(channel,text='',status='idle'){
    this.cancelJob(channel);this.context.reports.invalidate(channel);const node=this.output(channel);node.textContent=text;
    for(const key of ['status','key','flags'])delete node.dataset[key];if(text)node.dataset.status=status;
  }
  reset(){this.clear('measurement');this.clear('identity');}
  cancel(){for(const channel of [...this.jobs.keys()])this.clear(channel,'Check canceled. Try again when ready.','canceled');}
  async query(channel,operation,parameters,label,getTarget,publish){
    this.clear(channel);const ticket=this.context.reports.begin([channel],{getTarget}),job={controller:new AbortController()};this.jobs.set(channel,job);
    const node=this.output(channel);node.textContent=channel==='measurement'?'Measuring current inputs…':'Checking regular 4D identity…';node.dataset.status='pending';
    const current=()=>this.jobs.get(channel)===job&&this.context.reports.current(ticket,channel);
    const stale=()=>{if(this.jobs.get(channel)===job&&this.context.reports.owns(ticket,channel)){node.textContent='The source or inputs changed. Check again.';node.dataset.status='input';}};
    try{
      const result=await this.context.run(operation,parameters,ticket.model,label,{signal:job.controller.signal});
      if(!current()){stale();return null;}publish(result,node);return result;
    }catch(error){
      if(!current()){stale();return null;}
      node.textContent=error.name==='AbortError'?'Check canceled. Try again when ready.':'Check could not finish. Try again.';node.dataset.status=error.name==='AbortError'?'canceled':'error';
      if(error.name!=='AbortError')throw error;return null;
    }finally{if(this.jobs.get(channel)===job)this.jobs.delete(channel);}
  }
  measure(){
    const getTarget=()=>[this.node('measurement-kind').value,this.node('measurement-ids').value],parameters={kind:this.node('measurement-kind').value,indices:this.context.rawNumbers(this.node('measurement-ids').value)};
    return this.query('measurement','measure',parameters,'Measure intrinsic geometry',getTarget,(result,node)=>{node.textContent=this.context.format(result.value)+' '+result.units;node.dataset.status='ready';});
  }
  identity(){
    const key=this.context.getState()?.model?.metadata?.key;
    return this.query('identity','regular4d-validate',{key},'Verify regular 4D identity',()=>null,(receipt,node)=>{
      node.textContent=`${receipt.reachedFlags} / ${receipt.flagCount} flags; numerical regularity verified (float64).`;
      node.dataset.status=receipt.status;node.dataset.key=key;node.dataset.flags=String(receipt.reachedFlags);
    });
  }
}
