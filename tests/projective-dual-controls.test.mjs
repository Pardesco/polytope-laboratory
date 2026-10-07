import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProjectiveDualControls} from '../ui/projective-dual-controls.mjs';
import {projectiveWireObjects} from '../ui/projective-dual-viewer.mjs';
const fixture=JSON.parse(execFileSync('python',['-B','-c',`import json
from engine.generators import regular
from engine.projective_dual_workflow import run_projective,source_context
from engine.projective_incidence_dual import projective_dual
p=regular('antiprism-u3');p['metadata'].update(coordinateUnits='mm',offColors={'faces':[{'encoding':'byte','values':[20,80,140,127]} for f in p['faces']]})
d=run_projective({'id':'u3','cursor':0,'states':[{'model':p,'view':{'coordinateUnit':'mm'},'notes':'Source notes'}]},{'clipBound':4})
s=d['states'][-1];print(json.dumps({'document':d,'record':projective_dual(s['model'],s['view']['projectiveDual']['settings'],source_context(s))}))`],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024}));
function environment(){const document=structuredClone(fixture.document),state=document.states.at(-1),project={active:0,documents:[document]},views=[],images=[];let current=state;
 const context={getState:()=>current,getProject:()=>project,getDocument:()=>document,isExporting:()=>false,run:async(op,params,model)=>JSON.parse(execFileSync('python',['-B','-c',"import json,sys;from engine import server;print(json.dumps(server.dispatch(json.load(sys.stdin))))"],{cwd:fileURLToPath(new URL('../',import.meta.url)),input:JSON.stringify({op,params,model}),windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024})),markDirty(){},saveImage:async i=>images.push(i),openView:(record,o)=>{const view={record,options:o,selected:[],select:(...args)=>view.selected.push(args),destroy(){view.closed=true;},image:()=>JSON.stringify(record.edges.map(e=>e.clipPoints))};views.push(view);return view;}};
 return {state,document,project,context,views,images,setState:s=>current=s,controls:new ProjectiveDualControls(context,{mount:false})};
}
test('actual Three wire objects retain source IDs and literal color alpha with no fake ideal vertices',()=>{
 const record=fixture.record,group=projectiveWireObjects(record),lines=group.children.filter(o=>o.isLine),points=group.children.find(o=>o.isPoints);
 try{assert.equal(lines.length,24);assert.equal(points.userData.sourceFaces.length,8);assert.equal(record.vertices.filter(v=>v.kind==='ideal-numerical').length,4);assert.deepEqual(lines.map(o=>o.userData.sourceEdge),record.edges.map(e=>e.sourceEdge));assert.equal(lines[0].material.opacity,127/255);assert.equal(lines[0].material.color.r,20/255);
  for(const line of lines)for(const x of line.geometry.attributes.position.array)assert.ok(Math.abs(x)<=4+1e-6);
 }finally{group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
});
test('source-bound controller selects reciprocal IDs, saves independent camera/PNG, and closes on source change',async()=>{
 const e=environment(),before=structuredClone(e.state.model),selected=[];e.context.onSelect=(...args)=>selected.push(args);
 await e.controls.preview();e.controls.select('vertex',8);e.controls.select('face',0);assert.deepEqual(selected,[['face',8],['vertex',0]]);e.controls.saveCamera({position:[8,0,0],target:[0,0,0],up:[0,1,0],zoom:1});await e.controls.export();assert.equal(e.images.length,1);assert.deepEqual(e.state.model,before);
 e.state.view.angles=[90,0,0,0,0,0];e.controls.sync();assert.equal(e.views[0].closed,undefined,'main source observer is independent');e.state.notes='Changed';e.controls.sync();assert.equal(e.views[0].closed,true);assert.equal(e.controls.owner,null);
});
test('held native replies, stale saved bindings and exports cannot publish after source/content/unit cancellation',async()=>{
 for(const mutate of [e=>e.state.notes='late',e=>e.state.model.metadata.offColors.faces[0].values[3]=120,e=>e.state.view.coordinateUnit='cm',e=>e.state.view.elementAnnotations={entries:[]},e=>e.setState({...e.state}),e=>e.controls.cancel()]){
  const e=environment();let release;e.context.run=()=>new Promise(r=>release=r);const pending=e.controls.preview();mutate(e);release(structuredClone(fixture.record));await assert.rejects(pending,/changed|canceled/);assert.equal(e.views.length,0);
 }
 const e=environment();e.state.notes='already changed';await assert.rejects(e.controls.preview(),/no longer matches/);assert.equal(e.views.length,0);
 const f=environment();f.context.isExporting=()=>true;await assert.rejects(f.controls.preview(),/export/);assert.equal(f.views.length,0);
});
