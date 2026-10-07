const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const destination=path.join(root,'build','desktop-app');
  // Resolve and verify the exact staging subtree before recursive cleanup.
  // Old Vite asset names must not accumulate in subsequent portable builds.
  const buildRoot=path.resolve(root,'build');
  const resolved=path.resolve(destination);
  if(path.dirname(resolved)!==buildRoot||path.basename(resolved)!=='desktop-app')throw new Error('Invalid application staging directory.');
  await fs.rm(resolved,{recursive:true,force:true});
  await fs.mkdir(destination,{recursive:true});
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await fs.copyFile(path.join(root,name),path.join(destination,name));
  for(const directory of ['desktop','dist','third_party_licenses'])await fs.cp(path.join(root,directory),path.join(destination,directory),{recursive:true,force:true});
  await fs.writeFile(path.join(destination,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,main:pkg.main,license:pkg.license,private:true,author:'Polytope Laboratory'},null,2));
  console.log('Prepared application staging directory.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
