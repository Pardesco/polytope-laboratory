import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCommandIndex,fuzzyScore,rankCommands,moveCommandSelection,revealCommand} from '../ui/command-index.mjs';
import {DiscoverabilityControls} from '../ui/discoverability-controls.mjs';
import {guideContext,GUIDE_TOPICS,GROUP_GUIDE_TOPICS} from '../ui/user-guide.mjs';
import {bindings,shortcutTable,matchesShortcut} from '../ui/shortcut-bindings.mjs';
import {MemoryControls} from '../ui/memory-controls.mjs';
import {TourControls} from '../ui/tour-controls.mjs';
import {createRequire} from 'node:module';
const {runDiscoveryMenu}=createRequire(import.meta.url)('../desktop/discovery-menu.cjs');

const fixture=()=>buildCommandIndex({
  actions:[{id:'save',label:'Save project',path:['File'],disabled:true,reason:'Open a model first.'}],
  controls:[{id:'reflect',label:'Reflect first coordinate',path:['Construct','Scale, reflect and extrude']},{id:'projection',label:'4D projection: Orthographic',path:['Workspace']}],
  library:[{id:'24cell',label:'Open: 24-cell',path:['Library','Regular 4D'],keywords:'icositetrachoron'}],
  topics:[{id:'guide',label:'Guide: Constructions',path:['Guide']}]
});
test('plain DOM records, actions, full catalog and guide form a deduplicated index with location and availability',()=>{
  const index=fixture();assert.equal(index.length,5);assert.equal(index[1].path,'Construct › Scale, reflect and extrude');
  assert.equal(index[0].disabled,true);assert.equal(index[0].reason,'Open a model first.');
  assert.equal(rankCommands(index,'icositetrachoron')[0].id,'24cell');
  assert.equal(buildCommandIndex({actions:[...index,index[0],{label:'No ID'}]}).length,5);
});
test('fuzzy search prioritizes label matches, accepts subsequences and uses group paths',()=>{
  const index=fixture();assert.equal(rankCommands(index,'ref')[0].id,'reflect');assert.equal(rankCommands(index,'construct reflect')[0].id,'reflect');
  assert.equal(rankCommands(index,'24 cl')[0].id,'24cell');assert.equal(rankCommands(index,'doesnotexist').length,0);
  assert.ok(fuzzyScore('reflect',index[1])>fuzzyScore('rflct',index[1]));
  assert.deepEqual(rankCommands(index,''),index);assert.equal(rankCommands(index,'',2).length,2);
});
test('selection wraps safely and empty searches have no active row',()=>{
  assert.equal(moveCommandSelection(0,-1,5),4);assert.equal(moveCommandSelection(4,1,5),0);assert.equal(moveCommandSelection(-1,1,5),0);assert.equal(moveCommandSelection(0,1,0),-1);
});
test('revealing a live target opens the sidebar, tab and every outer-to-inner disclosure before focus',()=>{
  const events=[],root={id:'inspector-region'},panel={id:'construct-panel',classList:{contains:s=>s==='inspector-panel'},parentElement:root};
  const outer={tagName:'DETAILS',parentElement:panel,set open(value){events.push(['outer',value]);}},inner={tagName:'DETAILS',parentElement:outer,set open(value){events.push(['inner',value]);}};
  const target={parentElement:inner,scrollIntoView:()=>events.push('scroll'),focus:()=>events.push('focus'),classList:{add:c=>events.push(c)}};
  revealCommand(target,{showRegion:region=>events.push(region),activatePanel:id=>events.push(id)});
  assert.deepEqual(events,['inspector','construct',['outer',true],['inner',true],'scroll','focus','command-highlight']);
});
test('stale or newly disabled palette commands cannot execute, enabled commands run their existing callback once',()=>{
  let ran=0,closed=0,rendered=0,current={id:'save',run:()=>ran++};const palette=Object.create(DiscoverabilityControls.prototype);
  Object.assign(palette,{index:()=>current?[current]:[],dialog:{close:()=>closed++},context:{guard:fn=>fn},render:()=>rendered++});
  palette.execute({id:'save'});assert.equal(ran,1);assert.equal(closed,1);assert.equal(palette.restoreFocus,false);
  current.disabled=true;palette.execute({id:'save'});current=null;palette.execute({id:'save'});assert.equal(ran,1);assert.equal(rendered,2);
});
test('every mapped inspector help topic exists and group help falls back to the owning tab',()=>{
  for(const id of Object.values(GROUP_GUIDE_TOPICS))assert.ok(GUIDE_TOPICS.some(t=>t.id===id),id);
  assert.equal(guideContext({id:'metadata-license',parentElement:{id:'project-metadata-settings'}}),'metadata');
  assert.equal(guideContext({id:'future-tool-settings',parentElement:{id:'construct-panel'}}),'construction');
  assert.equal(guideContext({id:'net-paper-width'}),'nets');
});
test('shortcut sheet is generated from native and renderer bindings, including every memory and tour command',()=>{
  const rows=shortcutTable();assert.equal(rows.length,Object.values(bindings).filter(item=>item.keys.length).length);
  assert.match(rows.find(row=>row.id==='commands').keys,/Shift\+P/);assert.match(rows.find(row=>row.id==='memorySwap').keys,/Alt\+Shift\+1 … Alt\+Shift\+9/);
  for(const id of ['new','open','undo','help','tourPrev','tourNext','tourPlay','tourAdd'])assert.ok(rows.some(row=>row.id===id));
  assert.deepEqual(shortcutTable({custom:{label:'Custom action',keys:['F8'],scope:'Test'}}),[{id:'custom',label:'Custom action',keys:'F8',scope:'Test'}]);
});
test('palette and sheet shortcuts match exact modifiers without swallowing text or AltGraph combinations',()=>{
  assert.ok(matchesShortcut({key:'k',ctrlKey:true},bindings.commands.keys[0]));assert.ok(matchesShortcut({key:'P',metaKey:true,shiftKey:true},bindings.commands.keys[1]));
  assert.ok(matchesShortcut({key:'?',shiftKey:true},bindings.shortcuts.keys[0]));assert.ok(!matchesShortcut({key:'k',ctrlKey:true,altKey:true},bindings.commands.keys[0]));
  assert.ok(matchesShortcut({key:'/',shiftKey:true},bindings.shortcuts.keys[0]));
  assert.ok(!matchesShortcut({key:'k',ctrlKey:true,getModifierState:()=>true},bindings.commands.keys[0]));assert.ok(!matchesShortcut({key:'k',ctrlKey:true,repeat:true},bindings.commands.keys[0]));
});
test('memory and tour handlers consume the same bindings displayed in the sheet',()=>{
  const previous=globalThis.document;globalThis.document={querySelector:()=>null};const calls=[];
  try{
    const memory=Object.create(MemoryControls.prototype);Object.assign(memory,{context:{},actions:Object.fromEntries(['open','store','swap'].map(id=>[id,slot=>calls.push([id,slot])]))});
    for(const [mods,key] of [[{altKey:true},'2'],[{altKey:true,ctrlKey:true},'3'],[{altKey:true,shiftKey:true},'!']])memory.onKey({...mods,key,code:'Digit'+(key==='!'?'1':key),preventDefault(){}});
    const tour=Object.create(TourControls.prototype);Object.assign(tour,{context:{},actions:{next:()=>calls.push(['next'])}});tour.onKey({key:'ArrowRight',ctrlKey:true,altKey:true,preventDefault(){}});
    assert.deepEqual(calls,[['open',2],['store',3],['swap',1],['next']]);
  }finally{globalThis.document=previous;}
});
test('native menu palette bridge restricts commands and closes through the existing unsaved-change handler',()=>{
  const calls=[],context={window:{close:()=>calls.push('close'),webContents:{copy:()=>calls.push('copy'),getZoomLevel:()=>0,setZoomLevel:value=>calls.push(value)}},app:{getVersion:()=> 'test'},dialog:{showMessageBox:()=>calls.push('about')}};
  for(const id of ['quit','copy','about','zoomIn','resetZoom'])runDiscoveryMenu(id,context);assert.deepEqual(calls,['close','copy','about',1,0]);
  for(const id of ['save','arbitrary',null,{},'__proto__'])assert.throws(()=>runDiscoveryMenu(id,context),/supported menu command/);
});
