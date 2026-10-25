# 0.27.8: retain section shader programs between cuts

Local development preview, October 22, 2026. Feature expansion remains paused.
The qualified 0.27.7 portable/source pair is preserved; public production remains
0.26.0. Nothing from this continuation was published online.

## Observable behavior

Repeated sections from the same source and section mode keep their four display
materials alive. This avoids throwing away and compiling shader programs for
every cut. Geometry, source maps, picking, selection, colors, visibility and
appearance are rebuilt from each accepted result, including topology changes.
Source replacement, section-mode changes, an intervening nonsection, empty
results and clearing the viewer release those materials normally. Empty results
also release materials when callers explicitly request reuse.

Only GPU material lifetime uses source object identity. Full native request and
publication ownership checks remain in place. No geometry, source snapshot,
validation certificate or caller fingerprint is reused by this change. Pending
studio environments and procedural effects are disposed on result replacement;
late image decoding cannot attach to the next cut.

This change applies to live derived sections and their existing animation/export
path. The separate saved-tour actor path still rebuilds its display materials.
All native engine sources and protected importer/geometry files are unchanged
from 0.27.7.

## Measurements

Same visible 120-cell workload, normal `[.2,.3,.4,1]`, manual depths 0, .05, .1,
.15, .2, after a warm-up cut; window 1500 by 950. Hardware: i7-14700K, 28 logical
CPUs, 63.7 GiB RAM, Windows 10.0.26200. The renderer profiler now counts actual
WebGL program creation, deletion and program-log queries as well as sampling CPU.

- Qualified packaged 0.27.7 baseline:
  `artifacts/section-render-profile-TpIi3F/result.json`. Five cuts created 20
  programs, deleted 20 and queried 20 program logs. Evaluate-to-ready observations
  were 56.8-69.9 ms.
- Development 0.27.8:
  `artifacts/section-render-profile-cla5JN/result.json`. The same five cuts created
  zero programs, deleted zero and queried zero program logs. Evaluate-to-ready
  observations were 55.1-57.8 ms. The earlier uninstrumented 0.27.7 run observed
  51.8-56.5 ms; workload timing ranges overlap. These short observations do not
  establish a general latency or FPS improvement.
- Final derived viewport comparison at depth .2:
  `artifacts/section-renderer-pixel-comparison-0.27.8.json`. Only 14 of 430,560
  pixels differ between the packaged baseline and development screenshot.
  This covers that view, not every appearance configuration.
- Packaged 0.27.8 with development Python unavailable:
  `artifacts/section-render-profile-1NmDzr/result.json`. All three program counters
  remain zero; Evaluate-to-ready observations were 56.4-58.4 ms. The initial
  model-load observation was 940.7 ms. No long-task entries appeared in the short
  sampled interval. Native waiting, UI and source snapshots are included; the
  200 ms slider debounce is outside these manual-button timings.

## Verification

- 159-module production UI build passes.
- 122 focused Node checks pass:
  `artifacts/section-renderer-0.27.8-qualified.tap`. Native tesseract/120-cell
  results match a fresh viewer's actual geometry, normal, RGBA, edge and point
  buffers; tests also cover ordinary-cell boundary/empty results, source changes
  with identical fingerprints, material disposal, appearance changes and delayed
  studio decoding. Existing morph, perspective, worker, source-content, derived
  control and animation checks pass.
- The first broader run exposed stale test renderers in the perspective and
  stereographic-worker suites: both omitted the real renderer's `setClearColor`
  method. Fixtures now implement it; runtime appearance behavior was unchanged.
  Original failure receipt: `artifacts/section-renderer-0.27.8.tap`.
- Visible development section workflow:
  `artifacts/section-workflow-7vS6ns/result.json`, including pending-result/export
  ownership, expression drafts, oblique section PNG frames, Save/Open and
  source-preserving promotion.

- Packaged section/pending-result/animation/Save/Open/promotion workflow:
  `artifacts/section-workflow-011jnz/result.json`.
- Packaged net/history/SVG/PDF and held-dialog/animation cancellation workflow:
  `artifacts/net-workflow-DQr4Hu/result.json`.
- Packaged geometry formats, source units and delayed publication:
  `artifacts/export-workflow-IgNhhg/result.json`.
- All 1,667 engine files match the qualified 0.27.7 sources:
  `artifacts/engine-source-comparison-0.27.8.json`. This is a renderer-only runtime
  change; native regression coverage from that exact source is preserved.

- Actual portable launch and native cube/dual/morph operations pass with
  development Python unavailable: `artifacts/portable-launch-QZiD2B/result.json`.
  All 1,716 extracted resource files match the tested unpacked app. Package/current
  verification passes for 1,869 frozen runtime/build inputs. Matching source is
  archived and checked against those frozen inputs and all current archive files.

## Local package

Portable: `release/preview-0.27.8/Polytope Laboratory 0.27.8 preview.exe`,
143,234,083 bytes, SHA256
`2e4765bc0611771573aedd73d353205ff86155b873217596e63a5bdb837f2d36`.
Corresponding source: `release/Polytope Laboratory 0.27.8 source.zip`.
There are 1,869 frozen runtime/build inputs; the package/current receipt is
`release/preview-0.27.8/verification.json`, and the source-pair receipt is
`artifacts/source-pair-0.27.8.json`.

## Remaining core work

Repeated bounded source cloning, validation and freezing still appears in the
renderer profile through numeric/native source ownership. Investigate redundant
work without weakening exact-content checks, resource bounds or late-publication
refusal. Continue loading/construction feedback and export ownership review.
Fresh-user observation remains unperformed. Staged integrations remain deferred.
