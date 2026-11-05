import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LibraryCollections} from '../ui/library-collections.mjs';
import {libraryFamilyLabel,libraryProvenance} from '../ui/library-visual.mjs';
import {createRequire} from 'node:module';
const {reveal}=createRequire(import.meta.url)('../scripts/smoke-helpers.cjs');

class Node{
  constructor(doc,tag){Object.assign(this,{ownerDocument:doc,tagName:tag.toUpperCase(),children:[],attrs:{},dataset:{},style:{},events:{},value:'',isConnected:true});this.classList={toggle(){}};}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
  append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
  prepend(node){this.append(node);this.children=[node,...this.children.filter(n=>n!==node)];}
  before(node){this.insert(node,0);}after(node){this.insert(node,1);}
  insert(node,offset){node.remove();const parent=this.parentElement,index=parent.children.indexOf(this);node.parentElement=parent;parent.children.splice(index+offset,0,node);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(key,value){this.attrs[key]=String(value);}getAttribute(key){return this.attrs[key]??null;}removeAttribute(key){delete this.attrs[key];}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
  dispatchEvent(event){for(const fn of this.events[event.type]??[])fn(event);this['on'+event.type]?.(event);}
  click(){if(!this.disabled)this.dispatchEvent({type:'click'});}
  focus(){this.ownerDocument.activeElement=this;}
  closest(selector){return selector==='details'?(this.tagName==='DETAILS'?this:this.parentElement?.closest(selector)??null):null;}
  contains(node){return this===node||this.children.some(n=>n.contains(node));}
  querySelector(selector){return selector===':scope > summary'?this.children.find(n=>n.tagName==='SUMMARY'):null;}
  getBoundingClientRect(){return {right:218,top:64};}get offsetHeight(){return 220;}
}
function fixture(){
  const doc={createElement:tag=>new Node(doc,tag),createElementNS:(_ns,tag)=>new Node(doc,tag),addEventListener(){},defaultView:{Event}};
  doc.body=doc.createElement('body');doc.getElementById=id=>{const visit=n=>n.id===id?n:n.children.map(visit).find(Boolean);return visit(doc.body);};
  const make=(tag,id,parent=doc.body)=>{const n=doc.createElement(tag);n.id=id;parent.append(n);return n;};
  const rail=make('aside','library-region');for(const id of ['library-count','search','library-family','library-audit-filter','library-properties','catalog','link-library'])make(id==='search'?'input':'div',id,rail);
  const original=doc.getElementById('link-library');let links=0,builds=0,changes=0;original.onclick=()=>links++;
  const menu=make('details','app-options');make('summary','app-options-button',menu);make('div','app-options-panel',menu);
  const controls=new LibraryCollections({document:doc,thumbnails:{reset(){},setVersion(){},watch(){},unwatch(){}},change:()=>changes++,getBuilder:()=>()=>builds++});
  return {doc,rail,menu,original,controls,links:()=>links,builds:()=>builds,changes:()=>changes,node:id=>doc.getElementById(id)};
}
const entries=[{key:'cube',name:'Cube',family:'Platonic',dimension:3}];

test('hero precedes search and retains the builder identity, callback and ringed three-node diagram',()=>{
  const f=fixture(),button=f.node('library-build-symmetry'),svg=button.children[0];
  assert.ok(f.rail.children.indexOf(button)<f.rail.children.indexOf(f.node('search').parentElement));
  assert.equal(button.children[1].textContent,'Build from symmetry');assert.equal(button.children[2].textContent,'Coxeter diagrams to any uniform polytope');
  assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.children.filter(n=>n.tagName==='CIRCLE').length,4);
  button.onclick();assert.equal(f.builds(),1);
});

test('search shows localized labeled counts while retaining the numeric smoke hook; clear dispatches the existing input handler',()=>{
  const f=fixture(),search=f.node('search'),clear=f.node('library-search-clear');let inputs=0;search.oninput=()=>inputs++;
  f.controls.updateCount(1594);assert.equal(f.node('library-result-count').textContent,(1594).toLocaleString()+' shapes');assert.equal(f.node('library-count').textContent,'1594');assert.equal(clear.hidden,true);
  search.value='dim:4';search.dispatchEvent(new Event('input'));assert.equal(clear.hidden,false);
  clear.onclick();assert.equal(inputs,2);assert.equal(search.value,'');assert.equal(clear.hidden,true);assert.equal(f.doc.activeElement,search);
  f.controls.updateCount(1);assert.equal(f.node('library-result-count').textContent,'1 shape');
  f.controls.updateCount(0);assert.equal(f.node('library-result-count').textContent,'0 shapes');
});

test('OFF linking moves the original node into More and Collections footer invokes its existing handler',async()=>{
  const f=fixture();f.controls.mountOverflow();assert.equal(f.node('link-library'),f.original);assert.equal(f.original.parentElement,f.node('app-options-panel'));
  await reveal(null,{evaluate:fn=>fn(f.original)});assert.equal(f.menu.open,true);f.original.click();assert.equal(f.links(),1);assert.equal(f.menu.open,false);
  f.controls.prepare(entries);const link=f.node('library-link-local'),section=f.node('library-collections');assert.equal(section.children.at(-1),link);
  link.onclick();assert.equal(f.links(),2);assert.equal(f.menu.open,false);
  f.original.disabled=true;link.onclick();assert.equal(f.links(),2);
});

test('provenance leaves family labels readable without mutating searchable source classifications',()=>{
  const entry={family:'convex uniform (Miratope source)',sourceClassification:'Unverified supplied label'};
  assert.equal(libraryFamilyLabel(entry),'Convex uniform');assert.equal(libraryProvenance(entry),'Miratope source · Unverified supplied label');assert.match(entry.family,/Miratope source/);
  assert.equal(libraryFamilyLabel({family:'nonconvex uniform (Miratope source)'}),'Nonconvex uniform');
  assert.equal(libraryFamilyLabel({family:'Near-miss Johnson solids'}),'Near-miss Johnson solids');assert.equal(libraryFamilyLabel({}),'Linked OFF');
  assert.equal(libraryProvenance({source:'Miratope MIT attributed source catalog',sourceClassification:'unverified'}),'Miratope MIT attributed source catalog · unverified');
});

test('source provenance appears in focus previews and rail scroll dismisses stale previews',()=>{
  const f=fixture(),button=f.doc.createElement('button');f.doc.body.append(button);
  f.controls.decorate(button,{...entries[0],family:'convex uniform (Miratope source)',sourceClassification:'Unverified',counts:[8,12,6]});button.dispatchEvent(new Event('focus'));
  assert.ok(f.controls.tooltip.children.some(n=>n.textContent==='Miratope source · Unverified'));assert.equal(f.controls.tooltip.hidden,false);
  f.rail.dispatchEvent(new Event('scroll'));assert.equal(f.controls.tooltip.hidden,true);
});

test('app uses presentation-only family labels and retains source provenance in Analysis',()=>{
  const source=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');
  assert.match(source,/libraryFamilyLabel\(entry\)/);assert.match(source,/stat\(\$\('analysis'\),'Source provenance',source\)/);assert.match(source,/libraryVisual.mountOverflow\(\)/);
});
