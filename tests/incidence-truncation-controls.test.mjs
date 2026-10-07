import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {IncidenceTruncationControls} from '../ui/incidence-truncation-controls.mjs';

function fixture(){
  const nodes=Object.fromEntries(Object.entries({preset:'manual',amount:'1 + sqrt(2)/2',reference:'',colors:'inherit'}).map(([id,value])=>['incidence-cut-'+id,{value}]));
  for(const id of ['preview-incidence-cut','adopt-incidence-cut','cancel-incidence-cut','incidence-cut-result'])nodes[id]={textContent:'',disabled:false};
  const model={id:'source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
    edges:[[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]],faces:[[0,1,2],[0,1,3],[1,2,3],[0,2,3]],cells:[],metadata:{coordinateUnits:'mm'}};
  const state={model,view:{coordinateUnit:'mm'},notes:'Original notes'},doc={id:'doc',cursor:0,states:[state]},project={id:'project',active:0,documents:[doc]},calls=[];
  const construction={sourceModelId:model.id,sourceModel:structuredClone(model),closedIncidence:true,hullUsed:false,solidInteriorInferred:false,parameters:{amount:1+Math.sqrt(2)/2}};
  const packet={construction,model:{...structuredClone(model),validation:{passed:true},metadata:{incidenceTruncation:structuredClone(construction)}}};
  const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,
    evaluateMany:async(parts,{mode})=>{assert.equal(mode,'real');return parts.map(p=>p==='1 + sqrt(2)/2'?1+Math.sqrt(2)/2:Number(p));},
    preview:async(op,params,options)=>{options.verifyPublication();calls.push([op,params,options]);return structuredClone(packet);},
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push([op,params,options]);return 'adopted';}};
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(IncidenceTruncationControls.prototype),{context,panel,busy:false,previewData:null});controls.sync();
  return {controls,context,state,doc,nodes,packet,calls};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('manual deep expression and regular-face/reference presets publish through current source fences',async()=>{
  const f=fixture(),before=structuredClone(f.state);await f.controls.preview();
  assert.deepEqual(f.calls[0].slice(0,2),['incidence-truncate-preview',{preset:'manual',amount:1+Math.sqrt(2)/2,reference_face:null,cap_colors:'inherit'}]);
  assert.equal(await f.controls.adopt(),'adopted');assert.equal(f.calls[1][0],'incidence-truncate');assert.deepEqual(f.state,before);
  const q=fixture();q.nodes['incidence-cut-preset'].value='quasi';q.nodes['incidence-cut-reference'].value='2';await q.controls.preview();
  assert.equal(q.calls[0][1].reference_face,2);assert.equal(q.calls[0][1].preset,'quasi');assert.equal(q.nodes['incidence-cut-amount'].disabled,true);
});

test('held cut responses refuse changed notes, depth, history, cancellation and native ownership',async()=>{
  for(const change of [f=>f.state.notes='Changed',f=>f.nodes['incidence-cut-amount'].value='2',f=>f.doc.operationHistory={edited:true},f=>f.controls.cancel()]){
    const f=fixture();let resolve;f.context.preview=()=>new Promise(r=>resolve=r);const pending=f.controls.preview();await tick();change(f);resolve(f.packet);
    await assert.rejects(pending,/changed|canceled/);assert.equal(f.controls.previewData,null);assert.equal(f.controls.busy,false);
  }
  const f=fixture();f.packet.construction.sourceModel.metadata.coordinateUnits='cm';await assert.rejects(f.controls.preview(),/source receipt/);
});

test('actual native quasitruncated cube displays literal star cycles and raw alpha in production Viewer',()=>{
  const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
  const bootstrap=`import sys,json\nfrom engine import server\nif len(sys.argv)>1:\n import importlib.util\n spec=importlib.util.spec_from_file_location('engine.incidence_truncation',sys.argv[1]);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)\n previous=server.dispatch\n server.dispatch=lambda request:module.dispatch_incidence_truncation(request) if request.get('op') in ('incidence-truncate','incidence-truncate-preview') else previous(request)\nrequest=json.loads(sys.stdin.read());print(json.dumps(server.dispatch(request)))`;
  const native=request=>JSON.parse(execFileSync('python',['-B','-c',bootstrap,...(process.env.POLYTOPE_CUT_STAGE?[process.env.POLYTOPE_CUT_STAGE]:[])],
    {cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify(request),timeout:30000}));
  const source=native({op:'generate',params:{kind:'regular',key:'cube'}});source.metadata.coordinateUnits='mm';
  source.metadata.offColors={faces:source.faces.map(()=>({encoding:'byte',values:[20,40,80,127]}))};
  const packet=native({op:'incidence-truncate-preview',model:source,params:{preset:'quasi'}}),m=packet.model,v=Object.create(Viewer.prototype);v.group=new THREE.Group();
  try{v.setModel(m);v.setDisplay({projection:'orthographic',angles:Array(6).fill(0),faces:true,vertices:true,edges:true,surfaceColors:'source',surfaceOpacity:1});
    assert.equal(v.pointGeometry.attributes.position.count,24);assert.equal(m.faces.length,14);assert.equal(m.faces[0].length,8);
    assert.equal(v.surfaceGeometry.attributes.color.itemSize,4);assert.equal(v.surfaceVertexAlpha,true);
    assert.ok(Array.from(v.surfaceGeometry.attributes.color.array).some((value,i)=>i%4===3&&Math.abs(value-127/255)<1e-7));
    assert.equal(m.interpretation,'generalized-complex');assert.equal(packet.construction.solidInteriorInferred,false);
    assert.equal(packet.construction.sourceModel.metadata.coordinateUnits,'mm');assert.equal(packet.construction.sourceMaps.vertexCaps.length,8);
  }finally{v.clear();}
});
