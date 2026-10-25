import test from 'node:test';
import assert from 'node:assert/strict';
import {CatalogDiscovery} from '../ui/catalog-discovery.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
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
