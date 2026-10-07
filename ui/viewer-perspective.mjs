/** Bounded source-referenced 4D near-plane clipping for the viewport. */
import {rotate} from './projection.js';
import {applyDisplayFrame} from './display-frame.mjs';
import {perspective4DSettings,perspectiveSegment4D,perspectiveTriangle4D} from './perspective4d.mjs';

export const PERSPECTIVE_VIEW_LIMITS=Object.freeze({segments:100000,triangles:250000,inputEdges:100000,inputTriangles:125000});
export function perspectiveDisplayGeometry(normalized,sourceEdges,sourceTriangles,visibility,matrix,angles=[],options={},limits=PERSPECTIVE_VIEW_LIMITS){
  const settings=perspective4DSettings({...options,scale:'equatorial'}),transformed=normalized.map(p=>rotate(applyDisplayFrame(p,matrix),angles));
  const edges=[],triangles=[],diagnostics=new Set();let clippedEdges=0,clippedTriangles=0,omittedEdges=0,omittedTriangles=0,visitedEdges=0,visitedTriangles=0;
  for(let edge=0;edge<sourceEdges.length;edge++){
    if(!visibility.edges[edge])continue;
    if(++visitedEdges>limits.inputEdges||edges.length>=limits.segments){diagnostics.add('4D perspective edge geometry resource limit reached; remaining source segments were omitted.');break;}
    const [a,b]=sourceEdges[edge],result=perspectiveSegment4D(transformed[a],transformed[b],settings);
    result.segments.forEach(segment=>edges.push({...segment,edge}));if(result.clipped)clippedEdges++;if(result.omitted)omittedEdges++;result.diagnostics.forEach(d=>diagnostics.add(d));
  }
  for(let id=0;id<sourceTriangles.length;id++){
    const source=sourceTriangles[id];if(!visibility.faces[source.face])continue;
    if(++visitedTriangles>limits.inputTriangles||triangles.length>=limits.triangles){diagnostics.add('4D perspective surface geometry resource limit reached; remaining source patches were omitted.');break;}
    const raw=source.vertices?source.vertices.map(v=>transformed[v]):source.normalized.map(p=>rotate(applyDisplayFrame(p,matrix),angles));
    const result=perspectiveTriangle4D(raw,settings);
    if(result.triangles.length>limits.triangles-triangles.length){diagnostics.add('4D perspective surface geometry resource limit reached; a complete source patch and subsequent patches were omitted.');break;}
    result.triangles.forEach(triangle=>triangles.push({...triangle,face:source.face,cell:source.cell,sourceTriangle:id}));
    if(result.clipped)clippedTriangles++;if(result.omitted)omittedTriangles++;result.diagnostics.forEach(d=>diagnostics.add(d));
  }
  return {edges,triangles,diagnostics:[...diagnostics],clippedEdges,clippedTriangles,omittedEdges,omittedTriangles,settings};
}
