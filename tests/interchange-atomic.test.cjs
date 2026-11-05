const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createGeometryExport}=require('../desktop/geometry-export.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'interchange-export-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^interchange-export-/);await fs.rm(root,{recursive:true,force:true});});const file=path.join(root,'selected.obj');await fs.writeFile(file,'prior');return {root,file};}
const pair=()=>({obj:'# Polytope Laboratory colored boundary geometry\nmtllib __POLYTOPE_MTL__\nv 0 0 0\n',mtl:'newmtl color_0\nKd 1 0 0\n'});
test('OBJ and exclusive companion MTL publish together without overwriting preexisting materials',async t=>{
  const {root,file}=await fixture(t);await fs.writeFile(path.join(root,'materials.mtl'),'keep');
  const exporter=createGeometryExport({selectPath:async()=>file}),ticket=await exporter.begin({format:'obj',defaultName:'Model.obj'}),data=pair();
  const result=await exporter.write(ticket.id,data);assert.equal(path.dirname(result.materialPath),root);assert.match(path.basename(result.materialPath),/^polytope-materials-[a-f0-9-]+\.mtl$/);
  assert.equal(await fs.readFile(result.materialPath,'utf8'),data.mtl);assert.ok((await fs.readFile(file,'utf8')).includes('mtllib '+path.basename(result.materialPath)+'\n'));
  assert.equal(await fs.readFile(path.join(root,'materials.mtl'),'utf8'),'keep');await assert.rejects(exporter.write(ticket.id,data),/Invalid|unavailable/);
});
test('failed OBJ replacement cleans its companion and leaves the prior complete file',async t=>{
  const {root,file}=await fixture(t),exporter=createGeometryExport({selectPath:async()=>file,io:{...fs,rename:async()=>{throw Error('rename failure');}}});
  const ticket=await exporter.begin({format:'obj',defaultName:'Model.obj'});await assert.rejects(exporter.write(ticket.id,pair()),/rename failure/);
  assert.equal(await fs.readFile(file,'utf8'),'prior');assert.deepEqual(await fs.readdir(root),['selected.obj']);
});
test('material fsync failure releases the ticket and removes its unreferenced sidecar',async t=>{
  const {root,file}=await fixture(t),io={...fs,open:async(...args)=>{const h=await fs.open(...args);h.sync=async()=>{throw Error('material sync failure');};return h;}};
  const exporter=createGeometryExport({selectPath:async()=>file,io}),ticket=await exporter.begin({format:'obj',defaultName:'Model.obj'});
  await assert.rejects(exporter.write(ticket.id,pair()),/material sync failure/);assert.deepEqual(await fs.readdir(root),['selected.obj']);
  const next=await exporter.begin({format:'obj',defaultName:'Next.obj'});assert.ok(next);exporter.abort(next.id);
});
test('abort during material fsync prevents OBJ publication and removes the sidecar',async t=>{
  const {root,file}=await fixture(t);let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const io={...fs,open:async(...args)=>{const h=await fs.open(...args);const sync=h.sync.bind(h);h.sync=async()=>{entered();await gate;await sync();};return h;}};
  const exporter=createGeometryExport({selectPath:async()=>file,io}),ticket=await exporter.begin({format:'obj',defaultName:'Model.obj'}),pending=exporter.write(ticket.id,pair());
  await ready;exporter.abort(ticket.id);release();await assert.rejects(pending,/unavailable|canceled/);assert.deepEqual(await fs.readdir(root),['selected.obj']);assert.equal(await fs.readFile(file,'utf8'),'prior');
});
test('GLB copies precisely the selected binary view before asynchronous atomic writing',async t=>{
  const {file}=await fixture(t),exporter=createGeometryExport({selectPath:async()=>file}),ticket=await exporter.begin({format:'glb',defaultName:'Model.glb'});
  const data=new Uint8Array([9,103,108,84,70,0,255,9]),pending=exporter.write(ticket.id,data.subarray(1,7));data.fill(1);await pending;
  assert.deepEqual([...await fs.readFile(file)],[103,108,84,70,0,255]);
});
test('material payloads cannot choose paths or attach sidecars to another format',async t=>{
  const {root,file}=await fixture(t),exporter=createGeometryExport({selectPath:async()=>file});
  for(const [format,data] of [['obj',{...pair(),path:'arbitrary'}],['x3d',pair()],['obj',{...pair(),obj:'mtllib ../../outside.mtl'}]]){
    const ticket=await exporter.begin({format,defaultName:'Model.'+format});await assert.rejects(exporter.write(ticket.id,data),/Invalid/);
  }
  assert.deepEqual(await fs.readdir(root),['selected.obj']);
});
