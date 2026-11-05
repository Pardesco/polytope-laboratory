import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const url=new URL('../ui/showcase-controls.mjs',import.meta.url);
// Node has no CSS/JSON Vite loader; all JavaScript dependencies remain real.
const source=(await readFile(url,'utf8')).replace("import './presentation.css';",'').replace("import gallery from './welcome-gallery.json';",'const gallery=[];').replace(/from '(\.\/[^']+)'/g,(_match,spec)=>`from '${new URL(spec,url).href}'`);
const {ShowcaseControls}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve)),deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.fail('Expected presentation stage');}
globalThis.requestAnimationFrame=fn=>setTimeout(()=>fn(performance.now()),1);
globalThis.cancelAnimationFrame=id=>clearTimeout(id);
function fixture(){
  const source={model:{id:'m',name:'Model',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[2,0]],faces:[[0,1,2]],cells:[]},view:{angles:Array(6).fill(0)},notes:'unchanged'};
  const owner={id:'doc',states:[source],cursor:0},project={documents:[owner],active:0},events=[],attrs=new Map(),classes=new Set(),styles=new Map(),buttons=new Map();let locked=false;
  const style={getPropertyValue:k=>styles.get(k)??'',getPropertyPriority:()=>'',setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)};
  const chrome={inert:false,getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  const root={hidden:true,dataset:{},focus(){},getBoundingClientRect:()=>({width:800,height:600}),querySelector:selector=>{if(!buttons.has(selector))buttons.set(selector,{setAttribute(){}});return buttons.get(selector);}};
  const body={children:[chrome,root],style,getBoundingClientRect:()=>({width:800,height:600}),classList:{contains:k=>classes.has(k),add:k=>classes.add(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},append:n=>body.children.push(n)};
  globalThis.document={body,activeElement:null,createElement:()=>({style:{},setAttribute(){},remove(){events.push('host:remove');}})};
  const h=Object.create(ShowcaseControls.prototype);Object.assign(h,{root,canvas:{setAttribute(){}},status:{textContent:''},busy:false,active:false});
  h.nodes=Object.fromEntries(Object.entries({source:'current',duration:'8',transition:'.8',fps:'2',format:'webm',size:'viewport'}).map(([k,value])=>[k,{value}]));h.nodes.loop={checked:false};h.nodes.captions={checked:true};
  h.context={getState:()=>source,getDocument:()=>owner,getProject:()=>project,isExporting:()=>locked,evaluateMany:async values=>values.map(Number),guard:fn=>fn,setStatus:s=>events.push(s),assertAvailable(){},
    api:{startupInfo:async()=>({hidden:false}),presentationWindow:async enabled=>{events.push(['native',enabled]);return enabled;}},
    suspend:()=>{events.push('suspend');return ()=>events.push('resume');},lock:value=>{locked=value;events.push(['lock',value]);}};
  h.createRenderer=()=>({apply:async time=>events.push(['apply',time]),close:async()=>events.push('renderer:close')});
  return {h,source,owner,project,events,root,chrome,classes,get locked(){return locked;}};
}
test('real presentation entry/exit methods retain source/document state, restore layout and release playback without dirtying',async()=>{
  const f=fixture(),before=structuredClone(f.project);await f.h.enter();assert.equal(f.h.active,true);assert.equal(f.locked,true);assert.equal(f.chrome.inert,true);assert.equal(f.root.hidden,false);await f.h.exit();assert.equal(f.h.busy,false);assert.equal(f.locked,false);assert.equal(f.chrome.inert,false);assert.equal(f.root.hidden,true);assert.deepEqual(f.project,before);assert.deepEqual(f.events.filter(Array.isArray).filter(e=>e[0]==='native'),[['native',true],['native',false]]);assert.equal(f.events.at(-1),'resume');
});
test('hidden qualification entry returns before suspending, preparing or changing layout',async()=>{
  const f=fixture();f.h.context.api.startupInfo=async()=>({hidden:true});await f.h.enter();assert.deepEqual(f.events,[]);assert.equal(f.h.busy,false);assert.equal(f.root.hidden,true);
});
test('an open dialog refuses presentation before any source, layout or native action',async()=>{
  const f=fixture();document.querySelector=()=>({open:true});await assert.rejects(f.h.enter(),/Close the open dialog/);assert.deepEqual(f.events,[]);assert.equal(f.h.busy,false);
});
test('exit during pending fullscreen entry awaits native ownership then restores instead of leaving fullscreen behind',async()=>{
  const f=fixture(),native=deferred();f.h.context.api.presentationWindow=async enabled=>{f.events.push(['native',enabled]);if(enabled)return native.promise;return false;};
  const entry=f.h.enter(),rejected=assert.rejects(entry,/cancelled/i);await until(()=>f.h.nativeRequest);const exit=f.h.exit();assert.equal(f.h.busy,true);assert.equal(f.events.includes('resume'),false);native.resolve(true);await exit;await rejected;assert.equal(f.root.hidden,true);assert.equal(f.locked,false);assert.deepEqual(f.events.filter(Array.isArray).filter(e=>e[0]==='native'),[['native',true],['native',false]]);
});
test('exit waits for cancelled encoder cleanup before unlocking or restoring the workspace',async()=>{
  const f=fixture(),gate=deferred();f.h.record=async()=>{f.h.exporter={cancel:()=>f.events.push('cancel:encoder')};await gate.promise;f.events.push('encoder:closed');f.h.exporter=null;};
  const entry=f.h.enter({record:true}),rejected=assert.rejects(entry,/cancelled/i);await until(()=>f.h.exporter);const exit=f.h.exit();await tick();assert.equal(f.locked,true);assert.equal(f.events.includes('resume'),false);gate.resolve();await exit;await rejected;assert.ok(f.events.indexOf('encoder:closed')<f.events.findIndex(e=>Array.isArray(e)&&e[0]==='lock'&&e[1]===false));assert.equal(f.locked,false);
});
test('rapid repeated entry cannot allocate duplicate presentation/native owners',async()=>{
  const f=fixture(),startup=deferred();f.h.context.api.startupInfo=()=>startup.promise;const a=f.h.enter(),b=f.h.enter();startup.resolve({hidden:false});await Promise.all([a,b]);assert.equal(f.events.filter(e=>e==='suspend').length,1);assert.equal(f.events.filter(e=>Array.isArray(e)&&e[0]==='native'&&e[1]).length,1);await f.h.exit();
});

test('presentation preparation defers progress for 400 ms and exit retires its pending message',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(),gate=deferred();f.h.context.evaluateMany=()=>gate.promise;
  const entry=f.h.enter(),rejected=assert.rejects(entry,/cancel/i);await tick();
  t.mock.timers.tick(399);assert.equal(f.h.status.textContent,'');
  t.mock.timers.tick(1);assert.match(f.h.status.textContent,/Preparing presentation/);
  await f.h.exit();f.h.status.textContent='After exit';t.mock.timers.tick(1000);assert.equal(f.h.status.textContent,'After exit');
  gate.resolve([8,.8]);await rejected;
});
