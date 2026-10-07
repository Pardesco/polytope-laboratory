import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planStereographicQuality,orthographicCriterionPixels,stereographicSnapshotKeys,StereographicQualityCoordinator,STEREOGRAPHIC_QUALITY_DEFAULTS} from '../ui/stereographic-quality.mjs';
const camera={cameraProjection:'orthographic',cssHeight:684,orthographicHalfHeight:1.45,zoom:1},snapshot={sourceKey:'source-a',frameKey:'frame-a'},close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function clock(){let now=0,id=0;const jobs=new Map(),cancelled=[];return {now:()=>now,setTimer:(fn,ms)=>{const key=++id;jobs.set(key,{fn,due:now+ms});return key;},clearTimer:key=>{if(jobs.has(key))cancelled.push(jobs.get(key).fn);jobs.delete(key);},advance:ms=>{now+=ms;for(const [key,job] of [...jobs])if(job.due<=now){jobs.delete(key);job.fn();}},fireCancelled:()=>cancelled.forEach(fn=>fn()),fireEarly:()=>{const job=[...jobs.values()][0];if(job)job.fn();},pending:()=>jobs.size};}
function scheduler(){const fake=clock(),requests=[],coordinator=new StereographicQualityCoordinator({...fake,onRequest:r=>requests.push(r)});return {fake,requests,coordinator};}

test('orthographic criterion conversion matches independent camera matrix at the real CSS viewport',()=>{
  const quality=planStereographicQuality({...camera,phase:'interaction'});close(quality.tolerance,3.5*2*1.45/684);close(quality.criterionPixels,3.5);assert.equal(quality.budgetSatisfied,true);assert.equal(quality.pixelBound,'orthographic-criterion-conversion');assert.equal(quality.criterion,'adaptive-sampled-world-error');assert.equal(quality.wholePrimitiveBound,false);
  const c=new THREE.OrthographicCamera(-1.45*1240/684,1.45*1240/684,1.45,-1.45,.01,1000);c.position.set(3.2,2.2,4.5);c.lookAt(0,0,0);c.updateMatrixWorld();const screen=p=>{const q=p.clone().project(c);return [(q.x+1)*1240/2,(1-q.y)*684/2];};
  const right=new THREE.Vector3(1,0,0).applyQuaternion(c.quaternion),origin=new THREE.Vector3(),a=screen(origin),b=screen(right.multiplyScalar(quality.tolerance));close(Math.hypot(a[0]-b[0],a[1]-b[1]),3.5,1e-8);close(orthographicCriterionPixels(.016,camera),.016*684/(2*1.45));
});

test('criterion is an orientation-independent upper conversion for sampled 3D error, not full arc accuracy',()=>{
  const c=new THREE.OrthographicCamera(-2,2,2,-2,.01,1000);c.position.set(2,3,5);c.lookAt(0,0,0);c.updateMatrixWorld();const metrics={cssHeight:900,orthographicHalfHeight:2,zoom:1};
  for(const delta of [[.01,0,0],[0,.01,0],[0,0,.01],[.006,.008,0]]){const a=new THREE.Vector3().project(c),b=new THREE.Vector3(...delta).project(c),actual=Math.hypot((b.x-a.x)*900/2,(b.y-a.y)*900/2),converted=orthographicCriterionPixels(Math.hypot(...delta),metrics);assert.ok(actual<=converted+1e-9);}
  assert.equal(planStereographicQuality({...metrics,phase:'capture'}).wholePrimitiveBound,false);
});

test('zoom/resize/half-height monotonically adjust tolerance while preserving the chosen CSS criterion',()=>{
  const base=planStereographicQuality({...camera,phase:'interaction'}),zoomed=planStereographicQuality({...camera,zoom:2,phase:'interaction'}),resized=planStereographicQuality({...camera,cssHeight:1368,phase:'interaction'}),wider=planStereographicQuality({...camera,orthographicHalfHeight:2.9,phase:'interaction'});
  close(zoomed.tolerance,base.tolerance/2);close(resized.tolerance,base.tolerance/2);close(wider.tolerance,base.tolerance*2);for(const q of [base,zoomed,resized,wider])close(q.criterionPixels,3.5);
});

test('idle and capture retain default0.004 or stricter pixel-derived tolerance and pole policy',()=>{
  for(const phase of ['idle','capture']){const defaultPlan=planStereographicQuality({...camera,phase});assert.equal(defaultPlan.tolerance,.004);assert.ok(defaultPlan.criterionPixels<1);const zoomed=planStereographicQuality({...camera,zoom:2,phase});close(zoomed.tolerance,2*1.45/(2*684));close(zoomed.criterionPixels,1);assert.equal(zoomed.poleEpsilon,.02);assert.equal(zoomed.wholePrimitiveBound,false);}
  const before=structuredClone(camera),options={interactionPixels:4,finePixels:.5};planStereographicQuality({...camera,phase:'capture'},options);assert.deepEqual(camera,before);assert.deepEqual(options,{interactionPixels:4,finePixels:.5});
});

test('interaction cap gives stricter criterion while numerical floor explicitly reports an unmet target',()=>{
  const wide=planStereographicQuality({...camera,orthographicHalfHeight:100,phase:'interaction'});assert.equal(wide.tolerance,.032);assert.ok(wide.criterionPixels<wide.targetPixels);assert.equal(wide.budgetSatisfied,true);
  const tiny=planStereographicQuality({...camera,orthographicHalfHeight:1e-10,zoom:1000,phase:'capture'});assert.equal(tiny.tolerance,STEREOGRAPHIC_QUALITY_DEFAULTS.minimumTolerance);assert.equal(tiny.budgetSatisfied,false);assert.ok(tiny.criterionPixels>tiny.targetPixels);assert.match(tiny.diagnostics.join(' '),/cannot meet.*no successful pixel-budget claim/);
});

test('perspective fallback does not fabricate a depth-independent sampled CSS bound',()=>{
  for(const phase of ['interaction','idle','capture']){const q=planStereographicQuality({cameraProjection:'perspective',cssHeight:684,phase});assert.equal(q.tolerance,.004);assert.equal(q.criterionPixels,null);assert.equal(q.budgetSatisfied,null);assert.equal(q.pixelBound,'unavailable');assert.equal(q.wholePrimitiveBound,false);assert.match(q.diagnostics.join(' '),/actual depth\/frustum analysis/);}
  assert.throws(()=>orthographicCriterionPixels(.004,{cameraProjection:'perspective',cssHeight:684}),/actual depth/);
});

test('malformed metrics/settings and nonfinite scale fail explicitly, owned quality records are frozen',()=>{
  for(const field of ['cssHeight','orthographicHalfHeight','zoom'])for(const value of [0,-1,NaN,Infinity,'1'])assert.throws(()=>planStereographicQuality({...camera,[field]:value}),/positive and finite/);
  for(const interactionPixels of [2.9,4.1,Infinity])assert.throws(()=>planStereographicQuality(camera,{interactionPixels}),/between 3 and 4/);for(const finePixels of [0,1.1,NaN])assert.throws(()=>planStereographicQuality(camera,{finePixels}),/at most 1/);
  assert.throws(()=>planStereographicQuality({...camera,phase:'fake'}),/phase/);assert.throws(()=>planStereographicQuality({...camera,cameraProjection:'fisheye'}),/Unsupported/);assert.throws(()=>planStereographicQuality({...camera,cssHeight:1e308,orthographicHalfHeight:1e-308,zoom:1e308}),/finite precision/);
  const q=planStereographicQuality(camera);assert.ok(Object.isFrozen(q));assert.ok(Object.isFrozen(q.diagnostics));assert.throws(()=>q.tolerance=1,TypeError);
  const extreme=planStereographicQuality({cssHeight:1e-209,orthographicHalfHeight:1e100,phase:'interaction'});assert.equal(extreme.requestedTolerance,null);assert.ok(extreme.diagnostics.length);assert.ok(Number.isFinite(extreme.tolerance));
});

test('canonical source/frame keys bind identity and full pose independent of property insertion order',()=>{
  const source={modelId:'a',sourceFingerprint:'a'.repeat(64)},frame={angles:[0,0,24,0,18,0],camera:{zoom:1,height:684},visibleCells:[0,7],cellShrink:.6},before=structuredClone({source,frame});
  const keys=stereographicSnapshotKeys(source,frame),same=stereographicSnapshotKeys(source,{cellShrink:.6,visibleCells:[0,7],camera:{height:684,zoom:1},angles:[0,0,24,0,18,0]});assert.deepEqual(keys,same);assert.ok(Object.isFrozen(keys));assert.deepEqual({source,frame},before);
  assert.notEqual(stereographicSnapshotKeys({...source,modelId:'b'},frame).sourceKey,keys.sourceKey);assert.notEqual(stereographicSnapshotKeys({...source,sourceFingerprint:'b'.repeat(64)},frame).sourceKey,keys.sourceKey);assert.notEqual(stereographicSnapshotKeys(source,{...frame,cellShrink:.7}).frameKey,keys.frameKey);assert.notEqual(stereographicSnapshotKeys(source,{...frame,camera:{zoom:2,height:684}}).frameKey,keys.frameKey);
});

test('snapshot key bounds reject malformed hashes, sparse arrays, cycles, code/accessors and overflow',()=>{
  const source={modelId:'a',sourceFingerprint:'a'.repeat(64)};for(const hash of ['x','A'.repeat(64),null])assert.throws(()=>stereographicSnapshotKeys({...source,sourceFingerprint:hash},{}),/fingerprint/);const cycle={};cycle.self=cycle;assert.throws(()=>stereographicSnapshotKeys(source,cycle),/cycles/);
  for(const frame of [{bad:Infinity},{bad:()=>{}},{bad:new Date()},Array(3)])assert.throws(()=>stereographicSnapshotKeys(source,frame),/nonfinite|finite JSON|plain JSON|dense/);let invoked=0;const getter={get angles(){invoked++;return [];}};assert.throws(()=>stereographicSnapshotKeys(source,getter),/accessors/);assert.equal(invoked,0);assert.throws(()=>stereographicSnapshotKeys(source,{values:Array(4097).fill(0)}),/resource bound/);
});

test('interaction emits once for identical pose, reschedules idle and rejects cancelled old timer callbacks',()=>{
  const {fake,requests,coordinator:c}=scheduler(),first=c.interact(snapshot,camera);assert.equal(first.phase,'interaction');fake.advance(80);const repeated=c.interact(snapshot,camera);assert.equal(repeated,first);assert.equal(requests.length,1);fake.fireCancelled();assert.equal(requests.length,1);fake.advance(119);assert.equal(requests.length,1);fake.advance(1);assert.equal(requests.length,2);assert.equal(requests[1].phase,'idle');assert.equal(requests[1].quality.tolerance,.004);assert.equal(c.isCurrent(first),false);assert.equal(c.isCurrent(requests[1]),true);
});

test('early timer cannot refine before inactivity deadline and a changed frame fences previous work',()=>{
  const {fake,requests,coordinator:c}=scheduler(),first=c.interact(snapshot,camera);fake.advance(10);fake.fireEarly();assert.equal(requests.length,1);const next=c.interact({...snapshot,frameKey:'frame-b'},camera);assert.notEqual(next.token,first.token);assert.equal(c.isCurrent(first),false);fake.fireCancelled();fake.advance(119);assert.equal(requests.length,2);fake.advance(1);assert.equal(requests.length,3);assert.equal(requests[2].frameKey,'frame-b');assert.equal(requests[2].phase,'idle');
});

test('source switches and observer resize/zoom cannot publish old quality generations',()=>{
  const {fake,requests,coordinator:c}=scheduler(),first=c.interact(snapshot,camera),second=c.interact({...snapshot,sourceKey:'source-b'},camera),third=c.interact({...snapshot,sourceKey:'source-b'},{...camera,zoom:2});assert.equal(c.isCurrent(first),false);assert.equal(c.isCurrent(second),false);assert.equal(c.isCurrent(third),true);assert.ok(third.quality.tolerance<second.quality.tolerance);fake.fireCancelled();fake.advance(120);assert.equal(requests.at(-1).sourceKey,'source-b');assert.equal(requests.at(-1).quality.zoom,2);
});

test('capture immediately requests fine exact-pose policy and cancels debounce without claiming rendered output',()=>{
  const {fake,requests,coordinator:c}=scheduler(),moving=c.interact(snapshot,camera),capture=c.capture(snapshot,camera);assert.equal(capture.phase,'capture');assert.equal(capture.quality.tolerance,.004);assert.equal(capture.quality.wholePrimitiveBound,false);assert.equal(c.isCurrent(moving),false);assert.equal(c.isCurrent(capture),true);assert.equal(fake.pending(),0);fake.fireCancelled();fake.advance(1000);assert.equal(requests.length,2);const next=c.capture(snapshot,camera);assert.ok(next.token>capture.token);assert.equal(c.isCurrent(capture),false);
});

test('request guards reject forged keys/quality and cancellation/destroy prevent late refinement',()=>{
  const {fake,requests,coordinator:c}=scheduler(),request=c.interact(snapshot,camera);assert.ok(Object.isFrozen(request));assert.equal(c.isCurrent({...request,sourceKey:'wrong'}),false);assert.equal(c.isCurrent({...request,frameKey:'wrong'}),false);assert.equal(c.isCurrent({...request,quality:{...request.quality,tolerance:.032}}),false);c.cancel();assert.equal(c.isCurrent(request),false);fake.fireCancelled();fake.advance(1000);assert.equal(requests.length,1);const next=c.idle(snapshot,camera);assert.equal(c.isCurrent(next),true);c.destroy();c.destroy();assert.equal(c.isCurrent(next),false);assert.throws(()=>c.capture(snapshot,camera),/destroyed/);
});

test('invalid new requests leave existing source generation/timer intact, all caller records remain mutable',()=>{
  const {fake,requests,coordinator:c}=scheduler(),ownedSnapshot={...snapshot},ownedCamera={...camera},request=c.interact(ownedSnapshot,ownedCamera);assert.throws(()=>c.interact({sourceKey:'',frameKey:'x'},camera),/bounded source/);assert.throws(()=>c.capture(snapshot,{...camera,zoom:0}),/positive/);assert.equal(c.isCurrent(request),true);assert.equal(fake.pending(),1);ownedSnapshot.sourceKey='mutated caller';ownedCamera.zoom=9;fake.advance(120);assert.equal(requests[1].sourceKey,snapshot.sourceKey);assert.equal(requests[1].quality.zoom,1);assert.equal(Object.isFrozen(ownedSnapshot),false);assert.equal(Object.isFrozen(ownedCamera),false);
});

test('reentrant publication cancellation or source replacement cannot install an obsolete idle timer',()=>{
  const fake=clock(),requests=[];let c;c=new StereographicQualityCoordinator({...fake,onRequest:r=>{requests.push(r);if(r.sourceKey==='source-a')c.interact({sourceKey:'source-b',frameKey:'frame-b'},camera);}});const obsolete=c.interact(snapshot,camera);assert.equal(c.isCurrent(obsolete),false);assert.equal(fake.pending(),1);fake.advance(120);assert.equal(requests.at(-1).sourceKey,'source-b');assert.equal(requests.at(-1).phase,'idle');
  const other=clock();let cancel;cancel=new StereographicQualityCoordinator({...other,onRequest:()=>cancel.destroy()});const request=cancel.interact(snapshot,camera);assert.equal(cancel.isCurrent(request),false);assert.equal(other.pending(),0);
});
