const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createGeometryExport}=require('../desktop/geometry-export.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'printable-export-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^printable-export-/);await fs.rm(root,{recursive:true,force:true});});return {root,file:path.join(root,'model')};}
for(const format of ['stl','3mf'])test(format+' copies binary view bytes and publishes with the geometry atomic writer',async t=>{
  const {file,root}=await fixture(t);await fs.writeFile(file,'old');
  const exporter=createGeometryExport({selectPath:async()=>file}),ticket=await exporter.begin({format,defaultName:'Model.'+format});
  const backing=new Uint8Array([9,0,255,80,75,7]),bytes=backing.subarray(1,5);
  const pending=exporter.write(ticket.id,bytes);backing.fill(1);await pending;
  assert.deepEqual([...await fs.readFile(file)],[0,255,80,75]);assert.deepEqual(await fs.readdir(root),['model']);
  await assert.rejects(exporter.write(ticket.id,bytes),/unavailable/);
});
test('binary replacement failure leaves the prior complete file and removes its temporary',async t=>{
  const {file,root}=await fixture(t);await fs.writeFile(file,'old complete file');
  const exporter=createGeometryExport({selectPath:async()=>file,io:{...fs,rename:async()=>{throw Error('injected failure');}}});
  const ticket=await exporter.begin({format:'3mf',defaultName:'Model.3mf'});await assert.rejects(exporter.write(ticket.id,new Uint8Array([80,75])),/injected/);
  assert.equal(await fs.readFile(file,'utf8'),'old complete file');assert.deepEqual(await fs.readdir(root),['model']);
});
