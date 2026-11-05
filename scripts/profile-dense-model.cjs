// Headless actual Viewer CPU paths; no Electron, WebGL, IPC or FPS measurement.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
async function main(){
  const root=path.resolve(__dirname,'..'),option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
  if(option('snapshot')){
    const folder=path.resolve(option('snapshot'));fs.mkdirSync(folder,{recursive:true});
    for(const name of ['selection-highlight.mjs','viewer.js']){
      const source=fs.readFileSync(path.join(root,'ui',name),'utf8').replace(/from ['"]\.\/([^'"]+)['"]/g,(_,n)=>`from '${pathToFileURL(path.resolve(n==='selection-highlight.mjs'?path.join(folder,n):path.join(root,'ui',n))).href}'`);
      fs.writeFileSync(path.join(folder,name.replace(/\.js$/,'.mjs')),source);
    }
    console.log(folder);return;
  }
  const {benchmarkModel,DENSE_KEYS}=await import('./dense-model-benchmark.mjs');
  const output=path.resolve(option('output')||'artifacts/dense-current.json');fs.mkdirSync(path.dirname(output),{recursive:true});
  let ViewerClass;
  if(option('viewer'))({Viewer:ViewerClass}=await import(pathToFileURL(path.resolve(option('viewer')))));
  const corpus=path.resolve(option('corpus')||'artifacts/dense-corpus');
  const keys=option('keys')?.split(',')||DENSE_KEYS;
  const result={scope:'Headless Node CPU wall time, real Viewer geometry and Three math with fake renderer. Stereographic synchronous fallback includes worker math/validation/packing. Excludes GPU, Electron, IPC, worker scheduling and native construction/type classification. Synthetic two-group palettes exercise renderer type recoloring only.',
    node:process.version,platform:os.platform()+' '+os.release(),cpu:os.cpus()[0]?.model,samples:Number(option('samples')||9),warmup:Number(option('warmup')||3),cases:[],
    sourceHashes:Object.fromEntries(['ui/viewer.js','ui/selection-highlight.mjs','ui/entity-picking.mjs','ui/display-frame.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(option('viewer')&&f==='ui/viewer.js'?option('viewer'):path.join(root,f))).digest('hex')]))};
  for(const key of keys){
    const model=JSON.parse(fs.readFileSync(path.join(corpus,key+'.json'),'utf8'));
    const entry=benchmarkModel(model,{ViewerClass,samples:result.samples,warmup:result.warmup});result.cases.push({key,...entry});
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(key,entry.rows.filter(r=>r.task==='rotation').map(r=>r.projection+': '+r.median.toFixed(3)+' ms').join(', '));
  }
  console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
