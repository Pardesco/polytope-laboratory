/** Headless production CPU profile. No Electron, Worker thread, canvas or GPU.
 * Uses saved native benchmark geometry and the real pure tessellator once;
 * reports stages separately, not a simulated browser FPS or listener total.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {prepareStereographicWorkerGeometry,runStereographicWorkerJob} from '../ui/stereographic-worker-geometry.mjs';
import {validateStereographicInput,decodeStereographicOutput} from '../ui/stereographic-worker-protocol.mjs';
import {typedStereographicPublication} from '../ui/viewer-stereographic-typed.mjs';
import {typedDisplayBounds,sameTypedDisplayOwners} from '../ui/stereographic-typed-display.mjs';
import {packSurfaceColors} from '../ui/packed-surface-colors.mjs';
import {samePackedDisplayOwners} from '../ui/packed-owner-comparison.mjs';
import {legacySurfaceColors,legacySameTypedDisplayOwners} from '../tests/fixtures/legacy-surface-colors.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const statistics=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:sorted.length,minimum:sorted[0],median:sorted[Math.floor((sorted.length-1)*.5)],p95:sorted[Math.floor((sorted.length-1)*.95)],maximum:sorted.at(-1)};};
function measure(fn,repeats){for(let i=0;i<3;i++)fn();const values=[];for(let i=0;i<repeats;i++){const start=performance.now();fn();values.push(performance.now()-start);}return statistics(values);}
const bits=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
const copyOutput=g=>Object.fromEntries(Object.entries(g).map(([key,value])=>[key,ArrayBuffer.isView(value)?value.slice():value]));
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};

async function main(){
  const args=process.argv.slice(2),benchmarkPath=path.resolve(args[0]||path.join(root,'artifacts','stereographic-dense-publication-packaged-Z5sXfD','result.json')),repeats=args[1]===undefined?10:Number(args[1]);
  if(!Number.isInteger(repeats)||repeats<3||repeats>50)throw Error('Choose3..50 headless repetitions.');
  const benchmark=JSON.parse(await fs.readFile(benchmarkPath,'utf8')),caseRecord=benchmark.cases.find(c=>c.key==='cell600'&&c.cameraSetting==='default')??benchmark.cases[0];
  const sourceProjectPath=path.resolve(caseRecord.nativeBefore),project=JSON.parse(await fs.readFile(sourceProjectPath,'utf8')),state=active(project),model=state.model,sourceBefore=JSON.stringify(model);
  const viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();viewer.setModel(model);
  const view={projection:'stereographic',angles:[0,0,24,0,18,0],fillRule:'nonzero',faces:true,edges:true,vertices:false,surfaceOpacity:.22,surfaceColors:'source',edgeStyle:'line',vertexStyle:'point'};
  const input=validateStereographicInput(prepareStereographicWorkerGeometry({model,normalized:viewer.normalized,edges:model.edges,triangles:viewer.triangles,visibility:viewer.visibility,matrix:null,angles:view.angles}));
  const sourceKey=JSON.stringify([model.id,model.fingerprint]),frameKey=JSON.stringify({angles:view.angles}),quality={phase:'interaction',tolerance:.004,criterion:'adaptive-sampled-world-error',wholePrimitiveBound:false,poleEpsilon:.02,pixelBound:'orthographic-criterion-conversion',budgetSatisfied:true};
  const job={type:'geometry-job',version:1,jobId:1,token:1,generation:1,sourceKey,frameKey,phase:'interaction',quality,geometry:input};
  const start=performance.now(),workerResult=runStereographicWorkerJob(job),pureMathPreparationMs=performance.now()-start;assert.equal(workerResult.type,'geometry-result',workerResult.message);
  const decoded=decodeStereographicOutput(workerResult.geometry,input),copied=copyOutput(decoded),publication={...job,type:undefined,model,source:{modelId:model.id,fingerprint:model.fingerprint},intermediate:false,complete:workerResult.complete,exactPose:true,achievedTolerance:.004,clippedSegments:workerResult.clippedSegments,clippedTriangles:workerResult.clippedTriangles,geometry:copied},snapshot={model,input,keys:{sourceKey,frameKey},view};
  const display=typedStereographicPublication(publication,snapshot,()=>true),packed=display.packed,second=typedStereographicPublication({...publication,geometry:copyOutput(copied)},snapshot,()=>true);
  viewer.setDisplayNow(view,{publication:display});const currentColors=viewer.surfaceGeometry.getAttribute('color').array.slice();legacySurfaceColors.call(viewer,'source');const originalColors=viewer.surfaceGeometry.getAttribute('color').array.slice(),candidate=packSurfaceColors(model,packed,viewer.visibility,'source');assert.deepEqual(bits(candidate.colors),bits(originalColors));assert.deepEqual(bits(currentColors),bits(originalColors));assert.equal(candidate.vertexAlpha,viewer.surfaceVertexAlpha);
  const target=new Float32Array(candidate.colors.length),rendererTimings=[];viewer.onStereographicTiming=t=>rendererTimings.push(t);
  const stages={
    authoritativeDecodeAndOwnedCopyMs:measure(()=>decodeStereographicOutput(workerResult.geometry,input),repeats),
    additionalPublicationBufferCopyMs:measure(()=>copyOutput(decoded),repeats),
    typedDisplayValidationAndBoundsMs:measure(()=>typedStereographicPublication(publication,snapshot,()=>true),repeats),
    separateBoundsScanMs:measure(()=>typedDisplayBounds(packed),repeats),
    sameOwnerLayoutComparisonMs:measure(()=>sameTypedDisplayOwners(packed,second.packed),repeats),
    legacySameOwnerLayoutComparisonMs:measure(()=>legacySameTypedDisplayOwners(packed,second.packed),repeats),
    candidateSameOwnerLayoutComparisonMs:measure(()=>samePackedDisplayOwners(packed,second.packed),repeats),
    productionSurfaceColorsMs:measure(()=>viewer.surfaceColors('source'),repeats),
    legacySurfaceColorsMs:measure(()=>legacySurfaceColors.call(viewer,'source'),repeats),
    candidateSurfaceColorsMs:measure(()=>packSurfaceColors(model,packed,viewer.visibility,'source',{target}),repeats),
    productionWholePackedDisplayStableOwnersMs:measure(()=>viewer.setDisplayNow(view,{publication:second}),repeats),
    productionWholePackedDisplayForcedColorsMs:measure(()=>{viewer.colorKey=null;viewer.setDisplayNow(view,{publication:second});},repeats),
  };
  assert.equal(JSON.stringify(model),sourceBefore);assert.deepEqual(bits(target),bits(originalColors));
  const observed=benchmark.cases.map(c=>{const interaction=c.productionListenerJobs.filter(j=>j.phase==='interaction'&&j.qualified).map(j=>j.totalPrefixMs);return {key:c.key,setting:c.cameraSetting,workerComputeMs:c.workerHandlerMs,mainPerJobListenerPrefixMs:c.mainMessageListenersTotalPerJobMs,interactionPrefixMs:interaction.length?statistics(interaction):null,publishedAngles:c.actualDistinctPublishedAngles,observationMs:c.renderObservationMs,geometryUpdatesPerObservedSecond:1000*c.actualDistinctPublishedAngles/c.renderObservationMs,rafGapMs:c.mainThreadRafGapMs,outputTriangleMaximum:c.outputTriangleMaximum,partialResults:c.partialResultCount,omittedTriangleMaximum:c.omittedTriangleMaximum,unresolvedTriangleMaximum:c.unresolvedTriangleMaximum};});
  const report={scope:'Headless Node/V8 component CPU timings on real native source and actual pure worker output; no WebGL/GPU/IPC/browser scheduling measured. Stage medians are independent repetitions and must not be added as a qualified browser-listener total.',independentBaseline:'tests/fixtures/legacy-surface-colors.mjs frozen pre-optimization14.0 method',benchmarkPath,sourceProjectPath,benchmarkVersion:benchmark.version,repeats,model:model.name,sourceFingerprint:model.fingerprint,sourceUnchanged:true,patches:packed.counts.patches,segments:packed.counts.segments,outputBytes:packed.counts.bytes,complete:packed.complete,diagnostics:packed.diagnostics,pureMathPreparationMs,stages,candidateColorBitwiseEquivalent:true,candidateMedianRatio:stages.legacySurfaceColorsMs.median/stages.candidateSurfaceColorsMs.median,candidateOwnerComparisonMedianRatio:stages.legacySameOwnerLayoutComparisonMs.median/stages.candidateSameOwnerLayoutComparisonMs.median,rendererSubstageObservations:rendererTimings,observedBenchmark:observed};
  const folder=await fs.mkdtemp(path.join(root,'artifacts','stereographic-publication-profile-'));await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2));viewer.clear();
  console.log(JSON.stringify({folder,scope:report.scope,patches:report.patches,segments:report.segments,stages,candidateMedianRatio:report.candidateMedianRatio,candidateColorBitwiseEquivalent:true,sourceUnchanged:true},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
