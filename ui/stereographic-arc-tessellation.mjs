/** Isolated whole-edge CPU tessellation; no viewer/worker integration.
 * Every retained chord bounds the mathematical raw curve plus its endpoint
 * Float32 displacement through the supplied observer camera. Unresolved pole,
 * near/far and resource intervals are explicit omissions, never bridges.
 * Optional packedEndpoints supplies six actual Float32 coordinates at t0/t1,
 * preserving existing/shared junction bytes; interior samples are owned here.
 */
import {boundStereographicArc,nextFloatUp} from './stereographic-arc-bound.mjs';
import {boundStereographicEndpoint} from './stereographic-endpoint-bound.mjs';
const TYPED=Object.getPrototypeOf(Float32Array.prototype),typedBuffer=Object.getOwnPropertyDescriptor(TYPED,'buffer').get,typedLength=Object.getOwnPropertyDescriptor(TYPED,'length').get;

export const ARC_TESSELLATION_LIMITS=Object.freeze({segments:65536,visits:262144,depth:32});
const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw RangeError(`${label} must be an integer from ${min} to ${max}.`);return value;};
const freeze=value=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export function tessellateStereographicArc(input){
  if(!input||typeof input!=='object')throw TypeError('Arc tessellation requires a prepared edge record.');
  const tolerance=input.tolerancePixels??1;
  if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e9)throw RangeError('Pixel tolerance must be finite and positive, at most 1e9.');
  const maxSegments=integer(input.maxSegments??2048,1,ARC_TESSELLATION_LIMITS.segments,'Segment budget');
  const maxVisits=integer(input.maxVisits??8191,1,ARC_TESSELLATION_LIMITS.visits,'Visit budget');
  const maxDepth=integer(input.maxDepth??20,0,ARC_TESSELLATION_LIMITS.depth,'Subdivision depth');
  const sourceEdgeId=integer(input.sourceEdgeId??0,0,0xffffffff,'Source edge ID'),sourceInstanceId=integer(input.sourceInstanceId??sourceEdgeId,0,0xffffffff,'Source instance ID');
  let packedEndpoints=null;
  if(input.packedEndpoints!==undefined){
    const value=input.packedEndpoints;
    if(!(value instanceof Float32Array)||Object.getPrototypeOf(value)!==Float32Array.prototype)throw TypeError('Fixed edge endpoints require six privately owned Float32 coordinates.');
    const buffer=typedBuffer.call(value);
    if(!(buffer instanceof ArrayBuffer)||Object.getPrototypeOf(buffer)!==ArrayBuffer.prototype||Reflect.ownKeys(buffer).length||buffer.resizable===true)throw TypeError('Fixed edge endpoints require six privately owned Float32 coordinates.');
    try{new DataView(buffer,0,0);}catch{throw TypeError('Fixed edge endpoints have a detached buffer.');}
    if(typedLength.call(value)!==6||Reflect.ownKeys(value).some(key=>typeof key!=='string'||String(Number(key))!==key))throw TypeError('Fixed edge endpoints require six privately owned Float32 coordinates.');
    packedEndpoints=new Float32Array(6);for(let i=0;i<6;i++)packedEndpoints[i]=value[i];
    if(!Array.from(packedEndpoints).every(Number.isFinite))throw TypeError('Fixed edge endpoints must be finite.');
  }
  // Own prepared source/camera once. All subsequent evaluations use this copy.
  const initial=boundStereographicArc(input),[start,end]=initial.rawParameterInterval;
  if(packedEndpoints&&start===end&&[0,1,2].some(i=>packedEndpoints[i]!==packedEndpoints[i+3]))throw RangeError('A zero raw interval requires identical fixed packed endpoints.');
  const source={a:initial.source.a,b:initial.source.b,camera:initial.camera,poleEpsilon:initial.poleEpsilon};
  const stack=[{t0:start,t1:end,depth:0,bound:initial}],positions=[],parameters=[],errors=[],curveErrors=[],endpointErrors=[],omissions=[],clipped=[],endpoints=new Map();
  const endpointCacheLimit=Math.min(4096,maxSegments+maxDepth+2);
  let visits=0,maximumDepth=0,endpointEvaluations=0,endpointCachePeak=0;
  const endpoint=t=>{
    if(!endpoints.has(t)){
      const packedPosition=packedEndpoints?(t===start?packedEndpoints.subarray(0,3):t===end?packedEndpoints.subarray(3,6):undefined):undefined;
      const checked=boundStereographicEndpoint({...source,t,...(packedPosition?{packedPosition}:{})});endpointEvaluations++;
      // Do not retain each helper's detailed interval/source/camera evidence.
      // Cache only packed coordinates and the qualified scalar displacement;
      // a fixed cap prevents unresolved quantization floors retaining every
      // unique dyadic endpoint until the visit budget is exhausted.
      if(endpoints.size>=endpointCacheLimit)endpoints.delete(endpoints.keys().next().value);
      endpoints.set(t,{supported:checked.supported,errorBoundPixels:checked.errorBoundPixels,positions:checked.positions,diagnostics:checked.diagnostics});
      endpointCachePeak=Math.max(endpointCachePeak,endpoints.size);
    }
    return endpoints.get(t);
  };
  const omit=(node,code,message)=>omissions.push({t0:node.t0,t1:node.t1,sourceEdgeId,sourceInstanceId,depth:node.depth,code,message});
  while(stack.length){
    const node=stack.pop();maximumDepth=Math.max(maximumDepth,node.depth);
    if(visits>=maxVisits){omit(node,'visit-budget','Whole-edge visit budget exhausted.');continue;}
    if(parameters.length/2>=maxSegments){omit(node,'segment-budget','Whole-edge segment budget exhausted.');continue;}
    visits++;
    const bound=node.bound??boundStereographicArc({...source,t0:node.t0,t1:node.t1});
    if(bound.status==='clipped'){
      clipped.push({t0:node.t0,t1:node.t1,sourceEdgeId,sourceInstanceId,code:bound.diagnostics[0].code});continue;
    }
    if(bound.diagnostics.some(d=>d.code==='source-center')){omit(node,'source-center',bound.diagnostics[0].message);continue;}
    let reason=bound.diagnostics[0]?.message??'Whole-edge pixel criterion is unresolved.',code=bound.diagnostics[0]?.code??'pixel-tolerance';
    if(bound.supported){
      const a=endpoint(node.t0),b=endpoint(node.t1);
      if(a.supported&&b.supported){
        const endpointError=Math.max(a.errorBoundPixels,b.errorBoundPixels),combined=nextFloatUp(bound.errorBoundPixels+endpointError);
        if(Number.isFinite(combined)&&combined<=tolerance){
          positions.push(...a.positions,...b.positions);parameters.push(node.t0,node.t1);errors.push(combined);curveErrors.push(bound.errorBoundPixels);endpointErrors.push(endpointError);continue;
        }
        reason=Number.isFinite(combined)?'Whole-curve plus endpoint displacement exceeds the requested CSS pixel tolerance.':'Combined endpoint/curve error overflowed.';
      }else{const failure=!a.supported?a:b;reason=failure.diagnostics[0].message;code=failure.diagnostics[0].code;}
    }
    const midpoint=node.t0+(node.t1-node.t0)/2;
    if(node.depth>=maxDepth||midpoint<=node.t0||midpoint>=node.t1){omit(node,code,reason);continue;}
    // LIFO right first makes traversal deterministic in ascending raw t.
    stack.push({t0:midpoint,t1:node.t1,depth:node.depth+1},{t0:node.t0,t1:midpoint,depth:node.depth+1});
  }
  const diagnosticCounts={};for(const omission of omissions)diagnosticCounts[omission.code]=(diagnosticCounts[omission.code]??0)+1;
  return freeze({version:1,sourceEdgeId,sourceInstanceId,source:initial.source,camera:initial.camera,rawParameterInterval:[start,end],
    tolerancePixels:tolerance,segments:parameters.length/2,visits,maximumDepth,endpointEvaluations,endpointCacheLimit,endpointCachePeak,
    positions:new Float32Array(positions),parameterIntervals:new Float64Array(parameters),errorBoundsPixels:new Float64Array(errors),
    curveErrorBoundsPixels:new Float64Array(curveErrors),endpointErrorBoundsPixels:new Float64Array(endpointErrors),
    complete:omissions.length===0,fixedPackedEndpointsIncluded:packedEndpoints!==null,omissions,clippedIntervals:clipped,diagnostics:Object.entries(diagnosticCounts).map(([code,count])=>({code,count})),
    wholeRetainedEdgeIntervalsBounded:true,endpointQuantizationIncluded:true,gpuArithmeticIncluded:false,rasterizationIncluded:false,wholePatchBound:false,
    numericScope:'prepared Float64 mathematical raw path; outward CPU camera bounds with packed Float32 endpoints; shader and raster arithmetic excluded',
    typedArrayOwnership:'new owned arrays; frozen wrapper does not freeze typed-array elements; no source mutation or detachment'});
}
