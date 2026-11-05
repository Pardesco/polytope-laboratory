import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {ExportGoals,EXPORT_GOALS,EXPORT_GOALS_KEY,readExportGoals,solidPrintReason} from '../ui/export-goals.mjs';

class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.dataset={};this.listeners={};this.value='';this.type='';this.disabled=false;this.hidden=false;this.checked=false;this.classList={add:()=>{}};}
  append(...nodes){for(const n of nodes){n.remove();this.children.push(n);n.parentElement=this;}}
  remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
  before(n){const p=this.parentElement,index=p.children.indexOf(this);n.remove();p.children.splice(index,0,n);n.parentElement=p;}
  replaceWith(n){this.before(n);this.remove();}
  replaceChildren(...nodes){for(const c of [...this.children])c.remove();this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  dispatchEvent(e){if(!e.target)e.target=this;for(const fn of this.listeners[e.type]??[])fn(e);if(e.bubbles)this.parentElement?.dispatchEvent(e);return true;}
  contains(n){return this===n||this.children.some(c=>c.contains(n));}
  closest(s){for(let n=this;n;n=n.parentElement)if(n.matches(s))return n;return null;}
  matches(s){return s.split(',').some(s=>s[0]==='#'?this.id===s.slice(1):s[0]==='.'?this.className===s.slice(1):this.tagName===s.toUpperCase());}
  querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  get options(){return this.tagName==='SELECT'?this.children:undefined;}
  focus(){this.focused=true;}
  click(){if(!this.disabled)this.onclick?.();}
}
function fixture(storage=null){
  const body=new Node('body'),doc={body,createElement:tag=>new Node(tag),createComment:()=>new Node('comment'),getElementById:id=>body.querySelector('#'+id),defaultView:{Event:class{constructor(type,{bubbles=false}={}){this.type=type;this.bubbles=bubbles;}}}};
  const add=(parent,tag,id)=>{const n=new Node(tag);n.id=id;parent.append(n);return n;};
  const dialog=add(body,'dialog','export-dialog'),heading=add(dialog,'div');heading.className='dialog-heading';add(heading,'h2');add(heading,'button','close-export');
  const original=add(dialog,'div','native-controls'),panel=add(original,'div','printable-panel'),picture=add(body,'details','png-settings'),anim=add(body,'section','animation-controls'),tour=add(body,'section','tour-controls');
  const field=(host,id,values=null,value='')=>{const row=add(host,'label'),n=add(row,values?'select':'input',id);if(values)for(const value of values){const o=add(n,'option');o.value=value;o.textContent=value;}n.value=value||values?.[0]||'';return n;};
  for(const [id,values,value] of [['export-kind',['intrinsic','printable','displayed']],['printable-mode',['strut','panels','solid']],['printable-size',null,'100'],['printable-strut',null,'2'],['printable-node',null,'3'],['printable-thickness',null,'1.6'],['printable-segments',null,'16'],['printable-wall',null,'2'],['printable-fill',['nonzero','even-odd']]])field(panel,id,values,value);
  for(const id of ['printable-ascii','printable-hollow'])field(panel,id).type='checkbox';
  const format=field(original,'export-format',['off','json','stl','3mf','glb','obj','x3d','dxf']),source=field(original,'export-source',['base','derived']),units=field(original,'export-units',['model','mm','m']);field(original,'interchange-size',null,'0.1');
  const button=add(original,'button','confirm-export'),preview=add(original,'div','export-preview');add(dialog,'button','export-net');add(dialog,'button','export-net-pdf');
  field(picture,'png-size',['viewport','square','vertical','landscape','uhd']);field(picture,'png-scale',['1','2','4']);field(picture,'png-transparent').type='checkbox';field(picture,'png-framing',['fit','viewport']);
  for(const [host,prefix] of [[anim,'animation'],[tour,'tour']]){field(host,prefix+'-format',['webm','mp4','gif','png']);field(host,prefix+'-size',['viewport','square','vertical','landscape']);const details=add(host,'details');add(details,'summary');field(details,prefix+'-framing',['fit','viewport']);add(host,'button',prefix+'-export');add(host,'button',prefix==='tour'?'tour-add':'animation-rotation');}
  add(body,'button','image');add(body,'button','net-rebuild');
  const calls=[],state={model:{dimension:4,faces:[]}},control={dialog,format,source,units,preview,button,session:{saving:false,cancel:()=>calls.push('cancel')},context:{getViewer:()=>null},selected:()=>state.model,
    printable:{node:k=>doc.getElementById(k==='kind'?'export-kind':'printable-'+k)},refresh:()=>calls.push('refresh'),close(){dialog.open=false;calls.push('close');dialog.dispatchEvent({type:'close'});}};
  const goals=new ExportGoals(control,{document:doc,storage,guard:fn=>fn,picture:()=>calls.push('picture'),reveal:n=>calls.push(n.id)});control.goals=goals;goals.open();dialog.open=true;
  return {doc,dialog,goals,control,state,calls,get:id=>doc.getElementById(id),original,picture,anim,tour};
}
const event=(f,n,type='change')=>n.dispatchEvent(new f.doc.defaultView.Event(type,{bubbles:true}));
const storage=()=>{let value=null;return {getItem:()=>value,setItem:(_key,v)=>{value=v;},get value(){return JSON.parse(value);}};};

test('six goal cards start on the chooser; geometry sharing stays visible without expert mode',()=>{
  const f=fixture();assert.equal(EXPORT_GOALS.length,6);assert.equal(f.goals.chooser.hidden,false);assert.equal(f.goals.form.hidden,true);assert.equal(f.goals.legacy.open,false);
  assert.equal(f.get('export-goal-geometry').attrs['data-expert'],undefined);assert.equal(f.goals.legacySummary.textContent,'All formats');assert.equal(f.get('export-format').closest('details'),f.goals.legacy);
});
test('printing uses the existing native controls with struts, binary STL and 100 mm defaults',()=>{
  const f=fixture();f.goals.choose('print');assert.equal(f.get('export-kind').value,'printable');assert.equal(f.get('printable-mode').value,'strut');assert.equal(f.get('printable-size').value,'100');assert.equal(f.control.format.value,'stl');assert.equal(f.get('printable-ascii').checked,false);
  const size=f.get('export-focus-printable-size');size.value='50+25';event(f,size,'input');assert.equal(f.get('printable-size').value,'50+25');assert.equal(f.goals.legacy.open,false);assert.equal(f.get('confirm-export').textContent,'Export STL…');
});
test('software and original-geometry goals map to displayed and intrinsic export without touching source geometry',()=>{
  const f=fixture(),source=f.state.model;f.goals.choose('software');assert.equal(f.get('export-kind').value,'displayed');assert.equal(f.control.format.value,'glb');assert.equal(f.get('interchange-size').value,'0.1');assert.equal(f.get('export-focus-export-format').options.length,4);
  f.goals.choose('geometry');assert.equal(f.get('export-kind').value,'intrinsic');assert.equal(f.control.format.value,'off');assert.equal(f.get('export-focus-export-format').options.length,2);assert.match(f.goals.description.textContent,/Numerical coordinates stay numerical/);assert.equal(f.state.model,source);
});
test('advanced controls keep their identities and handlers and changes synchronize the focused form',()=>{
  const f=fixture(),format=f.control.format,button=f.control.button;let clicks=0;button.onclick=()=>clicks++;
  f.goals.choose('print');format.value='3mf';event(f,format);assert.equal(f.get('export-focus-export-format').value,'3mf');button.click();assert.equal(clicks,1);
  f.goals.allFormats();assert.equal(f.control.format,format);assert.equal(f.control.button,button);assert.equal(f.goals.legacy.open,true);assert.equal(f.get('export-net-pdf').closest('details'),f.goals.legacy);assert.equal(f.get('export-kind').value,'printable');
});
test('paper flow closes export and reveals Nets step one through the original unfold button',()=>{
  const f=fixture();f.goals.choose('paper');assert.match(f.goals.message.textContent,/4D cell net/);f.goals.perform();assert.deepEqual(f.calls.slice(-2),['close','net-rebuild']);assert.equal(f.dialog.open,false);
});
test('picture options borrow and restore the original controls before invoking the image action',()=>{
  const f=fixture(),parent=f.picture.parentElement;f.goals.choose('picture');assert.equal(f.picture.parentElement,f.goals.media);assert.equal(f.get('png-size').value,'landscape');
  const checkbox=f.get('export-focus-png-transparent');checkbox.checked=true;event(f,checkbox);assert.equal(f.get('png-transparent').checked,true);f.goals.perform();assert.equal(f.picture.parentElement,parent);assert.deepEqual(f.calls.slice(-2),['close','picture']);
});
test('video offers saved sequence and tour formats, presets and original export handlers',()=>{
  const f=fixture();let exports=0;f.get('animation-export').onclick=()=>exports++;f.goals.choose('video');assert.equal(f.get('animation-size').value,'landscape');
  const format=f.get('export-focus-animation-format');format.value='gif';event(f,format);const size=f.get('export-focus-animation-size');size.value='vertical';event(f,size);assert.equal(f.get('animation-format').value,'gif');assert.equal(f.get('animation-size').value,'vertical');f.goals.perform();assert.equal(exports,1);assert.deepEqual(f.calls.slice(-2),['close','animation-export']);
  f.dialog.open=true;f.goals.choose('video');const select=f.get('export-video-source');select.value='tour';select.onchange();assert.equal(f.goals.mediaSource,'tour');assert.ok(f.get('export-focus-tour-format'));assert.ok(f.anim.contains(f.get('animation-format')));
});
test('last goal and its advanced options survive reopening and reload, with independent per-goal settings',()=>{
  const store=storage(),f=fixture(store);f.goals.choose('print');f.get('printable-size').value='6*25';f.get('printable-strut').value='2.4';event(f,f.get('printable-size'),'input');f.goals.choose('geometry');f.control.format.value='json';event(f,f.control.format);f.control.close();
  const next=fixture(store);assert.equal(next.goals.chooser.hidden,false);assert.equal(next.goals.saved.lastGoal,'geometry');assert.equal(next.get('export-goal-geometry').dataset.lastUsed,'true');next.goals.choose('print');assert.equal(next.get('printable-size').value,'6*25');assert.equal(next.get('printable-strut').value,'2.4');assert.equal(next.control.format.value,'stl');next.goals.choose('geometry');assert.equal(next.control.format.value,'json');assert.equal(store.value.lastGoal,'geometry');
});
test('source units and advanced formats remain usable as remembered goal options',()=>{
  const store=storage(),f=fixture(store);f.goals.choose('geometry');f.control.units.value='mm';event(f,f.control.units);f.control.close();
  const next=fixture(store);next.goals.choose('geometry');assert.equal(next.control.units.value,'mm');next.goals.choose('print');next.control.format.value='obj';event(next,next.control.format);assert.equal(next.get('export-focus-export-format').value,'obj');assert.ok(next.get('export-focus-export-format').options.some(o=>o.value==='obj'));
});
test('changing export type in More options opens the complete form and returning from raster refreshes review',()=>{
  const f=fixture();f.goals.choose('print');f.get('export-kind').value='displayed';event(f,f.get('export-kind'));assert.equal(f.goals.goal,'all');assert.equal(f.goals.legacy.open,true);
  f.goals.choose('picture');f.goals.home();const before=f.calls.filter(v=>v==='refresh').length;f.goals.allFormats();assert.equal(f.calls.filter(v=>v==='refresh').length,before+1);
});
test('missing, malformed or unavailable storage is harmless and saved derived sources are rechecked',()=>{
  for(const value of ['bad','null','{"lastGoal":"bogus","options":{}}','{"lastGoal":"print","options":[]}'])assert.equal(readExportGoals({getItem:()=>value}).lastGoal,null);
  const f=fixture({getItem(){throw Error('disabled');},setItem(){throw Error('quota');}});assert.doesNotThrow(()=>f.goals.choose('print'));
  f.goals.saved.options.geometry={'export-format':'unknown','export-source':'derived','interchange-size':'x'.repeat(513)};f.control.source.options[1].disabled=true;f.goals.choose('geometry');assert.equal(f.control.source.value,'base');assert.equal(f.control.format.value,'off');
});
test('solid preflight, unavailable source and busy state give visible reasons and preserve native checks',()=>{
  assert.match(solidPrintReason({dimension:4}),/try Struts/);assert.match(solidPrintReason({dimension:3,faces:[[0,1,2]]}),/closed/);
  const tetra={dimension:3,faces:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]};assert.equal(solidPrintReason(tetra),'');assert.match(solidPrintReason(tetra,{explosionDisplay:{}}),/exploded/);
  const f=fixture();f.goals.choose('print');assert.equal(f.get('export-focus-printable-mode').options[2].disabled,true);assert.match(f.goals.message.textContent,/Solid print/);
  f.state.model=null;f.goals.home();f.goals.sync();for(const {card,reason} of f.goals.cards.values()){assert.equal(card.disabled,true);assert.match(reason.textContent,/Open a model/);}
  f.state.model=tetra;f.control.session.saving=true;f.goals.sync();assert.equal(f.get('export-goal-print').disabled,true);assert.equal(f.get('export-goal-back').disabled,true);
});
test('reveal opens the full format list and restores borrowed controls without losing the target',()=>{
  const f=fixture();f.goals.choose('picture');const format=f.control.format;format.dispatchEvent({type:'app-chrome-reveal',bubbles:true});assert.equal(f.goals.goal,'all');assert.equal(f.goals.legacy.hidden,false);assert.equal(f.goals.legacy.open,true);assert.equal(f.control.format,format);assert.equal(f.picture.parentElement,f.doc.body);
});
test('app installs goal actions and the reviewed dialog hooks; styles and smoke compatibility stay additive',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.match(read('ui/app.js'),/new ExportGoals/);for(const label of ['Export for 3D printing','Save picture','Export video','Export model data'])assert.ok(read('ui/app.js').includes(label));
  assert.match(read('ui/export-controls.mjs'),/this.goals\?\.open/);assert.match(read('ui/export-controls.mjs'),/this.goals\?\.sync/);assert.ok(JSON.parse(read('package.json')).scripts['test:features'].includes('tests/export-goals.test.mjs'));
  assert.match(read('ui/export-goals.css'),/focus-visible/);assert.match(read('scripts/export-workflow-smoke.cjs'),/reveal\(page,'#export-format'\)/);assert.equal(EXPORT_GOALS_KEY,'polytope.export-goals.v1');
});

test('mounted goal dialog reviews native STL/GLB/JSON, remembers choices, and routes raster and paper actions',async()=>{
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),dialog=html.match(/<dialog id="export-dialog">[\s\S]*?<\/dialog>/)[0],png=html.match(/<details id="png-settings"[\s\S]*?<\/details>/)[0];
    await page.route('**/u14-mount',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/export-goals.css"><body>'+dialog+png+'<button id="image">PNG</button><button id="net-rebuild">Unfold faces</button><div id="media"></div></body>'}));
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/u14-mount');
    const model=JSON.parse(execFileSync('python',['-c',"import json;from engine.generators import regular;print(json.dumps(regular('cube')))"],{encoding:'utf8'}));
    await page.exposeFunction('native',request=>JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))"],{input:JSON.stringify(request),encoding:'utf8'})));
    await page.evaluate(async model=>{
      const {ExportControls}=await import('/export-controls.mjs'),{ExportGoals}=await import('/export-goals.mjs'),{mediaControls}=await import('/media-export-options.mjs');
      document.querySelector('#media').innerHTML=mediaControls('animation')+'<button id="animation-export">Export animation</button>'+mediaControls('tour')+'<button id="tour-export">Export tour</button>';
      const triangles=model.faces.flatMap((f,face)=>f.slice(1,-1).map((_,i)=>({face,points:[model.vertices[f[0]],model.vertices[f[i+1]],model.vertices[f[i+2]]]}))),attr=(rows,size=3)=>({array:new Float32Array(rows.flat(Infinity)),version:1,itemSize:size});
      const viewer={model,view:{faces:true,edges:true,vertices:true},projected:model.vertices.map(point=>({point})),triangles,visibility:{vertices:model.vertices.map(()=>true)},pointGeometry:{attributes:{position:attr(model.vertices)}},edgeGeometry:{attributes:{position:attr(model.edges.map(e=>e.map(v=>model.vertices[v])))}},surfaceGeometry:{attributes:{position:attr(triangles.map(t=>t.points)),color:attr(triangles.flatMap(()=>[[.2,.5,.6,1],[.2,.5,.6,1],[.2,.5,.6,1]]),4)}},prepareGeometryCapture:async()=>({complete:true})};
      const state={model,notes:'',view:{coordinateUnit:'mm'}},doc={id:'u14',cursor:0,states:[state]},project={active:0,documents:[doc]};window.saved=[];window.events=[];
      const context={getProject:()=>project,getDocument:()=>doc,getState:()=>state,getDerived:()=>null,getViewer:()=>viewer,getNet:()=>null,isExporting:()=>false,evaluateMany:async parts=>parts.map(Number),setStatus:()=>{},
        describe:model=>window.native({op:'export-options',model}),prepare:(model,params)=>window.native({op:'prepare-export',model,params}),preparePrintable:(model,params)=>window.native({op:'prepare-printable-export',model,params}),prepareView:(model,params)=>window.native({op:'prepare-view-export',model,params}),
        api:{beginGeometryExport:async()=>({id:'u14-ticket'}),writeGeometryExport:async(_id,data)=>{window.saved.push(data);return {path:'u14-output'};},abortGeometryExport:async()=>{}}};
      window.control=new ExportControls(context);window.control.goals=new ExportGoals(window.control,{picture:()=>window.events.push('picture'),reveal:node=>window.events.push(node.id)});
      document.getElementById('confirm-export').onclick=()=>window.control.confirm();document.getElementById('close-export').onclick=()=>window.control.close();document.getElementById('animation-export').onclick=()=>window.events.push('video');await window.control.open();
    },model);
    assert.equal(await page.locator('.export-goal-card').count(),6);assert.equal(await page.locator('#export-goal-cards').isVisible(),true);assert.equal(await page.locator('#export-goal-geometry').isVisible(),true);
    assert.equal(await page.locator('#confirm-export').isVisible(),false);
    mkdirSync('artifacts/u14-export-goals',{recursive:true});await page.screenshot({path:'artifacts/u14-export-goals/chooser.png'});
    await page.click('#export-goal-print');await page.waitForFunction(()=>window.control.session.prepared?.result.report.mode==='strut');
    assert.equal(await page.inputValue('#export-focus-printable-size'),'100');await page.screenshot({path:'artifacts/u14-export-goals/print.png'});await page.fill('#export-focus-printable-size','125');
    await page.waitForFunction(()=>window.control.session.prepared?.owner.selection.printable.size==='125');assert.match(await page.locator('#export-preview').textContent(),/125\.000/);await page.click('#confirm-export');
    assert.equal(await page.evaluate(()=>window.saved[0] instanceof Uint8Array),true);
    await page.evaluate(()=>window.control.open());assert.match(await page.locator('#export-goal-print-reason').textContent(),/Last used/);await page.click('#export-goal-print');assert.equal(await page.inputValue('#export-focus-printable-size'),'125');
    await page.click('#export-goal-back');await page.click('#export-goal-software');await page.waitForFunction(()=>window.control.session.prepared?.owner.selection.format==='glb');await page.click('#confirm-export');assert.equal(await page.evaluate(()=>new DataView(window.saved[1].buffer).getUint32(0,true)),0x46546c67);
    await page.evaluate(()=>window.control.open());await page.click('#export-goal-geometry');await page.selectOption('#export-focus-export-format','json');await page.waitForFunction(()=>window.control.session.prepared?.owner.selection.format==='json');await page.click('#confirm-export');assert.equal(await page.evaluate(()=>JSON.parse(window.saved[2]).name),model.name);
    await page.evaluate(()=>window.control.open());await page.click('#export-goal-picture');await page.check('#export-focus-png-transparent');await page.selectOption('#export-focus-png-size','square');await page.click('#export-goal-action');assert.equal(await page.inputValue('#png-size'),'square');assert.equal(await page.isChecked('#png-transparent'),true);assert.equal(await page.locator('#png-settings').evaluate(n=>n.closest('#export-dialog')),null);
    await page.evaluate(()=>window.control.open());await page.click('#export-goal-video');await page.selectOption('#export-focus-animation-format','gif');await page.selectOption('#export-focus-animation-size','vertical');await page.click('#export-goal-action');assert.equal(await page.inputValue('#animation-size'),'vertical');
    await page.evaluate(()=>window.control.open());await page.click('#export-goal-paper');await page.click('#export-goal-action');assert.deepEqual(await page.evaluate(()=>window.events),['picture','animation-export','video','net-rebuild']);
    await page.evaluate(()=>window.control.open());await page.click('#export-all-formats > summary');assert.equal(await page.locator('#export-format').isVisible(),true);assert.equal(await page.locator('#export-source').isVisible(),true);assert.equal(await page.locator('#export-kind').isVisible(),true);
    await page.click('#export-goal-back');await page.click('#export-goal-picture');await page.click('#export-goal-back');await page.click('#export-all-formats > summary');await page.waitForFunction(()=>Boolean(window.control.session.prepared));assert.equal(await page.locator('#confirm-export').isEnabled(),true);
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await server.close();}
});
