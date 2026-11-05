import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {symmetryWording,overviewData} from '../ui/analysis-overview.mjs';
import {EXPORT_GOALS} from '../ui/export-goals.mjs';

const models=JSON.parse(execFileSync('python',['-c',"import json;from engine.generators import regular;print(json.dumps([regular(k) for k in ['cube','tesseract','cell24','cuboctahedron']]))"],{encoding:'utf8'}));
const detected=order=>({available:true,complete:true,closureVerified:true,orientation:'all',groupOrder:order,tolerance:1e-8,maxNormalizedVertexResidual:1e-15});

test('native catalog metadata identifies known regular and uniform symmetry orders before detection',()=>{
  for(const [i,group,order] of [[0,'B3',48],[1,'B4',384],[2,'F4',1152],[3,'B3',48]]){
    const result=symmetryWording(models[i]);assert.equal(result.text,`Symmetry: ${group}, order ${order.toLocaleString('en-US')}.`);
    assert.match(result.method,/known for the catalog/);assert.match(result.method,/has not completed/);
    const checked=symmetryWording(models[i],detected(order));assert.equal(checked.text,result.text);assert.match(checked.method,/Tolerance: 1e-8/);assert.match(checked.method,/residual: 1e-15/);
  }
});
test('unlabelled models use detected wording with method, tolerance and residual',()=>{
  const model={...models[1],metadata:{}},result=symmetryWording(model,detected(384));
  assert.equal(result.text,'Detected symmetry order 384 (numerical check).');assert.match(result.method,/Group closure was checked numerically/);assert.match(result.method,/do not certify/);
  assert.equal(symmetryWording(model),null);
});
test('partial, rotation-only, unavailable or invalid results cannot claim a detected full order',()=>{
  const model={...models[0],metadata:{}};
  for(const patch of [{available:false},{complete:false},{closureVerified:false},{orientation:'proper'},{groupOrder:NaN},{groupOrder:0},{groupOrder:1.5}])assert.equal(symmetryWording(model,{...detected(48),...patch}),null);
});
test('catalog labels cannot override a conflicting detection, construction or mismatched source counts',()=>{
  assert.equal(symmetryWording(models[1],detected(16)).text,'Detected symmetry order 16 (numerical check).');
  assert.match(symmetryWording(models[1],detected(16)).method,/differs from the catalog/);
  assert.equal(symmetryWording(models[1],detected(384),{construction:{label:'Scale'}}).text,'Detected symmetry order 384 (numerical check).');
  assert.equal(symmetryWording({...models[1],vertices:models[1].vertices.slice(1)}),null);
  assert.equal(symmetryWording({...models[1],metadata:{...models[1].metadata,symmetryGroup:'unknown'}}),null);
});
test('overview includes the method and export card states the precision actually retained',()=>{
  const data=overviewData(models[1]);assert.ok(data.facts.includes('Symmetry: B4, order 384.'));assert.match(data.symmetry.method,/does not certify/);
  const goal=EXPORT_GOALS.find(g=>g.id==='geometry');assert.equal(goal.title,'Export model data');assert.equal(goal.hint,'Coordinates and connections. OFF / JSON, full double precision');
});
test('mounted overview and Advanced preserve controls, collapse precision and retain failures and certificates',async()=>{
  const server=await createServer({configFile:false,root:'ui',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0}});let browser;
  try{
    await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:900,height:1050}});
    const html=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),evidence=html.split('\n').find(line=>line.includes('id="evidence-panel"')).replace(' hidden','');
    await page.route('**/precision-mount',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/analysis-overview.css"><style>body{display:block;padding:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}section#info-panel{padding:16px}.inspector-panel{padding:16px}button{min-height:36px}</style><main><section id="info-panel"><div id="analysis"></div></section>'+evidence+'</main>'}));
    await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/precision-mount');
    await page.evaluate(async model=>{
      const {organizeAdvanced}=await import('/nets-flow.mjs'),{renderValidation}=await import('/inspector-layout.mjs'),{AnalysisOverview}=await import('/analysis-overview.mjs');
      window.originalIds=[...document.querySelectorAll('[id]')].map(n=>[n.id,n]);window.checked=0;document.getElementById('validate').onclick=()=>window.checked++;
      organizeAdvanced(document);organizeAdvanced(document);window.paint=(m,validation,options)=>renderValidation(document,m,validation,options);
      window.source=model;window.paint(model,{passed:true,warnings:[]});document.getElementById('numeric-badge').textContent='FLOAT64 · APPROX';
      window.overview=new AnalysisOverview({document,getState:()=>({model,view:{}})});window.overview.sync();
    },models[1]);
    assert.match(await page.locator('#validation-summary').textContent(),/^Checks passed\. Coordinates are double-precision floating point\./);
    assert.equal(await page.locator('#precision-details').evaluate(n=>n.open),false);assert.equal(await page.locator('#numeric-badge').isVisible(),false);
    assert.equal(await page.locator('#advanced-intro').isVisible(),false);assert.equal(await page.locator('#validate').isVisible(),true);
    assert.equal(await page.locator('#evidence #validation-details pre').count(),1);assert.equal(await page.locator('#evidence pre').isVisible(),false);
    await page.locator('#validation-details > summary').click();assert.equal(await page.locator('#evidence pre').isVisible(),true);
    assert.equal((await page.locator('#evidence pre').textContent().then(JSON.parse)).validation.passed,true);await page.locator('#validation-details > summary').click();
    assert.equal(await page.evaluate(()=>window.originalIds.every(([id,node])=>document.getElementById(id)===node)),true);
    await page.click('#validate');assert.equal(await page.evaluate(()=>window.checked),1);
    await page.click('#analysis-overview-method>summary');assert.match(await page.locator('#analysis-overview-method').textContent(),/known for the catalog/);
    mkdirSync('artifacts/v5-credibility',{recursive:true});await page.screenshot({path:'artifacts/v5-credibility/analysis-advanced.png'});
    await page.click('#precision-details>summary');assert.equal(await page.locator('#numeric-badge').isVisible(),true);
    await page.evaluate(()=>{document.body.classList.add('expert-mode');document.getElementById('validation-details').open=true;window.paint(window.source,{passed:false,errors:['Nonplanar face'],warnings:['Open boundary']});});
    assert.equal(await page.locator('#precision-details').evaluate(n=>n.open),true);assert.equal(await page.locator('#validation-details').evaluate(n=>n.open),true);
    assert.match(await page.locator('#validation-summary').textContent(),/^Geometry checks failed/);assert.equal(await page.locator('.validation-warning').isVisible(),true);assert.match(await page.locator('#validation-details').textContent(),/Nonplanar face/);
    await page.screenshot({path:'artifacts/v5-credibility/precision-details.png'});
    await page.evaluate(()=>window.paint({...window.source,numeric:{mode:'rational-exact',certified:true}},{passed:true}));
    await page.locator('#precision-details>summary').click();assert.equal(await page.locator('#precision-details').evaluate(n=>n.open),false);
    assert.equal(await page.locator('#numeric-badge').innerText(),'RATIONAL');assert.equal(await page.locator('#numeric-badge').isVisible(),true);
    assert.match(await page.locator('#validation-summary').textContent(),/scoped exact certificate/);assert.match(await page.locator('#validation-precision-note').textContent(),/only its stated property/);
    assert.equal(await page.locator('#validation-details').count(),1);assert.equal(await page.locator('#validation-precision-note').count(),1);
    await page.locator('#precision-details>summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#precision-details').evaluate(n=>n.open),true);
    await page.evaluate(()=>window.paint(window.source,{passed:true}));assert.equal(await page.locator('#numeric-badge').textContent(),'FLOAT64 · APPROX');
    await page.locator('#precision-details>summary').click();assert.equal(await page.locator('#numeric-badge').isVisible(),false);
    await page.evaluate(async()=>{const {clearPrecisionValidation}=await import('/precision-evidence.mjs');clearPrecisionValidation(document);});
    assert.equal(await page.locator('#validation-details').count(),0);assert.equal(await page.locator('#validation-precision-note').count(),0);assert.equal(await page.locator('#numeric-badge').count(),1);
  }finally{await browser?.close();await server.close();}
});
