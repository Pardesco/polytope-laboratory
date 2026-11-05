// Pure metadata matching. No browser, renderer, file import or GPU measurement.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {compileCatalogQuery} from '../ui/catalog-query.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
assert.ok(process.argv[2],'Pass the preserved pre-change catalog-query.mjs');
const baseline=path.resolve(root,process.argv[2]),old=await import(pathToFileURL(baseline));
const output=fs.mkdtempSync(path.join(root,'artifacts','catalog-query-profile-'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const result={passed:false,scope:'CPU-only catalog metadata filtering: saved pre-change matcher versus current prepared queries. Built-in registry plus explicitly synthetic linked metadata; no UI/DOM/native import timing.',
  platform:os.platform()+' '+os.release(),node:process.version,cpu:os.cpus()[0]?.model,sources:{},samples:[]};
for(const file of ['ui/catalog-query.mjs','scripts/profile-catalog-query.mjs'])result.sources[file]=hash(fs.readFileSync(path.join(root,file)));
result.baseline={path:baseline,sha256:hash(fs.readFileSync(baseline))};
try{
  const raw=execFileSync(process.env.POLYTOPE_PYTHON||'python',['-B','-c','import json; from engine.catalog import get_catalog; print(json.dumps(get_catalog()))'],
    {cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  const registry=JSON.parse(raw),synthetic=Array.from({length:10000},(_,i)=>({key:'synthetic-'+i,name:'Linked model '+i,relativePath:(i%10)+'/'+i+'.off',family:'Linked OFF',
    dimension:i%2?4:3,counts:[2+i%200,12+i%100,6+i%20,i%2?8:0],external:true,auditStatus:i%3?'untested':'passed',aliases:['metadata record '+i]}));
  const datasets={'built-in':registry,'synthetic-linked-10000':synthetic},queries=['','dim:4 v>=24','"model" v>=24','snub reflected','v<=16 e>=8','"4D"'];
  const inputs=JSON.stringify({datasets,queries});fs.writeFileSync(path.join(output,'inputs.json'),inputs);result.inputSha256=hash(inputs);
  result.entryCounts=Object.fromEntries(Object.entries(datasets).map(([name,entries])=>[name,entries.length]));
  const expected={};
  for(const [dataset,entries] of Object.entries(datasets))for(const query of queries){
    const key=JSON.stringify([dataset,query]);expected[key]=entries.filter(entry=>old.catalogMatches(entry,query)).map(entry=>entry.key);
    for(let run=-1;run<7;run++)for(const mode of run%2?['prepared','before']:['before','prepared']){
      const start=performance.now();
      const matches=mode==='before'?entries.filter(entry=>old.catalogMatches(entry,query)):entries.filter(compileCatalogQuery(query));
      const ms=performance.now()-start;assert.deepEqual(matches.map(entry=>entry.key),expected[key]);
      if(run>=0)result.samples.push({dataset,query,run,mode,ms,count:matches.length});
    }
  }
  fs.writeFileSync(path.join(output,'matched-keys.json'),JSON.stringify(expected));
  result.comparisons=Object.keys(expected).map(key=>{
    const [dataset,query]=JSON.parse(key),comparison={dataset,query,count:expected[key].length};
    for(const mode of ['before','prepared']){
      const values=result.samples.filter(s=>s.dataset===dataset&&s.query===query&&s.mode===mode).map(s=>s.ms).sort((a,b)=>a-b);
      comparison[mode]={medianMs:values[3],iqrMs:(values[4]+values[5])/2-(values[1]+values[2])/2};
    }
    return comparison;
  });result.passed=true;
}catch(error){result.error=error.stack;process.exitCode=1;}
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,passed:result.passed,entryCounts:result.entryCounts,comparisons:result.comparisons?.filter(c=>c.query===''||c.query==='dim:4 v>=24'),error:result.error},null,2));
