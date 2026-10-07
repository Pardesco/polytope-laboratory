// Run after a fresh Vite build in the preserved source directory.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function files(directory){
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);
  }
  return result;
}
async function main(){
  assert.equal(process.argv.length,4,'Provide frozen directory and actual ASAR path.');
  const frozen=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]);
  const manifest=JSON.parse(await fs.readFile(path.join(frozen,'source-hashes.json'),'utf8'));
  for(const [relative,expected] of Object.entries(manifest.sourceHashes)){
    assert.equal(hash(await fs.readFile(path.join(frozen,'source',relative))),expected,relative+' frozen input changed');
    assert.equal(hash(await fs.readFile(path.join(root,relative))),expected,relative+' current input changed');
  }
  const reproduced=path.join(frozen,'source','reproduced-dist'),outputs=await files(reproduced);
  const relative=outputs.map(file=>path.relative(reproduced,file).split(path.sep).join('/')).sort();
  const actual=asar.listPackage(archive).map(file=>file.replace(/^[\\/]/,'').replaceAll('\\','/'))
    .filter(file=>file.startsWith('dist/')&&typeof asar.statFile(archive,path.normalize(file)).size==='number')
    .map(file=>file.slice(5)).sort();
  assert.deepEqual(relative,actual,'Reproduced file set differs from packaged dist');
  assert.deepEqual(relative,(await files(path.join(root,'dist'))).map(file=>path.relative(path.join(root,'dist'),file).split(path.sep).join('/')).sort());
  const distFiles={};
  for(const file of outputs){
    const relative=path.relative(reproduced,file).split(path.sep).join('/'),data=await fs.readFile(file);
    assert.ok(data.equals(await fs.readFile(path.join(root,'dist',relative))),relative+' differs from current dist');
    assert.ok(data.equals(asar.extractFile(archive,path.normalize('dist/'+relative))),relative+' differs from actual packaged dist');
    distFiles[relative]=hash(data);
  }
  const result={passed:true,version:manifest.version,createdUtc:new Date().toISOString(),
    scope:'Fresh build from unchanged frozen inputs; every reproduced/current/actual packaged dist byte compared',
    sourceHashCount:Object.keys(manifest.sourceHashes).length,currentInputsUnchanged:true,archive,
    archiveSha256:hash(await fs.readFile(archive)),reproductionDirectory:reproduced,distFiles};
  await fs.writeFile(path.join(frozen,'reproduction.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`Frontend reproduction PASS: ${result.sourceHashCount} inputs, ${outputs.length} exact dist files.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
