/** Headless isolated adaptive candidate, actual native 600/120 snapshots.
 * Production sources stay untouched; all coordinates/normals/ownership/status
 * buffers must be byte-identical. CPU medians are not browser/GPU/FPS evidence.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
import * as originalMath from '../tests/fixtures/legacy-stereographic.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ui=path.join(root,'ui');
const hash=s=>createHash('sha256').update(s).digest('hex');
const summary=values=>{const a=values.toSorted((a,b)=>a-b);return {count:a.length,minimum:a[0],median:a[Math.floor((a.length-1)/2)],maximum:a.at(-1)};};
function equalOutput(a,b){
  assert.deepEqual(Object.keys(a.geometry),Object.keys(b.geometry));
  for(const key of Object.keys(a.geometry)){
    const x=a.geometry[key],y=b.geometry[key];if(ArrayBuffer.isView(x)){assert.equal(x.constructor,y.constructor);assert.deepEqual(Buffer.from(x.buffer,x.byteOffset,x.byteLength),Buffer.from(y.buffer,y.byteOffset,y.byteLength),key);}else assert.deepEqual(x,y,key);
  }
  for(const key of Object.keys(a).filter(k=>k!=='geometry'))assert.deepEqual(a[key],b[key],key);
}
function replaceOnce(text,old,replacement){assert.equal(text.split(old).length,2,'Profile anchor/source changed: '+old);return text.replace(old,replacement);}
async function main(){
  const baselinePath=path.resolve(process.argv[2]||path.join(root,'artifacts','stereographic-computation-profile-r0Bszh','result.json')),repeats=Number(process.argv[3]??4);assert.ok(Number.isInteger(repeats)&&repeats>=2&&repeats<=12,'Choose2..12 repeat batches.');
  const baseline=JSON.parse(await fs.readFile(baselinePath,'utf8')),folder=await fs.mkdtemp(path.join(root,'artifacts','stereographic-adaptive-profile-'));
  for(const source of baseline.sourceHashes)assert.equal(hash(await fs.readFile(source.path,'utf8')),source.sha256,'Production baseline changed; first regenerate the stage profile.');
  const frozen=await fs.readFile(path.join(root,'tests','fixtures','legacy-stereographic.mjs'),'utf8'),originalMathHash=frozen.match(/Original UI file SHA256: ([a-f0-9]{64})/)[1];
  assert.equal(hash(await fs.readFile(path.join(ui,'stereographic.mjs'))),originalMathHash,'Production math changed: this profile requires the frozen pre-optimization worker baseline, not a circular comparison.');
  const sourcePaths=[path.join(ui,'stereographic.mjs'),path.join(ui,'viewer-stereographic.mjs'),path.join(ui,'stereographic-worker-geometry.mjs'),path.join(root,'development','stereographic-memoized.mjs'),path.join(ui,'stereographic-output-arena.mjs')],sources=[];
  for(const sourcePath of sourcePaths)sources.push({path:sourcePath,sha256:hash(await fs.readFile(sourcePath,'utf8'))});
  const viewerOriginal=await fs.readFile(path.join(ui,'viewer-stereographic.mjs'),'utf8'),copyViewer=path.join(folder,'adaptive-viewer-stereographic.mjs'),copyWorker=path.join(folder,'adaptive-worker-geometry.mjs'),copyMath=path.join(folder,'adaptive-stereographic.mjs');
  await fs.copyFile(path.join(root,'development','stereographic-memoized.mjs'),copyMath);const candidateMath=await import(pathToFileURL(copyMath));
  const viewerCopy=viewerOriginal.replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from '${pathToFileURL(name==='stereographic.mjs'?copyMath:path.join(ui,name)).href}'`);
  await fs.writeFile(copyViewer,viewerCopy);
  const arenaSource=await fs.readFile(baseline.instrumentedCopies.arena,'utf8'),workerCopy=replaceOnce(arenaSource,pathToFileURL(path.join(ui,'viewer-stereographic.mjs')).href,pathToFileURL(copyViewer).href);await fs.writeFile(copyWorker,workerCopy);
  const arena=await import(pathToFileURL(baseline.instrumentedCopies.arena)),adaptive=await import(pathToFileURL(copyWorker)),cases=[];
  const implementations={original:computeStereographicWorkerGeometry,arena:arena.computeStereographicWorkerGeometry,adaptive:adaptive.computeStereographicWorkerGeometry};
  for(const previous of baseline.cases){
    const project=JSON.parse(await fs.readFile(previous.sourceProject,'utf8')),d=project.documents[project.active],model=d.states[d.cursor].model,sourceBefore=JSON.stringify(model),viewer=Object.create(Viewer.prototype);viewer.group=new THREE.Group();viewer.setModel(model);
    const input=prepareStereographicWorkerGeometry({model,normalized:viewer.normalized,edges:model.edges,triangles:viewer.triangles,visibility:viewer.visibility,matrix:null,angles:[0,0,24,0,18,0]}),options={tolerance:previous.tolerance},expected=computeStereographicWorkerGeometry(input,options),samples=[];
    for(const impl of Object.values(implementations))equalOutput(expected,impl(input,options));
    for(let batch=0;batch<repeats;batch++){
      const row={};
      // Rotate measurement order to reduce a fixed order/JIT/GC bias.
      const names=Object.keys(implementations);for(let i=0;i<names.length;i++){
        const name=names[(i+batch)%names.length];if(name==='adaptive')candidateMath.resetAdaptiveProfile();
        const start=performance.now(),result=implementations[name](input,options);row[name+'Ms']=performance.now()-start;equalOutput(expected,result);
        if(name==='adaptive')row.adaptiveProfile={...candidateMath.ADAPTIVE_PROFILE};
      }
      samples.push(row);
    }
    const timings=Object.fromEntries(Object.keys(implementations).map(name=>[name,summary(samples.map(s=>s[name+'Ms']))])),profile=samples[0].adaptiveProfile;for(const row of samples)assert.deepEqual(row.adaptiveProfile,profile);
    cases.push({key:previous.key,quality:previous.quality,tolerance:previous.tolerance,sourceProject:previous.sourceProject,sourceFingerprint:model.fingerprint,inputTriangles:input.faceIds.length,outputTriangles:expected.geometry.faceIds.length,outputSegments:expected.geometry.edgeIds.length,complete:expected.complete,unresolvedEdges:expected.unresolvedEdges,unresolvedTriangles:expected.unresolvedTriangles,omittedEdges:expected.omittedEdges,omittedTriangles:expected.omittedTriangles,diagnostics:expected.geometry.diagnostics,allBuffersAndStatusesBitIdentical:true,sourceUnchanged:JSON.stringify(model)===sourceBefore,timings,profile,triangleProjectionReduction:profile.triangleCacheHits/profile.triangleSampleRequests,samples});assert.equal(JSON.stringify(model),sourceBefore);viewer.clear();
    console.log(`${previous.key} ${previous.quality}: original ${timings.original.median.toFixed(1)}ms, arena ${timings.arena.median.toFixed(1)}ms, scalar/memo ${timings.adaptive.median.toFixed(1)}ms; projection calls ${(100*profile.triangleCacheHits/profile.triangleSampleRequests).toFixed(1)}% fewer; exact buffers/statuses, complete=${expected.complete}`);
  }
  const smallCases=[];
  for(const [name,kind,points,options] of [
    ['quarter-circle','edge',[[1,0,0,0],[0,1,0,0]],{tolerance:.004,maxDepth:8}],
    ['generic-patch','triangle',[[1,.2,.3,.25],[-.15,1,.1,.35],[.1,-.2,1,-.4]],{tolerance:.004,maxDepth:8}],
    ['pole-crossing','edge',[[1,0,0,1],[-1,0,0,1]],{tolerance:.004,maxDepth:8}],
    ['interior-pole-patch','triangle',[[1,0,0,1],[0,1,0,1],[-1,-1,0,1]],{tolerance:.032,maxDepth:8,maxTriangles:100000}]
  ]){
    const call=math=>kind==='edge'?math.stereographicEdge(...points,options):math.stereographicTriangle(points,options),expected=call(originalMath),samples=[];
    call(candidateMath);
    for(let i=0;i<30;i++){
      const start=performance.now(),a=call(originalMath),originalMs=performance.now()-start;candidateMath.resetAdaptiveProfile();const c=performance.now(),b=call(candidateMath),candidateMs=performance.now()-c;assert.deepEqual(b,a);assert.deepEqual(b,expected);samples.push({originalMs,candidateMs});
    }
    smallCases.push({name,kind,options,original:summary(samples.map(s=>s.originalMs)),candidate:summary(samples.map(s=>s.candidateMs)),profile:{...candidateMath.ADAPTIVE_PROFILE},complete:!expected.exhausted,diagnostics:expected.diagnostics,exact:true});
  }
  for(const source of sources)assert.equal(hash(await fs.readFile(source.path,'utf8')),source.sha256,'Source changed during isolated profile.');
  const result={scope:'Headless native600/120 original math vs isolated arena vs isolated scalar/memoized adaptive math. Same source/pose/tolerance; byte-identical Float32 positions/normals/ownerIDs/resolutions and complete/clipped/unresolved/omitted statuses. Node/V8-only: no actual browserWorker, GPU or universal FPS claim. Original caps and sampled criterion remain; capped dense captures still refuse.',baselinePath,repeats,sources,sourceFilesUnchanged:true,prototypeFiles:{viewer:copyViewer,worker:copyWorker,math:copyMath},cases,smallCases};
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));console.log('Evidence: '+folder);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
