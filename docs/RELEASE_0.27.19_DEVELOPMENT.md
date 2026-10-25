# 0.27.19: stop cloning unannotated models during rotation

Local development preview, October 22, 2026. Feature expansion remains paused;
public production remains 0.26.0. Nothing was published online. Earlier local
portable/source pairs remain preserved.

Presentation updates, including automatic 4D header rotation, refreshed element
content even when its document was
absent. That path cloned, validated and serialized the complete source before
discovering there was nothing to paint. The actual bundled 0.27.18 profile found
substantial renderer CPU time in memory/source validation during rotation:
`artifacts/model-view-profile-nX9H47/result.json`, with raw `rotation.cpuprofile`.
The initial exploratory harness used an incorrect catalog name selector; its
failure remains preserved separately and is not a measurement baseline.

Absent annotation documents now clear overlays without traversing source
geometry. The clear remains bound to the current state, viewer model/net and
request. A delayed empty clear cannot erase newly requested content or a new
workspace. Removing annotations cancels their old preparation, and retired native
failures are treated as cancellation. Viewer checks ownership before destroying
the current overlay. Superseded observer refreshes stay quiet.

Explicit annotation documents, including empty records, retain the complete
descriptor/source validation path. Empty ordinary-cell section correspondence and
plane checks run before the new path. Text, PNG, source attributes, numerical
domains and source publication guards remain intact. No native algorithm changed.

## Measurement scope and development verification

The task uses a fresh profile, a 1500 by 950 window, default single view and two
Library passes over the 120-cell, 600-cell and Grand hexacosichoron. It records
first submitted model draw, native-job settlement, actual shader lifetime calls,
renderer CPU samples and a 1.5-second header-rotation task on the last model.
Native Save before/after rotation must preserve the complete source and notes;
angles must change. Source counts and the absent-annotation workload are checked.
Hardware is an Intel Core i7-14700K, 28 logical CPUs, approximately 63.7 GiB RAM,
Windows 10.0.26200. RAF cadence is scheduling/render submission evidence, not an
isolated GPU timer or general FPS guarantee.

The development profile `artifacts/model-view-profile-XFG880/result.json` no
longer shows the source walkers among the rotation hotspots. It is an interim
observation; no model-loading latency improvement is claimed from that run.
The final actual bundled comparison is recorded in
`artifacts/model-view-comparison-0.27.19.json`. Baseline 0.27.18 is
`artifacts/model-view-profile-nX9H47/result.json`; current 0.27.19 is
`artifacts/model-view-profile-YTlmPn/result.json`. The six generated source models
match except their newly generated model IDs and provenance source IDs. Each run
independently preserves its complete saved model and notes, including IDs.

| Rotation sample | 0.27.18 | 0.27.19 |
| --- | ---: | ---: |
| Total V8 sampled time | 1,632.933 ms | 1,578.257 ms |
| Sampled non-idle time | 1,405.306 ms | 454.664 ms |
| Non-idle fraction | 86.06% | 28.81% |
| RAF intervals | 270 | 270 |
| RAF median / p95 | 5.6 / 5.7 ms | 5.6 / 5.7 ms |

This supports removed source-walk CPU work in one pair of bounded runs. RAF
cadence is unchanged; no FPS gain is claimed. V8 non-idle samples include
program/native waiting and are not OS process CPU utilization. No general model
load-latency gain, explicit-document speedup, or isolated GPU result is claimed.
Ordinary 3D pointer orbit is not the measured automatic 4D header rotation.
Native load latency and four program creations per newly loaded model remain.
The current profile screenshot was visually inspected; this is not a usability
study.

- Production build: 167 UI modules.
- 170 focused checks pass: 37 annotation/section checks in
  `artifacts/empty-content-regression-final-0.27.19.tap` and 133 renderer/capture
  checks in `artifacts/empty-content-renderer-0.27.19.tap`.
- New tests prove absent documents do not enumerate source geometry, preserve
  new overlays/workspaces, cancel old requests, retain explicit-document
  validation, and reject late clears across model/net replacements.
- An outdated fake renderer lacked the existing `setClearColor` method. Its test
  fixture now supplies it; all six original UV/geometry assertions execute.
- The native section fixture passed when run without competing fixture setup;
  final annotation suites ran sequentially with their existing timeout and
  complete cases. Initial failures remain preserved.
- Actual development text/PNG/source RGBA/history/net/tour checks pass:
  `artifacts/element-content-smoke-R992Px/result.json`.
- Actual packaged, portable and matching-source qualification is recorded below.

## Actual packaged and portable verification

The following version-matched checks pass. Packaged harnesses make development
Python unavailable and use isolated profiles. The eight core scripts completed
sequentially; package/test work was finished before recording the final profile.

- Hidden desktop canary: `artifacts/hidden-desktop-canary-V0DORG/result.json`.
- Text/PNG/RGBA/history/net/tour annotation workflow: `artifacts/element-content-smoke-xm9PQN/result.json`.
- All 16 registered regular 4D sources, identity, attributes and Save/Open: `artifacts/regular4d-catalog-smoke-6qaaWy/result.json`.
- Final normal visible model-load/rotation profile: `artifacts/model-view-profile-YTlmPn/result.json`.
- Pointer recovery after fitting, PNG export and held-write Cancel: `artifacts/capture-controls-j4UF25/result.json`.
- Sections, entities, depth, held export and retry: `artifacts/section-workflow-e75bzF/result.json`.
- Face/cell nets, cuts, history, PDF, held animation export and retry: `artifacts/net-workflow-KRoCw9/result.json`.
- Saved tours including native Save/Open and decoded WebM: `artifacts/animated-tours-packaged-1qqs5F/result.json`.
- Core construction, history and Save/Open: `artifacts/core-experience-ip7zgO/result.json`.
- Morph playback, scrubbing, PNG and Save/Open: `artifacts/morph-workflow-2XQ6Kt/result.json`.
- Geometry and derived export: `artifacts/export-workflow-FWGmqZ/result.json`.
- Intrinsic measurement and identity feedback: `artifacts/intrinsic-feedback-HYUeig/result.json`.
- Actual self-extracting portable launch: `artifacts/portable-launch-9f6qpq/result.json`.

The regular 4D reference remains `artifacts/regular4d-proof-0.27.16.json`;
its catalog and validator hashes match and are checked before launch. Native
identity uses finite numerical validation, not a claim of exact mathematical
certification. No reference guard changed.

Portable extraction matches 1,716 resources against the tested unpacked app.
`release/preview-0.27.19/verification.json` binds current package bytes, protected
importer hashes and 1,878 frozen runtime inputs. All 1,667 engine inputs match
0.27.18: `artifacts/engine-unchanged-0.27.19.json`.

Portable: `release/preview-0.27.19/Polytope Laboratory 0.27.19 preview.exe`.
Bytes: 143,241,196. SHA-256:
`1e36841c5f22f6d2908761b1e4dcf641605c7bc6910cf85ca95e9b6a84dd2279`.
Matching source: `release/Polytope Laboratory 0.27.19 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.19.json`.
Require that receipt to confirm final archive sealing; these notes are finalized
before the archive is written. Earlier pairs remain preserved.

The build retains the existing Vite large-bundle and optional freetype hook
warnings. No exhaustive regression or fresh-user observation claim is made.

## Next core work

Continue model-loading profiling: native job latency and shader lifetime remain
separate from the removed observer work. Review common controls and visible
feedback, and arrange fresh-user observation. Staged features remain deferred.
