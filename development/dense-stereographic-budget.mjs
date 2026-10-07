/** DEVELOPMENT ONLY: budget-selected shared-edge closure with explicit holes.
 * Copied unchanged math from frozen production; only round proposal scheduling differs.
 * No whole-component discard, source mutation, coordinate welding or exact cut.
 */
import {stereographicPoint} from '../ui/stereographic.mjs';
import {sphericalSpanNormal,stereographicPatchNormals} from '../ui/stereographic-normals.mjs';
import {poleConeMaximumW} from '../ui/stereographic-conforming-pole.mjs';
import {conformingTriangleSampledQuality,conformingSourceOriginRefused} from '../ui/stereographic-conforming-quality.mjs';

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
      if(old)return old;const entry={key,raw:p.slice(),uid:samples.size};samples.set(key,entry);return entry;
    });
    if(new Set(v.map(p=>p.key)).size!==3)throw Error('Distinct source corner identities required.');
    const raw=v.map(p=>p.raw),span=conformingSourceOriginRefused(raw)?null:sphericalSpanNormal(raw),poleImpossible=v.every(p=>p.raw[3]<=0)||(span&&Math.sqrt(Math.max(0,1-span[3]*span[3]))<1-o.poleEpsilon-o.margin);
    return {id:t.id,face:t.face,cell:t.cell??-1,topology:t.topology,instance,v,span,poleImpossible};
  });
  if(samples.size>o.maxCachedPoints)throw Error('Initial complete source sample cache exceeds cap.');
  return {samples,sources};
}

/** Already posed input. Complete means every requested parameter leaf retained. */
export function denseBudgetConformingPoleCut(input,value={}){return solveDenseBudget(input,value,false);}
/** Frozen first experiment's admission policy retained as a comparison oracle.
 * Its full adjacency rebuild function below is unchanged. Math is also checked
 * by independent parameter/normal/quality witnesses and frozen production.
 */
export function denseBudgetReferencePoleCut(input,value={}){return solveDenseBudget(input,value,true);}
/** No rich leaf records are produced. The sink receives validated local
 * points/normals; a thrown cancellation/error aborts the whole unpublished job.
 */
export function emitDenseBudgetConformingPoleCut(input,value,sink){
  if(!sink||typeof sink.retained!=='function'||sink.check!==undefined&&typeof sink.check!=='function')throw Error('A bounded retained-leaf sink is required.');
  return solveDenseBudget(input,value,false,sink);
}
function solveDenseBudget(input,value,useReference,sink=null){
  const o=settings(value),{samples,sources}=snapshot(input,o),mids=new Map();
  let mesh=sources.map(source=>({source,v:source.v,bary:[[1,0,0],[0,1,0],[0,0,1]],depth:0,path:'',status:null}));
  let visits=0,rounds=0,nextMid=0,stopReason=null,red=0,greenOne=0,greenTwo=0,schedulingVisits=0;
  const scheduler={incidence:null,fastRounds:0,indexBuilds:0,indexUpdates:0};
  const edgeKey=useReference?(a,b)=>pair(a.key,b.key):numericEdge;
  const roundsEvidence=[];
  function classify(leaf){
    if(sink&&visits%256===0)sink.check?.();
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
    return leaf.status={kind:'retained',points,normals,refine:false};
  }
  function mid(a,b){
    const key=edgeKey(a,b);if(mids.has(key))return mids.get(key);
    const [x,y]=a.key<b.key?[a,b]:[b,a],p={key:`selective-pole-mid:${nextMid++}`,raw:midpoint(x.raw,y.raw),uid:samples.size};mids.set(key,p);samples.set(p.key,p);return p;
  }
  while(true){
    sink?.check?.();
    const marked=new Map();let checked=0,retained=0,clipped=0,unknown=0;
    for(const leaf of mesh){
      const status=classify(leaf);checked+=Number(Boolean(leaf.status));retained+=Number(status.kind==='retained');clipped+=Number(status.kind==='clipped');unknown+=Number(status.kind==='unresolved');
      if(status.refine)for(let j=0;j<3;j++)marked.set(edgeKey(leaf.v[j],leaf.v[(j+1)%3]),[leaf.v[j],leaf.v[(j+1)%3]]);
    }
    roundsEvidence.push({round:rounds,meshLeaves:mesh.length,classifiedLeaves:checked,retainedLeaves:retained,clippedLeaves:clipped,unresolvedLeaves:unknown,visits});
    if(visits>=o.maxVisits&&checked<mesh.length){stopReason='visit-budget: unchecked leaves remain explicit holes';break;}
    if(!marked.size)break;
    if(rounds>=o.maxRounds){stopReason='closure-round-budget';break;}
    // Admit complete edge-closure proposals; never independently split a side.
    // Coarsest requested leaves first, then native owner order: deterministic
    // geometric scheduling, not source-prefix truncation. Rejected proposals
    // remain explicit holes, while unrelated admissible closure can proceed.
    const choose=useReference?selectClosureBudgetReference:selectClosureIncremental;
    const choice=choose(mesh,marked,mids,{...o,visits,cachedPoints:samples.size,schedulingRemaining:o.maxVisits*8-schedulingVisits},scheduler);
    schedulingVisits+=choice.evidence.work;
    roundsEvidence.at(-1).selection=choice.evidence;
    if(choice.marked!==marked){marked.clear();for(const [key,value] of choice.marked)marked.set(key,value);}
    if(!marked.size){stopReason='no-admissible-shared-closure: '+choice.evidence.blockedReasons.join(',');break;}
    // A saturated next mesh admits no further positive-cost split. Its index
    // cannot be used again, so release it rather than updating dead bookkeeping.
    if(!useReference&&choice.evidence.predictedLeaves>=o.maxTriangles)scheduler.incidence=null;
    // All closure dependencies have passed preflight: replace atomically.
    const next=[];
    for(const leaf of mesh){
      const flags=leaf.v.map((v,j)=>marked.has(edgeKey(v,leaf.v[(j+1)%3]))),n=flags.filter(Boolean).length;
      if(!n){next.push(leaf);continue;}
      const firstChild=next.length;
      const offset=n===1?flags.indexOf(true):n===2?(flags.indexOf(false)+1)%3:0,
        [a,b,c]=[0,1,2].map(j=>leaf.v[(j+offset)%3]),[ba,bb,bc]=[0,1,2].map(j=>leaf.bary[(j+offset)%3]),ab=mid(a,b),bab=midpoint(ba,bb);
      const child=(v,bary,j)=>({source:leaf.source,v,bary,depth:leaf.depth+1,path:leaf.path+j,status:null});
      if(n===1){next.push(child([a,ab,c],[ba,bab,bc],0),child([ab,b,c],[bab,bb,bc],1));greenOne++;}
      else{
        const bcv=mid(b,c),bbc=midpoint(bb,bc);
        if(n===2){next.push(child([a,ab,c],[ba,bab,bc],0),child([ab,b,bcv],[bab,bb,bbc],1),child([ab,bcv,c],[bab,bbc,bc],2));greenTwo++;}
        else{const ca=mid(c,a),bca=midpoint(bc,ba);next.push(child([a,ab,ca],[ba,bab,bca],0),child([ab,b,bcv],[bab,bb,bbc],1),child([ca,bcv,c],[bca,bbc,bc],2),child([ab,bcv,ca],[bab,bbc,bca],3));red++;}
      }
      if(!useReference&&scheduler.incidence){
        changeIncidence(scheduler.incidence,leaf,false);
        for(let i=firstChild;i<next.length;i++)changeIncidence(scheduler.incidence,next[i],true);
        scheduler.indexUpdates+=1+next.length-firstChild;
      }
    }
    mesh=next;rounds++;
  }
  const triangles=[],holes=[],coverage=sources.map(s=>({instance:s.instance,sourceTriangle:s.id,sourceFace:s.face,sourceCell:s.cell,retained:0,clipped:0,unresolved:0,reasons:new Set()}));
  let retainedCount=0,clippedLeafCount=0,unresolvedLeafCount=0,emitted=0;
  // Classification here never spends more visits than the original budget.
  for(const leaf of mesh){
    if(sink&&emitted++%256===0)sink.check?.();
    const status=classify(leaf),source=leaf.source,weights=sink?leaf.bary:leaf.bary.map(p=>p.slice()),a=area(weights),row=coverage[source.instance];
    if(!(a>0))throw Error('Internal positive parameter-area invariant failed.');
    row[status.kind]+=a;if(status.reason)row.reasons.add(status.reason);
    if(status.kind==='retained')retainedCount++;else if(status.kind==='clipped')clippedLeafCount++;else unresolvedLeafCount++;
    if(sink){if(status.kind==='retained')sink.retained(source,status.points,status.normals);continue;}
    const record={raw:leaf.v.map(v=>v.raw.slice()),barycentric:weights,vertexKeys:leaf.v.map(v=>v.key),sourceTriangle:source.id,sourceFace:source.face,sourceCell:source.cell,instance:source.instance,topology:source.topology,depth:leaf.depth,path:leaf.path};
    if(status.kind==='retained')triangles.push({...record,points:status.points.map(p=>p.slice()),normals:status.normals.map(p=>p.slice())});
    else holes.push({...record,reason:status.reason,clipped:status.kind==='clipped'});
  }
  const diagnostics=coverage.filter(c=>c.reasons.size).map(c=>({instance:c.instance,sourceTriangle:c.sourceTriangle,reasons:[...c.reasons]}));
  coverage.forEach(c=>{if(c.retained+c.clipped+c.unresolved!==1)throw Error('Internal full parameter-domain partition failed.');delete c.reasons;});
  sink?.check?.();
  const result={...(sink?{materialized:false}:{triangles,holes}),coverage,diagnostics,stopReason,complete:coverage.every(c=>c.retained===1),captureAllowed:coverage.every(c=>c.retained===1),roundsEvidence,
    counts:{inputTriangles:sources.length,meshLeaves:mesh.length,retained:retainedCount,clippedLeaves:clippedLeafCount,unresolvedLeaves:unresolvedLeafCount,visits,cachedPoints:samples.size,rounds,redSplits:red,greenOneSplits:greenOne,greenTwoSplits:greenTwo,schedulingVisits,schedulingFastRounds:scheduler.fastRounds,incidenceBuilds:scheduler.indexBuilds,incidenceUpdatedLeaves:scheduler.indexUpdates},
    criterion:'adaptive sampled world-error; no whole-primitive certificate',clipping:'shared dyadic last-conforming-mesh holes; no exact analytic cut',settings:o};
  QUALIFIED.add(result);return result;
}
export function assertDenseBudgetCapture(result){if(!QUALIFIED.has(result)||result.complete!==true||result.captureAllowed!==true||result.coverage.some(c=>c.retained!==1))throw Error('Selective pole capture refused: clipped/unresolved source area or unqualified result.');}

/** Internal development scheduler: input is a fully classified conforming mesh.
 * It can select fewer proposals; it never changes a leaf's quality/clipping.
 * Extra indexed-edge/adjacency work has an explicit cumulative8*maxVisits cap.
 */
function selectClosureBudgetReference(mesh,allMarked,mids,o){
  const incidence=new Map(),counts=new Uint8Array(mesh.length),marked=new Map();
  let work=0;
  if(mesh.length*4>o.schedulingRemaining)return {marked,evidence:{requested:0,accepted:0,blocked:0,predictedLeaves:mesh.length,newChecks:0,newSamples:0,blockedReasons:['scheduling-work-budget'],work}};
  work+=mesh.length*4;
  mesh.forEach((leaf,index)=>{for(let j=0;j<3;j++){
    const key=pair(leaf.v[j].key,leaf.v[(j+1)%3].key);
    if(!incidence.has(key))incidence.set(key,[]);incidence.get(key).push(index);
  }});
  let predictedLeaves=mesh.length,newChecks=0,newSamples=0,accepted=0,blocked=0;
  const reasons=new Set(),requests=mesh.map((leaf,index)=>({leaf,index})).filter(x=>x.leaf.status?.refine)
    .sort((a,b)=>a.leaf.depth-b.leaf.depth||a.leaf.source.instance-b.leaf.source.instance||(a.leaf.path<b.leaf.path?-1:a.leaf.path>b.leaf.path?1:0));
  for(const {leaf} of requests){
    if(work+3>o.schedulingRemaining){reasons.add('scheduling-work-budget');break;}work+=3;
    const additions=[];for(let j=0;j<3;j++){
      const key=pair(leaf.v[j].key,leaf.v[(j+1)%3].key);if(!marked.has(key))additions.push(key);
    }
    if(!additions.length)continue;
    const adjacencyWork=additions.reduce((sum,key)=>sum+incidence.get(key).length,0)*2;
    if(work+adjacencyWork>o.schedulingRemaining){reasons.add('scheduling-work-budget');break;}work+=adjacencyWork;
    const deltas=new Map();let extraSamples=0;
    for(const key of additions){if(!mids.has(key))extraSamples++;for(const index of incidence.get(key))deltas.set(index,(deltas.get(index)??0)+1);}
    let extraLeaves=0,extraChecks=0,reason=null;
    for(const [index,delta] of deltas){
      if(mesh[index].depth>=o.maxDepth){reason='depth-budget';break;}
      const before=counts[index],after=before+delta;
      extraLeaves+=delta;extraChecks+=(1+after)-(before?1+before:0);
    }
    if(!reason&&predictedLeaves+extraLeaves>o.maxTriangles)reason='mesh-budget';
    if(!reason&&o.visits+newChecks+extraChecks>o.maxVisits)reason='visit-budget';
    if(!reason&&o.cachedPoints+newSamples+extraSamples>o.maxCachedPoints)reason='sample-budget';
    if(reason){blocked++;reasons.add(reason);continue;}
    for(const key of additions)marked.set(key,allMarked.get(key));
    for(const [index,delta] of deltas)counts[index]+=delta;
    predictedLeaves+=extraLeaves;newChecks+=extraChecks;newSamples+=extraSamples;accepted++;
  }
  return {marked,evidence:{requested:requests.length,accepted,blocked,predictedLeaves,newChecks,newSamples,blockedReasons:[...reasons],work}};
}

// At most500,000 registered samples. The product stays below2^53 and is
// injective for unordered distinct pairs; external literal keys are unchanged.
const numericEdge=(a,b)=>a.uid<b.uid?a.uid*(HARD.maxCachedPoints+1)+b.uid:b.uid*(HARD.maxCachedPoints+1)+a.uid;
const leafEdges=leaf=>leaf.edgeKeys??(leaf.edgeKeys=leaf.v.map((v,j)=>numericEdge(v,leaf.v[(j+1)%3])));
function changeIncidence(index,leaf,add){
  const keys=leafEdges(leaf);if(add)leaf.incidenceSlots=[0,0,0];
  for(let side=0;side<3;side++){
    const key=keys[side];
    if(add){if(!index.has(key))index.set(key,[]);const row=index.get(key);leaf.incidenceSlots[side]=row.length;row.push(leaf,side);}
    else {
      const row=index.get(key),slot=leaf.incidenceSlots[side];
      if(!row||row[slot]!==leaf||row[slot+1]!==side)throw Error('Incremental closure index lost an existing leaf.');
      const last=row.length-2;
      if(slot!==last){const moved=row[last],movedSide=row[last+1];row[slot]=moved;row[slot+1]=movedSide;moved.incidenceSlots[movedSide]=slot;}
      row.length=last;if(!row.length)index.delete(key);
    }
  }
}

/** Full-round fast path, then lazy persistent incidence only for saturation.
 * Preflight reserves all index maintenance before the atomic mesh replacement.
 * Accounting includes3-edge scans, adjacency, and reserved replacement updates;
 * sorting remains bounded by the explicit mesh/request count rather than being
 * advertised as zero-cost. No source coordinates, quality or caps change.
 */
function selectClosureIncremental(mesh,allMarked,mids,o,state){
  let work=0;
  const empty=(reason)=>({marked:new Map(),evidence:{strategy:'bounded-stop',requested:0,accepted:0,blocked:0,predictedLeaves:mesh.length,newChecks:0,newSamples:0,blockedReasons:[reason],work}});
  if(mesh.length>=o.maxTriangles)return empty('mesh-budget');
  if(mesh.length*3+allMarked.size>o.schedulingRemaining)return empty('scheduling-work-budget');
  let total=mesh.length,checks=0,samples=0,maintenance=0,fullReason=null;
  for(const leaf of mesh){
    let n=0;for(const key of leafEdges(leaf)){work++;if(allMarked.has(key))n++;}
    if(!n)continue;
    if(leaf.depth>=o.maxDepth)fullReason='depth-budget';
    total+=n;checks+=1+n;if(state.incidence)maintenance+=(2+n)*3;
  }
  for(const key of allMarked.keys()){work++;if(!mids.has(key))samples++;}
  if(!fullReason&&total>o.maxTriangles)fullReason='mesh-budget';
  if(!fullReason&&o.visits+checks>o.maxVisits)fullReason='visit-budget';
  if(!fullReason&&o.cachedPoints+samples>o.maxCachedPoints)fullReason='sample-budget';
  if(!fullReason&&work+maintenance<=o.schedulingRemaining){
    state.fastRounds++;work+=maintenance;
    return {marked:allMarked,evidence:{strategy:'whole-round-fast-path',requested:null,accepted:null,blocked:0,predictedLeaves:total,newChecks:checks,newSamples:samples,blockedReasons:[],work}};
  }
  // Initial index is built once. Replaced parents are then removed and children
  // inserted; unchanged retained leaves never have their adjacency rebuilt.
  if(!state.incidence){
    if(work+mesh.length*3>o.schedulingRemaining)return empty('scheduling-work-budget');
    state.incidence=new Map();for(const leaf of mesh)changeIncidence(state.incidence,leaf,true);
    work+=mesh.length*3;state.indexBuilds++;
  }
  const incidence=state.incidence,marked=new Map(),counts=new Map();
  let predictedLeaves=mesh.length,newChecks=0,newSamples=0,accepted=0,blocked=0,reservedUpdates=0;
  const requests=mesh.filter(leaf=>leaf.status?.refine).sort((a,b)=>a.depth-b.depth||a.source.instance-b.source.instance||(a.path<b.path?-1:a.path>b.path?1:0)),reasons=new Set();
  for(const leaf of requests){
    if(work+reservedUpdates+3>o.schedulingRemaining){reasons.add('scheduling-work-budget');break;}work+=3;
    const additions=leafEdges(leaf).filter(key=>!marked.has(key));if(!additions.length)continue;
    const adjacencyWork=additions.reduce((sum,key)=>sum+incidence.get(key).length,0);
    if(work+reservedUpdates+adjacencyWork>o.schedulingRemaining){reasons.add('scheduling-work-budget');break;}work+=adjacencyWork;
    const deltas=new Map();let extraSamples=0;
    for(const key of additions){if(!mids.has(key))extraSamples++;const row=incidence.get(key);for(let i=0;i<row.length;i+=2){const neighbor=row[i];deltas.set(neighbor,(deltas.get(neighbor)??0)+1);}}
    let extraLeaves=0,extraChecks=0,extraUpdates=0,reason=null;
    for(const [neighbor,delta] of deltas){
      if(neighbor.depth>=o.maxDepth){reason='depth-budget';break;}
      const before=counts.get(neighbor)??0,after=before+delta;
      extraLeaves+=delta;extraChecks+=(1+after)-(before?1+before:0);
      extraUpdates+=(before?delta:2+delta)*3;
    }
    if(!reason&&predictedLeaves+extraLeaves>o.maxTriangles)reason='mesh-budget';
    if(!reason&&o.visits+newChecks+extraChecks>o.maxVisits)reason='visit-budget';
    if(!reason&&o.cachedPoints+newSamples+extraSamples>o.maxCachedPoints)reason='sample-budget';
    if(!reason&&work+reservedUpdates+extraUpdates>o.schedulingRemaining)reason='scheduling-work-budget';
    if(reason){blocked++;reasons.add(reason);continue;}
    for(const key of additions)marked.set(key,allMarked.get(key));
    for(const [neighbor,delta] of deltas)counts.set(neighbor,(counts.get(neighbor)??0)+delta);
    predictedLeaves+=extraLeaves;newChecks+=extraChecks;newSamples+=extraSamples;reservedUpdates+=extraUpdates;accepted++;
  }
  if(predictedLeaves<o.maxTriangles)work+=reservedUpdates;
  return {marked,evidence:{strategy:'incremental-selective',requested:requests.length,accepted,blocked,predictedLeaves,newChecks,newSamples,blockedReasons:[...reasons],work}};
}
