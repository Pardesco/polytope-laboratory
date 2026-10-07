// SPDX-License-Identifier: GPL-3.0-only
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','coincident-assembly-quick-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env}),page=await app.firstWindow(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const reveal=async selector=>page.locator(selector).evaluate(n=>{for(let p=n;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  const dialog=async file=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
  const ready=async()=>page.waitForFunction(()=>document.getElementById('cancel').hidden&&!document.getElementById('assembly-restore').disabled);
  const action=async key=>{await reveal('#assembly-'+key);await page.locator('#assembly-'+key).click();await ready();};
  const save=async name=>{const file=path.join(folder,name+'.polyproj');await dialog(file);await page.evaluate(()=>document.getElementById('status').textContent='');await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);return {file,project:JSON.parse(await fs.readFile(file,'utf8'))};};
  const waitFile=async file=>{for(let i=0;i<100;i++){try{if((await fs.stat(file)).size>100)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Export file was not published: '+file);};
  let stage='startup';
  try{
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    const input=process.env.POLYTOPE_ASSEMBLY_FIXTURE||path.join(root,'development/coincident-edge-assembly-0.26/coincident-assembly-review.polyproj');const inputName=active(JSON.parse(await fs.readFile(input,'utf8'))).model.name;await app.evaluate(({dialog},input)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[input]});},input);
    await page.locator('#open').click();await page.waitForFunction(name=>document.getElementById('model-name').textContent===name,inputName);
    if(await page.locator('#toggle-inspector').getAttribute('aria-pressed')==='false')await page.locator('#toggle-inspector').click();await page.locator('[data-panel="net"]').click();await reveal('#assembly-restore');await ready();const before=await save('source-before');
    stage='restore source-owned assembly SVG';await action('restore');await page.waitForFunction(()=>document.querySelector('#assembly-chart svg'));
    const chart=await page.locator('#assembly-chart').innerHTML();assert.ok(chart.includes('data-annotation-face'));assert.ok(chart.includes('data:image/png;base64,'));await page.locator('#assembly-chart').screenshot({path:path.join(folder,'internal-support-chart.png')});
    stage='SVG and actual Chromium PDF';const svg=path.join(folder,'assembly.svg');await dialog(svg);await action('svg');await waitFile(svg);const xml=await fs.readFile(svg,'utf8');assert.ok(xml.includes('data:image/png;base64,'));assert.ok(xml.includes('SUP'));
    const pdf=path.join(folder,'assembly.pdf');await dialog(pdf);await action('pdf');await waitFile(pdf);assert.equal((await fs.readFile(pdf)).subarray(0,5).toString(),'%PDF-');
    stage='all four source pairings/policies';const policies={};
    for(const policy of ['tongue-in-groove','internal-support','no-internal-support','disconnected']){
      await page.locator('#assembly-policy').selectOption(policy);await action('preview');await page.waitForFunction(policy=>document.getElementById('assembly-pairings').textContent.includes(policy),policy);
      const svg=await page.locator('#assembly-chart').innerHTML();policies[policy]={faces:(svg.match(/data-net-face=/g)||[]).length,svgBytes:Buffer.byteLength(svg)};assert.ok(svg.length>1000);
    }
    stage='detached history and Save/Open';await action('save');const saved=await save('assembly-after');const first=active(before.project),last=active(saved.project);assert.deepEqual(last.model,first.model);assert.equal(last.notes,first.notes);assert.deepEqual(last.view.elementAnnotations,first.view.elementAnnotations);assert.equal(last.view.coordinateUnit,'cm');assert.equal(last.view.coincidentAssembly.states[last.view.coincidentAssembly.cursor].joints[0].policy,'disconnected');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},saved.file);await page.locator('#open').click();await ready();await action('restore');await page.waitForFunction(()=>document.getElementById('assembly-policy').value==='disconnected');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,allFourPolicies:policies,sourceOwnedTextPNG:true,svgExport:svg,chromiumPDF:pdf,compactHistoryNativeSaveOpen:true,sourceIncidenceRGBAUnitsNotesContentPreserved:true,errors},null,2));console.log('Coincident assembly quick smoke PASS:',folder);
  }catch(e){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({stage,message:e.message,errors,toast:await page.locator('#toast').textContent(),text:await page.locator('body').innerText()},null,2));console.error('Failure evidence:',folder);throw e;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
