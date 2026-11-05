import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogDiscovery} from '../ui/catalog-discovery.mjs';
import {compileCatalogQuery,catalogMatches} from '../ui/catalog-query.mjs';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('prepared catalog queries retain quoted text, aliases, symbols and explicit count filters',()=>{
  const entries=[{key:'cube',name:'Cube',dimension:3,counts:[8,12,6,0],family:'Platonic',aliases:['Hexahedron'],coxeterFamily:'B3',rings:[1,0,0]},
    {key:'tesseract',name:'Tesseract',dimension:4,counts:[16,32,24,8]},
    {key:'star',name:'Grand star model',relativePath:'4D/stars/Grand.off',dimension:4,counts:[120,720,1200,600],genus:0,componentCount:2},
    {key:'linked',name:'Linked sample',auditStatus:'rejected'}];
  const cases=[['',entries.map(e=>e.key)],['dim:4 v>=24',['star']],['"Grand star" dim>=4',['star']],['hexahedron vertices=8',['cube']],
    ['"B3 100"',['cube']],['parts>=2 genus:0',['star']],['cells<9',['cube','tesseract']],['genus:0',['star']],['rejected linked',['linked']],
    ['dim:04',['tesseract','star']],['v:8 v>7 v<=8',['cube']],['"dim:4"',[]],['v>=0',['cube','tesseract','star']]];
  for(const [query,expected] of cases){
    assert.deepEqual(entries.filter(compileCatalogQuery(query)).map(e=>e.key),expected,query);
    assert.deepEqual(entries.filter(e=>catalogMatches(e,query)).map(e=>e.key),expected,query);
  }
});

test('empty and numeric-only catalog searches never build unused text metadata',()=>{
  const entry={dimension:4,counts:[120,720,1200,600],get name(){throw Error('Unnecessary text traversal');}};
  assert.equal(compileCatalogQuery('')(entry),true);assert.equal(compileCatalogQuery('dim:4 v>=24')(entry),true);
  assert.equal(compileCatalogQuery('dim:3 anything')(entry),false);
});

test('prepared catalog queries read changed literal metadata without an identity cache',()=>{
  const entry={key:'same-key',name:'Model',aliases:['old alias'],counts:[8,12,6,0],auditStatus:'untested'},text=compileCatalogQuery('new alias'),count=compileCatalogQuery('v>10'),audit=compileCatalogQuery('passed');
  assert.equal(text(entry),false);entry.aliases.push('new alias');assert.equal(text(entry),true);entry.aliases.pop();assert.equal(text(entry),false);
  assert.equal(count(entry),false);entry.counts[0]=16;assert.equal(count(entry),true);
  assert.equal(audit(entry),false);entry.auditStatus='passed';assert.equal(audit(entry),true);
});

test('one prepared search parses its query once across many entries',()=>{
  let parses=0;const matcher=compileCatalogQuery({toString(){parses++;return 'dim:4';}});
  for(let i=0;i<10000;i++)assert.equal(matcher({dimension:i%2?4:3}),Boolean(i%2));assert.equal(parses,1);
});

test('actual navigation synchronization updates the active catalog row without rebuilding results or dropping load state',async()=>{
  const source=await readFile(new URL('../ui/app.js',import.meta.url),'utf8'),start=source.indexOf('function syncCatalogSelection('),end=source.indexOf('function renderCatalog(',start);
  assert.ok(start>=0&&end>start);const line=source.split('\n').find(line=>line.trim().startsWith('stellation.sync();netEditor.sync();'));
  assert.ok(line);let loadChecks=0;const active=new Map(),rows=['cube','star','linked'].map(key=>({dataset:{key},classList:{toggle:(name,value)=>{assert.equal(name,'active');active.set(key,value);}}}));
  const scope={model:()=>({metadata:{key:'star'}}),$:id=>{assert.equal(id,'catalog');return {querySelectorAll:()=>rows,replaceChildren(){throw Error('Navigation must not rebuild the Library');}};},
    renderTabs(){},renderHistory(){},refreshAnalysis(){},refreshDerived(){},renderCatalog(){throw Error('Navigation must not refilter the Library');}};
  for(const match of line.matchAll(/\b(\w+)(?:\?\.|\.)sync\(\)/g))scope[match[1]]={sync(){}};
  scope.catalogLoader={sync:()=>loadChecks++};runInNewContext(source.slice(start,end)+'\n'+line,scope);
  assert.deepEqual([...active],[['cube',false],['star',true],['linked',false]]);assert.equal(loadChecks,1);
});
function fixture(){const requests=[],published=[],states=[];const discovery=new CatalogDiscovery({read:({signal})=>{const d=deferred();requests.push({...d,signal});return d.promise;},publish:entries=>published.push(entries),change:()=>states.push(discovery.state)});return {discovery,requests,published,states};}
test('concurrent metadata loads coalesce and successful discovery publishes only metadata',async()=>{
  const f=fixture(),first=f.discovery.load();assert.equal(f.discovery.load(),first);assert.equal(f.discovery.state,'loading');await Promise.resolve();assert.equal(f.requests.length,1);
  const entries=[{key:'cube'}];f.requests[0].resolve(entries);assert.equal(await first,entries);assert.deepEqual(f.published,[entries]);assert.equal(f.discovery.state,'ready');assert.equal(f.discovery.pending,null);
  f.discovery.cancel();assert.equal(f.discovery.state,'ready');
});
test('Cancel settles before a held native reply and a retry remains independent of that reply',async()=>{
  const f=fixture(),old=f.discovery.load();await Promise.resolve();f.discovery.cancel();assert.equal(await old,null);assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.discovery.state,'canceled');
  const fresh=f.discovery.load();await Promise.resolve();f.requests[0].resolve([{key:'stale'}]);await Promise.resolve();assert.equal(f.discovery.state,'loading');assert.deepEqual(f.published,[]);
  f.requests[1].resolve([{key:'fresh'}]);await fresh;assert.deepEqual(f.published,[[{key:'fresh'}]]);assert.equal(f.discovery.state,'ready');
});
test('late native failures after Cancel are consumed without clearing retry state',async()=>{
  const f=fixture(),old=f.discovery.load();await Promise.resolve();f.discovery.cancel();await old;
  const fresh=f.discovery.load();await Promise.resolve();f.requests[0].reject(Error('old failure'));await Promise.resolve();assert.equal(f.discovery.state,'loading');f.requests[1].resolve([]);await fresh;assert.equal(f.discovery.state,'ready');
});
test('a current native refusal or malformed metadata reports error and permits a fresh successful retry',async()=>{
  const f=fixture(),first=f.discovery.load();await Promise.resolve();f.requests[0].reject(Error('native unavailable'));await assert.rejects(first,/native unavailable/);assert.equal(f.discovery.state,'error');assert.equal(f.discovery.pending,null);
  const bad=f.discovery.load();await Promise.resolve();f.requests[1].resolve({not:'catalog'});await assert.rejects(bad,/invalid catalog metadata/);assert.equal(f.discovery.state,'error');assert.deepEqual(f.published,[]);
  const retry=f.discovery.load();await Promise.resolve();f.requests[2].resolve([{key:'cube'}]);await retry;assert.equal(f.discovery.state,'ready');assert.equal(f.published.length,1);
});
test('Cancel before submission starts no native request and repeated Cancel changes no state',async()=>{
  const f=fixture(),pending=f.discovery.load();f.discovery.cancel();f.discovery.cancel();assert.equal(await pending,null);assert.equal(f.requests.length,0);assert.equal(f.discovery.state,'canceled');assert.deepEqual(f.published,[]);
});
