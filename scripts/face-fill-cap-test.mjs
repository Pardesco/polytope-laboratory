import assert from 'node:assert/strict';
import {buildFaceSurfaces,FACE_FILL_LIMITS} from '../ui/face-fill.mjs';

// Reuse a convex quad to exceed the real model cap deterministically without
// depending on an optional downloaded corpus. Late isolated source IDs must
// still acquire their complete surfaces after the full view reaches its cap.
const lastFace=Math.floor(FACE_FILL_LIMITS.triangles/2);
const model={vertices:[[0,0],[1,0],[1,1],[0,1]],faces:Array(lastFace+1).fill([0,1,2,3])};
const full=buildFaceSurfaces(model);
assert.equal(full.triangles.length,FACE_FILL_LIMITS.triangles);
assert.deepEqual(full.diagnostics,[{face:lastFace,reason:'model exceeds triangle resource limit'}]);
const isolated=buildFaceSurfaces(model,'nonzero',{faceIds:[lastFace]});
assert.equal(isolated.filledFaces,1);
assert.equal(isolated.suppressedFaces,0);
assert.equal(isolated.consideredFaces,1);
assert.equal(isolated.triangles.length,2);
assert.ok(isolated.triangles.every(t=>t.face===lastFace));
console.log('Face resource cap and late isolated face recovery passed.');
