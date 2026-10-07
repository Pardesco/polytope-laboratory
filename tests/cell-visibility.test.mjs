import test from 'node:test';
import assert from 'node:assert/strict';
import {cellVisibility} from '../ui/cell-visibility.mjs';
const model={vertices:Array.from({length:6},()=>[0,0,0]),edges:[[0,1],[1,2],[2,0],[1,3],[3,2],[4,5]],faces:[[0,1,2],[1,3,2]],cells:[[0],[0,1]]};
test('shared faces stay visible until every owning cell is hidden',()=>{
  const visibility=cellVisibility(model,[0]);assert.deepEqual(visibility.faces,[true,true]);
  assert.deepEqual(cellVisibility(model,[0,1]).faces,[false,false]);
});
test('isolation filters source edges and vertices without reindexing',()=>{
  const visibility=cellVisibility(model,[],0);assert.deepEqual(visibility.activeCells,[0]);
  assert.deepEqual(visibility.faces,[true,false]);assert.deepEqual(visibility.edges,[true,true,true,false,false,false]);
  assert.deepEqual(visibility.vertices,[true,true,true,false,false,false]);assert.equal(model.faces[1][1],3);
});
test('ordinary models retain standalone edges when no cell filter is active',()=>{
  assert.ok(cellVisibility({...model,cells:[]}).edges.every(Boolean));
  assert.throws(()=>cellVisibility(model,[],2),/valid source cell/);
  assert.throws(()=>cellVisibility(model,[-1]),/outside/);
});
