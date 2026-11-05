import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ConstructGallery,CONSTRUCT_TOOLS,matchesConstructTool,readConstructRecent,recentConstructTools,constructToolReason,mountConstructGallery} from '../ui/construct-gallery.mjs';
import {DiscoverabilityControls} from '../ui/discoverability-controls.mjs';
import {revealCommand} from '../ui/command-index.mjs';
const {reveal}=createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

class Element{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs={};this.className='';this.hidden=false;this.disabled=false;this.value='';this.events={};this.ownText='';this.id='';}
  get classList(){const node=this;return {contains:c=>node.className.split(' ').includes(c),add(...names){node.className=[...new Set([...node.className.split(' ').filter(Boolean),...names])].join(' ');},remove(c){node.className=node.className.split(' ').filter(x=>x!==c).join(' ');}};}
  get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
  set textContent(value){this.ownText=value;this.replaceChildren();}
  get isConnected(){return this.ownerDocument.body.contains(this);}
  get nextElementSibling(){const nodes=this.parentElement?.children??[];return nodes[nodes.indexOf(this)+1]??null;}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;}}
  before(node){const parent=this.parentElement;node.remove();parent.children.splice(parent.children.indexOf(this),0,node);node.parentElement=parent;}
  replaceChildren(...nodes){for(const node of [...this.children])node.remove();this.append(...nodes);}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  setAttribute(name,value){this.attrs[name]=value;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
  getAttribute(name){return this.attrs[name]??null;}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part===':disabled')return this.disabled;
    if(part.includes(':not(.group-help)'))return !this.classList.contains('group-help')&&this.matches(part.replace(':not(.group-help)',''));
    if(part.startsWith('#'))return this.id===part.slice(1);if(part.startsWith('.'))return this.classList.contains(part.slice(1));
    if(part.startsWith('[')){const [,key,value]=part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);return key.startsWith('data-')?(value===undefined?key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()) in this.dataset:this.getAttribute(key)===value):key in this.attrs;}
    return this.tagName===part.toUpperCase();});}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){if(selector===':scope > summary')return this.children.filter(n=>n.tagName==='SUMMARY');const found=[];for(const node of this.children){if(node.matches(selector))found.push(node);found.push(...node.querySelectorAll(selector));}return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  click(){if(this.disabled)return;this.onclick?.();for(const fn of this.events.click??[])fn({target:this});}
  focus(){this.ownerDocument.activeElement=this;}
  scrollIntoView(){}
}
function fixture(){
  const doc={createElement:tag=>new Element(doc,tag),createElementNS:(_ns,tag)=>new Element(doc,tag),querySelector:selector=>doc.body.querySelector(selector),getElementById:id=>doc.body.querySelector('#'+id)};doc.body=doc.createElement('body');doc.body.className='inspector-hidden';
  const node=(tag,id,text='')=>{const n=doc.createElement(tag);n.id=id;n.textContent=text;return n;},panel=node('div','construct-panel');panel.className='inspector-panel';doc.body.append(panel);
  const tab=node('button','construct-tab');tab.setAttribute('data-panel','construct');tab.onclick=()=>panel.hidden=false;const toggle=node('button','toggle-inspector');toggle.onclick=()=>doc.body.classList.remove('inspector-hidden');doc.body.append(tab,toggle);
  const core=node('section','');core.className='inspector-card';const dual=node('button','make-dual'),dualOptions=node('details','dual-options-settings');dualOptions.append(node('summary','','Dual center and radius'),node('input','incidence-dual-radius'));const label=node('label','');label.append(node('input','truncation'));core.append(dual,dualOptions,label,node('button','truncate'));panel.append(core);
  const makeRoot=(id,title,action)=>{const root=node('details',id);root.append(node('summary','',title),node('button',action));return root;};
  const expansion=makeRoot('expansion-settings','Expand / runcinate (3D / 4D)','make-expansion'),fit=node('section','fitting-settings');fit.append(node('button','make-faces-regular'));const fitOptions=node('details','fitting-options');fitOptions.append(node('summary','','Fitting options'),node('input','fitting-solver'));fit.append(fitOptions);
  const group=node('section','fit-refine-controls');group.append(expansion,fit);panel.append(group);
  panel.append(makeRoot('face-conway-settings','Face subdivision and Conway','conway-apply'),makeRoot('future-tool-settings','Future technical tool','future-action'));
  const source={dimension:4},values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},calls=[];
  const win=doc.defaultView={localStorage:storage,addEventListener(){}};
  const gallery=new ConstructGallery(doc,{getModel:()=>source,window:win,guide:{show:topic=>calls.push(topic)}});
  return {doc,gallery,source,storage,values,win,calls,dual,dualOptions,label,fit,fitOptions,expansion};
}

test('search accepts plain names, technical terms, synonyms, punctuation and combined words',()=>{
  const cut=CONSTRUCT_TOOLS.find(t=>t.id==='gallery-truncate');for(const query of ['cut corners','TRUNCATE','rectification','bevel','change shape'])assert.ok(matchesConstructTool(cut,query),query);
  assert.equal(matchesConstructTool(cut,'torus'),false);assert.ok(matchesConstructTool(CONSTRUCT_TOOLS.find(t=>t.id==='wythoff-model-settings'),'Coxeter / Wythoff'));
  assert.equal(new Set(CONSTRUCT_TOOLS.map(t=>t.id)).size,CONSTRUCT_TOOLS.length);
});
test('recent tools are bounded, deduplicated and resilient to invalid or denied storage',()=>{
  const allowed=new Set(['a','b','c','d','e']);assert.deepEqual(recentConstructTools(['a','b','c','d'],'b',allowed),['b','a','c','d']);
  assert.deepEqual(readConstructRecent({getItem:()=> '["b","b","gone",3,"a"]'},allowed),['b','a']);
  for(const value of ['{','null','42','{}'])assert.deepEqual(readConstructRecent({getItem:()=>value},allowed),[]);
  assert.deepEqual(readConstructRecent({getItem(){throw Error('denied');}},allowed),[]);
});
test('cards reuse live disabled reasons and distinguish dimension restrictions',()=>{
  const tool={dimensions:[3,4]},action={disabled:true,dataset:{disabledReason:'At most 64 vertices.'}};
  assert.equal(constructToolReason(tool,{dimension:3},action),'At most 64 vertices.');assert.match(constructToolReason(tool,{dimension:2},action),/3D or 4D/);
  assert.equal(constructToolReason(tool,{dimension:4},{disabled:false}),'');assert.match(constructToolReason(tool,null,action),/Open a model/);
  assert.match(constructToolReason({},null,{matches:()=>true}),/Unavailable/);
});
test('mount preserves node identity and handlers, and places every original field in one pane',()=>{
  const f=fixture();let ran=0;f.dual.onclick=()=>ran++;assert.equal(f.doc.getElementById('make-dual'),f.dual);assert.equal(f.gallery.find(f.dual).id,'gallery-dual');
  assert.equal(f.gallery.find(f.label.children[0]).id,'gallery-truncate');assert.ok(f.fit.contains(f.fitOptions));assert.equal(f.fitOptions.open,undefined);
  assert.equal(f.gallery.tools.filter(t=>t.pane&&!t.pane.hidden).length,0);assert.equal(mountConstructGallery(f.doc,{}),null);assert.equal(ran,0);
  f.win.openConstructTool(f.dual);assert.equal(ran,0);f.dual.click();assert.equal(ran,1);
});
test('one pane opens by any existing element id, expanding its own options before focus',()=>{
  const f=fixture();assert.equal(f.win.openConstructTool('fitting-solver'),true);const fit=f.gallery.find('fitting-settings');assert.equal(f.fitOptions.open,true);assert.equal(f.gallery.active,fit);assert.equal(f.doc.activeElement,fit.title);
  assert.equal(f.doc.body.classList.contains('inspector-hidden'),false);f.win.openConstructTool('make-expansion');assert.equal(fit.pane.hidden,true);assert.equal(f.gallery.tools.filter(t=>t.pane&&!t.pane.hidden).length,1);
  f.gallery.back();assert.equal(f.gallery.overview.hidden,false);assert.equal(f.doc.activeElement,f.gallery.find('make-expansion').card);assert.equal(f.win.openConstructTool('missing'),false);
});
test('search filters categories and preserves the current search when returning from a tool',()=>{
  const f=fixture();f.gallery.search.value='runcinate';f.gallery.sync();assert.equal(f.gallery.tools.filter(t=>!t.card.hidden).length,1);assert.equal(f.gallery.categoryNodes[0].root.hidden,false);assert.equal(f.gallery.categoryNodes[1].root.hidden,true);
  f.gallery.open('make-expansion');f.gallery.back();assert.equal(f.gallery.search.value,'runcinate');f.gallery.search.value='no such tool';f.gallery.sync();assert.equal(f.gallery.empty.hidden,false);
});
test('dimension and existing action availability refresh without changing action restrictions',()=>{
  const f=fixture(),conway=f.gallery.find('conway-apply');assert.equal(conway.card.disabled,true);assert.match(conway.reason.textContent,/3D/);f.source.dimension=3;f.gallery.sync();assert.equal(conway.card.disabled,false);
  assert.ok(f.gallery.unavailableGroups.size);for(const group of f.gallery.unavailableGroups.values())assert.equal(group.root.dataset.guideTopic,'construction');
  const action=f.doc.getElementById('make-expansion');action.disabled=true;action.dataset.disabledReason='Finish export first.';f.gallery.sync();assert.equal(f.gallery.find(action).card.disabled,true);assert.equal(action.disabled,true);assert.equal(f.gallery.find(action).reason.textContent,'Finish export first.');
});
test('pane help maps to the original Guide and unknown groups retain an expert card',()=>{
  const f=fixture();f.gallery.find('fitting-settings').pane.querySelector('.construct-pane-help').click();assert.deepEqual(f.calls,['expansion']);
  const future=f.gallery.find('future-action');assert.equal(future.category,5);assert.equal(future.card.getAttribute('data-expert'),'');assert.equal(future.root.id,'future-tool-settings');assert.ok(matchesConstructTool(future,'technical'));
});
test('external Shape builder is hidden until registered and does not change the active pane',()=>{
  const f=fixture(),builder=f.gallery.find('shape-builder');assert.equal(builder.card.hidden,true);assert.equal(f.win.openConstructTool('shape-builder'),false);
  let opens=0;f.win.openCoxeterBuilder=()=>opens++;f.gallery.sync();assert.equal(builder.card.hidden,false);assert.equal(f.win.openConstructTool(),false);builder.card.click();assert.equal(opens,1);assert.equal(f.gallery.active,null);
});
test('recent row persists the last four tools and survives failed writes',()=>{
  const f=fixture();for(const id of ['make-dual','truncate','make-expansion','fitting-settings','conway-apply'])f.gallery.open(id);
  assert.deepEqual(JSON.parse(f.values.get('polytope.construct.recent')),['face-conway-settings','fitting-settings','expansion-settings','gallery-truncate']);
  f.storage.setItem=()=>{throw Error('denied');};assert.doesNotThrow(()=>f.gallery.open('make-dual'));assert.equal(f.gallery.recent.length,4);
});
test('palette ignores a closed pane as a restriction, but retains genuinely hidden and disabled state',()=>{
  const f=fixture(),palette=Object.create(DiscoverabilityControls.prototype);assert.equal(palette.reason(f.dual),'');
  f.dual.hidden=true;assert.match(palette.reason(f.dual),/hidden/);f.dual.hidden=false;f.dual.disabled=true;f.dual.dataset.disabledReason='Not supported.';assert.equal(palette.reason(f.dual),'Not supported.');
});
test('palette reveal and shared smoke reveal open the matching pane and nested disclosures',async()=>{
  const f=fixture(),target=f.doc.getElementById('fitting-solver');revealCommand(target);assert.equal(f.gallery.active.id,'fitting-settings');assert.equal(f.doc.activeElement,target);
  f.gallery.back();const previous=globalThis.window;globalThis.window=f.win;
  try{const locator={evaluate:async fn=>fn(target)};assert.equal(await reveal({},locator),locator);assert.equal(f.gallery.active.id,'fitting-settings');assert.equal(f.fitOptions.open,true);}finally{globalThis.window=previous;}
});

test('unavailable cards share a closed reason group below available categories and recover on source changes',()=>{
  const f=fixture(),conway=f.gallery.find('conway-apply'),group=conway.card.closest('details');
  assert.equal(group.open,false);assert.equal(group.querySelector('summary').textContent,'Needs a 3D model (1)');assert.equal(conway.reason.hidden,true);
  assert.equal(f.gallery.unavailableRoot.children.includes(group),true);assert.equal(f.gallery.overview.children.indexOf(f.gallery.unavailableRoot)>f.gallery.overview.children.indexOf(f.gallery.categoryRoot),true);
  f.gallery.search.value='Conway';f.gallery.sync();assert.equal(f.gallery.empty.hidden,true);assert.equal(conway.card.hidden,false);
  f.source.dimension=3;f.gallery.sync();assert.equal(conway.card.parentElement,f.gallery.categoryNodes[0].grid);assert.equal(group.hidden,true);assert.equal(conway.card.disabled,false);
  f.source.dimension=4;f.gallery.sync();assert.equal(conway.card.closest('details'),group);assert.equal(conway.card.disabled,true);
  f.gallery.remember(conway.id);assert.equal(f.gallery.recentRoot.hidden,true);
});
