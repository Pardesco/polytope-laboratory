import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {PrintableExportControls} from '../ui/printable-export.mjs';
import {GeometryExportSession} from '../ui/geometry-export-session.mjs';
import {numericControlFixture,deferred,flush} from './numeric-control-fixture.mjs';

function fixture(){
  const f=numericControlFixture(PrintableExportControls.prototype,{'printable-mode':'solid','printable-size':'100','printable-strut':'2','printable-node':'3','printable-thickness':'1.6','printable-segments':'16','printable-wall':'1+1','printable-fill':'even-odd'});
  f.nodes['export-kind']={value:'printable'};f.nodes['printable-hollow']={checked:true};f.nodes['printable-ascii']={checked:false};
  const geometry=rows=>({attributes:{position:{array:new Float32Array(rows.flat(Infinity)),version:1}}});
  const m=f.state.model,v={model:m,view:{faces:true},projected:m.vertices.map(point=>({point})),visibility:{vertices:m.vertices.map(()=>true)},
    pointGeometry:geometry(m.vertices),edgeGeometry:geometry(m.edges.map(e=>e.map(i=>m.vertices[i]))),surfaceGeometry:geometry([])};
  f.context.getGeometry=()=>m;f.context.getViewer=()=>v;
  f.context.preparePrintable=async(model,params,options)=>{f.calls.push([model,params,options]);return {text:'ready',report:{}};};
  return {...f,v};
}

test('Solid offers GLB and resolves hollow thickness through NumericEntry',async()=>{
  const f=fixture();assert.ok(f.control.describe().formats.some(row=>row.format==='glb'));
  await f.control.prepare(structuredClone(f.state.model),{format:'glb',source_unit:'mm'},{signal:new AbortController().signal});
  const p=f.calls[0][1];assert.equal(p.wall_mm,2);assert.equal(p.fill_rule,'even-odd');assert.equal(p.mode,'solid');assert.equal(p.target_unit,'mm');
  assert.equal(f.expressionCalls.length,1);
  f.nodes['printable-mode'].value='strut';assert.ok(!f.control.describe().formats.some(row=>row.format==='glb'));
});

test('held hollow preparation rejects wall, checkbox and fill changes',async()=>{
  for(const mutate of [f=>f.nodes['printable-wall'].value='3',f=>f.nodes['printable-hollow'].checked=false,f=>f.nodes['printable-fill'].value='nonzero']){
    const f=fixture(),gate=deferred();f.context.preparePrintable=()=>gate.promise;
    const pending=f.control.prepare(f.state.model,{format:'stl',source_unit:'mm'},{signal:new AbortController().signal});await flush();mutate(f);gate.resolve({text:'old',report:{}});
    await assert.rejects(pending,/target fields changed/);
  }
});

test('unchecked hollow sends zero wall and does not evaluate an unused wall expression',async()=>{
  const f=fixture();f.nodes['printable-hollow'].checked=false;f.nodes['printable-wall'].value='invalid expression';
  await f.control.prepare(f.state.model,{format:'stl',source_unit:'mm'},{signal:new AbortController().signal});assert.equal(f.calls[0][1].wall_mm,0);
});

test('reviewed printable GLB and colored OBJ reuse binary and material publication',async()=>{
  for(const format of ['glb','obj']){
    const f=numericControlFixture(Object.prototype,{}),saved=[];
    Object.assign(f.context,{getGeometry:()=>f.state.model,getSelection:()=>({format,unit:'mm',printable:{enabled:true,mode:'solid'}}),
      describe:async()=>({formats:[{format,available:true}]}),prepare:async(m,p)=>({text:format==='glb'?btoa('glTFbinary'):'obj',...(format==='obj'?{materials:'mtl'}:{}),
        report:{sourceUnit:p.source_unit,targetUnit:p.target_unit,losses:[],encoding:format==='glb'?'base64':'utf8'}}),
      api:{beginGeometryExport:async()=>({id:'ticket'}),writeGeometryExport:async(id,data)=>{saved.push(data);return {path:'mesh.'+format};},abortGeometryExport:async()=>{}}});
    const session=new GeometryExportSession(f.context);await session.prepare();await session.confirm();
    if(format==='glb')assert.equal(new TextDecoder().decode(saved[0]),'glTFbinary');else assert.deepEqual(saved[0],{obj:'obj',mtl:'mtl'});
  }
});

test('mounted Export dialog produces star solids in all four formats and guarded hollow cube',async()=>{
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
    const models=JSON.parse(execFileSync('python',['-c',"import json;from engine.generators import regular;print(json.dumps([regular('small-stellated-dodecahedron'),regular('cube')]))"],{encoding:'utf8'}));
    await page.exposeFunction('native',request=>{
      const result=JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch\ntry: print(json.dumps(dispatch(json.load(sys.stdin))))\nexcept Exception as e: print(json.dumps({'error':str(e)}))"],{input:JSON.stringify(request),encoding:'utf8'}));
      if(result.error)throw Error(result.error);return result;
    });
    await page.route('**/w32-mount',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/w32-mount');
    await page.evaluate(async models=>{
      const {ExportControls}=await import('/export-controls.mjs');
      document.body.innerHTML='<dialog id="export-dialog"><h2>Export</h2><select id="export-format"><option value="off">OFF</option><option value="obj">OBJ</option><option value="stl">STL</option></select><p id="export-domain"></p><button id="confirm-export">Export</button></dialog>';
      const state={model:models[0],view:{coordinateUnit:'mm'},notes:''},doc={id:'w32',cursor:0,states:[state]},project={active:0,documents:[doc]};
      const attr=rows=>({array:new Float32Array(rows.flat(Infinity)),version:1});
      const viewer=m=>({model:m,view:{faces:true},projected:m.vertices.map(point=>({point})),visibility:{vertices:m.vertices.map(()=>true)},
        pointGeometry:{attributes:{position:attr(m.vertices)}},edgeGeometry:{attributes:{position:attr(m.edges.map(e=>e.map(i=>m.vertices[i])))}},surfaceGeometry:{attributes:{position:attr([])}},prepareGeometryCapture:async()=>({complete:true})});
      const views=models.map(viewer);window.saved=[];window.changeModel=()=>{state.model=models[1];};
      const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,getDerived:()=>null,getViewer:()=>views[models.indexOf(state.model)],getNet:()=>null,isExporting:()=>false,guard:fn=>fn,setStatus:()=>{},
        evaluateMany:async parts=>parts.map(p=>p==='1+1'?2:Number(p)),describe:model=>window.native({op:'export-options',model}),prepare:(model,params)=>window.native({op:'prepare-export',model,params}),
        preparePrintable:(model,params)=>window.native({op:'prepare-printable-export',model,params}),
        api:{beginGeometryExport:async()=>({id:'ticket'}),writeGeometryExport:async(id,data)=>{window.saved.push(data);return {path:'mesh'};},abortGeometryExport:async()=>{}}};
      window.control=new ExportControls(context);await window.control.open();
    },models);
    await page.selectOption('#export-kind','printable');await page.selectOption('#printable-mode','solid');
    await page.waitForFunction(()=>window.control.session.prepared?.result.report.mode==='solid');
    assert.match(await page.locator('#export-preview').textContent(),/60 triangles.*1 closed shells.*mm³ material volume.*outer surface solid/);
    for(const format of ['stl','3mf','obj','glb']){
      await page.selectOption('#export-format',format);
      await page.waitForFunction(f=>window.control.session.prepared?.owner.selection.format===f,format);
      assert.equal(await page.inputValue('#export-kind'),'printable');assert.equal(await page.inputValue('#export-units'),'mm');
      await page.evaluate(()=>window.control.confirm());await page.evaluate(()=>window.control.open());
    }
    const summary=await page.evaluate(()=>({binary:window.saved.slice(0,2).every(x=>x instanceof Uint8Array),material:typeof window.saved[2].mtl,
      magic:new DataView(window.saved[3].buffer).getUint32(0,true)}));
    assert.equal(summary.binary,true);assert.equal(summary.material,'string');assert.equal(summary.magic,0x46546c67);
    await page.locator('#printable-solid-settings summary').click();await page.check('#printable-hollow');
    await page.waitForFunction(()=>document.querySelector('#export-preview').dataset.status==='error');
    assert.match(await page.locator('#export-preview').textContent(),/convex outer surface/);
    await page.evaluate(async()=>{window.changeModel();await window.control.refresh(true);});
    await page.waitForFunction(()=>window.control.session.prepared?.result.report.wallThicknessMM===2);
    assert.equal(await page.evaluate(()=>window.control.session.prepared.result.report.boundaryShellCount),2);
    assert.ok(Math.abs(await page.evaluate(()=>window.control.session.prepared.result.report.volumeMM3)-(100**3-96**3))<1e-6);
  }finally{await browser?.close();await server.close();}
});
