import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIBRARY_COLLECTIONS,collectionSummaries,libraryCounts,LibraryCollections} from '../ui/library-collections.mjs';
import {LibraryThumbnails,ThumbnailCache,thumbnailKey,catalogThumbnailVersion,previewEligible} from '../ui/library-thumbnails.mjs';
import {compileCatalogQuery} from '../ui/catalog-query.mjs';

class Node {
  constructor(tag,document){Object.assign(this,{tagName:tag,document,children:[],attributes:{},dataset:{},style:{},events:{},isConnected:true});this.classes=new Set();this.classList={toggle:(key,value)=>value?this.classes.add(key):this.classes.delete(key)};}
  append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  prepend(node){node.remove();node.parent=this;this.children.unshift(node);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  before(node){this.insert(node,0);}
  after(node){this.insert(node,1);}
  insert(node,offset){node.remove();const index=this.parent.children.indexOf(this);node.parent=this.parent;this.parent.children.splice(index+offset,0,node);}
  replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes);}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];}
  addEventListener(key,run){this.events[key]=run;}
  focus(){this.document.activeElement=this;}
  getBoundingClientRect(){return {right:210,top:400};}
  get offsetHeight(){return 220;}
}
function dom(){
  const d={createElement:tag=>new Node(tag,d),createElementNS:(_ns,tag)=>new Node(tag,d),addEventListener(){},getElementById(id){const visit=n=>n.id===id?n:n.children.map(visit).find(Boolean);return visit(d.body);}};
  d.body=d.createElement('body');for(const id of ['library-family','library-audit-filter','library-properties','catalog']){const n=d.createElement('div');n.id=id;d.body.append(n);}return d;
}
const entries=[{key:'cube',name:'Cube',family:'Platonic',dimension:3,counts:[8,12,6,0]},
  {key:'tesseract',name:'Tesseract',family:'Regular convex',dimension:4,counts:[16,32,24,8]},
  {key:'candidate',name:'Candidate',family:'4D discovery candidates',dimension:4},
  {key:'near',name:'Near miss',family:'Near-miss Johnson solids',dimension:3},
  {key:'linked',name:'Linked',external:true,dimension:3}];
function mounted(){
  const document=dom(),watched=[],thumbnails={reset(){},setVersion(){},watch:(slot,entry)=>watched.push([slot,entry]),unwatch(){}};
  let changes=0,resets=0,builder,builds=0;
  const controls=new LibraryCollections({document,thumbnails,change:()=>{changes++;},resetFilters:()=>resets++,getBuilder:()=>builder});
  return {document,controls,watched,changes:()=>changes,resets:()=>resets,builds:()=>builds,install:()=>builder=()=>builds++,uninstall:()=>builder=null};
}
test('collections count catalog records and leave unverified candidates out of the uniform collection',()=>{
  const summaries=collectionSummaries(entries);assert.equal(summaries.find(c=>c.id==='platonic').count,1);
  assert.equal(summaries.find(c=>c.id==='regular4').entry.key,'tesseract');assert.equal(summaries.find(c=>c.id==='more').count,1);
  assert.equal(summaries.some(c=>c.id==='uniform4'),false);
  for(const entry of entries)assert.ok(LIBRARY_COLLECTIONS.some(c=>c.matches(entry)));
  assert.equal(LIBRARY_COLLECTIONS.find(c=>c.id==='near-miss').matches(entries[3]),true);
});
test('mounted home, collection, query intersection, back and show-all preserve the native catalog container',()=>{
  const f=mounted(),c=f.controls,catalog=f.document.getElementById('catalog');c.prepare(entries);
  assert.equal(f.document.getElementById('library-collections').open,true);
  f.document.getElementById('library-collection-regular4').onclick();assert.equal(c.collection,'regular4');
  assert.deepEqual(entries.filter(e=>c.matches(e)&&compileCatalogQuery('dim:4 v>10')(e)).map(e=>e.key),['tesseract']);
  catalog.replaceChildren();c.prepare(entries);assert.equal(f.document.getElementById('library-collections'),undefined);
  f.document.getElementById('library-back').onclick();assert.equal(c.collection,null);assert.equal(f.resets(),1);
  catalog.replaceChildren();c.prepare(entries);f.document.getElementById('library-show-all').onclick();assert.equal(c.showAll,true);
  catalog.replaceChildren();c.prepare(entries);assert.equal(f.document.getElementById('library-collections'),undefined);
  c.home.onclick();assert.equal(c.showAll,false);assert.equal(f.resets(),2);assert.equal(f.document.getElementById('catalog'),catalog);
});
test('search and family filters suppress home cards and list remains the default even for long results',()=>{
  const f=mounted(),c=f.controls;assert.equal(c.view,'list');c.prepare(entries,{query:'dim:4'});assert.equal(f.document.getElementById('library-collections'),undefined);
  c.prepare(entries,{filtersActive:true});assert.equal(f.document.getElementById('library-collections'),undefined);
  c.grid.onclick();c.prepare(entries);assert.equal(c.grid.getAttribute('aria-pressed'),'true');assert.ok(f.document.getElementById('catalog').classes.has('library-grid'));
  c.list.onclick();c.prepare(entries);assert.equal(c.list.getAttribute('aria-pressed'),'true');assert.ok(!f.document.getElementById('catalog').classes.has('library-grid'));
});
test('validation and geometry filter nodes keep their identity inside an expert details disclosure',()=>{
  const f=mounted(),more=f.document.getElementById('library-more-filters');assert.equal(more.tagName,'details');assert.equal(more.getAttribute('data-expert'),'');
  for(const id of ['library-audit-filter','library-properties'])assert.equal(f.document.getElementById(id).parent,more);
});
test('symmetry builder slot is optional at mount and rechecks both late installation and removal',()=>{
  const f=mounted();assert.equal(f.controls.builder.hidden,true);f.install();f.controls.prepare(entries);assert.equal(f.controls.builder.hidden,false);
  f.controls.builder.onclick();assert.equal(f.builds(),1);f.uninstall();assert.doesNotThrow(()=>f.controls.builder.onclick());assert.equal(f.controls.builder.hidden,true);
});
test('focus preview shows source counts, restores existing descriptions and handles Escape dismissal',()=>{
  const f=mounted(),button=f.document.createElement('button');f.document.body.append(button);button.setAttribute('aria-describedby','existing');f.controls.decorate(button,entries[1]);
  button.events.focus();assert.equal(f.controls.tooltip.hidden,false);assert.match(button.getAttribute('aria-describedby'),/existing library-item-preview/);
  assert.match(f.controls.tooltip.children[2].textContent,/16 vertices.*32 edges.*24 faces.*8 cells/);
  button.events.blur();assert.equal(f.controls.tooltip.hidden,true);assert.equal(button.getAttribute('aria-describedby'),'existing');
  assert.equal(libraryCounts(entries[4]),'Counts unavailable until opened');assert.doesNotMatch(libraryCounts(entries[0]),/cells/);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function finish(service){for(let i=0;i<50&&service.pumping;i++)await tick();assert.equal(service.pumping,false);}
function thumbnails(options={}){
  const document=dom(),reads=[],renders=[],cache=new ThumbnailCache({indexedDB:null});
  const service=new LibraryThumbnails({document,Observer:null,cache,idle:tick,read:async e=>{reads.push(e.key);return e;},createPreview:async()=>({render:e=>{renders.push(e.key);return 'data:image/png;base64,'+e.key;},destroy(){}}),...options});
  const slot=()=>{const n=document.createElement('span');document.body.append(n);return n;};return {service,reads,renders,slot,cache};
}
test('hidden qualification mode submits no native reads or cache work until explicitly enabled',async()=>{
  const f=thumbnails();f.service.configure({hidden:true});f.service.watch(f.slot(),entries[0]);await tick();assert.deepEqual(f.reads,[]);
  f.service.configure({hidden:true,explicit:true});f.service.watch(f.slot(),entries[0]);await finish(f.service);assert.deepEqual(f.reads,['cube']);f.service.destroy();
});
test('IntersectionObserver makes thumbnails lazy and image generation is coalesced and serialized',async()=>{
  let observe,callback,active=0,max=0;
  class Observer{constructor(run){callback=run;}observe(slot){observe=slot;}unobserve(){}disconnect(){}}
  const f=thumbnails({Observer,read:async e=>{active++;max=Math.max(max,active);await tick();active--;return e;}});f.service.configure();
  const a=f.slot(),b=f.slot(),c=f.slot();f.service.watch(a,entries[0]);assert.equal(observe,a);await tick();assert.deepEqual(f.renders,[]);
  f.service.watch(b,entries[0]);f.service.watch(c,entries[1]);callback([a,b,c].map(target=>({target,isIntersecting:true})));await finish(f.service);
  assert.equal(max,1);assert.deepEqual(f.renders,['cube','tesseract']);for(const n of [a,b,c])assert.equal(n.children[0].tagName,'img');f.service.destroy();
});
test('catalog/style/source keys invalidate cached previews; cache failure falls back to bounded memory',async()=>{
  assert.notEqual(catalogThumbnailVersion(entries),catalogThumbnailVersion([...entries,{key:'new'}]));
  const key=thumbnailKey(entries[0],'v1');assert.notEqual(key,thumbnailKey(entries[0],'v2'));assert.notEqual(key,thumbnailKey(entries[0],'v1','other-style'));
  assert.notEqual(key,thumbnailKey({...entries[0],sourceHash:'new'},'v1'));
  const cache=new ThumbnailCache({indexedDB:{open(){throw Error('unavailable');}},limit:2});
  for(const k of ['a','b','c'])await cache.set(k,'data:image/png;base64,abc');assert.equal(await cache.get('a'),null);assert.ok(await cache.get('c'));
  await cache.set('bad','https://example.invalid');assert.equal(await cache.get('bad'),null);
});
test('rerender aborts active previews and late native replies never publish into removed slots',async()=>{
  let resolve,signal;const f=thumbnails({read:(_e,options)=>{signal=options.signal;return new Promise(done=>resolve=done);}});f.service.configure();const slot=f.slot();f.service.watch(slot,entries[0]);
  while(!resolve)await tick();f.service.reset();assert.equal(signal.aborted,true);resolve(entries[0]);await finish(f.service);assert.deepEqual(f.renders,[]);assert.equal(slot.children.length,0);f.service.destroy();
});
test('failed or oversized previews keep a neutral glyph without preventing other models from rendering',async()=>{
  const f=thumbnails({read:async e=>{if(e.key==='cube')throw Error('renderer unavailable');return e;}});f.service.configure();
  const bad=f.slot(),good=f.slot(),large=f.slot();f.service.watch(bad,entries[0]);f.service.watch(good,entries[1]);f.service.watch(large,{...entries[0],counts:[99999,0,0,0]});await finish(f.service);
  assert.equal(bad.textContent,'◇');assert.match(bad.title,/unavailable/);assert.equal(good.children[0].tagName,'img');assert.equal(large.textContent,'◇');
  assert.equal(previewEligible({...entries[0],auditStatus:'rejected'}),false);f.service.destroy();
});
test('cached images survive rerender without another native read and a catalog version change regenerates them',async()=>{
  const f=thumbnails();f.service.configure();f.service.setVersion('v1');f.service.watch(f.slot(),entries[0]);await finish(f.service);
  f.service.reset();const slot=f.slot();f.service.watch(slot,entries[0]);await finish(f.service);assert.deepEqual(f.reads,['cube']);assert.equal(slot.children[0].tagName,'img');
  f.service.setVersion('v2');f.service.watch(f.slot(),entries[0]);await finish(f.service);assert.deepEqual(f.reads,['cube','cube']);f.service.destroy();
});
test('foreground native work cancels a preview read and retries it only after the workspace becomes idle',async()=>{
  let idle=true,started=0,cancel,canceled=false;
  const f=thumbnails({isIdle:()=>idle,read:async (_entry,{signal})=>{started++;if(started>1)return entries[0];return new Promise((_resolve,reject)=>{cancel=()=>{canceled=true;reject(Object.assign(Error('canceled'),{name:'AbortError'}));};signal.addEventListener('abort',cancel,{once:true});});}});
  f.service.configure();const slot=f.slot();f.service.watch(slot,entries[0]);while(!cancel)await tick();idle=false;
  try{await new Promise(resolve=>setTimeout(resolve,130));assert.equal(canceled,true);assert.equal(started,1);
    idle=true;await finish(f.service);assert.equal(started,2);assert.equal(slot.children[0].tagName,'img');
  }finally{idle=true;f.service.destroy();}
});
test('unhashed external files use memory only while verified source hashes allow persistent caching',async()=>{
  const policies=[],cache={get:async (_key,options)=>{policies.push(options.persistent);return null;},set:async()=>{}};
  const f=thumbnails({cache});f.service.configure();f.service.watch(f.slot(),{...entries[0],external:true});f.service.watch(f.slot(),{...entries[1],external:true,sourceHash:'sha256'});await finish(f.service);
  assert.deepEqual(policies,[false,true]);f.service.destroy();
});
test('main app keeps row data-key and background reads use cancelable silent native jobs',()=>{
  const source=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');assert.match(source,/button.dataset.key=entry.key/);assert.match(source,/libraryVisual.decorate\(button,entry\)/);
  assert.match(source,/background\?libraryPreviewJobs:nativeJobs/);assert.match(source,/libraryThumbnails.configure\(\{hidden:startup.hidden===true\}\)/);
});
