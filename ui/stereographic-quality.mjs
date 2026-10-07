/** Pixel budgets for the existing S3 adaptive sampled-error criterion.
 * Orthographic conversion is linear; this is NOT a whole-arc/patch error proof.
 * No source geometry, observer pose, worker publication or GPU buffers change.
 */
export const STEREOGRAPHIC_QUALITY_DEFAULTS=Object.freeze({interactionPixels:3.5,finePixels:1,legacyTolerance:.004,maximumInteractionTolerance:.032,minimumTolerance:1e-8,idleMs:120});
const phases=['interaction','idle','capture'];
const positive=(value,label)=>{if(!Number.isFinite(value)||value<=0)throw Error(`${label} must be positive and finite.`);return value;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function cameraMetrics(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Stereographic quality requires observer metrics.');
  const cameraProjection=input.cameraProjection??'orthographic',cssHeight=positive(input.cssHeight,'Viewport CSS height');
  if(!['orthographic','perspective'].includes(cameraProjection))throw Error('Unsupported observer camera projection.');
  if(cameraProjection==='perspective')return {cameraProjection,cssHeight};
  const orthographicHalfHeight=positive(input.orthographicHalfHeight,'Orthographic half-height'),zoom=positive(input.zoom??1,'Observer zoom');
  const cssPixelsPerWorldUnit=(cssHeight/2)*(zoom/orthographicHalfHeight);
  if(!Number.isFinite(cssPixelsPerWorldUnit)||cssPixelsPerWorldUnit<=0)throw Error('Orthographic world-to-CSS scale exceeds finite precision.');
  return {cameraProjection,cssHeight,orthographicHalfHeight,zoom,cssPixelsPerWorldUnit};
}

/** Upper conversion of a sampled Euclidean 3D point-to-segment/plane error.
 * The 2D orthographic operator norm is H*zoom/(2*halfHeight), independently
 * of observer orientation and CSS aspect. Physical/device pixels are not CSS.
 */
export function orthographicCriterionPixels(worldError,metrics){
  if(!Number.isFinite(worldError)||worldError<0)throw Error('Sampled world error must be finite and nonnegative.');
  const camera=cameraMetrics(metrics);if(camera.cameraProjection!=='orthographic')throw Error('Perspective pixel error requires actual depth/frustum analysis.');
  const pixels=worldError*camera.cssPixelsPerWorldUnit;
  if(!Number.isFinite(pixels))throw Error('Sampled CSS error exceeds finite precision.');return pixels;
}

export function planStereographicQuality(input,options={}){
  const camera=cameraMetrics(input),phase=input.phase??'idle';if(!phases.includes(phase))throw Error('Stereographic quality phase is unsupported.');
  const interactionPixels=options.interactionPixels??STEREOGRAPHIC_QUALITY_DEFAULTS.interactionPixels,finePixels=options.finePixels??STEREOGRAPHIC_QUALITY_DEFAULTS.finePixels;
  if(!Number.isFinite(interactionPixels)||interactionPixels<3||interactionPixels>4)throw Error('Interaction criterion must be between 3 and 4 CSS pixels.');
  if(!Number.isFinite(finePixels)||finePixels<=0||finePixels>1)throw Error('Fine criterion must be positive and at most 1 CSS pixel.');
  const targetPixels=phase==='interaction'?interactionPixels:finePixels,diagnostics=[];
  let tolerance=STEREOGRAPHIC_QUALITY_DEFAULTS.legacyTolerance,criterionPixels=null,budgetSatisfied=null,requestedTolerance=null;
  if(camera.cameraProjection==='orthographic'){
    const requested=targetPixels/camera.cssPixelsPerWorldUnit;requestedTolerance=Number.isFinite(requested)?requested:null;
    const ceiling=phase==='interaction'?STEREOGRAPHIC_QUALITY_DEFAULTS.maximumInteractionTolerance:STEREOGRAPHIC_QUALITY_DEFAULTS.legacyTolerance;
    tolerance=Math.max(STEREOGRAPHIC_QUALITY_DEFAULTS.minimumTolerance,Math.min(ceiling,requested));
    if(requestedTolerance===null)diagnostics.push('The unclamped world criterion exceeds finite precision; a stricter bounded tolerance is used.');
    criterionPixels=tolerance*camera.cssPixelsPerWorldUnit;budgetSatisfied=criterionPixels<=targetPixels*(1+1e-12);
    if(!budgetSatisfied)diagnostics.push('The numerical tolerance floor cannot meet the requested sampled pixel criterion; no successful pixel-budget claim is made.');
  }else diagnostics.push('Perspective retains world tolerance 0.004. No depth-independent CSS error guarantee is available; actual depth/frustum analysis is required.');
  return freeze({...camera,phase,tolerance,targetPixels,requestedTolerance,criterionPixels,budgetSatisfied,
    pixelBound:camera.cameraProjection==='orthographic'?'orthographic-criterion-conversion':'unavailable',
    criterion:'adaptive-sampled-world-error',wholePrimitiveBound:false,
    poleEpsilon:.02,diagnostics});
}

function canonical(value){
  let visits=0;const seen=new Set();
  function encode(item,depth){
    if(++visits>4096||depth>12)throw Error('Frame snapshot key exceeds its resource bound.');
    if(item===null||typeof item==='boolean')return JSON.stringify(item);
    if(typeof item==='number'){if(!Number.isFinite(item))throw Error('Frame snapshot contains a nonfinite value.');return JSON.stringify(item);}
    if(typeof item==='string'){if(item.length>4096)throw Error('Frame snapshot string exceeds its bound.');return JSON.stringify(item);}
    if(typeof item!=='object'||seen.has(item))throw Error('Frame snapshot must be bounded finite JSON without cycles.');
    const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
    if(prototype!==(array?Array.prototype:Object.prototype)&&prototype!==null)throw Error('Frame snapshot must contain plain JSON records.');
    const descriptors=Object.getOwnPropertyDescriptors(item);if(Object.values(descriptors).some(d=>d.get||d.set))throw Error('Frame snapshot accessors are unsupported.');
    seen.add(item);let result;
    if(array){if(Object.keys(item).length!==item.length)throw Error('Frame snapshot arrays must be dense.');result='['+item.map(x=>encode(x,depth+1)).join(',')+']';}
    else result='{'+Object.keys(item).sort().map(k=>JSON.stringify(k)+':'+encode(descriptors[k].value,depth+1)).join(',')+'}';
    seen.delete(item);return result;
  }
  const result=encode(value,0);if(result.length>32768)throw Error('Frame snapshot key exceeds its byte bound.');return result;
}

/** Stable source keys bind model ID plus validated source fingerprint. Frame
 * descriptors should include angles/frame, masks, shrink/explosion, projection
 * and observer/viewport fields relevant to requested display quality. This
 * helper does not establish that a supplied fingerprint certifies geometry.
 */
export function stereographicSnapshotKeys(source,frame){
  if(!source||source.modelId!==null&&(typeof source.modelId!=='string'||source.modelId.length>512)||typeof source.sourceFingerprint!=='string'||!/^[0-9a-f]{64}$/.test(source.sourceFingerprint))throw Error('Source snapshot requires a bounded model ID and validated fingerprint.');
  return freeze({sourceKey:JSON.stringify([source.modelId,source.sourceFingerprint]),frameKey:canonical(frame)});
}
function snapshotKeys(snapshot){
  if(!snapshot||typeof snapshot.sourceKey!=='string'||!snapshot.sourceKey.length||snapshot.sourceKey.length>4096||typeof snapshot.frameKey!=='string'||!snapshot.frameKey.length||snapshot.frameKey.length>32768)throw Error('Quality requests require bounded source and frame snapshot keys.');
  return {sourceKey:snapshot.sourceKey,frameKey:snapshot.frameKey};
}

/** A deterministic scheduler only. Consumers must separately await/validate
 * exact worker publication for capture, and retain last-published picking.
 */
export class StereographicQualityCoordinator {
  constructor({now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onRequest=()=>{},idleMs=STEREOGRAPHIC_QUALITY_DEFAULTS.idleMs,qualityOptions={}}={}){
    if(typeof now!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||typeof onRequest!=='function'||!Number.isFinite(idleMs)||idleMs<50||idleMs>1000)throw Error('Invalid stereographic quality scheduler.');
    this.now=now;this.setTimer=setTimer;this.clearTimer=clearTimer;this.onRequest=onRequest;this.idleMs=idleMs;this.qualityOptions={...qualityOptions};this.generation=0;this.timerTicket=0;this.request=null;this.destroyed=false;
  }
  assertAlive(){if(this.destroyed)throw Error('Stereographic quality coordinator was destroyed.');}
  clearIdle(){this.timerTicket++;if(this.timer!==undefined)this.clearTimer(this.timer);this.timer=undefined;}
  emit(snapshot,camera,phase){
    const keys=snapshotKeys(snapshot),quality=planStereographicQuality({...camera,phase},this.qualityOptions),signature=JSON.stringify([keys,quality]);
    if(this.signature===signature&&this.request)return this.request;
    this.signature=signature;const request=freeze({...keys,token:++this.generation,phase,quality});this.request=request;this.onRequest(request);return request;
  }
  interact(snapshot,camera){
    this.assertAlive();snapshotKeys(snapshot);planStereographicQuality({...camera,phase:'interaction'},this.qualityOptions);
    const time=this.now();if(!Number.isFinite(time))throw Error('Quality scheduler clock must be finite.');
    this.clearIdle();const request=this.emit(snapshot,camera,'interaction');if(!this.isCurrent(request))return request;
    const ticket=this.timerTicket,keys={sourceKey:request.sourceKey,frameKey:request.frameKey},ownedCamera={...camera},deadline=time+this.idleMs;
    const refine=()=>{
      if(this.destroyed||ticket!==this.timerTicket||!this.isCurrent(request))return;
      const currentTime=this.now();if(!Number.isFinite(currentTime))return;
      if(currentTime<deadline){this.timer=this.setTimer(refine,deadline-currentTime);return;}
      this.timer=undefined;this.emit(keys,ownedCamera,'idle');
    };
    this.timer=this.setTimer(refine,this.idleMs);return request;
  }
  idle(snapshot,camera){this.assertAlive();snapshotKeys(snapshot);planStereographicQuality({...camera,phase:'idle'},this.qualityOptions);this.clearIdle();return this.emit(snapshot,camera,'idle');}
  capture(snapshot,camera){this.assertAlive();snapshotKeys(snapshot);planStereographicQuality({...camera,phase:'capture'},this.qualityOptions);this.clearIdle();this.signature=null;return this.emit(snapshot,camera,'capture');}
  isCurrent(request){return !this.destroyed&&Boolean(this.request)&&request?.token===this.generation&&request.sourceKey===this.request.sourceKey&&request.frameKey===this.request.frameKey&&request.phase===this.request.phase&&request.quality===this.request.quality;}
  cancel(){this.clearIdle();this.generation++;this.request=null;this.signature=null;}
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;}
}
