import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {benchmarkModel,geometryHash} from '../scripts/dense-model-benchmark.mjs';

test('headless dense harness exercises every operation/mode and preserves native geometry',()=>{
  const model=JSON.parse(readFileSync(new URL('./fixtures/element-content-native-cases.json',import.meta.url),'utf8')).fourD.source;
  const before=geometryHash(model),result=benchmarkModel(model,{samples:2,warmup:1});
  assert.equal(result.sourceGeometrySha256,before);assert.equal(geometryHash(model),before);
  for(const projection of ['orthographic','perspective','stereographic']){
    const rows=result.rows.filter(r=>r.projection===projection),tasks=rows.map(r=>r.task);
    for(const name of ['rotation','highlight-edge','highlight-face','rotation-selected-edge','rotation-selected-face','hover-vertex','hover-edge','hover-face','hover-first-vertex','hover-first-edge','hover-first-face','cell-visibility','color-by-type'])assert.ok(tasks.includes(name),name);
    for(const row of rows.filter(r=>r.task!=='status')){assert.equal(row.samples.length,2);assert.ok(row.median>=0);assert.ok(row.iqr>=0);}
    assert.ok(rows.find(r=>r.task==='status').displayed.triangles>0);
  }
});

test('the 3D compound workload reports cell visibility as unavailable',()=>{
  const model=JSON.parse(readFileSync(new URL('./fixtures/element-content-native-cases.json',import.meta.url),'utf8')).net.source;
  const result=benchmarkModel(model,{samples:1,warmup:0,modes:['orthographic']});
  assert.equal(result.rows.find(r=>r.task==='cell-visibility').available,false);
});
