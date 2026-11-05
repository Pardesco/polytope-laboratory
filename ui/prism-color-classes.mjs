// SPDX-License-Identifier: GPL-3.0-only
import {PRISM_PALETTE} from './prism-look.mjs';
const cache=new WeakMap(),EPS=1e-6;
export const PRISM_CLASS_LIMITS=Object.freeze({vertices:20000,faces:100000,cells:20000,visits:1000000});
export const forgetPrismColorClasses=model=>cache.delete(model);
function pointsFor(model){
  const d=model.dimension,vertices=model.vertices;
  if(![3,4].includes(d)||(model.embeddingDimension??d)!==d||!Array.isArray(vertices)||!vertices.length||vertices.length>PRISM_CLASS_LIMITS.vertices)return null;
  const center=Array(d).fill(0);
  for(const point of vertices){if(!Array.isArray(point)||point.length!==d||point.some(x=>!Number.isFinite(x)))return null;for(let k=0;k<d;k++)center[k]+=point[k]/vertices.length;}
  const points=vertices.map(point=>point.map((x,k)=>x-center[k]));let radius=0;
  for(const point of points)radius=Math.max(radius,Math.hypot(...point));
  if(!Number.isFinite(radius)||radius<=0)return null;
  return points.map(point=>point.map(x=>x/radius));
}
const key=point=>point.map(x=>Math.round(x/EPS)).join(',');
function candidates(buckets,point){
  const base=point.map(x=>Math.round(x/EPS)),ids=[],walk=(axis,parts)=>{
    if(axis===base.length){const row=buckets.get(parts.join(','));if(row)ids.push(...row);return;}
    for(let delta=-1;delta<=1;delta++)walk(axis+1,[...parts,base[axis]+delta]);
  };
  walk(0,[]);return ids;
}
function parallelFaces(model,points){
  if(!Array.isArray(model.faces)||model.faces.length>PRISM_CLASS_LIMITS.faces)return null;
  const normals=[],buckets=new Map(),ids=[];let visits=0,unclassified=0,maxResidual=0,classCount=0;
  for(const face of model.faces){
    if(!Array.isArray(face)||(visits+=face.length)>PRISM_CLASS_LIMITS.visits||face.some(id=>!Number.isInteger(id)||!points[id]))return null;
    const origin=points[face[0]];let axis=null,distance=0,normal=null,area=0;
    if(origin)for(const id of face){const v=points[id].map((x,k)=>x-origin[k]),length=Math.hypot(...v);if(length>distance){axis=v;distance=length;}}
    if(axis)for(const id of face){const v=points[id].map((x,k)=>x-origin[k]),n=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]],length=Math.hypot(...n);if(length>area){normal=n;area=length;}}
    if(area>1e-12){
      normal=normal.map(x=>x/area);if(normal.find(x=>Math.abs(x)>EPS)<0)normal=normal.map(x=>-x);
      let residual=0;for(const id of face)residual=Math.max(residual,Math.abs(points[id].reduce((sum,x,k)=>sum+(x-origin[k])*normal[k],0)));
      maxResidual=Math.max(maxResidual,residual);if(residual>EPS)normal=null;
    }else normal=null;
    let found=-1;
    if(normal){const choices=candidates(buckets,normal);if((visits+=choices.length)>PRISM_CLASS_LIMITS.visits)return null;for(const index of choices)if(Math.hypot(...normal.map((x,k)=>x-normals[index].normal[k]))<=EPS){found=index;break;}}
    if(found>=0)ids.push(normals[found].classId);
    else{
      ids.push(classCount++);
      if(normal){const index=normals.length;normals.push({normal,classId:ids.at(-1)});const hash=key(normal),row=buckets.get(hash)||[];row.push(index);buckets.set(hash,row);}
      else unclassified++;
    }
  }
  return {ids,classCount,scheme:'parallel-faces',unclassified,maxResidual};
}
function oppositeCells(model,points){
  if(!Array.isArray(model.cells)||model.cells.length>PRISM_CLASS_LIMITS.cells)return null;
  const buckets=new Map();points.forEach((point,id)=>{const hash=key(point),row=buckets.get(hash)||[];row.push(id);buckets.set(hash,row);});
  const opposites=new Int32Array(points.length).fill(-1);let maxResidual=0,comparisons=0;
  for(let id=0;id<points.length;id++){
    const target=points[id].map(x=>-x),choices=candidates(buckets,target);if((comparisons+=choices.length)>PRISM_CLASS_LIMITS.visits)return null;
    const matches=choices.filter(other=>Math.hypot(...target.map((x,k)=>x-points[other][k]))<=EPS);
    if(matches.length===1){opposites[id]=matches[0];maxResidual=Math.max(maxResidual,Math.hypot(...target.map((x,k)=>x-points[matches[0]][k])));}
  }
  const cells=new Map(),paired=new Set(),ids=[];let visits=0,classCount=0;
  for(const cell of model.cells){
    if(!Array.isArray(cell))return null;const vertices=new Set();
    for(const face of cell){const row=model.faces?.[face];if(!Array.isArray(row)||(visits+=row.length)>PRISM_CLASS_LIMITS.visits)return null;for(const id of row){if(!Number.isInteger(id)||!points[id])return null;vertices.add(id);}}
    const source=[...vertices].sort((a,b)=>a-b),own=source.join(','),opposite=source.map(id=>opposites[id]),valid=source.length>=4&&opposite.every(id=>id>=0),inverse=valid?opposite.sort((a,b)=>a-b).join(','):null;
    const inverseClass=inverse!==own?cells.get(inverse):undefined,partner=cells.get(own)??inverseClass;
    if(partner!==undefined){ids.push(partner);if(inverseClass!==undefined)paired.add(partner);}
    else ids.push(classCount++);
    cells.set(own,ids.at(-1));
  }
  return {ids,classCount,scheme:'opposite-cells',unpaired:classCount-paired.size,maxResidual};
}
export function prismColorClasses(model,types,mode){
  const kind=mode==='face-type'?'face':mode==='cell-type'?'cell':null;
  if(!kind||!model||typeof model!=='object')return null;
  if(types?.available){const count=types.types?.[kind]?.length??new Set(types.maps?.[kind]?.filter(id=>id>=0)).size;if(count>2)return null;}
  if(kind==='face'&&model.dimension!==3||kind==='cell'&&model.dimension!==4)return null;
  let entry=cache.get(model);if(!entry){entry={};cache.set(model,entry);}
  if(Object.hasOwn(entry,kind))return entry[kind];
  const points=pointsFor(model),result=points?(kind==='face'?parallelFaces(model,points):oppositeCells(model,points)):null;
  entry[kind]=result?{...result,colors:result.ids.map(id=>PRISM_PALETTE[(id+3*Math.floor(id/PRISM_PALETTE.length))%PRISM_PALETTE.length]),tolerance:EPS}:null;
  return entry[kind];
}
