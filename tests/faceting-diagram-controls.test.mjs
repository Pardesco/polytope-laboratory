import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FacetingDiagramControls,checkedDiagramSVG} from '../ui/faceting-diagram-controls.mjs';
import {sourceContext,deferred,tick} from './construction-controls-fixture.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const clone=structuredClone;

class Element{
  constructor(tag='div'){this.tagName=tag;this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent='';this.dataset={};this.children=[];this.nodes={};}
  set innerHTML(text){for(const m of text.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"[^>]*>/g)){
    const n=new Element(m[1]);n.id=m[2];n.checked=/\schecked(?:\s|>)/.test(m[0]);this.nodes[n.id]=n;}}
  querySelector(selector){return this.nodes[selector.slice(1)];}
  querySelectorAll(){return Object.values(this.nodes);}
  replaceChildren(...nodes){this.children=nodes;this.value='';}
  append(node){this.children.push(node);}
  after(node){this.sibling=node;}
}
// This supplies DOM-shaped nodes to exercise the whitelist and controller
// logic headlessly; it is not a browser/XML-parser conformance test.
class FixtureParser{
  parseFromString(text){
    const nodes=Array.from(text.matchAll(/<(\w+)\b([^>]*)>/g),m=>({localName:m[1],namespaceURI:'http://www.w3.org/2000/svg',
      attributes:Array.from(m[2].matchAll(/([\w:-]+)="([^"]*)"/g),a=>({name:a[1],value:a[2]}))}));
    const root=nodes[0]??{localName:'invalid'};root.querySelectorAll=()=>nodes.slice(1);
    return {documentElement:root,querySelector:()=>null};
  }
}
globalThis.DOMParser=FixtureParser;
function native(request,{signal}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe'],signal});
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);
    child.on('close',code=>{try{if(code)throw Error(stderr);const response=JSON.parse(stdout);if(!response.ok)throw Error(response.error);resolve(response.result);}catch(e){reject(e);}});
    child.stdin.end(JSON.stringify(request)+'\n');
  });
}
async function fixture({model,poolParams={}}={}){
  const owner=sourceContext(3);Object.assign(owner.getState().model,{name:'Literal tetra','interpretation':'generalized-complex',numeric:{mode:'float64-approximate',certified:false}});
  if(model)owner.getState().model=clone(model);
  const source=owner.getState().model,pool=await native({op:'facet-candidates',model:source,params:poolParams});
  const cycleKey=cycle=>{const versions=[];for(const row of [cycle,[...cycle].reverse()])for(let i=0;i<row.length;i++)versions.push(JSON.stringify([...row.slice(i),...row.slice(0,i)]));return versions.sort()[0];};
  const keys=new Set(source.faces.map(cycleKey)),candidate_ids=pool.candidates.filter(row=>keys.has(cycleKey(row.cycle))).map(row=>row.id);
  const search=await native({op:'facet-search',model:source,params:{...poolParams,candidate_ids}});
  const published=[],saved=[],reads=[],previews=[];let searchForm='initial search controls';
  globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>new Element('details'),importNode:node=>node};
  const context={...owner,guard:fn=>fn,evaluateMany:async strings=>strings.map(Number),catalogue:()=>pool,
    selectedResult:()=>({search:clone(search),result_id:search.results[0].id}),searchSignature:()=>searchForm,
    read:async(op,params,source,options)=>{options.verifyPublication();reads.push([op,params,source]);return native({op,model:source,params},{signal:options.signal});},
    commit:async(op,params,label,options)=>{options.verifyPublication();published.push([op,params,label]);},
    save:async(value,options)=>{options.verifyPublication();saved.push(value);owner.getState().view.facetingDiagram=value;},
    preview:async(model,options)=>{options.verifyPublication();previews.push(model);},clearPreview:()=>previews.push('cleared')};
  const controls=new FacetingDiagramControls(context);
  return {controls,context,owner,source,pool,search,published,saved,reads,previews,setSearchForm:v=>searchForm=v};
}

test('actual copied constructor + native tetra draft drawing preserves geometry/source and cannot adopt',async()=>{
  const f=await fixture(),before=clone(f.owner.getState());assert.equal(f.controls.panel.id,'faceting-diagram-settings');
  await f.controls.node('build').onclick();assert.equal(f.controls.node('chart').hidden,false);
  assert.equal(f.controls.reply.diagram.mainVertexId,0);assert.equal(f.controls.reply.diagram.lines.length,3);
  assert.equal(f.controls.node('adopt').disabled,true);assert.deepEqual(f.owner.getState(),before);
  await assert.rejects(f.controls.apply('adopt'),/Draft/);assert.equal(f.published.length,0);
});

test('linked selected native result previews and uses unchanged recorded facet-adopt recipe parameters',async()=>{
  const f=await fixture();f.controls.node('link').checked=true;await f.controls.apply('build');
  const args=clone(f.controls.reply.adoptionParameters);assert.equal(f.previews[0].faces.length,4);
  assert.equal(f.controls.node('adopt').disabled,false);await f.controls.apply('adopt');
  assert.equal(f.published[0][0],'facet-adopt');assert.deepEqual(f.published[0][1],args);
  assert.equal(f.controls.reply,null);assert.deepEqual(f.source.faces,[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]);
});

test('diagram save/restore keeps main vertex/reflections/selected result and restores only explicitly',async()=>{
  const f=await fixture();f.controls.node('vertex').value='2';f.controls.node('link').checked=true;f.controls.node('reflections').checked=false;
  await f.controls.apply('build');await f.controls.apply('save');
  assert.equal(f.saved[0].parameters.vertex_id,2);assert.equal(f.saved[0].kernelVersion,'0.1.0');
  f.controls.invalidate();assert.equal(f.controls.reply,null);assert.equal(f.controls.node('restore').disabled,false);
  await f.controls.apply('restore');assert.equal(f.controls.node('vertex').value,'2');assert.equal(f.controls.node('link').checked,true);
  assert.equal(f.controls.node('reflections').checked,false);assert.equal(f.controls.reply.diagram.mainVertexId,2);
});

test('plane/candidate/native vertex picks use receipt ownership and explicit disambiguation',async()=>{
  const f=await fixture();await f.controls.apply('build');const line=f.controls.reply.diagram.lines[0];
  const pick=attributes=>({target:{closest:()=>({getAttribute:key=>attributes[key]??null})}});
  f.controls.pick(pick({'data-plane-id':line.planeId}));assert.match(f.controls.node('pick').textContent,/explicit candidate/);
  assert.equal(f.controls.node('cycle').children.length,line.candidateIds.length);
  assert.equal(f.controls.node('cycle').disabled,false);assert.equal(f.controls.node('add-cycle').disabled,false);
  f.controls.editPicked(false);assert.equal(f.controls.reply,null);assert.equal(f.controls.node('seeds').value,line.candidateIds[0]);
  await f.controls.apply('build');assert.equal(f.controls.reply.diagram.selection.facets.length,1);
  const selected=f.controls.reply.diagram.lines.find(row=>row.selectedCandidateIds.length);
  f.controls.pick(pick({'data-plane-id':selected.planeId,'data-candidate-id':selected.selectedCandidateIds[0]}));
  f.controls.editPicked(true);assert.equal(f.controls.node('seeds').value,'');await f.controls.apply('build');
  f.controls.pick(pick({'data-source-vertex-id':'1'}));assert.equal(f.controls.node('vertex').value,'1');assert.equal(f.controls.reply,null);
  assert.equal(f.controls.node('save').disabled,true);assert.equal(f.controls.node('adopt').disabled,true);
  await f.controls.apply('build');assert.equal(f.controls.reply.diagram.mainVertexId,1);
  assert.throws(()=>f.controls.pick(pick({'data-source-vertex-id':'999'})),/owner/);
});

for(const phase of ['expression','native'])for(const change of ['unit','notes','RGBA','source','document','project','form','search','export','cancel']){
  test(`held ${phase} ${change} refuses publication without mutation`,async()=>{
    const f=await fixture(),held=deferred(),before=clone(f.source);let entered=false;
    if(phase==='expression')f.context.evaluateMany=async()=>{entered=true;return held.promise;};
    else f.context.read=async()=>{entered=true;return held.promise;};
    const action=f.controls.apply('build');await tick();assert.ok(entered);
    if(change==='unit')f.owner.getState().view.coordinateUnit='cm';
    else if(change==='notes')f.owner.getState().notes='different';
    else if(change==='RGBA')f.source.metadata.offColors.faces[0].values[3]=.1;
    else if(change==='source')f.owner.setState({...f.owner.getState(),model:clone(f.source)});
    else if(change==='document')f.owner.swapDocument();
    else if(change==='project')f.owner.swapProject();
    else if(change==='form')f.controls.node('reflections').checked=false;
    else if(change==='search')f.setSearchForm('altered search');
    else if(change==='export')f.owner.setExport(true);
    else f.controls.cancel();
    const failed=assert.rejects(action,/changed|export|canceled|ownership/i);
    if(phase==='expression')held.resolve([0]);
    else held.resolve({diagram:{status:'complete'},svg:'<svg/>',state:{}});
    await failed;assert.equal(f.controls.reply,null);assert.equal(f.published.length,0);assert.equal(f.saved.length,0);
    if(change!=='RGBA')assert.deepEqual(f.source,before);
  });
}

test('held native observer camera motion is allowed while unit/form ownership remains bound',async()=>{
  const f=await fixture(),held=deferred();const actual=f.context.read;let started;
  f.context.read=async(...args)=>{started=args;return held.promise;};const job=f.controls.apply('build');await tick();
  f.owner.getState().view.camera.zoom=2;f.owner.getState().view.angles[0]=45;
  const reply=await actual(...started);held.resolve(reply);await job;assert.equal(f.controls.reply.diagram.status,'complete');
});

test('stale saved source and changed search refuse restoration/adoption; malformed vertex IDs stay literal',async()=>{
  const f=await fixture();f.controls.node('link').checked=true;await f.controls.apply('build');await f.controls.apply('save');
  f.setSearchForm('changed criteria');await assert.rejects(f.controls.apply('adopt'),/changed/);
  f.source.metadata.coordinateUnits='cm';await assert.rejects(f.controls.apply('restore'),/source attributes/);
  for(const value of ['1+1','True','-1','2.5','999']){f.controls.node('vertex').value=value;await assert.rejects(f.controls.apply('build'),/literal/);}
  assert.equal(f.published.length,0);
});

test('SVG whitelist refuses executable/reference/foreign content before insertion',()=>{
  for(const svg of ['<svg><script/></svg>','<svg onload="x"><text>safe</text></svg>',
    '<svg><path style="fill:red"/></svg>','<svg><path href="file:///secret"/></svg>',
    '<svg><path fill="url(https://example.com/x)"/></svg>','<svg><foreignObject/></svg>'])
    assert.throws(()=>checkedDiagramSVG(svg),/Unsupported|executable|external/);
});

for(const operation of ['save','adopt'])for(const change of ['unit','notes','RGBA','form','search','export','cancel']){
  test(`held ${operation} callback verifies ${change} immediately before publication`,async()=>{
    const f=await fixture();f.controls.node('link').checked=true;await f.controls.apply('build');
    const held=deferred(),finished=deferred();let entered=false;
    const publish=async(value,options)=>{entered=true;try{await held.promise;options.verifyPublication();
      if(operation==='save'){f.saved.push(value);f.owner.getState().view.facetingDiagram=value;}else f.published.push(value);
      finished.resolve('published');}catch(error){finished.resolve(error.message);throw error;}};
    if(operation==='save')f.context.save=publish;
    else f.context.commit=async(op,params,label,options)=>publish(params,options);
    const action=f.controls.apply(operation);await tick();assert.ok(entered);
    if(change==='unit')f.owner.getState().view.coordinateUnit='cm';
    else if(change==='notes')f.owner.getState().notes='changed owner';
    else if(change==='RGBA')f.source.metadata.offColors.faces[0].values[3]=.125;
    else if(change==='form')f.controls.node('reflections').checked=false;
    else if(change==='search')f.setSearchForm('different selected retained result');
    else if(change==='export')f.owner.setExport(true);
    else f.controls.cancel();
    const failed=assert.rejects(action,/changed|export|canceled/i);held.resolve();await failed;
    assert.match(await finished.promise,/changed|export|canceled/i);
    assert.equal(f.published.length,0);assert.equal(f.saved.length,0);assert.equal(f.owner.getState().view.facetingDiagram,undefined);
    assert.equal(f.controls.reply,null);
  });
}

test('held linked preview uses publication fence and leaves no stale diagram or source edits',async()=>{
  const f=await fixture(),held=deferred(),finished=deferred(),before=clone(f.source);let entered=false;
  f.controls.node('link').checked=true;
  f.context.preview=async(model,options)=>{entered=true;try{await held.promise;options.verifyPublication();f.previews.push(model);finished.resolve('published');}
    catch(error){finished.resolve(error.message);throw error;}};
  const action=f.controls.apply('build');while(!entered)await tick();
  f.owner.getState().notes='new notes';const failed=assert.rejects(action,/changed/);held.resolve();await failed;
  assert.match(await finished.promise,/changed/);assert.equal(f.previews.length,0);assert.equal(f.controls.reply,null);
  assert.deepEqual(f.source,before);
});

test('reflected replica removal removes its actual seed orbit and forged plane linkage refuses atomically',async()=>{
  const vertices=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);
  const faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]],edges=[];
  for(const cycle of faces)for(let i=0;i<cycle.length;i++){const e=[cycle[i],cycle[(i+1)%cycle.length]].sort((a,b)=>a-b);if(!edges.some(row=>row[0]===e[0]&&row[1]===e[1]))edges.push(e);}
  const model={id:'literal-cube',name:'Literal cube',dimension:3,embeddingDimension:3,interpretation:'generalized-complex',
    vertices,edges,faces,cells:[],numeric:{mode:'float64-approximate',certified:false},metadata:{coordinateUnits:'mm'}};
  const mirror=vertices.map(([x,y,z])=>vertices.findIndex(p=>p[0]===y&&p[1]===x&&p[2]===z));
  const f=await fixture({model,poolParams:{symmetry_permutations:[vertices.map((_,i)=>i),mirror]}});
  const seed=f.pool.candidates.find(row=>row.sourceFaceIds.includes(0)).id;
  f.controls.node('seeds').value=seed;await f.controls.apply('build');
  assert.equal(f.controls.reply.diagram.selection.facets.length,2);
  const replica=f.controls.reply.diagram.lines.flatMap(line=>line.selectedCandidateIds.map(id=>({line,id}))).find(row=>row.id!==seed);
  assert.ok(replica);const pick=attributes=>({target:{closest:()=>({getAttribute:key=>attributes[key]??null})}});
  const before=clone(f.controls.reply);
  assert.throws(()=>f.controls.pick(pick({'data-plane-id':'plane-forged','data-candidate-id':replica.id})),/owned/);
  assert.deepEqual(f.controls.reply,before);assert.equal(f.controls.picked,undefined);
  f.controls.pick(pick({'data-plane-id':replica.line.planeId,'data-candidate-id':replica.id}));f.controls.editPicked(true);
  assert.equal(f.controls.node('seeds').value,'');await f.controls.apply('build');assert.equal(f.controls.reply.diagram.selection.facets.length,0);
});
