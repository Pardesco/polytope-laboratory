# 0.27.9: less copying during source ownership checks

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; previous qualified portable/source pairs are
preserved. Nothing from this continuation was published online.

## Changes

Repeated native construction and numeric publication checks no longer build,
validate and freeze a new model memory bank every time. Initial capture still
uses the existing bounded memory clone and source-incidence validation. Later
checks walk the complete literal state under the same depth, item and JSON-byte
bounds and compare the full model text with that validated capture. Every model
field, ordered array, source attribute and JSON value participates. This is exact
content comparison, not trust in caller IDs, fingerprints or validation reports.

Project/document/state pointers, history cursor, document ID, notes and effective
units remain bound. Independent observer changes are allowed, but malformed or
oversized view/state fields still refuse publication. Only a real in-process
capture can supply a validation certificate; a copied owner or edited public
model signature is refused. Owners are tracked weakly, without a persistent
model cache. The memory bank implementation and all native engine files are
unchanged.

Source model IDs, document fields and unit lookups now inspect data descriptors.
Accessor fields are refused without invoking their getter, including hidden unit
accessors that the original memory clone would omit before a raw unit lookup.

## Measurements

Isolated Node 120-cell ownership workload, 600 vertices, 103,091 model JSON bytes,
20 capture/check repetitions after five warm-ups; i7-14700K, 28 logical CPUs,
63.7 GiB RAM, Windows 10.0.26200:

- 0.27.8 baseline `artifacts/native-source-profile-E7rLOj/result.json`:
  median capture 3.78 ms; median repeated check 3.86 ms.
- 0.27.9 `artifacts/native-source-profile-6uoFPY/result.json`:
  median capture 3.70 ms; median repeated check 2.59 ms. Each profile records
  current source hashes, all 20 samples and a CPU profile. Source mutations with
  unchanged fingerprints are refused. This excludes native IPC, UI, GPU and FPS.

The same visible 120-cell five-cut desktop task (1500 by 950 window, normal
`[.2,.3,.4,1]`, depths 0, .05, .1, .15, .2 after warm-up) observed 51.0-57.6 ms
from Evaluate to ready in development:
`artifacts/section-render-profile-vUeBGQ/result.json`. Packaged 0.27.8 observed
56.4-58.4 ms: `artifacts/section-render-profile-1NmDzr/result.json`. Preparing
before the native status message was 19.1-23.6 ms versus 23.3-25.1 ms. Ranges
overlap; these short observations do not establish a general latency or FPS
claim. All three shader-program counters remain zero across the five cuts.
The 200 ms slider debounce is outside these manual-button observations.

Packaged 0.27.9 with development Python unavailable observed 50.9-56.3 ms:
`artifacts/section-render-profile-UvXHAx/result.json`. Initial load was 938.6 ms;
all three shader counters remain zero. No long-task entries appeared in that
short sampled interval. This confirms the same workload in the packaged app,
with the same limits on interpreting timing ranges.

## Verification

- 160-module production UI build passes.
- 933 checks pass across numeric/construction controls, memory/source ownership,
  exact domains, late native results, history, morphs and actual section buffers:
  `artifacts/native-ownership-0.27.9-qualified.tap`.
- New signature checks compare with the existing memory serializer over 200
  deterministic varied metadata fixtures, Unicode/surrogates, numeric extremes,
  key order, aliases, null-prototype and prototype-looking records. They also
  cover full-model mutation, forged owners, getter refusal, cycles, sparse or
  extended arrays, non-JSON/nonfinite data and whole-state resource limits.
- The broader run found a stale faceting DOM fixture: it did not select the real
  UI's initial declared-symmetry option, and still classified an already
  implemented criterion as unavailable. Tests now model the current selection
  and use an actually unsupported criterion. No faceting runtime code changed.
  The first original-fixture failure is reproduced from the qualified 0.27.8
  source ZIP in `artifacts/ownership-baseline-0.27.8.tap`; the initial current
  suite receipt is `artifacts/native-ownership-0.27.9.tap`.
- Visible development section workflow:
  `artifacts/section-workflow-QmEBXo/result.json`, including pending results,
  oblique section animation, drafts, Save/Open, empty cuts and promotion.

- Packaged core workflow: `artifacts/core-experience-mDtxTs/result.json`,
  covering actual dual/truncation/scale buttons, Undo, two window sizes,
  disclosure defaults, validation feedback and native Save/Open. Truncated
  tetrahedron automatic radius remains 0.3994636211547385; source and reciprocal
  endpoint bounds both equal 0.5527707983925668. This is an endpoint invariant,
  not a playback FPS claim.
- Packaged hidden-window/focus canary:
  `artifacts/hidden-desktop-canary-9tiZxB/result.json`.
- All 1,667 native engine files and the memory bank implementation match 0.27.8:
  `artifacts/engine-source-comparison-0.27.9.json`.
- Packaged visible morph workflow:
  `artifacts/morph-workflow-wMKMsQ/result.json`, including two panel sizes,
  keyboard controls, replay/scrub takeover, PNG, Save/Open and reset.
- Packaged section workflow: `artifacts/section-workflow-ZiEtPS/result.json`.
- Packaged net/history/PDF/animation ownership:
  `artifacts/net-workflow-kLrKzJ/result.json`.
- Packaged geometry formats and held-dialog/source-unit ownership:
  `artifacts/export-workflow-EZ2c8u/result.json`.

- Actual portable launch passes with development Python unavailable:
  `artifacts/portable-launch-a85gHM/result.json`. Cube/dual/morph operations pass;
  all 1,716 extracted resource files match the tested unpacked app. Package/current
  verification matches 1,870 frozen runtime/build inputs; corresponding source
  is archived and verified against those inputs and all current archive files.

## Local package

Portable: `release/preview-0.27.9/Polytope Laboratory 0.27.9 preview.exe`,
143,234,424 bytes, SHA256
`b5ad95556e0abf0fde6d291ebfb4543ff0ffd516652a736a837b63beb5beb27c`.
Matching source: `release/Polytope Laboratory 0.27.9 source.zip`.
The package/current receipt is `release/preview-0.27.9/verification.json`;
source-pair receipt is `artifacts/source-pair-0.27.9.json`.
There are 1,870 frozen runtime/build inputs.

## Remaining core work

The bounded signature walk still appears in the renderer profile and initial
capture still clones and validates its source. Preserve its exact-content and
resource guarantees in further optimization. Continue loading/construction
feedback and export ownership review. Saved-tour actor sections still recreate
their materials. Fresh-user observation remains unperformed; staged integrations
remain deferred.

For the loading review, inspect `renderCatalog` and `library-open-anyway` in
`ui/app.js`: both add a document after an awaited load. Cover project replacement,
simultaneous selections, cancellation and export ownership with an actual held
load before deciding how to publish or discard it.

A source text audit also identifies malformed display text in the native File
menu, packed-page dimension error and History parameters close button:
`artifacts/ui-encoding-audit-0.27.9.json`. Inspect actual labels and repair them
in the next core UX change; they are outside this frozen runtime checkpoint.
