const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createProjectStorage}=require('../desktop/project-storage.cjs');
const {createWorkspaceReads}=require('../desktop/workspace-reads.cjs');
const {spawn}=require('node:child_process');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'polytope-publication-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,file:path.join(root,'model.polyproj')};}
const write=async(file,data)=>{await fs.writeFile(file,JSON.stringify(data));const handle=await fs.open(file,'r+');try{await handle.sync();}finally{await handle.close();}};
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));

function readFixture(options={}){
  const choices=[],reads=[];
  const service=createWorkspaceReads({chooseFile:()=>new Promise((resolve,reject)=>choices.push({resolve,reject})),
    read:(file,id)=>new Promise((resolve,reject)=>reads.push({file,id,resolve,reject})),recoveryPath:()=>'/recovery.polyproj',...options});
  return {service,choices,reads};
}

test('file loading retains its request ID across chooser/native read and supports the legacy omitted ID',async()=>{
  for(const id of ['file-id',undefined]){
    const f=readFixture(),pending=f.service.open(id);f.choices[0].resolve({canceled:false,filePaths:['/source.off']});await Promise.resolve();
    assert.equal(f.reads.length,1);assert.equal(f.reads[0].file,'/source.off');assert.equal(typeof f.reads[0].id,'string');if(id)assert.equal(f.reads[0].id,id);
    f.reads[0].resolve({model:{name:'Source'}});assert.deepEqual(await pending,{model:{name:'Source'},path:'/source.off'});assert.equal(f.service.has(f.reads[0].id),false);
  }
});

test('canceling during a chooser prevents a late selection from starting native work',async()=>{
  const f=readFixture(),pending=f.service.open('chosen');assert.equal(f.service.cancel('chosen'),true);f.choices[0].resolve({canceled:false,filePaths:['/late.off']});
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.reads.length,0);assert.equal(f.service.has('chosen'),false);
});

test('canceled file reads cannot publish late results or late provider errors',async()=>{
  for(const fail of [false,true]){
    const f=readFixture(),pending=f.service.open('reading');f.choices[0].resolve({canceled:false,filePaths:['/source.off']});await Promise.resolve();f.service.cancel('reading');
    if(fail)f.reads[0].reject(Error('late provider error'));else f.reads[0].resolve({model:{name:'Late'}});
    await assert.rejects(pending,{name:'AbortError'});assert.equal(f.service.has('reading'),false);
  }
});

test('recovery retains missing-file semantics, forwards IDs, and fences cancellation',async()=>{
  const f=readFixture(),first=f.service.recover('recover');assert.deepEqual({file:f.reads[0].file,id:f.reads[0].id},{file:'/recovery.polyproj',id:'recover'});
  f.reads[0].reject(Error('No such file'));assert.equal(await first,null);
  const next=f.service.recover('recover');f.service.cancel('recover');f.reads[1].resolve({project:{documents:[]}});await assert.rejects(next,{name:'AbortError'});
  const invalid=f.service.recover('invalid');f.reads[2].reject(Error('Invalid geometry'));await assert.rejects(invalid,/Invalid geometry/);
});

test('file request identity, cross-channel collisions and pending counts remain bounded before dialogs',async()=>{
  const f=readFixture({maxPending:1,isInUse:id=>id==='external'});
  for(const id of [null,42,'','bad id','x'.repeat(129)])await assert.rejects(f.service.open(id),/bounded file load ID/);
  await assert.rejects(f.service.open('external'),/Duplicate/);assert.equal(f.choices.length,0);
  const pending=f.service.open('active');await assert.rejects(f.service.open('active'),/Duplicate/);await assert.rejects(f.service.open('excess'),/pending file loads/);
  f.choices[0].resolve({canceled:true});assert.equal(await pending,null);assert.equal(f.service.has('active'),false);
  const retry=f.service.open('active');f.choices[1].resolve({canceled:true});await retry;
});

test('shutdown and failed choosers release file ownership without starting stale native reads',async()=>{
  const f=readFixture(),pending=f.service.open('held');f.service.dispose();f.choices[0].resolve({canceled:false,filePaths:['/late.off']});
  await assert.rejects(pending,{name:'AbortError'});await assert.rejects(f.service.open('new'),/shutting down/);assert.equal(f.reads.length,0);
  const g=readFixture(),failed=g.service.open('failed');g.choices[0].reject(Error('Chooser failed'));await assert.rejects(failed,/Chooser failed/);assert.equal(g.service.has('failed'),false);
});

test('project publication retains complete backup and leaves unrelated pending file',async t=>{
  const {root,file}=await fixture(t);await write(file,{version:1});await fs.writeFile(file+'.pending','unrelated');
  await createProjectStorage({writeProject:write}).publish(file,{version:2});assert.deepEqual(await read(file),{version:2});assert.deepEqual(await read(file+'.bak'),{version:1});assert.equal(await fs.readFile(file+'.pending','utf8'),'unrelated');assert.deepEqual((await fs.readdir(root)).sort(),['model.polyproj','model.polyproj.bak','model.polyproj.pending']);
});

test('failed validation preserves project and existing backup',async t=>{
  const {root,file}=await fixture(t);await write(file,{version:1});await write(file+'.bak',{version:0});
  const storage=createProjectStorage({writeProject:async()=>{throw new Error('invalid geometry');}});
  await assert.rejects(()=>storage.publish(file,{version:2}),/invalid geometry/);assert.deepEqual(await read(file),{version:1});assert.deepEqual(await read(file+'.bak'),{version:0});assert.equal((await fs.readdir(root)).length,2);
});

for(const phase of ['copy','backup-rename','publish-rename'])test('interrupted '+phase+' preserves a complete readable project',async t=>{
  const {root,file}=await fixture(t);await write(file,{version:1});
  const io={...fs,copyFile:async(...args)=>{if(phase==='copy')throw new Error('disk full');return fs.copyFile(...args);},rename:async(a,b)=>{if((phase==='backup-rename'&&b.endsWith('.bak'))||(phase==='publish-rename'&&b===file))throw new Error('interrupted');return fs.rename(a,b);}};
  await assert.rejects(()=>createProjectStorage({writeProject:write,io}).publish(file,{version:2}));assert.deepEqual(await read(file),{version:1});if(phase==='publish-rename')assert.deepEqual(await read(file+'.bak'),{version:1});assert.ok((await fs.readdir(root)).every(name=>!name.startsWith('.')));
});

test('concurrent saves serialize and a failed writer does not poison subsequent saves',async t=>{
  const {file}=await fixture(t);await write(file,{version:0});let release;const gate=new Promise(resolve=>release=resolve),started=[];
  const storage=createProjectStorage({writeProject:async(file,data)=>{started.push(data.version);if(data.version===1)await gate;if(data.version===2)throw new Error('failed second save');await write(file,data);}});
  const first=storage.publish(file,{version:1}),second=storage.publish(file,{version:2}),third=storage.publish(file,{version:3});const secondFailure=assert.rejects(second,/failed second/);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,[1]);release();await first;await secondFailure;await third;assert.deepEqual(started,[1,2,3]);assert.deepEqual(await read(file),{version:3});assert.deepEqual(await read(file+'.bak'),{version:1});
});

for(const stage of ['after-temp','after-backup','after-publication'])test('killed writer at '+stage+' leaves complete previous or next document',async t=>{
  const {file}=await fixture(t);await write(file,{version:1});
  const script=`const fs=require('node:fs/promises');const {createProjectStorage}=require(process.argv[3]);const file=process.argv[1],stage=process.argv[2];async function stop(at){if(stage===at){process.send(at);await new Promise(()=>{});}}const io={...fs,rename:async(a,b)=>{await fs.rename(a,b);if(b===file+'.bak')await stop('after-backup');if(b===file)await stop('after-publication');}};createProjectStorage({io,writeProject:async(p,data)=>{await fs.writeFile(p,JSON.stringify(data));const handle=await fs.open(p,'r+');try{await handle.sync();}finally{await handle.close();}await stop('after-temp');}}).publish(file,{version:2}).catch(e=>{process.send({error:e.message});process.exit(1);});`;
  const child=spawn(process.execPath,['-e',script,file,stage,path.resolve(__dirname,'../desktop/project-storage.cjs')],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',data=>stderr+=data);
  t.after(()=>{if(child.exitCode===null)child.kill();});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Writer stage timeout '+stderr)),10000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('message',message=>{clearTimeout(timer);typeof message==='string'?resolve():reject(new Error(message.error));});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Writer exited early '+code+' '+stderr));});});
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;
  assert.deepEqual(await read(file),{version:stage==='after-publication'?2:1});
  if(stage!=='after-temp')assert.deepEqual(await read(file+'.bak'),{version:1});
});
