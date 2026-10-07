// Display benchmark only. Source import/geometry certification remains the
// engine's job; this extracts the already audited supplied OFF face cycles.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';

const source=process.argv[2]||'data/drive-uniforms/Cat28/1503 - Sudspeshax.off';
const sourceText=fs.readFileSync(source,'utf8');
const lines=sourceText.split(/\r?\n/).map(line=>line.split('#')[0].trim()).filter(Boolean);
if(!['OFF','4OFF'].includes(lines[0]))throw Error('Expected OFF/4OFF display benchmark input.');
const [nv,nf]=lines[1].split(/\s+/).map(Number);
const vertices=lines.slice(2,2+nv).map(line=>line.split(/\s+/).map(Number));
const faces=lines.slice(2+nv,2+nv+nf).map(line=>{const values=line.split(/\s+/).map(Number);return values.slice(1,1+values[0]);});
const model={vertices,faces},faceSizes={};faces.forEach(face=>faceSizes[face.length]=(faceSizes[face.length]||0)+1);
const records=[];
for(const fillRule of ['nonzero','even-odd']){
  const start=performance.now(),result=buildFaceSurfaces(model,fillRule),elapsedMs=performance.now()-start;
  const virtualTriangles=result.triangles.filter(t=>!t.vertices).length;
  records.push({fillRule,elapsedMs:Math.round(elapsedMs),triangles:result.triangles.length,virtualTriangles,
    filledFaces:result.filledFaces,suppressedFaces:result.suppressedFaces,
    reasons:[...new Set(result.diagnostics.map(d=>d.reason))]});
}
const lastFace=faces.length-1,start=performance.now();
const isolated=buildFaceSurfaces(model,'nonzero',{faceIds:[lastFace]});
if(isolated.suppressedFaces||isolated.triangles.some(t=>t.face!==lastFace))throw Error('Late-face isolation benchmark failed.');
records.push({fillRule:'nonzero',isolatedSourceFace:lastFace,elapsedMs:Math.round(performance.now()-start),
  triangles:isolated.triangles.length,filledFaces:isolated.filledFaces,suppressedFaces:isolated.suppressedFaces});
const report={source:path.resolve(source),sourceSha256:crypto.createHash('sha256').update(sourceText).digest('hex'),
  sourceVertices:nv,sourceFaces:nf,faceSizes,records,semantics:'display benchmark, not geometry certification'};
const output=process.argv[3];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
