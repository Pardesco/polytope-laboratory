// Real GPU/real module-Worker regression. Authoring and --self-test launch no GUI.
// Root owns launches; guardRuntime requires an explicit visible opt-in or its
// already qualified hidden runtime. No mouse ownership or source repair.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {guardRuntime}=require('./layer-join-smoke.cjs');
const root=path.resolve(__dirname,'..'),clone=structuredClone;
const hash=b=>createHash('sha256').update(b).digest('hex');
const active=p=>{const d=p.documents[p.active];return d.states[d.cursor];};
const corners=[[-2,-1,.4,0],[3,-1,.4,0],[3,2,.4,0],[-2,2,.4,0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mixed=(a,b,t)=>a.map((x,i)=>x*(1-t)+b[i]*t);
const sphere=p=>{const r=Math.hypot(...p);assert.equal(p[3],0);return p.slice(0,3).map(x=>x/r);};
function literal(){
  // Paired consecutive antipodes keep the Viewer's actual MEAN center zero,
  // not merely its bounding-box center. Unused +/- axis vertices establish
  // intrinsic rank four and radius four; no mathematical diagonal is added.
  const vertices=corners.flatMap(p=>[p.slice(),p.map(x=>x===0?0:-x)]);
  for(let k=0;k<4;k++)for(const sign of [1,-1])vertices.push(Array.from({length:4},(_,i)=>i===k?4*sign:0));
  return {id:'literal-spherical-seam-quad',name:'Literal spherical same-face seam',dimension:4,embeddingDimension:4,
    interpretation:'generalized-complex',vertices,edges:[[0,2],[2,4],[4,6],[0,6]],faces:[[0,2,4,6]],cells:[],
    numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm',fillSemantics:'ordered-source-cycles',
      fixture:{plane:'Z=0.4, W=0; positive-Z unit S2 hemisphere',isolatedBounds:'Explicit unused antipodes; no hull replacement'},
      retainedAttribute:{values:[3,.125],label:'Keep source attributes'},offColors:{faces:[{encoding:'unit',values:[.35,.65,.85,1]}],cells:[]}}};
}
// Inverse radial stereographic image followed by a two-vector Gram solve.
// This classifies output endpoints on the ORIGINAL raw a->c parameter line;
// it does not infer topology by joining arbitrary nearby source coordinates.
function seamBoundary(triangles,owners,a,c,normals=null){
  const aa=dot(a,a),ac=dot(a,c),cc=dot(c,c),den=aa*cc-ac*ac,sets=[new Map(),new Map()];
  assert.ok(den>0);
  for(let patch=0;patch<owners.length;patch++){
    const owner=owners[patch];if(owner!==0&&owner!==1)continue;
    for(let j=0;j<3;j++){
      const offset=patch*9+j*3,p=Array.from(triangles.slice(offset,offset+3)),s=dot(p,p),q=[...p.map(x=>2*x/(1+s)),(s-1)/(1+s)];
      const aq=dot(a,q),cq=dot(c,q),u=(cc*aq-ac*cq)/den,v=(aa*cq-ac*aq)/den;
      const residual=Math.hypot(...q.map((x,i)=>x-u*a[i]-v*c[i]));
      // Float32 worker endpoints incur roundoff. Tolerance only identifies
      // this known line; boundary equality below uses EXACT stored XYZ.
      if(residual>2e-6||u< -2e-6||v< -2e-6||u+v<=0)continue;
      const t=v/(u+v);if(t< -2e-6||t>1+2e-6)continue;
      const key=p.map(x=>x===0?0:x).join(',');
      sets[owner].set(key,{t,point:p,normal:normals?Array.from(normals.slice(offset,offset+3)):null});
    }
  }
  const boundaries=sets.map(s=>[...s.values()].sort((a,b)=>a.t-b.t));
  const unmatched=sets.map((s,i)=>[...s.entries()].filter(([k])=>!sets[1-i].has(k)).map(([,v])=>v));
  let maximumNormalDifference=0;
  for(const [key,v] of sets[0]){const other=sets[1].get(key);if(v.normal&&other?.normal)maximumNormalDifference=Math.max(maximumNormalDifference,Math.hypot(...v.normal.map((x,k)=>x-other.normal[k])));}
  return {samples:boundaries.map(b=>b.length),boundaries,unmatched,maximumNormalDifference};
}
function probeInit(){
  if(window.__surfaceSeamProbe)return;
  const Native=window.Worker,workers=[],events=[];let serial=0;
  const push=e=>{events.push({time:performance.now(),...e});if(events.length>160)events.shift();};
  const probe=window.__surfaceSeamProbe={workers,events,last:null};
  window.Worker=function(...args){
    const worker=new Native(...args),id=++serial,post=worker.postMessage.bind(worker),jobs=new Map();
    workers.push({id,url:String(args[0]),native:worker instanceof Native});
    worker.postMessage=(job,...rest)=>{
      if(job?.type==='geometry-job'){
        jobs.set(job.jobId,{jobId:job.jobId,sourceKey:job.sourceKey,frameKey:job.frameKey,phase:job.phase,quality:JSON.parse(JSON.stringify(job.quality)),
          sourceCounts:{...job.geometry.sourceCounts},trianglePositions:Array.from(job.geometry.trianglePositions),faceIds:Array.from(job.geometry.faceIds)});
        push({kind:'posted',id,jobId:job.jobId,phase:job.phase,frameKey:job.frameKey});
      }
      return post(job,...rest);
    };
    worker.addEventListener('message',event=>{
      const r=event.data,j=jobs.get(r?.jobId);if(!j)return;jobs.delete(r.jobId);
      push({kind:'completed',id,jobId:r.jobId,phase:r.phase,type:r.type,complete:r.complete,triangles:r.geometry?.faceIds.length,workerComputeMs:r.workerComputeMs});
      if(r.type==='geometry-result'){
        // Only the latest result is retained, at most the production 100k
        // triangles. Copies inspect real transport buffers without mutation.
        probe.last={...j,id,complete:r.complete,exactPose:r.exactPose,achievedTolerance:r.achievedTolerance,
          unresolvedTriangles:r.unresolvedTriangles,omittedTriangles:r.omittedTriangles,clippedTriangles:r.clippedTriangles,
          diagnostics:r.geometry.diagnostics.slice(),triangles:Array.from(r.geometry.triangles),normals:Array.from(r.geometry.normals),
          faceIds:Array.from(r.geometry.faceIds),triangleInstanceIds:Array.from(r.geometry.triangleInstanceIds),triangleResolution:Array.from(r.geometry.triangleResolution)};
      }
    });
    return worker;
  };
  window.Worker.prototype=Native.prototype;Object.setPrototypeOf(window.Worker,Native);
}
function pixelMetrics(rows,opacity){
  const background=(21+25+31)/3,minimumContrast=opacity===1?18:8,maximumJump=opacity===1?18:14;
  let lowest=Infinity,jump=0;
  for(const row of rows){for(const p of row)lowest=Math.min(lowest,p);for(let i=1;i<row.length;i++)jump=Math.max(jump,Math.abs(row[i]-row[i-1]));}
  return {lowestLuminance:lowest,backgroundLuminance:background,minimumContrast,maximumAdjacentJump:jump,allowedAdjacentJump:maximumJump,
    noBlackGap:lowest>background+minimumContrast,noSharpJump:jump<=maximumJump};
}
async function selfTest(){
  const {buildFaceSurfaces}=await import('../ui/face-fill.mjs'),{stereographicTriangle}=await import('../ui/stereographic.mjs');
  const m=literal(),center=Array(4).fill(0);m.vertices.forEach(p=>p.forEach((x,k)=>center[k]+=x/m.vertices.length));assert.deepEqual(center,[0,0,0,0]);
  assert.equal(Math.max(...m.vertices.map(p=>Math.hypot(...p))),4);assert.equal(m.vertices.length,16);
  const f=buildFaceSurfaces(m);assert.deepEqual(f.diagnostics,[]);assert.deepEqual(f.triangles.map(t=>t.vertices),[[0,2,4],[0,4,6]]);
  const patches=f.triangles.map(t=>stereographicTriangle(t.points,{tolerance:.004,maxDepth:8}));assert.ok(patches.every(p=>!p.exhausted&&!p.clippedTriangles));
  const positions=Float32Array.from(patches.flatMap(p=>p.triangles.flat(2))),owners=patches.flatMap((p,i)=>Array(p.triangles.length).fill(i)),s=seamBoundary(positions,owners,corners[0],corners[2]);
  assert.deepEqual(patches.map(p=>p.triangles.length),[1168,928]);assert.ok(s.unmatched.flat().length>=2,'Fixture must detect the real independent-subdivision seam.');
  assert.deepEqual(s.samples,[30,28]);
  // Independent perfect joined-triangle fixture must pass; a retained extra
  // midpoint on ONLY one side must fail, even with otherwise correct normals.
  const a=sphere(corners[0]),c=sphere(corners[2]),b=sphere(corners[1]),d=sphere(corners[3]),mid=sphere(mixed(corners[0],corners[2],.5));
  const equal=seamBoundary(Float32Array.from([a,b,c,a,c,d].flat()),[0,1],corners[0],corners[2]);assert.deepEqual(equal.unmatched,[[],[]]);
  const unequal=seamBoundary(Float32Array.from([a,b,mid,mid,b,c,a,c,d].flat()),[0,0,1],corners[0],corners[2]);assert.ok(unequal.unmatched[0].length>0);
  assert.equal(pixelMetrics([[90,92,94,95]],1).noBlackGap,true);assert.equal(pixelMetrics([[90,25,90]],1).noBlackGap,false);
  assert.equal(pixelMetrics([[90,130,130]],1).noSharpJump,false);assert.equal(pixelMetrics([[40,42,44]],.45).noBlackGap,true);
  console.log('Surface seams headless self-test PASS: real legacy complete-mesh defect + conformity and pixel negative controls.');
}
function nativeSelfTest(){
  const model=literal(),project={format:'polytope-laboratory',version:1,active:0,documents:[{id:'literal-seam-native-document',cursor:0,states:[{model,notes:'Native seam fixture notes',view:{coordinateUnit:'mm',angles:Array(6).fill(0),projection:'stereographic',cameraProjection:'orthographic',faces:true,vertices:false,edges:false,sectionNormal:[0,0,0,1],sectionOffset:0,derivedMode:'section'}}]}]};
  const {spawnSync}=require('node:child_process'),result=spawnSync(process.env.POLYTOPE_PYTHON||'python',['-B','-m','engine.server'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,input:JSON.stringify({id:'literal-seam-validation',op:'validate-project',params:{project}})+'\n'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);const value=JSON.parse(result.stdout.trim());assert.equal(value.ok,true,value.error);
  const saved=active(value.result);for(const field of ['vertices','edges','faces','cells'])assert.deepEqual(saved.model[field],model[field]);
  assert.deepEqual(saved.model.metadata,model.metadata);assert.equal(saved.model.interpretation,'generalized-complex');assert.equal(saved.view.coordinateUnit,'mm');assert.equal(saved.notes,'Native seam fixture notes');assert.match(saved.model.fingerprint,/^[a-f0-9]{64}$/);
  console.log('Surface seams native literal/isolated-vertex/source RGBA/unit/notes validation PASS; no app launched.');
}
async function main(){
  const runtime=await guardRuntime(),{_electron:electron}=require('playwright'),THREE=require('three');
  const artifacts=path.resolve(process.env.POLYTOPE_TEST_ARTIFACTS||path.join(root,'artifacts'));await fs.mkdir(artifacts,{recursive:true});
  const folder=await fs.mkdtemp(path.join(artifacts,'stereographic-surface-seams-')),profile=path.join(folder,'profile');await fs.mkdir(profile);
  await fs.writeFile(path.join(profile,'linked-libraries.json'),JSON.stringify({version:1,paths:[]}));
  const env={...process.env,POLYTOPE_TEST_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;if(runtime.packaged)env.POLYTOPE_PYTHON=path.join(folder,'unavailable-development-python.exe');
  const app=await electron.launch({executablePath:runtime.packaged||require('electron'),args:runtime.packaged?[]:[root],cwd:root,env,timeout:30000});
  let page;const errors=[],checks=[],evidence=[],files=[],failures=[];let sequence=0,stage='startup';
  const expect=(condition,message)=>{if(!condition)failures.push({stage,message});};
  try{
    assert.equal(await app.evaluate(({app})=>app.polytopeQualification?.mode),runtime.hidden?'hidden-no-focus':undefined);
    // Resizing the existing test window creates no other window or dialog.
    // <=650 CSS viewport height makes the selected fine tolerance exactly .004.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1280,760));
    page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(probeInit);await page.reload();
    await page.waitForFunction(()=>document.getElementById('model-name')?.textContent==='Tesseract');
    await page.evaluate(()=>{window.__seamStatuses=[];new MutationObserver(()=>window.__seamStatuses.push(document.getElementById('status').textContent)).observe(document.getElementById('status'),{childList:true,characterData:true,subtree:true});});
    const settled=async()=>{await page.waitForFunction(()=>document.getElementById('cancel').hidden);await page.evaluate(()=>new Promise(resolve=>{let n=6;const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));};
    const statusesReset=()=>page.evaluate(()=>window.__seamStatuses.length=0);
    async function save(label){await settled();await page.keyboard.press('Escape');const file=path.join(folder,`${++sequence}-${label}.polyproj`);await statusesReset();await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#save').click();await page.waitForFunction(file=>window.__seamStatuses.includes('Saved '+file),file);await settled();const bytes=await fs.readFile(file);files.push({file,sha256:hash(bytes)});return {file,project:JSON.parse(bytes)};}
    async function open(file,name){await settled();await statusesReset();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await page.locator('#open').click();await page.waitForFunction(({file,name})=>window.__seamStatuses.includes('Opened '+file)&&document.getElementById('model-name').textContent===name,{file,name});await settled();}
    async function idle(){await page.waitForFunction(()=>{const n=document.getElementById('view-diagnostic'),p=window.__surfaceSeamProbe.last;return n?.dataset.stereographicPending==='false'&&n.dataset.stereographicPhase==='idle'&&p?.phase==='idle'&&n.dataset.stereographicFrameKey===p.frameKey;},{},{timeout:30000});await settled();}
    async function png(label){await statusesReset();const file=path.join(folder,label+'.png');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);await page.locator('#image').click();await page.waitForFunction(file=>window.__seamStatuses.includes('Saved '+file),file);assert.equal((await fs.readFile(file)).subarray(0,8).toString('hex'),'89504e470d0a1a0a');await settled();return file;}
    function cameraFor(v,width,height){assert.equal(v.projection,'orthographic');const half=v.orthographicHalfHeight,c=new THREE.OrthographicCamera(-half*width/height,half*width/height,half,-half,.01,1000);c.position.fromArray(v.position);c.up.fromArray(v.up);c.zoom=v.zoom;c.lookAt(new THREE.Vector3(...v.target));c.updateProjectionMatrix();c.updateMatrixWorld();return c;}
    async function samples(camera,pointRows){const [w,h]=await page.locator('#base-canvas canvas').evaluate(c=>[c.width,c.height]);const c=cameraFor(camera,w,h),locations=pointRows.map(points=>points.map(p=>{const q=new THREE.Vector3(...p).project(c);return [Math.round((q.x+1)*w/2),Math.round((1-q.y)*h/2)];}));const rows=await page.evaluate(rows=>{const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);return rows.map(row=>row.map(([x,y])=>{if(x<0||y<0||x>=canvas.width||y>=canvas.height)throw Error('Analytic GPU sample lies outside the viewport.');const p=ctx.getImageData(x,y,1,1).data;return (p[0]+p[1]+p[2])/3;}));},locations);return {size:[w,h],locations,rows};}
    const original=active((await save('original-tesseract')).project),cssHeight=await page.locator('#base-canvas canvas').evaluate(c=>c.getBoundingClientRect().height);
    const camera={position:[0,0,8],target:[0,0,0],projection:'orthographic',zoom:1,up:[0,1,0],orthographicHalfHeight:Math.max(1.1,cssHeight*.0021)};
    const source=literal(),notes='One literal face; unused antipodes are deliberate. Preserve notes, source RGBA and mm units.';
    const makeProject=(model,projection,opacity,viewExtra={})=>({format:'polytope-laboratory',version:1,active:0,documents:[{id:'same-source-surface-proof',cursor:0,states:[{model:clone(model),notes,label:'Independent seam fixture',view:{...clone(original.view),projection,cameraProjection:'orthographic',camera:clone(camera),angles:Array(6).fill(0),viewportLayout:'single',faces:true,edges:false,vertices:false,cellShrink:1,hiddenCells:[],isolatedCell:null,cellFacing:'all',surfaceColors:'source',surfaceOpacity:opacity,presentation:opacity===1?'solid':'translucent',coordinateUnit:'mm',orientationFrame:null,...viewExtra}}]}]});
    let canonicalSource=null,savedCamera=null;
    for(const projection of ['perspective','stereographic'])for(const opacity of [1,.45]){
      stage=`quad-${projection}-${opacity===1?'opaque':'translucent'}`;
      const file=path.join(folder,stage+'.polyproj');await fs.writeFile(file,JSON.stringify(makeProject(source,projection,opacity)));files.push({file,sha256:hash(await fs.readFile(file))});await open(file,source.name);
      if(projection==='stereographic')await idle();await png(stage);const saved=active((await save(stage+'-source')).project);
      if(!canonicalSource)canonicalSource=clone(saved.model);else assert.deepEqual(saved.model,canonicalSource,'Projection/capture must preserve complete native source attributes.');
      assert.deepEqual(saved.model.vertices,source.vertices);assert.deepEqual(saved.model.faces,source.faces);assert.deepEqual(saved.model.metadata.offColors,source.metadata.offColors);assert.equal(saved.notes,notes);assert.equal(saved.view.coordinateUnit,'mm');
      if(!savedCamera)savedCamera=clone(saved.view.camera);else assert.deepEqual(saved.view.camera,savedCamera,'Compare modes must use the same saved observer camera.');
      const points=projection==='stereographic'?Array.from({length:121},(_,i)=>{const x=-.55+i*1.2/120,y=.15;return [x,y,Math.sqrt(1-x*x-y*y)];}):Array.from({length:121},(_,i)=>[-.4+i*.8/120,.1,.1]);
      const row=await samples(saved.view.camera,[points]),range=Math.max(...row.rows[0])-Math.min(...row.rows[0]),maxJump=Math.max(...row.rows[0].slice(1).map((x,i)=>Math.abs(x-row.rows[0][i])));
      const entry={stage,opacity,camera:saved.view.camera,row,lightingRange:range,maximumRowJump:maxJump};
      if(projection==='stereographic'){
        const result=await page.evaluate(()=>window.__surfaceSeamProbe.last);assert.equal(result.sourceCounts.faces,1);assert.equal(result.sourceCounts.triangles,2);assert.equal(result.phase,'capture');
        expect(result.complete&&result.exactPose,'The literal non-pole fine surface must be complete.');expect(result.achievedTolerance===.004,'Fixture must use the known .004 fine criterion.');expect(result.faceIds.every(f=>f===0),'All subdivided patches must retain the same source face.');
        const a=result.trianglePositions.slice(0,4),c=result.trianglePositions.slice(8,12),seam=seamBoundary(result.triangles,result.triangleInstanceIds,a,c,result.normals);
        expect(seam.samples.every(n=>n>10),'Enough genuine shared-boundary samples must be present to exercise adaptive subdivision.');expect(!seam.unmatched.flat().length,'Same-face patches have nonmatching EXACT Float32 shared-edge samples (T-junctions).');expect(seam.maximumNormalDifference<1e-5,'Analytic normals disagree at a shared same-face sample.');
        expect(range>4,'S2 lighting must vary positively; a uniformly flat-shaded quad is not a passing repair.');expect(maxJump<=8,'S2 interior lighting row has an abrupt discontinuity.');
        const [width,height]=row.size,cam=cameraFor(saved.view.camera,width,height),toPixel=p=>{const q=new THREE.Vector3(...p).project(cam);return [(q.x+1)*width/2,(1-q.y)*height/2];};
        // Endpoint neighborhoods approach the sphere silhouette: a seven-pixel
        // cross-band there legitimately crosses the outer boundary. Probe the
        // interior diagonal, including the known legacy .21875 mismatch; keep
        // the independent exact mesh check over the ENTIRE shared diagonal.
        const ts=[.21875,...Array.from({length:81},(_,i)=>.15+i*.5/80)],pixelRows=[],locations=[];
        for(const t of ts){const p=sphere(mixed(corners[0],corners[2],t)),q=toPixel(p),lo=toPixel(sphere(mixed(corners[0],corners[2],t-1e-5))),hi=toPixel(sphere(mixed(corners[0],corners[2],t+1e-5))),dx=hi[0]-lo[0],dy=hi[1]-lo[1],n=Math.hypot(dx,dy);
          locations.push(Array.from({length:7},(_,i)=>[Math.round(q[0]+(i-3)*-dy/n),Math.round(q[1]+(i-3)*dx/n)]));}
        pixelRows.push(...await page.evaluate(rows=>{const source=document.querySelector('#base-canvas canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);return rows.map(row=>row.map(([x,y])=>{if(x<0||y<0||x>=canvas.width||y>=canvas.height)throw Error('Seam band exceeds viewport.');const p=ctx.getImageData(x,y,1,1).data;return (p[0]+p[1]+p[2])/3;}));},locations));
        const metrics=pixelMetrics(pixelRows,opacity);expect(metrics.noBlackGap,'Actual GPU internal diagonal contains a background-dark gap.');expect(metrics.noSharpJump,'Actual GPU seam band contains a sharp same-face lighting jump.');
        Object.assign(entry,{worker:{jobId:result.jobId,phase:result.phase,complete:result.complete,achievedTolerance:result.achievedTolerance,triangles:result.faceIds.length,triangleResolution:result.triangleResolution,diagnostics:result.diagnostics},seam,band:{ts,locations,pixels:pixelRows,metrics}});
      }else{expect(maxJump<=8,'Literal planar perspective baseline has an abrupt interior lighting jump.');expect(Math.min(...row.rows[0])>30,'Perspective baseline must contain a filled face.');}
      evidence.push(entry);await page.screenshot({path:path.join(folder,stage+'-workspace.png')});
    }
    checks.push('the same literal source/RGBA/notes/units and observer camera survive opaque/translucent perspective and stereographic native captures');
    checks.push('real Worker fine patches share exact packed boundary endpoints and analytic normals; sampled GPU diagonal bands have no black gaps or abrupt jumps while curved lighting remains visible');
    // Tesseract screenshots exercise the real many-face domain and an actual
    // rotation control. Pole/cap incompleteness remains explicit: these are
    // presentation screenshots, not a complete mesh/capture certificate.
    for(const opacity of [1,.22]){
      stage='tesseract-'+(opacity===1?'opaque':'translucent');const file=path.join(folder,stage+'.polyproj');await fs.writeFile(file,JSON.stringify(makeProject(original.model,'stereographic',opacity,{coordinateUnit:original.view.coordinateUnit||'model'})));files.push({file,sha256:hash(await fs.readFile(file))});await open(file,original.model.name);await idle();
      await page.screenshot({path:path.join(folder,stage+'-still.png')});await page.locator('#rotation-settings').evaluate(n=>{n.open=true;});await page.locator('#plane-2').evaluate(n=>{n.value='17';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');await idle();await page.screenshot({path:path.join(folder,stage+'-rotated.png')});
      const saved=active((await save(stage+'-source')).project);assert.deepEqual(saved.model,original.model);assert.equal(saved.view.angles[2],17);
      const result=await page.evaluate(()=>window.__surfaceSeamProbe.last);evidence.push({stage,rotationDegrees:17,complete:result.complete,sourceCounts:result.sourceCounts,outputTriangles:result.faceIds.length,diagnostics:result.diagnostics});
    }
    checks.push('actual tesseract opaque/translucent rendering and XW rotation retain the complete mathematical source; any pole/quality omission is recorded without a complete-mesh claim');
    const probe=await page.evaluate(()=>({workers:window.__surfaceSeamProbe.workers,events:window.__surfaceSeamProbe.events}));assert.ok(probe.workers.some(w=>w.native&&/stereographic-worker/.test(w.url)),'Real module Worker must run.');
    for(const f of files)assert.equal(hash(await fs.readFile(f.file)),f.sha256);assert.deepEqual(errors,[]);
    const result={passed:!failures.length,packaged:Boolean(runtime.packaged),hidden:runtime.hidden,runtime:runtime.runtime,version:await app.evaluate(({app})=>app.getVersion()),checks,failures,evidence,files,probe,pageErrors:errors,
      limits:'Finite sampled GPU rows/bands and this literal source only; no whole-surface/pixel maximum, transparency ordering or universal GPU certificate.'};
    await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));assert.deepEqual(failures,[],'Surface seam regression failures are recorded in result.json.');console.log('Stereographic surface seams PASS. Artifacts: '+folder);
  }catch(error){await page?.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({passed:false,stage,error:error.stack,failures,checks,evidence,pageErrors:errors},null,2));console.error('Artifacts: '+folder);throw error;}
  finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
}
if(require.main===module){Promise.resolve().then(()=>process.argv.includes('--self-test')?selfTest():process.argv.includes('--native-self-test')?nativeSelfTest():main()).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={literal,seamBoundary,pixelMetrics,selfTest,nativeSelfTest};
