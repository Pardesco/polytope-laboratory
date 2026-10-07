const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {createProjectStorage}=require('./project-storage.cjs');
const projectStorage=createProjectStorage({writeProject:(file,project)=>engine({op:'save',params:{path:file,project}})});
const {createTextExport}=require('./text-export.cjs');
const textExports=createTextExport({selectPath:({format,defaultName})=>dialog.showSaveDialog(window,{defaultPath:defaultName,filters:[{name:format.toUpperCase()+' supporting data',extensions:[format]}]})});
const { createAnimationExportManager, validateExportOptions } = require('./animation-export.cjs');
const animationExports=createAnimationExportManager();
const jobs = new Map();
const queue = [];
const root = path.join(__dirname, '..');
let window, dirty = false, closeAllowed = false;
const allowed = new Set(['prepare-dual-morph','evaluate-dual-morph','catalog','regular4d-validate','generate','hull','rational-hull','rational-dual','analyze','validate','validate-project','entity-orientation','compound-add','compound-component','compound-drop','cell-facing','recipe-run','recipe-replay','recipe-branch','prepare-export','validate-tour','face-coincidences','remove-coincident-pairs','blend-faces','subdivide-edges','polygon-prism','polyhedron-prism','attach-at-faces','place-at-faces','source-zonohedron','spring-relaxation','spring-relaxation-preview','convex-core-4d','triangular-geodesic','convex-core','convex-layer-join','fit-strict-layer-join','analyze-strict-segmentotope','scale-reference','dual','incidence-dual','truncate','section','vertex-figure','extrude','transform','symmetry','measure','entity-measure','entity-info','dihedral','align-section','expression','expression-batch','orientation','net','net-edit','net-fold','net-pack','cell-net','cell-net-edit','cell','facet','facet-candidates','facet-search','facet-adopt','arrangement','arrangement-diagram','stellation-union','stellation-enumerate']);
allowed.add('facet-diagram');
allowed.add('element-content-describe');
allowed.add('stellation-cell-graph');
allowed.add('sphere-project');
allowed.add('reflect-source');
for(const op of ['coincidic-compare','coincidic-record','coincidic-compound'])allowed.add(op);
for(const op of ['generalized-density-info','generalized-density-restore'])allowed.add(op);
allowed.add('projective-incidence-dual');
allowed.add('element-label-presets');
allowed.add('expand-runcinate');
allowed.add('geometry-fit');
allowed.add('geometry-fit-preview');
allowed.add('exact-surface-section');
allowed.add('exact-surface-section-preview');
allowed.add('incidence-truncate');
allowed.add('incidence-truncate-preview');
for(const op of ['net-reinforcement','net-measurements','net-reinforcement-pages'])allowed.add(op);
for(const op of ['coincident-edge-qualify','coincident-edge-net','coincident-edge-edit','coincident-edge-pages','coincident-edge-fold','coincident-edge-restore'])allowed.add(op);
for(const op of ['vertex-figure-candidates','construct-from-vertex-figure'])allowed.add(op);
const formats = { off:'off',json:'json',obj:'obj',stl:'stl',dxf:'dxf',vrml:'wrl',pov:'pov',svg:'svg' };
const recoveryPath = () => path.join(app.getPath('userData'), 'recovery.polyproj');
const libraryPreferencesPath = () => path.join(app.getPath('userData'), 'linked-libraries.json');
const qualificationError=name=>new Error(`${name} is unavailable in hidden-no-focus qualification mode. Native dialogs/activation require an explicit test stub or ordinary user mode.`);
// Explicit qualification mode, never inferred from packaged/development status.
// Reject malformed opt-ins before readiness/window construction; tests must use
// an isolated profile. This mode is qualified only for the Windows desktop.
const qualificationMode=process.env.POLYTOPE_TEST_MODE;
// Block error boxes even for an invalid opt-in. Do not throw at startup: Electron
// can display a native main-process error box for an uncaught configuration error.
if(qualificationMode!==undefined){
  for(const name of ['showOpenDialog','showSaveDialog','showMessageBox'])dialog[name]=async()=>{throw qualificationError(`dialog.${name}`);};
  for(const name of ['showOpenDialogSync','showSaveDialogSync','showMessageBoxSync','showErrorBox'])dialog[name]=()=>{throw qualificationError(`dialog.${name}`);};
}
const hiddenQualification=qualificationMode==='hidden-no-focus';
const qualificationProblem=qualificationMode!==undefined&&!hiddenQualification?'Unknown POLYTOPE_TEST_MODE; use hidden-no-focus or leave it unset.':hiddenQualification&&(process.platform!=='win32'||!process.env.POLYTOPE_TEST_USER_DATA||!path.isAbsolute(process.env.POLYTOPE_TEST_USER_DATA)||path.resolve(process.env.POLYTOPE_TEST_USER_DATA).toLowerCase()===path.resolve(app.getPath('userData')).toLowerCase())?'Hidden qualification requires Windows and an absolute isolated POLYTOPE_TEST_USER_DATA profile.':null;
if(qualificationProblem){process.stderr.write(qualificationProblem+'\n');app.exit(2);return;}
if (process.env.POLYTOPE_TEST_USER_DATA) app.setPath('userData', process.env.POLYTOPE_TEST_USER_DATA);
// Hidden qualification also bypasses Chromium's Windows occlusion classifier.
// Apply before readiness; never change ordinary renderer scheduling or replace
// unrelated caller-provided disabled features. Background throttling remains
// disabled per WebContents; this does not show/activate a native window.
let qualificationScheduling;
if(hiddenQualification){
  const flag='disable-backgrounding-occluded-windows';
  if(!app.commandLine.hasSwitch(flag))app.commandLine.appendSwitch(flag);
  const feature='CalculateNativeWinOcclusion',disabled=app.commandLine.getSwitchValue('disable-features');
  if(!disabled.split(',').some(value=>value.trim()===feature))app.commandLine.appendSwitch('disable-features',disabled?disabled+','+feature:feature);
  qualificationScheduling=Object.freeze({occludedWindowBackgrounding:false,nativeWinOcclusion:false,disableFeatures:app.commandLine.getSwitchValue('disable-features')});
}

function lockQualificationWindow(created){
  if(!hiddenQualification)return;
  for(const name of ['show','showInactive','focus','restore','maximize','minimize','moveTop','setFullScreen','setKiosk','setAlwaysOnTop','setFocusable','setSkipTaskbar','flashFrame'])if(typeof created[name]==='function')Object.defineProperty(created,name,{value:()=>{throw qualificationError(`BrowserWindow.${name}`);},writable:false,configurable:false});
  // Electron exposes property setters as well as methods for these operations.
  for(const name of ['focusable','fullScreen','simpleFullScreen','kiosk'])Object.defineProperty(created,name,{get:()=>false,set:()=>{throw qualificationError(`BrowserWindow.${name}`);},configurable:false});
  for(const name of ['focus','openDevTools','inspectElement'])if(typeof created.webContents[name]==='function')Object.defineProperty(created.webContents,name,{value:()=>{throw qualificationError(`webContents.${name}`);},writable:false,configurable:false});
  // Print is writable so the harness can supply an explicit callback stub.
  created.webContents.print=()=>{throw qualificationError('Native printing');};
  created.webContents.setAudioMuted(true);
  created.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  created.webContents.on('will-attach-webview',event=>event.preventDefault());
  created.webContents.on('will-prevent-unload',event=>event.preventDefault());
}
if(hiddenQualification){
  Object.defineProperty(app,'focus',{value:()=>{throw qualificationError('app.focus');},writable:false,configurable:false});
  // These are Electron's actual native entry points, replaced BEFORE readiness.
  // Existing explicit test dialog overrides remain supported and never invoke
  // the originals. No renderer-provided arbitrary destination is introduced.
  app.on('browser-window-created',(_event,created)=>lockQualificationWindow(created));
  Object.defineProperty(app,'polytopeQualification',{value:Object.freeze({version:1,mode:qualificationMode,platform:process.platform,profile:app.getPath('userData'),windowVisibility:'hidden',focusable:false,skipTaskbar:true,nativeDialogs:'blocked-unless-explicitly-stubbed',nativePrint:'blocked-unless-explicitly-stubbed',backgroundThrottling:false,engineWindowsHide:true,scheduling:qualificationScheduling}),writable:false,configurable:false});
}
function createAppWindow(options){
  return new BrowserWindow(hiddenQualification?{...options,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:false,fullscreen:false,kiosk:false,paintWhenInitiallyHidden:true,webPreferences:{...options.webPreferences,backgroundThrottling:false,disableDialogs:true,focusOnNavigation:false,disableHtmlFullscreenWindowResize:true}}:options);
}

function engine(request, jobId = crypto.randomUUID()) {
  if (jobs.has(jobId) || queue.some(j=>j.jobId===jobId)) return Promise.reject(new Error('Duplicate job ID.'));
  if (jobs.size>=3) {
    if(queue.length>=40) return Promise.reject(new Error('Job queue is full. Cancel pending work before continuing.'));
    return new Promise((resolve,reject)=>queue.push({request,jobId,resolve,reject}));
  }
  return execute(request,jobId);
}
function drainQueue(){
  while(queue.length && jobs.size<3){const task=queue.shift();execute(task.request,task.jobId).then(task.resolve,task.reject);}
}
function execute(request,jobId){
  return new Promise((resolve, reject) => {
    const executable = app.isPackaged ? path.join(process.resourcesPath,'engine','polytope-engine.exe') : (process.env.POLYTOPE_PYTHON || 'python');
    const args = app.isPackaged ? [] : ['-u',path.join(root,'engine','server.py')];
    const proc = spawn(executable,args,{cwd:app.isPackaged?process.resourcesPath:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
    jobs.set(jobId,proc);
    let output='',error='',settled=false;
    const finish = (err,value) => {
      if (settled) return;
      settled=true; clearTimeout(timer); jobs.delete(jobId); proc.kill();
      err ? reject(err) : resolve(value);
      drainQueue();
    };
    const timer = setTimeout(() => finish(new Error('Job exceeded the two-minute resource limit. Source geometry remains available.')),120000);
    proc.on('error', e => finish(new Error('Geometry engine could not start: '+e.message)));
    proc.stdout.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > 128*1024*1024) return finish(new Error('Engine output exceeds the 128 MiB limit.'));
      const newline=output.indexOf('\n');
      if (newline < 0) return;
      try { const result=JSON.parse(output.slice(0,newline)); finish(result.ok ? null : new Error(result.error),result.result); }
      catch(e) { finish(new Error('Invalid engine response: '+e.message)); }
    });
    proc.stderr.on('data', chunk => { error=(error+chunk.toString('utf8')).slice(-4000); });
    proc.on('exit',code => { if (!settled) finish(new Error(code === null ? 'Job cancelled.' : 'Engine exited before completing: '+error)); });
    proc.stdin.on('error',e=>finish(e));
    try { proc.stdin.end(JSON.stringify({...request,id:jobId})+'\n'); }
    catch(e) { finish(e); }
  });
}

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender.');
}
function handle(channel,fn) { ipcMain.handle(channel,async(event,...args)=>{trusted(event);return fn(...args);}); }
function action(name) { window?.webContents.send('menu-action',name); }

app.whenReady().then(() => {
  handle('engine',(request,id)=>{
    if (!request || !allowed.has(request.op)) throw new Error('Operation is unavailable through the geometry API.');
    return engine(request,id);
  });
  handle('cancel',id=>{const p=jobs.get(id);if(p){p.kill();return true;}const i=queue.findIndex(j=>j.jobId===id);if(i>=0){queue.splice(i,1)[0].reject(new Error('Queued job cancelled.'));return true;}return false;});
  handle('open',async()=>{
    const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Polytope projects and geometry',extensions:['polyproj','off','dxf','json']}]});
    return canceled ? null : {...await engine({op:'load',params:{path:filePaths[0]}}),path:filePaths[0]};
  });
  handle('import-tour',async()=>{const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Saved tour',extensions:['polytour','json']}]});return canceled?null:engine({op:'load-tour',params:{path:filePaths[0]}});});
  handle('export-tour',async tour=>{const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Models.polytour',filters:[{name:'Saved tour',extensions:['polytour']}]});return canceled?null:engine({op:'save-tour',params:{path:filePath,tour}});});
  handle('save',async(project)=>{
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Untitled.polyproj',filters:[{name:'Polytope project',extensions:['polyproj']}]});
    if(canceled) return null;
    return projectStorage.publish(filePath,project);
  });
  handle('autosave',project=>projectStorage.publish(recoveryPath(),project,{backup:false}));
  handle('recover',async()=>{
    try { return await engine({op:'load',params:{path:recoveryPath()}}); }
    catch(e) { if(/No such file|cannot find|WinError 2|Errno 2/.test(e.message)) return null; throw e; }
  });
  handle('recovery-info',async()=>{try {const s=await fs.stat(recoveryPath());return {modified:s.mtime.toISOString()};} catch {return null;}});
  handle('dirty',value=>{dirty=Boolean(value);});
  handle('export',async(model,format)=>{
    if(!formats[format] || format==='svg') throw new Error('Unsupported model format.');
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:(model.name.replace(/[^a-zA-Z0-9 _-]/g,'')||'Model')+'.'+formats[format],filters:[{name:format.toUpperCase(),extensions:[formats[format]]}]});
    if(canceled) return null;
    return engine({op:'export',model,params:{format,path:filePath}});
  });
  handle('save-image',async(data)=>{
    if(typeof data !== 'string' || !data.startsWith('data:image/png;base64,') || data.length > 32*1024*1024) throw new Error('Invalid PNG image.');
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Polytope.png',filters:[{name:'PNG image',extensions:['png']}]});
    if(canceled) return null;
    await fs.writeFile(filePath,Buffer.from(data.slice(22),'base64')); return {path:filePath};
  });
  handle('save-svg',async(svg,name='Net.svg')=>{
    if(typeof svg!=='string' || svg.length>16*1024*1024 || !svg.startsWith('<svg')) throw new Error('Invalid SVG.');
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:path.basename(String(name)),filters:[{name:'SVG geometry',extensions:['svg']}]});
    if(canceled) return null;
    await fs.writeFile(filePath,svg,'utf8'); return {path:filePath};
  });
  const libraryPaths=new Map();
  let linkedRoots=[],libraryAudits={},libraryQueue=Promise.resolve();
  function libraryTask(fn){const task=libraryQueue.then(fn);libraryQueue=task.catch(()=>{});return task;}
  async function indexLinkedRoot(directory,auditPath=libraryAudits[path.resolve(directory)],verifyAuditHashes=false){
    const resolved=path.resolve(directory),realRoot=await fs.realpath(resolved);
    let entries,auditError;
    try{entries=await engine({op:'library',params:{path:resolved,...auditPath?{audit_path:auditPath}:{},...verifyAuditHashes?{verify_audit_hashes:true}:{}}});}
    catch(error){if(!auditPath)throw error;auditError=error.message;entries=await engine({op:'library',params:{path:resolved}});}
    const capabilities=[];
    for(const entry of entries){
      if(!entry.supported)continue;
      const realPath=await fs.realpath(entry.key);
      const relative=path.relative(realRoot,realPath);
      if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('Linked file resolves outside its catalog folder.');
      capabilities.push([path.resolve(entry.key),realPath,entry.relativePath]);
    }
    return {path:resolved,entries,capabilities,auditPath,auditError};
  }
  function authorizeLinkedRoot(library){
    for(const [file,realPath,relativePath] of library.capabilities){
      const roots=libraryPaths.get(file)?.roots||new Map();roots.set(library.path,relativePath);
      libraryPaths.set(file,{realPath,roots});
    }
    return {path:library.path,entries:library.entries,auditPath:library.auditPath,auditError:library.auditError};
  }
  async function saveLinkedRoots(paths,audits=libraryAudits){
    await fs.mkdir(app.getPath('userData'),{recursive:true});
    const target=libraryPreferencesPath(),pending=target+'.'+crypto.randomUUID()+'.pending';
    try{await fs.writeFile(pending,JSON.stringify({version:1,paths,audits:Object.fromEntries(paths.filter(p=>audits[p]).map(p=>[p,audits[p]]))},null,2));await fs.rename(pending,target);}
    finally{await fs.unlink(pending).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  // Restore only directories previously chosen through the native picker.
  handle('libraries',()=>libraryTask(async()=>{
    let stored;
    try{stored=JSON.parse(await fs.readFile(libraryPreferencesPath(),'utf8'));}
    catch(e){if(e.code==='ENOENT')return {libraries:[],errors:[]};throw new Error('Could not read linked library preferences: '+e.message);}
    if(stored.version!==1||!Array.isArray(stored.paths)||stored.paths.length>32||stored.paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('Invalid linked library preferences.');
    linkedRoots=[...new Set(stored.paths.map(p=>path.resolve(p)))];
    if(stored.audits!==undefined&&(typeof stored.audits!=='object'||stored.audits===null||Array.isArray(stored.audits)))throw new Error('Invalid library audit preferences.');
    libraryAudits={};
    for(const directory of linkedRoots){const audit=stored.audits?.[directory];if(audit){if(typeof audit!=='string'||!path.isAbsolute(audit))throw new Error('Invalid saved audit path.');const relative=path.relative(path.join(app.getPath('userData'),'library-audits'),audit);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Saved audit path is outside the application evidence folder.');libraryAudits[directory]=audit;}}
    libraryPaths.clear();const libraries=[],errors=[];
    for(const directory of linkedRoots){try{libraries.push(authorizeLinkedRoot(await indexLinkedRoot(directory)));}catch(e){errors.push({path:directory,error:e.message});}}
    return {libraries,errors};
  }));
  handle('library',()=>libraryTask(async()=>{
    const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openDirectory']});
    if(canceled) return null;
    const directory=path.resolve(filePaths[0]);
    if(!linkedRoots.includes(directory)&&linkedRoots.length>=32)throw new Error('Up to 32 linked catalog folders are supported. Remove a link before adding another.');
    const result=await indexLinkedRoot(directory);
    const updated=[...new Set([...linkedRoots,directory])];
    await saveLinkedRoots(updated);linkedRoots=updated;return authorizeLinkedRoot(result);
  }));
  handle('unlink-library',directory=>libraryTask(async()=>{
    if(typeof directory!=='string'||!linkedRoots.includes(path.resolve(directory)))throw new Error('This folder is not a linked catalog.');
    const resolved=path.resolve(directory),updated=linkedRoots.filter(p=>p!==resolved);
    await saveLinkedRoots(updated);linkedRoots=updated;delete libraryAudits[resolved];
    for(const [file,entry] of libraryPaths){entry.roots.delete(resolved);if(!entry.roots.size)libraryPaths.delete(file);}
    return {path:resolved};
  }));
  handle('attach-library-audit',directory=>libraryTask(async()=>{
    if(typeof directory!=='string'||!linkedRoots.includes(path.resolve(directory)))throw new Error('Choose a linked library folder.');
    const resolved=path.resolve(directory);
    const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Importer audit or compact evidence index',extensions:['json']}]});
    if(canceled)return null;
    const evidenceDirectory=path.join(app.getPath('userData'),'library-audits');await fs.mkdir(evidenceDirectory,{recursive:true});
    const output=path.join(evidenceDirectory,crypto.randomUUID()+'.library-index.json');
    await engine({op:'library-audit-index',params:{report_path:filePaths[0],output_path:output}});
    const library=await indexLinkedRoot(resolved,output);if(library.auditError)throw new Error(library.auditError);
    const audits={...libraryAudits,[resolved]:output};await saveLinkedRoots(linkedRoots,audits);libraryAudits=audits;
    return authorizeLinkedRoot(library);
  }));
  handle('verify-library-audit',directory=>libraryTask(async()=>{
    if(typeof directory!=='string'||!linkedRoots.includes(path.resolve(directory)))throw new Error('Choose a linked library folder.');
    const resolved=path.resolve(directory);if(!libraryAudits[resolved])throw new Error('Attach importer audit evidence first.');
    return authorizeLinkedRoot(await indexLinkedRoot(resolved,libraryAudits[resolved],true));
  }));
  handle('repair-library-copy',async p=>{
    if(typeof p!=='string')throw new Error('Choose a linked OFF file.');
    const entry=libraryPaths.get(path.resolve(p));if(!entry)throw new Error('This file is not in a supported linked catalog.');
    if(await fs.realpath(p)!==entry.realPath)throw new Error('Linked file location changed; relink its folder.');
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:path.basename(p,'.off')+'-corrected.off',filters:[{name:'Validated OFF copy',extensions:['off']}]});if(canceled)return null;
    try{await fs.lstat(filePath);throw new Error('Choose a new copy filename; existing files cannot be overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
    return engine({op:'library-edge-count-copy',params:{source_path:p,output_path:filePath}});
  });
  handle('library-model',async p=>{
    if(typeof p!=='string')throw new Error('Choose a linked OFF file.');
    const entry=libraryPaths.get(path.resolve(p));
    if(!entry) throw new Error('This geometry is not in a supported linked catalog.');
    const [directory,relativePath]=[...entry.roots][0];
    if(await fs.realpath(p)!==entry.realPath)throw new Error('Linked file location changed. Relink its catalog folder before loading it.');
    const result=await engine({op:'load',params:{path:p}});
    result.model.metadata.linkedLibraryRoot=directory;
    result.model.metadata.linkedRelativePath=relativePath;
    return result;
  });
  async function printDocument(svg) {
    if(typeof svg!=='string'||!svg.startsWith('<svg')||svg.length>16*1024*1024)throw new Error('Choose a 3D face net before printing.');
    const width=Number(svg.match(/width="([\d.e+-]+)mm"/)?.[1]),height=Number(svg.match(/height="([\d.e+-]+)mm"/)?.[1]);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||Math.max(width,height)>2000)throw new Error('Net page dimensions must be positive and no larger than 2,000 mm.');
    const printWindow=createAppWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,javascript:false}});
    const html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page {size:${width+20}mm ${height+20}mm;margin:10mm}body{margin:0}svg{display:block;width:${width}mm;height:${height}mm}</style></head><body>${svg}</body></html>`;
    await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    return {printWindow,width,height};
  }
  handle('print',async svg=>{
    const {printWindow}=await printDocument(svg);
    try{return await new Promise((resolve,reject)=>printWindow.webContents.print({printBackground:true,scaleFactor:100},(ok,reason)=>ok?resolve(true):reject(new Error(reason))));}
    finally{printWindow.destroy();}
  });
  handle('save-net-pdf',async svg=>{
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Net.pdf',filters:[{name:'PDF net',extensions:['pdf']}]});if(canceled)return null;
    const {printWindow}=await printDocument(svg);
    try{const data=await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,scale:1});await fs.writeFile(filePath,data);return {path:filePath};}
    finally{printWindow.destroy();}
  });
  async function packedPrintDocument(pages){
    if(!Array.isArray(pages)||!pages.length||pages.length>250||pages.some(svg=>typeof svg!=='string'||!svg.startsWith('<svg'))||pages.reduce((sum,svg)=>sum+svg.length,0)>32*1024*1024)throw new Error('Choose a valid packed net preview with up to 250 pages.');
    const dimensions=pages.map(svg=>['width','height'].map(key=>Number(svg.match(new RegExp(key+'="([\\d.e+-]+)mm"'))?.[1])));
    const [width,height]=dimensions[0];
    if(dimensions.some(d=>d.some(x=>!Number.isFinite(x)||x<20||x>2000)||d[0]!==width||d[1]!==height))throw new Error('Packed pages must have equal finite paper dimensions in 20Ã¢â‚¬â€œ2,000 mm.');
    const printWindow=createAppWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,javascript:false}});
    const html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page{size:${width}mm ${height}mm;margin:0}body{margin:0}.page{position:relative;width:${width}mm;height:calc(${height}mm - 1px);break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{position:absolute;top:0;left:0;display:block;width:${width}mm;height:${height}mm}</style></head><body>${pages.map(svg=>'<section class="page">'+svg+'</section>').join('')}</body></html>`;
    try{await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return printWindow;}catch(e){printWindow.destroy();throw e;}
  }
  handle('save-packed-net-pdf',async pages=>{
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Packed nets.pdf',filters:[{name:'PDF paper nets',extensions:['pdf']}]});if(canceled)return null;
    const printWindow=await packedPrintDocument(pages);
    try{await fs.writeFile(filePath,await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,scale:1}));return {path:filePath};}finally{printWindow.destroy();}
  });
  handle('render-packed-net-pdf',async pages=>{
    const printWindow=await packedPrintDocument(pages);
    try{return new Uint8Array(await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,scale:1}));}
    finally{printWindow.destroy();}
  });
  handle('text-export-begin',params=>textExports.begin(params));
  handle('text-export-write',(id,data)=>textExports.write(id,data));
  handle('text-export-abort',id=>textExports.abort(id));
  handle('print-packed-nets',async pages=>{const printWindow=await packedPrintDocument(pages);try{return await new Promise((resolve,reject)=>printWindow.webContents.print({printBackground:true,scaleFactor:100},(ok,reason)=>ok?resolve(true):reject(new Error(reason))));}finally{printWindow.destroy();}});
  handle('fullscreen',()=>{window.setFullScreen(!window.isFullScreen());return window.isFullScreen();});
  handle('animation-begin',async options=>{
    const spec=validateExportOptions(options);
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:spec.name+(spec.format==='png'?'.frames':'.webm'),filters:[{name:spec.format==='png'?'New PNG sequence folder':'WebM video',extensions:[spec.format==='png'?'frames':'webm']}]});
    return canceled?null:animationExports.begin(options,filePath);
  });
  handle('animation-write',(id,index,data)=>animationExports.write(id,index,data));
  handle('animation-finish',id=>animationExports.finish(id));
  handle('animation-abort',id=>animationExports.abort(id));
  const menu = [
    {label:'File',submenu:[{label:'New document',accelerator:'CmdOrCtrl+N',click:()=>action('new')},{label:'OpenÃ¢â‚¬Â¦',accelerator:'CmdOrCtrl+O',click:()=>action('open')},{label:'Save projectÃ¢â‚¬Â¦',accelerator:'CmdOrCtrl+S',click:()=>action('save')},{label:'Recover autosave',click:()=>action('recover')},{type:'separator'},{label:'Export modelÃ¢â‚¬Â¦',click:()=>action('export')},{label:'Save imageÃ¢â‚¬Â¦',click:()=>action('image')},{label:'PrintÃ¢â‚¬Â¦',accelerator:'CmdOrCtrl+P',click:()=>action('print')},{type:'separator'},{role:'quit'}]},
    {label:'Edit',submenu:[{label:'Undo geometry',accelerator:'CmdOrCtrl+Z',click:()=>action('undo')},{label:'Redo geometry',accelerator:'CmdOrCtrl+Shift+Z',click:()=>action('redo')},{type:'separator'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{label:'Reset camera',accelerator:'Home',click:()=>action('reset')},{label:'Fullscreen',accelerator:'F11',click:()=>action('fullscreen')},{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'}]},
    {label:'Help',submenu:[{label:'User guide',accelerator:'F1',click:()=>action('help')},{label:'About',click:()=>dialog.showMessageBox(window,{title:'Polytope Laboratory',message:'Polytope Laboratory '+app.getVersion(),detail:'Offline 3D/4D mathematical workspace. Convex operations use float64 predicates. Complete Stella4D parity is in progress.'})}]}
  ];
  Menu.setApplicationMenu(hiddenQualification?null:Menu.buildFromTemplate(menu));
  window=createAppWindow({width:1500,height:960,minWidth:1050,minHeight:720,backgroundColor:'#101722',title:'Polytope Laboratory',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',async event=>{
    if(hiddenQualification)return;
    if(dirty && !closeAllowed){ event.preventDefault();const result=await dialog.showMessageBox(window,{type:'question',buttons:['Keep working','Close'],defaultId:0,cancelId:0,message:'Close with unsaved changes?',detail:'A recovery snapshot is saved every 30 seconds. Save your project to preserve the latest changes.'});if(result.response===1){closeAllowed=true;window.close();}}
  });
  if(!hiddenQualification)window.on('ready-to-show',()=>window.show());
  window.loadFile(path.join(root,'dist','index.html'));
});
app.on('window-all-closed',()=>{textExports.dispose();for(const proc of jobs.values())proc.kill();animationExports.abortAll().finally(()=>app.quit());});
