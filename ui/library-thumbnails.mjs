import {featuredView} from './welcome-state.mjs';

export const THUMBNAIL_STYLE='welcome-128-v1';
export function catalogThumbnailVersion(entries){
  let hash=2166136261;const text=JSON.stringify(entries);
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return 'catalog-v1-'+(hash>>>0).toString(16);
}
export function thumbnailKey(entry,version,style=THUMBNAIL_STYLE){return JSON.stringify([entry.key,version,style,entry.sourceHash??null]);}
export function previewEligible(entry){
  return entry.supported!==false&&entry.catalogStatus!=='unsupported'&&entry.auditStatus!=='rejected'&&
    (!entry.counts||entry.counts.every((n,i)=>Number.isFinite(n)&&n>=0&&n<=[4000,8000,4000,2000][i]));
}
const png=url=>typeof url==='string'&&url.startsWith('data:image/png;base64,')&&url.length<300000;

export class ThumbnailCache {
  constructor({indexedDB=globalThis.indexedDB,limit=256}={}){this.indexedDB=indexedDB;this.limit=limit;this.memory=new Map();}
  async database(){
    if(!this.opening)this.opening=new Promise(resolve=>{
      if(!this.indexedDB)return resolve(null);
      try{const request=this.indexedDB.open('polytope-library-thumbnails',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'key'});
        request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
        request.onerror=request.onblocked=()=>resolve(null);
      }catch{resolve(null);}
    });
    return this.opening;
  }
  remember(key,url){this.memory.delete(key);this.memory.set(key,url);while(this.memory.size>this.limit)this.memory.delete(this.memory.keys().next().value);}
  async get(key,{persistent=true}={}){
    if(this.memory.has(key)){const url=this.memory.get(key);this.remember(key,url);return url;}
    const db=persistent?await this.database():null;if(!db)return null;
    return new Promise(resolve=>{try{const request=db.transaction('images').objectStore('images').get(key);request.onsuccess=()=>{const url=request.result?.url;if(png(url)){this.remember(key,url);resolve(url);}else resolve(null);};request.onerror=()=>resolve(null);}catch{resolve(null);}});
  }
  async set(key,url,{persistent=true}={}){
    if(!png(url))return;this.remember(key,url);const db=persistent?await this.database():null;if(!db)return;
    await new Promise(resolve=>{try{
      const tx=db.transaction('images','readwrite'),store=tx.objectStore('images');store.put({key,url,time:Date.now()});
      const all=store.getAll();all.onsuccess=()=>{const rows=all.result.sort((a,b)=>b.time-a.time);for(const row of rows.slice(this.limit))store.delete(row.key);};
      tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
    }catch{resolve();}});
  }
}

export async function createLibraryPreview(document){
  const {Viewer}=await import('./viewer.js'),host=document.createElement('div');
  host.className='library-render-host';host.setAttribute('aria-hidden','true');document.body.append(host);
  let viewer;
  try{viewer=new Viewer(host);viewer.controls.enabled=false;viewer.renderer.setPixelRatio(1);viewer.resize();}
  catch(error){host.remove();throw error;}
  return {render(model){
    if(model.vertices.length>4000||model.edges.length>8000||model.faces.length>4000)throw Error('Preview size limit');
    try{viewer.setModel(model,{deferDisplay:true});viewer.setDisplay(featuredView(model.dimension));viewer.fit();return viewer.image();}finally{viewer.clear();}
  },destroy(){viewer.clear();viewer.observer.disconnect();viewer.controls.dispose();viewer.renderer.dispose();viewer.renderer.forceContextLoss();host.remove();}};
}

/** One idle native read and one small Viewer capture at a time. No document publication. */
export class LibraryThumbnails {
  constructor({document,read,isIdle=()=>true,createPreview=()=>createLibraryPreview(document),cache=new ThumbnailCache(),
    Observer=globalThis.IntersectionObserver,idle=()=>new Promise(resolve=>{
      if(globalThis.requestIdleCallback)globalThis.requestIdleCallback(resolve,{timeout:1000});else setTimeout(resolve,120);
    })}={}){
    Object.assign(this,{document,read,isIdle,createPreview,cache,idle});this.enabled=false;this.version='pending';this.slots=new Map();this.queue=new Map();this.failed=new Set();this.epoch=0;
    if(Observer)this.observer=new Observer(entries=>{for(const item of entries)if(item.isIntersecting){this.observer.unobserve(item.target);this.enqueue(item.target);}},{rootMargin:'80px'});
  }
  configure({hidden=false,explicit=false}={}){this.enabled=!hidden||explicit;this.reset();}
  setVersion(version){if(this.version===version)return;this.version=version;this.failed.clear();this.reset();}
  reset(){this.epoch++;this.controller?.abort();this.observer?.disconnect();this.queue.clear();this.slots.clear();}
  watch(slot,entry,{immediate=false}={}){
    slot.className='library-thumbnail';slot.textContent='◇';slot.setAttribute('aria-hidden','true');slot.title='Preview unavailable';
    if(!this.enabled||!previewEligible(entry))return;
    this.slots.set(slot,entry);slot.title='Preview loads when visible';
    if(immediate||!this.observer)this.enqueue(slot);else this.observer.observe(slot);
  }
  enqueue(slot){
    const entry=this.slots.get(slot);if(!entry)return;const key=thumbnailKey(entry,this.version);
    if(this.failed.has(key))return;
    if(!this.queue.has(key))this.queue.set(key,{entry,slots:new Set()});this.queue.get(key).slots.add(slot);void this.pump();
  }
  unwatch(slot){this.observer?.unobserve(slot);this.slots.delete(slot);for(const job of this.queue.values())job.slots.delete(slot);}
  async pump(){
    if(this.pumping)return;this.pumping=true;
    try{while(this.enabled&&this.queue.size){
      await this.idle();if(!this.enabled||!this.queue.size)break;if(!this.isIdle())continue;
      const [key,job]=this.queue.entries().next().value;this.queue.delete(key);const epoch=this.epoch;
      if(![...job.slots].some(slot=>slot.isConnected&&this.slots.get(slot)===job.entry))continue;
      const current=()=>epoch===this.epoch&&this.enabled,options={persistent:!job.entry.external||Boolean(job.entry.sourceHash)};
      const retry=()=>{if(current()&&[...job.slots].some(slot=>slot.isConnected&&this.slots.get(slot)===job.entry))this.queue.set(key,job);};
      const controller=new AbortController();this.controller=controller;let monitor;
      try{
        let url=await this.cache.get(key,options);if(!current())continue;
        if(!url){
          if(!this.isIdle()){this.queue.set(key,job);continue;}
          monitor=setInterval(()=>{if(!this.isIdle())controller.abort();},100);
          const model=await this.read(job.entry,{signal:controller.signal,background:true});
          if(!current())continue;if(controller.signal.aborted){retry();continue;}
          await this.idle();if(!current())continue;if(!this.isIdle()){retry();continue;}
          this.preview??=await this.createPreview();if(!current())continue;if(controller.signal.aborted){retry();continue;}
          url=this.preview.render(model);if(!png(url))throw Error('Invalid preview');
          await this.cache.set(key,url,options);
        }
        if(!current())continue;
        for(const slot of job.slots)if(slot.isConnected&&this.slots.get(slot)===job.entry){const image=this.document.createElement('img');image.alt='';image.src=url;image.width=128;image.height=128;slot.replaceChildren(image);slot.title='';}
      }catch{if(controller.signal.aborted)retry();else if(current()){this.failed.add(key);for(const slot of job.slots)slot.title='Preview unavailable; open the model to explore';}}
      finally{clearInterval(monitor);if(this.controller===controller)this.controller=null;}
    }}finally{this.pumping=false;}
  }
  destroy(){this.enabled=false;this.reset();this.preview?.destroy();this.preview=null;}
}
