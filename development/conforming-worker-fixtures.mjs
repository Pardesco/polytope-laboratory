/** Headless representative native fixture builder; not part of production. */
import fs from 'node:fs';
import {buildFaceSurfaces} from '../ui/face-fill.mjs';
import {cellFaceInstances} from '../ui/entity-presentation.mjs';
import {prepareEntityDisplayBuffers} from '../ui/viewer-explosion.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/stereographic-native-manifest.json',import.meta.url),'utf8'));
export function conformingNativeFixture(key,{shrink=1,scope='face',cellCount=16,explosionAmount=null}={}){
  const entry=manifest.find(x=>x.key===key);if(!entry)throw Error('Unknown native fixture.');
  const model=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/'+entry.file,import.meta.url),'utf8')),center=[0,0,0,0];model.vertices.forEach(p=>p.forEach((x,k)=>center[k]+=x/model.vertices.length));
  const radius=Math.max(...model.vertices.map(p=>Math.hypot(...p.map((x,k)=>x-center[k])))),normalization={center,radius},fill=buildFaceSurfaces(model),safeFace=fill.triangles.find(t=>t.vertices.every(v=>model.vertices[v][3]<0)).face;
  const faceIds=scope==='face'?[safeFace]:undefined;
  if(explosionAmount!==null){
    const cells=model.cells.flatMap((c,i)=>c.includes(safeFace)?[i]:[]),geometry={sourceFingerprint:model.fingerprint,normalization,entities:cells.map((id,ordinal)=>{
      const sourceFaceIds=model.cells[id],sourceCycles=sourceFaceIds.map(f=>model.faces[f]),sourceVertexIds=[...new Set(sourceCycles.flat())].sort((a,b)=>a-b),local=new Map(sourceVertexIds.map((v,i)=>[v,i])),translation=[explosionAmount*(ordinal+1),0,0,0];
      return {id,kind:'cell',sourceFaceIds,sourceCycles,sourceVertexIds,faces:sourceCycles.map(c=>c.map(v=>local.get(v))),translation,points:sourceVertexIds.map(v=>model.vertices[v].map((x,k)=>x+translation[k]))};
    })};
    const display=prepareEntityDisplayBuffers(model,geometry),centers=new Map();
    if(shrink<1)display.entities.forEach(entity=>{const points=entity.vertices.map(v=>display.normalized[v]),c=[0,0,0,0];points.forEach(p=>p.forEach((x,k)=>c[k]+=x/points.length));centers.set(entity.cell,c);});
    const actualTriangles=display.triangles.filter(t=>!faceIds||faceIds.includes(t.face)).map(t=>{const c=centers.get(t.cell);if(!c)return t;const out={...t,normalized:t.normalized.map(p=>p.map((x,k)=>c[k]+shrink*(x-c[k])))};delete out.vertices;return out;});
    return {model,recipe:{mode:'entity',sourceFingerprint:model.fingerprint,normalization,shrink,geometry,...(faceIds?{faceIds}:{})},actualTriangles,snapshotKey:`${key}-${scope}-${shrink}-explosion-${explosionAmount}`};
  }
  const activeCellIds=scope==='first-cells'?model.cells.slice(0,cellCount).map((_,i)=>i):model.cells.map((_,i)=>i),selected=faceIds?buildFaceSurfaces(model,'nonzero',{faceIds}):fill,instances=cellFaceInstances(model,selected.triangles,activeCellIds,shrink);
  return {model,recipe:{mode:'cell-shrink',sourceFingerprint:model.fingerprint,normalization,shrink,activeCellIds,...(faceIds?{faceIds}:{})},actualTriangles:instances.triangles.map(t=>({...t,normalized:t.points.map(p=>p.map((x,k)=>(x-center[k])/radius))})),snapshotKey:`${key}-${scope}-${shrink}`};
}
