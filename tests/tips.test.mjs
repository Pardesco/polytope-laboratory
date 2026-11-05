import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseTip,Tips,TIPS} from '../ui/tips.mjs';
import {revealWalkthrough} from '../ui/welcome-reveal.mjs';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
test('ten useful tips rotate once per session, including across renderer reloads',()=>{
  const local=storage(),session=storage();assert.equal(TIPS.length,10);
  assert.deepEqual(chooseTip(local,session),{index:0,dismissed:false});
  assert.deepEqual(chooseTip(local,session),{index:0,dismissed:false});
  for(let index=1;index<=TIPS.length;index++)assert.equal(chooseTip(local,storage()).index,index%TIPS.length);
});
test('malformed and unavailable preferences never block startup',()=>{
  const bad={getItem:()=>'{bad',setItem:()=>{throw Error();}};assert.equal(chooseTip(bad,bad).index,0);
  const denied={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};assert.equal(chooseTip(denied,denied).index,0);
});
function fixture(local=storage(),session=storage()){
  const nodes={},classes=new Set(),host={classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key),remove:key=>classes.delete(key)}};
  const doc={getElementById:()=>({parentElement:host,after:root=>nodes.root=root}),createElement:()=>({append(){},setAttribute(){}})};
  return {tips:new Tips({document:doc,storage:local,session}),local,session,classes};
}
test('hidden qualification never chooses, shows or advances a tip',()=>{
  const denied={getItem:()=>assert.fail('hidden mode reads no tip preferences'),setItem:()=>assert.fail('hidden mode writes no tip preferences')};
  const {tips,classes}=fixture(denied,denied);tips.start({hidden:true});assert.equal(tips.root.hidden,true);assert.equal(classes.size,0);assert.equal(tips.tip,undefined);
});
test('mounted dismissal survives reload for the session and the next session has a new tip',()=>{
  const {tips,classes,local,session}=fixture();tips.start();assert.equal(tips.text.textContent,TIPS[0]);assert.ok(classes.has('has-workspace-tip'));
  tips.dismiss.onclick();assert.equal(tips.root.hidden,true);assert.equal(classes.size,0);tips.start();assert.equal(tips.root.hidden,true);
  const reload=fixture(local,session);reload.tips.start();assert.equal(reload.tips.root.hidden,true);
  const next=fixture(local,storage());next.tips.start();assert.equal(next.tips.root.hidden,false);assert.equal(next.tips.text.textContent,TIPS[1]);
});
test('repeated starts with denied storage retain one tip and dismissal in memory',()=>{
  const denied={getItem:()=>{throw Error();},setItem:()=>{throw Error();}},f=fixture(denied,denied);
  f.tips.start();f.tips.start();assert.equal(f.tips.tip.index,0);f.tips.dismiss.onclick();f.tips.start();assert.equal(f.tips.root.hidden,true);
});
test('missing counts strip safely leaves tips unmounted',()=>{
  const tips=new Tips({document:{getElementById:()=>null},storage:{},session:{}});assert.doesNotThrow(()=>tips.start());
});
function revealFixture(matches={}){
  const calls=[],nodes={},anchor={closest:selector=>matches[selector]??null};
  const doc={getElementById:id=>nodes[id]},win={openConstructTool:(...args)=>calls.push(['construct',...args])};
  const run=()=>revealWalkthrough(anchor,{document:doc,window:win,reveal:node=>calls.push(['reveal',node])});
  return {calls,nodes,anchor,run};
}
test('walkthrough reveal opens gallery before delegating to app chrome and panel reveal',()=>{
  const f=revealFixture();f.run();assert.deepEqual(f.calls,[['construct',f.anchor,{focus:false}],['reveal',f.anchor]]);
});
test('walkthrough reveal opens More drawer with its existing handler',()=>{
  const drawer={id:'dual-morph-settings',open:false},f=revealFixture({'.chrome-overflow-drawer':drawer});
  f.nodes['open-dual-morph-settings']={click:()=>drawer.open=true};f.run();assert.equal(drawer.open,true);
});
test('walkthrough reveal restores hidden 4D pads through the visibility control',()=>{
  const f=revealFixture({'#direct-4d-gizmo':{}}),events=[];
  f.nodes['direct-4d-visible']={checked:false,dispatchEvent:event=>events.push(event.type)};f.run();f.run();
  assert.equal(f.nodes['direct-4d-visible'].checked,true);assert.deepEqual(events,['change']);
});
test('skipping export steps still opens initialized export UI and printable settings',()=>{
  const dialog={open:false},f=revealFixture({'#export-dialog':dialog,'#printable-settings':{}}),events=[];
  f.nodes['export-dialog']=dialog;f.nodes.export={click:()=>dialog.open=true};
  f.nodes['export-kind']={value:'intrinsic',dispatchEvent:event=>events.push(event.type)};f.run();f.run();
  assert.equal(dialog.open,true);assert.equal(f.nodes['export-kind'].value,'printable');assert.deepEqual(events,['change']);
});
