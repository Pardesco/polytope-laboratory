# Guarded animation presentation adapters

`ui/animation-adapters.mjs` prepares explosion and rigid face-net poses without changing the saved source model, view, memory bank or native caches. Version 0.12 development integrates actual rendering and controls and passed [13 desktop/export checks](ANIMATION_TRACK_CONTROLS.md). The native validator is wired into display-state validation. Version 2 playback remains capability guarded for any renderer lacking an implemented adapter; packaged workflow qualification is still pending.

```js
const session = await prepareAnimationAdapters({
  state, sequence, getState,
  loadPlanes, loadNet, signal
});
const pose = session.evaluate(time);
await session.apply(time, renderPose);
session.cancel();
await session.restore(renderPose);
session.destroy();
```

`sequence` defaults to the saved `state.view.animation`. Preparation validates and owns bounded detached JSON snapshots; the normalized sequence and source identity are immutable. Pose buffers are detached mutable data. `evaluate(time)` uses absolute time and includes both rotation/depth and active explosion/fold values. `apply` and `restore` also accept `{signal}` for an individual operation.

## Native preflight

For a 4D normal explosion, `loadPlanes(detachedModel,{signal,isCurrent})` is called at most once when the saved plane cache is missing or invalid. Verified planes must cover the original source geometry. Radial explosion does not require native normals. Unsupported source interpretations or partial 4D cell-net folding reject with an explicit diagnostic.

`loadNet(detachedModel,{signal,isCurrent})` is called at most once for a missing or stale face net. A net must use the actual native face-net protocol: matching source fingerprint, ordered source edges, complete unique face IDs, original ordered face vertex references, bounded physical reference-edge scale, correct scaled target vertices and rigid folded reconstruction of every source coordinate. A matching fingerprint alone is insufficient. Newly returned descriptors are bounded and cloned before use. Neither callback can change the saved model through its input snapshot.

## Renderer contract

The callback is `await renderPose(pose,{signal,isCurrent})`. It must check `isCurrent()` immediately before publishing prepared presentation buffers or state. An async renderer that ignores this guard can publish stale work; the orchestration module cannot undo an arbitrary callback's side effects. Native callback failures reject before any rendering begins.

Every pose includes `source`, `frame`, `view` and `restoring`. An explosion adds `baseExplosion`; a fold adds `foldFaces`, `foldSourceFingerprint` and `foldNet`. `foldNet` is owned, deeply immutable and reused by reference for every pose in a session; it is not cloned per frame. Qualified fold poses set `view.derivedMode:'net'`, `viewportLayout:'split'` and `view.net.display:'fold'` with the evaluated fraction. Restoring leaves the exact original mode and property presence intact. Preserve the mathematical source and original normalization while displaying these entity instances. Keep source model, vertex, face and cell references for analysis and picking. Apply explosion displacement before the observation frame and projection. A simultaneous fold describes a separate face-net presentation and must not silently substitute it for the source or cell geometry.

The renderer may keep presentation entirely outside saved state. If it publishes `pose.view`, replace the complete detached view or explicitly restore property presence. Using `Object.assign` alone on restoration leaves newly introduced `explosionAmount` or `foldFraction` fields that were originally absent. `restore` returns the exact original view, including absent properties and the original net fraction fallback.

## Cancellation and restoration

Preparation and publication require the current state object and model object to remain the captured objects, with unchanged model ID and source fingerprint. External view edits invalidate the session. New seeks abort prior pending renders and invalidate their generations; cancellation stops evaluation and pending publication. Restoration remains available after cancellation while the original source and a known presentation view remain current. It refuses to render over a new source, changed fingerprint or external camera/view change.

Known original and target view signatures are tracked during an asynchronous callback. This permits a new seek or restore after a renderer has already published its valid pose but has not finished awaiting completion. A renderer failure after publishing a known view also leaves restoration possible. The module never writes a view itself.

## Verification and remaining gates

`node --test tests/animation-adapters.test.mjs` passes 17 tests: detached cube and 4D buffers, one-time native acquisition, forged plane/net rejection, source/geometry ownership, rigid source reconstruction, failed callbacks, external camera changes, successive seeks, in-flight cancellation and restoration of absent fields. One integration fixture invokes `engine.nets.unfold` on an independent Cartesian cube and verifies the actual returned descriptor rather than a mocked protocol. Malformed source metadata rejects without freezing caller-owned objects.

The separate [desktop workflow](ANIMATION_TRACK_CONTROLS.md) now demonstrates actual cube and 4D explosion poses, rigid flat/folded net frames, unchanged source incidence/fingerprints, cancellation, native persistence, PNG restoration and decoded offscreen WebM endpoints. PNG and WebM exports await the selected complete pose before capture. Unsupported targets retain saved sequence data and explain the missing adapter. Pure source/cancellation fixtures and actual desktop evidence remain distinct; packaged proof is pending.
