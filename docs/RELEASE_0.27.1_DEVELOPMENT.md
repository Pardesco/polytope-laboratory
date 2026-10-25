# 0.27.1: dual-morph playback and controls

Local development preview, October 21, 2026. Feature expansion remains paused.
This continues the core-experience improvements in 0.27.0. Existing public
downloads and the reviewed 0.27.0 portable are preserved.

## Observable changes

- Dual morph opens in a bounded panel above the bottom toolbar. Expanding its
  controls no longer enlarges the toolbar or squeezes the model viewport.
- The method initially matches the selected model: sizing for eligible 3D
  models, expansion for eligible 4D models. Switching to a new model clears the
  previous model's radius and uses automatic sizing again. Saved projects keep
  their actual numeric radius and other settings.
- Replay starts again from the endpoint; Play resumes an intermediate pose.
  Scrubbing pauses playback and publishes the requested pose. Canceled native
  playback requests cannot discard that pose or produce a cancellation alert.
- Morph poses retain their four base rendering materials, keeping compiled
  shader programs alive. Geometry, normals, incidence, source selection and
  ownership are still rebuilt for each pose, including changing endpoints.
  Reset and model replacement release retained materials normally.
- The bundled guide explains sizing, replay, scrubbing and saved poses.

## Visible-window measurement

The repeatable workload is a four-second sizing morph of the supplied truncated
tetrahedron, with automatic radius 0.3994636211547385. Both runs use the normal
visible desktop window, an isolated profile, a 1484 by 895 content area, and a
DevTools CPU profile. Hardware: Intel Core i7-14700K, 28 logical processors,
63.7 GiB RAM, Windows 10.0.26200; WebGL and GPU composition enabled.

| Observation | Before | After changes |
| --- | ---: | ---: |
| Published pose updates over approximately four seconds | 273 | 273 |
| Mean interval between pose updates | 14.80 ms | 14.84 ms |
| CPU samples in shader source/info-log calls | 739 / 2628 | 0 / 2537 |
| Browser animation-callback interval, 95th percentile | 11.0 ms | 5.7 ms |
| Browser long tasks (over 50 ms) | 0 | 0 |

The material change removes the observed repeated shader-compilation work.
It did not increase pose publication throughput in this comparison. These are
single local, profiled observations, including the corrected panel layout and
its larger model viewport. They do not isolate every timing effect of material
reuse. Pose publications, animation callbacks,
GPU completion and monitor presentation are distinct; this is not a general
FPS claim. Native evaluation, serialization, geometry rebuilding and control
updates still cost time, especially for larger models. The hidden-window
scheduling limitations described for 0.27.0 still apply.

Before: `artifacts/morph-playback-fWLFyW/result.json` and `playback.cpuprofile`.
After: `artifacts/morph-playback-9USmED/result.json` and `playback.cpuprofile`.
Screenshots in both folders retain the observed layout.

Run the benchmark with `npm.cmd run benchmark:morph -- --visible`. Omitting
`--visible` measures the separate hidden-window scheduling environment.

## Verification

All 93 focused Node tests pass. They exercise native morph frames, source ownership, mapped
text/PNG, cancellation, changing endpoint topology, and material disposal.
The actual desktop workflow verifies keyboard opening/Escape, sibling panels,
1200 by 760 and 1500 by 950 layouts, replay, scrub interruption, PNG capture,
native Save/Open and Reset while checking source preservation.

Development workflow receipt: `artifacts/morph-workflow-cNMfOx/result.json`.
The first actual scrub test reproduced the native cancellation race; its failure
evidence is retained at `artifacts/morph-workflow-VSn8Rd`.

The existing 0.26 quick workflow also passes real morph PNG/WebM exports,
fitted ordinary/generalized folding captures, concave/holed 4D cell sections,
and section promotion with Save/Open:
`artifacts/feature-0.26-quick-v3Pfw0/result.json`.

Use `npm.cmd run test:morph-workflow -- --visible` for the actual desktop
workflow; `POLYTOPE_TEST_EXECUTABLE` selects a matching unpacked local build.
The packaged app passes the same workflow with development Python unavailable:
`artifacts/morph-workflow-Trty53/result.json`. The separate packaged core check
also passes actual dual/truncation/scale buttons with Undo, Inspector disclosures,
native Save/Open and matched morph endpoint bounds:
`artifacts/core-experience-L5yGTI/result.json`.

The actual self-extracting portable launches and computes a cube dual and an
intermediate truncated-tetrahedron morph using its bundled engine. Its extracted
archive and all engine resources match the tested unpacked candidate (1,716
files): `artifacts/portable-launch-WMjwjA/result.json`.

The portable is `release/preview-0.27.1/Polytope Laboratory 0.27.1 preview.exe`.
It is 143,225,397 bytes; SHA-256:
`6f95b2d5c1a86fd01fa142c489c8cef929714b5759e373bbd7c72293415d4616`.
`release/preview-0.27.1/verification.json` checks packaged desktop/UI bytes against
the current source and retains workflow receipts and protected importer hashes.
The 0.27.0 reviewed executable remains unchanged. Nothing was published online.

The first expanded check found six old test fixtures lacking the renderer's
`setClearColor` method. Their doubles now implement that API; production
appearance handling was unchanged. Initial failures and the final 93-test TAP
report are retained under `artifacts/morph-focused-0.27.1*.tap`.

No full regression, new mathematical domain or feature-parity claim is made
by this patch.
