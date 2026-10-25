import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fakeRenderer} from './helpers/fake-renderer.mjs';

test('shared fake renderer implements every direct Viewer renderer method',async()=>{
  const source=await readFile(new URL('../ui/viewer.js',import.meta.url),'utf8');
  const methods=new Set([...source.matchAll(/\bthis\.renderer\.([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]));
  assert.ok(methods.size>0,'Extraction must find the Viewer renderer calls');
  const renderer=fakeRenderer();
  for(const method of methods)assert.equal(typeof renderer[method],'function',`Shared fake renderer lacks ${method}()`);
});
