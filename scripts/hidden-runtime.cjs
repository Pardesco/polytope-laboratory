// Read-only preflight. A passing actual canary is still required for execution.
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs');
const path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const desktopSourceFiles=['desktop/main.cjs','desktop/engine-allowlist.cjs','desktop/ipc-handlers.cjs','desktop/dialogs.cjs','desktop/menu.cjs'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(file))digest.update(chunk);
  return digest.digest('hex');
}
async function hiddenRuntime(packaged=process.env.POLYTOPE_TEST_EXECUTABLE,expected=require('../package.json').version){
  const source=await fs.readFile(path.join(root,'desktop','main.cjs'));
  const sourceHashes=Object.fromEntries(await Promise.all(desktopSourceFiles.map(async file=>[file,hash(await fs.readFile(path.join(root,file)))])));
  if(!packaged)return {packaged:false,executablePath:require('electron'),
    mainSha256:hash(source),sourceHashes,version:expected};
  if(!path.isAbsolute(packaged))throw Error('Packaged hidden runtime requires an absolute unpacked executable path.');
  const executablePath=path.resolve(packaged),archivePath=path.join(path.dirname(executablePath),'resources','app.asar');
  if(!(await fs.stat(executablePath)).isFile())throw Error('Hidden runtime executable must be a file.');
  // Portable wrappers have no adjacent archive and must never be launched here.
  try{await fs.access(archivePath);}catch{
    throw Error('Hidden canary requires adjacent resources/app.asar; portable outer wrappers are refused.');
  }
  const asar=require('@electron/asar');
  const main=asar.extractFile(archivePath,'desktop/main.cjs');
  const metadata=JSON.parse(asar.extractFile(archivePath,'package.json').toString('utf8'));
  if(hash(main)!==hash(source))throw Error('Packaged hidden window policy differs from current qualified source.');
  for(const file of desktopSourceFiles){
    let bytes;
    try{bytes=asar.extractFile(archivePath,file);}catch{throw Error('Packaged hidden window policy differs: missing '+file);}
    if(hash(bytes)!==sourceHashes[file])throw Error('Packaged hidden window policy differs: '+file);
  }
  if(metadata.version!==expected)throw Error('Packaged hidden runtime version differs from the current candidate.');
  return {packaged:true,executablePath,archivePath,mainSha256:hash(main),sourceHashes,version:metadata.version,
    executableSha256:await hashFile(executablePath),archiveSha256:await hashFile(archivePath)};
}
module.exports={hiddenRuntime,hashFile,desktopSourceFiles};
