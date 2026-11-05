import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {rememberElementTypes} from '../ui/element-types.mjs';
import {fakeRenderer} from '../tests/helpers/fake-renderer.mjs';
import {distribution} from './model-view-profile-metrics.cjs';

export const DENSE_KEYS=['cell120','cell600','uniform4-gap','uniform4-rox','uniform4-tex','compound-five-24-cells','compound-five-rhombicuboctahedra'];
export const geometryHash=model=>createHash('sha256').update(JSON.stringify(['vertices','edges','faces','cells'].map(k=>model[k]))).digest('hex');
export function cpuViewer(model,ViewerClass=Viewer){
  const v=Object.create(ViewerClass.prototype);v.group=new THREE.Group();
  v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=v.orthographicCamera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);
  v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);
  v.camera.position.set(0,0,6);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();
  v.controls={target:new THREE.Vector3(),update(){}};v.renderer=fakeRenderer({width:1920,height:1080});
  v.stereographicWorkerFactory=()=>null;v.setModel(model,{deferDisplay:true});return v;
}
// Deliberately synthetic palette groups: this times rendering, not symmetry computation.
export function seedBenchmarkTypes(model){
  rememberElementTypes(model,{available:true,types:Object.fromEntries(['face','cell'].map(kind=>[kind,[0,1].map(typeId=>({typeId,ids:model[kind==='face'?'faces':'cells'].flatMap((_,i)=>i%2===typeId?[i]:[])}))]))});
}
export function benchmarkModel(model,{ViewerClass=Viewer,samples=9,warmup=3,modes=['orthographic','perspective','stereographic']}={}){
  assert.ok(Number.isInteger(samples)&&samples>0);assert.ok(Number.isInteger(warmup)&&warmup>=0);
  const before=geometryHash(model),rows=[];seedBenchmarkTypes(model);
  for(const projection of modes){
    const v=cpuViewer(model,ViewerClass),base={projection,angles:[13,5,19,7,11,3],faces:true,edges:true,vertices:true,surfaceColors:'source'};
    let frame=0;const rotate=()=>({...base,angles:model.embeddingDimension===3?[13+(++frame)*.37,5,19,7,11,3]:[13,5,19+(++frame)*.37,7,11,3]});
    const measure=(task,action,prepare=()=>{})=>{
      const values=[];
      for(let i=-warmup;i<samples;i++){prepare(i);const start=performance.now();action(i);const ms=performance.now()-start;if(i>=0)values.push(ms);}
      rows.push({projection,task,...distribution(values)});
    };
    try{
      v.setDisplay(base);
      measure('rotation',()=>v.setDisplay(rotate()));
      for(const kind of ['edge','face']){
        const field=kind==='edge'?'edges':'faces',ids=model[field].flatMap((_,i)=>i%5===0?[i]:[]);
        v.selectEntities(kind,ids);
        measure('highlight-'+kind,()=>v.updateEntitySelection(),()=>{v.setDisplay(rotate());});
        measure('rotation-selected-'+kind,()=>v.setDisplay(rotate()));
      }
      v.select([]);
      for(const kind of ['vertex','edge','face']){
        v.setDisplay({...base,pickKind:kind});
        measure('hover-'+kind, i=>v.pickAt(960+(i%3)*3,540+(i%2)*3,{hover:true}));
        measure('hover-first-'+kind,i=>v.pickAt(960+(i%3)*3,540+(i%2)*3,{hover:true}),()=>v.setDisplay({...rotate(),pickKind:kind}));
      }
      if(model.cells?.length)measure('cell-visibility',i=>v.setDisplay({...base,hiddenCells:i%2?[0]:[]}),()=>{v.select([]);});
      else rows.push({projection,task:'cell-visibility',available:false,reason:'The 3D source has no 4D cells.'});
      measure('color-by-type',i=>v.setDisplay({...base,surfaceColors:i%2?'face-type':'cell-type'}));
      rows.push({projection,task:'status',status:v.lastDisplayStatus,packed:!!v.stereographicGeometry?.packed,
        displayed:{segments:v.edgeGeometry.attributes.position.count/2,triangles:v.surfaceGeometry.attributes.position.count/3}});
    }finally{v.clear();}
  }
  assert.equal(geometryHash(model),before,'Benchmark must not mutate native geometry');
  return {name:model.name,sourceGeometrySha256:before,counts:Object.fromEntries(['vertices','edges','faces','cells'].map(k=>[k,model[k]?.length||0])),rows};
}
