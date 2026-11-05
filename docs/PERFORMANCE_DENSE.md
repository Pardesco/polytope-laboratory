# W25: dense-model interaction CPU measurements

Measured 2026-10-26, baseline `46f28bc4c6ce1af81bcb51f1617bca2a99b3996b`.
This slice improves existing renderer interactions; native geometry, operations,
project state, Undo/Redo and saved display preferences keep their existing contracts.
No Electron launch or GPU qualification was performed.

## Changes and UI walkthrough

- Choose a dense source in the Library, then use **4D projection** (`projection`)
  and **Rotate** (`auto-rotate`). Rotation coefficients are prepared once per
  display; surface and edge buffers are written without intermediate flattened
  arrays. Rotation order and floating-point operations remain the same.
- In **Analysis → Selection**, choose **Kind** (`selection-kind`) and **Index**
  (`selection-id`), then **Identify & highlight** (`select-entity`). Existing
  entity/type sets also use this path. Highlight lines and fills retain their
  GPU attributes for equal sizes; size changes dispose the old allocation.
  Highlight extraction reads scalar coordinates and packed source-owner arrays,
  while retaining the original coordinate-based boundary cancellation, degeneracy
  threshold, ordering and resource diagnostics.
- Move the pointer over the viewport to identify the chosen entity kind.
  Vertex/edge picking uses a lazily prepared screen-space grid, followed by the
  original exact pixel-distance tests and stable source-ID ordering. Face/cell
  ray picking is unchanged. The one-entry cache is bound to the published pose,
  camera matrices, CSS dimensions, pick kind and GPU position-buffer versions.
  Source replacement/clear releases it. Grid insertion is limited to 262,144
  references; primitives spanning over 64 bins and overflow primitives remain
  in an exhaustive fallback list. No source entities are simplified or omitted.
- Open **Appearance** (`surface-settings`). **Color by** (`surface-colors`) reuses
  ordinary writable RGBA attributes; **Cell** (`visible-cell-id`), **Hide**
  (`hide-cell`), **Isolate** (`isolate-cell`) and **Show all** (`show-all-cells`)
  retain their existing behavior. Visibility changes are measured, with no new
  visibility cache or native operation.

## Reproduction and definitions

From the repository root:

```powershell
python -B scripts/dense-model-corpus.py artifacts/dense-corpus
node scripts/profile-dense-model.cjs --snapshot=artifacts/dense-baseline
node scripts/profile-dense-model.cjs --output=artifacts/dense-before.json
# Apply the optimization, then run the same workload:
node scripts/profile-dense-model.cjs --output=artifacts/dense-after.json
# A preserved baseline can also be rerun after applying the change:
node scripts/profile-dense-model.cjs --viewer=artifacts/dense-baseline/viewer.mjs --output=artifacts/dense-before.json
```

The snapshot command must run before modifying production sources. It freezes
Viewer and selection-highlight imports; other existing dependencies remain shared.
Options `--keys=cell120,uniform4-tex`, `--samples=9`, `--warmup=3` and
`--corpus=path` narrow or repeat a run. The harness never imports Electron.

The real `Viewer` runs with Three.js CPU geometry/camera math and the existing
`fakeRenderer` contract at 1920 × 1080 CSS pixels. The observer is parallel,
half-height 2, at `[0,0,6]`. Projection-mode names below refer to the **4D**
projection, independently of the observer camera. Each task has three warm-ups
and nine timed samples; median and IQR use linear-interpolated quantiles.
These are synchronous CPU wall times, excluding GPU drawing/upload, browser
layout, Electron, IPC, worker scheduling/transfer and native source construction.
They do not establish FPS, whole-app latency or §14 hardware acceptance.

- **Rotation:** a changing XW angle, projection, normals, bounds, colors when
  required, primitive/buffer updates and publication. Selected-rotation tasks
  additionally include the overlay update with every fifth edge/face selected.
- **Highlight E/F:** `updateEntitySelection` alone, with every fifth source
  edge/face selected. Each sample follows a changed pose outside the timed span.
- **Hover V/E/F:** the existing hover `pickAt` entry point after warm-up on the
  same published pose, using nearby pointer coordinates. **First hover** uses a
  freshly published rotated pose before each sample, excluding that preparation
  time but including any lazy screen-index construction in the timed pick.
- **Visibility:** alternate hiding cell 0 and showing all, including surface
  preparation and display. A 3D source has no 4D cells and is explicitly N/A.
- **Type color:** alternate face-type/cell-type display updates. Two explicitly
  synthetic palette groups exercise the renderer; symmetry classification is
  outside timing and no orbit/type certification is inferred from those groups.
- **Stereographic:** the actual synchronous fallback computes, validates and
  packs the same worker geometry at the idle sampled-error quality (one-pixel
  criterion, with the existing bounds). It is deliberately not the asynchronous
  interaction scheduler or its coarser motion quality. Existing clipping, partial
  output, budgets and complete/current capture refusals remain in force.
- The five-rhombicuboctahedra compound is 3D: its rotation varies XY, and the
  three requested projection settings use the ordinary 3D display path.

The corpus is generated by the existing native engine, including full incidence:

| Key | Vertices | Edges | Faces | Cells |
| --- | ---: | ---: | ---: | ---: |
| cell120 | 600 | 1200 | 720 | 120 |
| cell600 | 120 | 720 | 1200 | 600 |
| uniform4-gap (grand antiprism) | 100 | 500 | 720 | 320 |
| uniform4-rox (rectified 600-cell) | 720 | 3600 | 3600 | 720 |
| uniform4-tex (truncated 600-cell) | 1440 | 4320 | 3600 | 720 |
| compound-five-24-cells | 120 | 480 | 480 | 120 |
| compound-five-rhombicuboctahedra (3D) | 120 | 240 | 130 | 0 |

## Verification and limits

`node --test --test-concurrency 1` on every `tests/viewer*.test.mjs` plus
`dense-display`, `dense-model-benchmark`, `entity-picking`, `stereographic-viewer`,
`explosion-viewer`, `section-viewer`, `display-frame`, `element-types`,
`perspective4d`, `stereographic-typed-display`, and `dual-morph-picking`:
**189 passed**, no failures/skips. New suites are in `test:features`.

`python -m pytest tests/test_regular4d_validation.py tests/test_compound_library.py -q -p no:cacheprovider`:
**154 passed**. `npx.cmd vite build --configLoader native`: **passed**, 196 modules;
the existing large-chunk warning remains. Logs are under `artifacts/dense-*.tap`
and `artifacts/dense-build.log` in this worktree.

Equality coverage compares the optimized projection against `projectDisplayPoint`,
surface Float32 buffers against the original computation, highlight arrays against
a frozen pre-change implementation, and grid picks against exhaustive traversal
(including long segments, exhausted grid budget, tangencies and duplicate owners).
Tests cover retained GPU handles, resize disposal/bounds, source/pose/camera/viewport/
buffer invalidation, resource-limit refusal, source colors/types, nets, explosion,
morphs and asynchronous published-pose picking/selection.

The remaining major bottleneck is dense stereographic tessellation/validation.
This slice does not change its approximation criteria or claim complete surfaces.
The first hover on a new pose pays projection/index construction; repeated picks
benefit most while the view is stationary. Face/cell ray picking and visibility
reconstruction remain candidates for subsequent measured work. Native classification
availability and limits are unchanged. GPU upload/rendering and real desktop motion,
hidden-window behavior, integrated/discrete GPUs and peak memory still need desktop
qualification; this benchmark makes no claim about those measurements.

## Before/after measurements

Tables and the machine/runtime record below are generated from the complete raw
receipts in `PERFORMANCE_DENSE_RESULTS.json`. Numbers are milliseconds, written
as **median (IQR)**; low-duration results and small differences are sensitive to
JIT, GC, thermal state and other processes. Source geometry hashes and displayed
primitive counts must match before/after. Both gains and regressions are retained.


Runtime: **Intel(R) Core(TM) i7-14700K**, **win32 10.0.26200**, **Node v24.22.1**.
Each cell is **before -> after**, median (IQR) in ms. The observer frustum
is fixed at [-2,2] in X and Y; no Fit or GPU rendering is timed.

For the 120-cell, orthographic rotation changed from 1.366 to 0.652 ms;
stereographic face highlighting changed from 89.356 to 37.724 ms. Its full
stereographic rotation remained 531.012 -> 532.033 ms. Repeated stereographic
edge hover changed from 2.095 to 0.018 ms, while the first edge hover after
a pose change rose from 2.414 to 3.615 ms. The latter pays the lazy index
build. Similar first-pick regressions occur across the corpus.

### Display updates and isolated highlights

| Model / 4D projection | Rotation | Highlight E | Highlight F | Visibility | Type color |
| --- | ---: | ---: | ---: | ---: | ---: |
| 120-cell / Ortho | 1.366 (0.165) -> 0.652 (0.053) | 0.213 (0.043) -> 0.032 (0.004) | 1.558 (0.256) -> 0.771 (0.115) | 6.883 (0.686) -> 6.577 (1.607) | 2.022 (0.118) -> 1.500 (0.183) |
| 120-cell / Persp | 5.883 (1.346) -> 5.599 (1.485) | 0.170 (0.005) -> 0.032 (0.005) | 1.237 (0.050) -> 0.646 (0.016) | 9.044 (1.495) -> 8.310 (0.944) | 1.833 (0.121) -> 1.627 (0.283) |
| 120-cell / Stereo | 531.012 (62.388) -> 532.033 (26.440) | 0.668 (0.096) -> 0.195 (0.045) | 89.356 (10.108) -> 37.724 (3.617) | 500.811 (52.524) -> 503.714 (8.210) | 498.081 (18.306) -> 508.672 (24.617) |
| 600-cell / Ortho | 0.673 (0.031) -> 0.334 (0.027) | 0.137 (0.018) -> 0.052 (0.013) | 0.752 (0.028) -> 0.447 (0.023) | 5.794 (0.225) -> 5.545 (0.638) | 1.432 (0.005) -> 1.181 (0.023) |
| 600-cell / Persp | 1.851 (0.407) -> 1.555 (0.136) | 0.125 (0.030) -> 0.026 (0.006) | 0.699 (0.027) -> 0.357 (0.059) | 6.494 (0.934) -> 6.869 (0.209) | 1.430 (0.043) -> 1.214 (0.013) |
| 600-cell / Stereo | 496.974 (42.491) -> 479.016 (37.092) | 0.716 (0.021) -> 0.105 (0.008) | 70.919 (1.402) -> 27.718 (1.754) | 484.330 (32.465) -> 502.155 (25.110) | 496.683 (16.115) -> 520.718 (44.899) |
| Grand antiprism / Ortho | 0.439 (0.012) -> 0.179 (0.016) | 0.079 (0.000) -> 0.015 (0.004) | 0.464 (0.010) -> 0.259 (0.009) | 3.979 (0.391) -> 4.045 (0.493) | 0.912 (0.047) -> 0.758 (0.043) |
| Grand antiprism / Persp | 1.077 (0.044) -> 0.964 (0.016) | 0.081 (0.007) -> 0.018 (0.006) | 0.432 (0.027) -> 0.218 (0.009) | 4.586 (0.394) -> 4.336 (0.606) | 0.872 (0.007) -> 0.766 (0.022) |
| Grand antiprism / Stereo | 510.434 (19.900) -> 546.700 (45.994) | 0.475 (0.015) -> 0.079 (0.002) | 65.632 (2.662) -> 24.634 (0.722) | 492.446 (23.595) -> 488.568 (21.439) | 492.150 (12.613) -> 501.778 (22.033) |
| rox / Ortho | 1.614 (0.257) -> 0.763 (0.081) | 0.544 (0.014) -> 0.115 (0.007) | 2.259 (0.028) -> 1.286 (0.030) | 17.953 (0.618) -> 17.373 (1.065) | 3.896 (0.067) -> 3.113 (0.188) |
| rox / Persp | 6.802 (1.582) -> 7.029 (0.833) | 0.562 (0.015) -> 0.130 (0.006) | 2.272 (0.234) -> 1.144 (0.037) | 25.278 (1.737) -> 24.541 (1.126) | 4.084 (0.078) -> 3.259 (0.090) |
| rox / Stereo | 586.808 (36.572) -> 588.551 (15.354) | 1.745 (0.021) -> 0.325 (0.035) | 80.394 (4.787) -> 34.707 (2.818) | 587.599 (11.823) -> 589.533 (15.454) | 551.585 (26.618) -> 585.308 (32.546) |
| tex / Ortho | 2.813 (0.048) -> 1.343 (0.118) | 0.643 (0.032) -> 0.150 (0.015) | 4.497 (0.126) -> 2.568 (0.024) | 25.923 (1.630) -> 25.471 (1.073) | 6.216 (0.224) -> 4.788 (0.080) |
| tex / Persp | 13.018 (0.108) -> 12.188 (0.391) | 0.669 (0.013) -> 0.173 (0.010) | 4.410 (0.056) -> 2.347 (0.071) | 37.316 (1.499) -> 36.307 (3.537) | 6.273 (0.231) -> 4.974 (0.081) |
| tex / Stereo | 614.808 (14.550) -> 613.932 (38.507) | 1.452 (0.075) -> 0.270 (0.017) | 68.084 (1.419) -> 30.204 (3.714) | 561.160 (46.821) -> 591.597 (21.897) | 554.937 (30.465) -> 567.907 (32.217) |
| 5 x 24-cells / Ortho | 0.291 (0.007) -> 0.133 (0.040) | 0.071 (0.001) -> 0.011 (0.000) | 0.302 (0.016) -> 0.173 (0.004) | 2.457 (0.101) -> 2.306 (0.094) | 1.553 (0.120) -> 1.371 (0.020) |
| 5 x 24-cells / Persp | 0.811 (0.068) -> 0.802 (0.157) | 0.071 (0.001) -> 0.012 (0.000) | 0.264 (0.019) -> 0.137 (0.008) | 3.040 (0.430) -> 3.071 (0.239) | 1.488 (0.058) -> 1.440 (0.020) |
| 5 x 24-cells / Stereo | 447.632 (50.123) -> 456.678 (47.766) | 0.788 (0.012) -> 0.113 (0.004) | 71.692 (3.105) -> 28.006 (1.482) | 455.764 (21.499) -> 442.715 (19.894) | 448.904 (17.617) -> 447.113 (24.993) |
| 5 x rhombicuboctahedra (3D) / Ortho | 0.373 (0.092) -> 0.091 (0.116) | 0.063 (0.025) -> 0.005 (0.000) | 0.169 (0.111) -> 0.074 (0.001) | N/A -> N/A | 0.820 (0.035) -> 0.631 (0.041) |
| 5 x rhombicuboctahedra (3D) / Persp | 0.189 (0.014) -> 0.071 (0.008) | 0.046 (0.000) -> 0.005 (0.000) | 0.139 (0.048) -> 0.075 (0.003) | N/A -> N/A | 0.805 (0.074) -> 0.664 (0.048) |
| 5 x rhombicuboctahedra (3D) / Stereo | 0.115 (0.003) -> 0.064 (0.002) | 0.037 (0.001) -> 0.005 (0.000) | 0.166 (0.041) -> 0.073 (0.001) | N/A -> N/A | 0.703 (0.043) -> 0.669 (0.035) |

### Hover: repeated pose versus first pick after a new pose

| Model / 4D projection | Warm V | Warm E | Warm F | First V | First E | First F |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 120-cell / Ortho | 0.104 (0.014) -> 0.030 (0.012) | 1.258 (0.482) -> 0.027 (0.003) | 0.189 (0.063) -> 0.183 (0.063) | 0.105 (0.030) -> 0.218 (0.045) | 0.969 (0.146) -> 1.642 (0.459) | 0.109 (0.008) -> 0.106 (0.017) |
| 120-cell / Persp | 0.080 (0.001) -> 0.011 (0.000) | 0.997 (0.100) -> 0.017 (0.001) | 0.098 (0.003) -> 0.097 (0.004) | 0.099 (0.029) -> 0.216 (0.018) | 0.842 (0.014) -> 1.203 (0.144) | 0.130 (0.010) -> 0.124 (0.009) |
| 120-cell / Stereo | 0.193 (0.001) -> 0.009 (0.001) | 2.095 (0.087) -> 0.018 (0.000) | 3.124 (0.216) -> 3.065 (0.024) | 0.268 (0.070) -> 0.407 (0.044) | 2.414 (0.265) -> 3.615 (0.897) | 3.326 (0.230) -> 3.315 (0.312) |
| 600-cell / Ortho | 0.037 (0.006) -> 0.014 (0.001) | 0.638 (0.029) -> 0.020 (0.001) | 0.084 (0.001) -> 0.091 (0.049) | 0.030 (0.001) -> 0.064 (0.005) | 0.516 (0.077) -> 0.901 (0.029) | 0.079 (0.003) -> 0.083 (0.004) |
| 600-cell / Persp | 0.022 (0.001) -> 0.012 (0.001) | 0.507 (0.002) -> 0.016 (0.001) | 0.070 (0.001) -> 0.073 (0.002) | 0.034 (0.004) -> 0.062 (0.006) | 0.523 (0.052) -> 0.829 (0.014) | 0.089 (0.005) -> 0.088 (0.017) |
| 600-cell / Stereo | 0.043 (0.002) -> 0.012 (0.001) | 2.988 (0.152) -> 0.016 (0.001) | 2.796 (0.068) -> 2.963 (0.070) | 0.088 (0.033) -> 0.206 (0.051) | 3.491 (0.585) -> 5.036 (0.573) | 2.963 (0.057) -> 3.166 (0.051) |
| Grand antiprism / Ortho | 0.031 (0.001) -> 0.007 (0.001) | 0.363 (0.014) -> 0.012 (0.001) | 0.046 (0.024) -> 0.061 (0.002) | 0.029 (0.000) -> 0.056 (0.001) | 0.346 (0.156) -> 0.637 (0.025) | 0.046 (0.002) -> 0.066 (0.002) |
| Grand antiprism / Persp | 0.020 (0.001) -> 0.007 (0.001) | 0.347 (0.003) -> 0.012 (0.001) | 0.041 (0.001) -> 0.061 (0.012) | 0.028 (0.008) -> 0.058 (0.003) | 0.358 (0.017) -> 0.655 (0.083) | 0.052 (0.002) -> 0.057 (0.012) |
| Grand antiprism / Stereo | 0.022 (0.001) -> 0.007 (0.001) | 2.016 (0.282) -> 0.009 (0.001) | 2.828 (0.065) -> 3.115 (0.031) | 0.051 (0.010) -> 0.113 (0.012) | 2.159 (0.231) -> 3.108 (0.372) | 3.068 (0.095) -> 3.314 (0.150) |
| rox / Ortho | 0.128 (0.013) -> 0.013 (0.001) | 2.540 (0.358) -> 0.029 (0.001) | 0.173 (0.005) -> 0.184 (0.001) | 0.076 (0.005) -> 0.267 (0.034) | 2.540 (0.141) -> 4.040 (0.530) | 0.206 (0.022) -> 0.192 (0.002) |
| rox / Persp | 0.162 (0.017) -> 0.013 (0.001) | 2.575 (0.125) -> 0.030 (0.004) | 0.169 (0.002) -> 0.182 (0.001) | 0.099 (0.005) -> 0.270 (0.040) | 2.430 (1.262) -> 4.379 (1.702) | 0.244 (0.011) -> 0.240 (0.015) |
| rox / Stereo | 0.263 (0.029) -> 0.014 (0.001) | 7.624 (0.506) -> 0.035 (0.002) | 5.293 (2.378) -> 3.172 (0.038) | 0.281 (0.063) -> 0.485 (0.084) | 8.265 (0.293) -> 11.159 (1.126) | 3.081 (0.035) -> 3.286 (0.106) |
| tex / Ortho | 0.166 (0.073) -> 0.015 (0.001) | 2.816 (0.180) -> 0.031 (0.001) | 0.293 (0.005) -> 0.313 (0.003) | 0.105 (0.003) -> 0.538 (0.083) | 2.951 (0.252) -> 4.372 (0.883) | 0.312 (0.019) -> 0.338 (0.025) |
| tex / Persp | 0.205 (0.153) -> 0.014 (0.002) | 2.888 (0.239) -> 0.022 (0.001) | 0.290 (0.006) -> 0.310 (0.005) | 0.137 (0.066) -> 0.534 (0.142) | 2.984 (0.440) -> 4.315 (2.239) | 0.348 (0.015) -> 0.384 (0.032) |
| tex / Stereo | 0.215 (0.005) -> 0.014 (0.001) | 6.227 (0.752) -> 0.025 (0.004) | 2.450 (0.043) -> 2.722 (0.028) | 0.247 (0.014) -> 0.795 (0.047) | 6.639 (0.845) -> 8.644 (0.794) | 2.739 (0.070) -> 2.937 (0.057) |
| 5 x 24-cells / Ortho | 0.025 (0.001) -> 0.003 (0.000) | 0.311 (0.007) -> 0.013 (0.000) | 0.033 (0.006) -> 0.042 (0.007) | 0.011 (0.001) -> 0.057 (0.005) | 0.312 (0.008) -> 0.672 (0.057) | 0.033 (0.001) -> 0.040 (0.001) |
| 5 x 24-cells / Persp | 0.010 (0.001) -> 0.003 (0.000) | 0.320 (0.015) -> 0.013 (0.000) | 0.033 (0.001) -> 0.041 (0.012) | 0.015 (0.003) -> 0.046 (0.001) | 0.321 (0.006) -> 0.631 (0.002) | 0.040 (0.005) -> 0.042 (0.004) |
| 5 x 24-cells / Stereo | 0.041 (0.000) -> 0.003 (0.000) | 3.260 (0.142) -> 0.008 (0.000) | 2.670 (0.049) -> 2.998 (0.077) | 0.060 (0.030) -> 0.103 (0.010) | 3.453 (0.545) -> 4.594 (0.751) | 2.845 (0.056) -> 3.030 (0.037) |
| 5 x rhombicuboctahedra (3D) / Ortho | 0.068 (0.033) -> 0.002 (0.000) | 0.284 (0.078) -> 0.003 (0.000) | 0.081 (0.017) -> 0.017 (0.001) | 0.029 (0.004) -> 0.055 (0.001) | 0.407 (0.147) -> 0.316 (0.004) | 0.051 (0.030) -> 0.016 (0.000) |
| 5 x rhombicuboctahedra (3D) / Persp | 0.022 (0.002) -> 0.002 (0.000) | 0.298 (0.056) -> 0.004 (0.000) | 0.020 (0.001) -> 0.017 (0.001) | 0.019 (0.001) -> 0.046 (0.000) | 0.259 (0.062) -> 0.290 (0.006) | 0.022 (0.003) -> 0.015 (0.000) |
| 5 x rhombicuboctahedra (3D) / Stereo | 0.019 (0.000) -> 0.002 (0.000) | 0.164 (0.008) -> 0.004 (0.000) | 0.019 (0.004) -> 0.017 (0.000) | 0.014 (0.001) -> 0.046 (0.002) | 0.166 (0.010) -> 0.292 (0.003) | 0.016 (0.002) -> 0.016 (0.002) |

### Rotation with a source set selected (includes highlight work)

| Model / 4D projection | Selected E | Selected F |
| --- | ---: | ---: |
| 120-cell / Ortho | 1.237 (0.182) -> 0.443 (0.017) | 2.453 (0.240) -> 1.192 (0.200) |
| 120-cell / Persp | 3.453 (0.832) -> 2.979 (0.935) | 5.734 (1.909) -> 4.401 (0.969) |
| 120-cell / Stereo | 578.905 (140.215) -> 535.341 (62.996) | 628.424 (47.094) -> 583.960 (23.715) |
| 600-cell / Ortho | 0.661 (0.020) -> 0.294 (0.020) | 1.241 (0.012) -> 0.656 (0.009) |
| 600-cell / Persp | 1.766 (0.102) -> 1.489 (0.042) | 2.466 (0.171) -> 1.860 (0.055) |
| 600-cell / Stereo | 502.394 (58.177) -> 492.940 (47.366) | 585.947 (35.070) -> 518.231 (46.725) |
| Grand antiprism / Ortho | 0.415 (0.073) -> 0.191 (0.003) | 0.822 (0.028) -> 0.446 (0.027) |
| Grand antiprism / Persp | 1.344 (0.024) -> 0.993 (0.016) | 1.799 (0.280) -> 1.206 (0.029) |
| Grand antiprism / Stereo | 512.863 (21.922) -> 518.375 (33.324) | 576.446 (56.790) -> 552.111 (33.214) |
| rox / Ortho | 2.243 (0.140) -> 0.897 (0.010) | 4.054 (0.416) -> 2.138 (0.010) |
| rox / Persp | 7.678 (1.603) -> 6.465 (1.553) | 10.135 (1.667) -> 8.180 (1.560) |
| rox / Stereo | 568.379 (35.976) -> 579.379 (11.978) | 651.355 (22.222) -> 609.405 (17.335) |
| tex / Ortho | 3.488 (0.100) -> 1.526 (0.039) | 7.596 (0.656) -> 4.198 (0.082) |
| tex / Persp | 13.519 (0.559) -> 12.149 (0.077) | 17.461 (1.713) -> 14.852 (0.833) |
| tex / Stereo | 594.338 (67.634) -> 609.526 (60.540) | 670.708 (53.413) -> 640.508 (5.406) |
| 5 x 24-cells / Ortho | 0.324 (0.009) -> 0.142 (0.002) | 0.558 (0.009) -> 0.309 (0.006) |
| 5 x 24-cells / Persp | 0.797 (0.028) -> 0.713 (0.081) | 1.030 (0.009) -> 0.870 (0.004) |
| 5 x 24-cells / Stereo | 484.645 (33.297) -> 496.731 (54.266) | 557.864 (66.168) -> 527.080 (77.596) |
| 5 x rhombicuboctahedra (3D) / Ortho | 0.322 (0.132) -> 0.082 (0.001) | 0.375 (0.159) -> 0.153 (0.002) |
| 5 x rhombicuboctahedra (3D) / Persp | 0.203 (0.012) -> 0.071 (0.001) | 0.329 (0.028) -> 0.151 (0.001) |
| 5 x rhombicuboctahedra (3D) / Stereo | 0.156 (0.007) -> 0.071 (0.001) | 0.292 (0.059) -> 0.150 (0.003) |

### Stereographic output limits retained

At the final type-color pose, before/after status and displayed counts match.
These are retained display primitives, not completeness claims. All six 4D
filled views have unresolved surface primitives and keep their explicit
clipping/resource diagnostics; capture completeness is not established.

| Model | Displayed segments | Displayed triangles | Clipped source triangles | Unresolved source triangles |
| --- | ---: | ---: | ---: | ---: |
| 120-cell | 3436 | 95178 | 871 | 33 |
| 600-cell | 4909 | 84555 | 363 | 82 |
| Grand antiprism | 3516 | 88252 | 727 | 36 |
| rox | 12539 | 90859 | 635 | 72 |
| tex | 10129 | 74148 | 250 | 1101 |
| 5 x 24-cells | 5346 | 82904 | 204 | 83 |

A supplementary comparison of the preserved original and optimized Viewer
passed **21 native-corpus model/mode pairs**: every position/normal/color
attribute, projected double, display status, edge/face overlay and twelve
source hover results per pair matched. The receipt includes source geometry
hashes, raw timings, statuses, runtime source hashes and these equality results.
