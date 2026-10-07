/** Isolated worker stage profile; no production module is rewritten.
 * Instrumented source copies live only in this run's artifact directory.
 * Original/instrumented results must match every Float32 bit, owner and status.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ui=path.join(root,'ui');
const hash=s=>createHash('sha256').update(s).digest('hex');
const summary=values=>{const a=values.toSorted((a,b)=>a-b);return {count:a.length,minimum:a[0],median:a[Math.floor((a.length-1)/2)],p95:a[Math.floor((a.length-1)*.95)],maximum:a.at(-1)};};
function replaceOnce(text,needle,replacement){assert.equal(text.split(needle).length,2,'Production source changed around profiling anchor: '+needle.slice(0,100));return text.replace(needle,replacement);}
function imports(text,replaceViewer){return text.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from '${name==='viewer-stereographic.mjs'&&replaceViewer?pathToFileURL(replaceViewer).href:pathToFileURL(path.join(ui,name)).href}'`);}
function equalOutput(a,b){
  const keys=Object.keys(a.geometry);assert.deepEqual(Object.keys(b.geometry),keys);
  for(const key of keys){const x=a.geometry[key],y=b.geometry[key];if(ArrayBuffer.isView(x)){assert.equal(x.constructor,y.constructor);assert.deepEqual(new Uint8Array(x.buffer,x.byteOffset,x.byteLength),new Uint8Array(y.buffer,y.byteOffset,y.byteLength),key);}else assert.deepEqual(x,y,key);}
  for(const key of Object.keys(a).filter(k=>k!=='geometry'))assert.deepEqual(b[key],a[key],key);
}
const header=`export let STAGE_PROFILE={};\nexport function resetStageProfile(){STAGE_PROFILE={};}\nfunction stage(name,start){STAGE_PROFILE[name]=(STAGE_PROFILE[name]||0)+performance.now()-start;}\n`;
async function instrument(folder){
  const workerPath=path.join(ui,'stereographic-worker-geometry.mjs'),viewerPath=path.join(ui,'viewer-stereographic.mjs'),workerOriginal=await fs.readFile(workerPath,'utf8'),viewerOriginal=await fs.readFile(viewerPath,'utf8'),copyViewer=path.join(folder,'profiled-viewer-stereographic.mjs'),copyWorker=path.join(folder,'profiled-worker-geometry.mjs');
  let v=viewerOriginal;
  v=replaceOnce(v,'const result=stereographicTriangle(raw,', 'const __triMathStart=performance.now();const result=stereographicTriangle(raw,');
  v=replaceOnce(v,'const span=sphericalSpanNormal(raw);','stage("triangleAdaptiveMathMs",__triMathStart);const __normalStart=performance.now();const span=sphericalSpanNormal(raw);');
  v=replaceOnce(v,'clippedTriangles+=result.clippedTriangles;', 'stage("analyticNormalsAndDisplayRecordsMs",__normalStart);STAGE_PROFILE.sourceTriangleCalls=(STAGE_PROFILE.sourceTriangleCalls||0)+1;STAGE_PROFILE.retainedTriangleRecords=(STAGE_PROFILE.retainedTriangleRecords||0)+result.triangles.length;clippedTriangles+=result.clippedTriangles;');
  await fs.writeFile(copyViewer,header+imports(v));
  let w=workerOriginal;
  w=replaceOnce(w,'const input=validateStereographicInput(value),o=settings(options)', 'resetStageProfile();const __totalStart=performance.now(),__validationStart=performance.now();const input=validateStereographicInput(value),o=settings(options)');
  w=replaceOnce(w,'const positions=new Float32Array(nv*3)', 'stage("inputValidationAndOwnedCopyMs",__validationStart);const __vertexStart=performance.now();const positions=new Float32Array(nv*3)');
  w=replaceOnce(w,'const arcs=[],patches=[];', 'stage("vertexProjectionMs",__vertexStart);const __edgeLoopStart=performance.now();const arcs=[],patches=[];');
  w=replaceOnce(w,'const result=stereoDisplayGeometry(points,', 'const __edgeHelperStart=performance.now();const result=stereoDisplayGeometry(points,');
  w=replaceOnce(w,'result.diagnostics.forEach(d=>notes.add(d));clippedSegments+=result.clippedSegments;', 'stage("edgeDisplayHelperMs",__edgeHelperStart);result.diagnostics.forEach(d=>notes.add(d));clippedSegments+=result.clippedSegments;');
  w=replaceOnce(w,'result.edges.forEach(segment=>arcs.push({...segment,instance:i}));', 'const __edgeRecordsStart=performance.now();result.edges.forEach(segment=>arcs.push({...segment,instance:i}));stage("edgeGlobalRecordRetentionMs",__edgeRecordsStart);');
  w=replaceOnce(w,'for(let i=0;i<nt;i++){', 'stage("edgeLoopTotalMs",__edgeLoopStart);const __triangleLoopStart=performance.now();for(let i=0;i<nt;i++){');
  w=replaceOnce(w,'const result=stereoDisplayGeometry([],', 'const __triangleHelperStart=performance.now();const result=stereoDisplayGeometry([],');
  w=replaceOnce(w,'result.diagnostics.forEach(d=>notes.add(d));clippedTriangles+=result.clippedTriangles;', 'stage("triangleDisplayHelperMs",__triangleHelperStart);result.diagnostics.forEach(d=>notes.add(d));clippedTriangles+=result.clippedTriangles;');
  w=replaceOnce(w,'result.triangles.forEach(triangle=>patches.push({...triangle,instance:i}));', 'const __patchRecordsStart=performance.now();result.triangles.forEach(triangle=>patches.push({...triangle,instance:i}));stage("triangleGlobalRecordRetentionMs",__patchRecordsStart);');
  w=replaceOnce(w,'const ns=arcs.length,np=patches.length,segments=', 'stage("triangleLoopTotalMs",__triangleLoopStart);const __edgePackingStart=performance.now();const ns=arcs.length,np=patches.length,segments=');
  w=replaceOnce(w,'const triangles=new Float32Array(np*9)', 'stage("edgeTypedPackingMs",__edgePackingStart);const __patchPackingStart=performance.now();const triangles=new Float32Array(np*9)');
  w=replaceOnce(w,'const geometry={version:1,positions,vertexIds:', 'stage("triangleTypedPackingMs",__patchPackingStart);const __descriptorStart=performance.now();const geometry={version:1,positions,vertexIds:');
  w=replaceOnce(w,'const decoded=decodeStereographicOutput(geometry,input);', 'stage("outputDescriptorAssemblyMs",__descriptorStart);const __decodeStart=performance.now();const decoded=decodeStereographicOutput(geometry,input);stage("outputValidationAndOwnedCopyMs",__decodeStart);stage("computeTotalMs",__totalStart);');
  await fs.writeFile(copyWorker,header+imports(w,copyViewer));
  // Isolated candidate: direct batch packing with the unchanged display math,
  // source order, remaining global budgets and final authoritative decoder.
  const copyArena=path.join(folder,'arena-worker-geometry.mjs');let candidate=workerOriginal;
  candidate=replaceOnce(candidate,'const arcs=[],patches=[];', 'const __arenaStart=performance.now(),arena=new StereographicOutputArena(input,{segments:o.limits.segments,triangles:o.limits.triangles});stage("arenaAllocationAndOwnerSnapshotMs",__arenaStart);');
  candidate=candidate.replaceAll('arcs.length','arena.segmentCount').replaceAll('patches.length','arena.triangleCount');
  candidate=replaceOnce(candidate,'result.edges.forEach(segment=>arcs.push({...segment,instance:i}));','const __edgePackStart=performance.now();for(const arc of result.edges){arena.appendSegmentCoordinates(i,arc.a[0],arc.a[1],arc.a[2],arc.b[0],arc.b[1],arc.b[2]);}stage("directEdgePackingMs",__edgePackStart);');
  candidate=replaceOnce(candidate,'result.triangles.forEach(triangle=>patches.push({...triangle,instance:i}));','const __patchPackStart=performance.now();for(const patch of result.triangles){const p=patch.points,n=patch.normals??geometricNormals(p);arena.appendTriangleCoordinates(i,p[0][0],p[0][1],p[0][2],p[1][0],p[1][1],p[1][2],p[2][0],p[2][1],p[2][2],n[0][0],n[0][1],n[0][2],n[1][0],n[1][1],n[1][2],n[2][0],n[2][1],n[2][2]);}stage("directTrianglePackingMs",__patchPackStart);');
  const packingStart=candidate.indexOf('  const ns=arena.segmentCount,np=arena.triangleCount,segments='),packingEnd=candidate.indexOf('  const geometry={version:1,positions,vertexIds:',packingStart);assert.ok(packingStart>=0&&packingEnd>packingStart);
  candidate=candidate.slice(0,packingStart)+'  const {segments,edgeIds,edgeFaces,edgeCells,edgeInstanceIds,triangles,normals,faceIds,cellIds,triangleIds,triangleInstanceIds}=arena.finish();\n'+candidate.slice(packingEnd);
  candidate=replaceOnce(candidate,'const input=validateStereographicInput(value),o=settings(options)', 'resetStageProfile();const __totalStart=performance.now();const input=validateStereographicInput(value),o=settings(options)');
  candidate=replaceOnce(candidate,'const decoded=decodeStereographicOutput(geometry,input);','const __decodeStart=performance.now();const decoded=decodeStereographicOutput(geometry,input);stage("outputValidationAndOwnedCopyMs",__decodeStart);stage("computeTotalMs",__totalStart);');
  await fs.writeFile(copyArena,header+`import {StereographicOutputArena} from '${pathToFileURL(path.join(ui,'stereographic-output-arena.mjs')).href}';\n`+imports(candidate));
  return {worker:await import(pathToFileURL(copyWorker)),viewer:await import(pathToFileURL(copyViewer)),arena:await import(pathToFileURL(copyArena)),sources:[{path:workerPath,sha256:hash(workerOriginal)},{path:viewerPath,sha256:hash(viewerOriginal)}],copies:{worker:copyWorker,viewer:copyViewer,arena:copyArena}};
}
async function main(){
  const args=process.argv.slice(2),benchmarkPath=path.resolve(args[0]||path.join(root,'artifacts','stereographic-dense-publication-packaged-Z5sXfD','result.json')),repeats=args[1]===undefined?4:Number(args[1]);assert.ok(Number.isInteger(repeats)&&repeats>=2&&repeats<=15,'Choose2..15 computation repetitions.');
  const benchmark=JSON.parse(await fs.readFile(benchmarkPath,'utf8')),folder=await fs.mkdtemp(path.join(root,'artifacts','stereographic-computation-profile-')),profiled=await instrument(folder),cases=[];
  for(const key of ['cell600','cell120']){
    const originalCase=benchmark.cases.find(c=>c.key===key&&c.cameraSetting==='default');assert.ok(originalCase,'Missing native benchmark source '+key);
    const project=JSON.parse(await fs.readFile(originalCase.nativeBefore,'utf8')),d=project.documents[project.active],model=d.states[d.cursor].model,before=JSON.stringify(model),viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();viewer.setModel(model);
    const input=prepareStereographicWorkerGeometry({model,normalized:viewer.normalized,edges:model.edges,triangles:viewer.triangles,visibility:viewer.visibility,matrix:null,angles:[0,0,24,0,18,0]}),tolerance=originalCase.requestedQualities.find(p=>p.phase==='interaction').quality.tolerance;
    for(const [quality,criterionTolerance] of [['observed-interaction',tolerance],['fine',.004]]){
      const options={tolerance:criterionTolerance},start=performance.now(),original=computeStereographicWorkerGeometry(input,options),baselineColdMs=performance.now()-start,samples=[];
      // One warm-up, then repeat identical posed source. No instrumentation
      // timer consumes coordinates or changes clipping/subdivision ordering.
      profiled.viewer.resetStageProfile();equalOutput(original,profiled.worker.computeStereographicWorkerGeometry(input,options));
      for(let i=0;i<repeats;i++){profiled.viewer.resetStageProfile();const start=performance.now(),result=profiled.worker.computeStereographicWorkerGeometry(input,options),instrumentedWallMs=performance.now()-start;equalOutput(original,result);samples.push({instrumentedWallMs,...profiled.worker.STAGE_PROFILE,...profiled.viewer.STAGE_PROFILE});}
      const stages=Object.fromEntries([...new Set(samples.flatMap(Object.keys))].map(name=>[name,summary(samples.map(s=>s[name]??0))])),bytes=Object.values(original.geometry).filter(ArrayBuffer.isView).reduce((n,a)=>n+a.byteLength,0);
      equalOutput(original,profiled.arena.computeStereographicWorkerGeometry(input,options));const arenaSamples=[];
      for(let i=0;i<repeats;i++){
        const originalStart=performance.now(),baseline=computeStereographicWorkerGeometry(input,options),originalWarmMs=performance.now()-originalStart;
        const arenaStart=performance.now(),result=profiled.arena.computeStereographicWorkerGeometry(input,options),arenaWallMs=performance.now()-arenaStart;
        equalOutput(original,baseline);equalOutput(original,result);arenaSamples.push({originalWarmMs,arenaWallMs,...profiled.arena.STAGE_PROFILE});
      }
      const arenaStages=Object.fromEntries([...new Set(arenaSamples.flatMap(Object.keys))].map(name=>[name,summary(arenaSamples.map(s=>s[name]??0))]));
      cases.push({key,model:model.name,sourceProject:originalCase.nativeBefore,sourceFingerprint:model.fingerprint,sourceUnchanged:JSON.stringify(model)===before,quality,tolerance:criterionTolerance,inputVertices:input.vertexIds.length,inputEdges:input.edgeIds.length,inputTriangles:input.faceIds.length,outputSegments:original.geometry.edgeIds.length,outputTriangles:original.geometry.faceIds.length,outputBytes:bytes,complete:original.complete,unresolvedEdges:original.unresolvedEdges,unresolvedTriangles:original.unresolvedTriangles,omittedEdges:original.omittedEdges,omittedTriangles:original.omittedTriangles,diagnostics:original.geometry.diagnostics,baselineColdMs,instrumentedBitwiseEquivalent:true,stages,samples,arenaBitwiseEquivalent:true,arenaStages,arenaSamples});assert.equal(JSON.stringify(model),before);
      console.log(`${key} ${quality}: ${original.geometry.faceIds.length} patches; total ${stages.computeTotalMs.median.toFixed(1)}ms; adaptive ${stages.triangleAdaptiveMathMs.median.toFixed(1)}, normals/records ${stages.analyticNormalsAndDisplayRecordsMs.median.toFixed(1)}, global records ${stages.triangleGlobalRecordRetentionMs.median.toFixed(1)}, typed pack ${stages.triangleTypedPackingMs.median.toFixed(1)}, final validation ${stages.outputValidationAndOwnedCopyMs.median.toFixed(1)}ms; complete ${original.complete}`);
      console.log(`  isolated arena: original warm ${arenaStages.originalWarmMs.median.toFixed(1)}ms; candidate ${arenaStages.arenaWallMs.median.toFixed(1)}ms; direct packing ${arenaStages.directTrianglePackingMs.median.toFixed(1)}ms (includes scalar/source validation); all bytes/statuses identical`);
    }
    viewer.clear();
  }
  for(const source of profiled.sources)assert.equal(hash(await fs.readFile(source.path,'utf8')),source.sha256,'A production source changed while the headless profile ran.');
  const report={scope:'Headless actual native sources, posed once, actual pure production compute; isolated instrumented copies. Node/V8 CPU only: no browserWorker/IPC/GPU/RAF or universal FPS claim. Nested stage durations overlap; do not sum nested medians. Cold baseline and warmed instrumented stage timings are not an overhead ratio.',benchmarkPath,benchmarkVersion:benchmark.version,repeats,originalSourcesUnchanged:true,sourceHashes:profiled.sources,instrumentedCopies:profiled.copies,cases};
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2));console.log('Evidence: '+folder);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
