// Usage: node scripts/compare-model-view-profiles.cjs <ordered run-index.json>
// The index is an array of result.json paths in actual execution order.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {distribution,cpuTime,quantile,navigationMetrics,navigationComparison}=require('./model-view-profile-metrics.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  const versions=require('./model-view-profile-versions.cjs').profileVersions(process.argv.slice(3));
  const files=JSON.parse(await fs.readFile(process.argv[2],'utf8')),samples=[];
  assert.equal(files.length,30,'Require five alternating pairs for each of three workloads');
  for(let i=0;i<files.length;i++){
    const file=path.resolve(root,files[i]),result=JSON.parse(await fs.readFile(file,'utf8'));
    const expected=versions[i%2];
    assert.equal(result.version,expected);assert.equal(result.passed,true);assert.equal(result.packaged,true);assert.equal(result.developmentPythonDisabled,true);
    assert.equal(result.workload,['absent','annotated','emptied'][Math.floor(i/10)]);
    assert.equal(result.rotations.length,1);const rotation=result.rotations[0];assert.equal(rotation.visibility,'visible');
    const cpu=JSON.parse(await fs.readFile(path.join(path.dirname(file),'rotation.cpuprofile'),'utf8'));
    samples.push({file:files[i],version:result.version,workload:result.workload,...cpuTime(cpu),longTaskCount:rotation.longTasks.length,rafMedianMs:quantile(rotation.rafIntervalsMs,.5),rafP95Ms:quantile(rotation.rafIntervalsMs,.95),durationMs:rotation.durationMs,hardware:result.hardware,navigation:navigationMetrics(result)});
  }
  assert.ok(samples.every(s=>JSON.stringify(s.hardware)===JSON.stringify(samples[0].hardware)),'Require identical hardware');
  const navigationGroups=navigationComparison(samples,versions);
  const groups={};for(const workload of ['absent','annotated','emptied']){
    groups[workload]={};for(const version of versions){
      const group=samples.filter(s=>s.version===version&&s.workload===workload);
      groups[workload][version]=Object.fromEntries(['sampledNonIdleMs','longTaskCount','rafMedianMs','rafP95Ms'].map(k=>[k,distribution(group.map(s=>s[k]))]));
    }
  }
  const comparison={passed:true,versions,hardware:samples[0].hardware,groups,navigationGroups,samples,scope:'Five sequential alternating pairs per workload, fresh isolated profiles, actual bundled engine. Optional navigation precedes annotation edits and summarizes per-run medians over four revisits/model. V8 non-idle includes program/native waiting; RAF is vsync-capped. No FPS, isolated GPU time or OS CPU utilization claim.'};
  await fs.writeFile(path.join(root,'artifacts',`model-view-comparison-${versions[1]}.json`),JSON.stringify(comparison,null,2),{flag:'wx'});
  console.log(JSON.stringify(groups,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
