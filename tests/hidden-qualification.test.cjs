const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));

test('the real preload forwards file request identities without exposing renderer-supplied paths',async()=>{
  const calls=[];let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/preload.cjs'),'utf8'),{require:name=>{
    assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve(null);}}};
  }});
  await api.open('open-id');await api.recover('recover-id');await api.open();
  assert.deepEqual(calls,[['open','open-id'],['recover','recover-id'],['open',undefined]]);
});

// Execute the REAL main-process entry inside a CommonJS wrapper. Electron,
// filesystem writes and process creation are mocked; no GUI/engine is launched.
async function boot(env={},platform='win32',initialSwitches={},holdReplies=false,options={}){
  const windows=[],ipc=new Map(),writes=[],spawns=[],native=[],menus=[],errors=[];
  const app=new EventEmitter(),paths={userData:path.resolve(__dirname,'ordinary-profile')};let readyCalls=0;
  const switches=new Map(Object.entries(initialSwitches)),switchWrites=[],files=new Map(Object.entries(options.files||{}));
  Object.assign(app,{requestSingleInstanceLock:()=>options.lock!==false,commandLine:{hasSwitch:k=>switches.has(k),getSwitchValue:k=>switches.get(k)||'',appendSwitch:(k,value='')=>{switchWrites.push({key:k,value,readyCalls});switches.set(k,value);}},isPackaged:options.packaged??false,getPath:k=>paths[k],setPath:(k,p)=>paths[k]=p,getVersion:()=>'.14-fixture',whenReady:()=>{readyCalls++;return Promise.resolve();},quit:()=>native.push('quit'),exit:code=>native.push(['exit',code]),focus:()=>native.push('app.focus')});
  const dialog={};for(const name of ['showOpenDialog','showSaveDialog','showMessageBox'])dialog[name]=async()=>{native.push(name);return {canceled:true,filePaths:[],response:0};};for(const name of ['showOpenDialogSync','showSaveDialogSync','showMessageBoxSync','showErrorBox'])dialog[name]=()=>{native.push(name);return undefined;};
  class BrowserWindow extends EventEmitter{
    constructor(options){super();this.options=options;this.destroyed=false;this.visible=options.show!==false;this.fullscreen=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};Object.assign(this.webContents,{setWindowOpenHandler:fn=>{this.popupHandler=fn;},setAudioMuted:value=>{this.muted=value;},send:(...args)=>{this.sent=args;},focus:()=>native.push('webContents.focus'),openDevTools:()=>native.push('webContents.openDevTools'),inspectElement:()=>native.push('webContents.inspectElement'),print:(_opts,callback)=>{native.push('native-print');callback(true);},printToPDF:async()=>{native.push('pdf');return Buffer.from('%PDF-fixture');}});windows.push(this);app.emit('browser-window-created',{},this);}
    show(){native.push('show');this.visible=true;this.focus();}showInactive(){native.push('showInactive');this.visible=true;}focus(){native.push('focus');}restore(){native.push('restore');}maximize(){native.push('maximize');}minimize(){native.push('minimize');}moveTop(){native.push('moveTop');}setFullScreen(v){native.push('fullscreen');this.fullscreen=v;}setKiosk(){native.push('kiosk');}setAlwaysOnTop(){native.push('alwaysOnTop');}setFocusable(){native.push('focusable');}setSkipTaskbar(){native.push('skipTaskbar');}flashFrame(){native.push('flashFrame');}isMinimized(){return options.minimized===true;}isMaximized(){return options.maximized===true;}getNormalBounds(){return {x:20,y:30,width:1200,height:800};}isFullScreen(){return this.fullscreen;}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}close(){native.push('close');}hide(){this.visible=false;}loadFile(file){this.loaded=file;return Promise.resolve();}loadURL(url){this.loaded=url;return Promise.resolve();}
  }
  function buildMenu(template){
    const items=template.map(entry=>{const item={...entry};if(entry.submenu)Object.defineProperty(item,'submenu',{value:buildMenu(entry.submenu),writable:false,enumerable:true});return item;});
    Object.defineProperties(items,{getMenuItemById:{value:id=>items.find(item=>item.id===id)||items.map(item=>item.submenu?.getMenuItemById(id)).find(Boolean)},clear:{value:()=>items.splice(0)},append:{value:item=>items.push(item)}});return items;
  }
  const electron={app,BrowserWindow,dialog,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]},MenuItem:function(options){Object.assign(this,options);},ipcMain:{handle:(name,fn)=>ipc.set(name,fn)},Menu:{buildFromTemplate:template=>{native.push('build-menu');return buildMenu(template);},getApplicationMenu:()=>menus.at(-1)??null,setApplicationMenu:menu=>menus.push(menu)}};
  const storage={publish:async(file,project)=>{writes.push(['project',file,project]);return {path:file};}};
  const animationExports={begin:async(_options,file)=>({id:'session',path:file}),write:async()=>true,finish:async()=>true,abort:async()=>true,abortAll:async()=>true};
  const mockFs={writeFile:async(...args)=>writes.push(args),mkdir:async()=>{},lstat:async file=>{if((options.existingFiles||[]).includes(file))return {isFile:()=>true};throw Object.assign(Error('missing'),{code:'ENOENT'});},stat:async file=>{if((options.existingFiles||[]).includes(file))return {isFile:()=>true};throw Object.assign(Error('missing'),{code:'ENOENT'});},readFile:async file=>{if(files.has(file))return files.get(file);throw Object.assign(Error('missing'),{code:'ENOENT'});},unlink:async()=>{},rename:async()=>{},realpath:async p=>p};
  function spawn(executable,args,options){spawns.push({executable,args,options});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdout.setEncoding=()=>{};child.stderr.setEncoding=()=>{};child.kill=()=>{child.killed=true;};child.stdin=new EventEmitter();child.stdin.write=data=>{const request=JSON.parse(data);child.request=request;if(!holdReplies)queueMicrotask(()=>child.stdout.emit('data',JSON.stringify({id:request.id,ok:true,result:request.op==='catalog'?[]:{model:{metadata:{}},path:request.params?.path}})+'\n'));};child.stdin.end=child.stdin.write;spawns.at(-1).child=child;return child;}
  const syncFs={readFileSync:file=>{if(files.has(file))return files.get(file);throw Error('missing');},mkdirSync(){},writeFileSync:(...args)=>writes.push(args),renameSync(){}};
  const requireMock=name=>name==='./startup-profile.cjs'?require('../desktop/startup-profile.cjs'):name==='./presentation-window.cjs'?require('../desktop/presentation-window.cjs'):name==='./desktop-files.cjs'?require('../desktop/desktop-files.cjs'):name==='./window-state.cjs'?{createWindowState:config=>require('../desktop/window-state.cjs').createWindowState({...config,io:syncFs})}:name==='./command-bindings.json'?require('../desktop/command-bindings.json'):name==='./discovery-menu.cjs'?require('../desktop/discovery-menu.cjs'):name==='./net-printing.cjs'?require('../desktop/net-printing.cjs'):name==='./image-export.cjs'?{createImageExport:options=>require('../desktop/image-export.cjs').createImageExport({...options,io:mockFs})}:name==='./workspace-reads.cjs'?require('../desktop/workspace-reads.cjs'):name==='./workspace-menu.cjs'?require('../desktop/workspace-menu.cjs'):name==='./engine-pool.cjs'?require('../desktop/engine-pool.cjs'):name==='./geometry-export.cjs'?{createGeometryExport:options=>require('../desktop/geometry-export.cjs').createGeometryExport({...options,io:mockFs})}:name==='electron'?electron:name==='node:child_process'?{spawn}:name==='node:fs/promises'?mockFs:name==='node:path'?path:name==='node:crypto'?crypto:name==='./text-export.cjs'?{createTextExport:options=>require('../desktop/text-export.cjs').createTextExport({...options,io:mockFs})}:name==='./project-storage.cjs'?{createProjectStorage:()=>storage}:name==='./animation-export.cjs'?{createAnimationExportManager:()=>animationExports,validateExportOptions:o=>({name:'fixture',format:o.format})}:(()=>{throw Error('Unexpected import '+name);})();
  const context=vm.createContext({Buffer,console,setTimeout,clearTimeout,process:{env:{...env},platform,argv:options.argv||['electron','.'],cwd:()=>path.resolve(__dirname,'..'),resourcesPath:path.resolve(__dirname,'resources'),stderr:{write:s=>errors.push(s)}}});const compiled=new vm.Script('(function(require,module,exports,__dirname){\n'+source+'\n})',{filename:'desktop/main.cjs'}).runInContext(context);const module={exports:{}};compiled(requireMock,module,module.exports,path.resolve(__dirname,'../desktop'));
  await new Promise(resolve=>setImmediate(resolve));
  const invoke=(name,...args)=>{const w=windows[0];return ipc.get(name)({sender:w.webContents,senderFrame:w.webContents.mainFrame},...args);};
  return {app,dialog,windows,native,menus,errors,ipc,writes,spawns,invoke,switches,switchWrites,get readyCalls(){return readyCalls;}};
}
const hiddenEnv=()=>({POLYTOPE_TEST_MODE:'hidden-no-focus',POLYTOPE_TEST_USER_DATA:path.resolve(__dirname,'hidden-fixture-profile')});
test('startup-info reports hidden qualification explicitly so welcome cannot cover automated controls',async()=>{
  const hidden=await boot(hiddenEnv());assert.equal((await hidden.invoke('startup-info')).hidden,true);
  const ordinary=await boot({});assert.equal((await ordinary.invoke('startup-info')).hidden,false);
});
const svg='<svg width="100mm" height="120mm"></svg>';

test('hidden startup creates only a nonfocusable hidden sandbox window, with no ready-to-show activation',async()=>{
  const b=await boot(hiddenEnv()),w=b.windows[0];assert.equal(b.windows.length,1);assert.equal(w.options.show,false);assert.equal(w.options.focusable,false);assert.equal(w.options.skipTaskbar,true);assert.equal(w.options.alwaysOnTop,false);assert.equal(w.options.fullscreen,false);assert.equal(w.options.paintWhenInitiallyHidden,true);assert.equal(w.options.webPreferences.backgroundThrottling,false);assert.equal(w.options.webPreferences.disableDialogs,true);assert.equal(w.options.webPreferences.focusOnNavigation,false);assert.equal(w.options.webPreferences.disableHtmlFullscreenWindowResize,true);assert.equal(w.options.webPreferences.sandbox,true);assert.equal(w.options.webPreferences.contextIsolation,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.muted,true);assert.equal(w.listeners('ready-to-show').length,0);w.emit('ready-to-show');assert.deepEqual(b.native,[]);assert.deepEqual(b.menus,[null]);assert.equal(w.visible,false);assert.deepEqual(plain(w.popupHandler()),{action:'deny'});
});
test('window, app and webContents activation/devtools APIs cannot be enabled accidentally',async()=>{
  const b=await boot(hiddenEnv()),w=b.windows[0];for(const name of ['show','showInactive','focus','restore','maximize','minimize','moveTop','setFullScreen','setKiosk','setAlwaysOnTop','setFocusable','setSkipTaskbar','flashFrame'])assert.throws(()=>w[name](true),/hidden-no-focus/);for(const name of ['focusable','fullScreen','simpleFullScreen','kiosk'])assert.throws(()=>{w[name]=true;},/hidden-no-focus/);for(const name of ['focus','openDevTools','inspectElement'])assert.throws(()=>w.webContents[name](),/hidden-no-focus/);assert.throws(()=>b.app.focus(),/hidden-no-focus/);assert.equal(Object.getOwnPropertyDescriptor(w,'show').writable,false);assert.deepEqual(b.native,[]);await assert.rejects(b.invoke('fullscreen'),/hidden-no-focus/);
});
test('invalid opt-ins exit quietly before readiness, windows, menus or native error dialogs',async()=>{
  for(const [env,platform] of [[{POLYTOPE_TEST_MODE:'1'},'win32'],[{POLYTOPE_TEST_MODE:''},'win32'],[{POLYTOPE_TEST_MODE:'hidden-no-focus'},'win32'],[{...hiddenEnv(),POLYTOPE_TEST_USER_DATA:'relative'},'win32'],[{...hiddenEnv(),POLYTOPE_TEST_USER_DATA:path.resolve(__dirname,'ordinary-profile')},'win32'],[hiddenEnv(),'linux']]){const b=await boot(env,platform);assert.equal(b.readyCalls,0);assert.equal(b.windows.length,0);assert.deepEqual(b.menus,[]);assert.deepEqual(b.native,[['exit',2]]);assert.equal(b.errors.length,1);assert.match(b.errors[0],/POLYTOPE_TEST/);assert.throws(()=>b.dialog.showErrorBox('bad','bad'),/hidden-no-focus/);assert.deepEqual(b.native,[['exit',2]]);}
});
test('all async and sync native dialogs reject before calling originals; trusted IPC diagnoses missing stubs',async()=>{
  const b=await boot(hiddenEnv());for(const name of ['showOpenDialog','showSaveDialog','showMessageBox'])await assert.rejects(b.dialog[name](),/hidden-no-focus/);for(const name of ['showOpenDialogSync','showSaveDialogSync','showMessageBoxSync','showErrorBox'])assert.throws(()=>b.dialog[name](),/hidden-no-focus/);for(const name of ['open','save','import-tour','export-tour','library','save-net-pdf','save-packed-net-pdf','animation-begin'])await assert.rejects(b.invoke(name,name==='open'?'hidden-open':name==='animation-begin'?{format:'png'}:{}),/hidden-no-focus/);assert.deepEqual(b.native,[]);assert.equal(b.windows.length,1);assert.equal(b.writes.length,0);
});
test('existing explicit dialog stubs work without a renderer arbitrary-path bypass',async()=>{
  const b=await boot(hiddenEnv()),file=path.resolve(__dirname,'stub-destination.polyproj');b.dialog.showSaveDialog=async()=>({canceled:false,filePath:file});const saved=await b.invoke('save',{documents:[]});assert.equal(saved.path,file);assert.equal(b.writes[0][1],file);b.dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});assert.equal(await b.invoke('open'),null);assert.deepEqual(b.native,[]);await assert.rejects(b.ipc.get('save')({sender:{},senderFrame:{}},{}),/Untrusted/);assert.equal(b.writes.length,1);
});

test('actual main IPC reserves chooser IDs across channels and Cancel prevents a late file selection from spawning',async()=>{
  const b=await boot();let choose;
  b.dialog.showOpenDialog=()=>new Promise(resolve=>choose=resolve);
  const pending=b.invoke('open','pending-open');
  await assert.rejects(b.invoke('engine',{op:'expression',params:{expression:'1'}},'pending-open'),/Duplicate job ID/);
  await assert.rejects(b.invoke('library-model',path.resolve(__dirname,'unlinked.off'),'pending-open'),/Duplicate job ID/);
  assert.equal(await b.invoke('cancel','pending-open'),true);
  choose({canceled:false,filePaths:[path.resolve(__dirname,'late.off')]});await assert.rejects(pending,/canceled/);assert.equal(b.spawns.length,0);
  b.dialog.showOpenDialog=async()=>({canceled:true});assert.equal(await b.invoke('open','pending-open'),null);
});

test('actual main Cancel retires a running Open/Recover worker and ignores its late response',async t=>{
  for(const operation of ['open','recover']){
    const b=await boot({},'win32',{},true);t.after(()=>b.app.emit('window-all-closed'));
    b.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.resolve(__dirname,'source.polyproj')]});
    const pending=b.invoke(operation,'running-read');await Promise.resolve();assert.equal(b.spawns.length,1);
    const child=b.spawns[0].child;assert.equal(child.request.id,'running-read');assert.equal(child.request.op,'load');
    const rejected=assert.rejects(pending,/canceled/);assert.equal(await b.invoke('cancel','running-read'),true);await rejected;assert.equal(child.killed,true);
    child.stdout.emit('data',JSON.stringify({id:'running-read',ok:true,result:{model:{name:'Late'}}})+'\n');
    const retry=b.invoke(operation,'running-read');await Promise.resolve();assert.equal(b.spawns.length,2);
    const second=assert.rejects(retry,/canceled/);await b.invoke('cancel','running-read');await second;assert.equal(b.spawns[1].child.killed,true);
  }
});

test('geometry export tickets retain the hidden-dialog policy and trusted main-frame boundary',async()=>{
  const b=await boot(hiddenEnv()),params={format:'off',defaultName:'Model.off'};
  await assert.rejects(b.invoke('geometry-export-begin',params),/hidden-no-focus/);assert.deepEqual(b.writes,[]);
  await assert.rejects(b.ipc.get('geometry-export-begin')({sender:{},senderFrame:{}},params),/Untrusted/);
  const file=path.resolve(__dirname,'stub-destination.off');b.dialog.showSaveDialog=async()=>({canceled:false,filePath:file});
  const ticket=await b.invoke('geometry-export-begin',params);assert.equal(ticket.path,file);
  assert.equal(await b.invoke('geometry-export-abort',ticket.id),true);
  await assert.rejects(b.invoke('geometry-export-write',ticket.id,'literal'),/unavailable/);assert.deepEqual(b.writes,[]);
});
test('both PDF document paths remain hidden/nonfocusable, use a readable document title and never invoke native printing',async()=>{
  const b=await boot(hiddenEnv());b.dialog.showSaveDialog=async()=>({canceled:false,filePath:path.resolve(__dirname,'mock.pdf')});await b.invoke('save-net-pdf',svg);await b.invoke('save-packed-net-pdf',[svg,svg]);assert.equal(b.windows.length,3);for(const w of b.windows){assert.equal(w.options.show,false);assert.equal(w.options.focusable,false);assert.equal(w.options.skipTaskbar,true);assert.equal(w.options.webPreferences.disableDialogs,true);assert.equal(w.options.webPreferences.backgroundThrottling,false);}assert.equal(b.windows[1].options.webPreferences.javascript,false);assert.equal(b.windows[2].options.webPreferences.javascript,false);assert.equal(b.windows[1].destroyed,true);assert.equal(b.windows[2].destroyed,true);for(const w of b.windows.slice(1))assert.match(decodeURIComponent(w.loaded),/<title>Polytope Laboratory - Net<\/title>/);assert.deepEqual(b.native,['pdf','pdf']);assert.equal(b.writes.length,2);
});
test('both native print paths reject without opening printer UI and dispose their hidden documents',async()=>{
  const b=await boot(hiddenEnv());await assert.rejects(b.invoke('print',svg),/Native printing.*hidden-no-focus/);await assert.rejects(b.invoke('print-packed-nets',[svg]),/Native printing.*hidden-no-focus/);assert.equal(b.windows.length,3);assert.equal(b.windows[1].destroyed,true);assert.equal(b.windows[2].destroyed,true);assert.deepEqual(b.native,[]);
});
test('explicit per-window print callback stubs remain supported for headless IPC tests',async()=>{
  const b=await boot(hiddenEnv());let calls=0;b.app.on('browser-window-created',(_e,w)=>{w.webContents.print=(_options,callback)=>{calls++;callback(true);};});assert.equal(await b.invoke('print',svg),true);assert.equal(await b.invoke('print-packed-nets',[svg]),true);assert.equal(calls,2);assert.deepEqual(b.native,[]);
});
test('dirty hidden close avoids confirmation; webview attachment/unload prevention never activates windows',async()=>{
  const b=await boot(hiddenEnv()),w=b.windows[0];await b.invoke('dirty',true);let prevented=0;await Promise.all(w.listeners('close').map(fn=>fn({preventDefault:()=>prevented++})));assert.equal(prevented,0);for(const name of ['will-attach-webview','will-prevent-unload'])w.webContents.emit(name,{preventDefault:()=>prevented++});assert.equal(prevented,2);assert.deepEqual(b.native,[]);
});
test('engine process console hiding remains enabled and read-only mode evidence is main-process-only',async()=>{
  const b=await boot(hiddenEnv());assert.deepEqual(plain(await b.invoke('engine',{op:'catalog'})),[]);assert.equal(b.spawns.length,1);assert.equal(b.spawns[0].options.windowsHide,true);assert.deepEqual(plain(b.spawns[0].options.stdio),['pipe','pipe','pipe']);assert.equal(b.app.polytopeQualification.mode,'hidden-no-focus');assert.equal(b.app.polytopeQualification.engineWindowsHide,true);assert.equal(b.app.polytopeQualification.profile,hiddenEnv().POLYTOPE_TEST_USER_DATA);assert.equal(Object.isFrozen(b.app.polytopeQualification),true);assert.equal(Object.getOwnPropertyDescriptor(b.app,'polytopeQualification').writable,false);assert.equal(b.ipc.has('qualification'),false);assert.deepEqual(b.native,[]);
});
test('ordinary application behavior retains ready-to-show, native menu/dialogs, printing and dirty confirmation',async()=>{
  const b=await boot(),w=b.windows[0];assert.equal(w.options.focusable,undefined);assert.equal(w.options.skipTaskbar,undefined);assert.equal(w.options.webPreferences.disableDialogs,undefined);assert.equal(w.options.webPreferences.backgroundThrottling,undefined);assert.equal(b.app.polytopeQualification,undefined);assert.equal(b.menus[0].length,4);w.emit('ready-to-show');assert.equal(w.visible,true);assert.ok(b.native.includes('show'));assert.ok(b.native.includes('focus'));await b.invoke('open');assert.ok(b.native.includes('showOpenDialog'));assert.equal(await b.invoke('print',svg),true);assert.ok(b.native.includes('native-print'));await b.invoke('dirty',true);let prevented=0;await Promise.all(w.listeners('close').map(fn=>fn({preventDefault:()=>prevented++})));assert.equal(prevented,1);assert.ok(b.native.includes('showMessageBox'));
});
test('all application BrowserWindow construction flows through the guarded constructor',()=>{assert.equal((source.match(/new BrowserWindow\(/g)||[]).length,1);assert.equal((source.match(/createAppWindow\(\{/g)||[]).length,3);assert.equal(/shell\.|new Notification|app\.on\(['"]activate/.test(source),false);});
test('hidden occlusion scheduling flags are applied before readiness without unrelated priority or security changes',async()=>{
  const b=await boot(hiddenEnv());assert.deepEqual(b.switchWrites,[{key:'disable-backgrounding-occluded-windows',value:'',readyCalls:0},{key:'disable-features',value:'CalculateNativeWinOcclusion',readyCalls:0}]);assert.deepEqual(plain(b.app.polytopeQualification.scheduling),{occludedWindowBackgrounding:false,nativeWinOcclusion:false,disableFeatures:'CalculateNativeWinOcclusion'});assert.equal(Object.isFrozen(b.app.polytopeQualification.scheduling),true);
});
test('hidden mode preserves supplied switch values and disabled features without duplicate occlusion entries',async()=>{
  const supplied={'disable-features':'FeatureA:mode/test,FeatureB','example-switch':'keep'},b=await boot(hiddenEnv(),'win32',supplied);assert.equal(b.switches.get('disable-features'),'FeatureA:mode/test,FeatureB,CalculateNativeWinOcclusion');assert.equal(b.switches.get('example-switch'),'keep');
  const existing={'disable-features':'FeatureA, CalculateNativeWinOcclusion ,FeatureB','disable-backgrounding-occluded-windows':'caller-value'},c=await boot(hiddenEnv(),'win32',existing);assert.deepEqual(c.switchWrites,[]);assert.equal(c.switches.get('disable-features'),existing['disable-features']);assert.equal(c.switches.get('disable-backgrounding-occluded-windows'),'caller-value');
});
test('ordinary profile isolation and invalid modes never amend command line scheduling',async()=>{
  const supplied={'disable-features':'ExistingFeature','example-switch':'keep'};for(const env of [{},{POLYTOPE_TEST_USER_DATA:hiddenEnv().POLYTOPE_TEST_USER_DATA},{POLYTOPE_TEST_MODE:'bad'}]){const b=await boot(env,'win32',supplied);assert.deepEqual(b.switchWrites,[]);assert.deepEqual(Object.fromEntries(b.switches),supplied);}
});
test('workspace availability IPC updates real menu items without activating windows and remains bounded in hidden mode',async()=>{
  const b=await boot(),menu=b.menus[0];assert.equal(menu.getMenuItemById('workspace-save').enabled,false);
  await b.invoke('workspace-availability',{hasModel:true,canUndo:true,canRedo:false});assert.equal(menu.getMenuItemById('workspace-save').enabled,true);assert.equal(menu.getMenuItemById('workspace-undo').enabled,true);assert.equal(menu.getMenuItemById('workspace-redo').enabled,false);
  const before=b.native.length;await assert.rejects(b.invoke('workspace-availability',{hasModel:'yes',canUndo:false,canRedo:false}),/boolean workspace availability/);assert.equal(b.native.length,before);
  await b.invoke('workspace-availability',{hasModel:false,canUndo:true,canRedo:true});assert.equal(menu.getMenuItemById('workspace-undo').enabled,false);
  const hidden=await boot(hiddenEnv());await hidden.invoke('workspace-availability',{hasModel:true,canUndo:false,canRedo:false});assert.deepEqual(hidden.menus,[null]);assert.deepEqual(hidden.native,[]);
});

test('a second process exits before readiness when the single-instance lock is owned',async()=>{
  const b=await boot({},'win32',{},false,{lock:false});assert.equal(b.readyCalls,0);assert.equal(b.windows.length,0);assert.deepEqual(b.native,['quit']);assert.equal(b.ipc.size,0);
});
test('first-launch argv reaches the validated cancellable reader without a chooser or renderer path authority',async t=>{
  const file=path.resolve(__dirname,'launch source.off');const b=await boot({},'win32',{},false,{argv:['electron','.',file],existingFiles:[file]});t.after(()=>b.app.emit('window-all-closed'));
  assert.equal(b.spawns.length,0);const token=await b.invoke('take-open-request');assert.equal(typeof token,'string');assert.equal(await b.invoke('take-open-request'),null);
  await assert.rejects(b.invoke('open-requested',file,'unauthorized'),/expired/);assert.equal(b.spawns.length,0);
  const loaded=await b.invoke('open-requested',token,'launch-read');assert.equal(loaded.path,file);assert.equal(b.spawns[0].child.request.op,'load');assert.equal(b.spawns[0].child.request.params.path,file);assert.equal(b.spawns[0].child.request.id,'launch-read');
  assert.ok(!b.native.includes('showOpenDialog'));await assert.rejects(b.invoke('open-requested',token,'again'),/expired/);
  const recents=await b.invoke('recent-files');assert.equal(recents.files[0].path,file);assert.equal(recents.files[0].label,path.basename(file));
  await assert.rejects(b.ipc.get('open-requested')({sender:{},senderFrame:{}},token,'bad-frame'),/Untrusted/);
});
test('second-instance opens restore and focus only the existing ordinary window, and enqueue its cwd-relative file',async()=>{
  const b=await boot({},'win32',{},false,{minimized:true});const before=b.native.length;
  b.app.emit('second-instance',{},['electron','.','shape.polyproj'],path.resolve(__dirname));
  assert.deepEqual(b.native.slice(before),['restore','show','focus','focus']);assert.equal(b.windows.length,1);assert.deepEqual(plain(b.windows[0].sent),['open-available']);
  assert.equal(typeof await b.invoke('take-open-request'),'string');
});
test('hidden mode ignores launch/second-instance/open-file paths and saved maximization without activation or writes',async()=>{
  const file=path.resolve(__dirname,'silent.polyproj'),profile=hiddenEnv().POLYTOPE_TEST_USER_DATA;
  const b=await boot(hiddenEnv(),'win32',{},false,{argv:['electron','.',file],files:{[path.join(profile,'window-state.json')]:JSON.stringify({bounds:{x:0,y:0,width:1200,height:800},maximized:true}),[path.join(profile,'recent-files.json')]:JSON.stringify([file])},existingFiles:[file]});
  b.app.emit('second-instance',{},['electron','.',file],path.dirname(file));let prevented=false;b.app.emit('open-file',{preventDefault:()=>prevented=true},file);assert.equal(prevented,true);
  assert.equal(await b.invoke('take-open-request'),null);assert.deepEqual(plain(await b.invoke('recent-files')),{files:[],message:''});
  await assert.rejects(b.invoke('request-recent','anything'),/hidden-no-focus/);await assert.rejects(b.invoke('open-requested','anything','hidden-file'),/hidden-no-focus/);
  b.windows[0].emit('resize');b.windows[0].emit('move');assert.equal(b.windows[0].listeners('resize').length,0);assert.deepEqual(b.native,[]);assert.deepEqual(b.writes,[]);assert.equal(b.spawns.length,0);
});
test('recent-file menu and Welcome tokens use the same reader and retain workspace menu availability',async t=>{
  const file=path.resolve(__dirname,'recent & model.off'),profile=path.resolve(__dirname,'ordinary-profile');
  const b=await boot({},'win32',{},false,{files:{[path.join(profile,'recent-files.json')]:JSON.stringify([file])},existingFiles:[file]});t.after(()=>b.app.emit('window-all-closed'));
  await b.invoke('workspace-availability',{hasModel:true,canUndo:true,canRedo:false});const menu=b.menus.at(-1),recent=menu.getMenuItemById('workspace-recent');
  assert.equal(Object.getOwnPropertyDescriptor(recent,'submenu').writable,false);assert.equal(recent.submenu[0].label,file.replace(/&/g,'&&'));recent.submenu[0].click();
  const first=await b.invoke('take-open-request');await b.invoke('open-requested',first,'recent-menu-read');assert.equal(b.spawns[0].child.request.params.path,file);
  const list=await b.invoke('recent-files'),again=await b.invoke('recent-files');assert.equal(list.files[0].id,again.files[0].id);
  await b.invoke('request-recent',list.files[0].id);const second=await b.invoke('take-open-request');assert.notEqual(second,first);await b.invoke('discard-open-request',second);await assert.rejects(b.invoke('open-requested',second,'discarded'),/expired/);
  assert.equal(b.menus.at(-1).getMenuItemById('workspace-undo').enabled,true);assert.ok(!b.native.includes('showOpenDialog'));
});
test('missing recent files are pruned at startup and reported to Welcome',async()=>{
  const file=path.resolve(__dirname,'missing.off'),profile=path.resolve(__dirname,'ordinary-profile');
  const b=await boot({},'win32',{},false,{files:{[path.join(profile,'recent-files.json')]:JSON.stringify([file])}});
  const result=await b.invoke('recent-files');assert.deepEqual(plain(result.files),[]);assert.match(result.message,/Removed 1 missing file/);assert.equal((await b.invoke('recent-files')).message,'');
  assert.equal(b.menus.at(-1).getMenuItemById('workspace-recent').submenu[0].label,'No recent files');assert.ok(b.writes.some(([file])=>file.endsWith('recent-files.json.tmp')));
});
test('project replacement confirmation respects dirty state and the hidden-dialog guard',async()=>{
  const b=await boot();assert.equal(await b.invoke('confirm-project-open'),true);assert.ok(!b.native.includes('showMessageBox'));await b.invoke('dirty',true);
  assert.equal(await b.invoke('confirm-project-open'),false);b.dialog.showMessageBox=async()=>({response:1});assert.equal(await b.invoke('confirm-project-open'),true);
  const hidden=await boot(hiddenEnv());await hidden.invoke('dirty',true);await assert.rejects(hidden.invoke('confirm-project-open'),/hidden-no-focus/);assert.deepEqual(hidden.native,[]);
});
test('ordinary saved window bounds restore before show, maximize only on readiness, and persist normal bounds',async()=>{
  const profile=path.resolve(__dirname,'ordinary-profile'),file=path.join(profile,'window-state.json');
  const b=await boot({},'win32',{},false,{files:{[file]:JSON.stringify({bounds:{x:9000,y:9000,width:1300,height:800},maximized:true})},maximized:true});const w=b.windows[0];
  assert.equal(w.options.x,620);assert.equal(w.options.y,280);assert.equal(w.options.width,1300);assert.ok(!b.native.includes('maximize'));w.emit('ready-to-show');assert.deepEqual(b.native.slice(-3),['maximize','show','focus']);
  w.emit('close',{preventDefault(){}});const write=b.writes.find(([name])=>name===file+'.tmp');assert.ok(write);assert.deepEqual(JSON.parse(write[1]),{bounds:{x:20,y:30,width:1200,height:800},maximized:true});
});
test('Cancel retires an external-file worker and refuses its late response without recording a recent file',async t=>{
  const file=path.resolve(__dirname,'cancel-launch.off'),b=await boot({},'win32',{},true,{argv:['electron','.',file]});t.after(()=>b.app.emit('window-all-closed'));
  const token=await b.invoke('take-open-request'),pending=b.invoke('open-requested',token,'external-read');await Promise.resolve();assert.equal(b.spawns.length,1);
  const child=b.spawns[0].child;const canceled=assert.rejects(pending,/canceled/);await b.invoke('cancel','external-read');await canceled;assert.equal(child.killed,true);
  child.stdout.emit('data',JSON.stringify({id:'external-read',ok:true,result:{model:{name:'late'}}})+'\n');await Promise.resolve();assert.equal((await b.invoke('recent-files')).files.length,0);assert.equal(b.writes.length,0);
});
test('packaged first-launch and ordinary open-file events preserve their exact selected paths',async t=>{
  const file=path.resolve(__dirname,'packaged.polyproj'),b=await boot({},'win32',{},false,{packaged:true,argv:['Polytope Laboratory.exe',file],existingFiles:[file]});t.after(()=>b.app.emit('window-all-closed'));
  const token=await b.invoke('take-open-request');await b.invoke('open-requested',token,'packaged-file');assert.equal(b.spawns[0].child.request.params.path,file);
  const ordinary=await boot();ordinary.app.emit('open-file',{preventDefault(){}},file);assert.equal(typeof await ordinary.invoke('take-open-request'),'string');
});

test('presentation IPC cannot fullscreen or show an explicitly hidden qualification window',async()=>{
  const b=await boot(hiddenEnv());assert.equal(await b.invoke('presentation-window',true),false);assert.equal(await b.invoke('presentation-window',false),false);assert.deepEqual(b.native,[]);assert.equal(b.windows[0].fullscreen,false);
});
