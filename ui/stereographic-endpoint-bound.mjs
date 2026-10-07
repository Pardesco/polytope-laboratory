/** Conservative endpoint-to-Float32 screen displacement, CPU camera scope.
 * Separate from the frozen whole-curve bound: GPU uniforms/matrix operations,
 * rasterization, line width and surface patches are explicitly unqualified.
 */
import {boundStereographicArc,nextFloatUp,nextFloatDown} from './stereographic-arc-bound.mjs';
const TYPED=Object.getPrototypeOf(Float32Array.prototype),typedBuffer=Object.getOwnPropertyDescriptor(TYPED,'buffer').get,typedLength=Object.getOwnPropertyDescriptor(TYPED,'length').get;

class Refusal extends Error{}
const refuse=message=>{throw new Refusal(message);};
const I=(lo,hi=lo)=>{if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)refuse('A finite endpoint arithmetic enclosure is unavailable.');return [lo,hi];};
const zero=a=>a[0]===0&&a[1]===0;
const neg=a=>[-a[1],-a[0]];
function add(a,b){if(zero(a))return [...b];if(zero(b))return [...a];if(a[0]===a[1]&&b[0]===b[1]&&a[0]===-b[0])return I(0);return I(nextFloatDown(a[0]+b[0]),nextFloatUp(a[1]+b[1]));}
const sub=(a,b)=>add(a,neg(b));
function mul(a,b){if(zero(a)||zero(b))return I(0);const p=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return I(nextFloatDown(Math.min(...p)),nextFloatUp(Math.max(...p)));}
function square(a){if(zero(a))return I(0);const max=Math.max(Math.abs(a[0]),Math.abs(a[1])),min=a[0]<=0&&a[1]>=0?0:Math.min(Math.abs(a[0]),Math.abs(a[1]));return I(min===0?0:Math.max(0,nextFloatDown(min*min)),nextFloatUp(max*max));}
function div(a,b){if(b[0]<=0&&b[1]>=0)refuse('Endpoint quotient denominator contains zero.');return mul(a,I(nextFloatDown(1/b[1]),nextFloatUp(1/b[0])));}
function rootScalar(x){
  if(x===0)return I(0);let lo=Math.sqrt(x),hi=lo;
  if(!Number.isFinite(lo)||lo<=0)refuse('Endpoint square-root enclosure is unavailable.');
  for(let i=0;i<16;i++){
    const lower=square(I(lo))[1]<=x,upper=square(I(hi))[0]>=x;
    if(lower&&upper)return I(lo,hi);if(!lower)lo=nextFloatDown(lo);if(!upper)hi=nextFloatUp(hi);
  }
  refuse('Endpoint square-root enclosure could not be verified.');
}
function root(a){if(a[0]<0)refuse('Endpoint squared norm became negative.');return I(rootScalar(a[0])[0],rootScalar(a[1])[1]);}
const sum=values=>values.reduce(add,I(0));
const norm=values=>root(sum(values.map(square)));
const extent=a=>Math.max(Math.abs(a[0]),Math.abs(a[1]));
const frozen=o=>{if(o&&typeof o==='object'&&!ArrayBuffer.isView(o)){Object.values(o).forEach(frozen);Object.freeze(o);}return o;};
function cameraPoint(world,camera){
  const observed=camera.worldToCamera.map(row=>sum([I(row[3]),...world.map((x,i)=>mul(x,I(row[i])))])),depth=observed[2];
  if(depth[0]<camera.near||camera.far!==null&&depth[1]>camera.far)refuse('Endpoint depth enclosure crosses the observer near/far range.');
  let screen=observed.slice(0,2);if(camera.projection==='perspective')screen=screen.map(x=>div(x,depth));
  return {screen:screen.map((x,i)=>mul(x,I(i?camera.scaleY:camera.scaleX))),depth};
}

/** a,b are prepared Float64 coordinates. t is the original raw parameter.
 * Optional packedPosition supplies the actual existing Float32 endpoint bytes;
 * these receive their own displacement/clipping bounds, not a substituted point.
 * positions is a NEW owned Float32Array, never a borrowed/detached source.
 * The frozen wrapper cannot make typed-array elements immutable.
 */
export function boundStereographicEndpoint(input){
  let supplied=null;
  if(input?.packedPosition!==undefined){
    const value=input.packedPosition;
    if(!(value instanceof Float32Array)||Object.getPrototypeOf(value)!==Float32Array.prototype)
      throw TypeError('Supplied packed endpoint requires three privately owned Float32 coordinates.');
    const buffer=typedBuffer.call(value);
    if(!(buffer instanceof ArrayBuffer)||Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||Reflect.ownKeys(buffer).length||buffer.resizable===true)throw TypeError('Supplied packed endpoint requires three privately owned Float32 coordinates.');
    try{new DataView(buffer,0,0);}catch{throw TypeError('Supplied packed endpoint has a detached buffer.');}
    if(typedLength.call(value)!==3||Reflect.ownKeys(value).some(key=>typeof key!=='string'||String(Number(key))!==key))throw TypeError('Supplied packed endpoint requires three privately owned Float32 coordinates.');
    supplied=new Float32Array(3);for(let i=0;i<3;i++)supplied[i]=value[i];
    if(!Array.from(supplied).every(Number.isFinite))throw TypeError('Supplied packed endpoint requires finite Float32 coordinates.');
  }
  const t=input?.t??0,checked=boundStereographicArc({...input,t0:t,t1:t});
  const common={version:1,t,source:checked.source,camera:checked.camera,suppliedPackedPosition:supplied!==null,endpointQuantizationIncluded:false,gpuArithmeticIncluded:false,rasterizationIncluded:false,wholePatchBound:false};
  const failure=(message,status='needs-subdivision')=>frozen({...common,supported:false,status,errorBoundPixels:null,positions:null,diagnostics:[{code:'endpoint-unresolved',message}]});
  if(!checked.supported)return frozen({...common,supported:false,status:checked.status,errorBoundPixels:null,positions:null,diagnostics:checked.diagnostics});
  try{
    const scale=checked.powerOfTwoScale,a=checked.source.a.map(x=>I(x/scale)),b=checked.source.b.map(x=>I(x/scale));
    // Scaling is exact because the frozen bound verified coordinate roundtrips.
    const p=a.map((x,i)=>add(x,mul(sub(b[i],x),I(t)))),radius=norm(p),denominator=sub(radius,p[3]);
    if(denominator[0]<=0)refuse('Endpoint stereographic denominator is unresolved.');
    const delta=sub(I(1),div(p[3],radius));
    if(delta[0]<checked.poleEpsilon)refuse('Endpoint enclosure intersects the stereographic pole cutoff.');
    const world=p.slice(0,3).map(x=>div(x,denominator)),observed=cameraPoint(world,checked.camera);
    // Qualify actual existing buffer bytes when supplied. Choosing our own
    // midpoint does not certify a different renderer's Float32 conversion.
    const positions=supplied??new Float32Array(world.map(x=>x[0]/2+x[1]/2));
    if(!Array.from(positions).every(Number.isFinite))return failure('Packed Float32 endpoint positions overflow.','unsupported');
    const packed=cameraPoint(Array.from(positions,x=>I(x)),checked.camera);
    const screenDifference=observed.screen.map((x,i)=>sub(x,packed.screen[i]));
    const errorBoundPixels=norm(screenDifference.map(x=>I(extent(x))))[1];
    return frozen({...common,supported:true,status:'bounded',endpointQuantizationIncluded:true,errorBoundPixels,positions,
      mathematicalWorldBounds:world,mathematicalScreenBounds:observed.screen,packedScreenBounds:packed.screen,
      mathematicalDepthBounds:observed.depth,packedDepthBounds:packed.depth,diagnostics:[],
      arithmetic:'outward binary64 intervals; verified square roots; supplied camera coefficients; no GPU arithmetic certificate'});
  }catch(error){if(error instanceof Refusal)return failure(error.message);throw error;}
}
