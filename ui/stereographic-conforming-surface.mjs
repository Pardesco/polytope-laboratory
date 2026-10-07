/** Production shared-edge closure with last-conforming-mesh holes.
 * No whole-component discard, source mutation, coordinate welding or exact cut.
 */
import {stereographicPoint} from './stereographic.mjs';
import {sphericalSpanNormal,stereographicPatchNormals,stereographicPatchCornerOrder} from './stereographic-normals.mjs';
import {poleConeMaximumW} from './stereographic-conforming-pole.mjs';
import {conformingTriangleSampledQuality,conformingSourceOriginRefused} from './stereographic-conforming-quality.mjs';

const DEFAULT={tolerance:.004,poleEpsilon:.02,margin:1e-9,maxDepth:6,maxTriangles:16384,maxVisits:250000,maxCachedPoints:100000,maxInputTriangles:8192,maxRounds:32};
const HARD={maxDepth:8,maxTriangles:100000,maxVisits:1000000,maxCachedPoints:500000,maxInputTriangles:8192,maxRounds:64};
const QUALIFIED=new WeakSet(),data=o=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(o)).every(d=>'value' in d);
const dense=a=>Array.isArray(a)&&Object.keys(a).length===a.length&&Array.from({length:a.length},(_,i)=>Object.getOwnPropertyDescriptor(a,String(i))).every(d=>d&&'value' in d);
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const pair=(a,b)=>JSON.stringify(a<b?[a,b]:[b,a]),midpoint=(a,b)=>a.map((x,i)=>(x+b[i])/2);
const area=b=>(b[1][1]-b[0][1])*(b[2][2]-b[0][2])-(b[1][2]-b[0][2])*(b[2][1]-b[0][1]);
function settings(value){
  if(!data(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULT,k)))throw Error('Unknown selective-pole option.');
  const o={...DEFAULT,...value};for(const k of Object.keys(HARD))if(!int(o[k],k==='maxDepth'?0:1,HARD[k]))throw Error(`Invalid ${k} bound.`);
  if(!Number.isFinite(o.tolerance)||o.tolerance<=0||o.tolerance>.1||!Number.isFinite(o.poleEpsilon)||o.poleEpsilon<=0||o.poleEpsilon>=1||!Number.isFinite(o.margin)||o.margin<1e-12||o.margin>1e-5)throw Error('Invalid sampled quality or numerical pole margin.');
  return o;
}
function snapshot(input,o){
  if(!dense(input)||input.length>o.maxInputTriangles)throw Error('Source triangle input bound exceeded or non-data input.');
  if(input.length>o.maxTriangles)throw Error('Initial complete source mesh exceeds mesh cap; no truncation permitted.');
  const samples=new Map(),sources=input.map((t,instance)=>{
    if(!data(t)||!int(t.id,0,0xffffffff)||!int(t.face,0,0xffffffff)||!int(t.cell??-1,-1,0x7fffffff)||typeof t.topology!=='string'||!t.topology.length||t.topology.length>128||!dense(t.vertexIds)||t.vertexIds.length!==3||!dense(t.points)||t.points.length!==3)throw Error('Explicit native owner/corner topology required.');
    const v=t.vertexIds.map((id,i)=>{
      if(!(int(id,0,0xffffffff)||(typeof id==='string'&&id.length&&id.length<=128)))throw Error('Invalid corner identity.');
      const p=t.points[i];if(!dense(p)||p.length!==4||p.some(x=>!Number.isFinite(x)||Math.abs(x)>1e9))throw Error('Finite bounded 4D points required.');
      const key=JSON.stringify([t.topology,typeof id,id]),old=samples.get(key);
      if(old&&!old.raw.every((x,j)=>Object.is(x,p[j])))throw Error('Shared identity has inconsistent posed coordinates.');
      if(old)return old;const entry={key,raw:p.slice()};samples.set(key,entry);return entry;
    });
    if(new Set(v.map(p=>p.key)).size!==3)throw Error('Distinct source corner identities required.');
    const raw=v.map(p=>p.raw),span=conformingSourceOriginRefused(raw)?null:sphericalSpanNormal(raw),poleImpossible=v.every(p=>p.raw[3]<=0)||(span&&Math.sqrt(Math.max(0,1-span[3]*span[3]))<1-o.poleEpsilon-o.margin);
    return {id:t.id,face:t.face,cell:t.cell??-1,topology:t.topology,instance,v,span,poleImpossible};
  });
  if(samples.size>o.maxCachedPoints)throw Error('Initial complete source sample cache exceeds cap.');
  return {samples,sources};
}

/** Already posed input. Complete means every requested parameter leaf retained. */
export function selectiveConformingPoleCut(input,value={}){
  const o=settings(value),{samples,sources}=snapshot(input,o),mids=new Map();
  let mesh=sources.map(source=>({source,v:source.v,bary:[[1,0,0],[0,1,0],[0,0,1]],depth:0,path:'',status:null}));
  let visits=0,rounds=0,nextMid=0,stopReason=null,red=0,greenOne=0,greenTwo=0;
  const roundsEvidence=[];
  function classify(leaf){
    if(leaf.status)return leaf.status;
    if(visits>=o.maxVisits)return {kind:'unresolved',reason:'visit-budget-unchecked',refine:false};
    visits++;
    if(!leaf.source.span)return leaf.status={kind:'unresolved',reason:'source-origin-or-rank',refine:false};
    const raw=leaf.v.map(v=>v.raw),cutoff=1-o.poleEpsilon;
    if(!leaf.source.poleImpossible){
      if(raw.every(p=>p[3]>o.margin*Math.hypot(...p)&&p[3]-cutoff*Math.hypot(...p)>o.margin*Math.hypot(...p)))return leaf.status={kind:'clipped',reason:'inside-pole-cap',refine:false};
      const cone=poleConeMaximumW(raw);
      if(cone.uncertain||cone.maximum>=cutoff-o.margin)return leaf.status={kind:'unresolved',reason:'pole-boundary-or-numerical-uncertainty',refine:true};
    }
    // Initial full-rank source rays exclude the source origin; every positive
    // parameter-area child retains that rank. The cone guard excludes the pole.
    // Reuse exact projected shared corners and the unchanged sampled criterion,
    // avoiding redundant per-leaf origin/Gram/pole solves and point validation.
    const projected=leaf.v.map(v=>v.projected??(v.projected=stereographicPoint(v.raw,o))),check=conformingTriangleSampledQuality(raw,o,projected);
    if(check.clipped)return leaf.status={kind:'unresolved',reason:'original-guard-refusal',refine:true};
    if(check.error>o.tolerance)return leaf.status={kind:'unresolved',reason:'sampled-quality-unresolved',refine:true};
    const points=check.points,normals=stereographicPatchNormals(points,leaf.source.span);
    if(!normals)return leaf.status={kind:'unresolved',reason:'undefined-analytic-normal',refine:false};
    const renderCornerOrder=stereographicPatchCornerOrder(points,normals);
    if(!renderCornerOrder)return leaf.status={kind:'unresolved',reason:'degenerate-projected-chord',refine:true};
    return leaf.status={kind:'retained',points,normals,renderCornerOrder,refine:false};
  }
  function mid(a,b){
    const key=pair(a.key,b.key);if(mids.has(key))return mids.get(key);
    const [x,y]=a.key<b.key?[a,b]:[b,a],p={key:`selective-pole-mid:${nextMid++}`,raw:midpoint(x.raw,y.raw)};mids.set(key,p);samples.set(p.key,p);return p;
  }
  while(true){
    const marked=new Map();let checked=0,retained=0,clipped=0,unknown=0;
    for(const leaf of mesh){
      const status=classify(leaf);checked+=Number(Boolean(leaf.status));retained+=Number(status.kind==='retained');clipped+=Number(status.kind==='clipped');unknown+=Number(status.kind==='unresolved');
      if(status.refine)for(let j=0;j<3;j++)marked.set(pair(leaf.v[j].key,leaf.v[(j+1)%3].key),[leaf.v[j],leaf.v[(j+1)%3]]);
    }
    roundsEvidence.push({round:rounds,meshLeaves:mesh.length,classifiedLeaves:checked,retainedLeaves:retained,clippedLeaves:clipped,unresolvedLeaves:unknown,visits});
    if(visits>=o.maxVisits&&checked<mesh.length){stopReason='visit-budget: unchecked leaves remain explicit holes';break;}
    if(!marked.size)break;
    if(rounds>=o.maxRounds){stopReason='closure-round-budget';break;}
    let count=0,newChecks=0;
    for(const leaf of mesh){
      const n=leaf.v.reduce((sum,v,j)=>sum+Number(marked.has(pair(v.key,leaf.v[(j+1)%3].key))),0);
      if(n&&leaf.depth>=o.maxDepth){stopReason='shared-closure-depth-budget';break;}
      count+=n?1+n:1;if(n)newChecks+=1+n;
    }
    if(!stopReason&&count>o.maxTriangles)stopReason='shared-closure-mesh-budget';
    if(!stopReason&&visits+newChecks>o.maxVisits)stopReason='shared-closure-next-visit-budget';
    const newSamples=[...marked.keys()].reduce((sum,k)=>sum+Number(!mids.has(k)),0);
    if(!stopReason&&samples.size+newSamples>o.maxCachedPoints)stopReason='shared-closure-sample-budget';
    if(stopReason)break;
    // All closure dependencies have passed preflight: replace atomically.
    const next=[];
    for(const leaf of mesh){
      const flags=leaf.v.map((v,j)=>marked.has(pair(v.key,leaf.v[(j+1)%3].key))),n=flags.filter(Boolean).length;
      if(!n){next.push(leaf);continue;}
      const offset=n===1?flags.indexOf(true):n===2?(flags.indexOf(false)+1)%3:0,
        [a,b,c]=[0,1,2].map(j=>leaf.v[(j+offset)%3]),[ba,bb,bc]=[0,1,2].map(j=>leaf.bary[(j+offset)%3]),ab=mid(a,b),bab=midpoint(ba,bb);
      const child=(v,bary,j)=>({source:leaf.source,v,bary,depth:leaf.depth+1,path:leaf.path+j,status:null});
      if(n===1){next.push(child([a,ab,c],[ba,bab,bc],0),child([ab,b,c],[bab,bb,bc],1));greenOne++;}
      else{
        const bcv=mid(b,c),bbc=midpoint(bb,bc);
        if(n===2){next.push(child([a,ab,c],[ba,bab,bc],0),child([ab,b,bcv],[bab,bb,bbc],1),child([ab,bcv,c],[bab,bbc,bc],2));greenTwo++;}
        else{const ca=mid(c,a),bca=midpoint(bc,ba);next.push(child([a,ab,ca],[ba,bab,bca],0),child([ab,b,bcv],[bab,bb,bbc],1),child([ca,bcv,c],[bca,bbc,bc],2),child([ab,bcv,ca],[bab,bbc,bca],3));red++;}
      }
    }
    mesh=next;rounds++;
  }
  const triangles=[],holes=[],coverage=sources.map(s=>({instance:s.instance,sourceTriangle:s.id,sourceFace:s.face,sourceCell:s.cell,retained:0,clipped:0,unresolved:0,reasons:new Set()}));
  // Classification here never spends more visits than the original budget.
  for(const leaf of mesh){
    const status=classify(leaf),source=leaf.source,weights=leaf.bary.map(p=>p.slice()),a=area(weights),row=coverage[source.instance];
    if(!(a>0))throw Error('Internal positive parameter-area invariant failed.');
    row[status.kind]+=a;if(status.reason)row.reasons.add(status.reason);
    const record={raw:leaf.v.map(v=>v.raw.slice()),barycentric:weights,vertexKeys:leaf.v.map(v=>v.key),sourceTriangle:source.id,sourceFace:source.face,sourceCell:source.cell,instance:source.instance,topology:source.topology,depth:leaf.depth,path:leaf.path};
    if(status.kind==='retained')triangles.push({...record,points:status.renderCornerOrder.map(k=>status.points[k].slice()),normals:status.renderCornerOrder.map(k=>status.normals[k].slice()),renderCornerOrder:status.renderCornerOrder.slice()});
    else holes.push({...record,reason:status.reason,clipped:status.kind==='clipped'});
  }
  const diagnostics=coverage.filter(c=>c.reasons.size).map(c=>({instance:c.instance,sourceTriangle:c.sourceTriangle,reasons:[...c.reasons]}));
  coverage.forEach(c=>{if(c.retained+c.clipped+c.unresolved!==1)throw Error('Internal full parameter-domain partition failed.');delete c.reasons;});
  const result={triangles,holes,coverage,diagnostics,stopReason,complete:coverage.every(c=>c.retained===1),captureAllowed:coverage.every(c=>c.retained===1),roundsEvidence,
    counts:{inputTriangles:sources.length,meshLeaves:mesh.length,retained:triangles.length,clippedLeaves:holes.filter(h=>h.clipped).length,unresolvedLeaves:holes.filter(h=>!h.clipped).length,visits,cachedPoints:samples.size,rounds,redSplits:red,greenOneSplits:greenOne,greenTwoSplits:greenTwo},
    criterion:'adaptive sampled world-error; no whole-primitive certificate',clipping:'shared dyadic last-conforming-mesh holes; no exact analytic cut',settings:o};
  QUALIFIED.add(result);return result;
}
export function assertSelectivePoleCapture(result){if(!QUALIFIED.has(result)||result.complete!==true||result.captureAllowed!==true||result.coverage.some(c=>c.retained!==1))throw Error('Selective pole capture refused: clipped/unresolved source area or unqualified result.');}
