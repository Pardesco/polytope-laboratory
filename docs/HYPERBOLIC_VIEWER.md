# Hyperbolic viewer (R11 package D)

Standalone hyperbolic viewer, float64 math and cancellable page-preparation worker. Shared integration files remain owned by E/F. No Electron launch is needed for these tests.

## Decisions

**Lead decision, 13 November 2026:** move per-pose projection to the GPU. The original renderer achieved about 39 draw fps but only one completed projection update/second, which did not provide usable fly-through.

- Sample geodesics once during page/anchor preparation using hyperboloid sinh interpolation. Choose a fixed segment count from hyperbolic edge length and a coarse LOD tier. Drop per-pose adaptive subdivision and its claimed <=1 px guarantee.
- Weld shared edges in float64 and upload static time-first hyperboloid points in the current bounded anchor frame. Rebuild buffers on page arrival, rebase, projection-model or LOD change; movement, looking, orbiting and resize only change uniforms/camera state.
- The vertex shader applies `C^-1`, then `x/(t+1)` for Poincare or `x/t` for Klein. JS computes the observer inverse in float64 and casts its 16 entries for the uniform. Explore keeps the three.js camera at the origin; overview uses ordinary ball orbit controls.
- Authoritative geometry, navigation and retained picking samples remain float64. GPU attributes and uniforms are float32 display approximations. Measure precision error separately from polyline approximation, retain the original float64 residual gates, and return identity-only picks.
- Keep the worker for cancellable page preparation, and retain the 50,000-edge / 200,000-segment caps with explicit quality flags. Report draw fps and actual pose updates/second separately, even though they now use the same render loop.

## Behavior and data

Coordinates are `(t,x,y,z)`, with `J=diag(-1,1,1,1)` and flat row-major matrices acting on columns. Everything is floating-point, not exact geometry. Observer frames must be future and proper; reflected cell charts may be improper. Timelike-first Lorentz Gram-Schmidt runs every 128 navigation steps or metric residual above `1e-10`. Existing `1e-8` float64 coordinate/transform gates remain unchanged.

Overview orbits the displayed ball. In Explore, WASD composes horizontal boosts at 0.4 hyperbolic units/second; arrows compose spatial rotations at 0.8 radians/second. Focus the canvas for keyboard input. Pointer looking requires an explicit `capturePointer(pointerEvent)` action; release, blur or Escape ends capture, and Escape exits Explore. Crossing displacement 1 requests an engine rebase and pauses movement until a coherent nearby anchor is available.

The worker prepares an indexed line buffer: `positions:Float32Array` and `samples64:Float64Array` both contain time-first four-vectors; `indices:Uint32Array` connects consecutive samples; `segmentOwners:Uint32Array` selects `{instanceId,edge,quotientState,aliases}`. The GPU attribute is named `hyperboloid` (item size 4), not a Euclidean `position`. `HYPERBOLIC_PROJECTION_GLSL` is shared by the production shader and the mounted GPU transform-feedback check.

For Poincare, the segment count is `max(2,ceil(length/step))`, with steps coarse `0.6`, normal `0.3` (default), fine `0.15`; cap 64 segments/edge. Klein uses one straight segment. Counts do not depend on observer, camera or viewport. A bounded 64 MiB worker LRU reuses previously prepared float64 edge samples when pages are appended; a changed source/anchor/epoch/model/LOD resets that cache. Cache eviction affects preparation time, never geometry claims.

Preparation keeps complete edges and stops before exceeding 50,000 retained unique edges or 200,000 segments. These caps now cover the static patch, including edges outside the current view, because there is no per-pose CPU culling. `quality.capped` and `quality.reasons` report `edge-cap`, `segment-cap` or `sample-count-cap`. Other limits remain 4,096 instances, a 64 MiB serialized renderer page cache, 4 MiB/page and 256 instances/page. Neighboring buckets only find weld candidates; all four endpoint coordinates are compared within `1e-8`.

Per-frame JS geometry work is O(1): navigation/frame checks plus the observer/model uniform update. No samples, colors or indices are rebuilt or transferred for a pose. `stats.drawFrames`, `stats.poseUpdates` and `stats.preparations` make this observable. Picking projects the retained float64 samples and clips/tests those same polyline segments in screen space **on demand only**. It returns `{instanceId,edge}` without Euclidean measurements. Rebase clears epoch-local picking. Wireframe remains the default; curved filled faces and tubes are deferred. `conformalTubeRadius(rho,p)` remains a first-order rendering approximation.

## Integration notes (E; controls by F)

1. Branch on `state.model.kind === 'hyperbolic-space'` before Euclidean validation/projection. Import `HyperbolicViewer` from `ui/hyperbolic-viewer.mjs`; construct with a canvas or container and dispose when switching kinds. Public lifecycle: `setModel`, `setPatch`, `setView`, `getView`, `resize`, `render`/`draw`, idempotent `dispose`. Animation runs internally unless `{animate:false}` is supplied; then the host drives `tick(dt)` and `render()`.
2. `setModel(descriptor,{view,revision})` requires `descriptor.anchorPatch`. Save `getView()` as `{hyperbolicModel,hyperbolicLod,mode,observerMatrix,anchor,overview:{position,target}}`. Model values are `poincare`/`klein`; LOD values are `coarse`/`normal`/`fine`. `setProjection(model)` and `setLOD(lod)` prepare replacement buffers; `setView(view)` restores the pose. Do not use the Euclidean viewer's `setDisplay`.
3. Call `beginEpoch({sourceHash,anchorHash,epoch,revision})`, then `setPatch(page,{append:false,revision})`; later pages use `append:true`. Wrong bindings return `false`; malformed pages throw. The engine page shape remains `{sourceHash,epoch,anchorHash,templates,instances,neighbors,coverage,residuals,nextCursor}`. Templates are a keyed object or an array with `type`/`id` (otherwise index); each page includes its instances' templates. Faces are ordered vertex cycles and face planes are unit spacelike four-vectors. Do not mutate retained pages. E owns native page fetching, cursors and cancellation.
4. Use `run('hyperbolic-patch',{source,epoch,anchor:{word,observerMatrix},radius,depth,budget,cursor},descriptor,label,{signal})` through the agreed adapter. Gate publication against document revision/source/epoch. Source changes use construction history; `onViewChange(view)` saves exploration and calls `markDirty()` at gesture end, without per-frame history. Explicit model/LOD/mode controls should also persist `getView()` at their end. Always distinguish engine finite-patch coverage from display caps.
5. Supply `onRebase(request)`, with request `{sourceHash,anchorHash,epoch,revision,observerMatrix,anchor,signal}`. E obtains the nearest cell word/address from the engine and returns `{patch,anchor,observerMatrix}` or `{pages,anchor,observerMatrix}`. Alternatively supply `anchorTransform:B` instead of `observerMatrix`, where **B maps the new oriented anchor frame into the old anchor frame** and belongs to `SO+(3,1)`; the viewer computes `Cnew=B^-1 Cold`. Replacement instances must already be in the new anchor frame. Preserve quotient address/orientation and keep the address <=64 KiB. Validation precedes the atomic swap; the new observer must have displacement <1. `onRebased(view,{pages,binding})` lets E retain the bounded anchor snapshot and clear selection. Missing/failed hooks pause navigation and retain the coherent patch. No new native rebase op is invented here.
6. Callbacks are `onQuality(quality)`, `onDiagnostic(text)`, `onPick(identity)`, `onViewChange(view)`, `onRebase` and `onRebased`. Quality includes `developedResidual`, `sampleResidual`, `maxAnchorRadius`, `sampledEdges`, `samplingCacheHits`, `prepTimeMs`, counts, caps and LOD. There is no per-pose quality publication or `maxDeviationPx` guarantee. Worker protocol is now `{type:'prepare',requestId,revision,sourceHash,anchorHash,epoch,pages,options:{model,lod,maxEdges?,maxSegments?}}` -> `{type:'prepared',requestId,revision,sourceHash,anchorHash,epoch,positions,samples64,indices,segmentOwners,owners,quality,prepTimeMs}` or a bound `type:'error'`. `{type:'cancel'}` invalidates work; stale epochs/revisions are dropped. The old `projectHyperbolicPatch`/`projectHyperbolicSteps` export names alias the new preparers, which reject pose/screen options. A failed worker falls back to cooperative main-thread preparation.
7. Reserved control IDs stay unchanged: `hyperbolic-model` -> `setProjection`; `hyperbolic-radius` (NumericEntry, default 3/max 5) and `hyperbolic-layers` (default 3/max 12) -> new page generation; `hyperbolic-pause` -> pause fetching; `hyperbolic-explore` (Explore inside) -> `enterExplore()`; `hyperbolic-home` (Return to center) -> `home()`. Home resets to the current bounded anchor without rebuilding geometry. An explicit Look with pointer action may call `capturePointer(event)` on pointerdown. Keep WASD/arrows/Escape guidance visible. Only the four regular `1000` presets and small cover belong in this round. E owns registration of the two Node test files in shared `package.json`.

## Measurements (13 November 2026)

Precision fixture: four engine regular templates (provenance in `tests/fixtures/hyperbolic/regular-display-templates.json`), cell-center radii 0/1/2/3 in 12 directions, nine observer poses through displacement 0.99, and near-eye probes. The 25,740 retained float64 samples reach anchor radius 4.901903 because cell vertices extend beyond their centers. Float32 reference arithmetic includes attribute/uniform rounding, Lorentz projection, and the camera's float32 view/projection matrices at 1920x1080, FOV 50 degrees, near 0.002.

| View/model | Max float32 ball error | Max screen error (px) |
| --- | ---: | ---: |
| Overview Poincare | 1.280e-7 | 0.00006762 |
| Overview Klein | 1.208e-7 | 0.00007501 |
| Explore Poincare | 9.277e-7 | 0.014670 |
| Explore Klein | 1.016e-6 | 0.055805 |

The maximum float64 `abs(<X,X>+1)` remained **4.8211e-12**, below the unchanged `1e-8` gate; retained input arrays are checked unchanged. Shader-equivalence regression ceilings are `2e-5` ball units / `0.5 px` for this sampled domain. These measurements are empirical, not an interval bound for every point, camera zoom, GPU arithmetic order or the maximum radius 5. The actual mounted GPU transform-feedback check tested 1,792 additional projections through anchor radius 4.903: maximum ball error `5.523e-7`, with zero difference from the JS float32 reference on SwiftShader.

Fixed-LOD chord approximation is separate: at normal LOD, all four templates, center radii 0..3, 12 directions and the default overview camera, 195,552 interior Poincare probes measured maximum deviation **0.002005 ball units / 0.632946 px**. Klein chords were straight to float64 roundoff (34,272 probes). There is no global one-pixel guarantee; zooming and different LODs change these errors. Precision and chord errors must not be described as exact geometry.

Benchmark: Intel i7-14700K, headless Chromium, ANGLE/Vulkan SwiftShader, 1920x1080, pixel ratio 1, 4,096 synthetic cubes with center radii up to 3. Normal Poincare LOD retained 49,152 edges / 98,304 segments with no quality cap. One run measured:

- First 256-cell page: **29.5 ms worker preparation**, 38.4 ms until publication.
- Full patch after appending the remaining pages: **541.7 ms preparation**, 628.4 ms until publication; 3,072 previously sampled edges were reused.
- 120 frames with look and alternating boosts, including `gl.finish()` each frame: **39.05 draw fps and 39.05 pose updates/second**.
- **Zero preparation jobs or buffer replacements during navigation**; float64 developed/sample residual `1.564e-13`.

This establishes usable pose throughput in this recorded software-rendered synthetic test. It is not a packaged-desktop or real-honeycomb hardware performance certificate.

## Verification and remaining work

`node --test tests/hyperbolic-math.test.mjs tests/hyperbolic-viewer.test.mjs`: **30 passed**, covering precision/LOD measurements, real GPU projection, actual hard caps, cache reuse/eviction, validation, stale/cancelled preparation, navigation/rebase, keyboard/capture, identity picking, worker-failure fallback and disposal. Existing adaptive-math helper regressions remain, but those helpers are no longer used for rendering.

`npx.cmd vite build --configLoader native` and a separate production library build of the viewer/worker pass. Prettier checks pass. The three-cube fixture remains hand-built; the regular display fixture comes from the engine and supplies no independent incidence/growth certificate.

E/F still own workspace/control mounting, native rebase wiring, mixed-document persistence and desktop qualification. Picking intentionally scans on demand and may be slower on dense patches. Maximum-radius/other-GPU precision, extreme overview zoom and real honeycomb desktop performance remain unmeasured. No shared app files, engine dispatch, package registration or Euclidean/4D math are changed by this follow-up.
