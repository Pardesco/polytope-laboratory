import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {capturePrintableDisplay,printableDisplaySignature,PrintableExportControls} from '../ui/printable-export.mjs';
import {GeometryExportSession} from '../ui/geometry-export-session.mjs';
import {perspectiveDisplayGeometry} from '../ui/viewer-perspective.mjs';
import {stereoDisplayGeometry} from '../ui/viewer-stereographic.mjs';
import {project,rotate} from '../ui/projection.js';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';

const geometry=rows=>({attributes:{position:{array:new Float32Array(rows.flat(Infinity)),version:1,count:rows.flat(Infinity).length/3}}});
const source=JSON.parse(execFileSync('python',['-c',"import json;from engine.generators import regular;print(json.dumps(regular('tesseract')))"],{encoding:'utf8'}));
function viewer(mode='perspective'){
  const normalized=source.vertices.map(p=>p.map(x=>x/2)),angles=[0,0,24,0,18,0],visibility={vertices:source.vertices.map(()=>true),edges:source.edges.map(()=>true),faces:source.faces.map(()=>true)};
  const display=mode==='perspective'?perspectiveDisplayGeometry(normalized,source.edges,[],visibility,null,angles):stereoDisplayGeometry(normalized,source.edges,[],visibility,null,angles,{tolerance:.01});
  const projected=normalized.map(p=>project(rotate(p,angles),mode));
  return {model:source,view:{projection:mode,angles},projected,visibility,perspectiveGeometry:mode==='perspective'?display:null,stereographicGeometry:mode==='stereographic'?display:null,
    pointGeometry:geometry(projected.map(p=>p.point)),edgeGeometry:geometry(display.edges.map(s=>[s.a,s.b])),surfaceGeometry:geometry([]),triangles:[],prepareGeometryCapture:async()=>({complete:true})};
}

test('actual perspective display buffers export 32 rods and 16 nodes through native dispatch',()=>{
  const v=viewer(),snapshot=capturePrintableDisplay(v,source),before=structuredClone(snapshot);
  assert.equal(snapshot.edges.length,32);assert.equal(snapshot.nodes.length,16);
  const script="import json,sys;from engine.server import dispatch;r=dispatch(json.load(sys.stdin));print(json.dumps(r['report']))";
  const report=JSON.parse(execFileSync('python',['-c',script],{input:JSON.stringify({op:'prepare-printable-export',model:source,params:{display:snapshot,size_mm:125,segments:8}}),encoding:'utf8'}));
  assert.equal(report.struts,32);assert.equal(report.nodes,16);assert.equal(report.arcJoints,0);assert.equal(report.shellCount,48);
  assert.ok(Math.abs(Math.max(...report.boundsMM.size)-125)<1e-10);assert.deepEqual(snapshot,before);
});

test('stereographic struts preserve the displayed curved tessellation and detach all buffers',()=>{
  const v=viewer('stereographic'),snapshot=capturePrintableDisplay(v,source);
  assert.ok(snapshot.edges.length>32);assert.equal(snapshot.edges.length,v.stereographicGeometry.edges.length);
  const old=snapshot.edges[0][0][0];v.edgeGeometry.attributes.position.array[0]=900;
  assert.equal(snapshot.edges[0][0][0],old);
  const s=printableDisplaySignature(v);v.edgeGeometry.attributes.position.version++;
  assert.notEqual(printableDisplaySignature(v),s);
});

test('hidden and clipped nodes are excluded and packed arc buffers follow the same ownership',()=>{
  const v=viewer();v.projected[0].clipped=true;v.visibility.vertices[1]=false;
  assert.equal(capturePrintableDisplay(v,source).nodes.length,14);
  v.publishedPickState={packedDisplay:{positions:new Float32Array([0,0,0,1,2,3]),vertexVisible:new Uint8Array([1,0]),faceIds:new Uint32Array([2])}};
  v.surfaceGeometry=geometry([[[0,0,0],[1,0,0],[0,1,0]]]);
  const snapshot=capturePrintableDisplay(v,source,'panels');assert.deepEqual(snapshot.nodes,[[0,0,0]]);assert.deepEqual(snapshot.face_ids,[2]);
  assert.equal(snapshot.triangles.length,1);
});

test('incomplete projections, omitted fills, hidden faces and mismatched display sources refuse clearly',()=>{
  const v=viewer();assert.throws(()=>capturePrintableDisplay(v,structuredClone(source)),/finish displaying/);
  v.perspectiveGeometry.diagnostics=['4D perspective resource limit reached; omitted patches.'];
  assert.throws(()=>capturePrintableDisplay(v,source),/complete finite/);
  v.perspectiveGeometry.diagnostics=[];v.view.faces=false;
  assert.throws(()=>capturePrintableDisplay(v,source,'panels'),/Enable faces/);
  v.view.faces=true;v.fillDiagnostics=['a face has no fill'];assert.throws(()=>capturePrintableDisplay(v,source,'panels'),/fill diagnostics/);
  v.stereographicGeometry={complete:false};assert.throws(()=>capturePrintableDisplay(v,source),/complete display/);
});

function controlsFixture(){
  const f=numericControlFixture(PrintableExportControls.prototype,Object.fromEntries(Object.entries({mode:'strut',size:'2+3',strut:'sqrt(4)',node:'3',thickness:'1.6',segments:'32/2'}).map(([k,v])=>['printable-'+k,v])));
  f.nodes['export-kind']={value:'printable'};f.nodes['printable-ascii']={checked:false};
  const v=viewer();v.model=f.state.model;
  f.context.getGeometry=()=>f.state.model;f.context.getViewer=()=>v;
  f.context.preparePrintable=async(m,p,o)=>{f.calls.push([m,p,o]);return {text:'prepared',report:{}};};
  return {...f,v};
}

test('printable fields use NumericEntry expressions, native bounds and the current display snapshot',async()=>{
  const f=controlsFixture(),result=await f.control.prepare(f.state.model,{format:'3mf',source_unit:'mm'},{signal:new AbortController().signal});
  assert.equal(result.text,'prepared');const p=f.calls[0][1];
  assert.equal(p.size_mm,5);assert.equal(p.strut_mm,2);assert.equal(p.segments,16);assert.equal(p.target_unit,'mm');assert.equal(p.format,'3mf');
  assert.equal(p.display.nodes.length,16);assert.equal(f.expressionCalls.length,1);
  f.nodes['printable-segments'].value='9';await assert.rejects(f.control.prepare(f.state.model,{format:'stl',source_unit:'model'},{signal:new AbortController().signal}),/multiple of 4/);
  assert.equal(f.calls.length,1);
});

test('numeric or display pose changes during native preparation refuse stale printable output',async()=>{
  for(const change of [f=>f.v.view.angles[2]=33,f=>f.nodes['printable-size'].value='50']){
    const f=controlsFixture(),gate=deferred();f.context.preparePrintable=()=>gate.promise;
    const pending=f.control.prepare(f.state.model,{format:'stl',source_unit:'mm'},{signal:new AbortController().signal});await flush();change(f);
    gate.resolve({text:'old',report:{}});await assert.rejects(pending,/target fields changed|Display pose changed/);
  }
});

function sessionFixture(){
  const f=numericControlFixture(Object.prototype,{}),selection={source:'base',format:'stl',unit:'mm',printable:{enabled:true}},events=[];
  let pose='pose0';f.context.getGeometry=()=>f.state.model;f.context.getSelection=()=>selection;f.context.getDisplaySignature=()=>pose;
  f.context.describe=async()=>({formats:[{format:'stl',available:true},{format:'3mf',available:true}]});
  f.context.prepare=async(m,p)=>({text:btoa('binary\0payload'),report:{sourceUnit:p.source_unit,targetUnit:p.target_unit,losses:[],encoding:'base64'}});
  f.context.api={beginGeometryExport:async()=>({id:'ticket'}),writeGeometryExport:async(id,data)=>{events.push(['write',data]);return {path:'selected.stl'};},abortGeometryExport:async id=>events.push(['abort',id])};
  return {...f,selection,events,session:new GeometryExportSession(f.context),setPose:p=>{pose=p;}};
}

test('reviewed binary STL and 3MF decode to bytes only at the existing bounded atomic publisher',async()=>{
  for(const format of ['stl','3mf']){
    const f=sessionFixture();f.selection.format=format;await f.session.prepare();await f.session.confirm();
    assert.ok(f.events[0][1] instanceof Uint8Array);assert.equal(new TextDecoder().decode(f.events[0][1]),'binary\0payload');
  }
});

test('a display change while the chooser is held aborts its ticket before any write',async()=>{
  const f=sessionFixture(),gate=deferred();await f.session.prepare();f.context.api.beginGeometryExport=()=>gate.promise;
  const pending=f.session.confirm();await flush();f.setPose('new projected geometry');gate.resolve({id:'late'});
  await assert.rejects(pending,/changed/);assert.deepEqual(f.events,[['abort','late']]);
});

test('capture refinement preserves source ownership and a changed source cannot be recaptured silently',async()=>{
  const f=sessionFixture(),gate=deferred();f.context.beforeCapture=()=>gate.promise;
  const pending=f.session.prepare();await flush();f.state.model.vertices[0][0]=8;gate.resolve();
  await assert.rejects(pending,/changed/);assert.equal(f.session.prepared,null);
});

test('print workflow is mounted in Export, uses millimeters, and is allowed through IPC and the warm worker',()=>{
  const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
  assert.match(read('ui/export-controls.mjs'),/new PrintableExportControls/);
  for(const id of ['export-kind','printable-mode','printable-size','printable-strut','printable-node','printable-thickness','printable-segments','printable-ascii'])assert.ok(read('ui/printable-export.mjs').includes('id="'+id+'"'));
  assert.match(read('ui/app.js'),/preparePrintable:.*run\('prepare-printable-export'/);
  assert.match(read('desktop/main.cjs'),/allowed.add\('prepare-printable-export'\)/);
  assert.match(read('desktop/engine-pool.cjs'),/REUSABLE_OPERATIONS.add\('prepare-printable-export'\)/);
});
