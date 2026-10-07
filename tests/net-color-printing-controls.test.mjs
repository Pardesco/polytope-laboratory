import test from 'node:test';
import assert from 'node:assert/strict';
import {paperColorChoices,colorPrintParameters} from '../ui/net-color-printing-controls.mjs';
const source={id:'source-owner',fingerprint:'metric-owner',faces:[[0,1,2],[1,2,3],[2,3,4],[3,4,5]],metadata:{offColors:{faces:[{encoding:'byte',values:[255,0,0,128]},{encoding:'unit',values:[1,0,0,128/255]},null,{encoding:'unit',values:[0,0,1]}]}}};
test('byte/unit-equivalent full RGBA batches keep literal source IDs and uncolored slots',()=>{
  const choices=paperColorChoices(source);assert.equal(choices.length,3);assert.deepEqual(choices[0].faceIds,[0,1]);assert.equal(choices[1].face,2);assert.deepEqual(choices[0].rgba,[1,0,0,128/255]);
});
test('batch selection is source-owned and requires explicit separate mode',()=>{
  assert.deepEqual(colorPrintParameters(source,'separate','1',false),{color_mode:'separate',paper_color:1,print_fill:false,color_source_id:source.id,color_source_fingerprint:source.fingerprint});
  assert.throws(()=>colorPrintParameters(source,'mixed','1',true),/one-color/);
  assert.throws(()=>colorPrintParameters(source,'separate','4',true),/existing/);
  assert.throws(()=>colorPrintParameters(source,'auto','-1',true),/existing/);
});
