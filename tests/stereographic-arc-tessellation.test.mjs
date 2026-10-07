import test from 'node:test';
import assert from 'node:assert/strict';
import {tessellateStereographicArc,ARC_TESSELLATION_LIMITS} from '../ui/stereographic-arc-tessellation.mjs';
import {boundStereographicEndpoint} from '../ui/stereographic-endpoint-bound.mjs';

const X=[1,0,0,0],Y=[0,1,0,0],camera={projection:'orthographic',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,5]],scaleX:200,scaleY:200,near:.01,far:1000};
const point=(a,b,t)=>{const p=a.map((x,i)=>(1-t)*x+t*b[i]),r=Math.hypot(...p);return p.slice(0,3).map(x=>x/(r-p[3]));};
const screen=(p,c)=>{const q=c.worldToCamera.map(row=>row[3]+p.reduce((sum,x,i)=>sum+x*row[i],0)),d=c.projection==='perspective'?q[2]:1;return [c.scaleX*q[0]/d,c.scaleY*q[1]/d];};
function distance(p,a,b){const d=b.map((x,i)=>x-a[i]),n=d.reduce((s,x)=>s+x*x,0),t=n?Math.max(0,Math.min(1,d.reduce((s,x,i)=>s+x*(p[i]-a[i]),0)/n)):0;return Math.hypot(...p.map((x,i)=>x-a[i]-t*d[i]));}
function partition(result){
  const spans=[...result.omissions,...result.clippedIntervals];for(let i=0;i<result.segments;i++)spans.push({t0:result.parameterIntervals[2*i],t1:result.parameterIntervals[2*i+1]});
  spans.sort((a,b)=>a.t0-b.t0||a.t1-b.t1);let t=result.rawParameterInterval[0];for(const span of spans){assert.equal(span.t0,t);t=span.t1;}assert.equal(t,result.rawParameterInterval[1]);
}
function checkSegments(input,result){
  for(let i=0;i<result.segments;i++){
    const t0=result.parameterIntervals[2*i],t1=result.parameterIntervals[2*i+1],a=screen(Array.from(result.positions.slice(i*6,i*6+3)),input.camera),b=screen(Array.from(result.positions.slice(i*6+3,i*6+6)),input.camera);
    assert.ok(result.errorBoundsPixels[i]<=input.tolerancePixels);
    assert.ok(result.errorBoundsPixels[i]>=result.curveErrorBoundsPixels[i]+result.endpointErrorBoundsPixels[i]);
    for(let j=0;j<=40;j++){
      const t=t0+(t1-t0)*j/40,p=input.a.map((x,k)=>(1-t)*x+t*input.b[k]),delta=1-p[3]/Math.hypot(...p);
      assert.ok(delta>=(input.poleEpsilon??.02)-1e-14);
      assert.ok(distance(screen(point(input.a,input.b,t),input.camera),a,b)<=result.errorBoundsPixels[i]+1e-10);
    }
  }
}

test('quarter-circle deterministic whole-interval subdivision includes packed endpoint displacement',()=>{
  const input={a:X,b:Y,camera,tolerancePixels:.5,sourceEdgeId:7,sourceInstanceId:13},result=tessellateStereographicArc(input);
  assert.equal(result.complete,true);assert.ok(result.segments>1);assert.equal(result.sourceEdgeId,7);assert.equal(result.sourceInstanceId,13);assert.equal(result.positions.length,result.segments*6);
  assert.deepEqual(result,tessellateStereographicArc(input));checkSegments(input,result);partition(result);
  assert.equal(result.endpointQuantizationIncluded,true);assert.equal(result.gpuArithmeticIncluded,false);assert.equal(result.wholePatchBound,false);
  assert.ok(result.endpointEvaluations<=result.visits*2);
  assert.ok(result.endpointCachePeak<=result.endpointCacheLimit&&result.endpointCacheLimit<=4096);
  // Independent circular geometry: radius 200, endpoint polar angles from
  // the original (1-t,t) raw vector. This is separate from sampled checks.
  for(let i=0;i<result.segments;i++){
    const t0=result.parameterIntervals[2*i],t1=result.parameterIntervals[2*i+1],theta0=Math.atan2(t0,1-t0),theta1=Math.atan2(t1,1-t1);
    const sagitta=200*(1-Math.cos((theta1-theta0)/2));assert.ok(result.curveErrorBoundsPixels[i]>=sagitta);
  }
});

test('original raw fragments and unequal-radius paths retain exact parameter IDs',()=>{
  const input={a:[3,.1,.2,.1],b:[.1,.7,-.2,-.1],t0:.173,t1:.317,camera,tolerancePixels:1},result=tessellateStereographicArc(input);
  assert.equal(result.complete,true);assert.deepEqual(result.rawParameterInterval,[.173,.317]);checkSegments(input,result);partition(result);
  assert.equal(result.parameterIntervals[0],.173);assert.equal(result.parameterIntervals.at(-1),.317);
});

test('perspective positive-depth and oblique observer retain a qualified complete finite arc',()=>{
  const c={...camera,projection:'perspective',worldToCamera:[[.8,-.6,0,.2],[.6,.8,0,-.1],[0,0,-1,3]],scaleX:450,scaleY:350};
  const input={a:[1,0,.2,.1],b:[0,1,-.4,-.1],camera:c,tolerancePixels:1},result=tessellateStereographicArc(input);assert.equal(result.complete,true);checkSegments(input,result);partition(result);
});

test('observer CSS scale/zoom changes subdivision while retaining the explicit pixel criterion',()=>{
  const original=tessellateStereographicArc({a:X,b:Y,camera,tolerancePixels:.5});
  const enlarged={a:X,b:Y,camera:{...camera,scaleX:800,scaleY:800},tolerancePixels:.5},result=tessellateStereographicArc(enlarged);
  assert.equal(result.complete,true);assert.ok(result.segments>original.segments);checkSegments(enlarged,result);partition(result);
});

test('pole crossings separate clipped/unresolved raw intervals and never connect across the omitted region',()=>{
  const input={a:[.5,0,0,.75],b:[-.5,0,0,.75],camera,tolerancePixels:2,maxDepth:12,maxVisits:8191},result=tessellateStereographicArc(input);
  assert.ok(result.segments>0);assert.ok(result.clippedIntervals.length>0);assert.equal(result.complete,false);assert.ok(result.omissions.length>0);checkSegments(input,result);partition(result);
  for(let i=0;i<result.segments;i++)assert.ok(result.parameterIntervals[2*i+1]<.5||result.parameterIntervals[2*i]>.5);
});

test('wholly pole-clipped intervals are explicit resolved omissions with zero buffers',()=>{
  const result=tessellateStereographicArc({a:[.01,0,0,1],b:[0,.01,0,1],camera,tolerancePixels:1});
  assert.equal(result.complete,true);assert.equal(result.segments,0);assert.equal(result.positions.length,0);assert.equal(result.clippedIntervals.length,1);assert.equal(result.omissions.length,0);partition(result);
});

test('observer near crossing subdivides/clips without bridging positive and negative depth',()=>{
  const c={...camera,projection:'perspective',worldToCamera:[[0,1,0,0],[0,0,1,0],[-1,0,0,.4]]},input={a:X,b:Y,camera:c,tolerancePixels:2,maxDepth:12,maxVisits:8191};
  const result=tessellateStereographicArc(input);assert.ok(result.clippedIntervals.length>0);assert.ok(result.segments>0);assert.equal(result.complete,false);partition(result);
  for(let i=0;i<result.segments;i++)for(const t of [result.parameterIntervals[2*i],result.parameterIntervals[2*i+1]])assert.ok(.4-point(X,Y,t)[0]>=c.near);
});

test('quantized endpoint near-plane failure never turns a safe mathematical constant into a chord',()=>{
  const a=[.6,0,.8,0],c={...camera,projection:'perspective',worldToCamera:[[1,0,0,0],[0,1,0,0],[0,0,-1,1]],near:.199999995};
  const result=tessellateStereographicArc({a,b:[...a],camera:c,tolerancePixels:1,maxDepth:4,maxVisits:31});
  assert.equal(result.complete,false);assert.equal(result.segments,0);assert.ok(result.omissions.every(o=>o.code==='endpoint-unresolved'));partition(result);
});

test('constant arc retains quantization floor rather than claiming exact zero rendered error',()=>{
  const a=[.7,.2,.15,.1],c={...camera,scaleX:1e6,scaleY:1e6},endpoint=boundStereographicEndpoint({a,b:a,t:0,camera:c});assert.equal(endpoint.supported,true);assert.ok(endpoint.errorBoundPixels>0);
  const complete=tessellateStereographicArc({a,b:a,camera:c,tolerancePixels:2*endpoint.errorBoundPixels});assert.equal(complete.complete,true);assert.equal(complete.segments,1);assert.equal(complete.curveErrorBoundsPixels[0],0);assert.ok(complete.endpointErrorBoundsPixels[0]>0);
  const refused=tessellateStereographicArc({a,b:a,camera:c,tolerancePixels:endpoint.errorBoundPixels/2,maxDepth:3});assert.equal(refused.complete,false);assert.equal(refused.segments,0);partition(refused);
});

test('all budgets bound work/output and retain a complete raw interval accounting',()=>{
  for(const budgets of [{maxSegments:1},{maxVisits:1},{maxDepth:0},{maxSegments:2,maxVisits:9,maxDepth:3}]){
    const input={a:X,b:Y,camera,tolerancePixels:.001,...budgets},result=tessellateStereographicArc(input);
    assert.equal(result.complete,false);assert.ok(result.segments<=(budgets.maxSegments??2048));assert.ok(result.visits<=(budgets.maxVisits??8191));assert.ok(result.maximumDepth<=(budgets.maxDepth??20));assert.ok(result.omissions.length>0);partition(result);
  }
});

test('an unresolved quantization floor bounds endpoint-cache storage independently of visited nodes',()=>{
  const a=[.7,.2,.15,.1],c={...camera,scaleX:1e6,scaleY:1e6},result=tessellateStereographicArc({a,b:a,camera:c,tolerancePixels:1e-12,maxDepth:8,maxVisits:511,maxSegments:1});
  assert.equal(result.segments,0);assert.equal(result.complete,false);assert.equal(result.visits,511);
  assert.equal(result.endpointCacheLimit,11);assert.ok(result.endpointEvaluations>result.endpointCacheLimit);assert.equal(result.endpointCachePeak,result.endpointCacheLimit);partition(result);
});

test('ambiguous original source-center edges refuse without arbitrary alternative arcs',()=>{
  const result=tessellateStereographicArc({a:X,b:[-1,0,0,0],camera,t0:.1,t1:.2,tolerancePixels:1});
  assert.equal(result.complete,false);assert.equal(result.visits,1);assert.equal(result.segments,0);assert.equal(result.omissions[0].code,'source-center');partition(result);
});

test('zero raw interval is finite but still retains original ownership and endpoint accounting',()=>{
  const input={a:X,b:Y,t0:.3,t1:.3,camera,tolerancePixels:1},result=tessellateStereographicArc(input);assert.equal(result.complete,true);assert.equal(result.segments,1);assert.deepEqual(Array.from(result.parameterIntervals),[.3,.3]);checkSegments(input,result);
});

test('returned buffers are exclusively owned mutable arrays and caller source/camera are untouched',()=>{
  const input={a:new Float64Array(X),b:new Float64Array(Y),camera:structuredClone(camera),tolerancePixels:1},before=structuredClone(input),result=tessellateStereographicArc(input);
  assert.deepEqual(input,before);assert.equal(input.a.byteLength,32);assert.equal(Object.isFrozen(input.camera),false);assert.equal(Object.isFrozen(result),true);
  result.positions[0]=99;result.parameterIntervals[0]=.9;assert.equal(input.a[0],1);assert.deepEqual(result.source.a,X);
});

test('fixed original endpoint bytes qualify existing vertex buffers and preserve shared edge junctions',()=>{
  const shared=new Float32Array([0,1+2**-23,0]);
  assert.notDeepEqual(shared,boundStereographicEndpoint({a:Y,b:Y,t:0,camera}).positions,'The test must qualify supplied bytes different from the helper default');
  const firstPacked=new Float32Array([1+2**-23,0,0,...shared]),secondPacked=new Float32Array([...shared,0,0,1+2**-23]);
  const firstInput={a:X,b:Y,camera,tolerancePixels:1,packedEndpoints:firstPacked},secondInput={a:Y,b:[0,0,1,0],camera,tolerancePixels:1,packedEndpoints:secondPacked};
  const first=tessellateStereographicArc(firstInput),second=tessellateStereographicArc(secondInput);assert.equal(first.complete,true);assert.equal(second.complete,true);
  assert.deepEqual(first.positions.slice(-3),shared);assert.deepEqual(second.positions.slice(0,3),shared);assert.equal(first.fixedPackedEndpointsIncluded,true);
  firstPacked[0]=99;assert.equal(first.positions[0],1+2**-23);checkSegments({...firstInput,packedEndpoints:undefined},first);checkSegments(secondInput,second);
});

test('fixed endpoints can fail camera safety or tolerance without silently substituting different bytes',()=>{
  const input={a:X,b:Y,camera:{...camera,projection:'perspective'},tolerancePixels:1,maxDepth:3,packedEndpoints:new Float32Array([1,0,6,0,1,0])},result=tessellateStereographicArc(input);
  assert.equal(result.complete,false);assert.ok(result.omissions.some(o=>o.t0===0));partition(result);checkSegments(input,result);
  assert.throws(()=>tessellateStereographicArc({a:X,b:Y,camera,packedEndpoints:new Float32Array(5)}),/six/);
  assert.throws(()=>tessellateStereographicArc({a:X,b:Y,camera,t0:.5,t1:.5,packedEndpoints:new Float32Array([1,0,0,0,1,0])}),/identical/);
});

test('fixed edge endpoint transport refuses subclasses, custom copies, resizable and detached buffers',()=>{
  let calls=0;class Foreign extends Float32Array{slice(){calls++;throw Error('Foreign slice executed');}}
  const custom=new Float32Array([1,0,0,0,1,0]);custom.slice=()=>{calls++;throw Error('Custom slice executed');};
  for(const packedEndpoints of [new Foreign([1,0,0,0,1,0]),custom,new Float32Array(new ArrayBuffer(24,{maxByteLength:48}))])assert.throws(()=>tessellateStereographicArc({a:X,b:Y,camera,packedEndpoints}),/privately owned/);
  assert.equal(calls,0);const detached=new Float32Array([1,0,0,0,1,0]);structuredClone(detached.buffer,{transfer:[detached.buffer]});
  assert.throws(()=>tessellateStereographicArc({a:X,b:Y,camera,packedEndpoints:detached}),/detached/);
});

test('invalid budgets, IDs and tolerances refuse before unbounded subdivision',()=>{
  for(const extra of [{maxSegments:0},{maxSegments:ARC_TESSELLATION_LIMITS.segments+1},{maxVisits:Infinity},{maxDepth:33},{maxDepth:-1},{sourceEdgeId:-1},{sourceInstanceId:2**32},{tolerancePixels:0},{tolerancePixels:NaN}])assert.throws(()=>tessellateStereographicArc({a:X,b:Y,camera,...extra}));
});

test('headless small and capped curved-edge timings report actual bounded CPU work',()=>{
  for(const [label,count,budget] of [['small',8,511],['capped',64,15]]){
    const started=performance.now();let visits=0,segments=0,partial=0;
    for(let i=0;i<count;i++){
      const angle=2*Math.PI*i/count,a=[Math.cos(angle),Math.sin(angle),.05,.7],b=[Math.cos(angle+.8),Math.sin(angle+.8),-.05,.7];
      const result=tessellateStereographicArc({a,b,camera,tolerancePixels:.25,maxVisits:budget,maxDepth:12,maxSegments:128,sourceEdgeId:i});visits+=result.visits;segments+=result.segments;partial+=Number(!result.complete);assert.ok(result.visits<=budget);partition(result);
    }
    console.log(JSON.stringify({benchmark:label,edges:count,milliseconds:performance.now()-started,visits,segments,partial,gpu:false}));
    assert.ok(segments>0);if(label==='capped')assert.ok(partial>0);
  }
});
