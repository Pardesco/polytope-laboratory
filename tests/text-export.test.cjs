const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createTextExport,TEXT_EXPORT_LIMITS}=require('../desktop/text-export.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'polytope-text-export-'));
  t.after(async()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.match(path.basename(resolved),/^polytope-text-export-/);await fs.rm(resolved,{recursive:true,force:true});});
  return {root,file:path.join(root,'report.csv')};
}
const options={format:'csv',defaultName:'Report.csv'};
async function unchanged(root,file){assert.equal(await fs.readFile(file,'utf8'),'prior exact file');assert.deepEqual(await fs.readdir(root),[path.basename(file)]);}

for(const format of ['csv','json','svg'])test('confirmed '+format+' writes exact literal UTF-8 once, using fsync before same-folder rename',async t=>{
  const {root,file}=await fixture(t),events=[];await fs.writeFile(file,'prior exact file');const text='\ufeffπ,😀\r\n"<svg>literal</svg>","quoted"\n';
  const io={...fs,open:async(name,flags,mode)=>{events.push(['open',name,flags]);const handle=await fs.open(name,flags,mode);return {writeFile:async data=>{events.push(['write',data.length]);await handle.writeFile(data);},sync:async()=>{events.push(['sync']);await handle.sync();},close:async()=>{events.push(['close']);await handle.close();}};},rename:async(a,b)=>{events.push(['rename',a,b]);await fs.rename(a,b);}};
  const exporter=createTextExport({selectPath:async input=>{assert.equal(input.format,format);assert.equal(input.defaultName,'Report.csv');assert.ok(input.signal instanceof AbortSignal);return {canceled:false,filePath:file};},io});
  const ticket=await exporter.begin({...options,format});assert.deepEqual(ticket,{id:ticket.id,path:file});assert.deepEqual(events,[]);assert.equal(await fs.readFile(file,'utf8'),'prior exact file');
  const result=await exporter.write(ticket.id,text);assert.deepEqual(result,{path:file,format,bytes:Buffer.byteLength(text,'utf8')});assert.deepEqual(await fs.readFile(file),Buffer.from(text,'utf8'));assert.deepEqual(events.map(e=>e[0]),['open','write','sync','close','rename']);assert.equal(path.dirname(events[0][1]),root);assert.equal(events[0][2],'wx');assert.deepEqual(await fs.readdir(root),['report.csv']);
  await assert.rejects(()=>exporter.write(ticket.id,'second'),/unavailable|already used/);assert.equal(exporter.abort(ticket.id),false);
});
test('canceled or ignored held dialog cannot create an output or leave a late writable ticket',async t=>{
  const {root,file}=await fixture(t);let writes=0;const gate=deferred(),controller=new AbortController();
  const exporter=createTextExport({selectPath:()=>gate.promise,io:{...fs,open:async(...a)=>{writes++;return fs.open(...a);}}});
  const pending=exporter.begin(options,{signal:controller.signal}),failure=assert.rejects(pending,e=>e.name==='AbortError');await tick();controller.abort();await failure;gate.resolve(file);await tick();assert.equal(writes,0);assert.deepEqual(await fs.readdir(root),[]);
  const canceled=createTextExport({selectPath:async()=>({canceled:true,filePath:file})});assert.equal(await canceled.begin(options),null);assert.deepEqual(await fs.readdir(root),[]);
});
test('four pending dialogs/tickets is the maximum, and abort/expiry release slots without publication',async t=>{
  const {root,file}=await fixture(t);let now=0,calls=0;const exporter=createTextExport({selectPath:async()=>{calls++;return file;},now:()=>now,ttlMs:10});
  const tickets=[];for(let i=0;i<4;i++)tickets.push(await exporter.begin(options));await assert.rejects(()=>exporter.begin(options),/pending text exports/);assert.equal(calls,4);
  assert.equal(exporter.abort(tickets[0].id),true);const next=await exporter.begin(options);now=11;await assert.rejects(()=>exporter.write(next.id,'expired'),/unavailable|expired/);assert.equal(await fs.readdir(root).then(a=>a.length),0);
  const fresh=await exporter.begin(options);await exporter.write(fresh.id,'fresh');assert.equal(await fs.readFile(file,'utf8'),'fresh');
  const held=deferred(),waiting=createTextExport({selectPath:()=>held.promise});const pending=[];for(let i=0;i<4;i++)pending.push(waiting.begin(options));await tick();await assert.rejects(()=>waiting.begin(options),/pending text exports/);waiting.dispose();await Promise.all(pending.map(p=>assert.rejects(p,e=>e.name==='AbortError')));held.resolve(file);
});
test('begin rejects malformed envelopes/names/formats and unconfirmed invalid paths without filesystem writes',async t=>{
  const {root,file}=await fixture(t);let calls=0;
  const exporter=createTextExport({selectPath:async()=>{calls++;return file;}});
  for(const params of [null,[],{}, {...options,extra:1},{format:'exe',defaultName:'x.exe'},{format:'csv',defaultName:1},{format:'csv',defaultName:'../escape.csv'},{format:'csv',defaultName:'x\u0000.csv'},{format:'csv',defaultName:'\ud800.csv'}])await assert.rejects(()=>exporter.begin(params));
  assert.equal(calls,0);
  for(const selected of ['', 'relative.csv', root+path.sep, '\u0000bad', {filePath:5}, {canceled:false}, file+'\ud800'])await assert.rejects(()=>createTextExport({selectPath:async()=>selected}).begin(options));
  await assert.rejects(()=>createTextExport({selectPath:async()=>root}).begin(options),/file destination/);assert.deepEqual(await fs.readdir(root),[]);
});
test('invalid, consumed, oversized UTF-8 and ill-formed Unicode output never modifies a prior selected file',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior exact file');const exporter=createTextExport({selectPath:async()=>file});
  for(const id of [undefined,null,{},'', '../forged','forged'])await assert.rejects(()=>exporter.write(id,'data'));await unchanged(root,file);
  for(const text of [null,123,{},Buffer.from('bytes'),'\ud800','\udc00','x'.repeat(TEXT_EXPORT_LIMITS.bytes+1),'é'.repeat(TEXT_EXPORT_LIMITS.bytes/2+1)]){
    const ticket=await exporter.begin(options);await assert.rejects(()=>exporter.write(ticket.id,text));await assert.rejects(()=>exporter.write(ticket.id,'retry'),/unavailable|used/);await unchanged(root,file);
  }
});
for(const format of ['csv','pdf'])for(const phase of ['open','write','sync','close','rename'])test('failed '+format+' '+phase+' preserves prior file and cleans only the owned temporary',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior exact file');await fs.writeFile(path.join(root,'unrelated.pending'),'unrelated');
  const io={...fs,open:async(...args)=>{
    if(phase==='open')throw new Error('injected open failure');const h=await fs.open(...args);let closeAttempt=0;
    return {writeFile:async bytes=>{if(phase==='write'){await h.writeFile(bytes.subarray(0,3));throw new Error('injected write failure');}await h.writeFile(bytes);},sync:async()=>{if(phase==='sync')throw new Error('injected sync failure');await h.sync();},close:async()=>{await h.close();if(phase==='close'&&closeAttempt++===0)throw new Error('injected close failure');}};
  },rename:async(...args)=>{if(phase==='rename')throw new Error('injected rename failure');await fs.rename(...args);}};
  const exporter=createTextExport({selectPath:async()=>file,io}),ticket=await exporter.begin({...options,format});const payload=format==='pdf'?Buffer.from([37,80,68,70,0,255,128,10]):'new complete literal file';await assert.rejects(()=>exporter.write(ticket.id,payload),new RegExp('injected '+phase+' failure'));assert.equal(await fs.readFile(file,'utf8'),'prior exact file');assert.equal(await fs.readFile(path.join(root,'unrelated.pending'),'utf8'),'unrelated');assert.deepEqual((await fs.readdir(root)).sort(),['report.csv','unrelated.pending']);
});
test('abort during held fsync fences publication and awaits owned temporary cleanup',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior exact file');const gate=deferred();let entered=false;
  const io={...fs,open:async(...args)=>{const h=await fs.open(...args);return {writeFile:bytes=>h.writeFile(bytes),sync:async()=>{entered=true;await gate.promise;await h.sync();},close:()=>h.close()};}};
  const exporter=createTextExport({selectPath:async()=>file,io}),ticket=await exporter.begin(options),pending=exporter.write(ticket.id,'replacement'),failure=assert.rejects(pending,e=>e.name==='AbortError');while(!entered)await tick();assert.equal(exporter.abort(ticket.id),true);gate.resolve();await failure;await unchanged(root,file);
});
test('same destination writes serialize, and a canceled queued ticket cannot replace a completed file',async t=>{
  const {root,file}=await fixture(t),gate=deferred(),writes=[];let syncCount=0,entered=false;
  const io={...fs,open:async(...args)=>{const h=await fs.open(...args);return {writeFile:async data=>{writes.push(data.toString());await h.writeFile(data);},sync:async()=>{if(syncCount++===0){entered=true;await gate.promise;}await h.sync();},close:()=>h.close()};}};
  const exporter=createTextExport({selectPath:async()=>file,io}),first=await exporter.begin(options),second=await exporter.begin(options);
  const a=exporter.write(first.id,'first'),b=exporter.write(second.id,'second'),failure=assert.rejects(b,e=>e.name==='AbortError');while(!entered)await tick();assert.deepEqual(writes,['first']);exporter.abort(second.id);gate.resolve();await a;await failure;assert.equal(await fs.readFile(file,'utf8'),'first');assert.deepEqual(await fs.readdir(root),['report.csv']);
});
test('external abort after confirmation consumes the ticket and closed exporters create no new dialogs',async t=>{
  const {root,file}=await fixture(t);let calls=0;const exporter=createTextExport({selectPath:async()=>{calls++;return file;}}),ticket=await exporter.begin(options),controller=new AbortController();controller.abort();await assert.rejects(()=>exporter.write(ticket.id,'text',{signal:controller.signal}),e=>e.name==='AbortError');await assert.rejects(()=>exporter.write(ticket.id,'retry'),/unavailable|used/);exporter.dispose();await assert.rejects(()=>exporter.begin(options),/closed/);assert.equal(calls,1);assert.deepEqual(await fs.readdir(root),[]);
});
for(const type of ['Buffer','Uint8Array'])test('confirmed PDF snapshots exact '+type+' bytes and its view before asynchronous writes',async t=>{
  const {root,file}=await fixture(t),gate=deferred();await fs.writeFile(file,'prior exact file');const original=Uint8Array.from([99,37,80,68,70,45,0,255,128,10,98]),payload=type==='Buffer'?Buffer.from(original).subarray(1,10):original.subarray(1,10),expected=Buffer.from(payload);let opened=false;
  const io={...fs,open:async(...args)=>{opened=true;await gate.promise;return fs.open(...args);}};
  const exporter=createTextExport({selectPath:async()=>file,io}),ticket=await exporter.begin({format:'pdf',defaultName:'Calibrated.pdf'});assert.equal(opened,false);assert.equal(await fs.readFile(file,'utf8'),'prior exact file');
  const pending=exporter.write(ticket.id,payload);payload.fill(42);await tick();assert.equal(opened,true);gate.resolve();assert.deepEqual(await pending,{path:file,format:'pdf',bytes:expected.length});assert.deepEqual(await fs.readFile(file),expected);assert.deepEqual(await fs.readdir(root),['report.csv']);await assert.rejects(()=>exporter.write(ticket.id,expected),/unavailable|used/);
});
test('PDF accepts only bounded binary output and text formats reject all binary views',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior exact file');const exporter=createTextExport({selectPath:async()=>file});
  for(const payload of ['%PDF',null,1,{},[37,80,68,70],new DataView(new ArrayBuffer(8)),new Uint16Array(4),Buffer.alloc(TEXT_EXPORT_LIMITS.bytes+1)]){
    const ticket=await exporter.begin({format:'pdf',defaultName:'Report.pdf'});await assert.rejects(()=>exporter.write(ticket.id,payload),/Buffer|Uint8Array|32 MiB/);await assert.rejects(()=>exporter.write(ticket.id,Buffer.from('%PDF')),/unavailable|used/);await unchanged(root,file);
  }
  for(const format of ['csv','json','svg']){const ticket=await exporter.begin({...options,format});await assert.rejects(()=>exporter.write(ticket.id,new Uint8Array([0,255])),/Unicode/);await unchanged(root,file);}
});
test('PDF permits the exact 32 MiB byte boundary without changing bytes',async t=>{
  const {root,file}=await fixture(t),exporter=createTextExport({selectPath:async()=>file}),payload=Buffer.alloc(TEXT_EXPORT_LIMITS.bytes,0xaa);payload[0]=37;payload[payload.length-1]=255;
  const ticket=await exporter.begin({format:'pdf',defaultName:'Large.pdf'});assert.equal((await exporter.write(ticket.id,payload)).bytes,TEXT_EXPORT_LIMITS.bytes);assert.deepEqual(await fs.readFile(file),payload);assert.deepEqual(await fs.readdir(root),['report.csv']);
});
for(const cancel of ['abort','expiry'])test('PDF '+cancel+' during held fsync preserves the prior file and cleans the temporary',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior exact file');const gate=deferred();let now=0,entered=false;
  const io={...fs,open:async(...args)=>{const h=await fs.open(...args);return {writeFile:bytes=>h.writeFile(bytes),sync:async()=>{entered=true;await gate.promise;await h.sync();},close:()=>h.close()};}};
  const exporter=createTextExport({selectPath:async()=>file,io,now:()=>now,ttlMs:10}),ticket=await exporter.begin({format:'pdf',defaultName:'Report.pdf'}),pending=exporter.write(ticket.id,Buffer.from([37,80,68,70,0,255])),failure=assert.rejects(pending,e=>e.name==='AbortError');while(!entered)await tick();if(cancel==='abort')assert.equal(exporter.abort(ticket.id),true);else now=11;gate.resolve();await failure;await unchanged(root,file);
});
