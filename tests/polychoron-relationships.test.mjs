import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PolychoronRelationshipControls} from '../ui/polychoron-relationships.mjs';
import {compileCatalogQuery} from '../ui/catalog-query.mjs';
import {LibraryPropertyControls,relatedEntries} from '../ui/library-navigation.mjs';

class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.value='';this.attributes={};this.dataset={};}
  append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value)this.value=nodes[0]?.value??'';}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  after(node){this.afterNode=node;}
  setAttribute(k,v){this.attributes[k]=v;}
}
const doc=()=>({createElement:tag=>new Node(tag),getElementById:()=>new Node('input')});
const find=(root,id)=>root.id===id?root:root.children.map(n=>find(n,id)).find(Boolean);
function fixture(){
  let state={model:{dimension:4,fingerprint:'source',vertices:[[1,0,0,0]],metadata:{fissary:false,compound4Evidence:{
    resultFingerprint:'source',distinctVertexCount:120,vertexMultiplicity:5,group:'H4',groupOrder:14400,
    frameKey:'cell600',symmetryScope:'Complete declared frame group',frameActionResidual:1e-15,frameVertexResidual:0}}}},exporting=false;
  const calls=[],opened=[],entries=[{key:'cell600',name:'600-cell'}];let resolve,reject;
  const controls=new PolychoronRelationshipControls({document:doc(),after:new Node('div'),getState:()=>state,getEntries:()=>entries,
    open:e=>opened.push(e.key),guard:fn=>fn,isExporting:()=>exporting,run:(...args)=>{calls.push(args);return new Promise((a,b)=>{resolve=a;reject=b;});}});
  controls.sync();
  return {controls,calls,opened,get state(){return state;},replace:()=>state={...state},export:()=>exporting=true,
    finish:()=>resolve({componentCount:25,disconnectedVertexIds:[],classification:{},scope:'Literal source IDs; no welding.'}),fail:()=>reject(Error('unsupported source'))};
}

test('scaliform/fissary source properties keep unknown separate and combine with component searches',()=>{
  const rows=[{key:'tuta',dimension:4,scaliform:true,fissary:false,uniform:false},{key:'fissary',dimension:4,fissary:true},
    {key:'compound',dimension:4,componentCount:25},{key:'unknown',dimension:3}];
  for(const [query,keys] of [['scaliform:true uniform:false fissary:false',['tuta']],['fissary:true',['fissary']],
    ['fissary:unknown',['compound','unknown']],['dim:4 components:25',['compound']],['scaliform:false',[]]])
    assert.deepEqual(rows.filter(compileCatalogQuery(query)).map(e=>e.key),keys);
});

test('mounted property filters and explicit frame relations are discoverable',()=>{
  const filters=new LibraryPropertyControls({document:doc(),after:new Node('div'),change(){}});
  assert.equal(filters.selects.get('scaliform').id,'library-scaliform');assert.equal(filters.selects.get('fissary').id,'library-fissary');
  filters.selects.get('fissary').value='true';assert.equal(filters.matches({fissary:true}),true);assert.equal(filters.matches({}),false);
  const links=relatedEntries({metadata:{frameKey:'cell600'}},[{key:'cell600',name:'600-cell'}]);
  assert.deepEqual(links.map(e=>[e.relation,e.entry.key]),[['Vertex frame type','cell600']]);
});

test('Analysis mounts frame multiplicity, source classification, guarded frame open and collapsed evidence',()=>{
  const f=fixture(),root=f.controls.root;
  assert.equal(root.id,'polychoron-relationships');assert.match(find(root,'polychoron-classification').textContent,/classification: No/);
  assert.match(find(root,'polychoron-frame-summary').textContent,/120 distinct frame positions; vertex multiplicity 5/);
  assert.notEqual(find(root,'polychoron-construction-evidence').open,true);
  const open=find(root,'polychoron-open-frame');open.onclick();assert.deepEqual(f.opened,['cell600']);
  f.replace();assert.throws(()=>open.onclick(),/Source changed/);
  f.controls.sync();f.state.model.fingerprint='changed';f.controls.sync();assert.equal(find(root,'polychoron-frame-summary'),undefined);
});

test('literal link query publishes only into its owned source and propagates cancellation',async()=>{
  const f=fixture();const pending=f.controls.check();
  assert.equal(f.calls[0][0],'polychoron-relationships');assert.equal(f.calls[0][2],f.state.model);
  f.finish();assert.equal((await pending).componentCount,25);assert.match(f.controls.output.textContent,/classification: Unknown/);
  for(const change of [f=>f.replace(),f=>f.export(),f=>f.controls.cancel(),f=>{f.state.model.vertices.push([0,1,0,0]);},f=>f.controls.sync()]){
    const f=fixture(),pending=f.controls.check(),output=f.controls.output;change(f);f.finish();assert.equal(await pending,null);
    assert.doesNotMatch(output.textContent,/25 component/);
  }
});

test('export, native refusal and non-4D sources are handled without retaining stale results',async()=>{
  const f=fixture();f.export();f.controls.sync();assert.equal(find(f.controls.root,'polychoron-check-links').disabled,true);
  await assert.rejects(f.controls.check(),/export/);assert.equal(f.calls.length,0);
  const failed=fixture(),pending=failed.controls.check();failed.fail();await assert.rejects(pending,/unsupported/);
  assert.match(failed.controls.output.textContent,/Check unavailable/);
  failed.state.model.dimension=3;failed.controls.sync();assert.equal(failed.controls.root.hidden,true);
  await assert.rejects(failed.controls.check(),/4D/);
});

test('scaliform cell inventory appears with approximate residuals and no filled-interior claim',()=>{
  const f=fixture();f.state.model.metadata={scaliform4Evidence:{resultFingerprint:'source',definition:'Vertex-transitive, equal edges.',
    cellInventory:[{name:'Bowtie bipyramid',count:4}],edgeRelativeSpread:0,maxElementCircumsphereRelativeSpread:0,symmetryOrder:16}};
  f.controls.sync();assert.match(find(f.controls.root,'polychoron-scaliform-summary').textContent,/4 × Bowtie bipyramid/);
  const details=find(f.controls.root,'polychoron-construction-evidence');assert.ok(details.children.some(n=>n.textContent.includes('Float64, approximate')));
});

test('app mount, source refresh, global cancel and desktop allowlist/reuse route the read-only op',async()=>{
  const paths=['ui/app.js','desktop/main.cjs','desktop/engine-pool.cjs','engine/server.py','package.json'];
  const [app,main,pool,server,pkg]=await Promise.all(paths.map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
  assert.match(app,/new PolychoronRelationshipControls\(/);assert.match(app,/polychoronRelationships\?\.sync\(\)/);
  assert.match(app,/polychoronRelationships\?\.cancel\(\)/);
  assert.match(main,/allowed.add\('polychoron-relationships'\)/);assert.match(pool,/REUSABLE_OPERATIONS.add\('polychoron-relationships'\)/);
  assert.match(server,/if op == 'polychoron-relationships'/);assert.ok(JSON.parse(pkg).scripts['test:features'].includes('tests/polychoron-relationships.test.mjs'));
});
