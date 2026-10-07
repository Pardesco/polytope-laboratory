/** Bounded display geometry, preserving source references for every arc/patch. */
import {rotate} from './projection.js';
import {applyDisplayFrame} from './display-frame.mjs';
import {stereographicEdge,stereographicTriangle} from './stereographic.mjs';
import {sphericalSpanNormal,stereographicPatchNormals,stereographicPatchCornerOrder} from './stereographic-normals.mjs';

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
    result.triangles.forEach(points=>{const normals=stereographicPatchNormals(points,span),order=normals&&stereographicPatchCornerOrder(points,normals);if(!order){unresolvedTriangles++;diagnostics.add('A spherical patch has no stable oriented analytic normal/chord; its display triangle was omitted.');return;}triangles.push({points:order.map(k=>points[k]),normals:order.map(k=>normals[k]),renderCornerOrder:order,face:source.face,cell:source.cell,sourceTriangle:id});});
    clippedTriangles+=result.clippedTriangles;if(result.exhausted)unresolvedTriangles++;result.diagnostics.forEach(d=>diagnostics.add(d));
  }
  return {edges,triangles,diagnostics:[...diagnostics],clippedSegments,clippedTriangles,unresolvedEdges,unresolvedTriangles,tolerance,poleEpsilon};
}
