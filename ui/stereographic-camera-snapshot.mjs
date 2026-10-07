/** Detached observer snapshot for the isolated CPU whole-edge bound.
 * Three stores Matrix4.elements column-major:
 * https://threejs.org/docs/pages/Matrix4.html
 * The view matrix is camera.matrixWorldInverse:
 * https://threejs.org/docs/pages/Camera.html
 * Callers update world/projection matrices BEFORE capture; this function never
 * repairs/rebuilds a custom projection and thereby conceals unsupported input.
 */
import {nextFloatUp,nextFloatDown} from './stereographic-arc-bound.mjs';
const TYPED=Object.getPrototypeOf(Float32Array.prototype),typedBuffer=Object.getOwnPropertyDescriptor(TYPED,'buffer').get,typedLength=Object.getOwnPropertyDescriptor(TYPED,'length').get;

const IDENTITY=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const positive=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw RangeError(`${label} must be finite and positive.`);return value;};
function matrix(value,label){
  const entries=value?.elements??value;
  const array=Array.isArray(entries);
  if(!array&&Object.getPrototypeOf(entries??{})!==Float64Array.prototype&&Object.getPrototypeOf(entries??{})!==Float32Array.prototype)throw TypeError(`${label} requires 16 finite column-major entries.`);
  if(array){
    if(entries.length!==16)throw TypeError(`${label} requires 16 finite column-major entries.`);
    if(Object.values(Object.getOwnPropertyDescriptors(entries)).some(d=>d.get||d.set))throw TypeError(`${label} cannot contain accessors.`);
  }else{
    const buffer=typedBuffer.call(entries);
    if(Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||Reflect.ownKeys(buffer).length||buffer.resizable===true)throw TypeError(`${label} requires an ordinary nonresizable buffer.`);
    try{new DataView(buffer,0,0);}catch{throw TypeError(`${label} buffer is detached.`);}
    if(typedLength.call(entries)!==16)throw TypeError(`${label} requires 16 finite column-major entries.`);
    if(Reflect.ownKeys(entries).some(key=>typeof key!=='string'||String(Number(key))!==key))throw TypeError(`${label} requires an ordinary typed array.`);
  }
  // Read exactly sixteen bounded entries; caller iterators/copy methods are
  // unnecessary and cannot replace the detached mathematical coefficients.
  const copy=[];
  for(let i=0;i<16;i++){
    const x=array?Object.getOwnPropertyDescriptor(entries,String(i))?.value:entries[i];
    if(typeof x!=='number'||!Number.isFinite(x))throw TypeError(`${label} requires 16 finite column-major entries.`);
    copy.push(x);
  }
  return copy.map(x=>x===0?0:x);
}
const affine=m=>m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;
function multiply(a,b){
  const out=[];
  for(let column=0;column<4;column++)for(let row=0;row<4;row++){
    const value=a[row]*b[column*4]+a[row+4]*b[column*4+1]+a[row+8]*b[column*4+2]+a[row+12]*b[column*4+3];
    if(!Number.isFinite(value))return null;out.push(value===0?0:value);
  }
  return out;
}
const add=(a,b)=>a[0]===a[1]&&b[0]===b[1]&&a[0]===-b[0]?[0,0]:[nextFloatDown(a[0]+b[0]),nextFloatUp(a[1]+b[1])];
function divide(a,b){
  if(b[0]<=0&&b[1]>=0)return null;
  const inverse=[nextFloatDown(1/b[1]),nextFloatUp(1/b[0])],products=[a[0]*inverse[0],a[0]*inverse[1],a[1]*inverse[0],a[1]*inverse[1]];
  const out=[nextFloatDown(Math.min(...products)),nextFloatUp(Math.max(...products))];return out.every(Number.isFinite)?out:null;
}
function depthPlanes(p,projection){
  const near=projection==='perspective'?divide([p[14],p[14]],add([p[10],p[10]],[-1,-1])):divide(add([p[14],p[14]],[1,1]),[p[10],p[10]]);
  const far=projection==='perspective'?divide([p[14],p[14]],add([p[10],p[10]],[1,1])):divide(add([p[14],p[14]],[-1,-1]),[p[10],p[10]]);
  return near&&far?{near,far}:null;
}

/** descriptor.worldToCamera maps PRE-GROUP 3D stereographic coordinates to
 * camera x/y and POSITIVE eye depth=-cameraZ using Float64-composed V*G rows.
 * descriptor.scaleX=CSSwidth*P[0]/2 and scaleY=CSSheight*P[5]/2.
 * cssOffset gives actual top-left CSS coordinates:
 *   [scaleX*x/depth + offsetX, -scaleY*y/depth + offsetY] (perspective)
 *   [scaleX*x + offsetX, -scaleY*y + offsetY] (orthographic).
 * Constant principal offsets cancel from chord error. Clip bounds intersect
 * nominal camera bounds with inward enclosures of the actual WebGL P planes.
 * Prepared Float64 coefficient/composition rounding is NOT certified against
 * ideal real transforms; GPU Float32/shader/raster arithmetic is unqualified.
 * Runtime integration remains open: even an ordinary Three matrix inverse can
 * round its homogeneous bottom-right entry away from 1. Such cameras receive
 * an explicit unsupported record here; no row normalization is concealed.
 */
export function captureStereographicCamera({camera,cssWidth,cssHeight,groupMatrixWorld=null}={}){
  const width=positive(cssWidth,'Viewport CSS width'),height=positive(cssHeight,'Viewport CSS height');
  if(!camera||typeof camera!=='object')throw TypeError('A current observer camera is required.');
  const inverseView=matrix(camera.matrixWorldInverse,'Inverse view matrix'),projectionMatrix=matrix(camera.projectionMatrix,'Projection matrix'),group=groupMatrixWorld===null?[...IDENTITY]:matrix(groupMatrixWorld,'Group world matrix');
  const kind=camera.isPerspectiveCamera===true&&camera.isOrthographicCamera!==true?'perspective':camera.isOrthographicCamera===true&&camera.isPerspectiveCamera!==true?'orthographic':'unsupported';
  if(typeof camera.near!=='number'||!Number.isFinite(camera.near)||typeof camera.far!=='number'||!Number.isFinite(camera.far))throw RangeError('Camera near/far must be finite.');
  const evidence={version:1,projection:kind,cssSize:{width,height},inverseViewMatrix:inverseView,groupMatrixWorld:group,projectionMatrix,nominalNear:camera.near,nominalFar:camera.far};
  const unsupported=(code,message)=>freeze({...evidence,supported:false,status:'unsupported',descriptor:null,signature:JSON.stringify(evidence),diagnostics:[{code,message}],gpuArithmeticIncluded:false,rasterizationIncluded:false,idealTransformRoundingIncluded:false});
  if(kind==='unsupported')return unsupported('camera-kind','Use one ordinary Three orthographic or perspective observer camera.');
  if(camera.near<0||kind==='perspective'&&camera.near<=0||camera.far<=camera.near)return unsupported('clip-range','Observer clipping requires a nonnegative near and larger finite far; perspective near must be positive.');
  if(!affine(inverseView)||!affine(group))return unsupported('non-affine-transform','The CPU bound currently requires camera/group affine bottom rows [0,0,0,1]; projective or non-unit homogeneous rows are unsupported.');
  const p=projectionMatrix,zeroSlots=kind==='perspective'?[1,2,3,4,6,7,12,13,15]:[1,2,3,4,6,7,8,9,11];
  if(zeroSlots.some(i=>p[i]!==0)||p[0]<=0||p[5]<=0||kind==='perspective'&&p[11]!==-1||kind==='orthographic'&&p[15]!==1)
    return unsupported('projection-form','Skew, oblique, reversed-axis and nonstandard homogeneous projection forms are unsupported.');
  const range=camera.far-camera.near,expectedZ=kind==='perspective'?-(camera.far+camera.near)/range:-2/range,expectedW=kind==='perspective'?(-2*camera.far*camera.near)/range:-(camera.far+camera.near)/range;
  if(p[10]!==expectedZ||p[14]!==expectedW)return unsupported('projection-depth','Actual projection depth coefficients differ from ordinary nonreversed WebGL near/far coefficients; update matrices or use a supported camera.');
  const planes=depthPlanes(p,kind);if(!planes)return unsupported('clip-arithmetic','Finite enclosing projection-depth planes could not be established.');
  const near=Math.max(camera.near,planes.near[1]),far=Math.min(camera.far,planes.far[0]);
  if(!Number.isFinite(near)||!Number.isFinite(far)||near>=far)return unsupported('clip-arithmetic','Inward projection-depth clipping bounds are unresolved.');
  const composed=multiply(inverseView,group);if(!composed)return unsupported('camera-arithmetic','Composed camera/group coefficients exceed finite precision.');
  const scaleX=width*p[0]/2,scaleY=height*p[5]/2,principalOffset=kind==='perspective'?[-p[8],-p[9]]:[p[12],p[13]],cssOffset=[width/2+width*principalOffset[0]/2,height/2-height*principalOffset[1]/2];
  if(![scaleX,scaleY,...cssOffset].every(Number.isFinite)||scaleX<=0||scaleY<=0)return unsupported('camera-arithmetic','Camera CSS scales/offsets exceed finite precision.');
  const descriptor={projection:kind,worldToCamera:[[composed[0],composed[4],composed[8],composed[12]],[composed[1],composed[5],composed[9],composed[13]],[-composed[2],-composed[6],-composed[10],-composed[14]]],scaleX,scaleY,near,far};
  const owned={...evidence,composedMatrix:composed,projectionDepthPlanes:planes,descriptor,ndcPrincipalOffset:principalOffset,cssOffset,
    clipConvention:'ordinary WebGL NDC depth [-1,1]; positive camera depth=-z',clippingPolicy:'inward projection-plane enclosure intersected with nominal near/far'};
  return freeze({...owned,supported:true,status:'supported',signature:JSON.stringify(owned),diagnostics:[],gpuArithmeticIncluded:false,rasterizationIncluded:false,idealTransformRoundingIncluded:false});
}
