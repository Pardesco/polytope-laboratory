import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Viewer} from '../ui/viewer.js';
import {morphSourceOwners} from '../ui/dual-morph-picking.mjs';
import {DualMorphSession,MORPH_SUPPORTED,morphEligible} from '../ui/dual-morph-session.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bootstrap='import sys;from engine import server;';
const native=request=>JSON.parse(execFileSync('python',['-B','-c',bootstrap+'import json;print(json.dumps(server.dispatch(json.loads(sys.stdin.read()))))'],{cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify(request),timeout:30000}));
const source=native({op:'generate',params:{kind:'regular',key:'cube'}});source.metadata.coordinateUnits='mm';source.metadata.literal={records:[1,.125,'retain']};source.metadata.offColors={faces:source.faces.map(()=>({encoding:'byte',values:[50,100,150,127]}))};
const setting={version:1,enabled:true,method:'tilting-to-compound',center:null,radius:Math.SQRT2,ratio:.25,duration:2,loop:false};
const view={coordinateUnit:'mm',projection:'orthographic',angles:Array(6).fill(0),faces:true,vertices:true,edges:true,surfaceColors:'source',surfaceOpacity:1};
function viewer(model){
  const v=Object.create(Viewer.prototype);v.group=new THREE.Group();v.setModel(model);v.cameraProjection='orthographic';v.orthographicHalfHeight=2;
  v.camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);v.orthographicCamera=v.camera;v.perspectiveCamera=new THREE.PerspectiveCamera(38,1,.01,1000);
  v.camera.position.set(0,0,5);v.camera.lookAt(0,0,0);v.camera.updateMatrixWorld();v.controls={target:new THREE.Vector3(),update(){}};
  v.renderer={domElement:{getBoundingClientRect:()=>({width:400,height:400})},render(){}};return v;
}
test('seventh mode uses actual controller/native route/Viewer and reconstructs the saved source pose',async()=>{
  const state={model:structuredClone(source),notes:'Literal original notes.',view:structuredClone(view)},document={id:'triangles',cursor:0,states:[]};document.states=[state];const project={format:'polytope-laboratory',version:1,active:0,documents:[document]},v=viewer(state.model),before=structuredClone(state),radius=v.radius;
  const context={getState:()=>state,getDocument:()=>document,getProject:()=>project,isExporting:()=>false,
    prepare:async(model,settings,sourceContext)=>native({op:'prepare-dual-morph',model,params:{settings,sourceContext}}),
    evaluate:async(model,prepared,ratio,sourceContext)=>native({op:'evaluate-dual-morph',model,params:{prepared,ratio,sourceContext}}),
    render:(frame,o)=>v.setMorphFrame(frame,state.model,state.view,o),clear:()=>v.clearMorph(state.model,state.view),prepareCapture:o=>v.prepareCapture(o),onState(){},markDirty(){}};
  const session=new DualMorphSession(context);assert.ok(MORPH_SUPPORTED.includes('tilting-to-compound'));assert.equal(morphEligible(source,'tilting-to-compound'),true);assert.equal(morphEligible({...source,dimension:4,embeddingDimension:4},'tilting-to-compound'),false);
  try{
    let frame=await session.configure(setting);v.select([0]);for(const ratio of [.5,.75,.25]){
      frame=await session.seek(ratio);assert.equal(frame.model.faces.length,ratio===.5?14:ratio===.75?32:30);assert.equal(v.pointGeometry.attributes.position.count,frame.model.vertices.length);assert.equal(v.edgeGeometry.attributes.position.count,frame.model.edges.length*2);assert.equal(v.radius,radius);assert.deepEqual(v.morphSelectedSourceIds,[0]);assert.ok(v.selected.length);assert.equal(v.surfaceGeometry.attributes.color.itemSize,4);assert.equal(v.surfaceVertexAlpha,true);
      assert.ok(Array.from(v.surfaceGeometry.attributes.color.array).some((x,i)=>i%4===3&&Math.abs(x-127/255)<1e-7));
      for(const [kind,field] of [['vertex','vertices'],['edge','edges'],['face','faces']])for(let i=0;i<frame.model[field].length;i++){const owners=morphSourceOwners(frame,kind,i);assert.ok(owners.length);for(const owner of owners)assert.ok(source[{vertex:'vertices',edge:'edges',face:'faces'}[owner.kind]][owner.id]);}
    }
    await session.prepareCapture();assert.equal(v.morphFrame.ratio,.25);assert.deepEqual(state.model,before.model);assert.equal(state.notes,before.notes);assert.equal(state.view.coordinateUnit,'mm');
    const saved=native({op:'validate-project',params:{project}}),restored=saved.documents[0].states[0];assert.deepEqual(restored.model,JSON.parse(JSON.stringify(state.model)));assert.equal(restored.view.dualMorph.method,'tilting-to-compound');const prepared=await context.prepare(restored.model,restored.view.dualMorph,{notes:restored.notes,unit:'mm'}),rebuilt=await context.evaluate(restored.model,prepared,.25,{notes:restored.notes,unit:'mm'});assert.deepEqual(rebuilt.model,frame.model);assert.deepEqual(rebuilt.sourceMaps,frame.sourceMaps);
  }finally{session.invalidate();v.clear();}
});
