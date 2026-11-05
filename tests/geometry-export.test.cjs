const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createGeometryExport,GEOMETRY_EXPORT_FORMATS}=require('../desktop/geometry-export.cjs');
const {createTextExport,TEXT_EXPORT_LIMITS}=require('../desktop/text-export.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'polytope-geometry-export-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^polytope-geometry-export-/);await fs.rm(root,{recursive:true,force:true});});return {root,file:path.join(root,'selected.file')};}
for(const format of GEOMETRY_EXPORT_FORMATS)test(format+' uses a one-shot atomic destination ticket and preserves literal Unicode',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior content');
  const exporter=createGeometryExport({selectPath:async()=>file}),ticket=await exporter.begin({format,defaultName:'Model.'+format});
  assert.equal(await fs.readFile(file,'utf8'),'prior content');const text='Literal geometry π 研究\n';
  assert.equal((await exporter.write(ticket.id,['3mf','glb'].includes(format)?new Uint8Array(Buffer.from(text)):text)).bytes,Buffer.byteLength(text));assert.equal(await fs.readFile(file,'utf8'),text);
  assert.deepEqual(await fs.readdir(root),['selected.file']);await assert.rejects(exporter.write(ticket.id,text),/unavailable/);
});
test('geometry profile permits output beyond the supporting-data limit without widening its formats or size',async t=>{
  const {file}=await fixture(t),text='x'.repeat(TEXT_EXPORT_LIMITS.bytes+1),geometry=createGeometryExport({selectPath:async()=>file}),support=createTextExport({selectPath:async()=>file});
  const ticket=await geometry.begin({format:'off',defaultName:'Model.off'});assert.equal((await geometry.write(ticket.id,text)).bytes,text.length);
  await assert.rejects(support.begin({format:'off',defaultName:'Model.off'}),/unsupported/);
  const bounded=await support.begin({format:'json',defaultName:'Model.json'});await assert.rejects(support.write(bounded.id,text),/32 MiB/);
  await assert.rejects(geometry.begin({format:'pdf',defaultName:'Model.pdf'}),/unsupported/);
  for(const options of [{maxBytes:0},{maxBytes:129*1024*1024},{formats:['exe']},{formats:['json','json']}])assert.throws(()=>createTextExport({selectPath:async()=>file,...options}),/invalid/);
});
test('failed geometry replacement leaves the selected previous file complete and removes its temporary',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(file,'prior complete geometry');
  const exporter=createGeometryExport({selectPath:async()=>file,io:{...fs,rename:async()=>{throw Error('injected rename failure');}}});
  const ticket=await exporter.begin({format:'obj',defaultName:'Model.obj'});await assert.rejects(exporter.write(ticket.id,'new geometry'),/rename failure/);
  assert.equal(await fs.readFile(file,'utf8'),'prior complete geometry');assert.deepEqual(await fs.readdir(root),['selected.file']);
});
