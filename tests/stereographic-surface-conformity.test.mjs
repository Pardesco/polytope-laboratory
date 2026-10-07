/** Numerical curved-surface seam regression; no browser or Electron launch.
 * Original17 fails these conformity assertions. Leaf edges, not merely shared
 * vertex sets, are paired independently through inverse stereographic S^2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from '../ui/stereographic-worker-geometry.mjs';
import {rotate} from '../ui/projection.js';

const QUAD=[[-1,-1,.4,-.3],[1,-1,.4,-.3],[1,1,.4,-.3],[-1,1,.4,-.3]];
const ANGLES=[21,9,33,15,39,6],OPTIONS={tolerance:.004,maxDepth:8};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=p=>Math.hypot(...p);
const quantize=x=>Math.round(x*1e6),pointKey=p=>p.map(quantize).join(',');
const edgeKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');
const inverse=p=>{const r2=dot(p,p);return [...p.map(x=>2*x/(1+r2)),(r2-1)/(r2+1)];};

/** Solve q=x*a+y*b in the original4D linear edge span, independently of the
 * implementation's raw midpoint subdivision and all its triangle metadata.
 * Positive x/y select the intended radial arc, not its antipodal continuation.
 */
function arcParameter(p,a,b,epsilon=2e-6){
  const q=inverse(p),aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),det=aa*bb-ab*ab;
  assert.ok(det>1e-12,'The independent raw edge-span predicate must resolve.');
  const qa=dot(q,a),qb=dot(q,b),x=(qa*bb-qb*ab)/det,y=(qb*aa-qa*ab)/det;
  if(norm(q.map((v,i)=>v-x*a[i]-y*b[i]))>epsilon||x< -epsilon||y< -epsilon||x+y<=0)return null;
  const t=y/(x+y);return t>=-epsilon&&t<=1+epsilon?Math.max(0,Math.min(1,t)):null;
}

function pair(raw,face=0,cell){
  const owner={face,...(cell!==undefined?{cell}:{})};
  return [{...owner,normalized:[raw[0],raw[1],raw[2]]},{...owner,normalized:[raw[0],raw[2],raw[3]]}];
}
const posed=quad=>quad.map(p=>rotate(p,ANGLES));
function unpack(result){
  const g=result.geometry;return Array.from({length:g.faceIds.length},(_,i)=>({
    face:g.faceIds[i],cell:g.cellIds[i]<0?undefined:g.cellIds[i],sourceTriangle:g.triangleInstanceIds[i],
    points:[0,1,2].map(k=>Array.from(g.triangles.subarray(i*9+k*3,i*9+k*3+3))),
    normals:[0,1,2].map(k=>Array.from(g.normals.subarray(i*9+k*3,i*9+k*3+3)))}));
}
function source(){
  const vertices=[...QUAD.map(p=>[...p]),...QUAD.map(p=>p.map((x,i)=>i===2?-.4:x)),...QUAD.map(p=>p.map((x,i)=>i===3?.5:x))];
  const faces=[[0,1,2,3]];
  for(const start of [4,8]){
    faces.push([start,start+3,start+2,start+1]);
    for(let i=0;i<4;i++)faces.push([i,start+i,start+(i+1)%4,(i+1)%4]);
  }
  const pairs=new Map();for(const f of faces)for(let i=0;i<f.length;i++){const edge=[f[i],f[(i+1)%f.length]].sort((a,b)=>a-b);pairs.set(edge.join(','),edge);}
  return {id:'literal-curved-face',fingerprint:'c'.repeat(64),dimension:4,embeddingDimension:4,
    interpretation:'generalized-complex',vertices,edges:[...pairs.values()],faces,cells:[[0,1,2,3,4,5],[0,6,7,8,9,10]]};
}
function worker(triangles,{virtual=false,expanded=false}={}){
  const model=source(),records=triangles.map(t=>({...t}));let normalized=QUAD;
  const extra={};
  if(expanded){
    normalized=[];for(let i=0;i<records.length;i+=2){const quad=[...records[i].normalized,records[i+1].normalized[2]],base=normalized.length;normalized.push(...quad);
      records[i].vertices=[base,base+1,base+2];records[i+1].vertices=[base,base+2,base+3];}
    extra.sourceVertexIds=normalized.map((_,i)=>i%4);extra.sourceVertexCells=normalized.map((_,i)=>Math.floor(i/4));
  }else for(let i=0;i<records.length;i++){
    if(virtual)records[i].sourceVertices=i%2===0?[0,1,2]:[0,2,3];
    else records[i].vertices=i%2===0?[0,1,2]:[0,2,3];
  }
  const input=prepareStereographicWorkerGeometry({model,normalized,edges:[],triangles:records,
    visibility:{vertices:Array(normalized.length).fill(true),edges:[],faces:Array(model.faces.length).fill(true)},angles:ANGLES,conformingSurfaces:true,...extra});
  return computeStereographicWorkerGeometry(input,OPTIONS);
}

function seamIntervals(triangles,sourceTriangle,raw){
  const a=raw[0],b=raw[2],out=[];
  for(const t of triangles.filter(t=>t.sourceTriangle===sourceTriangle))for(let i=0;i<3;i++){
    const x=arcParameter(t.points[i],a,b),y=arcParameter(t.points[(i+1)%3],a,b);
    if(x!==null&&y!==null&&Math.abs(x-y)>1e-7)out.push([Math.min(x,y),Math.max(x,y)]);
  }
  out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  assert.ok(out.length>1,'A curved diagonal must actually be subdivided.');
  assert.ok(Math.abs(out[0][0])<2e-6&&Math.abs(out.at(-1)[1]-1)<2e-6,'Each side must cover the whole source diagonal.');
  for(let i=1;i<out.length;i++)assert.ok(Math.abs(out[i-1][1]-out[i][0])<2e-6,'A side contains a gap, duplicate edge or overlapping interval.');
  return out;
}
function assertPairedDiagonal(triangles,quad,first=0,second=1){
  const raw=posed(quad),a=seamIntervals(triangles,first,raw),b=seamIntervals(triangles,second,raw);
  assert.equal(a.length,b.length,`Shared curved diagonal has ${a.length} versus ${b.length} leaf edges: coarse chord/fine break mismatch.`);
  a.forEach((e,i)=>e.forEach((t,j)=>assert.ok(Math.abs(t-b[i][j])<2e-6,'Shared diagonal leaf interval endpoints disagree.')));
  // Matching endpoint positions must also carry compatible analytic normals.
  const normals=new Map();
  for(const triangle of triangles.filter(t=>t.sourceTriangle===first||t.sourceTriangle===second))for(let i=0;i<3;i++){
    const p=triangle.points[i];if(arcParameter(p,raw[0],raw[2])===null)continue;
    const key=pointKey(p),normal=triangle.normals?.[i];assert.ok(normal&&norm(normal)>.99&&norm(normal)<1.01);
    if(normals.has(key))assert.ok(dot(normal,normals.get(key))>.999,'Shared seam has incompatible normals.');else normals.set(key,normal);
  }
}
function assertConformingInterior(triangles,quad,parent){
  const q=posed(quad),source=parent%2===0?[q[0],q[1],q[2]]:[q[0],q[2],q[3]],counts=new Map();
  for(const t of triangles.filter(t=>t.sourceTriangle===parent))for(let i=0;i<3;i++){
    const a=t.points[i],b=t.points[(i+1)%3];assert.ok(norm(a.map((x,k)=>x-b[k]))>1e-8,'Degenerate leaf edge introduced.');
    const boundary=source.some((p,j)=>arcParameter(a,p,source[(j+1)%3])!==null&&arcParameter(b,p,source[(j+1)%3])!==null);
    if(!boundary){const key=edgeKey(a,b);counts.set(key,(counts.get(key)||0)+1);}
  }
  assert.ok(counts.size>0,'The fixture must exercise adaptive triangle interiors.');
  const unmatched=[...counts].filter(([,count])=>count!==2);
  assert.equal(unmatched.length,0,`${unmatched.length} interior leaf edges are not paired; independent refinement introduces T-junctions.`);
}
function assertSurface(triangles,quad,first=0,second=1){
  assertPairedDiagonal(triangles,quad,first,second);
  assertConformingInterior(triangles,quad,first);assertConformingInterior(triangles,quad,second);
}

test('independent interval checker rejects an actual coarse curved chord against two finer breaks',()=>{
  // Hand-authored coarse/fine mismatch, independent of any tessellator. Do not
  // require a legacy implementation to remain cracked just to test the checker.
  const raw=posed(QUAD),project=p=>{const length=norm(p),q=p.map(x=>x/length);return q.slice(0,3).map(x=>x/(1-q[3]));};
  const mid=t=>project(raw[0].map((x,i)=>(1-t)*x+t*raw[2][i]));
  const [a,b,c,d]=raw.map(project),quarter=mid(.25),half=mid(.5);
  const tri=(sourceTriangle,points)=>({sourceTriangle,points});
  const sample=[tri(0,[a,b,half]),tri(0,[half,b,c]),
    tri(1,[a,quarter,d]),tri(1,[quarter,half,d]),tri(1,[half,c,d])];
  assert.throws(()=>assertPairedDiagonal(sample,QUAD),/coarse chord\/fine break/);
});

test('worker flattened curved surface remains conforming and retains exact original triangle owners',()=>{
  const source=pair(QUAD),before=JSON.stringify(source),result=worker(source),triangles=unpack(result);
  assert.equal(result.complete,true);assert.deepEqual(result.geometry.diagnostics,[]);
  assert.deepEqual([...new Set(result.geometry.triangleInstanceIds)],[0,1]);
  assert.ok(triangles.every(t=>t.face===0&&t.cell===undefined));
  assertSurface(triangles,QUAD);assert.equal(JSON.stringify(source),before);
});

for(const mode of ['shrink','explosion'])test(`${mode} instances conform individually without welding or reassigning distinct cell owners`,()=>{
  const quads=mode==='shrink'?[.6,-.6].map(w=>QUAD.map(p=>p.map((x,i)=>.8*x+.2*(i===3?w:0)))):
    [.25,-.25].map(dx=>QUAD.map(p=>p.map((x,i)=>x+(i===0?dx:0))));
  const source=[...pair(quads[0],0,0),...pair(quads[1],0,1)],before=JSON.stringify(source);
  const result=worker(source,{virtual:mode==='shrink',expanded:mode==='explosion'}),triangles=unpack(result);assert.equal(result.complete,true);
  for(let cell=0;cell<2;cell++){
    const first=cell*2;assertSurface(triangles,quads[cell],first,first+1);
    assert.ok(triangles.filter(t=>t.sourceTriangle===first||t.sourceTriangle===first+1).every(t=>t.face===0&&t.cell===cell));
    const raw=posed(quads[cell]);
    for(const t of triangles.filter(t=>t.cell===cell))for(const p of t.points){
      // The original face's linear3-subspace owns all radial surface points;
      // wrong global welding onto another translated instance violates it.
      const q=inverse(p),a=raw[0],u=raw[1],v=raw[2],det3=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
      const normal=[0,1,2,3].map(i=>(i%2?-1:1)*det3([a,u,v].map(r=>r.filter((_,j)=>j!==i))));
      assert.ok(Math.abs(dot(q,normal))/norm(normal)<2e-6,'A patch moved to another instance surface.');
    }
  }
  assert.equal(JSON.stringify(source),before);
});
