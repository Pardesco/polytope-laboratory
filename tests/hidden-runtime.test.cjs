const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const asar=require('@electron/asar');
const {hiddenRuntime}=require('../scripts/hidden-runtime.cjs');
const root=path.resolve(__dirname,'..');
async function fixture({main,version}={}){
  const folder=await fs.mkdtemp(path.join(root,'artifacts','hidden-runtime-unit-'));
  const source=path.join(folder,'source'),resources=path.join(folder,'resources');
  await fs.mkdir(path.join(source,'desktop'),{recursive:true});await fs.mkdir(resources);
  await fs.writeFile(path.join(source,'desktop','main.cjs'),main??await fs.readFile(path.join(root,'desktop','main.cjs')));
  await fs.writeFile(path.join(source,'package.json'),JSON.stringify({version:version??require('../package.json').version}));
  await asar.createPackage(source,path.join(resources,'app.asar'));
  const exe=path.join(folder,'Fake runtime.exe');await fs.writeFile(exe,'Metadata fixture only: never execute.');
  return {folder,exe};
}
test('unpacked metadata requires exact current main/version and retains binary hashes',async()=>{
  const f=await fixture(),result=await hiddenRuntime(f.exe);
  assert.equal(result.packaged,true);assert.equal(result.executablePath,f.exe);
  assert.equal(result.version,require('../package.json').version);
  for(const field of ['mainSha256','executableSha256','archiveSha256'])assert.match(result[field],/^[0-9a-f]{64}$/);
  // Metadata is not execution evidence; no fake runtime is launched.
  assert.equal(result.passed,undefined);
});
test('older main code is refused before launch even if the version matches',async()=>{
  const f=await fixture({main:'// no activation guards'});
  await assert.rejects(hiddenRuntime(f.exe),/policy differs/);
});
test('older candidate version is refused even with identical main guards',async()=>{
  const f=await fixture({version:'0.13.0'});await assert.rejects(hiddenRuntime(f.exe),/version differs/);
});
test('portable outer wrappers without adjacent archive are refused',async()=>{
  const folder=await fs.mkdtemp(path.join(root,'artifacts','hidden-runtime-unit-'));
  const exe=path.join(folder,'Portable.exe');await fs.writeFile(exe,'never launch');
  await assert.rejects(hiddenRuntime(exe),/outer wrappers are refused/);
});
test('relative executable paths are refused',async()=>{
  await assert.rejects(hiddenRuntime('Fake runtime.exe'),/absolute unpacked/);
});
