import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright';

test('mounted Export dialog reviews and publishes displayed GLB, OBJ/MTL and derived X3D',async()=>{
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
    const address=server.httpServer.address();
    await page.route('**/w16-mount',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
    await page.goto('http://127.0.0.1:'+address.port+'/w16-mount');
    const models=JSON.parse(execFileSync('python',['-c',"import json;from engine.generators import regular;from engine.operations import section;print(json.dumps([regular('cube'),section(regular('tesseract'))['model']]))"],{encoding:'utf8'}));
    await page.exposeFunction('native',request=>JSON.parse(execFileSync('python',['-c',"import json,sys;from engine.server import dispatch;print(json.dumps(dispatch(json.load(sys.stdin))))"],{input:JSON.stringify(request),encoding:'utf8'})));
    await page.evaluate(async([model,derived])=>{
      const {ExportControls}=await import('/export-controls.mjs');
      document.body.innerHTML='<dialog id="export-dialog"><h2>Export</h2><select id="export-format"><option value="off">OFF</option><option value="json">JSON</option><option value="obj">OBJ</option><option value="stl">STL</option><option value="dxf">DXF</option><option value="vrml">VRML</option><option value="pov">POV</option></select><p id="export-domain"></p><button id="confirm-export">Export</button></dialog>';
      const state={model,view:{coordinateUnit:'mm',documentMetadata:{title:'Mounted title',author:'Author'}},notes:''},doc={id:'test',cursor:0,states:[state]},project={active:0,documents:[doc]};
      const attribute=(rows,size=3)=>({array:new Float32Array(rows.flat(Infinity)),version:1,itemSize:size});
      const viewer=model=>{
        const triangles=model.faces.flatMap((f,face)=>f.slice(1,-1).map((_,i)=>({face,points:[model.vertices[f[0]],model.vertices[f[i+1]],model.vertices[f[i+2]]]})));
        return {model,view:{faces:true,edges:true,vertices:true},projected:model.vertices.map(point=>({point})),triangles,
          visibility:{vertices:model.vertices.map(()=>true)},pointGeometry:{attributes:{position:attribute(model.vertices)}},edgeGeometry:{attributes:{position:attribute(model.edges.map(e=>e.map(i=>model.vertices[i])))}},
          surfaceGeometry:{attributes:{position:attribute(triangles.map(t=>t.points)),color:attribute(triangles.flatMap(()=>[[.2,.4,.6,.8],[.2,.4,.6,.8],[.2,.4,.6,.8]]),4)}},
          prepareGeometryCapture:async()=>({complete:true})};
      };
      const viewers=[viewer(model),viewer(derived)];window.saved=[];
      const context={getState:()=>state,getDocument:()=>doc,getProject:()=>project,getDerived:()=>derived,getViewer:source=>viewers[source==='derived'?1:0],getNet:()=>null,isExporting:()=>false,guard:fn=>fn,setStatus:()=>{},
        evaluateMany:async parts=>parts.map(Number),describe:(model)=>window.native({op:'export-options',model}),prepare:(model,params)=>window.native({op:'prepare-export',model,params}),prepareView:(model,params)=>window.native({op:'prepare-view-export',model,params}),
        api:{beginGeometryExport:async()=>({id:'ticket'}),writeGeometryExport:async(id,data)=>{window.saved.push(data);return {path:'selected'};},abortGeometryExport:async()=>{}}};
      window.control=new ExportControls(context);document.getElementById('confirm-export').onclick=()=>window.control.confirm();await window.control.open();
    },models);
    await page.selectOption('#export-kind','displayed');
    await page.waitForFunction(()=>document.querySelector('#export-preview').dataset.status==='ready'&&window.control.session.prepared?.owner.selection.format==='glb');
    assert.equal(await page.inputValue('#export-units'),'m');assert.ok(await page.locator('#interchange-settings').isVisible());
    await page.click('#confirm-export');
    assert.equal(await page.evaluate(()=>new DataView(window.saved[0].buffer).getUint32(0,true)),0x46546c67);
    await page.evaluate(()=>window.control.open());await page.selectOption('#export-format','obj');
    await page.waitForFunction(()=>window.control.session.prepared?.owner.selection.format==='obj');await page.click('#confirm-export');
    assert.equal(await page.evaluate(()=>typeof window.saved[1].mtl),'string');
    await page.evaluate(()=>window.control.open());await page.selectOption('#export-source','derived');await page.selectOption('#export-format','x3d');await page.selectOption('#export-units','mm');
    await page.waitForFunction(()=>window.control.session.prepared?.owner.selection.format==='x3d'&&window.control.session.prepared?.owner.selection.source==='derived'&&window.control.session.prepared?.owner.selection.unit==='mm');
    const summary=await page.evaluate(()=>{
      const result=window.control.session.prepared.result,xml=new DOMParser().parseFromString(result.text,'application/xml');
      return {errors:xml.querySelectorAll('parsererror').length,count:result.report.triangleCount,unit:xml.querySelector('unit').getAttribute('conversionFactor'),formats:[...document.querySelector('#export-format').options].filter(o=>!o.disabled).length};
    });
    assert.equal(summary.errors,0);assert.equal(summary.count,12);assert.equal(Number(summary.unit),.001);assert.equal(summary.formats,9);
  }finally{await browser?.close();await server.close();}
});
