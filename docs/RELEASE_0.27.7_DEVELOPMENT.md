# 0.27.7: faster repeated sections and clearer pending results

Local development preview, October 22, 2026. Feature expansion stays paused.
Public production remains 0.26.0; previous qualified local previews are retained.

## Observable changes

Manual Evaluate/Next vertex now shows a pending message and disables derived
controls until expression evaluation and geometry preparation finish. Promote,
derived geometry export and derived memory capture wait for the accepted result.
Queued control events cannot promote the previous plane during that interval.
An input refusal restores availability without discarding the previous applied
plane. Cancellation now reaches the native derived job as well as its numeric
preparation. The real pending-state baseline is
`artifacts/section-workflow-c2LFVZ/result.json`.

Unapplied normal/depth expressions return after animation export when the same
source, applied plane and units remain active. Restoration accepts the view
snapshot clone used by the exporter, while refusing drafts from another plane,
source or unit setting. The applied mathematical plane remains independent of
these uncommitted text fields.

General Export's net-PDF button now uses the same source-bound atomic writer as
the Nets panel. Previously its legacy path could replace an existing file after
source units changed while choosing the destination. The actual failing check is
`artifacts/net-workflow-OuIYNb/failure.json`. Closing General Export also cancels
its pending net SVG/PDF write. A canceled or changed-source export preserves the
selected prior file; a later retry succeeds.

## Section performance and validation

Native profiling identified source validation as the dominant repeated 120-cell
section cost. JSON encoding/decoding was under a millisecond combined in the
measured workload. Successful validation can now be reused for an identical
complete source model; mathematical section and validation rules are unchanged.

The key includes every model field, array order and JSON value type. It does not
trust a source fingerprint, reported validation success or object identity.
Any content change revalidates. Failed validation is never cached. Oversized or
non-JSON direct-Python inputs take the ordinary validation path. The cache is
bounded to eight entries, 2 MiB per key, 8 MiB total and a 65,536-node key walk.
It lives inside the already bounded/expiring native worker. New section geometry
still receives its ordinary hull validation on every calculation.

Unprofiled native calculation samples, five calls on the same sources/plane:

| Source | Revalidation each call, ms | Reused source validation, ms |
| --- | ---: | ---: |
| Tesseract | 5.24-5.33 | 2.76-2.93 |
| 120-cell | 105.86-114.86 | 27.76-29.07 |

Before: `artifacts/section-native-profile-gmucf2di/result.json`; final after:
`artifacts/section-native-profile-cdyeilfm/result.json`. Raw `.prof` files and
text summaries remain beside each receipt. The tools separate calculation,
JSON encode and JSON decode rather than attributing all time to transfer.

The actual development desktop workload measured roughly 3.3-3.7 ms for repeated
tesseract native IPC and 30.6-31.4 ms for the 120-cell. The prior packaged 0.27.6
workload was 6.0-6.4 ms and 113.6-116.1 ms respectively. Settings are normal
`[.2,.3,.4,1]`, depth `.1`, nonzero fill, five repetitions; each result's geometry
matches its reference. Hardware is the same i7-14700K, 28 logical CPUs, about
63.7 GiB RAM, Windows 10.0.26200. First validation/import costs still apply.
These measurements do not claim universal throughput or FPS improvement.
The packaged 0.27.7 check with development Python unavailable measured 3.5-3.9 ms
for the tesseract and 31.4-32.5 ms for the 120-cell:
`artifacts/section-workflow-V2z5tz/result.json`.

## Visible renderer profile

`artifacts/section-render-profile-xY5wqB/result.json` and `renderer.cpuprofile`
record five visible 120-cell cuts at depths 0, .05, .1, .15 and .2. Observed time
from Evaluate to ready was 51.8-56.5 ms; the initial model-load observation was
918.3 ms. No long-task entries were reported during that short sampled run.
The profile includes normal UI, source snapshots and native waiting, not isolated
GPU time. The 200 ms slider debounce is outside these manual-button timings.

The remaining sampled work includes bounded source cloning/validation/freezing
through model memories/native source ownership, plus `getProgramInfoLog` calls.
These are investigation targets, not proof of a universal renderer bottleneck.
Keep the full source ownership/resource checks when considering an optimization.

## Verification

- 159-module UI production build passes.
- 145 focused Node tests pass, including manual-plane ownership, cancellation,
  preserved drafts across view snapshot clones, export lifecycle, memory/source
  binding, net history and worker bounds:
  `artifacts/section-focused-0.27.7-qualified.tap`.
- 38 native tests and three subtests pass: cache ownership/type/resource limits,
  changed attributes and malformed support data, worker protocol, generalized
  and ordinary-cell sections and source content. Protected importer files and
  `engine/geometry.py` are unchanged.
- Development section workflow: `artifacts/section-workflow-U9njUN/result.json`.
- Packaged section workflow, including the pending-promotion/export checks and
  preserved drafts: `artifacts/section-workflow-V2z5tz/result.json`.
- Development net workflow, including General Export PDF unit-change and
  dialog-close refusal with a successful retry:
  `artifacts/net-workflow-uZzTZm/result.json`.
- Packaged net/PDF/history/animation workflow:
  `artifacts/net-workflow-f2LV0f/result.json`.
- Packaged geometry formats, source units and delayed export ownership:
  `artifacts/export-workflow-LAk2gP/result.json`.
- Actual portable launch with development Python unavailable:
  `artifacts/portable-launch-w9vXnT/result.json`. Native cube/dual/morph operations
  pass; all 1,716 extracted resource files match the qualified unpacked package.
  The first attempt lost its browser connection; reconnecting found the original
  app responsive with its tesseract intact. That attempt is preserved at
  `artifacts/portable-launch-z7vrWe`, including the reconnect diagnostic; it is
  not a passing qualification receipt. No application crash was established.

## Remaining core work

Use the renderer profile to investigate source snapshot costs and section
material/program reuse, preserving topology, appearance and source ownership.
Continue model loading/construction feedback and broader export-ownership review.
Fresh-user observation remains unperformed. Staged features remain deferred.

## Local package

Portable: `release/preview-0.27.7/Polytope Laboratory 0.27.7 preview.exe`,
143,230,171 bytes, SHA256
`411c217b0876624c39dfec74ecded9f1cc1c3c69d973c09580637da4e497e3f8`.
Corresponding source: `release/Polytope Laboratory 0.27.7 source.zip`.
The package/current verification record is
`release/preview-0.27.7/verification.json`; source-pair verification is
`artifacts/source-pair-0.27.7.json`. There are 1,869 frozen runtime/build inputs.
Nothing from this continuation was published online.
