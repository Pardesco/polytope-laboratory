import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureHomogeneousStereographicCamera as capture,projectHomogeneousCameraBox as project} from '../development/stereographic-homogeneous-camera.mjs';
import {nextFloatUp,nextFloatDown} from '../ui/stereographic-arc-bound.mjs';

// Independent exact rational oracle for the stored binary64 inputs. No sampled
// floating evaluation is used to decide whether an interval encloses its value.
const bits=new DataView(new ArrayBuffer(8)),gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a;};
function Q(n,d=1n){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function number(x){if(x===0)return Q(0n);bits.setFloat64(0,x);const b=bits.getBigUint64(0),exponent=Number((b>>52n)&2047n),mantissa=(b&0xfffffffffffffn)+(exponent?1n<<52n:0n),power=exponent?exponent-1075:-1074,sign=b>>63n?-1n:1n;return power<0?Q(sign*mantissa,1n<<BigInt(-power)):Q(sign*(mantissa<<BigInt(power)));}
const add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),neg=a=>Q(-a.n,a.d),sum=a=>a.reduce(add,Q(0n));
const compare=(a,b)=>a.n*b.d-b.n*a.d;
function encloses(interval,value){assert.ok(compare(number(interval[0]),value)<=0&&compare(value,number(interval[1]))<=0,`Exact rational is outside [${interval}].`);}
function apply(matrix,p){const m=matrix.map(number),q=[...p,Q(1n)],out=[0,1,2,3].map(r=>sum(q.map((x,k)=>mul(m[r+4*k],x))));return out.slice(0,3).map(x=>div(x,out[3]));}
function exact(snapshot,p){const cameraPoint=apply(snapshot.inverseViewMatrix,apply(snapshot.groupMatrixWorld,p.map(number))),ndc=apply(snapshot.projectionMatrix,cameraPoint),[w,h]=snapshot.cssSize.map(number);return {depth:neg(cameraPoint[2]),ndc,screen:[div(mul(add(ndc[0],Q(1n)),w),Q(2n)),div(mul(add(Q(1n),neg(ndc[1])),h),Q(2n))]};}
function check(snapshot,p){const result=project(snapshot,{bounds:p.map(x=>[x,x])}),reference=exact(snapshot,p);assert.ok(result.screenBounds);encloses(result.depthBounds,reference.depth);result.ndcBounds.forEach((v,i)=>encloses(v,reference.ndc[i]));result.screenBounds.forEach((v,i)=>encloses(v,reference.screen[i]));return result;}
function camera(kind='perspective'){
  const c=kind==='perspective'?new THREE.PerspectiveCamera(38,947/613,.01,1000):new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,1000);
  c.position.set(3,2,5);c.lookAt(0,0,0);c.updateMatrixWorld();c.updateProjectionMatrix();return c;
}
const snapshot=(c,group=null)=>capture({camera:c,cssWidth:947,cssHeight:613,groupMatrixWorld:group});

test('ordinary inverse-rounded Three matrices are supported without changing their non-unit homogeneous row',()=>{
  for(const kind of ['perspective','orthographic']){
    const c=camera(kind),before=c.matrixWorldInverse.elements.slice(),s=snapshot(c);assert.notEqual(before[15],1);assert.equal(s.supported,true);assert.deepEqual(s.inverseViewMatrix,before);
    for(const p of [[0,0,0],[.2,-.4,.7],[1,.1,-1]])assert.equal(check(s,p).status,'bounded');
    assert.deepEqual(c.matrixWorldInverse.elements,before);assert.equal(s.idealTransformErrorIncluded,false);assert.equal(s.cpuSequentialRoundingIncluded,false);assert.equal(s.gpuArithmeticIncluded,false);
  }
});

test('rolled/off-axis actual Three CPU projection is equivalent within ordinary CPU rounding, exact real oracle is enclosed',()=>{
  for(const kind of ['perspective','orthographic']){
    const c=camera(kind);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.zoom=1.7;c.setViewOffset(1200,900,93,117,947,613);if(kind==='perspective')c.filmOffset=2;c.updateMatrixWorld();c.updateProjectionMatrix();
    const group=new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,1.1,.1,0,0,0,nextFloatUp(1)),s=snapshot(c,group);assert.equal(s.supported,true);
    for(const p of [[0,0,0],[.2,-.4,.7],[-.1,.2,-.3]]){
      const r=check(s,p),v=new THREE.Vector3(...p).applyMatrix4(group).project(c),actual=[(v.x+1)*947/2,(1-v.y)*613/2];
      r.screenBounds.forEach((b,i)=>assert.ok(Math.abs((b[0]+b[1])/2-actual[i])<1e-9));
    }
  }
});

test('positive homogeneous camera/group scales cancel as real projective geometry, including orthographic scale',()=>{
  for(const kind of ['perspective','orthographic']){
    const c=camera(kind),group=new THREE.Matrix4().makeTranslation(.2,-.1,.3),original=snapshot(c,group),scaled=c.clone();
    scaled.matrixWorldInverse.elements=scaled.matrixWorldInverse.elements.map(x=>x*2);const scaledGroup=group.clone().multiplyScalar(4),s=snapshot(scaled,scaledGroup);assert.equal(s.supported,true);
    for(const p of [[0,0,0],[.3,.5,.7]]){
      const a=exact(original,p),b=exact(s,p);a.screen.forEach((x,i)=>assert.equal(compare(x,b.screen[i]),0n));assert.equal(compare(a.depth,b.depth),0n);check(s,p);
    }
  }
});

test('composition and normalized interval coefficients enclose exact real V*G/H including shear and unrelated h factors',()=>{
  const c=camera(),group=new THREE.Matrix4().set(2,.3,0,.4,0,.7,.2,-.3,0,0,-1.2,.2,0,0,0,1.7),s=snapshot(c,group);assert.equal(s.supported,true);
  const V=s.inverseViewMatrix.map(number),G=s.groupMatrixWorld.map(number),H=mul(V[15],G[15]);encloses(s.homogeneousScale,H);
  s.normalizedRows.forEach((row,r)=>row.forEach((bounds,k)=>{const value=sum([0,1,2,3].map(j=>mul(V[r+4*j],G[k*4+j])));encloses(bounds,div(r===2?neg(value):value,H));}));
  for(const p of [[0,0,0],[.1,.2,.3],[-.7,.4,-.1]])check(s,p);
});

test('world boxes enclose all corners and deterministic interior positions with full pre-group ownership',()=>{
  const c=camera(),group=new THREE.Matrix4().makeScale(1.2,.8,1.1),s=snapshot(c,group),bounds=[[-.2,.5],[-.4,.3],[-.5,.1]],r=project(s,{bounds});assert.equal(r.supported,true);
  for(let i=0;i<8;i++){const p=bounds.map((b,k)=>b[(i>>k)&1]),v=exact(s,p);r.screenBounds.forEach((b,k)=>encloses(b,v.screen[k]));encloses(r.depthBounds,v.depth);}
  for(let i=0;i<64;i++){const p=bounds.map((b,k)=>b[0]+(b[1]-b[0])*((i*(k+3))%63)/63),v=exact(s,p);r.screenBounds.forEach((b,k)=>encloses(b,v.screen[k]));encloses(r.depthBounds,v.depth);}
});

test('near/far boundaries use actual NDC planes and outward rounding, never epsilon clamping',()=>{
  for(const kind of ['perspective','orthographic']){
    const c=kind==='perspective'?new THREE.PerspectiveCamera(60,1,1,3):new THREE.OrthographicCamera(-1,1,1,-1,1,3);c.updateMatrixWorld();c.updateProjectionMatrix();c.matrixWorldInverse.elements[15]=nextFloatDown(1);const s=snapshot(c),h=c.matrixWorldInverse.elements[15];
    assert.equal(s.supported,true);assert.equal(check(s,[0,0,-h]).status,'needs-subdivision');
    assert.equal(check(s,[0,0,-h*(1+1e-12)]).status,'bounded');assert.equal(check(s,[0,0,-h*(1-1e-12)]).status,'clipped');
    assert.equal(check(s,[0,0,-h*3]).status,'needs-subdivision');assert.equal(check(s,[0,0,-h*(3-1e-12)]).status,'bounded');assert.equal(check(s,[0,0,-h*(3+1e-12)]).status,'clipped');
  }
});

test('depth crossings and wholly behind-eye boxes cannot become finite safe chords',()=>{
  const c=new THREE.PerspectiveCamera(60,1,.1,10);c.updateMatrixWorld();const s=snapshot(c);
  const behind=project(s,{bounds:[[0,0],[0,0],[1,2]]});assert.equal(behind.status,'clipped');assert.equal(behind.screenBounds,undefined);
  assert.equal(project(s,{bounds:[[0,0],[0,0],[-1,1]]}).status,'needs-subdivision');
});

test('extreme/subnormal h and matrix product overflow have explicit arithmetic refusals',()=>{
  for(const [v,g] of [[Number.MIN_VALUE,Number.MIN_VALUE],[Number.MAX_VALUE,2]]){const c=camera(),group=new THREE.Matrix4();c.matrixWorldInverse.elements[15]=v;group.elements[15]=g;assert.equal(snapshot(c,group).diagnostics[0].code,'arithmetic-unresolved');}
  const c=camera();c.matrixWorldInverse.elements[15]=2**-100;const s=snapshot(c);assert.equal(s.supported,true);check(s,[0,0,0]);
});

test('unsupported projective/nonpositive scales and exotic projections are diagnosed rather than repaired',()=>{
  for(const [index,value] of [[3,.01],[7,.01],[11,.01],[15,0],[15,-1]]){const c=camera();c.matrixWorldInverse.elements[index]=value;assert.equal(snapshot(c).diagnostics[0].code,'homogeneous-form');}
  for(const [index,value] of [[4,.1],[2,.1],[11,1]]){const c=camera();c.projectionMatrix.elements[index]=value;assert.equal(snapshot(c).diagnostics[0].code,'projection-form');}
  const c=camera();c.projectionMatrix.makePerspective(-1,1,1,-1,c.near,c.far,THREE.WebGLCoordinateSystem,true);assert.equal(snapshot(c).diagnostics[0].code,'projection-depth');
});

test('snapshots are detached/frozen, signatures retain h and pose, forged envelopes reject',()=>{
  const c=camera(),s=snapshot(c),before=s.inverseViewMatrix.slice();assert.equal(Object.isFrozen(s.normalizedRows[0][0]),true);assert.equal(snapshot(c).signature,s.signature);
  c.matrixWorldInverse.elements[15]=nextFloatUp(c.matrixWorldInverse.elements[15]);assert.notEqual(snapshot(c).signature,s.signature);assert.deepEqual(s.inverseViewMatrix,before);assert.equal(Object.isFrozen(c.matrixWorldInverse.elements),false);
  assert.throws(()=>project({...s},{bounds:[[0,0],[0,0],[0,0]]}),/owned immutable/);assert.equal(project(s,{bounds:[[0,0],[0,0],[0,0]]}).supported,true);
});

test('bounded malformed matrices/boxes reject without running indexed accessors or matrix iterators',()=>{
  const c=camera(),s=snapshot(c);let called=0;const entries=c.matrixWorldInverse.elements.slice();Object.defineProperty(entries,0,{get(){called++;return 1;}});
  assert.throws(()=>capture({camera:{...c,matrixWorldInverse:{elements:entries}},cssWidth:947,cssHeight:613}),/own data/);assert.equal(called,0);
  for(const bounds of [[],[[0,Infinity],[0,0],[0,0]],[[1,-1],[0,0],[0,0]]])assert.throws(()=>project(s,{bounds}));
  assert.throws(()=>capture({camera:c,cssWidth:0,cssHeight:613}));assert.throws(()=>capture({camera:{...c,matrixWorldInverse:{elements:Array(100000)}},cssWidth:947,cssHeight:613}),/16 bounded/);
});
