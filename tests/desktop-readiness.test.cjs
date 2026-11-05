const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {EventEmitter}=require('node:events');
const {parseFileArguments,filePath,createRecentFiles,createOpenRequests,focusExistingWindow}=require('../desktop/desktop-files.cjs');
const {restoreWindowState,createWindowState}=require('../desktop/window-state.cjs');
const paths=path.win32,cwd='C:\\work';
const parse=(argv,options={})=>parseFileArguments(argv,{cwd,paths,...options});

test('packaged and development argv skip the executable and development entry',()=>{
  assert.deepEqual(parse(['lab.exe','a.polyproj','B.OFF']),['C:\\work\\a.polyproj','C:\\work\\B.OFF']);
  assert.deepEqual(parse(['electron.exe','app.json','..\\shape.off'],{packaged:false}),['C:\\shape.off']);
  assert.deepEqual(parse(['electron.exe','.'],{packaged:false}),[]);
});
test('argv handles spaces, quotes, Unicode, relative paths, case dedupe and UNC paths',()=>{
  assert.deepEqual(parse(['lab.exe','"C:\\My Models\\Δ.polyproj"','c:\\my models\\Δ.POLYPROJ','\\\\server\\share\\x.off','x.dxf','y.json']),['C:\\My Models\\Δ.polyproj','\\\\server\\share\\x.off','C:\\work\\x.dxf','C:\\work\\y.json']);
});
test('argv refuses URLs, switches and option values, malformed and unsupported paths',()=>{
  assert.deepEqual(parse(['lab.exe','--user-data-dir','profile.polyproj','--remote-debugging-port=9000','--unknown','ignore.off','https://host/x.off','file:///C:/a.off','--updated','ok.off','bad\0.off',null,'a.exe','--','last.polyproj']),['C:\\work\\ok.off','C:\\work\\last.polyproj']);
  assert.equal(filePath('a'.repeat(32769)+'.off',{paths,cwd}),null);
  assert.deepEqual(parse(undefined),[]);
  assert.equal(parse(['app',...Array.from({length:50},(_,i)=>i+'.off')]).length,10);
});
function recentFixture(initial){
  const disk=new Map(initial===undefined?[]:[['C:\\profile\\recent.json',JSON.stringify(initial)]]),existing=new Set(),failures=new Map(),writes=[];
  const missing=()=>Object.assign(Error('missing'),{code:'ENOENT'});
  const io={readFile:async file=>{if(!disk.has(file))throw missing();return disk.get(file);},mkdir:async()=>{},
    stat:async file=>{if(failures.has(file))throw Object.assign(Error('denied'),{code:failures.get(file)});if(!existing.has(file))throw missing();return {isFile:()=>true};},
    writeFile:async(file,data)=>{disk.set(file,data);writes.push(file);},rename:async(from,to)=>{disk.set(to,disk.get(from));disk.delete(from);},unlink:async file=>disk.delete(file)};
  const make=()=>createRecentFiles({file:'C:\\profile\\recent.json',io,paths});
  return {store:make(),make,disk,existing,failures,writes};
}
test('recent files serialize concurrent adds, dedupe case-insensitively, cap ten and persist order',async()=>{
  const f=recentFixture(),files=Array.from({length:12},(_,i)=>'C:\\work\\'+i+'.off');files.forEach(file=>f.existing.add(file));
  await Promise.all(files.map(file=>f.store.add(file)));await f.store.add(files[4].toUpperCase());f.existing.add(files[4].toUpperCase());
  const result=await f.make().list();assert.equal(result.files.length,10);assert.equal(result.files[0],files[4].toUpperCase());assert.equal(result.files.filter(p=>p.toLowerCase()===files[4].toLowerCase()).length,1);
  assert.ok(!result.files.includes(files[0]));assert.ok(!f.disk.has('C:\\profile\\recent.json.tmp'));
});
test('missing recent files are pruned durably with a one-time message; permission failures remain',async()=>{
  const f=recentFixture(['C:\\gone.off','C:\\present.polyproj','C:\\denied.off']);f.existing.add('C:\\present.polyproj');f.failures.set('C:\\denied.off','EACCES');
  const result=await f.store.list();assert.deepEqual(result.files,['C:\\present.polyproj','C:\\denied.off']);assert.match(result.message,/Removed 1 missing file.*gone.off/);
  assert.equal((await f.store.list()).message,'');assert.deepEqual((await f.make().list()).files,result.files);
});
test('recent preferences filter unsupported, duplicate and relative records; corrupt JSON is recoverable',async()=>{
  const f=recentFixture(['relative.off',null,'C:\\a.exe','C:\\a.off','c:\\A.OFF']);f.existing.add('C:\\a.off');assert.deepEqual((await f.store.list()).files,['C:\\a.off']);
  const g=recentFixture();g.disk.set('C:\\profile\\recent.json','{bad');assert.match((await g.store.list()).message,/could not be read/);await g.store.add('C:\\new.off');
  await assert.rejects(g.store.add('C:\\bad.exe'),/supported/);assert.equal(JSON.parse(g.disk.get('C:\\profile\\recent.json'))[0],'C:\\new.off');
});
test('main-created file tokens are bounded, single-use and cannot authorize arbitrary paths',()=>{
  let sequence=0;const q=createOpenRequests({id:()=>String(++sequence),limit:2});q.enqueue('a.off');q.enqueue('b.polyproj');assert.throws(()=>q.enqueue('c.off'),/Finish pending/);
  assert.equal(q.take(),'1');assert.equal(q.consume('1'),'a.off');assert.throws(()=>q.consume('1'),/expired/);assert.throws(()=>q.consume('C:\\secret.polyproj'),/expired/);
  q.discard('2');assert.equal(q.take(),null);assert.equal(q.size,0);
});
test('existing-window activation restores a minimized window and is a strict no-op in hidden mode',()=>{
  const calls=[],window={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),focus:()=>calls.push('focus')};
  focusExistingWindow(window,true);assert.deepEqual(calls,[]);focusExistingWindow(window,false);assert.deepEqual(calls,['restore','show','focus']);
  window.isDestroyed=()=>true;focusExistingWindow(window,false);assert.equal(calls.length,3);
});
const displays=[{workArea:{x:0,y:0,width:1920,height:1040}},{workArea:{x:-1600,y:-200,width:1600,height:900}}];
test('valid saved window bounds and maximized state restore on a negative-coordinate display',()=>{
  const bounds={x:-1500,y:-150,width:1200,height:750};assert.deepEqual(restoreWindowState({bounds,maximized:true},displays),{...bounds,minWidth:1050,minHeight:720,maximized:true});
});
test('disconnected displays, changed resolutions and oversized bounds clamp completely into a work area',()=>{
  for(const bounds of [{x:5000,y:3000,width:1500,height:960},{x:-1700,y:-300,width:2000,height:1500}]){
    const r=restoreWindowState({bounds},displays);assert.ok(displays.some(({workArea:a})=>r.x>=a.x&&r.y>=a.y&&r.x+r.width<=a.x+a.width&&r.y+r.height<=a.y+a.height));
  }
  const small=restoreWindowState(null,[{workArea:{x:0,y:0,width:800,height:600}}]);assert.deepEqual(small,{x:0,y:0,width:800,height:600,minWidth:800,minHeight:600,maximized:false});
});
test('corrupt and nonfinite bounds fall back to safe defaults without trusting extra fields',()=>{
  for(const bounds of [null,{x:NaN,y:0,width:1500,height:960},{x:Infinity,y:0,width:2,height:3},{x:0,y:0,width:-2,height:3},{x:1.5,y:0,width:100,height:100}]){
    const r=restoreWindowState({bounds,maximized:'true',show:true},displays);assert.equal(r.width,1500);assert.equal(r.height,960);assert.equal(r.maximized,false);assert.equal(r.show,undefined);
  }
});
test('window tracking saves normal bounds on close, preserves maximized state and skips fullscreen/minimized',()=>{
  const window=new EventEmitter(),disk=new Map();let skipped=false;
  Object.assign(window,{isDestroyed:()=>false,isMinimized:()=>skipped,isFullScreen:()=>false,isMaximized:()=>true,getNormalBounds:()=>({x:10,y:20,width:1200,height:800})});
  const store=createWindowState({file:'C:\\profile\\window.json',io:{readFileSync:file=>disk.get(file),mkdirSync(){},writeFileSync:(file,value)=>disk.set(file,value),renameSync:(from,to)=>{disk.set(to,disk.get(from));disk.delete(from);}}});
  store.track(window);window.emit('resize');window.emit('close');assert.equal(store.load(displays).maximized,true);assert.equal(store.load(displays).x,10);disk.clear();skipped=true;window.emit('close');assert.equal(disk.size,0);window.emit('closed');
});
test('installer and unchanged portable configurations pass the installed electron-builder schema',async()=>{
  const pkg=require('../package.json'),installer=require('../desktop/installer-config.cjs');
  const {validateConfiguration}=require('app-builder-lib/out/util/config/config');
  const {DebugLogger}=require('builder-util');
  await validateConfiguration(pkg.build,new DebugLogger());await validateConfiguration(installer,new DebugLogger());
  assert.equal(pkg.build.win.target,'portable');assert.equal(pkg.build.win.signAndEditExecutable,false);assert.match(pkg.scripts.package,/--win portable --x64$/);
  assert.equal(installer.win.target,'nsis');assert.equal(installer.win.signAndEditExecutable,true);assert.equal(installer.win.signExecutable,false);assert.equal(installer.nsis.perMachine,false);assert.equal(installer.nsis.oneClick,false);assert.equal(installer.nsis.createStartMenuShortcut,true);assert.equal(installer.nsis.createDesktopShortcut,true);assert.equal(installer.nsis.allowElevation,false);
  assert.deepEqual(installer.fileAssociations.map(a=>a.ext),['polyproj','off']);assert.match(pkg.scripts['package:installer'],/--config desktop\/installer-config.cjs --win nsis --x64/);
  const icon=fs.readFileSync(path.join(__dirname,'..',installer.win.icon));assert.equal(icon.readUInt16LE(2),1);assert.equal(icon.readUInt16LE(4),6);
  const include=fs.readFileSync(path.join(__dirname,'..',installer.nsis.include),'utf8');assert.match(include,/Create a desktop shortcut/);assert.match(include,/NSD_GetState/);assert.match(include,/Delete "\$newDesktopLink"/);
});
