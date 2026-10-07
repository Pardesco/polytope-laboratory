/** Whole raw-edge interval bound, isolated from the current sampled renderer.
 * Prepared a,b already contain source normalization, SO(4) frame and rotations.
 * p(t)=(1-t)a+tb; f(t)=p.xyz/(||p||-p.w), exactly the existing radial path.
 * For each scalar component, interpolation error <= h² sup|f''| /8. Combining
 * component bounds by Euclidean norm bounds distance to the endpoint chord.
 * Orthographic camera is affine; perspective is another positive-depth quotient.
 * No patch, Float32 endpoint/GPU, rasterization or mathematical-model certificate.
 * Formula: https://people.math.wisc.edu/~angenent/519.2014s/coursenotes/stereographic-projection.html
 * Interpolation bound: https://ocw.mit.edu/courses/2-086-numerical-computation-for-mechanical-engineers-fall-2014/fbffccb918511874abd8fd8b3f256688_MIT2_086F14_Interpolation.pdf
 */
const bits=new DataView(new ArrayBuffer(8));
export function nextFloatUp(x){
  if(Number.isNaN(x))throw new TypeError('NaN has no enclosing floating interval.');
  if(x===Infinity)return x;if(x===-Infinity)return -Number.MAX_VALUE;if(x===0)return Number.MIN_VALUE;
  bits.setFloat64(0,x,false);bits.setBigUint64(0,bits.getBigUint64(0,false)+(x>0?1n:-1n),false);return bits.getFloat64(0,false);
}
export const nextFloatDown=x=>-nextFloatUp(-x);
class Unavailable extends Error{constructor(code,message){super(message);this.code=code;}}
const unavailable=(code,message)=>{throw new Unavailable(code,message);};
function I(lo,hi=lo){if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)unavailable('arithmetic-unresolved','A finite enclosing arithmetic interval is unavailable.');return [lo===0?0:lo,hi===0?0:hi];}
const zero=a=>a[0]===0&&a[1]===0;
const neg=a=>I(-a[1],-a[0]);
function plus(a,b){if(zero(a))return [...b];if(zero(b))return [...a];if(a[0]===a[1]&&b[0]===b[1]&&a[0]===-b[0])return I(0);return I(nextFloatDown(a[0]+b[0]),nextFloatUp(a[1]+b[1]));}
const minus=(a,b)=>plus(a,neg(b));
function times(a,b){if(zero(a)||zero(b))return I(0);const values=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return I(nextFloatDown(Math.min(...values)),nextFloatUp(Math.max(...values)));}
function squared(a){if(zero(a))return I(0);const top=Math.max(Math.abs(a[0]),Math.abs(a[1]));const bottom=a[0]<=0&&a[1]>=0?0:Math.min(Math.abs(a[0]),Math.abs(a[1]));return I(bottom===0?0:Math.max(0,nextFloatDown(bottom*bottom)),nextFloatUp(top*top));}
function divided(a,b){if(b[0]<=0&&b[1]>=0)unavailable('denominator-unresolved','A quotient denominator interval contains zero.');return times(a,I(nextFloatDown(1/b[1]),nextFloatUp(1/b[0])));}
const sum=values=>values.reduce(plus,I(0)),dot=(a,b)=>sum(a.map((v,i)=>times(v,b[i])));
function squareRootScalar(x){
  if(x===0)return I(0);if(x<0||!Number.isFinite(x))unavailable('arithmetic-unresolved','Square root requires a finite nonnegative interval.');
  let lo=Math.sqrt(x),hi=lo;if(!Number.isFinite(lo)||lo<=0)unavailable('arithmetic-unresolved','Square root could not supply a finite starting enclosure.');
  // Verify enclosure by outward-rounded squares; do not assume Math.sqrt has
  // a particular libm accuracy. Bounded adjustment refuses an unresolved root.
  let lower=false,upper=false;for(let k=0;k<16;k++){
    lower=squared(I(lo))[1]<=x;upper=squared(I(hi))[0]>=x;
    if(lower&&upper)return I(lo,hi);if(!lower)lo=nextFloatDown(lo);if(!upper)hi=nextFloatUp(hi);
  }
  unavailable('arithmetic-unresolved','Square root enclosure could not be verified within its adjustment bound.');
}
function sqrt(a){if(a[0]<0)unavailable('arithmetic-unresolved','A squared-norm interval became negative.');return I(squareRootScalar(a[0])[0],squareRootScalar(a[1])[1]);}
const norm=a=>sqrt(sum(a.map(squared)));
const extent=a=>Math.max(Math.abs(a[0]),Math.abs(a[1]));
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
function point(value,n,label){if(!Array.isArray(value)&&!(value instanceof Float64Array))throw new TypeError(`${label} requires finite prepared coordinates.`);if(Array.isArray(value)&&Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get||d.set))throw new TypeError(`${label} accessors are unsupported.`);const owned=Array.from(value);if(owned.length!==n||owned.some(v=>!Number.isFinite(v)))throw new TypeError(`${label} requires ${n} finite coordinates.`);return owned;}
function normalizedEndpoints(a,b){
  const maximum=Math.max(...a.map(Math.abs),...b.map(Math.abs));if(!maximum)unavailable('source-center','An edge through the source center has no unique radial spherical arc.');
  // Read the binary exponent rather than Math.log2, whose rounding can put
  // MAX_VALUE at exponent 1024. Subnormal mantissas give their exact highest
  // set bit. Division/multiplication must still round-trip each coordinate:
  // this refuses underflow/lost bits instead of enclosing a different path.
  bits.setFloat64(0,maximum,false);const representation=bits.getBigUint64(0,false),encodedExponent=Number((representation>>52n)&0x7ffn);
  const exponent=encodedExponent?encodedExponent-1023:(representation&0xfffffffffffffn).toString(2).length-1-1074;
  const scale=2**exponent;if(!Number.isFinite(scale)||!scale)unavailable('arithmetic-unresolved','Source scaling cannot be represented as a finite power of two.');
  const normalized=[a,b].map(p=>p.map(x=>{const y=x/scale;if(!Number.isFinite(y)||y*scale!==x)unavailable('arithmetic-unresolved','Power-of-two normalization loses a source coordinate.');return y;}));return {a:normalized[0].map(v=>I(v)),b:normalized[1].map(v=>I(v)),scale};
}
function raw(a,d,t){return a.map((v,i)=>plus(v,times(d[i],t)));}
function radiusBounds(a,d,t0,t1){
  const c=sum(d.map(squared)),b=dot(a,d);let closest;
  if(zero(c))closest=I(t0);else{
    if(c[0]<=0)unavailable('arithmetic-unresolved','The stationary-radius parameter is unresolved.');
    const root=divided(neg(b),c),clamp=t=>Math.max(t0,Math.min(t1,t));closest=I(clamp(root[0]),clamp(root[1]));
  }
  const minimum=norm(raw(a,d,closest))[0],ends=[norm(raw(a,d,I(t0))),norm(raw(a,d,I(t1)))];
  return I(minimum,Math.max(ends[0][1],ends[1][1]));
}
function poleRange(a,d,t0,t1,r){
  const A=sum(a.map(squared)),B=dot(a,d),C=sum(d.map(squared));
  // (p.w/||p||)' has numerator F0+F1*t, divided by positive ||p||³.
  const F0=minus(times(d[3],A),times(a[3],B)),F1=minus(times(d[3],B),times(a[3],C));
  const at=t=>{const p=raw(a,d,t);return divided(p[3],norm(p));};
  const candidates=[at(I(t0)),at(I(t1))];
  if(zero(F0)&&zero(F1)){
    // Constant W ratio, including the W=0 equator.
  }else if(F1[0]>0||F1[1]<0){
    const critical=divided(neg(F0),F1),lo=Math.max(t0,critical[0]),hi=Math.min(t1,critical[1]);if(lo<=hi)candidates.push(at(I(lo,hi)));
  }else{
    const left=plus(F0,times(F1,I(t0))),right=plus(F0,times(F1,I(t1)));
    if(!((left[0]>=0&&right[0]>=0)||(left[1]<=0&&right[1]<=0)))candidates.push(divided(raw(a,d,I(t0,t1))[3],r));
  }
  return I(Math.min(...candidates.map(x=>x[0])),Math.max(...candidates.map(x=>x[1])));
}
const jet=(v,d=I(0),dd=I(0))=>({v,d,dd});
function jetPlus(a,b){return jet(plus(a.v,b.v),plus(a.d,b.d),plus(a.dd,b.dd));}
function jetTimes(a,b){return jet(times(a.v,b.v),plus(times(a.d,b.v),times(a.v,b.d)),sum([times(a.dd,b.v),times(I(2),times(a.d,b.d)),times(a.v,b.dd)]));}
function jetInverse(h){
  const h2=times(h.v,h.v),h3=times(h2,h.v);return jet(divided(I(1),h.v),neg(divided(h.d,h2)),minus(divided(times(I(2),squared(h.d)),h3),divided(h.dd,h2)));
}
function stereoJets(a,d,t,r,delta){
  const p=raw(a,d,t),rd=divided(dot(p,d),r),numerator=minus(sum(d.map(squared)),squared(rd));
  // r''=(||d||²-r'²)/r >=0 by Cauchy-Schwarz. Intersect with that proven
  // range; an inconsistent negative upper bound is an arithmetic refusal.
  if(numerator[1]<0)unavailable('arithmetic-unresolved','Norm derivative enclosure contradicts nonnegative curvature.');
  const rdd=divided(I(Math.max(0,numerator[0]),numerator[1]),r),direct=minus(r,p[3]),product=times(r,delta);
  const h=I(Math.max(direct[0],product[0]),Math.min(direct[1],product[1]));if(h[0]<=0)unavailable('denominator-unresolved','No positive whole-interval stereographic denominator is established.');
  const inverse=jetInverse(jet(h,minus(rd,d[3]),rdd));return p.slice(0,3).map((v,i)=>jetTimes(jet(v,d[i]),inverse));
}
function cameraSettings(camera){
  if(!camera||!['orthographic','perspective'].includes(camera.projection))throw new TypeError('Use an orthographic or perspective observer camera.');
  if(!Array.isArray(camera.worldToCamera)||camera.worldToCamera.length!==3)throw new TypeError('Camera requires three affine rows: x, y and POSITIVE eye depth.');
  const rows=camera.worldToCamera.map(row=>point(row,4,'Camera row'));
  for(const field of ['scaleX','scaleY'])if(!Number.isFinite(camera[field])||camera[field]<=0)throw new RangeError('Camera CSS pixel scales must be finite and positive.');
  const near=camera.near??0,far=camera.far??null;if(!Number.isFinite(near)||near<0||camera.projection==='perspective'&&near<=0||far!==null&&(!Number.isFinite(far)||far<=near))throw new RangeError('Camera clipping requires finite nonnegative near and optional larger far; perspective near must be positive.');
  return {projection:camera.projection,worldToCamera:rows,scaleX:camera.scaleX,scaleY:camera.scaleY,near,far};
}
function cameraJets(world,camera){return camera.worldToCamera.map(row=>world.reduce((value,j,i)=>jetPlus(value,jetTimes(j,jet(I(row[i])))),jet(I(row[3]))));}
function errorBound(jets,width){const second=jets.map(j=>extent(j.dd));const factor=divided(squared(I(width)),I(8));return {second,upper:times(factor,norm(second.map(v=>I(v))))[1]};}

/** Rows map world -> (camera x, camera y, positive depth=-Three camera z).
 * scaleX=CSSwidth*projectionMatrix[0]/2, scaleY=CSSheight*projectionMatrix[5]/2.
 * Orthographic rows include the inverse-view translation; perspective uses the
 * same rows then divides x/y by depth. Constant viewport/principal-point offsets
 * cancel from chord error. Callers must supply the actual current camera matrix.
 * Returns no bound across pole/near/far omissions; caller must isolate intervals.
 */
export function boundStereographicArc(input){
  if(!input||typeof input!=='object')throw new TypeError('Arc bound requires an input record.');
  const sourceA=point(input.a,4,'Edge A'),sourceB=point(input.b,4,'Edge B'),t0=input.t0??0,t1=input.t1??1,poleEpsilon=input.poleEpsilon??.02,camera=cameraSettings(input.camera);
  if(!Number.isFinite(t0)||!Number.isFinite(t1)||t0<0||t1>1||t0>t1)throw new RangeError('Raw edge interval must satisfy 0<=t0<=t1<=1.');
  if(!Number.isFinite(poleEpsilon)||poleEpsilon<=0||poleEpsilon>=1)throw new RangeError('Pole cutoff must be strictly between zero and one.');
  const common={version:1,criterion:'whole-raw-edge-interval-second-derivative',rawParameterInterval:[t0,t1],poleEpsilon,source:{a:sourceA,b:sourceB},camera,wholeEdgeIntervalBound:false,wholePatchBound:false,endpointQuantizationIncluded:false,diagnostics:[],arithmetic:'outward binary64 intervals; square-root endpoints verified by enclosing squares'};
  const refusal=(status,code,message,extra={})=>freeze({...common,...extra,supported:false,status,errorBoundPixels:null,worldErrorBound:null,diagnostics:[{code,message}]});
  try{
    const {a,b,scale}=normalizedEndpoints(sourceA,sourceB),d=a.map((v,i)=>minus(b[i],v));
    const fullRadius=radiusBounds(a,d,0,1),endpointRadius=Math.max(norm(a)[1],norm(b)[1]);
    if(fullRadius[0]<=times(I(1e-12),I(endpointRadius))[1])return refusal('unsupported','source-center','An edge through or numerically unresolved near the source center has no unique radial spherical arc.');
    const r=radiusBounds(a,d,t0,t1),qw=poleRange(a,d,t0,t1,r),delta=minus(I(1),qw),evidence={powerOfTwoScale:scale,scaledRawRadiusBounds:r,poleDenominatorBounds:delta};
    if(delta[1]<poleEpsilon)return refusal('clipped','pole-clipped','The entire raw interval lies inside the stereographic pole cutoff.',evidence);
    if(delta[0]<poleEpsilon)return refusal('needs-subdivision','pole-unresolved','The interval intersects or cannot be separated from the pole cutoff; no chord bridges an omitted region.',evidence);
    const world=stereoJets(a,d,I(t0,t1),r,delta),observed=cameraJets(world,camera),depth=observed[2].v;
    evidence.depthBounds=depth;
    if(depth[1]<camera.near||camera.far!==null&&depth[0]>camera.far)return refusal('clipped','observer-clipped','The entire interval is beyond the observer near/far clipping range.',evidence);
    if(depth[0]<camera.near||camera.far!==null&&depth[1]>camera.far)return refusal('needs-subdivision','observer-depth-unresolved','Whole-interval observer depth does not establish near/far safety.',evidence);
    let pixels=observed.slice(0,2);if(camera.projection==='perspective')pixels=pixels.map(j=>jetTimes(j,jetInverse(observed[2])));
    pixels=pixels.map((j,i)=>jetTimes(j,jet(I(i?camera.scaleY:camera.scaleX))));
    const width=minus(I(t1),I(t0)); // upper width avoids under-rounding h²/8
    const worldBound=errorBound(world,width[1]),pixelBound=errorBound(pixels,width[1]);
    return freeze({...common,...evidence,supported:true,status:'bounded',wholeEdgeIntervalBound:true,errorBoundPixels:pixelBound.upper,worldErrorBound:worldBound.upper,derivativeBounds:{worldSecond:worldBound.second,pixelSecond:pixelBound.second},diagnostics:[]});
  }catch(error){if(error instanceof Unavailable)return refusal('unsupported',error.code,error.message);throw error;}
}
