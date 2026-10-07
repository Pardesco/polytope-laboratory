/** Fit after a projection's current display arrives, outside publication.
 * Observer edits, source/pose changes and explicit camera actions cancel it.
 * The fit covers the published display cloud, including diagnosed partials;
 * it does not certify omitted geometry or a whole curved primitive.
 */
const fields=['project','document','state','model','fingerprint','pose','camera'];
const same=(a,b)=>Boolean(a&&b)&&fields.every(key=>a[key]===b[key]);

export class ProjectionFit {
  constructor({getOwner,isReady,fit,persist,schedule=callback=>globalThis.requestAnimationFrame(callback),
    cancelScheduled=id=>globalThis.cancelAnimationFrame(id),onError=()=>{},
    now=()=>performance.now(),waitMs=10000}){
    Object.assign(this,{getOwner,isReady,fit,persist,schedule,cancelScheduled,onError,now,waitMs});
    this.ticket=0;this.intent=null;this.handle=null;
  }
  cancel(){
    this.ticket++;this.intent=null;
    if(this.handle!==null)this.cancelScheduled(this.handle);
    this.handle=null;
  }
  request(){
    this.cancel();const owner=this.getOwner();if(!owner)return;
    this.intent={owner:{...owner},ticket:this.ticket,deadline:this.now()+this.waitMs};this.notify();
  }
  notify(){
    const intent=this.intent;if(!intent)return;
    if(!same(intent.owner,this.getOwner())){this.cancel();return;}
    if(this.handle!==null)return;
    this.handle=this.schedule(()=>{
      if(this.intent!==intent||this.ticket!==intent.ticket)return;
      this.handle=null;
      if(!same(intent.owner,this.getOwner())||this.now()>intent.deadline){this.cancel();return;}
      if(!this.isReady()){this.notify();return;}
      this.intent=null;
      try{this.fit();this.persist();}catch(error){this.onError(error);}
    });
  }
}
