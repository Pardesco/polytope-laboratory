// Canary for current source or byte-matched unpacked candidates. Never launch
// an older release or portable outer wrapper expecting hidden-mode guards.
const { _electron:electron }=require('playwright');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');
const {startHiddenWindowWatch}=require('./windows-hidden-window-watch.cjs');
const {hiddenRuntime}=require('./hidden-runtime.cjs');
const root=path.resolve(__dirname,'..');

async function main(){
  const runtime=await hiddenRuntime();
  const folder=await fs.mkdtemp(path.join(root,'artifacts','hidden-desktop-canary-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const watch=await startHiddenWindowWatch({executablePath:runtime.executablePath,evidencePath:path.join(folder,'native-watch.json')});
  const result={...runtime,startedUtc:new Date().toISOString(),passed:false,folder};
  let app,error;
  try{
    const env={...process.env,POLYTOPE_TEST_MODE:'hidden-no-focus',POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
    if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
    result.developmentPythonUnavailable=runtime.packaged;
    app=await electron.launch({executablePath:runtime.executablePath,args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
    const page=await app.firstWindow();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract'&&document.getElementById('cancel').hidden);
    result.qualification=await app.evaluate(({app})=>app.polytopeQualification);
    assert.equal(result.qualification?.mode,'hidden-no-focus');assert.equal(result.qualification.profile,profile);
    const windowState=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),focused:w.isFocused(),focusable:w.isFocusable(),handle:w.getNativeWindowHandle().toString('hex')})));
    result.initialWindows=await windowState();assert.equal(result.initialWindows.length,1);
    assert.deepEqual(result.initialWindows.map(({visible,focused,focusable})=>({visible,focused,focusable})),[{visible:false,focused:false,focusable:false}]);
    // Exercise real renderer/CDP input and resize without OS input or activation.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1484,900));
    await page.locator('#auto-rotate').click();
    const animation=await page.evaluate(()=>new Promise(resolve=>{
      const times=[],started=performance.now();let timer;
      const finish=()=>{clearTimeout(timer);resolve({frames:times.length,firstCallbackMs:times.length?times[0]-started:null,elapsedMs:performance.now()-started,postFirstCallbackMs:times.length?performance.now()-times[0]:null,gapsMs:times.slice(1).map((t,i)=>t-times[i]),visibilityState:document.visibilityState});};
      const frame=()=>{times.push(performance.now());if(times.at(-1)-times[0]<500)requestAnimationFrame(frame);else finish();};
      timer=setTimeout(finish,5000);requestAnimationFrame(frame);
    }));
    result.animation=animation;assert.ok(animation.frames>=2,'Hidden renderer must provide consecutive animation frames.');
    await page.locator('#auto-rotate').click();
    await page.screenshot({path:path.join(folder,'hidden-renderer.png')});
    result.finalWindows=await windowState();assert.equal(result.finalWindows[0].visible,false);assert.equal(result.finalWindows[0].focused,false);
    result.nativeDialogGuard=await app.evaluate(async({dialog})=>{try{await dialog.showOpenDialog({properties:['openFile']});return false;}catch(e){return /hidden-no-focus/.test(e.message);}});
    assert.equal(result.nativeDialogGuard,true);assert.deepEqual(pageErrors,[]);result.pageErrors=pageErrors;
  }catch(e){error=e;result.error=e.stack;}
  finally{
    if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
    result.nativeWatch=await watch.stop();result.finishedUtc=new Date().toISOString();
    if(result.nativeWatch.violations!==0)error=error||Error('A test HWND became visible or foreground.');
    if(result.nativeWatch.eventHooksArmed!==true)error=error||Error('Native show/focus event monitoring was not armed.');
    if(result.nativeWatch.checks<10)error=error||Error('Insufficient native observation samples.');
    result.passed=!error;await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log('Hidden canary '+(result.passed?'PASS':'FAIL')+'. Evidence: '+folder);
  }
  if(error)throw error;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
