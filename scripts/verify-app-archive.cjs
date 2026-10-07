// Compare actual packaged archive bytes with the qualified desktop/Vite inputs.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const asar=require('@electron/asar'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function files(directory){
  const entries=await fs.readdir(directory,{withFileTypes:true}),result=[];
  for(const entry of entries){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else if(entry.isFile())result.push(file);}
  return result;
}
async function main(){
  const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const archive=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'release','win-unpacked','resources','app.asar');
  const expected=(await Promise.all(['desktop','dist'].map(dir=>files(path.join(root,dir))))).flat();
  const sourcePaths=expected.map(file=>path.relative(root,file));
  const actual=asar.listPackage(archive).map(file=>path.normalize(file.replace(/^[\\/]/,'')))
    .filter(file=>/^(desktop|dist)[\\/]/.test(file)&&typeof asar.statFile(archive,file).size==='number');
  assert.deepEqual([...actual].sort(),[...sourcePaths].sort(),'Archive must contain exactly the current desktop/dist files.');
  const evidence=[];
  for(const file of expected){
    const relative=path.relative(root,file),source=await fs.readFile(file),bundled=asar.extractFile(archive,relative);
    assert.ok(source.equals(bundled),relative+' differs from source');
    evidence.push({path:relative.split(path.sep).join('/'),bytes:source.length,sha256:hash(source)});
  }
  const packaged=JSON.parse(asar.extractFile(archive,'package.json'));
  assert.equal(packaged.version,version);
  const result={version,passed:true,archive,archiveSha256:hash(await fs.readFile(archive)),files:evidence};
  const destination=path.join(root,'artifacts',`app-archive-${version}.json`);
  await fs.writeFile(destination,JSON.stringify(result,null,2)+'\n');
  console.log(`Actual archive: ${evidence.length} source files match; ${destination}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
