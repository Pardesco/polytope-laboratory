const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(value).digest('hex');
const active=project=>{const doc=project.documents[project.active];assert.ok(doc,'Active document');return doc.states[doc.cursor];};
const geometry=model=>Object.fromEntries(['dimension','embeddingDimension','interpretation','vertices','edges','faces','cells'].map(key=>[key,model[key]]));
function sameGeometry(actual,expected){assert.deepEqual(geometry(actual),geometry(expected),'Literal coordinates and ordered incidence must survive history');}
function parseArgs(args){
  const options={mode:'hidden',scales:[1,1.5,2]};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--plan'||key==='--help'){options[key.slice(2)]=true;continue;}
    if(!['--candidate','--exe-sha256','--archive-sha256','--output','--mode','--scales'].includes(key))throw Error('Unknown argument: '+key);
    if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+key);
    options[key.slice(2)]=args[++i];
  }
  assert.ok(['hidden','visible','both'].includes(options.mode),'Mode must be hidden, visible or both');
  if(typeof options.scales==='string')options.scales=options.scales.split(',').map(Number);
  assert.ok(options.scales.length&&new Set(options.scales).size===options.scales.length&&options.scales.every(n=>[1,1.5,2].includes(n)),'Scales must be distinct values from 1,1.5,2');
  if(!options.plan&&!options.help){
    assert.ok(options.candidate&&path.isAbsolute(options.candidate),'--candidate must name an absolute unpacked packaged executable');
    for(const key of ['exe-sha256','archive-sha256'])assert.match(options[key]??'',/^[a-f0-9]{64}$/i,'Provide pinned --'+key);
  }
  return options;
}
const runs=options=>(options.mode==='both'?['visible','hidden']:[options.mode]).flatMap(mode=>options.scales.map(scale=>({mode,scale,id:mode+'-'+String(scale).replace('.','_')})));
async function manifest(root,folders){
  const files={};
  async function visit(relative){
    const location=path.join(root,relative),stat=await fs.lstat(location);
    assert.equal(stat.isSymbolicLink(),false,'Freeze manifest refuses symbolic links: '+location);
    if(stat.isDirectory()){
      for(const name of (await fs.readdir(location)).sort())if(!['__pycache__','.pytest_cache'].includes(name))await visit(path.join(relative,name));
    }else if(stat.isFile())files[relative.replaceAll('\\','/')]=hash(await fs.readFile(location));
  }
  for(const folder of folders)await visit(folder);
  return files;
}
function assertFrozen(before,after){assert.deepEqual(after,before,'Candidate or shared sources changed during qualification; discard these receipts');}
async function artifact(file){const bytes=await fs.readFile(file);assert.ok(bytes.length,'Empty output: '+file);return {file,bytes:bytes.length,sha256:hash(bytes)};}
function inspectOutput(format,bytes,model){
  if(format==='json'){const value=JSON.parse(bytes.toString());sameGeometry(value,model);return {format,vertices:value.vertices.length,faces:value.faces.length};}
  if(format==='off'){
    const lines=bytes.toString().split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
    assert.match(lines[0],/^(4?OFF)$/);const counts=lines[1].split(/\s+/).map(Number);
    assert.equal(counts[0],model.vertices.length);assert.equal(counts[1],model.faces.length);
    assert.deepEqual(lines.slice(2,2+counts[0]).map(s=>s.split(/\s+/).map(Number)),model.vertices);
    assert.deepEqual(lines.slice(2+counts[0],2+counts[0]+counts[1]).map(s=>{const n=s.split(/\s+/).map(Number);return n.slice(1,1+n[0]);}),model.faces);
    return {format,counts};
  }
  if(format==='stl'){assert.ok(bytes.length>=84);const triangles=bytes.readUInt32LE(80);assert.equal(bytes.length,84+triangles*50);assert.ok(triangles>0);return {format,triangles};}
  if(format==='glb'){assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);const length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);const scene=JSON.parse(bytes.toString('utf8',20,20+length));assert.ok(scene.meshes?.length);assert.ok(scene.accessors?.some(a=>a.count>0));return {format,meshes:scene.meshes.length};}
  if(format==='dxf'){
    const values=bytes.toString().trim().split(/\r?\n/),entities=[];assert.equal(values.length%2,0);
    for(let i=0;i<values.length;i+=2)if(values[i].trim()==='0')entities.push(values[i+1].trim());
    assert.equal(entities.filter(e=>e==='3DFACE').length,model.faces.length);assert.ok(entities.includes('EOF'));
    return {format,faces:entities.filter(e=>e==='3DFACE').length};
  }
  if(format==='png'){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.ok(width>0&&height>0);return {format,width,height};}
  if(format==='webm'){assert.equal(bytes.readUInt32BE(0),0x1a45dfa3);assert.ok(bytes.length>1000);return {format,container:'EBML; codec/frame decoding belongs to R7-MEDIA'};}
  if(format==='svg'){assert.match(bytes.toString(),/<svg\b/);assert.match(bytes.toString(),/(?:polygon|path|line)\b/);return {format};}
  throw Error('No output checker for '+format);
}
async function expertOff(page){
  const proof=await page.evaluate(()=>({expert:document.body.classList.contains('expert-mode'),violations:window.commonQualification?.expertViolations??[]}));
  assert.equal(proof.expert,false,'Expert mode must stay OFF, including hidden startup');assert.deepEqual(proof.violations,[],'Expert mode was enabled transiently');
}
async function strictReveal(page,selector){
  await expertOff(page);const target=page.locator(selector);assert.equal(await target.count(),1,'Retained unique target: '+selector);
  const expert=await target.evaluate(node=>!!node.closest('[data-expert]'));assert.equal(expert,false,'Common workflow requires an Expert control: '+selector);
  await target.evaluate(element=>{
    element.dispatchEvent(new Event('app-chrome-reveal',{bubbles:true}));
    if(element.closest('[data-construct-tool]'))window.openConstructTool?.(element,{focus:false});
    const chain=[];for(let node=element.closest('details');node;node=node.parentElement?.closest('details')){
      if(node.querySelector(':scope > summary')?.contains(element))continue;chain.unshift(node);
    }
    for(const node of chain)if(!node.open)node.open=true;
  });
  await expertOff(page);assert.equal(await target.isVisible(),true,'Common target remains hidden: '+selector);
  await target.scrollIntoViewIfNeeded();return target;
}
module.exports={hash,active,geometry,sameGeometry,parseArgs,runs,manifest,assertFrozen,artifact,inspectOutput,expertOff,strictReveal};
