import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {ElementContentControls,readElementPNG} from '../ui/element-content-controls.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),clone=structuredClone;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
class Element{
  constructor(){Object.assign(this,{value:'',checked:false,disabled:false,dataset:{},children:[],nodes:{},files:[],options:[]});}
  set innerHTML(text){for(const match of text.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"[^>]*>/g)){const e=new Element();e.id=match[2];e.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]??'';this.nodes[e.id]=e;}}
  querySelector(selector){return this.nodes[selector.slice(1)];}querySelectorAll(){return Object.values(this.nodes);}after(){}
}
function native(request){return new Promise((resolve,reject)=>{
  const child=spawn(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',error='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>error+=d);child.on('error',reject);
  child.on('close',code=>{try{if(code)throw Error(error);const reply=JSON.parse(output);if(!reply.ok)throw Error(reply.error);resolve(reply.result);}catch(e){reject(e);}});
  child.stdin.end(JSON.stringify(request)+'\n');
});}
function png(){
  const crc=buffer=>{let value=0xffffffff;for(const byte of buffer){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
  const chunk=(type,data)=>{const name=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return result;};
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
  const raw=Buffer.from([0,255,0,0,255,0,0,0,0,0,0,0,0,0,0,0,255,128]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
async function fixture(){
  const model=await native({op:'generate',params:{kind:'regular',key:'cube'}});model.faceColors=[[.2,.5,1,.25],null,null,null,null,null];
  let document={id:'controller-source',cursor:0,states:[{model,view:{coordinateUnit:'cm',angles:[0,0,0,0,0,0]},notes:'Owned π notes'}]};
  const project=await native({op:'validate-project',params:{project:{format:'polytope-laboratory',version:1,active:0,documents:[document]}}});document=project.documents[0];
  globalThis.document={createElement:()=>new Element(),getElementById:()=>new Element()};
  const calls=[],renders=[],viewer={};
  const context={getState:()=>document.states[document.cursor],getDocument:()=>document,getProject:()=>project,isExporting:()=>false,guard:fn=>fn,
    selection:()=>({kind:'face',index:1}),visibleTargets:()=>[3,1],viewer,
    evaluateMany:async(expressions,options)=>(await native({op:'expression-batch',params:{expressions:[...expressions],mode:options.mode}})).values,
    commit:async(op,parameters,label,options)=>{options.verifyPublication();const next=await native({op:'recipe-run',params:{document,operation:op,parameters,label}});options.verifyPublication();calls.push(parameters);document=next;project.documents[0]=next;controls.invalidate();return next;},
    describe:async(model,params,options)=>{options.verifyPublication();const result=await native({op:'element-content-describe',model,params});options.verifyPublication();return result;},
    render:async(v,desc,options)=>{options.verifyPublication?.();renders.push(desc);return {ready:true};}};
  const controls=new ElementContentControls(context);return {controls,context,calls,renders,project,get document(){return document;}};
}

test('actual controller native text/PNG/list/net/SaveOpen preserve source and physical placement',async()=>{
  const f=await fixture(),source=clone(f.context.getState());f.controls.node('markup').value='<b>π</b><sub>2</sub>';
  f.controls.node('x').value='1/2';f.controls.node('y').value='-sqrt(4)';f.controls.node('angle').value='90/3';
  await f.controls.apply('text');let state=f.context.getState();assert.deepEqual(state.model,source.model);assert.equal(state.notes,source.notes);assert.equal(state.view.coordinateUnit,'cm');
  assert.deepEqual(state.view.elementAnnotations.entries[0].text.placement,{offsetMm:[.5,-2],rotationDeg:30,lineHeightMm:4});
  const bytes=png();f.controls.node('png').files=[{name:'literal.png',size:bytes.length,lastModified:0,arrayBuffer:async()=>Uint8Array.from(bytes).buffer}];
  await f.controls.apply('texture');state=f.context.getState();assert.equal(Object.keys(state.view.elementAnnotations.assets).length,1);
  const asset=Object.values(state.view.elementAnnotations.assets)[0];assert.equal(asset.width,2);assert.equal(asset.height,2);
  f.controls.node('list-mode').value='shown';f.controls.node('lines').value='Face three\n<i>Face one</i>';await f.controls.apply('list');
  state=f.context.getState();assert.equal(state.view.elementAnnotations.entries.find(e=>e.index===3).text.markup,'Face three');
  assert.equal(state.view.elementAnnotations.entries.find(e=>e.index===1).text.markup,'<i>Face one</i>');
  await f.controls.refresh();assert.ok(f.renders.at(-1).entries.length>=3);
  const net=await native({op:'net',model:state.model,params:{edge_length_mm:37,element_annotations:state.view.elementAnnotations}});
  assert.match(net.svg,/data-annotation-face/);assert.match(net.svg,/<image/);assert.equal(net.referenceEdgeLengthMm,37);
  const directory=join(ROOT,'artifacts/element-content-native-controller');mkdirSync(directory,{recursive:true});const path=join(directory,'element-content.polyproj');
  await native({op:'save',params:{path,project:f.project}});const restored=await native({op:'load',params:{path}});
  const saved=restored.project.documents[0].states.at(-1);assert.deepEqual(saved.view.elementAnnotations,state.view.elementAnnotations);assert.deepEqual(saved.model,source.model);
  const replay=await native({op:'recipe-replay',params:{document:f.document}});assert.deepEqual(replay.states[0].view.elementAnnotations,state.view.elementAnnotations);
});

test('invalid markup and literal IDs refuse without history publication',async()=>{
  const f=await fixture(),before=clone(f.document);f.controls.node('markup').value='<script>unsafe</script>';
  await assert.rejects(f.controls.apply('text'),/Unsupported/);assert.deepEqual(f.document,before);
  f.controls.node('index').value='1+1';await assert.rejects(f.controls.apply('text'),/literal/);assert.equal(f.calls.length,0);
});

test('held PNG bytes and held native commit refuse changed source/unit ownership',async()=>{
  const f=await fixture(),bytes=png(),held=deferred(),entered=deferred();
  f.controls.node('png').files=[{name:'literal.png',size:bytes.length,lastModified:0,arrayBuffer:async()=>{entered.resolve();return held.promise;}}];
  const job=f.controls.apply('texture');await entered.promise;f.context.getState().view.coordinateUnit='mm';
  const failed=assert.rejects(job,/changed/);held.resolve(Uint8Array.from(bytes).buffer);await failed;assert.equal(f.calls.length,0);
  const pending=deferred(),started=deferred();f.context.commit=async(op,p,label,options)=>{started.resolve();await pending.promise;options.verifyPublication();f.calls.push(p);};
  f.controls.node('markup').value='caption';const edit=f.controls.apply('text');await started.promise;f.context.getState().notes='Different notes';
  const refused=assert.rejects(edit,/changed/);pending.resolve();await refused;assert.equal(f.calls.length,0);
});

test('descriptor capture barrier waits native readiness, clears empty content, rejects stale attrs',async()=>{
  const f=await fixture();await f.controls.refresh();assert.equal(f.renders.at(-1),null);
  f.controls.node('markup').value='caption';await f.controls.apply('text');const held=deferred(),entered=deferred(),describe=f.context.describe;
  f.context.describe=async(...args)=>{entered.resolve();await held.promise;return describe(...args);};
  const capture=f.controls.prepareCapture();await entered.promise;assert.equal(f.renders.at(-1),null);
  f.context.getState().model.faceColors[0][3]=.75;const failed=assert.rejects(capture,/changed/);held.resolve();await failed;
  assert.equal(f.renders.at(-1),null);
});

test('PNG helper enforces header/size/exact byte ownership before native publication',async()=>{
  for(const size of [0,5,4*1024*1024+1])await assert.rejects(readElementPNG({size,arrayBuffer:async()=>new ArrayBuffer(size)},()=>{}),/PNG/);
  await assert.rejects(readElementPNG({size:8,arrayBuffer:async()=>new ArrayBuffer(9)},()=>{}),/changed/);
  await assert.rejects(readElementPNG({size:8,arrayBuffer:async()=>new ArrayBuffer(8)},()=>{}),/not a PNG/);
});

test('export transition during held numeric edit blocks history publication',async()=>{
  const f=await fixture(),entered=deferred(),held=deferred(),evaluate=f.context.evaluateMany;
  let exporting=false;f.context.isExporting=()=>exporting;
  f.context.evaluateMany=async(...args)=>{entered.resolve();await held.promise;return evaluate(...args);};
  f.controls.node('markup').value='held caption';const pending=f.controls.apply('text');await entered.promise;
  exporting=true;f.controls.sync();assert.equal(f.controls.node('text').disabled,true);const rejected=assert.rejects(pending,/export/);held.resolve();await rejected;assert.equal(f.calls.length,0);
  exporting=false;f.controls.sync();assert.equal(f.controls.node('text').disabled,false);
});

test('global invalidation while PNG bytes are held prevents late native commit',async()=>{
  const f=await fixture(),bytes=png(),entered=deferred(),held=deferred();
  f.controls.node('png').files=[{name:'held.png',size:bytes.length,lastModified:0,arrayBuffer:async()=>{entered.resolve();return held.promise;}}];
  const pending=f.controls.apply('texture');await entered.promise;f.controls.invalidate();const rejected=assert.rejects(pending,/cancel|abort/i);held.resolve(Uint8Array.from(bytes).buffer);await rejected;assert.equal(f.calls.length,0);
});

test('form and shown target changes during expression evaluation prevent publishing',async()=>{
  for(const change of [f=>f.controls.node('markup').value='Changed fields',f=>f.context.visibleTargets=()=>[1,3]]){
    const f=await fixture(),entered=deferred(),held=deferred(),evaluate=f.context.evaluateMany;
    f.controls.node('list-mode').value='shown';f.controls.node('lines').value='first\nsecond';
    f.context.evaluateMany=async(...args)=>{entered.resolve();await held.promise;return evaluate(...args);};
    const pending=f.controls.apply('list');await entered.promise;change(f);const rejected=assert.rejects(pending,/changed/);held.resolve();await rejected;assert.equal(f.calls.length,0);
  }
});

test('same-source Viewer clear and expired capture guard force fresh descriptor presentation',async()=>{
  const f=await fixture();f.controls.node('markup').value='caption';await f.controls.apply('text');
  let owner=true,descriptions=0;const describe=f.context.describe;
  f.context.describe=async(...args)=>{descriptions++;return describe(...args);};
  f.context.render=async(viewer,descriptor,options)=>{options.verifyPublication();viewer.elementContentLayer=descriptor?{descriptor}:null;return {ready:true};};
  await f.controls.refresh(f.context.viewer,{isCurrent:()=>owner});assert.equal(descriptions,1);
  f.context.viewer.elementContentLayer=null;await f.controls.refresh();assert.equal(descriptions,2);
  owner=false;await f.controls.refresh();assert.equal(descriptions,2);
});
