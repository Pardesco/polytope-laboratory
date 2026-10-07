import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';

export function projectiveWireObjects(record){
  if(record?.objectClass!=='projective-incidence-complex'||record.display?.geometryModel!==false)throw Error('Projective display requires a separate source-owned incidence record.');
  const group=new THREE.Group(),center=record.resolvedCenter;
  for(const edge of record.edges){
    if(!edge.clipPoints.length)continue;
    const geometry=new THREE.BufferGeometry().setFromPoints(edge.clipPoints.map(p=>new THREE.Vector3(...p.map((x,k)=>x-center[k]))));
    const owners=edge.dualVertices.map(i=>record.vertices[i].rawFaceColor),raw=owners.find(c=>c?.values?.length>=3),scale=raw?.encoding==='byte'?255:1,values=raw?.values;
    const material=new THREE.LineBasicMaterial({color:values?new THREE.Color(values[0]/scale,values[1]/scale,values[2]/scale):new THREE.Color('#83c9ed'),transparent:true,opacity:values?.length>3?values[3]/scale:.9});
    const line=new THREE.Line(geometry,material);line.userData={sourceEdge:edge.sourceEdge,dualVertices:[...edge.dualVertices],kind:edge.kind};group.add(line);
  }
  const positions=[],ids=[];const bound=record.settings.clipBound;
  for(const vertex of record.vertices)if(vertex.finitePoint&&vertex.finitePoint.every((x,k)=>Math.abs(x-center[k])<=bound*(1+1e-8))){positions.push(...vertex.finitePoint.map((x,k)=>x-center[k]));ids.push(vertex.sourceFace);}
  if(ids.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const points=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#ffd582',size:5,sizeAttenuation:false}));points.userData={sourceFaces:ids};group.add(points);}
  return group;
}

export class ProjectiveDualViewer{
  constructor(container,{onSelect=()=>{},onCamera=()=>{}}={}){
    this.container=container;this.onSelect=onSelect;this.onCamera=onCamera;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#111a23');
    this.camera=new THREE.PerspectiveCamera(38,1,.001,1e12);this.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));container.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.addEventListener('change',()=>this.draw());this.controls.addEventListener('end',()=>onCamera(this.cameraState()));
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.click=event=>this.pick(event);this.renderer.domElement.addEventListener('click',this.click);this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  }
  setDescriptor(record){this.clear();this.record=record;this.group=projectiveWireObjects(record);this.scene.add(this.group);this.raycaster.params.Line.threshold=record.settings.clipBound*.015;this.raycaster.params.Points.threshold=record.settings.clipBound*.02;this.draw();}
  clear(){if(!this.group)return;this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.scene.remove(this.group);this.group=null;}
  fit(){if(!this.record)return;const bound=this.record.settings.clipBound;this.camera.position.set(3.2*bound,2.2*bound,4.5*bound);this.camera.near=Math.max(1e-9,bound*1e-4);this.camera.far=bound*100;this.camera.updateProjectionMatrix();this.controls.target.set(0,0,0);this.controls.update();this.draw();}
  canonical(axis){if(!this.record)return;const d=this.camera.position.distanceTo(this.controls.target)||this.record.settings.clipBound*6;this.camera.position.copy(this.controls.target).add(new THREE.Vector3(...axis).multiplyScalar(d));this.camera.up.set(0,Math.abs(axis[1])===1?0:1,Math.abs(axis[1])===1?1:0);this.controls.update();this.draw();this.onCamera(this.cameraState());}
  cameraState(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom};}
  restoreCamera(c){if(!c)return;for(const key of ['position','target','up'])if(!Array.isArray(c[key])||c[key].length!==3||c[key].some(v=>!Number.isFinite(v)))throw Error('Saved projective camera is invalid.');if(!Number.isFinite(c.zoom)||c.zoom<=0)throw Error('Saved projective camera zoom is invalid.');this.camera.position.fromArray(c.position);this.camera.up.fromArray(c.up);this.camera.zoom=c.zoom;this.controls.target.fromArray(c.target);this.camera.updateProjectionMatrix();this.controls.update();this.draw();}
  resize(){const r=this.container.getBoundingClientRect(),width=Math.max(1,r.width),height=Math.max(1,r.height);this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.draw();}
  draw(){if(this.renderer)this.renderer.render(this.scene,this.camera);}
  select(kind,index){if(!this.group)return;const edges=kind==='face'?new Set(this.record.faces[index]?.sourceEdges):null;for(const o of this.group.children)if(o.isLine){const match=kind==='edge'?o.userData.sourceEdge===index:kind==='vertex'?o.userData.dualVertices.includes(index):edges?.has(o.userData.sourceEdge);if(!o.userData.baseColor)o.userData.baseColor=o.material.color.clone();o.material.color.copy(match?new THREE.Color('#ff615e'):o.userData.baseColor);}this.draw();}
  pick(event){if(!this.group)return;const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hit=this.raycaster.intersectObjects(this.group.children)[0];if(!hit)return;const kind=hit.object.isPoints?'vertex':'edge',index=hit.object.isPoints?hit.object.userData.sourceFaces[hit.index]:hit.object.userData.sourceEdge;this.select(kind,index);this.onSelect(kind,index);}
  image(){this.draw();return this.renderer.domElement.toDataURL('image/png');}
  destroy(){this.observer.disconnect();this.renderer.domElement.removeEventListener('click',this.click);this.controls.dispose();this.clear();this.renderer.dispose();this.renderer.forceContextLoss?.();this.renderer.domElement.remove();}
}
