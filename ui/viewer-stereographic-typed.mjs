/** Concrete renderer adapter for owned decoded worker output. Only explicit
 * compatibility iteration/picking materializes individual records; publication
 * itself retains packed buffers. No borrowed geometry array is written.
 */
import {createStereographicTypedDisplay,typedDisplayBounds} from './stereographic-typed-display.mjs';
import {PRESENTATION_LIMITS} from './entity-presentation.mjs';

function lazyRecords(length,at){
  const methods={length,at(i){if(i<0)i+=length;return Number.isInteger(i)&&i>=0&&i<length?at(i):undefined;},
    forEach(fn,context){for(let i=0;i<length;i++)fn.call(context,at(i),i,this);},
    every(fn,context){for(let i=0;i<length;i++)if(!fn.call(context,at(i),i,this))return false;return true;},
    [Symbol.iterator]:function*(){for(let i=0;i<length;i++)yield at(i);}};
  return new Proxy(Object.freeze(methods),{get(target,key,receiver){if(typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)){const i=Number(key);return i<length?at(i):undefined;}return Reflect.get(target,key,receiver);},set(){throw Error('Published primitive records are read-only.');}});
}

export function typedStereographicPublication(publication,snapshot,isCurrent){
  const packed=createStereographicTypedDisplay(publication,{input:snapshot.input,snapshot:{model:snapshot.model,...snapshot.keys,generation:publication.generation,view:snapshot.view},isCurrent});
  return Object.freeze({packed,typed:packed,edges:lazyRecords(packed.counts.segments,i=>packed.edgeAt(i)),triangles:lazyRecords(packed.counts.patches,i=>packed.patchAt(i)),pickingTriangles:lazyRecords(packed.counts.patches,i=>packed.patchOwnerAt(i)),diagnostics:packed.diagnostics,unresolvedEdges:packed.resolution.edges.unresolved,unresolvedTriangles:packed.resolution.patches.unresolved,clippedSegments:packed.clippedSegments,clippedTriangles:packed.clippedTriangles,tolerance:packed.achievedTolerance,poleEpsilon:.02,complete:packed.complete,phase:packed.phase,bounds:typedDisplayBounds(packed)});
}

/** Same primitive semantics as primitiveInstances, without expanding all arcs
 * when lines are used or when the cylinder cap is exceeded. IDs are native.
 */
export function packedPrimitiveInstances(packed,{spheres=false,cylinders=false,limits=PRESENTATION_LIMITS}={}){
  const vertices=[],edges=[],diagnostics=[];let vertexCount=0,edgeCount=0,collapsedEdges=0;
  if(spheres)for(let i=0;i<packed.vertexIds.length;i++)if(packed.vertexVisible[i]){vertexCount++;if(vertexCount<=limits.spheres)vertices.push({vertex:packed.vertexIds[i],point:Array.from(packed.positions.subarray(i*3,i*3+3))});}
  if(cylinders)for(let i=0;i<packed.edgeIds.length;i++){
    const offset=i*6,a=packed.segments,dx=a[offset+3]-a[offset],dy=a[offset+4]-a[offset+1],dz=a[offset+5]-a[offset+2],length=Math.hypot(dx,dy,dz);
    if(length<=1e-12){collapsedEdges++;continue;}edgeCount++;
    if(edgeCount<=limits.cylinders)edges.push({edge:packed.edgeIds[i],midpoint:[(a[offset]+a[offset+3])/2,(a[offset+1]+a[offset+4])/2,(a[offset+2]+a[offset+5])/2],direction:[dx/length,dy/length,dz/length],length});
  }
  const sphereSupported=vertexCount<=limits.spheres,cylinderSupported=edgeCount<=limits.cylinders;
  if(!sphereSupported){vertices.length=0;diagnostics.push('Sphere instance resource limit exceeded; using source points.');}
  if(!cylinderSupported){edges.length=0;diagnostics.push('Cylinder instance resource limit exceeded; using source lines.');}
  return {vertices,edges,sphereSupported,cylinderSupported,collapsedEdges,diagnostics};
}

/** Hidden points are filtered by draw indices, never sentinel writes into the
 * borrowed position buffer. Instance slots remain available for source picking.
 */
export function packedVisiblePointIndices(packed){let count=0;for(const bit of packed.vertexVisible)count+=bit;const indices=new Uint32Array(count);let k=0;for(let i=0;i<packed.vertexVisible.length;i++)if(packed.vertexVisible[i])indices[k++]=i;return indices;}

/** Allocation is deliberately explicit for user-requested Fit/cloud inspection;
 * automatic per-frame bounds use packed.bounds and never call this helper.
 */
export function packedObservationCloud(packed){const points=[];for(let i=0;i<packed.vertexVisible.length;i++)if(packed.vertexVisible[i])points.push(Array.from(packed.positions.subarray(i*3,i*3+3)));for(const array of [packed.segments,packed.triangles])for(let i=0;i<array.length;i+=3)points.push(Array.from(array.subarray(i,i+3)));return points;}
