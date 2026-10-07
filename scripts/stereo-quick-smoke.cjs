const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','stereo-quick-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.POLYTOPE_TEST_MODE;
  const app=await require('playwright')._electron.launch({executablePath:require('electron'),args:[root],cwd:root,env});
  try{
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    for(const mode of ['anaglyph','parallel','cross-eyed','none']){
      await page.locator('#stereo-mode').selectOption(mode);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.locator('#base-canvas').screenshot({path:path.join(folder,mode+'.png')});
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(folder,'result.json'),JSON.stringify({passed:true,modes:['anaglyph','parallel','cross-eyed','none'],pageErrors:errors},null,2));
    console.log('Stereo quick smoke PASS:',folder);
  }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
