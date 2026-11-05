import test from 'node:test';import assert from 'node:assert/strict';
import {distanceFromStrength,strengthFromDistance,PERSPECTIVE_STRENGTH_RANGE} from '../ui/perspective-controls.mjs';
import {defaultDocumentView,DEFAULT_PERSPECTIVE_DISTANCE_4D} from '../ui/default-look.mjs';
test('perspective strength maps monotonically between subtle and extreme eye distances',()=>{
  assert.equal(distanceFromStrength(0),PERSPECTIVE_STRENGTH_RANGE.subtle);assert.equal(distanceFromStrength(100),PERSPECTIVE_STRENGTH_RANGE.extreme);
  for(let s=0;s<100;s+=5)assert.ok(distanceFromStrength(s)>distanceFromStrength(s+5));
  for(const s of [0,23,50,79,100])assert.ok(Math.abs(strengthFromDistance(distanceFromStrength(s))-s)<=1);
});
test('new 4D views default to a dramatic perspective; 3D views are untouched',()=>{
  assert.equal(defaultDocumentView(4).perspectiveDistance4D,DEFAULT_PERSPECTIVE_DISTANCE_4D);assert.ok(DEFAULT_PERSPECTIVE_DISTANCE_4D<2);
  assert.equal(defaultDocumentView(3).perspectiveDistance4D,undefined);
});
