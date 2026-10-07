import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {AutomaticFacetingControls} from '../ui/automatic-faceting-controls.mjs';
import {sourceContext,deferred,tick} from './construction-controls-fixture.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
class Element{
  constructor(tag='div'){this.tagName=tag;this.value='';this.checked=false;this.disabled=false;this.hidden=false;
    this.textContent='';this.dataset={};this.children=[];this.nodes={};}
  set innerHTML(text){
    for(const match of text.matchAll(/<(\w+)\s+[^>]*id="([^"]+)"[^>]*>/g)){
      const node=new Element(match[1]);node.id=match[2];node.type=/type="([^"]+)"/.exec(match[0])?.[1]??'text';
      node.value=/value="([^"]+)"/.exec(match[0])?.[1]??'';this.nodes[node.id]=node;
    }
    this.nodes['faceting-criterion'].value='closed';this.nodes['faceting-equivalence'].value='labeled';
  }
  querySelector(selector){return this.nodes[selector.slice(1)];}
  querySelectorAll(selector){return Object.values(this.nodes).filter(node=>selector.startsWith('input:')?
    node.tagName==='input'&&node.type!=='checkbox':['button','input','select','textarea'].includes(node.tagName));}
  replaceChildren(){this.children=[];this.value='';}
  append(node){this.children.push(node);}
  after(node){this.sibling=node;}
}
function fixture(){
  const owner=sourceContext(3);owner.getState=()=>owner.getDocument().states[owner.getDocument().cursor];
  owner.setState=value=>{owner.getDocument().states[owner.getDocument().cursor]=value;};
  const source=owner.getState().model;
  Object.assign(source,{name:'Literal right tetrahedron',interpretation:'generalized-complex',numeric:{mode:'float64-approximate',certified:false}});
  const anchor=new Element('button');globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>anchor};
  const calls=[],published=[],previews=[];let clears=0;
  const candidates=source.faces.map((cycle,i)=>({id:'facet-'+String(i).padStart(64,'0'),planeId:'plane-'+i,cycle,sourceFaceIds:[i]}));
  const receipt={status:'complete',countMeaning:'exhausted recorded domain',limitReasons:[],
    phaseStatus:{candidateGeneration:'complete',symmetryAction:'complete',subsetSearch:'complete'},
    nodesVisited:31,labeledSelectionsAccepted:1,distinctResultsFound:1,domain:{maximumFaceVertices:8},
    results:[{id:'faceting-'+String(1).padStart(64,'0'),cycles:source.faces,
      symmetryEvidence:{faceTypeCount:4}}]};
  const previewModel={...structuredClone(source),metadata:{...structuredClone(source.metadata),
    facetingSymmetry:{faceTypeCount:4},facetingCriteria:{accepted:true},solidInterpretation:'No filled-volume claim'}};
  const context={...owner,guard:fn=>fn,evaluateMany:async strings=>{calls.push(['expression',...strings]);
    return strings.map(text=>text==='sqrt(4)'?2:text==='sqrt(16)'?4:text==='1+1'?2:Number(text));},
    read:async(op,params,source,options)=>{options.verifyPublication();calls.push([op,params,source,options]);
      return op==='facet-candidates'?{status:'complete',candidates,limitReasons:[]}:
        op==='facet-search'?receipt:previewModel;},
    commit:async(op,params,label,options)=>{options.verifyPublication();calls.push([op,params,label,options]);published.push(params);},
    preview:async(model,options)=>{options.verifyPublication();previews.push(model);},clearPreview:()=>{clears++;}};
  const controls=new AutomaticFacetingControls(context),nodes=controls.panel.nodes;
  return {controls,nodes,owner,context,calls,published,previews,receipt,candidates,previewModel,clears:()=>clears};
}
function native(request,{signal}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],
      {cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe'],signal});
    let stdout='',stderr='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',reject);
    child.on('close',code=>{try{if(code!==0)throw Error(stderr||'Native job canceled.');const response=JSON.parse(stdout);
      if(!response.ok)throw Error(response.error);resolve(response.result);}catch(error){reject(error);}});
    child.stdin.end(JSON.stringify(request)+'\n');
  });
}
async function prime(f){await f.controls.apply('search');assert.equal(f.nodes['faceting-result'].value,f.receipt.results[0].id);}

test('actual constructor mounts beside manual faceting, expression fields and guarded event handlers',async()=>{
  const f=fixture();assert.equal(f.controls.panel.id,'automatic-faceting-settings');
  assert.equal(f.nodes['faceting-max_face_vertices'].type,'text');
  assert.equal(f.nodes['faceting-adopt'].disabled,true);assert.equal(f.nodes['faceting-cancel'].disabled,true);
  await f.nodes['faceting-candidates'].onclick();assert.equal(f.controls.catalogue.candidates.length,4);
  f.nodes['faceting-source-faces'].onclick();assert.equal(f.nodes['faceting-pool'].value.split('\n').length,4);
  await f.nodes['faceting-search'].onclick();assert.equal(f.nodes['faceting-status'].dataset.status,'complete');
  assert.equal(f.nodes['faceting-adopt'].disabled,false);assert.equal(f.published.length,0);
  assert.equal(f.calls.find(call=>call[0]==='facet-search')[1].candidate_ids.length,4);
});

test('one expression batch preserves all count domains, options and literal source action/plane IDs',async()=>{
  const f=fixture();f.nodes['faceting-max_face_vertices'].value='sqrt(16)';
  f.nodes['faceting-min_face_types'].value='1+1';f.nodes['faceting-max_face_types'].value='1+1';
  f.nodes['faceting-actions'].value='[[0,1,2,3]]';f.nodes['faceting-plane-counts'].value='{"plane-literal":0}';
  f.nodes['faceting-partial'].checked=true;f.nodes['faceting-coplanar'].checked=true;f.nodes['faceting-invariant'].checked=true;
  await f.controls.apply('search');const [,params]=f.calls.find(call=>call[0]==='facet-search');
  assert.equal(f.calls.filter(call=>call[0]==='expression').length,1);assert.equal(params.max_face_vertices,4);
  assert.deepEqual(params.symmetry_permutations,[[0,1,2,3]]);
  assert.deepEqual(params.criteria,{accept_partial:true,coplanar_vertices:'allow',isohedral:false,
    plane_face_counts:{'plane-literal':0},min_face_types:2,max_face_types:2,max_faces_per_plane:0});
});

test('candidate generation ignores irrelevant search expression fields',async()=>{
  const f=fixture();f.nodes['faceting-min_face_types'].value='invalid';f.nodes['faceting-node_limit'].value='';
  await f.controls.apply('candidates');assert.ok(f.controls.catalogue);assert.equal(f.calls[0].length,4);
});

test('empty search and resource-limited search never automatically adopt or assert unbounded completeness',async()=>{
  const f=fixture();f.receipt.results=[];f.receipt.labeledSelectionsAccepted=0;f.receipt.distinctResultsFound=0;
  await f.controls.apply('search');assert.equal(f.nodes['faceting-adopt'].disabled,true);
  await assert.rejects(f.controls.apply('adopt'),/empty|Choose/);assert.equal(f.published.length,0);
  f.receipt.status='resource-limited';f.receipt.countMeaning='found lower bound; search not exhausted';f.receipt.limitReasons=['subset node cap'];
  await f.controls.apply('search');assert.match(f.nodes['faceting-status'].textContent,/lower bound.*not exhausted/);
  assert.equal(f.nodes['faceting-status'].dataset.status,'resource-limited');
});

test('preview is detached and explicit adoption alone commits the identical verified receipt and result',async()=>{
  const f=fixture();await prime(f);const before=structuredClone(f.owner.getProject());
  await f.controls.apply('preview');assert.deepEqual(f.owner.getProject(),before);assert.equal(f.previews.length,1);
  assert.equal(f.published.length,0);assert.match(f.nodes['faceting-evidence'].textContent,/No filled-volume claim/);
  await f.controls.apply('adopt');assert.equal(f.published.length,1);
  assert.deepEqual(f.published[0],{search:f.receipt,result_id:f.receipt.results[0].id});
  assert.equal(f.controls.search,null);assert.equal(f.controls.busy,false);
});

test('successful app workspace invalidation during commit does not turn published adoption into cancellation',async()=>{
  const f=fixture();await prime(f);
  f.context.commit=async(op,params,label,options)=>{options.verifyPublication();f.published.push(params);
    f.owner.setState({...f.owner.getState(),model:f.previewModel});f.controls.invalidate();};
  await f.controls.apply('adopt');assert.equal(f.published.length,1);assert.equal(f.controls.busy,false);
});

test('invalid counts, pools, JSON, unsupported criteria and source dimensions refuse atomically',async()=>{
  for(const [field,value] of [['faceting-max_face_vertices','sqrt(4)'],['faceting-node_limit','0'],
    ['faceting-result_limit','129'],['faceting-min_face_types','1.5'],['faceting-actions','not JSON'],
    ['faceting-plane-counts','not JSON'],['faceting-pool','0,1'],['faceting-criterion','spiky']]){
    const f=fixture();f.nodes[field].value=value;const before=structuredClone(f.owner.getProject());
    await assert.rejects(f.controls.apply('search'));assert.deepEqual(f.owner.getProject(),before);
    assert.equal(f.published.length,0);assert.equal(f.controls.busy,false);
    assert.equal(f.calls.filter(call=>call[0]==='facet-search').length,0);
  }
  const f=fixture();f.owner.getState().model.dimension=4;await assert.rejects(f.controls.apply('search'),/3D/);
});

const changes={coordinates:f=>f.owner.getState().model.vertices[1][0]=2,
  rgba:f=>f.owner.getState().model.metadata.offColors.faces[0].values[3]=.5,
  modelUnit:f=>f.owner.getState().model.metadata.coordinateUnits='cm',
  viewUnit:f=>f.owner.getState().view.coordinateUnit='cm',notes:f=>f.owner.getState().notes='changed',
  document:f=>f.owner.swapDocument(),project:f=>f.owner.swapProject(),
  form:f=>f.nodes['faceting-max_candidates'].value='10',export:f=>f.owner.setExport(true)};
for(const [name,change] of Object.entries(changes)){
  test(`held expressions reject ${name} ownership changes with no native search/publication`,async()=>{
    const f=fixture(),held=deferred();f.context.evaluateMany=()=>held.promise;
    const running=f.controls.apply('search');change(f);held.resolve([8,4096,4096,200000,128,1,0,0]);
    await assert.rejects(running,/changed|export/);assert.equal(f.calls.length,0);assert.equal(f.published.length,0);
  });
  test(`held native preview rejects ${name} ownership changes before viewer/publication`,async()=>{
    const f=fixture();await prime(f);const held=deferred();f.context.read=()=>held.promise;
    const running=f.controls.apply('preview');await tick();change(f);held.resolve(f.previewModel);
    await assert.rejects(running,/changed|export/);assert.equal(f.previews.length,0);assert.equal(f.published.length,0);
  });
}

test('selected result ownership is fenced during native preview even when other form fields are unchanged',async()=>{
  const f=fixture();await prime(f);const held=deferred();f.context.read=()=>held.promise;
  const running=f.controls.apply('preview');await tick();f.nodes['faceting-result'].value='another-result';held.resolve(f.previewModel);
  await assert.rejects(running,/target fields/);assert.equal(f.previews.length,0);
});

test('held native commit applies option guards before any history mutation',async()=>{
  for(const [name,change] of Object.entries(changes)){
    const f=fixture();await prime(f);const held=deferred();let options;
    f.context.commit=async(op,params,label,opts)=>{options=opts;await held.promise;opts.verifyPublication();f.published.push(params);};
    const running=f.controls.apply('adopt');await tick();assert.ok(options.signal);change(f);held.resolve();
    await assert.rejects(running,/changed|export/);assert.equal(f.published.length,0,name);
  }
});

test('camera/rotation movement preserves search and held native adoption eligibility',async()=>{
  const f=fixture();await prime(f);const held=deferred();
  f.context.commit=async(op,params,label,opts)=>{await held.promise;opts.verifyPublication();f.published.push(params);};
  const running=f.controls.apply('adopt');await tick();f.owner.getState().view.angles[0]=72;
  f.owner.getState().view.camera={projection:'perspective',zoom:2};held.resolve();await running;
  assert.equal(f.published.length,1);assert.equal(f.owner.getState().view.angles[0],72);
});

test('cancel and busy guards release a held native job and reject its eventual stale publisher',async()=>{
  const f=fixture(),held=deferred();f.context.read=()=>held.promise;
  const running=f.controls.apply('search');await tick();assert.equal(f.nodes['faceting-cancel'].disabled,false);
  await assert.rejects(f.controls.apply('candidates'),/Finish/);f.controls.cancel();
  await assert.rejects(running,error=>error.name==='AbortError');held.resolve(f.receipt);await tick();
  assert.equal(f.controls.search,null);assert.equal(f.published.length,0);assert.equal(f.controls.busy,false);
});

test('source/form changes after a completed search require a fresh receipt; observer changes are allowed',async()=>{
  const f=fixture();await prime(f);f.nodes['faceting-min_face_types'].value='2';f.controls.sync();
  assert.equal(f.nodes['faceting-adopt'].disabled,true);assert.equal(f.nodes['faceting-status'].dataset.status,'stale');
  await assert.rejects(f.controls.apply('adopt'),/Search inputs changed/);
  f.nodes['faceting-min_face_types'].value='1';f.owner.getState().view.camera.zoom=3;
  await f.controls.apply('preview');assert.equal(f.previews.length,1);
});

test('actual copied native JSONL expression/candidate/search/preview/adoption/replay verifies literal math and RGBA',async()=>{
  const f=fixture(),original=structuredClone(f.owner.getState().model);
  f.context.evaluateMany=(strings,options)=>native({op:'expression-batch',params:{expressions:strings,mode:'real'}},options).then(r=>r.values);
  f.context.read=async(op,params,source,options)=>{options.verifyPublication();const result=await native({op,model:source,params},options);options.verifyPublication();return result;};
  f.context.commit=async(op,params,label,options)=>{options.verifyPublication();const result=await native({op:'recipe-run',params:{
    document:f.owner.getDocument(),operation:op,parameters:params,label}},options);options.verifyPublication();
    const current=f.owner.getDocument();Object.assign(current,result);f.owner.setState(result.states[result.cursor]);f.published.push(result);f.controls.invalidate();};
  f.nodes['faceting-max_face_vertices'].value='sqrt(9)';
  await f.controls.apply('candidates');assert.equal(f.controls.catalogue.candidates.length,4);
  f.controls.useSourceFaces();await f.controls.apply('search');const receipt=structuredClone(f.controls.search);
  assert.equal(receipt.status,'complete');assert.equal(receipt.nodesVisited,31);assert.equal(receipt.results.length,1);
  const before=structuredClone(f.owner.getProject());await f.controls.apply('preview');
  assert.deepEqual(f.owner.getProject(),before);const preview=f.previews[0];
  assert.deepEqual([preview.vertices.length,preview.edges.length,preview.faces.length],[4,6,4]);
  assert.deepEqual(preview.provenance.sourceSnapshot,original);assert.deepEqual(preview.metadata.offColors.faces,original.metadata.offColors.faces);
  await f.controls.apply('adopt');assert.equal(f.published.length,1);
  assert.deepEqual(f.owner.getState().model,preview);assert.equal(f.owner.getState().notes,'owned source');
  const replay=await native({op:'recipe-replay',params:{document:f.owner.getDocument()}});
  assert.deepEqual(replay.states[0].model,preview);assert.equal(replay.states[0].view.coordinateUnit,'mm');
});

test('copied app wires a distinct preview viewer, job signals, export/cancel and required history operation',()=>{
  const app=readFileSync(new URL('../ui/app.js',import.meta.url),'utf8'),desktop=readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8');
  assert.match(app,/new AutomaticFacetingControls/);assert.match(app,/new Viewer\(container\)/);
  assert.match(app,/automaticFaceting\.invalidate\(\)/);
  const cancelControls=app.match(/for\(const control of \[([^\]]+)\]\)/)?.[1].split(',').map(name=>name.trim());
  for(const name of ['faceEditing','automaticFaceting','segmentotopeControls'])assert.ok(cancelControls?.includes(name),name+' must remain wired to global cancellation');
  assert.ok(desktop.includes("'facet-candidates','facet-search','facet-adopt'"));
  assert.match(app,/facetingPreview\.draw\(\)/);
});

test('actual native expression await refuses a changed RGBA source before any geometry job is submitted',async()=>{
  const f=fixture();f.context.evaluateMany=(strings,options)=>native({op:'expression-batch',params:{expressions:strings,mode:'real'}},options).then(r=>r.values);
  const running=f.controls.apply('search');f.owner.getState().model.metadata.offColors.faces[0].values[3]=.1;
  await assert.rejects(running,/attributes changed/);
  assert.equal(f.controls.search,null);assert.equal(f.calls.length,0);assert.equal(f.published.length,0);
});

test('actual warmed native process cancellation terminates a bounded long search before any geometry publication',async()=>{
  const f=fixture(),source=structuredClone(f.owner.getState().model),controller=new AbortController();
  source.vertices=Array.from({length:8},(_,i)=>[2*((i>>2)&1)-1,2*((i>>1)&1)-1,2*(i&1)-1]);
  source.faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
  source.edges=[...new Map(source.faces.flatMap(face=>face.map((a,i)=>[a,face[(i+1)%face.length]].sort((a,b)=>a-b)))
    .map(edge=>[edge.join(','),edge])).values()];
  source.metadata.offColors.faces=source.faces.map(()=>({encoding:'unit',values:[.2,.4,.6,.8]}));
  const before=structuredClone(source);
  const replies=await new Promise((resolve,reject)=>{
    const child=spawn(process.env.POLYTOPE_PYTHON||'python',['-B','-u','engine/server.py'],
      {cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe'],signal:controller.signal});
    let stdout='',aborted=false;const timer=setTimeout(()=>{child.kill();reject(Error('Native cancellation proof timed out.'));},5000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{stdout+=data;
      if(stdout.includes('\n')&&!controller.signal.aborted)controller.abort();});
    child.stdin.on('error',error=>{if(!controller.signal.aborted)reject(error);});
    child.on('error',error=>{if(error.name==='AbortError')aborted=true;else reject(error);});
    child.on('close',()=>{clearTimeout(timer);if(!aborted)return reject(Error('Native process did not acknowledge abort.'));
      resolve(stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)));});
    child.stdin.end(JSON.stringify({id:'warm',op:'expression-batch',params:{expressions:['0'],mode:'real'}})+'\n'+
      JSON.stringify({id:'long-search',op:'facet-search',model:source,params:{node_limit:200000}})+'\n');
  });
  assert.equal(replies.length,1);assert.equal(replies[0].id,'warm');assert.equal(replies[0].ok,true);
  assert.deepEqual(source,before);assert.equal(f.published.length,0);
});
