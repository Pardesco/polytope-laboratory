// Verify current source bytes against a new local package; never replace receipts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),version=pkg.version;
const release=path.join(root,'release','preview-'+version),archive=path.join(release,'win-unpacked','resources','app.asar');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function main(){
  const files=[];function visit(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const file=path.join(relative,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile())files.push(file);else throw Error('Unexpected source entry: '+file);}}
  visit('desktop');visit('dist');files.push('LICENSE','THIRD_PARTY_NOTICES.md');
  const hashes={};for(const file of files){const key=file.split(path.sep).join('/'),source=fs.readFileSync(path.join(root,file));assert.deepEqual(asar.extractFile(archive,file),source,key+' differs from current source');hashes[key]=hash(source);}
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json').toString()).version,version);
  const lock=require('../package-lock.json');assert.equal(lock.version,version);assert.equal(lock.packages[''].version,version);
  const freezeFile=path.join(root,'artifacts',`preview-build-source-${version}.json`),frozen=JSON.parse(fs.readFileSync(freezeFile));assert.equal(frozen.version,version);
  for(const [file,expected] of Object.entries(frozen.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(root,file))),expected,'Frozen runtime source changed: '+file);
  const protectedHashes={'__init__.py':'386c22bb99742201703c33eba63836bd0bebcccff37107c67a06b139fd0e5923','formats.py':'fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23','geometry.py':'9a9a1243223ca38aabce4bc762cbd463939a177f104bfa08c4ada81774b85414'};
  for(const [file,expected] of Object.entries(protectedHashes))assert.equal(hash(fs.readFileSync(path.join(root,'engine',file))),expected);
  const executable=path.join(release,`Polytope Laboratory ${version} preview.exe`),sha256=hash(fs.readFileSync(executable)),receipts=[];
  for(const name of process.argv.slice(2)){
    const file=path.resolve(root,name);assert.ok(file.startsWith(path.join(root,'artifacts')+path.sep),'Use local artifact receipts');const proof=JSON.parse(fs.readFileSync(file));assert.equal(proof.passed,true);assert.equal(proof.version,version);
    assert.ok(proof.baseline===undefined||proof.baseline===false,'Use a qualification receipt; baseline observations are not accepted.');
    if(proof.executable){assert.equal(path.resolve(proof.executable),executable);assert.equal(proof.sha256,sha256);}
    receipts.push(path.relative(root,file).split(path.sep).join('/'));
  }
  const result={version,packagedSourceMatches:true,verifiedFiles:files.length,hashes,frozenRuntimeInputsMatchCurrent:Object.keys(frozen.sourceHashes).length,protectedImporterHashes:protectedHashes,executable,bytes:fs.statSync(executable).size,sha256,receipts};
  fs.writeFileSync(path.join(release,'verification.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify({version,verifiedFiles:files.length,frozenInputs:result.frozenRuntimeInputsMatchCurrent,bytes:result.bytes,sha256,receipts},null,2));
}
try{main();}catch(error){console.error(error);process.exitCode=1;}
