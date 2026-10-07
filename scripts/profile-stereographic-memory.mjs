/** Isolated Node processes measure sampled high-water and post-GC retention.
 * Run with --expose-gc. No GUI, production rewrites, pool or decoder bypass.
 * Samples do NOT prove the absolute peak between sampling points; RSS includes
 * runtime/allocator reservation. Capacity churn is distinguished from retention.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {prepareStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..'),ui=path.join(root,'ui');
const hash=s=>createHash('sha256').update(s).digest('hex');
const summarize=a=>{const sorted=a.toSorted((a,b)=>a-b);return {minimum:sorted[0],median:sorted[Math.floor((sorted.length-1)/2)],maximum:sorted.at(-1)};};
function once(source,old,replacement){assert.equal(source.split(old).length,2,'Memory anchor changed: '+old.slice(0,100));return source.replace(old,replacement);}
async function gc(){await new Promise(resolve=>setImmediate(resolve));global.gc();global.gc();}
function outputHash(output){
  const digest=createHash('sha256');for(const [key,value] of Object.entries(output.geometry)){digest.update(key);digest.update(ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):JSON.stringify(value));}
  digest.update(JSON.stringify(Object.fromEntries(Object.entries(output).filter(([key])=>key!=='geometry'))));return digest.digest('hex');
}
async function child(configPath){
  assert.equal(typeof global.gc,'function','Use node --expose-gc.');const config=JSON.parse(await fs.readFile(configPath,'utf8')),project=JSON.parse(await fs.readFile(config.sourceProject,'utf8')),d=project.documents[project.active],model=d.states[d.cursor].model,sourceBefore=JSON.stringify(model),viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();viewer.setModel(model);
  const input=prepareStereographicWorkerGeometry({model,normalized:viewer.normalized,edges:model.edges,triangles:viewer.triangles,visibility:viewer.visibility,matrix:null,angles:[0,0,24,0,18,0]}),module=await import(pathToFileURL(config.module));
  module.computeStereographicWorkerGeometry(input,{tolerance:config.tolerance});await gc();const samples=[];
  for(let i=0;i<3;i++){
    await gc();module.resetMemoryProfile();const baseline=process.memoryUsage(),start=performance.now();let output=module.computeStereographicWorkerGeometry(input,{tolerance:config.tolerance});const durationMs=performance.now()-start;
    const result={durationMs,baseline,atReturn:process.memoryUsage(),stages:[...module.MEMORY_PROFILE],outputHash:outputHash(output),outputBytes:Object.values(output.geometry).filter(ArrayBuffer.isView).reduce((n,a)=>n+a.byteLength,0),ownedExactSize:Object.values(output.geometry).filter(ArrayBuffer.isView).every(a=>a.byteLength===a.buffer.byteLength),segments:output.geometry.edgeIds.length,triangles:output.geometry.faceIds.length,complete:output.complete,omittedTriangles:output.omittedTriangles,unresolvedTriangles:output.unresolvedTriangles};
    await gc();result.retainingResult=process.memoryUsage();output=null;await gc();result.releasedResult=process.memoryUsage();
    result.sampledHighwater=Object.fromEntries(['heapUsed','external','arrayBuffers','rss'].map(key=>[key,Math.max(result.atReturn[key],...result.stages.map(s=>s[key]))]));samples.push(result);
  }
  assert.equal(JSON.stringify(model),sourceBefore);const first=samples[0];for(const sample of samples)assert.equal(sample.outputHash,first.outputHash);
  const report={...config,inputVertices:input.vertexIds.length,inputEdges:input.edgeIds.length,inputTriangles:input.faceIds.length,sourceFingerprint:model.fingerprint,sourceUnchanged:true,outputHash:first.outputHash,outputBytes:first.outputBytes,ownedExactSize:first.ownedExactSize,segments:first.segments,triangles:first.triangles,complete:first.complete,omittedTriangles:first.omittedTriangles,unresolvedTriangles:first.unresolvedTriangles,cpuMs:summarize(samples.map(s=>s.durationMs)),sampledHighwaterDelta:Object.fromEntries(['heapUsed','external','arrayBuffers','rss'].map(key=>[key,summarize(samples.map(s=>s.sampledHighwater[key]-s.baseline[key]))])),retainingResultDelta:Object.fromEntries(['heapUsed','external','arrayBuffers','rss'].map(key=>[key,summarize(samples.map(s=>s.retainingResult[key]-s.baseline[key]))])),releasedResultDelta:Object.fromEntries(['heapUsed','external','arrayBuffers','rss'].map(key=>[key,summarize(samples.map(s=>s.releasedResult[key]-s.baseline[key]))])),samples};
  await fs.writeFile(config.output,JSON.stringify(report,null,2));
}
function memoryCopy(source,kind){
  source=once(source,'const input=validateStereographicInput(value),o=settings(options)','resetMemoryProfile();memory("before-input-validation");const input=validateStereographicInput(value),o=settings(options)');
  source=once(source,'for(let i=0;i<ne;i++){','memory("before-edges");for(let i=0;i<ne;i++){if(i%64===0)memory("edge-batch");');
  source=once(source,'for(let i=0;i<nt;i++){','memory("before-triangles");for(let i=0;i<nt;i++){if(i%16===0)memory("triangle-batch");');
  if(kind==='original')source=once(source,'const ns=arcs.length,np=patches.length,segments=','memory("before-flat-packing");const ns=arcs.length,np=patches.length,segments=');
  source=once(source,'const geometry={version:1,positions,vertexIds:','memory("before-descriptor");const geometry={version:1,positions,vertexIds:');
  if(kind!=='original')source=once(source,'const {segments,edgeIds,edgeFaces,edgeCells,edgeInstanceIds,triangles,normals,faceIds,cellIds,triangleIds,triangleInstanceIds}=arena.finish();','memory("arena-capacity",{arenaCapacityBytes:arena.capacityBytes??11200000,arenaCumulativeAllocatedBytes:arena.cumulativeAllocatedBytes??11200000,arenaGrowths:arena.growthCount??0});const {segments,edgeIds,edgeFaces,edgeCells,edgeInstanceIds,triangles,normals,faceIds,cellIds,triangleIds,triangleInstanceIds}=arena.finish();');
  source=once(source,'const decoded=decodeStereographicOutput(geometry,input);','memory("before-final-decoder");const decoded=decodeStereographicOutput(geometry,input);memory("after-final-decoder");');
  return 'export let MEMORY_PROFILE=[];export function resetMemoryProfile(){MEMORY_PROFILE=[];}function memory(stage,extra={}){MEMORY_PROFILE.push({stage,...extra,...process.memoryUsage()});}\n'+source;
}
async function main(){
  assert.equal(typeof global.gc,'function','Use node --expose-gc.');
  const adaptivePath=path.resolve(process.argv[2]||path.join(root,'artifacts','stereographic-adaptive-profile-WPQfqs','result.json')),adaptive=JSON.parse(await fs.readFile(adaptivePath,'utf8')),baseline=JSON.parse(await fs.readFile(adaptive.baselinePath,'utf8')),benchmark=JSON.parse(await fs.readFile(path.join(root,'artifacts','stereographic-dense-publication-packaged-Z5sXfD','result.json'),'utf8')),folder=await fs.mkdtemp(path.join(root,'artifacts','stereographic-memory-profile-'));
  for(const source of baseline.sourceHashes)assert.equal(hash(await fs.readFile(source.path,'utf8')),source.sha256,'Original worker/helper changed; frozen baseline required.');
  const frozen=await fs.readFile(path.join(root,'tests','fixtures','legacy-stereographic.mjs'),'utf8'),originalMathHash=frozen.match(/Original UI file SHA256: ([a-f0-9]{64})/)[1];
  assert.equal(hash(await fs.readFile(path.join(ui,'stereographic.mjs'))),originalMathHash,'Original math changed: do not profile an optimized baseline against itself.');
  const modules={};
  for(const variant of ['original','arena','adaptive','growth','hybrid']){
    const sourcePath=variant==='original'?path.join(ui,'stereographic-worker-geometry.mjs'):variant==='arena'?baseline.instrumentedCopies.arena:adaptive.prototypeFiles.worker;
    let source=await fs.readFile(sourcePath,'utf8');if(variant==='original')source=source.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from '${pathToFileURL(path.join(ui,name)).href}'`);
    if(variant==='growth'||variant==='hybrid'){
      const name=variant==='growth'?'GrowingStereographicOutputArena':'HybridStereographicOutputArena';
      source=once(source,"import {StereographicOutputArena} from '",`import {${name} as StereographicOutputArena} from '`);
      source=once(source,pathToFileURL(path.join(ui,'stereographic-output-arena.mjs')).href,pathToFileURL(path.join(root,'development',`stereographic-${variant==='growth'?'growing':'hybrid'}-output-arena.mjs`)).href);
    }
    const module=path.join(folder,variant+'-worker-geometry.mjs');await fs.writeFile(module,memoryCopy(source,variant));modules[variant]=module;
  }
  const cases=[];
  for(const [key,quality] of [['tesseract','observed-interaction'],['tesseract','fine'],['cell600','fine'],['cell120','fine']]){
    const source=benchmark.cases.find(c=>c.key===key&&c.cameraSetting==='default'),tolerance=quality==='fine'?.004:source.requestedQualities.find(q=>q.phase==='interaction').quality.tolerance;let expected;
    for(const variant of ['original','arena','adaptive','growth','hybrid']){
      const output=path.join(folder,`${key}-${quality}-${variant}.json`),config={key,quality,tolerance,variant,module:modules[variant],sourceProject:source.nativeBefore,output},configPath=output+'.config.json';await fs.writeFile(configPath,JSON.stringify(config));
      execFileSync(process.execPath,['--expose-gc',script,'--child',configPath],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:120000});const result=JSON.parse(await fs.readFile(output,'utf8'));
      if(expected)assert.equal(result.outputHash,expected);else expected=result.outputHash;cases.push(result);
      console.log(`${key} ${quality} ${variant}: ${result.cpuMs.median.toFixed(1)}ms; patches${result.triangles}; sampled arraybuffer delta ${(result.sampledHighwaterDelta.arrayBuffers.maximum/1048576).toFixed(2)}MiB; heap delta ${(result.sampledHighwaterDelta.heapUsed.maximum/1048576).toFixed(2)}MiB; retained arrays ${(result.retainingResultDelta.arrayBuffers.median/1048576).toFixed(2)}MiB`);
    }
  }
  for(const source of baseline.sourceHashes)assert.equal(hash(await fs.readFile(source.path,'utf8')),source.sha256,'Production source changed during memory profile.');
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({scope:'Fresh isolated Node processes, actual native tesseract/600/120 at identical pose. Explicit GC only before/after computation, never inside math. Sampled high-water is not absolute allocator peak. RSS/external may remain reserved; report actual arrayBuffers separately. Fixed arena allocates11,200,000 bytes every compute; decoder owns exact used prefixes. No browser/GPU/universalFPS qualification.',adaptivePath,cases,fixedArenaCapacityBytes:11200000,productionSourcesUnchanged:true},null,2));console.log('Evidence: '+folder);
}
(process.argv[2]==='--child'?child(process.argv[3]):main()).catch(error=>{console.error(error);process.exitCode=1;});
