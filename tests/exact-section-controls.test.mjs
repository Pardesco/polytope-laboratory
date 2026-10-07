import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {Viewer} from '../ui/viewer.js';
import {ExactSectionControls} from '../ui/exact-section-controls.mjs';

function fixture(){
  const nodes=Object.fromEntries(Object.entries({normal:'0,0,1',offset:'1/6 + 1/6',fill:'even-odd'}).map(([id,value])=>['exact-section-'+id,{value}]));
  for(const id of ['preview-exact-section','adopt-exact-section','cancel-exact-section','exact-section-result'])nodes[id]={textContent:'',disabled:false};
  const model={id:'source',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',vertices:[[0,0,0],[1,0,0],[0,1,0]],edges:[[0,1],[1,2],[0,2]],faces:[[0,1,2]],cells:[],metadata:{coordinateUnits:'mm'}};
  const state={model,view:{coordinateUnit:'mm'},notes:'Original notes'},doc={id:'doc',cursor:0,states:[state]},project={id:'project',active:0,documents:[doc]},calls=[];
  const packet={status:'surface-intersection',exact:{exactConstruction:true,sourceModelId:model.id,sourceModel:structuredClone(model)},model:{...structuredClone(model),dimension:2,embeddingDimension:3,interpretation:'surface-section',rationalCoordinates:[['0','0','0'],['1','0','0'],['0','1','0']]}};
  const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,isExporting:()=>false,
    evaluateMany:async(parts,{mode})=>{assert.equal(mode,'rational');return parts.map(p=>p==='1/6 + 1/6'?'1/3':p);},
    preview:async(op,params,options)=>{options.verifyPublication();calls.push([op,params,options]);return structuredClone(packet);},
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push([op,params,options]);return 'adopted';}};
  const panel={querySelector:s=>nodes[s.slice(1)],querySelectorAll:()=>Object.values(nodes)};
  const controls=Object.assign(Object.create(ExactSectionControls.prototype),{context,panel,busy:false,previewData:null});controls.sync();
  return {controls,context,state,doc,nodes,packet,calls};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('exact normal/offset expressions, winding and adoption retain source ownership',async()=>{
  const f=fixture(),before=structuredClone(f.state);await f.controls.preview();
  assert.deepEqual(f.calls[0].slice(0,2),['exact-surface-section-preview',{normal:['0','0','1'],offset:'1/3',fill_rule:'even-odd'}]);
  assert.equal(await f.controls.adopt(),'adopted');assert.equal(f.calls[1][0],'exact-surface-section');assert.deepEqual(f.state,before);
  const empty=fixture();empty.packet.model=null;empty.packet.status='empty';await empty.controls.preview();assert.equal(empty.nodes['adopt-exact-section'].disabled,true);
  await assert.rejects(empty.controls.adopt(),/nonempty/);
});

test('held exact responses refuse changed notes, plane, history, cancellation and wrong native source',async()=>{
  for(const change of [f=>f.state.notes='Changed',f=>f.nodes['exact-section-offset'].value='2',f=>f.doc.operationHistory={edited:true},f=>f.controls.cancel()]){
    const f=fixture();let resolve;f.context.preview=()=>new Promise(r=>resolve=r);const pending=f.controls.preview();await tick();change(f);resolve(f.packet);
    await assert.rejects(pending,/changed|canceled/);assert.equal(f.controls.previewData,null);assert.equal(f.controls.busy,false);
  }
  const f=fixture();f.packet.exact.sourceModel.metadata.coordinateUnits='cm';await assert.rejects(f.controls.preview(),/source receipt/);
});

test('actual native rational planes retain XYZ metric and coplanar raw alpha through production Viewer',()=>{
  const root=process.env.POLYTOPE_TEST_ROOT??fileURLToPath(new URL('../',import.meta.url));
  const bootstrap=`import sys,json\nfrom engine import server\nif len(sys.argv)>1:\n import importlib.util\n spec=importlib.util.spec_from_file_location('engine.exact_surface_sections',sys.argv[1]);module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)\n previous=server.dispatch\n server.dispatch=lambda request:module.dispatch_exact_section(request) if request.get('op') in ('exact-surface-section','exact-surface-section-preview') else previous(request)\nrequest=json.loads(sys.stdin.read());print(json.dumps(server.dispatch(request)))`;
  const native=request=>JSON.parse(execFileSync('python',['-B','-c',bootstrap,...(process.env.POLYTOPE_EXACT_STAGE?[process.env.POLYTOPE_EXACT_STAGE]:[])],
    {cwd:root,windowsHide:true,encoding:'utf8',input:JSON.stringify(request),timeout:30000}));
  const source=native({op:'generate',params:{kind:'regular',key:'cube'}});source.metadata.coordinateUnits='mm';
  source.metadata.offColors={faces:source.faces.map(()=>({encoding:'byte',values:[20,40,80,127]}))};
  for(const params of [{normal:['1','1','1'],offset:'1/3'},{normal:['0','0','1'],offset:'1'}]){
    const packet=native({op:'exact-surface-section-preview',model:source,params}),m=packet.model,v=Object.create(Viewer.prototype);v.group=new THREE.Group();
    try{v.setModel(m);v.setDisplay({projection:'orthographic',angles:Array(6).fill(0),faces:true,vertices:true,edges:true,surfaceColors:'source',surfaceOpacity:1});
      assert.equal(v.pointGeometry.attributes.position.count,m.vertices.length);assert.equal(v.normalized[0].length,3);
      if(params.normal[0]==='1')for(const {point:p,clipped} of v.projected){assert.equal(clipped,false);assert.ok(Math.abs(p[0]+p[1]+p[2])<1e-12);}
      else{assert.equal(m.faces.length,1);assert.equal(v.surfaceGeometry.attributes.color.itemSize,4);assert.equal(v.surfaceVertexAlpha,true);
        assert.ok(Array.from(v.surfaceGeometry.attributes.color.array).some((value,i)=>i%4===3&&Math.abs(value-127/255)<1e-7));}
    }finally{v.clear();}
  }
});
