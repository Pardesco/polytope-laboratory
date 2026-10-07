// Observe actual Fit containment of the published worker point cloud.
// This is a framing investigation, not a whole-curve or GPU error certificate.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright'),THREE=require('three');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
function probe(){
  const Native=window.Worker,records=[];
  window.Worker=function(...args){
    const worker=new Native(...args);
    worker.addEventListener('message',event=>{
      const value=event.data;
      if(value?.type!=='geometry-result'||!value.geometry)return;
      records.push(value);if(records.length>4)records.shift();
    });return worker;
  };
  window.Worker.prototype=Native.prototype;Object.setPrototypeOf(window.Worker,Native);
  window.__fitObservation=()=>{
    const diagnostic=document.getElementById('view-diagnostic'),frameKey=diagnostic?.dataset.stereographicFrameKey;
    const result=records.findLast(value=>value.frameKey===frameKey&&value.phase===diagnostic.dataset.stereographicPhase
      &&String(value.achievedTolerance)===diagnostic.dataset.stereographicTolerance);
    if(!result)return null;
    const g=result.geometry,points=[];
    for(let i=0;i<g.vertexVisible.length;i++)if(g.vertexVisible[i])points.push(...g.positions.subarray(i*3,i*3+3));
    for(const values of [g.segments,g.triangles])for(const x of values)points.push(x);
    const canvas=document.querySelector('#base-canvas canvas');
    return {frameKey,phase:result.phase,jobId:result.jobId,complete:result.complete,
      pending:diagnostic.dataset.stereographicPending,points,width:canvas.width,height:canvas.height,
      diagnostic:diagnostic.textContent};
  };
}
function containment(cloud,pose){
  const aspect=cloud.width/cloud.height,h=pose.orthographicHalfHeight;
  const camera=pose.projection==='perspective'?new THREE.PerspectiveCamera(38,aspect,.01,1e8)
    :new THREE.OrthographicCamera(-h*aspect,h*aspect,h,-h,.01,1e8);
  camera.zoom=pose.zoom;camera.position.fromArray(pose.position);camera.up.fromArray(pose.up);
  camera.lookAt(new THREE.Vector3(...pose.target));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const point=new THREE.Vector3();let outsideXY=0,behindNear=0,maximumAbsX=0,maximumAbsY=0;
  for(let i=0;i<cloud.points.length;i+=3){
    point.set(cloud.points[i],cloud.points[i+1],cloud.points[i+2]).project(camera);
    assert.ok([point.x,point.y,point.z].every(Number.isFinite));
    maximumAbsX=Math.max(maximumAbsX,Math.abs(point.x));maximumAbsY=Math.max(maximumAbsY,Math.abs(point.y));
    if(Math.abs(point.x)>1+1e-6||Math.abs(point.y)>1+1e-6)outsideXY++;
    if(point.z< -1-1e-6)behindNear++;
  }
  return {points:cloud.points.length/3,outsideXY,behindNear,maximumAbsX,maximumAbsY,
    contained:outsideXY===0&&behindNear===0,scope:'Published Float32 point cloud and recorded observer camera; omitted patches, between-sample curves, GPU arithmetic and actual far plane excluded'};
}
async function main(){
  const runtime=await guardRuntime(),folder=await fs.mkdtemp(path.join(root,'artifacts','stereographic-fit-observation-'));
  const profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(30000);const cases=[],errors=[];let sequence=0;
  page.on('pageerror',error=>errors.push(error.message));
  const settled=async()=>{
    // A deferred projection fit can change the camera just after publication.
    // Observe a later current idle result rather than its preceding callback.
    for(let pass=0;pass<2;pass++){
      await page.evaluate(async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
      await page.waitForFunction(()=>{const value=window.__fitObservation?.();return value?.pending==='false'&&value.phase==='idle';},null,{timeout:20000});
    }
  };
  async function save(label){
    const file=path.join(folder,`${++sequence}-${label}.polyproj`);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
    await page.locator('#save').click();await page.waitForFunction(file=>document.getElementById('status').textContent==='Saved '+file,file);
    return {file,state:active(JSON.parse(await fs.readFile(file,'utf8')))};
  }
  async function observe(label){
    const saved=await save(label),cloud=await page.evaluate(()=>window.__fitObservation());assert.ok(cloud);
    const result={label,file:saved.file,frameKey:cloud.frameKey,jobId:cloud.jobId,phase:cloud.phase,
      complete:cloud.complete,diagnostic:cloud.diagnostic,camera:saved.state.view.camera,
      ...containment(cloud,saved.state.view.camera)};
    await page.screenshot({path:path.join(folder,label+'.png')});return {result,state:saved.state};
  }
  try{
    await page.context().addInitScript(probe);await page.reload();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.locator('#projection').selectOption('stereographic');await settled();
    for(const projection of ['orthographic','perspective']){
      await page.locator('#camera-projection').selectOption(projection);await settled();
      const before=await observe(projection+'-before-fit');
      if(process.env.POLYTOPE_TEST_EXPECT_AUTO_FIT==='1'&&projection==='orthographic')assert.equal(before.result.contained,true,'Projection change must frame the current published cloud before manual Fit');
      await page.locator('#fit-view').click();await settled();const after=await observe(projection+'-after-fit');
      assert.deepEqual(after.state.model,before.state.model);
      cases.push({projection,sourceUnchanged:true,before:before.result,after:after.result});
    }
    assert.deepEqual(errors,[]);
    const result={completed:true,version:await app.evaluate(({app})=>app.getVersion()),packaged:Boolean(runtime.packaged),
      allPublishedPointsContainedAfterFit:cases.every(value=>value.after.contained),cases,pageErrors:errors,
      claims:'Framing observation only. A false containment result is retained as a finding; completion does not imply Fit success or geometry completeness.'};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
    console.log(`Fit observation completed; containment after Fit: ${result.allPublishedPointsContainedAfterFit}. Artifacts: ${folder}`);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({completed:false,error:error.stack,cases,pageErrors:errors},null,2));throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={containment};
