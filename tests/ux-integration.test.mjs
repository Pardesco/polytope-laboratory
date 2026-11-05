import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const {reveal}=createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

test('combined smoke reveal uses the target document, chrome event and gallery before opening owning details',async()=>{
  const calls=[],classes=new Set();
  class RevealEvent{constructor(type,options){this.type=type;Object.assign(this,options);}}
  const doc={body:{classList:{add:value=>classes.add(value)}},defaultView:{Event:RevealEvent,
    openConstructTool:(node,options)=>{assert.equal(node,element);assert.deepEqual(options,{focus:false});calls.push('gallery');}}};
  const group=(name,parent)=>({parentElement:parent?{closest:()=>parent}:null,
    querySelector:()=>({contains:()=>false}),set open(value){assert.equal(value,true);calls.push(name);}});
  const outer=group('outer'),inner=group('inner',outer);
  const element={ownerDocument:doc,closest:selector=>selector==='details'?inner:{},
    dispatchEvent:event=>{assert.ok(event instanceof RevealEvent);assert.equal(event.type,'app-chrome-reveal');assert.equal(event.bubbles,true);calls.push('chrome');}};
  const target={evaluate:fn=>fn(element)};
  assert.equal(await reveal(null,target),target);
  assert.deepEqual([...classes],['expert-mode']);assert.deepEqual(calls,['chrome','gallery','outer','inner']);
});

test('combined smoke reveal leaves a summary owning disclosure closed and opens its ancestors',async()=>{
  const opened=[],outer={querySelector:()=>({contains:()=>false}),set open(value){if(value)opened.push('outer');}};
  const inner={parentElement:{closest:()=>outer},querySelector:()=>({contains:()=>true}),set open(_){assert.fail('Summary must retain its toggle behavior.');}};
  const element={closest:selector=>selector==='details'?inner:null};
  await reveal(null,{evaluate:fn=>fn(element)});assert.deepEqual(opened,['outer']);
});

test('combined smoke reveal tolerates an unmounted optional gallery without browser globals',async()=>{
  const events=[],element={ownerDocument:{body:{classList:{add(){assert.fail('Ordinary target is not expert.');}}}},
    closest:selector=>selector==='[data-construct-tool]'?{}:null,dispatchEvent:event=>events.push(event.type)};
  await reveal(null,{evaluate:fn=>fn(element)});assert.deepEqual(events,['app-chrome-reveal']);
});

test('actual viewport dismissal preserves shelf state under modal help and presentation overlays',()=>{
  const source=readFileSync(new URL('../ui/viewport-controls.mjs',import.meta.url),'utf8');
  const code=source.slice(source.indexOf("const panels='.workspace-shelf > details'"),source.indexOf('const canvas=this.context.base.renderer.domElement'));
  const events={},drawer={open:true,setAttribute(){}},presentation={hidden:true};let modal=false;
  const document={querySelectorAll:()=>[drawer],querySelector:()=>modal?{}:null,getElementById:()=>presentation,addEventListener:(type,fn)=>events[type]=fn};
  runInNewContext(code,{document});
  const escape=()=>events.keydown({key:'Escape'}),outside=()=>events.pointerdown({target:{closest:()=>null}});
  modal=true;escape();outside();assert.equal(drawer.open,true);
  modal=false;presentation.hidden=false;escape();outside();assert.equal(drawer.open,true);
  presentation.hidden=true;events.pointerdown({target:{closest:()=>({})}});assert.equal(drawer.open,true);
  escape();assert.equal(drawer.open,false);drawer.open=true;outside();assert.equal(drawer.open,false);
});
