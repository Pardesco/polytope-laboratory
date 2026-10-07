// Visual and layout checks for the geometry-first desktop workspace.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const artifacts=path.join(root,'artifacts');await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,'ui-design-smoke-'));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:path.join(folder,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.POLYTOPE_TEST_EXECUTABLE||require('electron'),args:process.env.POLYTOPE_TEST_EXECUTABLE?[]:[root],cwd:root,env});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);
  const errors=[],checks=[],layouts=[];page.on('pageerror',error=>errors.push(error.message));
  const resize=async(width,height)=>{await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});await page.waitForTimeout(150);};
  const capture=async name=>{await page.screenshot({path:path.join(folder,name+'.png')});};
  const layout=async label=>{const result=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return {windowHeight:innerHeight,windowWidth:innerWidth,views:rect('views'),base:rect('base-canvas'),derived:rect('derived-canvas'),bodyOverflow:document.body.scrollHeight>innerHeight};});layouts.push({label,...result});return result;};
  try{
    await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Tesseract'&&document.querySelector('#base-canvas canvas'));
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await resize(1500,950);
    assert.equal(await page.locator('#inspector-region').isVisible(),false);
    assert.equal(await page.locator('.derived').isVisible(),false);
    let measured=await layout('default');assert.ok(measured.views.height>measured.windowHeight*.65);assert.equal(measured.bodyOverflow,false);
    await capture('01-default-4d');checks.push('single geometry viewport fills the default workspace with inspector closed');
    const before=await page.locator('#views').boundingBox();await page.locator('#animation-settings > summary').click();
    assert.deepEqual(await page.locator('#views').boundingBox(),before);assert.equal(await page.locator('#animation-play').isVisible(),true);
    await capture('02-animation');checks.push('animation disclosure overlays geometry without shrinking or scrolling the viewport');
    await page.locator('#rotation-settings > summary').click();
    assert.equal(await page.locator('#animation-settings').evaluate(element=>element.open),false);
    assert.equal(await page.locator('#plane-2').isVisible(),true);
    await capture('03-rotation');checks.push('coordinate rotation controls disclose separately');
    await page.locator('#viewport-layout').selectOption('split');
    assert.equal(await page.locator('.derived').isVisible(),true);
    await page.waitForFunction(()=>document.getElementById('derived-status').textContent.includes('vertices'));
    measured=await layout('compare');assert.ok(Math.abs(measured.base.width-measured.derived.width)<2);
    await capture('04-compare');checks.push('compare mode keeps two equally sized geometry viewports');
    await page.locator('#toggle-inspector').click();
    await page.locator('[data-panel="evidence"]').click();
    assert.equal(await page.locator('#numeric-badge').isVisible(),true);assert.equal(await page.locator('#dimension-badge').isVisible(),true);
    await capture('05-evidence');checks.push('evidence and numeric context remain available in optional inspector');
    await page.locator('[data-key="cube"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Cube');
    await page.locator('#viewport-layout').selectOption('single');await page.locator('#toggle-inspector').click();
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await capture('06-solid-cube');checks.push('solid 3D model retains a dominant single viewport');
    await page.locator('[data-key="small-stellated-dodecahedron"]').click();await page.waitForFunction(()=>document.getElementById('model-name').textContent==='Small stellated dodecahedron');
    await page.waitForFunction(()=>document.getElementById('cancel').hidden);
    await capture('07-star');checks.push('star geometry remains visible without persistent explanatory banners');
    await resize(1100,720);await page.locator('#toggle-library').click();
    measured=await layout('compact');assert.equal(measured.bodyOverflow,false);assert.ok(measured.views.height>measured.windowHeight*.60);assert.ok(measured.base.width>1000);
    await capture('08-compact-full-workspace');checks.push('compact window keeps geometry on screen and sidebars can collapse');
    await page.locator('#help').click();assert.equal(await page.locator('#help-dialog').isVisible(),true);assert.match(await page.locator('#help-dialog').textContent(),/Shift-drag/);await page.locator('#close-help').click();
    assert.deepEqual(errors,[]);checks.push('guide describes 4D interaction and renderer has no page errors');
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,checks,layouts,pageErrors:errors},null,2));
    console.log(`UI design smoke passed: ${checks.length} checks. Artifacts: ${folder}`);
  }catch(error){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});console.error('Artifacts:',folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
