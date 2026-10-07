import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ReinforcementSession,ReinforcementControls,literalSupportCycles,checkedReinforcementSVG} from '../ui/reinforcement-controls.mjs';
import {sourceContext,deferred,tick} from './construction-controls-fixture.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
function native(request){return new Promise((resolve,reject)=>{const job=spawn('python',['-B',ROOT+'engine/server.py'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';job.stdout.on('data',d=>stdout+=d);job.stderr.on('data',d=>stderr+=d);job.on('error',reject);job.on('close',code=>{try{if(code)throw Error(stderr);const reply=JSON.parse(stdout);if(!reply.ok)throw Error(reply.error);resolve(reply.result);}catch(error){reject(error);}});job.stdin.end(JSON.stringify(request)+'\n');});}
async function fixture(){
  const owner=sourceContext(3),model=owner.getState().model;
  const request={op:'generate',params:{kind:'regular',key:'cube'}};
  // Construct the source through actual native generation rather than fake reply geometry.
  const {spawnSync}=await import('node:child_process');const root=fileURLToPath(new URL('../',import.meta.url));
  const run=spawnSync('python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify(request)+'\n'});assert.equal(run.status,0,run.stderr);
  const generated=JSON.parse(run.stdout);assert.equal(generated.ok,true,generated.error);Object.assign(model,generated.result);
  let net={edge_length_mm:20,tabs:true},paper={width_mm:210,height_mm:297,margin_mm:10};const form={cycles:'[[0,1,7,6]]',unit:'mm',angleUnit:'degrees'},saved=[],exported=[],previews=[],pdfs=[];
  const context={...owner,evaluateMany:async entries=>entries.map(Number),getNetParameters:()=>net,read:async(op,params,source,options)=>{options.verifyPublication();const result=await native({op,model:source,params});options.verifyPublication();return result;},
    getPaperParameters:()=>paper,preview:async(svg,options)=>{options.verifyPublication();previews.push(svg);},clearPreview:()=>previews.push('cleared'),save:async(state,options)=>{options.verifyPublication();owner.getState().view.netReinforcement=state;saved.push(state);},export:async(format,text,options)=>{options.verifyPublication();exported.push({format,text});},exportPdf:async(pages,options)=>{options.verifyPublication();pdfs.push(pages);}};
  return {owner,context,form,saved,exported,previews,pdfs,session:new ReinforcementSession(context),changeNet:()=>net={...net,edge_length_mm:30},changePaper:()=>paper={...paper,width_mm:200}};
}
test('actual native panels save/explicit restore and real CSV/JSON exports preserve source geometry',async()=>{
  const f=await fixture(),before=structuredClone(f.owner.getState().model);const reply=await f.session.execute('build',f.form);
  assert.equal(reply.panels.length,1);assert.match(f.previews[0],/<polygon/);await f.session.execute('save',f.form);
  assert.equal(f.saved[0].panels,undefined);f.session.clear();await f.session.execute('restore',f.form);
  assert.deepEqual(f.session.reply,reply);await f.session.execute('csv',f.form);await f.session.execute('json',f.form);
  assert.equal(f.exported.length,2);assert.match(f.exported[0].text,/interior-dihedral/);assert.equal(JSON.parse(f.exported[1].text).referenceEdgeLengthMm,20);
  assert.deepEqual(f.owner.getState().model,before);
});
for(const mutation of ['unit','notes','source','net','form','export','cancel'])test(`held native reinforcement refuses ${mutation} publication`,async()=>{
  const f=await fixture(),held=deferred(),actual=f.context.read;let args;
  f.context.read=async(...a)=>{args=a;return held.promise;};const job=f.session.execute('build',f.form);await tick();assert.ok(args);
  if(mutation==='unit')f.owner.getState().view.coordinateUnit='cm';else if(mutation==='notes')f.owner.getState().notes='changed';
  else if(mutation==='source')f.owner.setState({...f.owner.getState(),model:structuredClone(f.owner.getState().model)});
  else if(mutation==='net')f.changeNet();else if(mutation==='form')f.form.cycles='[[0,3,5]]';
  else if(mutation==='export')f.owner.setExport(true);else f.session.cancel();
  const refusal=assert.rejects(job,/changed|cancel|export/i);held.resolve({panelSvg:'<svg/>',panels:[]});await refusal;
  assert.equal(f.session.reply,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.exported,[]);
});
test('held measurement export checks ownership immediately before write',async()=>{
  const f=await fixture(),held=deferred();let ready=false;
  f.context.export=async(format,text,options)=>{ready=true;await held.promise;options.verifyPublication();f.exported.push(text);};
  const job=f.session.execute('csv',f.form);const stop=Date.now()+10000;while(!ready){assert.ok(Date.now()<stop,'Measurement export must reach callback.');await new Promise(resolve=>setTimeout(resolve,10));}f.changeNet();const refusal=assert.rejects(job,/changed/);held.resolve();await refusal;assert.deepEqual(f.exported,[]);
});
test('observer camera motion is independent of source construction ownership',async()=>{
  const f=await fixture(),held=deferred(),actual=f.context.read;let args;
  f.context.read=async(...a)=>{args=a;return held.promise;};const job=f.session.execute('build',f.form);await tick();
  f.owner.getState().view.camera.zoom=2;held.resolve(await actual(...args));await job;assert.equal(f.session.reply.panels.length,1);
});
test('cycle form accepts literal IDs and refuses expressions/duplicates/bounds',()=>{
  assert.deepEqual(literalSupportCycles('[[0,1,7,6]]'),[[0,1,7,6]]);
  for(const text of ['[[0,0,1]]','[[true,1,2]]','[["1+1",2,3]]','[[-1,2,3]]','[[0,1]]'])assert.throws(()=>literalSupportCycles(text));
});
test('saved support scale/layout cannot silently replace the current physical net',async()=>{
  const f=await fixture();await f.session.execute('build',f.form);await f.session.execute('save',f.form);f.changeNet();
  await assert.rejects(f.session.execute('restore',f.form),/net scale or layout changed/);
  await assert.rejects(f.session.execute('save',f.form),/net layout changed/);
});
test('mounted form reader rejects DOM edits independently of detached request fields',async()=>{
  const f=await fixture(),held=deferred();let live='original';f.context.formSignature=()=>live;
  f.context.read=async()=>held.promise;const job=f.session.execute('build',f.form);await tick();live='changed by DOM';
  const refusal=assert.rejects(job,/target.*changed/);held.resolve({panels:[],panelSvg:'<svg/>'});await refusal;
});
test('actual panel constructor routes preview/save/export through source-owned session',async()=>{
  class Element{
    constructor(){this.nodes={};}
    set innerHTML(text){for(const match of text.matchAll(/id="([^"]+)"/g))this.nodes[match[1]]={value:'',disabled:false,textContent:'',dataset:{}};this.nodes['reinforcement-unit'].value='mm';this.nodes['reinforcement-angle'].value='degrees';}
    querySelector(selector){return this.nodes[selector.slice(1)];}
    querySelectorAll(){return Object.values(this.nodes);}
  }
  globalThis.document={createElement:()=>new Element()};
  const f=await fixture();let mounted;
  const controls=new ReinforcementControls({...f.context,mount:{after:panel=>mounted=panel},guard:fn=>fn});
  assert.equal(mounted.id,'net-reinforcement-settings');controls.node('cycles').value=f.form.cycles;
  await controls.node('build').onclick();assert.equal(controls.node('save').disabled,false);await controls.node('save').onclick();
  await controls.node('csv').onclick();assert.equal(f.exported[0].format,'csv');assert.match(controls.node('status').textContent,/measurements exported/);
  assert.equal(controls.node('cancel').disabled,true);
  controls.node('cycles').value='[[0,3,5]]';controls.node('cycles').oninput();assert.equal(controls.node('save').disabled,true);assert.equal(controls.node('svg').disabled,true);assert.equal(controls.node('pdf').disabled,true);
});
test('restore compares native-sorted object keys and preserves ordered layout values',async()=>{
  const f=await fixture();await f.session.execute('build',f.form);await f.session.execute('save',f.form);
  const state=f.owner.getState().view.netReinforcement;
  state.netParameters=Object.fromEntries(Object.entries(state.netParameters).reverse());
  f.session.clear();await f.session.execute('restore',f.form);assert.equal(f.session.reply.panels.length,1);
  state.netParameters.cut_edges=[0];
  await assert.rejects(f.session.execute('restore',f.form),/net scale or layout changed/);
});
test('support SVG and physical PDF-sheet callbacks receive actual native printable geometry',async()=>{
  const f=await fixture();await f.session.execute('build',f.form);await f.session.execute('svg',f.form);const pages=await f.session.execute('pdf',f.form);
  assert.equal(f.exported[0].format,'svg');assert.match(f.exported[0].text,/width="[\d.]+mm"/);
  assert.equal(f.pdfs.length,1);assert.equal(f.pdfs[0].length,1);assert.match(f.pdfs[0][0],/width="210mm" height="297mm"/);
  assert.equal(pages.scale,1);assert.equal(pages.allPanelsRepresented,true);
});
for(const operation of ['svg','pdf'])for(const mutation of ['notes','net','cancel',...operation==='pdf'?['paper']:[]])test(`held ${operation} publication refuses ${mutation}`,async()=>{
  const f=await fixture();await f.session.execute('build',f.form);const held=deferred();let ready=false;
  const callback=async(value,options)=>{ready=true;await held.promise;options.verifyPublication();f.exported.push(value);};
  if(operation==='svg')f.context.export=async(format,text,options)=>callback(text,options);else f.context.exportPdf=callback;
  const job=f.session.execute(operation,f.form),stop=Date.now()+10000;
  while(!ready){assert.ok(Date.now()<stop);await new Promise(resolve=>setTimeout(resolve,10));}
  if(mutation==='notes')f.owner.getState().notes='changed';else if(mutation==='net')f.changeNet();else if(mutation==='paper')f.changePaper();else f.session.cancel();
  const refusal=assert.rejects(job,/changed|cancel/i);held.resolve();await refusal;assert.deepEqual(f.exported,[]);assert.deepEqual(f.pdfs,[]);
});
test('native support SVG is accepted while executable/reference/unsupported markup is refused',async()=>{
  class Parser{parseFromString(text){const nodes=[...text.matchAll(/<(\w+)\b([^>]*)>/g)].map(match=>({localName:match[1],namespaceURI:'http://www.w3.org/2000/svg',attributes:[...match[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>({name:a[1],value:a[2]}))}));const root=nodes[0]??{localName:'bad'};root.querySelectorAll=()=>nodes.slice(1);return {documentElement:root,querySelector:()=>null};}}
  globalThis.DOMParser=Parser;const f=await fixture(),reply=await f.session.execute('build',f.form);assert.equal(checkedReinforcementSVG(reply.panelSvg).localName,'svg');
  for(const svg of ['<svg><script/></svg>','<svg onload="x"/>','<svg><polygon href="https://example.com"/></svg>','<svg><polygon fill="url(https://example.com)"/></svg>','<svg><foreignObject/></svg>','<svg><polygon style="fill:red"/></svg>'])assert.throws(()=>checkedReinforcementSVG(svg),/Unsupported/);
});
test('dismissed native export dialog never reports exported data',async()=>{
  const f=await fixture();await f.session.execute('build',f.form);f.context.export=async()=>null;
  await assert.rejects(f.session.execute('svg',f.form),{name:'AbortError'});assert.deepEqual(f.exported,[]);
});
