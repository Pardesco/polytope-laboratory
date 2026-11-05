// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {isPrism,PRISM_APPEARANCE,PRISM_FALLBACK,PRISM_LIMITS,prismPrimitives,prismEdgeDensity} from './prism-look.mjs';
import {edgeDepthFade} from './prism-edge-fade.mjs';

function edgeTints(viewer){
  const {model,view,visibilityKey,surfaceColorTypes}=viewer,cache=viewer.prismEdgeTints;
  const edgeColor=view.appearance?.edgeColor,tint=view.appearance?.tint;
  if(cache?.model===model&&cache.visibilityKey===visibilityKey&&cache.types===surfaceColorTypes&&cache.mode===view.surfaceColors&&cache.edgeColor===edgeColor&&cache.tint===tint)return cache;
  const result={model,visibilityKey,types:surfaceColorTypes,mode:view.surfaceColors,edgeColor,tint,colors:null,color:new THREE.Color(PRISM_FALLBACK).multiply(viewer.surface.material.color).lerp(new THREE.Color('#b6d5dd'),.25)};
  viewer.prismEdgeTints=result;
  if(edgeColor&&edgeColor!==PRISM_APPEARANCE.edgeColor){result.color.set(edgeColor);return result;}
  const attribute=viewer.surfaceGeometry.getAttribute('color');if(!attribute?.count)return result;
  const triangles=viewer.renderTriangles||viewer.triangles,packed=viewer.stereographicGeometry?.packed,faces=new Map();
  for(let i=0;i<attribute.count/3;i++){
    const face=packed?packed.faceIds[i]:triangles[i]?.face;if(face===undefined||faces.has(face)||!viewer.visibility.faces[face])continue;
    const offset=i*attribute.itemSize*3;faces.set(face,new THREE.Color().fromArray(attribute.array,offset).multiply(viewer.surface.material.color).lerp(new THREE.Color('#b6d5dd'),.25));
  }
  if(!faces.size)return result;result.color.copy(faces.values().next().value);
  if(new Set([...faces.values()].map(color=>color.getHex())).size===1)return result;
  const edgeMap=new Map(model.edges.map(([a,b],i)=>[a<b?a+':'+b:b+':'+a,i])),sourceColors=new Float32Array(model.edges.length*3),seen=new Uint8Array(model.edges.length);
  for(const [face,color] of faces){const ids=model.faces[face];for(let i=0;i<ids.length;i++){
    const a=ids[i],b=ids[(i+1)%ids.length],edge=edgeMap.get(a<b?a+':'+b:b+':'+a);
    if(edge!==undefined&&!seen[edge]){color.toArray(sourceColors,edge*3);seen[edge]=1;}
  }}
  for(let i=0;i<seen.length;i++)if(!seen[i])result.color.toArray(sourceColors,i*3);
  result.colors=sourceColors;return result;
}
export function updatePrismDenseEdges(viewer,view){
  const prism=isPrism(view),count=viewer.edgeGeometry.attributes.position.count/2,dense=prism&&count>PRISM_LIMITS.tubes;
  if(viewer.prismEdges)viewer.prismEdges.visible=false;
  if(!dense){if(viewer.lines.material.userData.prismDepthFade){edgeDepthFade(viewer.lines,0);if(viewer.lines.material.vertexColors){viewer.lines.material.vertexColors=false;viewer.lines.material.needsUpdate=true;}}return;}
  const policy=prismPrimitives(view,{edges:count}),density=prismEdgeDensity(count),tints=edgeTints(viewer);
  let object=viewer.lines;
  if(policy.quadEdges){
    object=viewer.prismEdges;
    if(!object){object=new LineSegments2(new LineSegmentsGeometry(),new LineMaterial({transparent:true,depthWrite:false,depthTest:true}));object.frustumCulled=false;object.renderOrder=2;viewer.group.add(object);viewer.prismEdges=object;}
    const geometry=object.geometry,array=viewer.edgeGeometry.attributes.position.array,buffer=geometry.getAttribute('instanceStart')?.data;
    if(buffer?.array!==array){geometry.dispose();geometry.setPositions(array);geometry.getAttribute('instanceStart').data.setUsage(THREE.DynamicDrawUsage);}
    else {geometry.boundingSphere=viewer.edgeGeometry.boundingSphere;geometry.boundingBox=viewer.edgeGeometry.boundingBox;}
    geometry.getAttribute('instanceStart').data.needsUpdate=true;
    object.visible=view.edges!==false;viewer.lines.visible=false;
    object.material.linewidth=density.width*(viewer.presentation.edgeRadius/.0035);
  }
  const material=object.material,wantsColors=Boolean(tints.colors);
  if(material.vertexColors!==wantsColors){material.vertexColors=wantsColors;material.needsUpdate=true;}
  if(wantsColors){
    const ids=viewer.lines.userData.sourceEdgeIds,key=object.userData.prismTint;
    const sameIds=key?.ids?.length===ids.length&&ids.every((id,i)=>id===key.ids[i]);
    if(key?.tints!==tints||!sameIds){
      const colors=new Float32Array(count*6);for(let i=0;i<count;i++){const offset=ids[i]*3;for(let j=0;j<3;j++)colors[i*6+j]=colors[i*6+3+j]=tints.colors[offset+j];}
      const attribute=object===viewer.lines?object.geometry.getAttribute('color'):object.geometry.getAttribute('instanceColorStart')?.data;
      if(attribute?.array.length===colors.length){attribute.array.set(colors);attribute.needsUpdate=true;}
      else if(object===viewer.lines){if(attribute)object.geometry.dispose();object.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));}
      else object.geometry.setColors(colors);
      object.userData.prismTint={tints,ids:ids.slice()};
    }
    material.color.set('#ffffff');
  }else material.color.copy(tints.color);
  material.opacity=Math.max(0,Math.min(1,view.edgeOpacity??1))*density.opacity;material.transparent=true;material.depthWrite=false;
  edgeDepthFade(object,1);
}
