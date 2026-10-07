// SPDX-License-Identifier: GPL-3.0-only
// Build a community preview without replacing qualified historical artifacts.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
async function execute(command,args){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:'inherit'});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(command+' exited '+code)));
  });
}
async function main(){
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const staging=path.join(root,'build','preview-'+pkg.version),output=path.join(root,'release','preview-'+pkg.version);
  const expected=path.join(output,`Polytope Laboratory ${pkg.version} preview.exe`);
  if(await fs.stat(expected).then(()=>true,()=>false))throw Error('Preview already exists; preserve it or increment the version.');
  await fs.mkdir(staging,{recursive:true});
  await execute(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--configLoader','native']);
  const data=['__init__.py','formats.py','geometry.py','regular4d_validation.py'].flatMap(name=>['--add-data',path.join(root,'engine',name)+';engine']);
  await execute(process.env.POLYTOPE_PYTHON||'python',['-m','PyInstaller','--noconfirm','--onedir',...['pytest','matplotlib','PyQt5','pandas','IPython','tkinter'].flatMap(name=>['--exclude-module',name]),...data,'--add-data',path.join(root,'engine/catalog_data')+';engine/catalog_data','--copy-metadata','numpy','--copy-metadata','scipy','--name','polytope-engine','--distpath',path.join(staging,'engine'),'--workpath',path.join(staging,'pyinstaller'),'--specpath',staging,path.join(root,'engine/server.py')]);
  const application=path.join(staging,'desktop-app');await fs.mkdir(application,{recursive:true});
  for(const directory of ['desktop','dist','third_party_licenses'])await fs.cp(path.join(root,directory),path.join(application,directory),{recursive:true});
  for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await fs.copyFile(path.join(root,name),path.join(application,name));
  await fs.writeFile(path.join(application,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,description:pkg.description,main:pkg.main,license:pkg.license,author:'Polytope Laboratory'}));
  const config={...pkg.build,directories:{app:application,output},extraResources:[{from:path.join(staging,'engine/polytope-engine'),to:'engine'}],artifactName:'${productName} ${version} preview.${ext}'};
  const configuration=path.join(staging,'electron-builder.json');await fs.writeFile(configuration,JSON.stringify(config,null,2));
  await execute(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--config',configuration,'--win','portable','--x64']);
  console.log('Community preview:',expected);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
