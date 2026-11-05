const hosts=new WeakMap(),EXPLORE='polytope.canvas.explore.v1';

export function readExplore(storage){
  try{const saved=JSON.parse(storage?.getItem(EXPLORE)??'null');return {dismissed:saved?.dismissed===true,used:Array.isArray(saved?.used)?saved.used.filter(x=>['turn','elements','build'].includes(x)):[]};}catch{return {dismissed:false,used:[]};}
}

// Insets are fractions of the actual canvas, never the enclosing workspace.
export function canvasSafeInsets(width,height,{bottom=48,widget=null}={}){
  if(!(width>0&&height>0))return {};
  const result={left:16/width,right:16/width,top:16/height,bottom:Math.min(.45,bottom/height)};
  if(widget){
    const right=Math.max(16,width-widget.left+8),top=Math.max(16,widget.bottom+8);
    const availableHeight=height*(1-result.bottom);
    if((width-right-16)*(availableHeight-16)>(availableHeight-top)*(width-32))result.right=Math.min(.45,right/width);
    else result.top=Math.min(.45,top/height);
  }
  return result;
}

export function canvasOverlays(doc,host){
  if(!host?.append)return null;
  if(!hosts.has(host))hosts.set(host,new CanvasOverlays({document:doc,host}));
  return hosts.get(host);
}

export class CanvasOverlays{
  constructor({document:doc=globalThis.document,host,storage,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
    Object.assign(this,{doc,host,schedule,cancel});this.entries=new Map();this.context={};this.enabled=true;this.active=null;
    try{this.storage=storage??doc.defaultView?.localStorage;}catch{}
    this.preferences=readExplore(this.storage);
    this.slot=doc.createElement('div');this.slot.id='canvas-hint-slot';this.slot.hidden=true;this.slot.setAttribute('role','region');this.slot.setAttribute('aria-label','Shape exploration and tips');host.append(this.slot);
    const interaction=event=>{
      if(event.type==='keydown'&&(!['Escape','Enter',' '].includes(event.key)&&!event.key?.startsWith('Arrow')))return;
      if(this.slot.contains?.(event.target))return;
      this.dismissAll('interaction');
    };
    host.addEventListener?.('pointerdown',interaction,true);host.addEventListener?.('wheel',interaction,{capture:true,passive:true});host.addEventListener?.('keydown',interaction,true);
  }
  configure(context){Object.assign(this.context,context);}
  enable(value){this.enabled=!!value;this.showNext();}
  enqueue(key,node,{priority=0,onDismiss=()=>{}}={}){
    if(this.entries.has(key))return;
    node.hidden=true;this.slot.append(node);this.entries.set(key,{key,node,priority,onDismiss,eligible:true,done:false});
    if(this.active&&priority>this.active.priority){this.active.node.hidden=true;this.active=null;this.cancel(this.timer);}
    this.showNext();
  }
  eligible(key,value){const item=this.entries.get(key);if(!item)return;item.eligible=!!value;if(this.active===item&&!value){item.node.hidden=true;this.active=null;this.cancel(this.timer);}this.showNext();}
  dismiss(key,reason='dismiss'){
    const item=this.entries.get(key);if(!item||item.done)return;
    item.done=true;item.node.hidden=true;
    if(this.active===item){this.active=null;this.cancel(this.timer);}
    item.onDismiss(reason);this.showNext();
  }
  dismissAll(reason){
    const items=[...this.entries.values()].filter(item=>!item.done);
    for(const item of items){item.done=true;item.node.hidden=true;item.onDismiss(reason);}
    this.active=null;this.cancel(this.timer);this.slot.hidden=true;
  }
  showNext(){
    if(!this.enabled){if(this.active)this.active.node.hidden=true;this.active=null;this.cancel(this.timer);this.slot.hidden=true;return;}
    if(this.active)return;
    const next=[...this.entries.values()].filter(item=>item.eligible&&!item.done).sort((a,b)=>b.priority-a.priority)[0];
    this.slot.hidden=!next;if(!next)return;
    this.active=next;next.node.hidden=false;
    this.context.refitOverlay?.();
    const expire=()=>{if(this.slot.contains?.(this.doc.activeElement)){this.timer=this.schedule(expire,8000);this.timer?.unref?.();}else this.dismiss(next.key,'timeout');};
    this.timer=this.schedule(expire,8000);this.timer?.unref?.();
  }
  safeInsets(){
    const canvas=this.context.base?.container,rect=canvas?.getBoundingClientRect?.();if(!rect?.width||!rect.height)return {};
    const hint=this.slot.hidden?null:this.slot.getBoundingClientRect(),counts=this.doc.getElementById('counts-strip')?.getBoundingClientRect?.();
    const gizmo=this.doc.getElementById('direct-4d-gizmo'),box=gizmo&&!gizmo.hidden?gizmo.getBoundingClientRect?.():null;
    return canvasSafeInsets(rect.width,rect.height,{bottom:Math.max(48,hint?rect.bottom-hint.top+16:0,counts?rect.bottom-counts.top+16:0),widget:box?{left:box.left-rect.left,bottom:box.bottom-rect.top}:null});
  }
  saveExplore(){try{this.storage?.setItem(EXPLORE,JSON.stringify(this.preferences));}catch{}}
  freshOpen(model){
    this.dismiss('explore','replace');this.entries.get('explore')?.node.remove?.();this.entries.delete('explore');this.elementWait?.();
    this.source=this.context.getState?.();this.sourceModel=model;
    const four=(model.embeddingDimension||model.dimension)===4,actions=[...(four?[['turn','Turn in 4D']]:[]),['elements',four?'See its cells':'See its faces'],['build','Build a shape']];
    if(this.preferences.dismissed||actions.every(([key])=>this.preferences.used.includes(key)))return;
    const root=this.doc.createElement('div');root.id='explore-shape';root.className='canvas-hint';
    const title=this.doc.createElement('strong');title.textContent='Explore this shape';root.append(title);this.buttons=[];
    for(const [key,label] of actions){
      const button=this.doc.createElement('button');button.id='explore-shape-'+key;button.type='button';button.textContent=label;button.setAttribute('aria-pressed',String(this.preferences.used.includes(key)));
      button.onclick=this.context.guard?.(()=>this.exploreAction(key,button))??(()=>this.exploreAction(key,button));root.append(button);this.buttons.push(button);
    }
    const close=this.doc.createElement('button');close.type='button';close.id='explore-shape-dismiss';close.textContent='×';close.setAttribute('aria-label','Dismiss Explore this shape');close.onclick=()=>this.dismiss('explore');root.append(close);
    this.enqueue('explore',root,{priority:20,onDismiss:reason=>{if(reason==='dismiss'){this.preferences.dismissed=true;this.saveExplore();}}});
    this.sync();
  }
  current(source=this.source,model=this.sourceModel){return source===this.context.getState?.()&&model===this.context.getModel?.()&&this.context.canEdit?.();}
  sync(){
    if(this.source&&!this.current()){this.elementWait?.();this.eligible('explore',false);}
    else if(this.source)this.eligible('explore',true);
    for(const button of this.buttons??[])button.disabled=!this.current()||this.busy;
  }
  async exploreAction(key,button){
    if(!this.current()||this.busy)return;
    const source=this.source,model=this.sourceModel;this.busy=true;this.sync();
    try{
      if(key==='turn')this.context.turn?.();
      if(key==='build')this.context.build?.();
      if(key==='elements'){
        this.context.stop?.();const panel=this.doc.getElementById('element-types');this.context.reveal?.(panel);
        const kind=(model.embeddingDimension||model.dimension)===4?'cell':'face';
        const selected=await this.firstType(kind,source,model);if(!selected)return;
      }
      if(!this.current(source,model))return;
      if(!this.preferences.used.includes(key))this.preferences.used.push(key);this.saveExplore();button.setAttribute('aria-pressed','true');
      if(this.buttons.every(node=>this.preferences.used.includes(node.id.replace('explore-shape-',''))))this.dismiss('explore','complete');
    }finally{this.busy=false;this.sync();}
  }
  firstType(kind,source,model){
    this.elementWait?.();
    const select=()=>{
      if(!this.current(source,model))return false;
      const row=this.doc.getElementById('element-types-'+kind),button=row?.querySelector('.element-type-list button');if(!button)return false;
      this.context.reveal?.(button);row.open=true;button.click();button.focus?.({preventScroll:true});return true;
    };
    if(select())return Promise.resolve(true);
    const panel=this.doc.getElementById('element-types'),Observer=this.doc.defaultView?.MutationObserver;
    if(!panel||!Observer)return Promise.resolve(false);
    return new Promise(resolve=>{
      const finish=value=>{observer.disconnect();this.cancel(timer);if(this.elementWait===cancel)this.elementWait=null;resolve(value);};
      const cancel=()=>finish(false),observer=new Observer(()=>{if(!this.current(source,model))finish(false);else if(select())finish(true);});
      const timer=this.schedule(()=>finish(false),30000);this.elementWait=cancel;observer.observe(panel,{childList:true,subtree:true});
    });
  }
}
