const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, screen } = require('electron');
const {createStartupProfile,watchEngineReady}=require('./startup-profile.cjs');
const startupProfile=createStartupProfile(process.env.POLYTOPE_STARTUP_PROFILE==='1');
app.polytopeStartupProfile=startupProfile;
const { spawn } = require('node:child_process');
const {EnginePool}=require('./engine-pool.cjs');
const {applyWorkspaceMenu}=require('./workspace-menu.cjs');
const {createPresentationWindow}=require('./presentation-window.cjs');
const {parseFileArguments,createRecentFiles,createOpenRequests,focusExistingWindow}=require('./desktop-files.cjs');
const {createWindowState}=require('./window-state.cjs');
const commandBindings=require('./command-bindings.json');
const {runDiscoveryMenu}=require('./discovery-menu.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {createProjectStorage}=require('./project-storage.cjs');
const {createNetPrinting}=require('./net-printing.cjs');
let netPrinting;
const projectStorage=createProjectStorage({writeProject:(file,project)=>engine({op:'save',params:{path:file,project}})});
const {createTextExport}=require('./text-export.cjs');
const textExports=createTextExport({formats:['csv','json','svg','pdf','dxf'],selectPath:({format,defaultName})=>dialog.showSaveDialog(window,{defaultPath:defaultName,filters:[{name:format.toUpperCase()+' supporting data',extensions:[format]}]})});
const {createGeometryExport}=require('./geometry-export.cjs');
const {createImageExport}=require('./image-export.cjs');
const imageExports=createImageExport({selectPath:({defaultName})=>dialog.showSaveDialog(window,{defaultPath:defaultName,filters:[{name:'PNG image',extensions:['png']}]})});
const geometryExports=createGeometryExport({selectPath:({format,defaultName})=>dialog.showSaveDialog(window,{defaultPath:defaultName,filters:[{name:format.toUpperCase()+' geometry',extensions:[format==='vrml'?'wrl':format]}]})});
const { createAnimationExportManager, validateExportOptions } = require('./animation-export.cjs');
const animationExports=createAnimationExportManager();
const jobs = new Map();
const queue = [];
const libraryLoads=new Map();
const {createWorkspaceReads}=require('./workspace-reads.cjs');
const workspaceReads=createWorkspaceReads({
  chooseFile:()=>dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Polytope projects and geometry',extensions:['polyproj','off','dxf','json']}]}),
  read:(file,id)=>engine({op:'load',params:{path:file}},id),recoveryPath:()=>recoveryPath(),recoveryBackupPath:()=>recoveryPath()+'.bak',
  isInUse:id=>jobs.has(id)||libraryLoads.has(id)||queue.some(job=>job.jobId===id)
});
const root = path.join(__dirname, '..');
let window, dirty = false, closeAllowed = false;
const allowed = new Set(['prepare-dual-morph','evaluate-dual-morph','catalog','regular4d-validate','generate','hull','rational-hull','rational-dual','analyze','validate','validate-project','entity-orientation','compound-add','compound-component','compound-drop','cell-facing','recipe-run','recipe-replay','recipe-branch','prepare-export','export-options','validate-tour','face-coincidences','remove-coincident-pairs','blend-faces','subdivide-edges','polygon-prism','polyhedron-prism','attach-at-faces','place-at-faces','source-zonohedron','spring-relaxation','spring-relaxation-preview','convex-core-4d','triangular-geodesic','convex-core','convex-layer-join','fit-strict-layer-join','analyze-strict-segmentotope','scale-reference','dual','incidence-dual','truncate','section','vertex-figure','extrude','transform','symmetry','measure','entity-measure','entity-info','dihedral','align-section','expression','expression-batch','orientation','net','net-edit','net-fold','net-pack','cell-net','cell-net-edit','cell','facet','facet-candidates','facet-search','facet-adopt','arrangement','arrangement-diagram','stellation-union','stellation-enumerate']);
allowed.add('add-dual');
allowed.add('coxeter-build');
allowed.add('prepare-view-export');
allowed.add('uniform-compound');
allowed.add('visible-surface');
for(const op of ['blend-regions','merge-compound','pseudo-uniform'])allowed.add(op);
allowed.add('verify-dual-tour');
allowed.add('facet-diagram');
allowed.add('facet-diagram-adopt');
allowed.add('element-content-describe');
allowed.add('stellation-cell-graph');
allowed.add('stellation-diagram-data');
allowed.add('stellation-supported-enumerate');
allowed.add('stellation-miller-enumerate');
allowed.add('stellation-make-base');
allowed.add('sphere-project');
for(const op of ['subdivide-faces','conway','axis-zonohedron','add-zones','symmetry-axes'])allowed.add(op);
allowed.add('reflect-source');
for(const op of ['coincidic-compare','coincidic-record','coincidic-compound'])allowed.add(op);
for(const op of ['generalized-density-info','generalized-density-restore'])allowed.add(op);
allowed.add('projective-incidence-dual');
allowed.add('element-label-presets');
allowed.add('element-types');
allowed.add('information-panel');
allowed.add('polychoron-relationships');
allowed.add('symmetry-orientation');
allowed.add('prepare-printable-export');
allowed.add('expand-runcinate');
allowed.add('live-construction-preview');
allowed.add('geometry-fit');
allowed.add('geometry-fit-preview');
allowed.add('geometry-fit-deviation');
allowed.add('exact-surface-section');
allowed.add('exact-surface-section-preview');
allowed.add('incidence-truncate');
allowed.add('incidence-truncate-preview');
for(const op of ['net-reinforcement','net-measurements','net-reinforcement-pages'])allowed.add(op);
for(const op of ['coincident-edge-qualify','coincident-edge-net','coincident-edge-edit','coincident-edge-pages','coincident-edge-fold','coincident-edge-restore'])allowed.add(op);
for(const op of ['vertex-figure-candidates','construct-from-vertex-figure'])allowed.add(op);
allowed.add('face-surgery');
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
if(!app.requestSingleInstanceLock()){app.quit();return;}
const openRequests=createOpenRequests();
const recentFiles=createRecentFiles({file:path.join(app.getPath('userData'),'recent-files.json'),io:fs});
const recentTokens=new Map();let recentMenuEntries=[],recentNotice='';
const windowState=createWindowState({file:path.join(app.getPath('userData'),'window-state.json')});
function enqueueOpen(file){openRequests.enqueue(file);window?.webContents.send('open-available');}
function launchFiles(argv,cwd){
  if(hiddenQualification)return;
  for(const file of parseFileArguments(argv,{packaged:app.isPackaged,cwd}))try{enqueueOpen(file);}catch(error){process.stderr.write(error.message+'\n');}
}
launchFiles(process.argv,process.cwd());
app.on('second-instance',(_event,argv,cwd)=>{if(hiddenQualification)return;launchFiles(argv,cwd);focusExistingWindow(window,false);});
app.on('open-file',(event,file)=>{event.preventDefault();if(hiddenQualification)return;launchFiles(app.isPackaged?['app',file]:['app',root,file],process.cwd());focusExistingWindow(window,false);});
async function refreshRecentFiles(){
  const result=await recentFiles.list();if(result.message)recentNotice=result.message;
  const previous=new Map([...recentTokens].map(([id,file])=>[file,id]));recentTokens.clear();recentMenuEntries=result.files.map(file=>{const id=previous.get(file)||crypto.randomUUID();recentTokens.set(id,file);return {id,label:path.basename(file),path:file};});
  const item=Menu.getApplicationMenu()?.getMenuItemById('workspace-recent');
  if(item){item.submenu.clear();for(const entry of recentMenuEntries.length?recentMenuEntries.map(entry=>({label:entry.path.replace(/&/g,'&&'),click:()=>enqueueOpen(entry.path)})):[{label:'No recent files',enabled:false}])item.submenu.append(new MenuItem(entry));Menu.setApplicationMenu(Menu.getApplicationMenu());}
  return recentMenuEntries;
}
async function rememberFile(result){
  if(result?.path&&!hiddenQualification)try{await recentFiles.add(result.path);await refreshRecentFiles();window?.webContents.send('recent-files-changed');}catch(error){process.stderr.write('Recent files: '+error.message+'\n');}
  return result;
}
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
const enginePool=new EnginePool({jobs,spawnWorker:()=>{
  startupProfile.mark('engine-spawned');
  const executable=app.isPackaged?path.join(process.resourcesPath,'engine','polytope-engine.exe'):(process.env.POLYTOPE_PYTHON||'python');
  const args=app.isPackaged?[]:['-u',path.join(root,'engine','server.py')];
  return watchEngineReady(spawn(executable,args,{cwd:app.isPackaged?process.resourcesPath:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,POLYTOPE_CATALOG_CACHE:path.join(app.getPath('userData'),'catalog-index-v1.json'),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}}),startupProfile);
}});
function execute(request,jobId){
  return enginePool.run(request,jobId).finally(drainQueue);
}

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted IPC sender.');
}
function handle(channel,fn) { ipcMain.handle(channel,async(event,...args)=>{trusted(event);return fn(...args);}); }
function action(name) { window?.webContents.send('menu-action',name); }

app.whenReady().then(async() => {
  startupProfile.mark('electron-ready');
  handle('engine',(request,id)=>{
    if (!request || !allowed.has(request.op)) throw new Error('Operation is unavailable through the geometry API.');
    if(libraryLoads.has(id)||workspaceReads.has(id))throw Error('Duplicate job ID.');
    return engine(request,id);
  });
  handle('cancel',id=>{const library=libraryLoads.get(id);if(library)library.cancelled=true;const file=workspaceReads.cancel(id);if(enginePool.cancel(id))return true;const i=queue.findIndex(j=>j.jobId===id);if(i>=0){queue.splice(i,1)[0].reject(new Error('Queued job cancelled.'));return true;}return Boolean(library)||file;});
  handle('open',async id=>rememberFile(await workspaceReads.open(id)));
  handle('recent-files',async()=>{
    if(hiddenQualification)return {files:[],message:''};
    const files=await refreshRecentFiles(),message=recentNotice;recentNotice='';return {files,message};
  });
  handle('request-recent',id=>{if(hiddenQualification)throw qualificationError('Recent files');const file=recentTokens.get(id);if(!file)throw Error('The recent list changed. Choose the file again.');enqueueOpen(file);});
  handle('take-open-request',()=>hiddenQualification?null:openRequests.take());
  handle('discard-open-request',token=>openRequests.discard(token));
  handle('open-requested',async(token,id)=>{
    if(hiddenQualification)throw qualificationError('External file opening');
    const file=openRequests.consume(token);
    try{return await rememberFile(await workspaceReads.openPath(file,id));}
    catch(error){if(/No such file|cannot find|WinError 2|Errno 2|ENOENT|ENOTDIR/.test(error.message)){await refreshRecentFiles();window?.webContents.send('recent-files-changed');throw Error('The file is missing and was removed from Open Recent: '+file);}throw error;}
  });
  handle('confirm-project-open',async()=>!dirty||(await dialog.showMessageBox(window,{type:'question',buttons:['Keep working','Open without saving'],defaultId:0,cancelId:0,message:'Open project with unsaved changes?',detail:'Opening a project replaces the workspace. Save first to keep your latest changes.'})).response===1);
  handle('import-tour',async()=>{const {canceled,filePaths}=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Saved tour',extensions:['polytour','json']}]});return canceled?null:engine({op:'load-tour',params:{path:filePaths[0]}});});
  handle('export-tour',async tour=>{const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Models.polytour',filters:[{name:'Saved tour',extensions:['polytour']}]});return canceled?null:engine({op:'save-tour',params:{path:filePath,tour}});});
  handle('save',async(project)=>{
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Untitled.polyproj',filters:[{name:'Polytope project',extensions:['polyproj']}]});
    if(canceled) return null;
    return rememberFile(await projectStorage.publish(filePath,project));
  });
  handle('autosave',project=>projectStorage.publish(recoveryPath(),project));
  handle('recover',id=>workspaceReads.recover(id));
  handle('recovery-info',async()=>{for(const file of [recoveryPath(),recoveryPath()+'.bak'])try {const s=await fs.stat(file);return {modified:s.mtime.toISOString()};} catch {}return null;});
  handle('startup-info',()=>({hidden:hiddenQualification,fullscreen:window?.isFullScreen()??false}));
  handle('dirty',value=>{dirty=Boolean(value);});
  handle('workspace-availability',value=>applyWorkspaceMenu(Menu.getApplicationMenu(),value));
  handle('export',async(model,format)=>{
    if(!formats[format] || format==='svg') throw new Error('Unsupported model format.');
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:(model.name.replace(/[^a-zA-Z0-9 _-]/g,'')||'Model')+'.'+formats[format],filters:[{name:format.toUpperCase(),extensions:[formats[format]]}]});
    if(canceled) return null;
    return engine({op:'export',model,params:{format,path:filePath}});
  });
  handle('save-image',data=>imageExports.save(data));
  handle('image-export-begin',(id,params)=>imageExports.begin(id,params));
  handle('image-export-write',(id,data)=>imageExports.write(id,data));
  handle('image-export-abort',id=>imageExports.abort(id));
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
  handle('library-model',async(p,id=crypto.randomUUID())=>{
    if(typeof p!=='string')throw new Error('Choose a linked OFF file.');
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Use a bounded library load ID.');
    if(libraryLoads.has(id)||workspaceReads.has(id)||jobs.has(id)||queue.some(job=>job.jobId===id))throw Error('Duplicate job ID.');
    if(libraryLoads.size>=40)throw Error('Finish or cancel pending linked model loads before opening more.');
    const entry=libraryPaths.get(path.resolve(p));
    if(!entry) throw new Error('This geometry is not in a supported linked catalog.');
    const pending={cancelled:false};libraryLoads.set(id,pending);
    try{
    const [directory,relativePath]=[...entry.roots][0];
    if(await fs.realpath(p)!==entry.realPath)throw new Error('Linked file location changed. Relink its catalog folder before loading it.');
    if(pending.cancelled)throw Error('Linked model loading cancelled.');
    const result=await engine({op:'load',params:{path:p}},id);
    if(pending.cancelled)throw Error('Linked model loading cancelled.');
    result.model.metadata.linkedLibraryRoot=directory;
    result.model.metadata.linkedRelativePath=relativePath;
    return result;
    }finally{libraryLoads.delete(id);}
  });
  async function printDocument(svg,onWindow=()=>{}) {
    if(typeof svg!=='string'||!svg.startsWith('<svg')||svg.length>16*1024*1024)throw new Error('Choose a 3D face net before printing.');
    const width=Number(svg.match(/width="([\d.e+-]+)mm"/)?.[1]),height=Number(svg.match(/height="([\d.e+-]+)mm"/)?.[1]);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||Math.max(width,height)>2000)throw new Error('Net page dimensions must be positive and no larger than 2,000 mm.');
    const printWindow=createAppWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,javascript:false}});
    const html=`<!doctype html><html><head><title>Polytope Laboratory - Net</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page {size:${width+20}mm ${height+20}mm;margin:10mm}body{margin:0}svg{display:block;width:${width}mm;height:${height}mm}</style></head><body>${svg}</body></html>`;
    try{onWindow(printWindow);await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));}
    catch(error){if(!printWindow.isDestroyed())printWindow.destroy();throw error;}
    return {printWindow,width,height};
  }
  handle('print',async svg=>{const {id}=await netPrinting.begin(crypto.randomUUID(),{packed:false,content:svg});return netPrinting.commit(id);});
  handle('save-net-pdf',async svg=>{
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:'Net.pdf',filters:[{name:'PDF net',extensions:['pdf']}]});if(canceled)return null;
    const {printWindow}=await printDocument(svg);
    try{const data=await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,scale:1});await fs.writeFile(filePath,data);return {path:filePath};}
    finally{printWindow.destroy();}
  });
  async function packedPrintDocument(pages,onWindow=()=>{}){
    if(!Array.isArray(pages)||!pages.length||pages.length>250||pages.some(svg=>typeof svg!=='string'||!svg.startsWith('<svg'))||pages.reduce((sum,svg)=>sum+svg.length,0)>32*1024*1024)throw new Error('Choose a valid packed net preview with up to 250 pages.');
    const dimensions=pages.map(svg=>['width','height'].map(key=>Number(svg.match(new RegExp(key+'="([\\d.e+-]+)mm"'))?.[1])));
    const [width,height]=dimensions[0];
    if(dimensions.some(d=>d.some(x=>!Number.isFinite(x)||x<20||x>2000)||d[0]!==width||d[1]!==height))throw new Error('Packed pages must have equal finite paper dimensions in 20–2,000 mm.');
    const printWindow=createAppWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,javascript:false}});
    const html=`<!doctype html><html><head><title>Polytope Laboratory - Net</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>@page{size:${width}mm ${height}mm;margin:0}body{margin:0}.page{position:relative;width:${width}mm;height:calc(${height}mm - 1px);break-after:page;overflow:hidden}.page:last-child{break-after:auto}svg{position:absolute;top:0;left:0;display:block;width:${width}mm;height:${height}mm}</style></head><body>${pages.map(svg=>'<section class="page">'+svg+'</section>').join('')}</body></html>`;
    try{onWindow(printWindow);await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return printWindow;}catch(e){if(!printWindow.isDestroyed())printWindow.destroy();throw e;}
  }
  netPrinting=createNetPrinting({prepare:async({packed,content},track)=>packed?await packedPrintDocument(content,track):(await printDocument(content,track)).printWindow,
    print:printWindow=>new Promise((resolve,reject)=>printWindow.webContents.print({printBackground:true,scaleFactor:100},(ok,reason)=>ok?resolve(true):/cancel/i.test(reason??'')?resolve(false):reject(Error(reason||'Net printing failed.'))))});
  handle('net-print-begin',(id,params)=>netPrinting.begin(id,params));
  handle('net-print-commit',id=>netPrinting.commit(id));
  handle('net-print-abort',id=>netPrinting.cancel(id));
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
  handle('geometry-export-begin',params=>geometryExports.begin(params));
  handle('geometry-export-write',(id,data)=>geometryExports.write(id,data));
  handle('geometry-export-abort',id=>geometryExports.abort(id));
  handle('print-packed-nets',async pages=>{const {id}=await netPrinting.begin(crypto.randomUUID(),{packed:true,content:pages});return netPrinting.commit(id);});
  handle('fullscreen',()=>{window.setFullScreen(!window.isFullScreen());return window.isFullScreen();});
  handle('presentation-window',createPresentationWindow({getWindow:()=>window,hidden:()=>hiddenQualification}));
  handle('discovery-menu',name=>runDiscoveryMenu(name,{window,app,dialog}));
  handle('animation-begin',async options=>{
    const spec=validateExportOptions(options);
    const extension=spec.format==='png'?'frames':spec.format;
    const {canceled,filePath}=await dialog.showSaveDialog(window,{defaultPath:spec.name+'.'+extension,filters:[{name:spec.format==='png'?'New PNG sequence folder':spec.format.toUpperCase()+' animation',extensions:[extension]}]});
    return canceled?null:animationExports.begin(options,filePath);
  });
  handle('animation-write',(id,index,data)=>animationExports.write(id,index,data));
  handle('animation-finish',id=>animationExports.finish(id));
  handle('animation-abort',id=>animationExports.abort(id));
  const menu = [
    {label:'File',submenu:[{label:'New document',accelerator:commandBindings.new.keys[0],click:()=>action('new')},{label:'Open…',accelerator:commandBindings.open.keys[0],click:()=>action('open')},{id:'workspace-save',enabled:false,label:'Save project…',accelerator:commandBindings.save.keys[0],click:()=>action('save')},{label:'Recover autosave',click:()=>action('recover')},{type:'separator'},{id:'workspace-export',enabled:false,label:'Export model…',click:()=>action('export')},{id:'workspace-image',enabled:false,label:'Save image…',click:()=>action('image')},{id:'workspace-print',enabled:false,label:'Print…',accelerator:commandBindings.print.keys[0],click:()=>action('print')},{type:'separator'},{role:'quit'}]},
    {label:'Edit',submenu:[{id:'workspace-undo',enabled:false,label:'Undo geometry',accelerator:commandBindings.undo.keys[0],click:()=>action('undo')},{id:'workspace-redo',enabled:false,label:'Redo geometry',accelerator:commandBindings.redo.keys[0],click:()=>action('redo')},{type:'separator'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'View',submenu:[{id:'workspace-reset',enabled:false,label:'Reset camera',accelerator:commandBindings.reset.keys[0],click:()=>action('reset')},{label:'Fullscreen',accelerator:commandBindings.fullscreen.keys[0],click:()=>action('fullscreen')},{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'}]},
    {label:'Help',submenu:[{label:'Welcome',click:()=>action('welcome')},{label:'What?s new',click:()=>action('whatsnew')},{label:'Search commands',accelerator:commandBindings.commands.keys[0],click:()=>action('commands')},{label:'Keyboard shortcuts',click:()=>action('shortcuts')},{label:'User guide',accelerator:commandBindings.help.keys[0],click:()=>action('help')},{label:'About',click:()=>dialog.showMessageBox(window,{title:'Polytope Laboratory',message:'Polytope Laboratory '+app.getVersion(),detail:'Offline 3D/4D mathematical workspace. Convex operations use float64 predicates. Early community preview. Current focus: usability, performance and reliability.'})}]}
  ];
  menu.find(group=>group.label==='View').submenu.splice(2,0,{label:'Presentation',accelerator:commandBindings.presentation.keys[0],click:()=>action('presentation')});
  menu.find(group=>group.label==='Help').submenu.splice(1,0,{label:'Learn 4D',click:()=>action('learn4d')});
  menu[0].submenu.splice(2,0,{id:'workspace-recent',label:'Open Recent',submenu:[{label:'No recent files',enabled:false}]});
  for(const group of menu)for(const item of group.submenu)if(item.role&&commandBindings[item.role]?.keys.length)item.accelerator=commandBindings[item.role].keys[0];
  Menu.setApplicationMenu(hiddenQualification?null:Menu.buildFromTemplate(menu));
  const restored=hiddenQualification?{}:windowState.load([screen.getPrimaryDisplay(),...screen.getAllDisplays()]);
  const {maximized,...bounds}=restored;
  window=createAppWindow({width:1500,height:960,minWidth:1050,minHeight:720,...bounds,icon:path.join(__dirname,'assets','polytope.ico'),backgroundColor:'#101722',title:'Polytope Laboratory',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  startupProfile.mark('window-created');
  if(!hiddenQualification){windowState.track(window);await refreshRecentFiles().catch(error=>process.stderr.write('Recent files: '+error.message+'\n'));}
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.on('closed',()=>netPrinting.dispose());
  window.on('enter-full-screen',()=>window.webContents.send('fullscreen-changed',true));
  window.on('leave-full-screen',()=>window.webContents.send('fullscreen-changed',false));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.on('close',async event=>{
    if(hiddenQualification)return;
    if(dirty && !closeAllowed){ event.preventDefault();const result=await dialog.showMessageBox(window,{type:'question',buttons:['Keep working','Close'],defaultId:0,cancelId:0,message:'Close with unsaved changes?',detail:'A recovery snapshot is saved every 30 seconds. Save your project to preserve the latest changes.'});if(result.response===1){closeAllowed=true;window.close();}}
  });
  if(!hiddenQualification)window.on('ready-to-show',()=>{if(maximized)window.maximize();window.show();});
  window.loadFile(path.join(root,'dist','index.html'));
});
app.on('window-all-closed',()=>{netPrinting?.dispose();workspaceReads.dispose();for(const job of libraryLoads.values())job.cancelled=true;textExports.dispose();geometryExports.dispose();imageExports.dispose();enginePool.dispose();animationExports.abortAll().finally(()=>app.quit());});
