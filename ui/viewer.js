import {ViewerElementContent} from './viewer-element-content.mjs';
import {ViewerStereo,stereoMode} from './viewer-stereo.mjs';
import * as THREE from 'three';
import {createAppearanceLights,applyViewerAppearance} from './viewer-appearance.mjs';
import {applyMaterialEffects,prepareMaterialEffects,disposeMaterialEffects} from './viewer-material-effects.mjs';
import {morphSourceOwners} from './dual-morph-picking.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { resolveDisplayFrame,projectDisplayPoint } from './display-frame.mjs';
import { foldPositions } from './net-motion.mjs';
import { buildFaceSurfaces } from './face-fill.mjs';
import {netSourceSurfaces} from './net-source-triangles.mjs';
import {cellNetSourceSurfaces} from './cell-net-source-triangles.mjs';
import { cellVisibility } from './cell-visibility.mjs';
import { resolveSourcePlanes,classifyCellFacing } from './cell-facing.mjs';
import { fitView } from './view-camera.mjs';
import { presentationOptions,primitiveInstances,cellFaceInstances,PRESENTATION_LIMITS } from './entity-presentation.mjs';
import {stereoDisplayGeometry} from './viewer-stereographic.mjs';
import {sourceEntityHits,PickCycle,clipCameraSegment,PICK_LIMIT} from './entity-picking.mjs';
import {perspective4DSettings} from './perspective4d.mjs';
import {perspectiveDisplayGeometry} from './viewer-perspective.mjs';
import {prepareExplosionDisplay} from './viewer-explosion.mjs';
import {prepareStereographicWorkerGeometry,computeStereographicWorkerGeometry} from './stereographic-worker-geometry.mjs';
import {ViewerStereographicWorker,createStereographicWorker,stereographicViewSignature} from './viewer-stereographic-worker.mjs';
import {planStereographicQuality} from './stereographic-quality.mjs';
import {samePackedDisplayOwners} from './packed-owner-comparison.mjs';
import {packedPrimitiveInstances,packedVisiblePointIndices,packedObservationCloud,typedStereographicPublication} from './viewer-stereographic-typed.mjs';
import {packSurfaceColors} from './packed-surface-colors.mjs';

// Borrow worker-owned arrays without overwriting their elements. Reuse GPU
// attribute handles for equal byte sizes; disposal releases buffers before a
// size change (Three cannot resize an existing GPU attribute allocation).
function bindPackedAttribute(geometry,name,array,itemSize){
  const previous=geometry.getAttribute(name);
  if(previous&&previous.array.length===array.length){previous.array=array;previous.count=array.length/itemSize;previous.needsUpdate=true;}
  else {if(previous)geometry.dispose();geometry.setAttribute(name,new THREE.BufferAttribute(array,itemSize));}
}
function packedGeometryBounds(geometry,bounds){geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(...(bounds?.center||[0,0,0])),bounds?.radius||0);geometry.boundingBox=null;}

export class Viewer {
  constructor(container,onPick=()=>{}){
    this.supportsExplosion=true;this.supportsDualMorph=true;
    this.container=container;this.onPick=onPick;this.scene=new THREE.Scene();
    this.perspectiveCamera=new THREE.PerspectiveCamera(38,1,0.01,1000);
    this.orthographicHalfHeight=1.45;
    this.orthographicCamera=new THREE.OrthographicCamera(-1.45,1.45,1.45,-1.45,0.01,1000);
    this.cameraProjection='orthographic';this.camera=this.orthographicCamera;
    this.camera.position.set(3.2,2.2,4.5);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setClearColor(0x15191f,1);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.bindControls();
    this.group=new THREE.Group();this.scene.add(this.group);
    this.appearanceLights=createAppearanceLights(this.scene);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.down=null;this.sourcePickCycle=new PickCycle();
    container.addEventListener('pointerdown',e=>{if(e.button===0){this.down=[e.clientX,e.clientY];this.pickDragged=false;}});
    container.addEventListener('pointermove',e=>{if(this.down&&Math.hypot(e.clientX-this.down[0],e.clientY-this.down[1])>5)this.pickDragged=true;});
    container.addEventListener('pointerup',e=>{
      const down=this.down;this.down=null;
      if(e.button!==0||!down||this.pickDragged||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||!this.projected)return;
      const rect=this.renderer.domElement.getBoundingClientRect();
      this.pickAt(e.clientX-rect.left,e.clientY-rect.top,{shiftKey:e.shiftKey});
    });
    container.addEventListener('pointercancel',()=>{this.down=null;});
    this.resize();
  }
  pickAt(x,y,{shiftKey=false}={}){
    if(!this.projected||!this.camera||!this.renderer)return {picked:null,candidates:0,diagnostic:null};
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height)return {picked:null,candidates:0,diagnostic:null};
    const published=this.publishedPickState||this,view=published.view,visibility=published.visibility,instanceVisibility=published.instanceVisibility,explosionDisplay=published.explosionDisplay;
    const stereo=this.stereoRenderer?.pick(this.camera,stereoMode(this.view),x,rect.width)??{camera:this.camera,x,width:rect.width};
    const pickCamera=stereo.camera,pickWidth=stereo.width;
    x=stereo.x;
    const cursor=[x,y],kind=this.cellNet?(shiftKey?'vertex':'face'):(view.pickKind||'vertex');
    this.camera.updateMatrixWorld();this.group.updateMatrixWorld(true);
    const packed=published.packedDisplay;
    const vertices=[],segments=[],rayHits=[],triangles=packed?published.pickingTriangles:(published.renderTriangles||published.triangles);
    const pointToScreen=p=>[(p[0]+1)*pickWidth/2,(1-p[1])*rect.height/2,p[2]];
    const ndc=p=>new THREE.Vector3(...p).project(pickCamera).toArray();
    const clipCoordinates=p=>new THREE.Vector4(...p,1).applyMatrix4(pickCamera.matrixWorldInverse).applyMatrix4(pickCamera.projectionMatrix).toArray();
    const verticesEnabled=this.points.visible||this.vertexSpheres?.visible||this.cellNet&&shiftKey;
    const edgesEnabled=this.lines.visible||this.edgeCylinders?.visible;
    const enabled=kind==='vertex'?verticesEnabled:kind==='edge'?edgesEnabled:this.surface.visible;
    const pickPoints=published.instanceProjected||published.projected;
    if(enabled&&kind==='vertex'&&pickPoints.length<=PICK_LIMIT&&packed){for(let instance=0;instance<packed.vertexIds.length;instance++){
      if(!packed.vertexVisible[instance])continue;const q=ndc(packed.positions.subarray(instance*3,instance*3+3));if(q[2]<-1||q[2]>1)continue;vertices.push({id:packed.vertexIds[instance],point:pointToScreen(q)});
    }}else if(enabled&&kind==='vertex'&&pickPoints.length<=PICK_LIMIT)pickPoints.forEach((p,instance)=>{
      const id=explosionDisplay?explosionDisplay.sourceVertexIds[instance]:instance;
      if(p.clipped||!(instanceVisibility||visibility).vertices[instance])return;
      const q=ndc(p.point);if(q[2]<-1||q[2]>1)return;vertices.push({id,point:pointToScreen(q)});
    });
    else if(enabled&&kind==='edge'){
      const buffer=this.edgeGeometry.attributes.position.array,ids=this.lines.userData.sourceEdgeIds;
      if(buffer.length/6<=PICK_LIMIT)for(let i=0;i<buffer.length;i+=6){
        const id=ids[i/6];if(!packed&&!visibility.edges[id])continue;
        if(Math.hypot(buffer[i]-buffer[i+3],buffer[i+1]-buffer[i+4],buffer[i+2]-buffer[i+5])<=1e-12)continue;
        const clipped=clipCameraSegment(clipCoordinates(buffer.slice(i,i+3)),clipCoordinates(buffer.slice(i+3,i+6)));
        if(clipped)segments.push({id,points:clipped.map(pointToScreen)});
      }
    }else if(enabled&&(kind==='face'||kind==='cell')){
      if(triangles.length<=PICK_LIMIT){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/pickWidth*2-1,1-y/rect.height*2),pickCamera);for(const hit of ray.intersectObject(this.surface))if(hit.distance>=pickCamera.near&&hit.distance<=pickCamera.far)rayHits.push(hit);}
    }
    const overLimit=enabled&&(kind==='vertex'?pickPoints.length>PICK_LIMIT:kind==='edge'?this.edgeGeometry.attributes.position.count/2>PICK_LIMIT:triangles.length>PICK_LIMIT);
    const result=overLimit?{hits:[],diagnostic:'Picking unavailable: displayed primitive traversal resource limit exceeded.'}:sourceEntityHits(kind,{cursor,vertices,segments,rayHits,triangles,faceOwners:visibility.faceOwners,activeCells:visibility.activeCells,enabled});
    this.pickDiagnostic=result.diagnostic;this.onPickDiagnostic?.(result.diagnostic);
    const cycle=this.sourcePickCycle||(this.sourcePickCycle=new PickCycle()),picked=cycle.choose(result.hits,cursor,kind);
    if(picked&&published.morphFrame){
      const owners=morphSourceOwners(published.morphFrame,kind,picked.id);this.onMorphPick?.(owners,kind,picked.id);return {picked,candidates:result.hits.length,diagnostic:result.diagnostic,sourceOwners:owners};
    }
    if(picked){
      if(this.cellNet&&kind==='face'){const owner=this.cellFaceOwners[picked.id];this.onCellFace?.(owner.face,owner.cell);}
      else if(this.cellNet)this.onCellVertex?.(this.cellVertexSources[picked.id]);
      else this.onPick?.(picked.id,result.hits.length,kind);
    }
    return {picked,candidates:result.hits.length,diagnostic:result.diagnostic};
  }
  resize(){
    const r=this.container.getBoundingClientRect();if(!r.width||!r.height)return;
    this.renderer.setSize(r.width,r.height,false);this.aspect=r.width/r.height;
    this.perspectiveCamera.aspect=this.aspect;this.perspectiveCamera.updateProjectionMatrix();
    this.updateOrthographic();
  }
  updateOrthographic(){
    const camera=this.orthographicCamera,height=this.orthographicHalfHeight,aspect=this.aspect||1;
    camera.left=-height*aspect;camera.right=height*aspect;camera.top=height;camera.bottom=-height;camera.updateProjectionMatrix();
  }
  bindControls(){
    const previous=this.controls,target=previous?.target.clone();
    const settings={enableDamping:true};
    if(previous)for(const key of ['enabled','enableDamping','dampingFactor','enablePan','enableRotate','enableZoom','minDistance','maxDistance','minZoom','maxZoom'])settings[key]=previous[key];
    previous?.dispose();this.controls=new OrbitControls(this.camera,this.renderer.domElement);Object.assign(this.controls,settings);
    if(target)this.controls.target.copy(target);
    this.controls.addEventListener('end',()=>this.onCamera?.(this.cameraState()));this.controls.update();
  }
  setCameraProjection(mode,preserveScale=true){
    if(!['orthographic','perspective'].includes(mode))throw new Error('Camera projection must be orthographic or perspective.');
    if(mode===this.cameraProjection)return;
    const previous=this.camera,next=mode==='orthographic'?this.orthographicCamera:this.perspectiveCamera;
    next.position.copy(previous.position);next.up.copy(previous.up);
    if(preserveScale){
      const distance=previous.position.distanceTo(this.controls.target),tan=Math.tan(this.perspectiveCamera.fov*Math.PI/360);
      if(mode==='orthographic'){this.orthographicHalfHeight=distance*tan/previous.zoom;next.zoom=1;}
      else {const direction=previous.position.clone().sub(this.controls.target).normalize();next.zoom=1;next.position.copy(this.controls.target).addScaledVector(direction,this.orthographicHalfHeight/previous.zoom/tan);}
    }
    this.camera=next;this.cameraProjection=mode;this.updateOrthographic();next.updateProjectionMatrix();this.bindControls();
  }
  clear(){disposeMaterialEffects(this);this.stereoRenderer?.dispose();this.stereoRenderer=null;this.elementContentLayer?.destroy();this.elementContentLayer=null;this.elementContentDiagnostic=null;this.stereographicWorker?.destroy();this.stereographicWorker=null;this.publishedPickState=null;this.stereographicWorkerDiagnostic=null;this.stereographicWorkerUnavailable=null;for(const o of [...this.group.children]){this.group.remove(o);o.dispose?.();o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}this.model=null;this.morphSource=null;this.morphFrame=null;this.morphSelectedSourceIds=null;this.projected=null;this.explosionPayload=null;this.explosionPrepared=null;this.explosionDisplay=null;this.explosionDiagnostic=null;this.instanceProjected=null;this.instanceVisibility=null;this.explosionTriangleDisplay=null;this.explosionTriangles=null;this.explosionInstanceVisibility=null;this.net=null;this.cellNet=null;this.orientationApplied=false;this.orientationDiagnostic=null;this.facingCache=null;this.facingCacheFingerprint=null;this.facingCacheSourceFingerprint=null;this.facingPlanes=null;this.facingCounts=null;this.facingDiagnostic=null;this.facingApplied=false;this.vertexSpheres=null;this.edgeCylinders=null;this.presentationSourceTriangles=null;this.presentationDiagnostic=null;this.stereographicGeometry=null;this.stereographicKey=null;this.perspectiveGeometry=null;this.perspectiveKey=null;this.perspectiveDiagnostic=null;this.observerBounds=null;this.observerBoundsKey=null;this.renderTriangles=null;this.stereographicDiagnostic=null;}
  async setElementContent(descriptor,options={}){
    this.elementContentLayer?.destroy();this.elementContentLayer=null;this.elementContentDiagnostic=null;
    if(descriptor===null||descriptor===undefined)return {ready:true,cleared:true};
    const layer=new ViewerElementContent(this,options);this.elementContentLayer=layer;
    try{return await layer.set(descriptor,options);}catch(error){if(this.elementContentLayer===layer)this.elementContentDiagnostic=error.message;throw error;}
  }
  syncElementContent(){
    try{this.elementContentLayer?.rebuild();}catch(error){this.elementContentDiagnostic=error.message;if(this.elementContentLayer){this.elementContentLayer.diagnostic=error.message;this.elementContentLayer.clearGeometry();}}
  }
  setModel(model,{normalization=null,morphSource=null,morphFrame=null}={}){
    this.clear();this.sourcePickCycle?.reset();this.pickDiagnostic=null;if(!model)return;
    this.model=model;this.morphSource=morphSource;this.morphFrame=morphFrame;const d=model.embeddingDimension||model.dimension;
    let center=Array(d).fill(0);model.vertices.forEach(v=>v.forEach((x,k)=>center[k]+=x/model.vertices.length));
    let radius=Math.max(...model.vertices.map(v=>Math.hypot(...v.map((x,k)=>x-center[k]))))||1;
    if(normalization){if(!Array.isArray(normalization.center)||normalization.center.length!==d||normalization.center.some(x=>!Number.isFinite(x))||!Number.isFinite(normalization.radius)||normalization.radius<=0)throw Error("Invalid source morph normalization.");center=[...normalization.center];radius=normalization.radius;}
    this.center=center;this.radius=radius;this.lastFillRule=null;this.visibilityKey=null;this.colorKey=null;
    this.normalized=model.vertices.map(v=>v.map((x,k)=>(x-center[k])/radius));
    this.edgeGeometry=new THREE.BufferGeometry();this.edgeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(model.edges.length*6),3));
    this.lines=new THREE.LineSegments(this.edgeGeometry,new THREE.LineBasicMaterial({color:0x9eafc0,transparent:true,opacity:.8}));this.lines.renderOrder=2;this.group.add(this.lines);
    this.pointGeometry=new THREE.BufferGeometry();this.pointGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(model.vertices.length*3),3));
    this.points=new THREE.Points(this.pointGeometry,new THREE.PointsMaterial({color:0xc8d2dd,size:3,sizeAttenuation:false,transparent:true,opacity:.85,depthWrite:false}));this.points.renderOrder=3;this.group.add(this.points);
    this.triangles=[];
    this.surfaceGeometry=new THREE.BufferGeometry();this.surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.triangles.length*9),3));
    this.surface=new THREE.Mesh(this.surfaceGeometry,new THREE.MeshPhongMaterial({color:0x9aaec3,specular:0x18202a,shininess:30,flatShading:true,transparent:true,opacity:model.dimension===4?.22:.86,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));this.group.add(this.surface);
    this.highlightGeometry=new THREE.BufferGeometry();this.highlightGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(0),3));
    this.highlight=new THREE.Points(this.highlightGeometry,new THREE.PointsMaterial({color:0xe9ba6b,size:7,sizeAttenuation:false,depthWrite:false}));this.highlight.renderOrder=4;this.group.add(this.highlight);
    this.selected=[];this.setDisplay({angles:Array(6).fill(0),projection:'orthographic',faces:true,vertices:false});
  }
  setMorphFrame(frame,source,view,{isCurrent=()=>true,signal}={}){
    if(signal?.aborted||!isCurrent())throw Object.assign(Error("Morph publication canceled."),{name:"AbortError"});
    if(!frame?.model||(source.id??null)!==(frame.sourceModelId??null)||source.fingerprint!==frame.sourceFingerprint)throw Error("Morph frame source differs.");
    const d=source.embeddingDimension||source.dimension,center=Array(d).fill(0);source.vertices.forEach(v=>v.forEach((x,k)=>center[k]+=x/source.vertices.length));
    const radius=Math.max(...source.vertices.map(v=>Math.hypot(...v.map((x,k)=>x-center[k]))))||1;
    const selected=this.morphFrame?(this.morphSelectedSourceIds||[]):(this.selected||[]);
    this.setModel(frame.model,{normalization:{center,radius},morphSource:source,morphFrame:frame});
    if(signal?.aborted||!isCurrent())throw Object.assign(Error("Morph publication canceled."),{name:"AbortError"});
    const status=this.setDisplay(view);this.select(selected);this.draw();return status;
  }
  clearMorph(source,view){if(!this.morphFrame)return;this.setModel(source);this.setDisplay(view);this.draw();}
  rebuildSurfaces(fillRule){
    const faceIds=this.visibility.faces.flatMap((active,i)=>active?[i]:[]);
    const result=this.cellNet?.sourceFaceTriangles?cellNetSourceSurfaces(this.cellNet,{faceIds}):this.net?.faceTriangles?netSourceSurfaces(this.net,{faceIds}):buildFaceSurfaces(this.model,fillRule,{faceIds});
    this.sourceTriangles=result.triangles;
    this.fillDiagnostics=result.diagnostics;this.fillSupported=result.filledFaces>0;
    this.lastFillRule=fillRule;this.rebuildPresentationSurfaces(this.presentation.cellShrink);
  }
  rebuildPresentationSurfaces(shrink){
    const result=cellFaceInstances(this.model,this.sourceTriangles,this.visibility.activeCells,shrink,{faceOwners:this.visibility.faceOwners});
    this.lastCellShrink=shrink;this.presentationSurfaceDiagnostics=result.diagnostics;this.cellInstances=result.cellInstances;
    const changed=this.presentationSourceTriangles!==this.sourceTriangles||this.effectiveCellShrink!==result.effectiveShrink;
    this.effectiveCellShrink=result.effectiveShrink;this.presentationSourceTriangles=this.sourceTriangles;
    if(!changed)return;
    this.triangles=result.triangles.map(t=>({...t,normalized:t.points.map(p=>p.map((x,k)=>(x-this.center[k])/this.radius))}));
    if(this.deferStereoBuffers)return;
    this.surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.triangles.length*9),3));
    this.surfaceGeometry.deleteAttribute('color');this.surfaceGeometry.deleteAttribute('normal');this.colorKey=null;
  }
  surfaceColors(mode){
    const triangles=this.renderTriangles||this.triangles;
    const packed=this.stereographicGeometry?.packed,previous=this.surfaceGeometry.getAttribute('color');
    let colors;
    if(packed){
      const target=previous?.itemSize===4&&previous.array.length>=triangles.length*12?previous.array:undefined;
      const result=packSurfaceColors(this.model,packed,this.visibility,mode,{target});
      colors=result.colors;this.surfaceVertexAlpha=result.vertexAlpha;
    }else{
    colors=new Float32Array(triangles.length*12);const metadata=this.model.metadata?.offColors;this.surfaceVertexAlpha=false;
    const cache=new Map();
    for(let i=0;i<triangles.length;i++){
      const face=packed?packed.faceIds[i]:triangles[i].face,cell=packed?(packed.cellIds[i]<0?undefined:packed.cellIds[i]):triangles[i].cell;
      const owner=cell??this.visibility.faceOwners[face]?.find(c=>this.visibility.activeCellSet.has(c));
      const key=`${face}:${owner??''}`;let rgba=cache.get(key);
      if(!rgba){const supplied=metadata?.faces?.[face]||metadata?.cells?.[owner];
      let color=new THREE.Color(0x9aaec3),alpha=1;
      if(mode==='source'&&supplied){const factor=supplied.encoding==='byte'?1/255:1;color.setRGB(...supplied.values.slice(0,3).map(x=>x*factor),THREE.SRGBColorSpace);if(supplied.values.length===4)alpha=supplied.values[3]*factor;}
      else if(mode==='cell'&&owner!==undefined)color.setHSL((owner*.173+.58)%1,.32,.6);
      else if(mode==='face')color.setHSL((face*.173+.58)%1,.32,.6);
      rgba=[...color.toArray(),alpha];cache.set(key,rgba);}
      if(rgba[3]<1)this.surfaceVertexAlpha=true;
      for(let j=0;j<3;j++)colors.set(rgba,i*12+j*4);
    }
    }
    if(colors===previous?.array)previous.needsUpdate=true;else {if(previous)this.surfaceGeometry.dispose();this.surfaceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,4));}
    this.surface.material.vertexColors=true;this.surface.material.color.set(0xffffff);this.surface.material.needsUpdate=true;
  }
  select(ids){
    if(this.morphFrame){const sourceIds=ids||[];this.morphSelectedSourceIds=[...sourceIds];ids=this.model.vertices.flatMap((_,i)=>morphSourceOwners(this.morphFrame,"vertex",i).some(o=>o.kind==="vertex"&&sourceIds.includes(o.id))?[i]:[]);}
    this.selected=ids||[];const published=this.publishedPickState||this,display=published.explosionDisplay,points=published.instanceProjected||published.projected,visibility=published.instanceVisibility||published.visibility;
    const packed=published.packedDisplay,indices=display?this.selected.flatMap(id=>display.vertexInstancesBySource[id]||[]):this.selected,buffer=new Float32Array(indices.length*3);
    indices.forEach((id,i)=>{const p=points?.[id];buffer.set(packed?(packed.vertexVisible[id]?packed.positions.subarray(id*3,id*3+3):[1e30,1e30,1e30]):(!p||p.clipped||!visibility?.vertices[id]?[1e30,1e30,1e30]:p.point),i*3);});
    this.highlightGeometry.setAttribute('position',new THREE.BufferAttribute(buffer,3));this.highlightGeometry.computeBoundingSphere();
  }
  primitiveMesh(kind,count){
    const field=kind==='sphere'?'vertexSpheres':'edgeCylinders',limit=kind==='sphere'?PRESENTATION_LIMITS.spheres:PRESENTATION_LIMITS.cylinders;
    let mesh=this[field];if(!count)return mesh;
    if(!mesh||mesh.instanceMatrix.count<count){
      if(mesh){this.group.remove(mesh);mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}
      const capacity=Math.min(limit,2**Math.ceil(Math.log2(Math.max(1,count))));
      const geometry=kind==='sphere'?new THREE.SphereGeometry(1,12,8):new THREE.CylinderGeometry(1,1,1,8);
      const material=new THREE.MeshPhongMaterial({color:kind==='sphere'?0xc8d2dd:0x9eafc0,specular:0x18202a,shininess:24,transparent:true,opacity:kind==='sphere'?.85:.8,depthWrite:false});
      mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.renderOrder=kind==='sphere'?3:2;
      this[field]=mesh;this.group.add(mesh);
    }
    return mesh;
  }
  updatePrimitives(view){
    const spheres=view.vertices===true&&this.presentation.vertexStyle==='sphere',cylinders=view.edges!==false&&this.presentation.edgeStyle==='cylinder';
    const packed=this.stereographicGeometry?.packed;
    const result=packed?packedPrimitiveInstances(packed,{spheres,cylinders}):primitiveInstances(this.explosionDisplay?{edges:this.explosionDisplay.edgeIndices}:this.model,this.instanceProjected||this.projected,this.instanceVisibility||this.visibility,{spheres,cylinders,edgeSegments:this.stereographicGeometry?.edges??this.perspectiveGeometry?.edges??null});
    if(this.explosionDisplay&&!packed){result.vertices.forEach(v=>v.vertex=this.explosionDisplay.sourceVertexIds[v.vertex]);result.edges.forEach(e=>e.edge=this.explosionDisplay.sourceEdgeIds[e.edge]);}
    const transform=this.primitiveTransform||(this.primitiveTransform=new THREE.Object3D()),up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
    const balls=this.primitiveMesh('sphere',result.vertices.length),rods=this.primitiveMesh('cylinder',result.edges.length);
    if(balls){
      balls.count=result.vertices.length;balls.visible=spheres&&result.sphereSupported&&balls.count>0;
      result.vertices.forEach((instance,i)=>{transform.position.fromArray(instance.point);transform.quaternion.identity();transform.scale.setScalar(this.presentation.vertexRadius);transform.updateMatrix();balls.setMatrixAt(i,transform.matrix);});
      balls.instanceMatrix.needsUpdate=true;balls.userData.sourceVertexIds=result.vertices.map(instance=>instance.vertex);
    }
    if(rods){
      rods.count=result.edges.length;rods.visible=cylinders&&result.cylinderSupported&&rods.count>0;
      result.edges.forEach((instance,i)=>{transform.position.fromArray(instance.midpoint);transform.quaternion.setFromUnitVectors(up,direction.fromArray(instance.direction));transform.scale.set(this.presentation.edgeRadius,instance.length,this.presentation.edgeRadius);transform.updateMatrix();rods.setMatrixAt(i,transform.matrix);});
      rods.instanceMatrix.needsUpdate=true;rods.userData.sourceEdgeIds=result.edges.map(instance=>instance.edge);
      rods.material.color.copy(this.lines.material.color);rods.material.opacity=this.lines.material.opacity;
      const transparent=rods.material.opacity<1;if(rods.material.transparent!==transparent){rods.material.transparent=transparent;rods.material.needsUpdate=true;}rods.material.depthWrite=!transparent;
    }
    this.points.visible=view.vertices===true&&(!spheres||!result.sphereSupported);this.lines.visible=view.edges!==false&&(!cylinders||!result.cylinderSupported);
    this.primitiveCounts={spheres:result.vertices.length,cylinders:result.edges.length,collapsedEdges:result.collapsedEdges};
    this.presentationDiagnostic=[...this.presentation.diagnostics,...this.presentationSurfaceDiagnostics,...result.diagnostics].join(' ')||null;
  }
  setExplosion(geometry){
    this.explosionPayload=geometry??null;this.explosionPrepared=null;this.explosionPreparedRule=null;
    this.resolveExplosionDisplay(this.view?.fillRule||this.model?.metadata?.fillRule||'nonzero');
    return {applied:Boolean(this.explosionDisplay),supported:!this.explosionPayload||Boolean(this.explosionPrepared),diagnostic:this.explosionDiagnostic};
  }
  resolveExplosionDisplay(fillRule){
    this.explosionDisplay=null;this.explosionDiagnostic=null;this.instanceProjected=null;this.instanceVisibility=null;
    if(!this.explosionPayload)return;
    try{
      if(this.net||this.cellNet)throw Error('Explosion display is unavailable for a derived net.');
      if(!this.explosionPrepared||this.explosionPreparedRule!==fillRule){this.explosionPrepared=prepareExplosionDisplay(this.model,this.explosionPayload,{fillRule});this.explosionPreparedRule=fillRule;}
      if(this.explosionPrepared.amount>0)this.explosionDisplay=this.explosionPrepared;
      this.explosionDiagnostic=this.explosionPrepared.diagnostics.map(d=>d.reason||d.message||`Source face ${d.face} has an unsupported fill.`).join(' ')||null;
    }catch(error){this.explosionDiagnostic=error.message;}
  }
  explosionSurfaceTriangles(){
    const display=this.explosionDisplay,shrink=this.presentation.cellShrink;
    if(this.explosionTriangleDisplay===display&&this.explosionTriangleVisibility===this.visibilityKey&&this.explosionTriangleShrink===shrink){this.instanceVisibility=this.explosionInstanceVisibility;return this.explosionTriangles;}
    const ownerVisible=record=>record.cell===null||this.visibility.activeCellSet.has(record.cell);
    this.instanceVisibility={vertices:display.vertices.map(v=>ownerVisible(v)&&v.sourceFaceIds.some(f=>this.visibility.faces[f])),edges:display.edges.map(e=>ownerVisible(e)&&this.visibility.edges[e.sourceEdge]&&e.sourceFaceIds.some(f=>this.visibility.faces[f])),faces:this.visibility.faces};
    this.explosionInstanceVisibility=this.instanceVisibility;
    const centers=new Map();
    if(this.model.dimension===4&&shrink<1)display.entities.forEach(entity=>{const points=entity.vertices.map(v=>display.normalized[v]),center=Array(4).fill(0);points.forEach(p=>p.forEach((x,k)=>center[k]+=x/points.length));centers.set(entity.cell,center);});
    this.explosionTriangles=display.triangles.filter(t=>ownerVisible(t)&&this.visibility.faces[t.face]).map(t=>{
      const center=centers.get(t.cell);if(!center)return t;
      const result={...t,normalized:t.normalized.map(p=>p.map((x,k)=>center[k]+shrink*(x-center[k])))};delete result.vertices;return result;
    });
    this.explosionTriangleDisplay=display;this.explosionTriangleVisibility=this.visibilityKey;this.explosionTriangleShrink=shrink;
    return this.explosionTriangles;
  }
  setNet(net){
    const vertices=[],faces=[],edges=[];
    for(const face of net.faces){const start=vertices.length;vertices.push(...face.points.map(p=>[...p,0]));const ids=face.points.map((_,i)=>start+i);faces.push(ids);ids.forEach((a,i)=>edges.push([a,ids[(i+1)%ids.length]]));}
    this.setModel({dimension:3,embeddingDimension:3,interpretation:'rigid-face-assembly',metadata:{fillSemantics:net.faceTriangles?'simple-planar-source-faces':'ordinary-convex-faces'},vertices,faces,edges});
    this.net=net;
    if(net.faceTriangles)this.rebuildSurfaces(this.lastFillRule||'nonzero');
    const cloud=[...vertices,...net.targetVertices];
    const low=[0,1,2].map(i=>Math.min(...cloud.map(p=>p[i]))),high=[0,1,2].map(i=>Math.max(...cloud.map(p=>p[i])));
    this.netCenter=low.map((x,i)=>(x+high[i])/2);this.netRadius=Math.max(...cloud.map(p=>Math.hypot(...p.map((x,i)=>x-this.netCenter[i]))))||1;
    const colors=new Float32Array(this.triangles.length*9);
    this.triangles.forEach((triangle,i)=>{const face=net.faces[triangle.face];const color=new THREE.Color().setHSL((face.component*.173+.43)%1,.5,.58);for(let j=0;j<3;j++)colors.set(color.toArray(),i*9+j*3);});
    this.surfaceVertexAlpha=false;this.surfaceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));this.surface.material.vertexColors=true;this.surface.material.color.set(0xffffff);this.surface.material.opacity=.65;this.surface.material.needsUpdate=true;
    this.setFold(0);
  }
  setFold(fraction){
    if(!this.net)return;
    const vertices=foldPositions(this.net,fraction).flatMap(face=>face.points);
    this.normalized=vertices.map(p=>p.map((x,i)=>(x-this.netCenter[i])/this.netRadius));
    this.setDisplay({angles:Array(6).fill(0),projection:'orthographic',faces:true,vertices:false});
  }
  setCellNet(net,shrink=1){
    const vertices=[],faces=[],edges=[],owners=[],sources=[],surfacePoints=[];
    for(const cell of net.cells){
      const start=vertices.length,center=[0,1,2].map(i=>cell.points.reduce((sum,p)=>sum+p[i],0)/cell.points.length);
      vertices.push(...cell.points);sources.push(...cell.sourceVertices);
      surfacePoints.push(...cell.points.map(p=>p.map((x,i)=>center[i]+shrink*(x-center[i]))));
      for(const face of cell.faces){const ids=face.vertices.map(i=>start+i);faces.push(ids);owners.push({cell:cell.id,face:face.id});for(let i=0;i<ids.length;i++)edges.push([ids[i],ids[(i+1)%ids.length]]);}
    }
    this.setModel({dimension:3,embeddingDimension:3,interpretation:'rigid-cell-assembly',metadata:{fillSemantics:net.sourceFaceTriangles?'ordinary-simple-planar-faces':'ordinary-convex-faces'},vertices,faces,edges});
    this.cellNet=net;this.cellFaceOwners=owners;this.cellVertexSources=sources;
    if(net.sourceFaceTriangles)this.rebuildSurfaces(this.lastFillRule||'nonzero');
    const center=[0,1,2].map(i=>vertices.reduce((sum,p)=>sum+p[i],0)/vertices.length),radius=Math.max(...vertices.map(p=>Math.hypot(...p.map((x,i)=>x-center[i]))))||1;
    this.cellSurfacePoints=surfacePoints.map(p=>p.map((x,i)=>(x-center[i])/radius));
    this.surfaceVertexAlpha=false;this.surface.material.vertexColors=true;this.surface.material.color.set(0xffffff);this.surface.material.opacity=.3;this.surface.material.needsUpdate=true;
    this.selectCellSource(null,null);this.setDisplay({angles:Array(6).fill(0),projection:'orthographic',faces:true,vertices:false});
  }
  selectCellSource(kind,index){
    if(!this.cellNet)return;
    const selected=new Set();
    if(kind==='vertex')this.cellVertexSources.forEach((source,i)=>{if(source===index)selected.add(i);});
    else this.cellFaceOwners.forEach((owner,i)=>{if(kind==='face'&&owner.face===index||kind==='cell'&&owner.cell===index)this.model.faces[i].forEach(v=>selected.add(v));});
    this.select([...selected]);
    const colors=new Float32Array(this.triangles.length*9);
    this.triangles.forEach((triangle,i)=>{const owner=this.cellFaceOwners[triangle.face],active=kind==='face'&&owner.face===index||kind==='cell'&&owner.cell===index;
      const color=active?new THREE.Color(0xffcd70):new THREE.Color().setHSL((owner.cell*.173+.43)%1,.5,.56);for(let j=0;j<3;j++)colors.set(color.toArray(),i*9+j*3);});
    this.surfaceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.setDisplay(this.view||{});
  }
  stereographicCameraMetrics(){
    const rect=this.renderer?.domElement?.getBoundingClientRect?.()||this.container?.getBoundingClientRect?.();
    return {cameraProjection:this.cameraProjection||'orthographic',cssHeight:Math.max(1,rect?.height||684),orthographicHalfHeight:this.orthographicHalfHeight||1.45,zoom:this.camera?.zoom||1};
  }
  ensureStereographicWorker(){
    if(this.stereographicWorker)return this.stereographicWorker;
    if(this.stereographicWorkerUnavailable)return null;
    try{
      const worker=(this.stereographicWorkerFactory||createStereographicWorker)();
      if(!worker){this.stereographicWorkerUnavailable='Stereographic worker unavailable; synchronous display geometry is used.';return null;}
      this.stereographicWorker=new ViewerStereographicWorker({worker,getModel:()=>this.stereographicWorker?.snapshot&&stereographicViewSignature(this.stereographicDesiredView||this.view)!==this.stereographicWorker.snapshot.viewSignature?null:this.model,clock:this.stereographicWorkerClock||{},publish:(publication,geometry,snapshot,guard)=>{
        if(!guard.isCurrent())return;
        const desired=this.stereographicDesiredView||this.view;
        let status;try{status=this.setDisplayNow(snapshot.view,{publication:geometry});}finally{this.view=desired;}
        if(!guard.isCurrent())throw Object.assign(Error('Stereographic source changed during publication.'),{name:'AbortError'});
        this.stereographicWorkerDiagnostic=null;this.lastDisplayStatus={...status,stereographicPending:publication.intermediate===true,stereographicDisplayedFrameKey:publication.frameKey,stereographicQuality:publication.quality};this.onDisplay?.(this.lastDisplayStatus);if(this.renderer&&this.controls)this.draw();
      },onTiming:timing=>this.onStereographicTiming?.(timing),onDiagnostic:diagnostic=>{this.stereographicWorkerDiagnostic=diagnostic;this.stereographicDiagnostic=diagnostic;this.onDisplay?.({...this.lastDisplayStatus,stereographicDiagnostic:diagnostic,stereographicPending:false});}});
      return this.stereographicWorker;
    }catch(error){this.stereographicWorkerUnavailable=`Stereographic worker unavailable: ${error.message} Synchronous display geometry is used.`;return null;}
  }
  setDisplay(view){
    applyViewerAppearance(this,view);
    this.stereographicDesiredView=view;
    const stereo=view.projection==='stereographic'&&(this.model?.embeddingDimension??this.model?.dimension)===4&&!this.net&&!this.cellNet;
    if(stereo&&this.ensureStereographicWorker()){
      this.deferStereoBuffers=true;
      try{this.stereographicCaptureFailure=null;return this.setDisplayNow(view,{defer:true});}
      catch(error){this.stereographicWorker.cancel();this.stereographicCaptureFailure=error.message;this.stereographicWorkerDiagnostic=error.message;return {...this.lastDisplayStatus,stereographicPending:false,stereographicDiagnostic:error.message};}
      finally{this.deferStereoBuffers=false;}
    }
    this.stereographicWorker?.cancel();const status=this.setDisplayNow(view);
    if(stereo&&status){status.stereographicDiagnostic=[status.stereographicDiagnostic,this.stereographicWorkerUnavailable].filter(Boolean).join(' ')||null;this.stereographicDiagnostic=status.stereographicDiagnostic;}
    return status;
  }
  setDisplayNow(view,workerOptions={}){
    if(!this.model)return;
    this.view=view;
    applyMaterialEffects(this,view);
    this.presentation=presentationOptions(view);
    this.perspectiveDiagnostic=null;
    try {this.perspectiveSettings=perspective4DSettings({distance:view.perspectiveDistance4D??3,near:view.perspectiveNear4D??.08});}
    catch(error){this.perspectiveSettings=perspective4DSettings();if(view.projection==='perspective')this.perspectiveDiagnostic=`Invalid 4D perspective settings: ${error.message} Using distance 3 and near distance 0.08.`;}
    if(stereoMode(view)!=='none')this.setCameraProjection('perspective');
    else if(view.cameraProjection)this.setCameraProjection(view.cameraProjection);
    const frame=resolveDisplayFrame(this.morphSource||this.model,view.orientationFrame);
    this.orientationApplied=frame.applied;this.orientationDiagnostic=frame.diagnostic;
    const fillRule=view.fillRule||this.model.metadata?.fillRule||'nonzero';
    this.resolveExplosionDisplay(fillRule);
    const facingMode=view.cellFacing||'all',hidden=new Set(view.hiddenCells||[]),cells=this.model.cells||[],isolated=view.isolatedCell??null;
    if([...hidden].some(i=>!Number.isInteger(i)||i<0||i>=cells.length))throw new Error('Hidden cell index is outside the source model.');
    if(isolated!==null&&(!Number.isInteger(isolated)||isolated<0||isolated>=cells.length))throw new Error('Choose a valid source cell to isolate.');
    this.facingDiagnostic=null;this.facingCounts=null;this.facingApplied=false;
    if(facingMode!=='all'){
      if(!['hide-front','hide-back','front','back'].includes(facingMode))this.facingDiagnostic='Cell facing unavailable: visibility mode is unsupported.';
      else {
        const cache=view.cellFacingCache;
        if(!this.facingPlanes||this.facingCache!==cache||this.facingCacheFingerprint!==this.model.fingerprint||this.facingCacheSourceFingerprint!==cache?.sourceFingerprint){
          this.facingPlanes=resolveSourcePlanes(this.model,cache);this.facingCache=cache;this.facingCacheFingerprint=this.model.fingerprint;this.facingCacheSourceFingerprint=cache?.sourceFingerprint;
        }
        let classificationPlanes=this.facingPlanes;
        if(this.explosionDisplay&&this.facingPlanes.supported){
          const translations=new Map(this.explosionDisplay.entities.map(e=>{const v=this.explosionDisplay.vertices[e.vertices[0]];return [e.cell,v.normalized.map((x,k)=>x-this.normalized[v.sourceVertex][k])];}));
          classificationPlanes={...this.facingPlanes,planes:this.facingPlanes.planes.map(p=>({...p,offset:p.offset+p.normal.reduce((sum,x,k)=>sum+x*translations.get(p.cell)[k],0)}))};
        }
        const facing=classifyCellFacing(classificationPlanes,{matrix:frame.matrix,angles:view.angles||[],projection:view.projection||'orthographic',...(view.projection==='stereographic'?{eye:[0,0,0,1]}:view.projection==='perspective'?{eye:this.perspectiveSettings.eye}:{})});
        if(!facing.supported)this.facingDiagnostic=this.facingPlanes.supported?facing.diagnostic:this.facingPlanes.diagnostic;
        else {
          this.facingApplied=true;this.facingCounts={front:facing.frontCellIds.length,back:facing.backCellIds.length,grazing:facing.grazingCellIds.length,total:cells.length};
          facing.cells.forEach(cell=>{
            const omit=facingMode==='hide-front'?cell.facing==='front':facingMode==='hide-back'?cell.facing==='back':cell.facing!==facingMode;
            if(omit)hidden.add(cell.cell);
          });
        }
      }
    }
    const activeCells=cells.flatMap((_,i)=>!hidden.has(i)&&(isolated===null||isolated===i)?[i]:[]);
    const visibilityKey=JSON.stringify([activeCells,!!(cells.length&&(hidden.size||isolated!==null))]);
    const visibilityChanged=this.visibilityKey!==visibilityKey;
    if(visibilityChanged){this.visibility=cellVisibility(this.model,[...hidden],isolated);this.visibilityKey=visibilityKey;this.colorKey=null;}
    if(this.lastFillRule!==fillRule||visibilityChanged)this.rebuildSurfaces(fillRule);
    else if(this.lastCellShrink!==this.presentation.cellShrink)this.rebuildPresentationSurfaces(this.presentation.cellShrink);
    const displayNormalized=this.explosionDisplay?.normalized||this.normalized,displayEdges=this.explosionDisplay?.edgeIndices||this.model.edges;
    const displayTriangles=this.explosionDisplay?this.explosionSurfaceTriangles():this.triangles,displayVisibility=this.instanceVisibility||this.visibility;
    const stereo=view.projection==='stereographic'&&(this.model.embeddingDimension??this.model.dimension)===4&&!this.net&&!this.cellNet;
    const perspective=view.projection==='perspective'&&(this.model.embeddingDimension??this.model.dimension)===4&&!this.net&&!this.cellNet;
    if(workerOptions.defer){
      const display=this.explosionDisplay,ownedView={...view,angles:[...(view.angles||[])],hiddenCells:[...(view.hiddenCells||[])],...(view.orientationFrame?{orientationFrame:{...view.orientationFrame,matrix:Array.isArray(view.orientationFrame.matrix)?view.orientationFrame.matrix.map(row=>Array.isArray(row)?[...row]:row):view.orientationFrame.matrix}}:{})};
      const input=prepareStereographicWorkerGeometry({model:this.model,normalized:displayNormalized,edges:displayEdges,triangles:view.faces===false?[]:displayTriangles,visibility:displayVisibility,matrix:frame.matrix,angles:view.angles||[],conformingSurfaces:true,
        ...(display?{sourceVertexIds:display.sourceVertexIds,sourceVertexFaces:display.vertices.map(v=>v.face??-1),sourceVertexCells:display.vertices.map(v=>v.cell??-1),sourceEdgeIds:display.sourceEdgeIds,sourceEdgeFaces:display.edges.map(e=>e.face??-1),sourceEdgeCells:display.edges.map(e=>e.cell??-1)}:{})});
      this.stereographicInputRevision=this.stereographicInputRevision||0;
      if(this.stereographicDesiredTriangles!==displayTriangles||this.stereographicDesiredNormalized!==displayNormalized){this.stereographicInputRevision++;this.stereographicDesiredTriangles=displayTriangles;this.stereographicDesiredNormalized=displayNormalized;}
      const descriptor={revision:this.stereographicInputRevision,matrix:frame.matrix,angles:view.angles||[],visibility:this.visibilityKey,fillRule,shrink:this.effectiveCellShrink,explosion:display?{amount:display.amount,direction:display.direction}:null,
        faces:view.faces!==false,edges:view.edges!==false,vertices:view.vertices===true,vertexStyle:this.presentation.vertexStyle,edgeStyle:this.presentation.edgeStyle,vertexRadius:this.presentation.vertexRadius,edgeRadius:this.presentation.edgeRadius,surfaceColors:view.surfaceColors||'source',surfaceOpacity:view.surfaceOpacity??.22,edgeOpacity:view.edgeOpacity??.8,vertexSize:view.vertexSize??3,pickKind:view.pickKind||'vertex'};
      const requested=this.stereographicWorker.update({model:this.model,input,descriptor,camera:this.stereographicCameraMetrics(),view:ownedView,viewSignature:stereographicViewSignature(view)});
      if(!requested&&!this.stereographicWorker.transport.pending.active&&!this.stereographicWorker.transport.pending.queued)return {...this.lastDisplayStatus,stereographicPending:false};
      const pending={...(this.lastDisplayStatus||{}),explosionApplied:Boolean(display),explosionDiagnostic:this.explosionDiagnostic,orientationApplied:frame.applied,orientationDiagnostic:frame.diagnostic,facingApplied:this.facingApplied,facingCounts:this.facingCounts,facingDiagnostic:this.facingDiagnostic,stereographicPending:true,stereographicDiagnostic:this.stereographicWorkerDiagnostic||'Stereographic geometry is refining in the background; picking uses the last published pose.'};
      return pending;
    }
    const previousRenderTriangles=this.renderTriangles,previousPacked=this.stereographicGeometry?.packed;
    const stereoKey=stereo?JSON.stringify([frame.matrix,view.angles||[],this.visibilityKey,view.faces!==false,this.lastFillRule,this.effectiveCellShrink]):null;
    if(stereo){
      if(workerOptions.publication){this.stereographicGeometry=workerOptions.publication;this.stereographicKey=stereoKey;this.stereographicSourceTriangles=displayTriangles;}
      else if(previousPacked||this.stereographicKey!==stereoKey||this.stereographicSourceTriangles!==displayTriangles||workerOptions.tolerance!==undefined){
        if(typeof this.model.fingerprint==='string'&&/^[0-9a-f]{64}$/.test(this.model.fingerprint)){
          const model=this.model,display=this.explosionDisplay;
          const input=prepareStereographicWorkerGeometry({model,normalized:displayNormalized,edges:displayEdges,triangles:view.faces===false?[]:displayTriangles,visibility:displayVisibility,matrix:frame.matrix,angles:view.angles||[],conformingSurfaces:true,
            ...(display?{sourceVertexIds:display.sourceVertexIds,sourceVertexFaces:display.vertices.map(v=>v.face??-1),sourceVertexCells:display.vertices.map(v=>v.cell??-1),sourceEdgeIds:display.sourceEdgeIds,sourceEdgeFaces:display.edges.map(e=>e.face??-1),sourceEdgeCells:display.edges.map(e=>e.cell??-1)}:{})});
          const quality=planStereographicQuality({...this.stereographicCameraMetrics(),phase:'idle'}),tolerance=workerOptions.tolerance??quality.tolerance;
          const result=computeStereographicWorkerGeometry(input,{tolerance});
          const sourceKey=JSON.stringify([model.id??null,model.fingerprint]),frameKey=JSON.stringify([sourceKey,stereoKey]);
          const publication={...result,model,source:{modelId:model.id??null,fingerprint:model.fingerprint},sourceKey,frameKey,generation:0,token:1,jobId:1,phase:'idle',intermediate:false,quality:{...quality,tolerance}};
          this.stereographicGeometry=typedStereographicPublication(publication,{model,input,view,keys:{sourceKey,frameKey,generation:0}},()=>this.model===model&&this.view===view);
        }else this.stereographicGeometry=stereoDisplayGeometry(displayNormalized,displayEdges,view.faces===false?[]:displayTriangles,displayVisibility,frame.matrix,view.angles||[],workerOptions.tolerance===undefined?{}:{tolerance:workerOptions.tolerance});
        this.stereographicKey=stereoKey;this.stereographicSourceTriangles=displayTriangles;
      }
    }else {this.stereographicGeometry=null;this.stereographicKey=null;}
    const perspectiveKey=perspective?JSON.stringify([frame.matrix,view.angles||[],this.visibilityKey,view.faces!==false,this.lastFillRule,this.effectiveCellShrink,this.perspectiveSettings.distance,this.perspectiveSettings.near]):null;
    if(perspective){
      if(this.perspectiveKey!==perspectiveKey||this.perspectiveSourceTriangles!==displayTriangles){
        this.perspectiveGeometry=perspectiveDisplayGeometry(displayNormalized,displayEdges,view.faces===false?[]:displayTriangles,displayVisibility,frame.matrix,view.angles||[],this.perspectiveSettings);
        this.perspectiveKey=perspectiveKey;this.perspectiveSourceTriangles=displayTriangles;
      }
      this.perspectiveDiagnostic=[this.perspectiveDiagnostic,...this.perspectiveGeometry.diagnostics].filter(Boolean).join(' ')||null;
    }else {this.perspectiveGeometry=null;this.perspectiveKey=null;}
    const packed=this.stereographicGeometry?.packed,publicationStarted=packed?performance.now():0;
    this.renderTriangles=this.stereographicGeometry?.triangles||this.perspectiveGeometry?.triangles||null;
    if(this.explosionDisplay&&!this.renderTriangles){
      const projectPoint=p=>projectDisplayPoint(p,frame.matrix,view.angles||[],view.projection);
      this.renderTriangles=displayTriangles.flatMap(t=>{const points=t.normalized.map(projectPoint);return points.some(p=>p.clipped)?[]:[{...t,points:points.map(p=>p.point)}];});
    }
    if(packed){
      bindPackedAttribute(this.surfaceGeometry,'position',packed.triangles,3);bindPackedAttribute(this.surfaceGeometry,'normal',packed.normals,3);
      if(!previousPacked||!samePackedDisplayOwners(previousPacked,packed))this.colorKey=null;
    }else if(this.renderTriangles||previousRenderTriangles){
      const next=this.renderTriangles||this.triangles;
      if(previousPacked||this.surfaceGeometry.attributes.position.count!==next.length*3){if(previousPacked)this.surfaceGeometry.dispose();this.surfaceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(next.length*9),3));this.surfaceGeometry.deleteAttribute('normal');}
      if(previousPacked||!previousRenderTriangles||!this.renderTriangles||previousRenderTriangles.length!==this.renderTriangles.length||this.renderTriangles.some((t,i)=>t.sourceTriangle!==previousRenderTriangles[i]?.sourceTriangle||t.face!==previousRenderTriangles[i]?.face||t.cell!==previousRenderTriangles[i]?.cell))this.colorKey=null;
    }
    const attributesPrepared=packed?performance.now():0;
    this.stereographicDiagnostic=this.stereographicGeometry?.diagnostics.join(' ')||null;
    if(this.surface.material.flatShading===stereo){this.surface.material.flatShading=!stereo;this.surface.material.needsUpdate=true;}
    const colorKey=view.surfaceColors||'source';
    if(!this.net&&!this.cellNet&&this.colorKey!==colorKey){this.surfaceColors(colorKey);this.colorKey=colorKey;}
    const colorsPrepared=packed?performance.now():0;
    if(!this.net&&!this.cellNet)this.surface.material.opacity=Number.isFinite(view.surfaceOpacity)?Math.max(0,Math.min(1,view.surfaceOpacity)):(this.model.dimension===4?.22:.86);
    const transparent=this.surface.material.opacity<1||this.surfaceVertexAlpha;
    if(this.surface.material.transparent!==transparent){this.surface.material.transparent=transparent;this.surface.material.needsUpdate=true;}
    this.surface.material.depthWrite=!transparent;
    const displayPoint=p=>projectDisplayPoint(p,frame.matrix,view.angles||[],view.projection,perspective?this.perspectiveSettings:undefined);
    this.projected=this.normalized.map(displayPoint);
    if(this.explosionDisplay)this.instanceProjected=displayNormalized.map(displayPoint);
    const projectedVertices=this.instanceProjected||this.projected,vertexVisibility=this.instanceVisibility||this.visibility,vertexKind=this.explosionDisplay?'presentation vertex instances':'source vertices';
    if(stereo){const clippedVertices=projectedVertices.filter((p,i)=>p.clipped&&vertexVisibility.vertices[i]).length;if(clippedVertices)this.stereographicDiagnostic=[this.stereographicDiagnostic,`${clippedVertices} ${vertexKind} have no finite stereographic image at the pole cutoff or source center.`].filter(Boolean).join(' ');}
    if(perspective){const clippedVertices=projectedVertices.filter((p,i)=>p.clipped&&vertexVisibility.vertices[i]).length;if(clippedVertices)this.perspectiveDiagnostic=[this.perspectiveDiagnostic,`${clippedVertices} ${vertexKind} were clipped by the 4D perspective near plane or finite display bound.`].filter(Boolean).join(' ');}
    let skipped=0;
    const displayGeometry=this.stereographicGeometry||this.perspectiveGeometry;
    const edgeCount=displayGeometry?displayGeometry.edges.length:displayEdges.length;
    if(packed)bindPackedAttribute(this.edgeGeometry,'position',packed.segments,3);
    else if(previousPacked||this.edgeGeometry.attributes.position.count!==edgeCount*2){if(previousPacked)this.edgeGeometry.dispose();this.edgeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(edgeCount*6),3));}
    const edges=this.edgeGeometry.attributes.position.array;
    if(packed){this.lines.userData.sourceEdgeIds=packed.edgeIds;skipped=packed.clippedSegments;}
    else if(displayGeometry){displayGeometry.edges.forEach((segment,i)=>edges.set([...segment.a,...segment.b],i*6));this.lines.userData.sourceEdgeIds=displayGeometry.edges.map(segment=>this.explosionDisplay?this.explosionDisplay.sourceEdgeIds[segment.edge]:segment.edge);skipped=stereo?displayGeometry.clippedSegments:displayGeometry.clippedEdges;}
    else {const projected=this.instanceProjected||this.projected;displayEdges.forEach(([a,b],i)=>{const clipped=projected[a].clipped||projected[b].clipped;if(clipped)skipped++;edges.set(clipped||!displayVisibility.edges[i]?[0,0,0,0,0,0]:[...projected[a].point,...projected[b].point],i*6);});this.lines.userData.sourceEdgeIds=this.explosionDisplay?this.explosionDisplay.sourceEdgeIds:displayEdges.map((_,i)=>i);}
    this.edgeGeometry.attributes.position.needsUpdate=true;if(packed)packedGeometryBounds(this.edgeGeometry,this.stereographicGeometry.bounds);else this.edgeGeometry.computeBoundingSphere();
    const displayedPoints=this.instanceProjected||this.projected;
    if(packed){bindPackedAttribute(this.pointGeometry,'position',packed.positions,3);const indices=packedVisiblePointIndices(packed),old=this.pointGeometry.getIndex();if(old&&old.array.length===indices.length){old.array=indices;old.needsUpdate=true;}else{if(old)this.pointGeometry.dispose();this.pointGeometry.setIndex(new THREE.BufferAttribute(indices,1));}this.points.userData.sourceVertexIds=packed.vertexIds;packedGeometryBounds(this.pointGeometry,this.stereographicGeometry.bounds);}
    else {if(previousPacked||this.pointGeometry.attributes.position.count!==displayedPoints.length){if(previousPacked)this.pointGeometry.dispose();this.pointGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(displayedPoints.length*3),3));}this.pointGeometry.setIndex(null);
    const points=this.pointGeometry.attributes.position.array;displayedPoints.forEach((v,i)=>points.set(v.clipped||!displayVisibility.vertices[i]?[1e30,1e30,1e30]:v.point,i*3));this.points.userData.sourceVertexIds=this.explosionDisplay?this.explosionDisplay.sourceVertexIds:displayedPoints.map((_,i)=>i);this.pointGeometry.attributes.position.needsUpdate=true;this.pointGeometry.computeBoundingSphere();}
    const surface=this.surfaceGeometry.attributes.position.array;if(!packed)(this.renderTriangles||this.triangles).forEach((t,i)=>{
      if(displayGeometry||this.explosionDisplay){surface.set(t.points.flat(),i*9);return;}
      const projected=t.vertices?t.vertices.map(v=>this.projected[v]):t.normalized.map(displayPoint);
      const clipped=!this.visibility.faces[t.face]||projected.some(p=>p.clipped);
      surface.set(clipped?Array(9).fill(0):(this.cellNet&&t.vertices?t.vertices.map(v=>this.cellSurfacePoints[v]):projected.map(p=>p.point)).flat(),i*9);
    });this.surfaceGeometry.attributes.position.needsUpdate=true;
    if(stereo&&!packed){
      const normals=new Float32Array(this.renderTriangles.length*9);
      this.renderTriangles.forEach((triangle,i)=>{
        let values=triangle.normals;
        if(!values){const [a,b,c]=triangle.points.map(p=>new THREE.Vector3(...p)),normal=b.sub(a).cross(c.sub(a)).normalize().toArray();values=[normal,normal,normal];}
        normals.set(values.flat(),i*9);
      });this.surfaceGeometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    }else if(!packed)this.surfaceGeometry.computeVertexNormals();
    if(packed)packedGeometryBounds(this.surfaceGeometry,this.stereographicGeometry.bounds);else this.surfaceGeometry.computeBoundingSphere();
    this.surface.visible=view.faces!==false;this.points.visible=view.vertices===true;this.lines.visible=view.edges!==false;
    this.lines.material.opacity=Number.isFinite(view.edgeOpacity)?Math.max(0,Math.min(1,view.edgeOpacity)):.8;
    this.lines.material.color.set(this.surface.visible&&this.surface.material.opacity>.65?0x536779:0x9eafc0);
    this.points.material.size=Number.isFinite(view.vertexSize)?Math.max(1,Math.min(12,view.vertexSize)):3;
    this.updatePrimitives(view);
    applyViewerAppearance(this,view);
    applyMaterialEffects(this,view);
    const highlightIds=this.explosionDisplay?this.selected.flatMap(v=>this.explosionDisplay.vertexInstancesBySource[v]||[]):this.selected;
    if(this.highlightGeometry.attributes.position.count!==highlightIds.length)this.highlightGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(highlightIds.length*3),3));
    const highlight=this.highlightGeometry.attributes.position.array;highlightIds.forEach((v,i)=>{const point=displayedPoints[v];if(point)highlight.set(packed?(packed.vertexVisible[v]?packed.positions.subarray(v*3,v*3+3):[1e30,1e30,1e30]):(point.clipped||!displayVisibility.vertices[v]?[1e30,1e30,1e30]:point.point),i*3);});this.highlightGeometry.attributes.position.needsUpdate=true;this.highlightGeometry.computeBoundingSphere();
    this.updateObserverBounds(this.perspectiveGeometry||this.stereographicGeometry||this.projected);this.updateObserverFar();
    this.publishedPickState={morphFrame:this.morphFrame,view:this.view,visibility:this.visibility,instanceVisibility:this.instanceVisibility,explosionDisplay:this.explosionDisplay,projected:this.projected,instanceProjected:this.instanceProjected,renderTriangles:this.renderTriangles,triangles:this.triangles,packedDisplay:packed,pickingTriangles:this.stereographicGeometry?.pickingTriangles,contentRecipe:{net:this.net,cellNet:this.cellNet,netRadius:this.netRadius,cellFaceOwners:this.cellFaceOwners,cellVertexSources:this.cellVertexSources,center:this.center.slice(),radius:this.radius,effectiveCellShrink:this.effectiveCellShrink,explosionDisplay:this.explosionDisplay,normalized:this.normalized,cellSurfacePoints:this.cellSurfacePoints}};
    this.syncElementContent();
    if(packed)try{this.onStereographicTiming?.(Object.freeze({stage:'viewer-packed-display',jobId:packed.owner.jobId,phase:packed.phase,patches:packed.counts.patches,segments:packed.counts.segments,attributesMs:attributesPrepared-publicationStarted,colorsMs:colorsPrepared-attributesPrepared,remainingDisplayMs:performance.now()-colorsPrepared,totalMs:performance.now()-publicationStarted}));}catch{}
    return this.lastDisplayStatus={elementContentDiagnostic:this.elementContentDiagnostic,explosionApplied:Boolean(this.explosionDisplay),explosionDiagnostic:this.explosionDiagnostic,explosionCounts:this.explosionDisplay?{vertices:this.instanceVisibility.vertices.filter(Boolean).length,edges:this.instanceVisibility.edges.filter(Boolean).length,faces:this.explosionDisplay.faces.filter(f=>this.visibility.faces[f.face]&&(f.cell===null||this.visibility.activeCellSet.has(f.cell))).length,entities:this.explosionDisplay.entities.filter(e=>e.cell===null||this.visibility.activeCellSet.has(e.cell)).length,triangles:this.renderTriangles.length,amount:this.explosionDisplay.amount,direction:this.explosionDisplay.direction}:null,clippedEdges:skipped,surfaceSuppressed:this.model.faces.length>0&&!this.fillSupported,suppressedFaces:this.fillDiagnostics?.length||0,filledTriangles:this.renderTriangles?this.renderTriangles.length:this.triangles.length,fillRule,orientationApplied:frame.applied,orientationDiagnostic:frame.diagnostic,facingApplied:this.facingApplied,facingCounts:this.facingCounts,facingDiagnostic:this.facingDiagnostic,presentationDiagnostic:this.presentationDiagnostic,primitiveCounts:this.primitiveCounts,effectiveCellShrink:this.effectiveCellShrink,cellInstances:this.cellInstances,stereographicDiagnostic:this.stereographicDiagnostic,stereographicCounts:this.stereographicGeometry?{segments:this.stereographicGeometry.edges.length,triangles:this.stereographicGeometry.triangles.length,clippedSegments:this.stereographicGeometry.clippedSegments,clippedTriangles:this.stereographicGeometry.clippedTriangles,unresolvedEdges:this.stereographicGeometry.unresolvedEdges,unresolvedTriangles:this.stereographicGeometry.unresolvedTriangles}:null,perspectiveDiagnostic:this.perspectiveDiagnostic,perspectiveCounts:this.perspectiveGeometry?{segments:this.perspectiveGeometry.edges.length,triangles:this.perspectiveGeometry.triangles.length,clippedEdges:this.perspectiveGeometry.clippedEdges,clippedTriangles:this.perspectiveGeometry.clippedTriangles,omittedEdges:this.perspectiveGeometry.omittedEdges,omittedTriangles:this.perspectiveGeometry.omittedTriangles,distance:this.perspectiveSettings.distance,near:this.perspectiveSettings.near}:null};
  }
  draw(){this.controls.update();if(this.stereographicWorker?.snapshot){const camera=this.stereographicCameraMetrics();if(JSON.stringify(camera)!==JSON.stringify(this.stereographicWorker.snapshot.camera))this.setDisplay(this.view);}this.updateObserverFar();const mode=stereoMode(this.view);if(mode==='none')this.renderer.render(this.scene,this.camera);else{this.stereoRenderer??=new ViewerStereo(this.renderer);this.stereoRenderer.render(this.scene,this.camera,mode);}}
  observationCloud(){
    const published=this.publishedPickState||this;
    if(published.packedDisplay)return packedObservationCloud(published.packedDisplay);
    const points=(published.instanceProjected||published.projected||[]).filter((point,i)=>!point.clipped&&(published.instanceVisibility||published.visibility)?.vertices[i]!==false).map(point=>point.point);
    if(this.stereographicGeometry){this.stereographicGeometry.edges.forEach(segment=>points.push(segment.a,segment.b));this.stereographicGeometry.triangles.forEach(triangle=>points.push(...triangle.points));}
    if(this.perspectiveGeometry){this.perspectiveGeometry.edges.forEach(segment=>points.push(segment.a,segment.b));this.perspectiveGeometry.triangles.forEach(triangle=>points.push(...triangle.points));}
    return points;
  }
  updateObserverBounds(key,points){
    if(key===this.observerBoundsKey&&this.observerBounds)return;
    if(!points&&this.stereographicGeometry?.packed){const bounds=this.stereographicGeometry.bounds;this.observerBounds=bounds?{center:bounds.center,radius:bounds.radius}:{center:[0,0,0],radius:0};this.observerBoundsKey=key;return;}
    points=points||this.observationCloud();
    const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
    for(const point of points)for(let axis=0;axis<3;axis++){minimum[axis]=Math.min(minimum[axis],point[axis]);maximum[axis]=Math.max(maximum[axis],point[axis]);}
    const center=points.length?minimum.map((x,i)=>(x+maximum[i])/2):[0,0,0];
    const radius=points.length?Math.hypot(...maximum.map((x,i)=>(x-minimum[i])/2)):0;
    this.observerBounds={center,radius};this.observerBoundsKey=key;
  }
  updateObserverFar(points){
    if(!this.camera)return;
    if(points)this.updateObserverBounds(points,points);
    const bounds=this.observerBounds;
    const distance=bounds?Math.hypot(...bounds.center.map((x,i)=>x-this.camera.position.getComponent(i)))+bounds.radius:0;
    const far=Number.isFinite(distance)?Math.max(1000,distance*1.05+1):1000;
    if(this.camera.far!==far){this.camera.far=far;this.camera.updateProjectionMatrix();}
  }
  fit(padding=1.2){
    const points=this.observationCloud();
    const direction=this.camera.position.clone().sub(this.controls.target);if(!direction.lengthSq())direction.set(1,1,1);
    const fit=fitView(points,{aspect:this.aspect||1,direction:direction.toArray(),up:this.camera.up.toArray(),fov:this.perspectiveCamera.fov,padding});
    if(!fit)return this.cameraState();
    this.controls.target.fromArray(fit.center);this.camera.up.fromArray(fit.up);
    this.camera.position.fromArray(fit.center).addScaledVector(new THREE.Vector3(...fit.direction),fit.distance);this.camera.zoom=1;
    this.orthographicHalfHeight=fit.halfHeight;this.updateOrthographic();this.updateObserverFar(points);this.camera.updateProjectionMatrix();this.bindControls();return this.cameraState();
  }
  snap(axis='isometric'){
    const directions={x:[1,0,0],y:[0,1,0],z:[0,0,1],isometric:[1,1,1]},direction=directions[axis];
    if(!direction)throw new Error('View direction must be x, y, z, or isometric.');
    const distance=this.camera.position.distanceTo(this.controls.target)||4;
    this.camera.up.set(...(axis==='y'?[0,0,-1]:[0,1,0]));this.camera.position.copy(this.controls.target).addScaledVector(new THREE.Vector3(...direction).normalize(),distance);this.bindControls();
    return this.fit();
  }
  reset(){return this.snap('isometric');}
  cameraState(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),projection:this.cameraProjection,zoom:this.camera.zoom,up:this.camera.up.toArray(),orthographicHalfHeight:this.orthographicHalfHeight};}
  restoreCamera(value){
    if(value?.position?.length!==3||value?.target?.length!==3||![...value.position,...value.target].every(Number.isFinite))return;
    if(['orthographic','perspective'].includes(value.projection))this.setCameraProjection(value.projection,false);
    if(Number.isFinite(value.orthographicHalfHeight)&&value.orthographicHalfHeight>0)this.orthographicHalfHeight=value.orthographicHalfHeight;
    this.camera.position.fromArray(value.position);this.controls.target.fromArray(value.target);
    this.camera.up.fromArray(value.up?.length===3&&value.up.every(Number.isFinite)?value.up:[0,1,0]);
    this.camera.zoom=Number.isFinite(value.zoom)&&value.zoom>0?value.zoom:1;this.updateOrthographic();this.updateObserverFar();this.camera.updateProjectionMatrix();this.bindControls();
  }
  image(){this.draw();return this.renderer.domElement.toDataURL('image/png');}
  async prepareCapture(options={}){
    const model=this.model,view=JSON.stringify(this.view),camera=this.camera?JSON.stringify(this.cameraState()):null;
    const result=await this.prepareGeometryCapture(options);
    const materialEffects=await prepareMaterialEffects(this,options);
    if(options.signal?.aborted||options.isCurrent?.()===false||this.model!==model||JSON.stringify(this.view)!==view||(this.camera?JSON.stringify(this.cameraState()):null)!==camera)throw Object.assign(Error('Content capture source/pose changed.'),{name:'AbortError'});
    const content=await this.elementContentLayer?.prepareCapture(options);
    if(options.signal?.aborted||options.isCurrent?.()===false||this.model!==model||JSON.stringify(this.view)!==view)throw Object.assign(Error('Content capture source/pose changed.'),{name:'AbortError'});
    return {...result,materialEffects,...(content?{elementContent:content}:{})};
  }
  async prepareGeometryCapture({signal,isCurrent=()=>true}={}){
    const abort=()=>{throw Object.assign(Error('Viewport capture source or pose changed.'),{name:'AbortError'});};
    if(signal?.aborted||!isCurrent())abort();const model=this.model,view=this.view;
    if(view?.projection!=='stereographic'||(model?.embeddingDimension??model?.dimension)!==4||this.net||this.cellNet)return {complete:true,projection:view?.projection||'orthographic'};
    const cameraBefore=this.camera?JSON.stringify(this.cameraState()):null;
    if(this.stereographicCaptureFailure||this.explosionDiagnostic||(view.faces!==false&&this.fillDiagnostics?.length))throw Error(`Viewport capture requires complete requested presentation: ${this.stereographicCaptureFailure||this.explosionDiagnostic||'source face fills were omitted.'}`);
    if(this.stereographicWorker){
      if(stereographicViewSignature(this.view)!==this.stereographicWorker.snapshot?.viewSignature)abort();
      const metrics=this.stereographicCameraMetrics();if(JSON.stringify(metrics)!==JSON.stringify(this.stereographicWorker.snapshot?.camera))this.setDisplay(this.view);
      const publication=await this.stereographicWorker.capture({signal,isCurrent});
      if(signal?.aborted||!isCurrent()||this.model!==model||cameraBefore!== (this.camera?JSON.stringify(this.cameraState()):null))abort();
      if(/bound|resource limit|unsupported/i.test(this.presentationDiagnostic||''))throw Error(`Viewport capture cannot reproduce requested primitive styles: ${this.presentationDiagnostic}`);
      return {complete:true,projection:'stereographic',quality:publication.quality};
    }
    const quality=planStereographicQuality({...this.stereographicCameraMetrics(),phase:'capture'});
    if(quality.budgetSatisfied===false)throw Error('Viewport capture cannot meet its sampled pixel criterion.');
    const status=this.setDisplayNow(view,{tolerance:quality.tolerance});
    if(signal?.aborted||!isCurrent()||this.model!==model)abort();
    if(status.explosionDiagnostic||this.stereographicGeometry.complete===false||this.stereographicGeometry.diagnostics.some(d=>/bound|resource limit|source center|undefined/i.test(d)))throw Error('Viewport capture requires complete stereographic geometry; unresolved or undefined primitives remain.');
    return {complete:true,projection:'stereographic',quality,diagnostic:this.stereographicWorkerUnavailable};
  }
}
