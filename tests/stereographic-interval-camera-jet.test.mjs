import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureHomogeneousStereographicCamera as capture} from '../development/stereographic-homogeneous-camera.mjs';
import {boundHomogeneousCameraJet as bound} from '../development/stereographic-interval-camera-jet.mjs';
import {nextFloatDown,nextFloatUp} from '../ui/stereographic-arc-bound.mjs';

const bits=new DataView(new ArrayBuffer(8)),gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a;};
function Q(n,d=1n){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function real(x){if(x===0)return Q(0n);bits.setFloat64(0,x);const b=bits.getBigUint64(0),e=Number((b>>52n)&2047n),m=(b&0xfffffffffffffn)+(e?1n<<52n:0n),p=e?e-1075:-1074,s=b>>63n?-1n:1n;return p<0?Q(s*m,1n<<BigInt(-p)):Q(s*(m<<BigInt(p)));}
const add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),neg=a=>Q(-a.n,a.d),sub=(a,b)=>add(a,neg(b)),sum=values=>values.reduce(add,Q(0n));
const compare=(a,b)=>a.n*b.d-b.n*a.d,approx=a=>Number(a.n)/Number(a.d);
function encloses(b,v){assert.ok(compare(real(b[0]),v)<=0&&compare(v,real(b[1]))<=0,`Exact derivative outside ${b}`);}
function observer(kind='perspective'){
  const c=kind==='perspective'?new THREE.PerspectiveCamera(38,947/613,.01,1000):new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,1000);
  c.position.set(3,2,5);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.updateMatrixWorld();c.zoom=1.3;c.setViewOffset(1200,900,93,117,947,613);if(kind==='perspective')c.filmOffset=2;c.updateProjectionMatrix();return c;
}
const snapshot=(c,group=null,w=947,h=613)=>capture({camera:c,cssWidth:w,cssHeight:h,groupMatrixWorld:group});
const jets=(a,b,c=[0,0,0])=>a.map((v,i)=>({value:[v-1,v+1],first:[Math.min(b[i],b[i]+2*c[i])-1e-12,Math.max(b[i],b[i]+2*c[i])+1e-12],second:[2*c[i],2*c[i]]}));
// Independent rational polynomial quotient formula, not interval AD. World
// p=a+bt+ct²; compose EXACT stored V/G as rationals before evaluating the closed
// formulas (N'D-ND')/D² and (N''D²-ND''D-2N'DD'+2N(D')²)/D³.
function oracle(s,a,b,c,t){
  const V=s.inverseViewMatrix.map(real),G=s.groupMatrixWorld.map(real),C=Array.from({length:16},(_,i)=>sum([0,1,2,3].map(k=>mul(V[i%4+4*k],G[4*Math.floor(i/4)+k])))),H=mul(V[15],G[15]),T=real(t),p=a.map((x,i)=>sum([real(x),mul(real(b[i]),T),mul(real(c[i]),mul(T,T))])),d=b.map((x,i)=>add(real(x),mul(Q(2n),mul(real(c[i]),T)))),dd=c.map(x=>mul(Q(2n),real(x)));
  const map=(v,r,constant)=>div(sum([...v.map((x,i)=>mul(C[r+4*i],x)),constant?C[r+12]:Q(0n)]),H),v=[0,1,2].map(r=>map(p,r,true)),dv=[0,1,2].map(r=>map(d,r,false)),ddv=[0,1,2].map(r=>map(dd,r,false)),D=neg(v[2]),Dp=neg(dv[2]),Dpp=neg(ddv[2]),P=s.projectionMatrix.map(real);
  return [0,1].map(i=>{
    const N=v[i],Np=dv[i],Npp=ddv[i];let value=N,first=Np,second=Npp;
    if(s.projection==='perspective'){
      value=div(N,D);first=div(sub(mul(Np,D),mul(N,Dp)),mul(D,D));
      second=div(sum([mul(Npp,mul(D,D)),neg(mul(N,mul(Dpp,D))),neg(mul(Q(2n),mul(Np,mul(D,Dp)))),mul(Q(2n),mul(N,mul(Dp,Dp)))]),mul(D,mul(D,D)));
    }
    const scale=div(mul(real(s.cssSize[i]),P[i?5:0]),Q(2n)),offset=s.projection==='perspective'?neg(P[i?9:8]):P[i?13:12],sign=i?Q(-1n):Q(1n);
    return {value:div(mul(real(s.cssSize[i]),add(Q(1n),mul(sign,add(mul(P[i?5:0],value),offset)))),Q(2n)),first:mul(sign,mul(scale,first)),second:mul(sign,mul(scale,second))};
  });
}

test('constant and affine world curves under orthographic projection have exact zero second derivative/chord error',()=>{
  const s=snapshot(observer('orthographic')),r=bound(s,{worldJets:jets([0,0,0],[.2,-.1,.3])});assert.equal(r.supported,true);assert.deepEqual(r.screenSecondDerivativeBounds,[0,0]);assert.equal(r.chordErrorBoundPixels,0);
  assert.equal(r.conditionalOnWorldJetEnclosures,true);assert.equal(r.worldJetEnclosuresVerified,false);assert.equal(r.wholePatchBound,false);assert.equal(r.endpointQuantizationIncluded,false);
});

test('orthographic quadratic curvature is enclosed against exact stored-coefficient polynomial derivatives',()=>{
  const s=snapshot(observer('orthographic'),new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,-1.1,.1,0,0,0,nextFloatUp(1))),a=[.1,.2,-.4],b=[.3,-.2,.15],c=[.125,.0625,-.03125],r=bound(s,{worldJets:jets(a,b,c)});assert.equal(r.supported,true);
  for(const t of [0,.125,.371,.75,1])oracle(s,a,b,c,t).forEach((o,i)=>{encloses(r.screenJets[i].second,o.second);encloses(r.screenJets[i].first,o.first);encloses(r.screenJets[i].value,o.value);});
  const exact=oracle(s,a,b,c,0),second=Math.hypot(...exact.map(o=>approx(o.second)));assert.ok(r.chordErrorBoundPixels>=second/8);assert.ok(r.chordErrorBoundPixels<second/8*(1+1e-10));
});

test('perspective affine/quadratic world jets enclose independent exact rational quotient derivatives',()=>{
  const a=[.1,.2,-.4],b=[.3,-.2,.15];
  for(const c of [[0,0,0],[.125,.0625,-.03125]]){
    const camera=observer(),group=new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,1.1,.1,0,0,0,1.7),s=snapshot(camera,group),r=bound(s,{worldJets:jets(a,b,c)});assert.equal(r.supported,true);assert.ok(r.chordErrorBoundPixels>0);
    for(const t of [0,.125,.371,.75,1])oracle(s,a,b,c,t).forEach((o,i)=>{for(const key of ['value','first','second'])encloses(r.screenJets[i][key],o[key]);});
  }
});

test('inverse-rounded non-unit Three homogeneous rows remain unchanged and composition/normalization uncertainty is included',()=>{
  const camera=observer();camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();assert.notEqual(camera.matrixWorldInverse.elements[15],1);const s=snapshot(camera),before=s.inverseViewMatrix.slice(),a=[0,0,0],b=[.2,.1,.1],c=[.03125,0,.0625],r=bound(s,{worldJets:jets(a,b,c)});assert.equal(r.supported,true);
  oracle(s,a,b,c,.37).forEach((o,i)=>encloses(r.screenJets[i].second,o.second));assert.deepEqual(s.inverseViewMatrix,before);assert.deepEqual(camera.matrixWorldInverse.elements,before);
});

test('pixel scale doubles derivative and chord bounds while principal offsets leave curvature unchanged',()=>{
  const c=observer(),a=[0,0,0],b=[.2,.1,.1],q=[.03125,0,.0625],input={worldJets:jets(a,b,q)},r=bound(snapshot(c),input),double=bound(snapshot(c,null,1894,1226),input);assert.equal(r.supported,true);assert.equal(double.supported,true);
  double.screenSecondDerivativeBounds.forEach((x,i)=>assert.ok(Math.abs(x/(2*r.screenSecondDerivativeBounds[i])-1)<1e-12));assert.ok(Math.abs(double.chordErrorBoundPixels/(2*r.chordErrorBoundPixels)-1)<1e-12);
  const shifted=c.clone();shifted.projectionMatrix.elements[8]+=.5;shifted.projectionMatrix.elements[9]-=.4;const offset=bound(snapshot(shifted),input);assert.deepEqual(offset.screenJets.map(j=>j.second),r.screenJets.map(j=>j.second));
});

test('quadratic interpolation at every tested parameter is below conditional chord bound',()=>{
  const s=snapshot(observer()),a=[0,0,0],b=[.2,.1,.1],c=[.03125,0,.0625],r=bound(s,{worldJets:jets(a,b,c)}),start=oracle(s,a,b,c,0).map(o=>approx(o.value)),end=oracle(s,a,b,c,1).map(o=>approx(o.value));assert.equal(r.supported,true);
  for(let i=1;i<32;i++){const t=i/32,point=oracle(s,a,b,c,t).map(o=>approx(o.value)),error=Math.hypot(...point.map((x,k)=>x-((1-t)*start[k]+t*end[k])));assert.ok(error<=r.chordErrorBoundPixels);}
});

test('narrow raw interval reduces interpolation factor quadratically and zero interval has zero chord bound',()=>{
  const s=snapshot(observer()),world=jets([0,0,0],[.2,.1,.1],[.03125,0,.0625]),full=bound(s,{worldJets:world}),half=bound(s,{worldJets:world,parameterInterval:[.125,.625]}),point=bound(s,{worldJets:world,parameterInterval:[.5,.5]});assert.equal(full.supported,true);
  assert.ok(Math.abs(half.chordErrorBoundPixels/full.chordErrorBoundPixels-.25)<1e-14);assert.equal(point.chordErrorBoundPixels,0);
});

test('near-plane and eye-depth uncertainty refuse projected jets rather than certifying a bridge',()=>{
  const c=new THREE.PerspectiveCamera(60,1,1,3);c.updateMatrixWorld();const s=snapshot(c),make=z=>[{value:[0,0],first:[0,0],second:[0,0]},{value:[0,0],first:[0,0],second:[0,0]},{value:z,first:[0,0],second:[0,0]}];
  for(const z of [[-1,-1],[-2,1]]){const r=bound(s,{worldJets:make(z)});assert.equal(r.supported,false);assert.equal(r.status,'needs-subdivision');assert.equal(r.chordErrorBoundPixels,null);}
  assert.equal(bound(s,{worldJets:make([1,2])}).status,'clipped');
});

test('huge derivative/norm arithmetic refuses explicitly; no optimistic finite clamping',()=>{
  const s=snapshot(observer()),world=jets([0,0,0],[0,0,0]);world[0].second=[Number.MAX_VALUE,Number.MAX_VALUE];const r=bound(s,{worldJets:world});assert.equal(r.supported,false);assert.equal(r.diagnostics[0].code,'camera-jet-arithmetic-unresolved');
});

test('source jet records detach/freeze while borrowed camera/source remain mutable; forged snapshot rejects',()=>{
  const c=observer(),s=snapshot(c),world=jets([0,0,0],[.1,.2,.3]),r=bound(s,{worldJets:world});assert.equal(r.supported,true);world[0].value[0]=-99;assert.notEqual(r.worldJets[0].value[0],-99);assert.equal(Object.isFrozen(world[0].value),false);assert.equal(Object.isFrozen(r.screenJets[0].second),true);
  assert.throws(()=>bound({...s},{worldJets:world}),/owned immutable/);assert.equal(r.cpuSequentialRoundingIncluded,false);assert.equal(r.idealTransformErrorIncluded,false);assert.equal(r.gpuArithmeticIncluded,false);
});

test('malformed/oversized/accessor jets and parameter intervals reject before camera evaluation',()=>{
  const s=snapshot(observer()),world=jets([0,0,0],[.1,.2,.3]);for(const input of [{worldJets:Array(10000)},{worldJets:[world[0],world[1]]},{worldJets:world,parameterInterval:[-.1,1]},{worldJets:world,parameterInterval:[.9,.2]}])assert.throws(()=>bound(s,input));
  let called=0;const bad={...world[0]};Object.defineProperty(bad,'second',{get(){called++;return [0,0];}});assert.throws(()=>bound(s,{worldJets:[bad,world[1],world[2]]}),/own data/);assert.equal(called,0);
});
