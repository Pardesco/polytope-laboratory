/** Frozen pre-mount kernel reference. Do not update to the mounted implementation.
 * Original file SHA256: 613d2645199252bedf23049912c21c0e4c75e439573e804f784a8464b446c647
 */
/** Bounded display geometry, preserving source references for every arc/patch. */
import {rotate} from '../../ui/projection.js';
import {applyDisplayFrame} from '../../ui/display-frame.mjs';
import {stereographicEdge,stereographicTriangle} from './legacy-stereographic.mjs';
import {sphericalSpanNormal,stereographicPatchNormals} from './legacy-stereographic-normals.mjs';

export const STEREO_VIEW_LIMITS=Object.freeze({segments:60000,triangles:100000,inputTriangles:2000,inputEdges:30000});
export function stereoDisplayGeometry(normalized,sourceEdges,sourceTriangles,visibility,matrix,angles=[],{
  limits=STEREO_VIEW_LIMITS,tolerance=.004,maxDepth=8,poleEpsilon=.02
}={}){
  const transformed=normalized.map(p=>rotate(applyDisplayFrame(p,matrix),angles));
  const edges=[],triangles=[],diagnostics=new Set();let clippedSegments=0,clippedTriangles=0,unresolvedEdges=0,unresolvedTriangles=0,visitedEdges=0,visitedTriangles=0;
  for(let edge=0;edge<sourceEdges.length;edge++){
    if(!visibility.edges[edge])continue;
    if(++visitedEdges>limits.inputEdges||edges.length>=limits.segments){diagnostics.add('Stereographic edge geometry resource limit reached; remaining source arcs were omitted.');break;}
    const [a,b]=sourceEdges[edge],result=stereographicEdge(transformed[a],transformed[b],{tolerance,maxDepth,poleEpsilon,maxSegments:Math.min(512,limits.segments-edges.length)});
    result.segments.forEach(segment=>edges.push({edge,a:segment.a,b:segment.b,t0:segment.t0,t1:segment.t1}));
    clippedSegments+=result.clippedSegments;if(result.exhausted)unresolvedEdges++;result.diagnostics.forEach(d=>diagnostics.add(d));
  }
  for(let id=0;id<sourceTriangles.length;id++){
    const source=sourceTriangles[id];if(!visibility.faces[source.face])continue;
    if(++visitedTriangles>limits.inputTriangles||triangles.length>=limits.triangles){diagnostics.add('Stereographic surface geometry resource limit reached; remaining source patches were omitted.');break;}
    const raw=source.vertices?source.vertices.map(v=>transformed[v]):source.normalized.map(p=>rotate(applyDisplayFrame(p,matrix),angles));
    const result=stereographicTriangle(raw,{tolerance,maxDepth,poleEpsilon,maxTriangles:Math.min(4096,limits.triangles-triangles.length)});
    const span=sphericalSpanNormal(raw);
    result.triangles.forEach(points=>{const normals=stereographicPatchNormals(points,span);if(!normals)diagnostics.add('A spherical patch has no stable analytic normal; its geometric triangle normal is used.');triangles.push({points,normals,face:source.face,cell:source.cell,sourceTriangle:id});});
    clippedTriangles+=result.clippedTriangles;if(result.exhausted)unresolvedTriangles++;result.diagnostics.forEach(d=>diagnostics.add(d));
  }
  return {edges,triangles,diagnostics:[...diagnostics],clippedSegments,clippedTriangles,unresolvedEdges,unresolvedTriangles,tolerance,poleEpsilon};
}
