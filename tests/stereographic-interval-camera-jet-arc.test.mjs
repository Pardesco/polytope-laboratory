import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stereographicArcWorldJets as world} from '../development/stereographic-interval-camera-jet-arc.mjs';
import {boundHomogeneousCameraJet as cameraJet} from '../development/stereographic-interval-camera-jet.mjs';
import {captureHomogeneousStereographicCamera as capture} from '../development/stereographic-homogeneous-camera.mjs';
import {nextFloatDown,nextFloatUp} from '../ui/stereographic-arc-bound.mjs';

const encloses=(bounds,value)=>assert.ok(bounds[0]<=value&&value<=bounds[1],`${value} outside ${bounds}`);
const dv=new DataView(new ArrayBuffer(8)),gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a;};
function Q(n,d=1n){if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
function q(x){if(x===0)return Q(0n);dv.setFloat64(0,x);const v=dv.getBigUint64(0),e=Number((v>>52n)&2047n),m=(v&0xfffffffffffffn)+(e?1n<<52n:0n),p=e?e-1075:-1074,s=v>>63n?-1n:1n;return p<0?Q(s*m,1n<<BigInt(-p)):Q(s*(m<<BigInt(p)));}
const add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d),mul=(a,b)=>Q(a.n*b.n,a.d*b.d),div=(a,b)=>Q(a.n*b.d,a.d*b.n),neg=a=>Q(-a.n,a.d),sub=(a,b)=>add(a,neg(b)),sum=values=>values.reduce(add,Q(0n)),compare=(a,b)=>a.n*b.d-b.n*a.d;
const exactEncloses=(b,v)=>assert.ok(compare(q(b[0]),v)<=0&&compare(v,q(b[1]))<=0);
// Independent endpoint oracle: fixture endpoint norms equal exactly 5. All
// following source, radius and rational quotient derivatives are exact BigInt.
function endpoint(a,b,t){const p=(t?b:a).map(q),d=b.map((x,i)=>sub(q(x),q(a[i]))),r=Q(5n),pd=sum(p.map((x,i)=>mul(x,d[i]))),rd=div(pd,r),rdd=sub(div(sum(d.map(x=>mul(x,x))),r),div(mul(pd,pd),mul(r,mul(r,r)))),h=sub(r,p[3]),hd=sub(rd,d[3]);return p.slice(0,3).map((x,i)=>({value:div(x,h),first:div(sub(mul(d[i],h),mul(x,hd)),mul(h,h)),second:div(sum([neg(mul(x,mul(rdd,h))),neg(mul(Q(2n),mul(d[i],mul(h,hd)))),mul(Q(2n),mul(x,mul(hd,hd)))]),mul(h,mul(h,h)))}));}

test('whole raw equatorial arc encloses analytic circle value and derivatives without slerp replacement',()=>{
  const r=world({a:[1,0,0,0],b:[0,1,0,0]});assert.equal(r.supported,true);assert.equal(r.worldJetEnclosuresVerified,true);
  for(let i=0;i<=64;i++){
    const t=i/64,x=1-t,y=t,q=x*x+y*y,radius=Math.sqrt(q),theta1=1/q,theta2=(2-4*t)/(q*q),v=[x/radius,y/radius,0],first=[-v[1]*theta1,v[0]*theta1,0],second=[-v[0]*theta1*theta1-v[1]*theta2,-v[1]*theta1*theta1+v[0]*theta2,0];
    r.worldJets.forEach((jet,k)=>{encloses(jet.value,v[k]);encloses(jet.first,first[k]);encloses(jet.second,second[k]);});
  }
  // The raw midpoint is not an angular midpoint for unequal radii.
  const unequal=world({a:[2,0,0,0],b:[0,1,0,0],t0:.5,t1:.5});assert.equal(unequal.supported,true);encloses(unequal.worldJets[0].value,2/Math.sqrt(5));encloses(unequal.worldJets[1].value,1/Math.sqrt(5));assert.ok(unequal.worldJets[0].value[0]>.8);
});

test('nonequatorial endpoint derivatives enclose independent exact rational radius/quotient oracle',()=>{
  const a=[3,4,0,0],b=[4,0,0,3],whole=world({a,b});assert.equal(whole.supported,true);
  for(const t of [0,1]){const exact=endpoint(a,b,t),point=world({a,b,t0:t,t1:t});assert.equal(point.supported,true);exact.forEach((value,i)=>{for(const key of ['value','first','second']){exactEncloses(whole.worldJets[i][key],value[key]);exactEncloses(point.worldJets[i][key],value[key]);}});}
});

test('positive radial rescaling and exact power-of-two extremes retain the same prepared curve and derivative enclosure',()=>{
  const a=[3,4,0,0],b=[4,0,0,3];
  for(const factor of [2**500,2**-500]){const r=world({a:a.map(x=>x*factor),b:b.map(x=>x*factor)});assert.equal(r.supported,true);endpoint(a,b,0).forEach((v,i)=>{for(const key of ['value','first','second'])exactEncloses(r.worldJets[i][key],v[key]);});}
  const ray=world({a:[3,4,0,0],b:[6,8,0,0]});assert.equal(ray.supported,true);ray.worldJets.forEach(j=>{encloses(j.first,0);encloses(j.second,0);});
});

test('original raw fragment is retained; a camera jet consumes only that analytic interval',()=>{
  const c=new THREE.PerspectiveCamera(38,947/613,.01,1000);c.position.set(3,2,5);c.up.set(.3,1,.1);c.lookAt(.1,.2,-.1);c.zoom=1.3;c.filmOffset=2;c.updateMatrixWorld();c.updateProjectionMatrix();c.matrixWorldInverse.elements[15]=nextFloatDown(1);
  const group=new THREE.Matrix4().set(1.2,.2,0,.3,0,.8,.1,-.2,0,0,1.1,.1,0,0,0,nextFloatUp(1)),camera=capture({camera:c,cssWidth:947,cssHeight:613,groupMatrixWorld:group}),arc=world({a:[3,4,0,0],b:[4,0,0,3],t0:0,t1:.125});assert.equal(arc.supported,true);
  const result=cameraJet(camera,{worldJets:arc.worldJets,parameterInterval:arc.rawParameterInterval});assert.equal(result.supported,true);assert.deepEqual(result.parameterInterval,[0,.125]);assert.ok(result.chordErrorBoundPixels>0);assert.equal(result.conditionalOnWorldJetEnclosures,true);assert.equal(result.gpuArithmeticIncluded,false);assert.equal(result.wholePatchBound,false);
});

test('pole intersections, wholly pole-clipped arcs and source-center ambiguity preserve frozen refusal diagnoses',()=>{
  const crossing=world({a:[1,0,0,0],b:[0,0,0,1]});assert.equal(crossing.status,'needs-subdivision');assert.equal(crossing.worldJets,null);assert.match(crossing.diagnostics[0].code,/pole/);
  const clipped=world({a:[.001,0,0,1],b:[-.001,0,0,1]});assert.equal(clipped.status,'clipped');assert.equal(clipped.worldJetEnclosuresVerified,false);
  const center=world({a:[1,0,0,0],b:[-1,0,0,0]});assert.equal(center.status,'unsupported');assert.equal(center.diagnostics[0].code,'source-center');
});

test('source identity/parameter bindings are detached; input changes cannot alter old jets or their domain',()=>{
  const a=[1,0,0,0],b=[0,1,0,0],r=world({a,b,t0:.125,t1:.25}),key=r.sourceBinding;assert.equal(r.supported,true);a[0]=2;assert.equal(r.source.a[0],1);assert.equal(Object.isFrozen(a),false);assert.equal(Object.isFrozen(r.worldJets[0].first),true);assert.equal(r.sourceBinding,key);assert.notEqual(world({a,b,t0:.125,t1:.25}).sourceBinding,key);
});

test('invalid prepared domains and lossy source scaling never turn into analytic world jets',()=>{
  for(const input of [{a:[0,0,0],b:[1,0,0,0]},{a:[1,0,0,0],b:[0,1,0,0],t0:-.1},{a:[1,0,0,0],b:[0,1,0,0],poleEpsilon:0}])assert.throws(()=>world(input));
  const loss=world({a:[Number.MAX_VALUE,Number.MIN_VALUE,0,0],b:[Number.MAX_VALUE,0,0,0]});assert.equal(loss.supported,false);assert.equal(loss.worldJets,null);assert.match(loss.diagnostics[0].code,/arithmetic/);
});

test('prepared source arrays are bounded and copied without caller iterators or typed buffer mutation',()=>{
  const a=[1,0,0,0],b=new Float64Array([0,1,0,0]);let called=0;a[Symbol.iterator]=()=>{called++;throw Error('Caller iteration');};const r=world({a,b});assert.equal(r.supported,true);assert.equal(called,0);assert.equal(b.byteLength,32);
  assert.throws(()=>world({a:Array(100000),b}),/four prepared/);
  const resizable=new Float64Array(new ArrayBuffer(32,{maxByteLength:64}));assert.throws(()=>world({a:resizable,b}),/nonresizable/);
  const detached=new Float64Array(4);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>world({a:detached,b}),/detached/);
});
