import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldShowWelcome,readWelcomeSetting,writeWelcomeSetting,WELCOME_SETTING,featuredView} from '../ui/welcome-state.mjs';
import {Walkthrough,WALKTHROUGHS} from '../ui/walkthrough.mjs';

test('fresh profiles show welcome; dismiss, qualification and project ownership suppress it',()=>{
  assert.equal(shouldShowWelcome(),true);
  for(const key of ['dismissed','hidden','opened','recovered','recoveryAvailable'])assert.equal(shouldShowWelcome({[key]:true}),false,key);
});
test('local preference persists only the opt-out and supports re-enabling',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  assert.equal(readWelcomeSetting(storage),false);writeWelcomeSetting(storage,true);assert.equal(values.get(WELCOME_SETTING),'dismissed');assert.equal(readWelcomeSetting(storage),true);
  writeWelcomeSetting(storage,false);assert.equal(readWelcomeSetting(storage),false);
});
test('unavailable local storage never blocks startup or dismissal',()=>{
  const storage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}};
  assert.equal(readWelcomeSetting(storage),false);assert.doesNotThrow(()=>writeWelcomeSetting(storage,true));assert.doesNotThrow(()=>writeWelcomeSetting(storage,false));
});
function fixture(missing=[]){const steps=[],ends=[],flow=new Walkthrough({find:id=>missing.includes(id)?null:{id},onStep:step=>steps.push(step),onEnd:reason=>ends.push(reason)});return {flow,steps,ends};}
const tour={id:'sample',steps:[{anchor:'a',event:'change',value:'edge'},{anchor:'b',event:'click'},{anchor:'c',text:'Finish'}]};
test('tour events advance only the active matching anchor, event and optional value',()=>{
  const {flow,steps}=fixture();flow.start(tour);assert.equal(flow.index,0);
  for(const event of [['b','change','edge'],['a','input','edge'],['a','change','face']])assert.equal(flow.event(...event),false);
  assert.equal(flow.event('a','change','edge'),true);assert.equal(flow.index,1);flow.event('b','click');assert.equal(flow.index,2);assert.equal(steps.length,3);
});
test('Next skips a step and completion clears the active tour',()=>{const {flow,ends}=fixture();flow.start(tour);flow.next();flow.next();assert.equal(flow.next(),false);assert.equal(flow.tour,null);assert.deepEqual(ends,['complete']);assert.equal(flow.next(),false);});
test('missing anchors skip safely, including an entirely unavailable tour',()=>{
  const {flow,steps,ends}=fixture(['a','b']);flow.start(tour);assert.equal(steps[0].index,2);flow.next();assert.deepEqual(ends,['complete']);
  const all=fixture(['a','b','c']);assert.equal(all.flow.start(tour),false);assert.equal(all.steps.length,0);assert.deepEqual(all.ends,['complete']);
});
test('exit is idempotent and late events do not restart a tour',()=>{const {flow,ends}=fixture();flow.start(tour);flow.stop();flow.stop();assert.equal(flow.event('a','change','edge'),false);assert.deepEqual(ends,['exit']);});
test('starting another tour retires the previous one',()=>{const {flow,ends}=fixture();flow.start(tour);flow.start(tour);assert.equal(flow.index,0);assert.deepEqual(ends,['replaced']);});
test('all eight walkthrough definitions have unique ids, explicit learning models and short anchored steps',()=>{
  assert.equal(WALKTHROUGHS.length,8);assert.equal(new Set(WALKTHROUGHS.map(t=>t.id)).size,8);
  for(const item of WALKTHROUGHS){assert.ok(item.key);assert.ok(item.steps.length>=3&&item.steps.length<=6);for(const step of item.steps){assert.ok(step.anchor);assert.ok(step.text);assert.ok(!step.event||['click','input','change'].includes(step.event));}}
});
test('curated gallery contains twelve unique catalog keys and honest dimensional captions',()=>{
  const entries=JSON.parse(readFileSync(new URL('../ui/welcome-gallery.json',import.meta.url)));assert.equal(entries.length,12);assert.equal(new Set(entries.map(e=>e.key)).size,12);
  for(const entry of entries){assert.ok(entry.name&&entry.caption);assert.ok([3,4].includes(entry.dimension));}
});
test('featured views use perspective only for 4D and return detached angle arrays',()=>{
  const a=featuredView(4),b=featuredView(4);assert.equal(a.projection,'perspective');assert.equal(featuredView(3).projection,'orthographic');a.angles[0]=999;assert.notEqual(a.angles[0],b.angles[0]);assert.equal(a.surfaceColors,'cell-type');
});
test('featured cards use data-featured-key so library [data-key] selectors stay unique',()=>{
  const source=readFileSync(new URL('../ui/welcome-controls.mjs',import.meta.url),'utf8');
  assert.match(source,/dataset\.featuredKey=entry\.key/);assert.match(source,/card\.dataset\.featuredKey/);assert.doesNotMatch(source,/dataset\.key\b/);assert.doesNotMatch(source,/data-key/);
});
