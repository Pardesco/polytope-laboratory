/** Catalog metadata can be retried without opening an unsolicited model. */
const canceled=Symbol('catalog discovery canceled');
export class CatalogDiscovery {
  constructor(context){this.context=context;this.pending=null;this.state='idle';}
  cancel(){
    if(!this.pending)return;
    const job=this.pending;this.pending=null;this.state='canceled';job.controller.abort();this.context.change?.();
  }
  load(){
    if(this.pending)return this.pending.promise;
    const job={controller:new AbortController()},current=()=>this.pending===job&&!job.controller.signal.aborted;
    this.pending=job;this.state='loading';
    job.promise=Promise.resolve().then(async()=>{
      let abort;
      try{
        if(!current())return null;
        const stopped=new Promise(resolve=>{abort=()=>resolve(canceled);job.controller.signal.addEventListener('abort',abort,{once:true});});
        const entries=await Promise.race([this.context.read({signal:job.controller.signal}),stopped]);
        if(entries===canceled||!current())return null;
        if(!Array.isArray(entries))throw Error('The Library returned invalid catalog metadata. Retry loading it.');
        this.context.publish(entries);this.state='ready';return entries;
      }catch(error){if(!current())return null;this.state='error';throw error;}
      finally{job.controller.signal.removeEventListener('abort',abort);if(this.pending===job)this.pending=null;this.context.change?.();}
    });
    this.context.change?.();return job.promise;
  }
}
