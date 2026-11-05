import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

export const ENTITY_FIELDS={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'};
export function entityVertices(model,kind,indices){
  const result=new Set();
  for(const id of indices){
    if(kind==='vertex'){if(model.vertices[id])result.add(id);}
    else if(kind==='cell')for(const face of model.cells?.[id]||[])for(const v of model.faces[face]||[])result.add(v);
    else for(const v of model[ENTITY_FIELDS[kind]]?.[id]||[])result.add(v);
  }
  return [...result];
}
// Consume the same published primitive owners and GPU positions as picking.
export function buildSelectionHighlight({kind,indices,edgePositions=[],edgeIds=[],surfacePositions=[],triangles=[],packedDisplay=null,faceOwners=[],activeCells=[],limit=100000}){
  const selected=new Set(indices),lines=[],fill=[],boundary=new Map(),active=new Set(activeCells);
  const empty=diagnostic=>({lines:[],fill:[],diagnostic});
  const segment=(positions,a,b)=>{
    const x=positions[a],y=positions[a+1],z=positions[a+2],u=positions[b],v=positions[b+1],w=positions[b+2];
    if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)&&Number.isFinite(u)&&Number.isFinite(v)&&Number.isFinite(w)&&(x!==u||y!==v||z!==w))lines.push(x,y,z,u,v,w);
  };
  if(!selected.size||kind==='vertex')return empty(null);
  if(kind==='edge'){
    if(edgeIds.length>limit)return empty('Selection uses vertex dots: displayed edge traversal limit exceeded.');
    for(let i=0;i<edgeIds.length;i++)if(selected.has(edgeIds[i]))segment(edgePositions,i*6,i*6+3);
  }else if(kind==='face'||kind==='cell'){
    const count=packedDisplay?packedDisplay.faceIds.length:triangles.length;
    if(count>limit)return empty('Selection uses vertex dots: displayed surface traversal limit exceeded.');
    for(let i=0;i<count;i++){
      const t=packedDisplay?null:triangles[i],face=packedDisplay?packedDisplay.faceIds[i]:t.face,cell=packedDisplay?(packedDisplay.cellIds[i]<0?undefined:packedDisplay.cellIds[i]):t.cell;
      if(t?.visible===false)continue;
      const match=kind==='face'?selected.has(face):Number.isInteger(cell)?active.has(cell)&&selected.has(cell):(faceOwners[face]||[]).some(c=>active.has(c)&&selected.has(c));
      if(!match)continue;
      const start=i*9;let finite=true;for(let k=0;k<9;k++)if(!Number.isFinite(surfacePositions[start+k])){finite=false;break;}if(!finite)continue;
      const ax=surfacePositions[start],ay=surfacePositions[start+1],az=surfacePositions[start+2],ux=surfacePositions[start+3]-ax,uy=surfacePositions[start+4]-ay,uz=surfacePositions[start+5]-az,vx=surfacePositions[start+6]-ax,vy=surfacePositions[start+7]-ay,vz=surfacePositions[start+8]-az;
      if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<=1e-15)continue;
      for(let k=0;k<9;k++)fill.push(surfacePositions[start+k]);
      const keys=[0,3,6].map(k=>`${surfacePositions[start+k]},${surfacePositions[start+k+1]},${surfacePositions[start+k+2]}`);
      for(let k=0;k<3;k++){
        const next=(k+1)%3,x=keys[k],y=keys[next],key=`${face}:${cell??''}:${x<y?x+'|'+y:y+'|'+x}`,entry=boundary.get(key);
        if(entry)entry.count++;else boundary.set(key,{a:start+k*3,b:start+next*3,count:1});
      }
    }
    for(const edge of boundary.values())if(edge.count===1)segment(surfacePositions,edge.a,edge.b);
  }
  return {lines,fill,diagnostic:null};
}
export function updateSelectionLayer(viewer,data){
  if(!viewer.selectionLines){
    viewer.selectionLines=new LineSegments2(new LineSegmentsGeometry(),new LineMaterial({color:0xffcd70,linewidth:4,depthTest:false,depthWrite:false,transparent:true,opacity:.95}));
    viewer.selectionFill=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xffcd70,transparent:true,opacity:.3,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
    viewer.selectionLines.renderOrder=6;viewer.selectionFill.renderOrder=5;viewer.group.add(viewer.selectionFill,viewer.selectionLines);
  }
  const {selectionLines:line,selectionFill:surface}=viewer;
  line.visible=data.lines.length>0;surface.visible=data.fill.length>0;
  if(line.visible){
    const previous=line.geometry.getAttribute('instanceStart')?.data;
    if(previous?.array.length===data.lines.length){previous.array.set(data.lines);previous.needsUpdate=true;line.geometry.computeBoundingBox();line.geometry.computeBoundingSphere();}
    else {line.geometry.dispose();line.geometry=new LineSegmentsGeometry();line.geometry.setPositions(data.lines);line.geometry.getAttribute('instanceStart').data.setUsage(THREE.DynamicDrawUsage);}
  }
  if(surface.visible){const previous=surface.geometry.getAttribute('position');if(previous?.array.length===data.fill.length){previous.array.set(data.fill);previous.needsUpdate=true;}else {if(previous)surface.geometry.dispose();surface.geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.fill,3).setUsage(THREE.DynamicDrawUsage));}surface.geometry.computeBoundingSphere();}
}
