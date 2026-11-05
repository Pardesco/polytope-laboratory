// Separate source processes keep the preserved and current imported helpers
// independent. Timings exclude startup, imports, cloning and output hashing.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fork} from 'node:child_process';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url)),script=fileURLToPath(import.meta.url);
const hash=data=>createHash('sha256').update(data).digest('hex');

if(process.argv[2]==='--worker'){
  const [mode,baseline,input,annotations]=process.argv.slice(3),remapped=new Set();
  if(mode==='before')registerHooks({resolve(specifier,context,next){
    const result=next(specifier,context);
    for(const name of ['element-content-source.mjs','memory-source-signature.mjs'])if(result.url===pathToFileURL(path.join(root,'ui',name)).href){
      remapped.add(name);return {...result,url:pathToFileURL(path.join(baseline,name)).href};
    }
    return result;
  }});
  const {navigationDisplayHarness,displayBuffers}=await import('../tests/helpers/navigation-display.mjs');
  const {portableContentSource}=await import('../ui/element-content-source.mjs');
  const {memorySourceSignature}=await import('../ui/memory-source-signature.mjs');
  const code=fs.readFileSync(path.join(root,'ui/app.js'),'utf8'),project=JSON.parse(fs.readFileSync(input,'utf8'));
  const document=project.documents[project.active],initial=document.states[document.cursor],content=JSON.parse(fs.readFileSync(annotations,'utf8'));
  process.on('message',async({id,kind})=>{
    let f;
    try{
      const state=structuredClone(initial);state.view.entitySelection={kind:'face',index:0};
      state.view.elementAnnotations=structuredClone(content.document);
      let output,ms,displays;
      if(kind==='portable-key'){
        const start=performance.now();output=portableContentSource(state.model);ms=performance.now()-start;
      }else if(kind==='memory-signature'){
        const start=performance.now();output=memorySourceSignature(state,{documentId:'navigation-document',modelId:state.model.id});ms=performance.now()-start;
      }else{
        if(kind==='plain-navigation')delete state.view.elementAnnotations;
        f=navigationDisplayHarness(code,state,{descriptor:kind==='annotated-navigation'?content.descriptor:null});
        const start=performance.now();f.scope.renderWorkspace();await f.settle();ms=performance.now()-start;
        const publications=await Promise.allSettled(f.counts.pending);assert.ok(publications.every(item=>item.status==='fulfilled'));
        assert.equal(f.counts.errors.length,0);assert.equal(f.counts.dirty,0);assert.equal(f.counts.displays,1);displays=f.counts.displays;
        const meshes=f.v.elementContentLayer?.group.children.filter(child=>child.isMesh).map(mesh=>({
          attributes:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name,attribute])=>[name,{itemSize:attribute.itemSize,array:Array.from(attribute.array)}])),
          index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null,
          owners:Object.fromEntries(Object.entries(mesh.userData).map(([key,value])=>[key,ArrayBuffer.isView(value)?Array.from(value):value]))
        }))??[];
        if(kind==='annotated-navigation')assert.ok(meshes.length,'Retain annotated face');
        output={geometry:displayBuffers(f.v),content:meshes};
      }
      process.send({id,ms,displays,outputSha256:hash(typeof output==='string'?output:JSON.stringify(output))});
    }catch(error){process.send({id,error:error.stack});}finally{f?.close();}
  });
  process.send({ready:true,remapped:[...remapped]});
}else{
  if(!process.argv[2])throw Error('Pass a preserved annotation-source baseline folder');
  const portableStream=process.argv.includes('--portable-stream'),paths=process.argv.slice(2).filter(arg=>arg!=='--portable-stream');
  const baseline=path.resolve(root,paths[0]);
  const input=path.resolve(root,paths[1]||'artifacts/model-view-profile-FstP3r/8-before-rotation.polyproj');
  const annotations=path.resolve(root,paths[2]||'artifacts/navigation-display-profile-OcTGR2/annotations.json');
  const folder=fs.mkdtempSync(path.join(root,'artifacts','annotation-source-profile-'));
  const sourceNames=['ui/app.js','ui/viewer.js','ui/viewer-element-content.mjs','ui/element-content-source.mjs','ui/element-content-controls.mjs','ui/native-source-binding.mjs','ui/memory-source-signature.mjs','ui/model-memories.mjs','tests/helpers/navigation-display.mjs','scripts/profile-annotation-source.mjs'];
  const sources=()=>Object.fromEntries(sourceNames.map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]));
  const receipt={passed:false,scope:'Direct source key/signature and actual app navigation CPU comparisons in independent Node processes; no GPU, native IPC/descriptor work, actual font decoding, Electron or packaged timings',
    node:process.version,platform:os.platform()+' '+os.release(),cpu:os.cpus()[0]?.model,sourcesBefore:sources(),
    baseline:{path:baseline,sha256:Object.fromEntries(['element-content-source.mjs','memory-source-signature.mjs','model-memories.mjs'].map(name=>[name,hash(fs.readFileSync(path.join(baseline,name)))]))},
    inputs:Object.fromEntries([input,annotations].map(file=>[file,hash(fs.readFileSync(file))])),samples:[]};
  const children=[];
  function start(mode){
    const child=fork(script,['--worker',mode,baseline,input,annotations],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});children.push(child);
    const pending=new Map();let sequence=0,stderr='';child.stderr.on('data',data=>stderr=(stderr+data).slice(-8000));
    let ready,failReady;const readyPromise=new Promise((resolve,reject)=>{ready=resolve;failReady=reject;});
    child.on('message',message=>{if(message.ready)return ready(message);const job=pending.get(message.id);if(!job)return;clearTimeout(job.timer);pending.delete(message.id);message.error?job.reject(Error(message.error)):job.resolve(message);});
    child.on('error',error=>{failReady(error);for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();});
    child.on('exit',code=>{const error=Error(`Profile worker ${mode} exited ${code}: ${stderr}`);failReady(error);for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();});
    return {ready:readyPromise,invoke:kind=>new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Profile request timeout'));},30000);
      pending.set(id,{resolve,reject,timer});child.send({id,kind});
    })};
  }
  try{
    const original=fs.readFileSync(path.join(baseline,'element-content-source.mjs'),'utf8'),current=fs.readFileSync(path.join(root,'ui/element-content-source.mjs'),'utf8');
    if(portableStream){
      const floatAndKeys=text=>text.slice(text.indexOf('export function pythonFloatHex('),text.indexOf('export function portableContentSource('));
      assert.equal(floatAndKeys(original),floatAndKeys(current),'Float spelling and key ordering unchanged');
      assert.equal(original.slice(original.indexOf('export async function sha256Content(')),current.slice(current.indexOf('export async function sha256Content(')),'Hash and descriptor ownership checks unchanged');
      assert.equal(hash(fs.readFileSync(path.join(baseline,'memory-source-signature.mjs'))),receipt.sourcesBefore['ui/memory-source-signature.mjs']);
      assert.equal(hash(fs.readFileSync(path.join(baseline,'model-memories.mjs'))),receipt.sourcesBefore['ui/model-memories.mjs']);
      receipt.floatKeyOrderHashDescriptorAndMemoryHelpersUnchanged=true;
    }else{
      assert.equal(original.slice(original.indexOf('function compareKeys(')),current.slice(current.indexOf('function compareKeys(')),'Portable walk/hash/descriptor checks unchanged');
      receipt.portableWalkHashAndDescriptorChecksUnchanged=true;
    }
    const workers={before:start('before'),after:start('after')};receipt.workers={before:await workers.before.ready,after:await workers.after.ready};
    assert.deepEqual(receipt.workers.before.remapped.toSorted(),['element-content-source.mjs','memory-source-signature.mjs']);assert.deepEqual(receipt.workers.after.remapped,[]);
    for(const kind of ['portable-key','memory-signature','plain-navigation','annotated-navigation']){
      let expected;
      for(let run=-2;run<9;run++)for(const mode of run%2?['after','before']:['before','after']){
        const result=await workers[mode].invoke(kind);expected??=result.outputSha256;assert.equal(result.outputSha256,expected,'Complete output byte/buffer/owner equality');
        if(run>=0)receipt.samples.push({kind,mode,run,...result});
      }
    }
    receipt.comparisons=[...new Set(receipt.samples.map(sample=>sample.kind))].map(kind=>({kind,...Object.fromEntries(['before','after'].map(mode=>{
      const values=receipt.samples.filter(sample=>sample.kind===kind&&sample.mode===mode).map(sample=>sample.ms).sort((a,b)=>a-b);
      return [mode,{medianMs:values[4],iqrMs:values[6]-values[2],samples:values.length}];
    }))}));
    receipt.pairedNavigationDeltas=receipt.samples.filter(sample=>sample.kind==='annotated-navigation'&&sample.mode==='before').map(before=>{
      const after=receipt.samples.find(sample=>sample.kind===before.kind&&sample.mode==='after'&&sample.run===before.run);
      return {run:before.run,savedMs:before.ms-after.ms,fractionSaved:1-after.ms/before.ms};
    });
    receipt.sourcesAfter=sources();assert.deepEqual(receipt.sourcesAfter,receipt.sourcesBefore);receipt.passed=true;
  }catch(error){receipt.error=error.stack;process.exitCode=1;}finally{
    for(const child of children)child.kill();
    fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({folder,passed:receipt.passed,comparisons:receipt.comparisons,error:receipt.error},null,2));
  }
}
