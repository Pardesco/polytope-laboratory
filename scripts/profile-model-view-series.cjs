// Run only after baseline reproduction, implementation, and packaging have finished.
// Usage: node scripts/profile-model-view-series.cjs <baseline unpacked exe> <candidate unpacked exe>
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function main(){
  const executables=process.argv.slice(2,4);assert.equal(executables.length,2);
  const options=process.argv.slice(4),navigation=options.includes('--navigation');
  const versions=require('./model-view-profile-versions.cjs').profileVersions(options.filter(option=>option!=='--navigation'));
  for(const executable of executables){assert.ok(path.isAbsolute(executable));await fs.access(executable);}
  const folder=await fs.mkdtemp(path.join(root,'artifacts/model-view-series-')),files=[];
  try{
    for(const workload of ['absent','annotated','emptied'])for(let run=0;run<5;run++)for(let version=0;version<2;version++){
      const label=`${workload}-${run}-${versions[version]}`,args=['scripts/profile-model-view.cjs',`--workload=${workload}`,`--version=${versions[version]}`,...version===0?['--baseline']:[],...navigation?['--navigation']:[]];
      console.log('Starting',label);let stdout='',stderr='';
      const code=await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...process.env,POLYTOPE_TEST_EXECUTABLE:executables[version]},stdio:['ignore','pipe','pipe']});
        child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.once('error',reject);child.once('close',resolve);
      });
      await fs.writeFile(path.join(folder,label+'.log'),stdout+'\n'+stderr,{flag:'wx'});assert.equal(code,0,label+' failed; preserve artifacts and stop');
      const result=JSON.parse(stdout),file=path.relative(root,path.join(result.folder,'result.json')).split(path.sep).join('/');files.push(file);
      await fs.writeFile(path.join(folder,label+'.json'),JSON.stringify({label,file},null,2),{flag:'wx'});
    }
    const index=path.join(folder,'ordered-runs.json');await fs.writeFile(index,JSON.stringify(files,null,2),{flag:'wx'});
    console.log('Thirty sequential profiles finished. Compare with: node scripts/compare-model-view-profiles.cjs "'+index+'" --baseline-version='+versions[0]+' --candidate-version='+versions[1]);
  }catch(error){await fs.writeFile(path.join(folder,'failure.json'),JSON.stringify({error:error.stack,completed:files},null,2),{flag:'wx'});throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
