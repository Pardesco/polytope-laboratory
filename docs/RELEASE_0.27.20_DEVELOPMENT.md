# 0.27.20 development: annotation pose updates and retained label materials

## Final status (Claude, October 23, 2026): qualified locally, supersedes "pending" text below

Claude reviewed the bounded pose-validation argument and the Task 1/4 diff against
the sealed 0.27.19 source, and **accepts it**. Pose-only rebuilds reuse a completed
full check only when every identity matches; section/morph views, non-pose
displays, capture and every publication keep full literal checks; a pose-only
frame publishes no new content. Optional materials-only diagnostic (handoff step 1)
was **not run**.

All packaged work below ran sequentially in Randall's normal Windows session:

- Package: `npm run package:preview` → `release/preview-0.27.20/Polytope Laboratory 0.27.20 preview.exe`,
  143,244,374 bytes, SHA-256 `8be9e68b92f82f8ca605edd1e252b1154d312f231694728619bb569d7fbcea69`.
- 30 alternating profiles: `artifacts/model-view-series-fWIO5q`; comparison
  `artifacts/model-view-comparison-0.27.20.json` (5 runs per version per workload,
  Grand hexacosichoron, 1.5 s Rotate, renderer non-idle ms per window):

  | Workload | 0.27.19 non-idle median (IQR) | 0.27.20 non-idle median (IQR) | RAF median / p95, 0.27.19 → 0.27.20 |
  | --- | --- | --- | --- |
  | absent | 345.9 (20.4) | 324.2 (24.4) | 6.4/6.6 → 6.4/6.6 ms |
  | annotated | 2,056.4 (147.6) | 520.8 (24.4) | 31.6/35.8 → 6.3/6.5 ms |
  | emptied | 1,636.9 (49.0) | 415.6 (3.9) | 6.3/12.7 → 6.3/6.5 ms |

  Annotated GPU programs created during rotation: 102 (0.27.19 single run
  `model-view-profile-5GRQeE`) → 0 (0.27.20 single run `model-view-profile-FstP3r`).
  RAF is vsync-capped near 6.3 ms on this display, so absent/emptied show no FPS
  change; the annotated case went from ~32 fps to the cap. Zero long tasks throughout.
- Residual hotspot: `ElementContentControls.displayOwner` (~240 ms of 467 ms non-idle
  in `FstP3r`) re-serializes the non-pose view and annotation document every pose
  frame. Cheap for text labels; could grow with large embedded PNG documents.
  Candidate follow-up for 0.27.21, not fixed here.
- Qualification: 12/12 passed (`artifacts/qualification-receipts-0.27.20.txt`,
  console `artifacts/qualification-0.27.20-run2-console.log`). The first attempt
  stopped before running `element-content-smoke` because neither hidden mode nor
  `POLYTOPE_TEST_VISIBLE=1` was set (`artifacts/qualification-0.27.20-console.log`);
  rerun with visible opt-in per `HIDDEN_QUALIFICATION.md`. Hidden canary still ran hidden.
- Freeze (1,878 inputs), `verify-local-preview` (12 qualification + 15 candidate
  profile receipts → `release/preview-0.27.20/verification.json`) and the community
  record passed. Source ZIP and source-pair proof follow this doc update.

No commit, push, tag or publication. Public production remains 0.26.0.


October 23, 2026. **Implemented and locally tested; packaged qualification and
Claude review pending.** Working package/lock remain 0.27.20. The latest qualified
local portable/source pair remains 0.27.19; public production remains 0.26.0.
No Electron launch, ACL workaround, package, freeze, seal, source-pair write,
commit, push, tag or publication was performed in this continuation.

## Changes

Task 1 gives Rotate ticks, the six plane sliders, and the angle-only 4D pointer
drag an explicit `displayPose()` path. All continue to call `base.setDisplay()`.
Visibility, projection, cells, appearance, morph frames, model/state adoption,
Undo/Redo and Open keep the full path. Uncertain and derived section/morph paths
remain conservative full refreshes. Explicit empty annotation documents remain
explicit; neither engine nor UI canonicalizes them to null.

`ElementContentControls.display()` admits a skip only after a full validated
refresh has completed. Its receipt binds state/source/model/net/cellNet/layer,
project/document/states/cursor/document ID, annotation identity and literal
annotation contents, notes, units and the non-angle view. Pending, failed,
invalidated or aborted jobs cannot authorize a skip. An ownership or non-pose
change falls back to the full refresh. Direct refresh/capture revokes the display
receipt. Content edits retain native source capture, literal publication checks
and stale-job `AbortError` retirement.

Task 4 retains the appropriate face or sprite material on each adopted texture
record, including records initially hidden by pose. Rebuilds replace geometry,
owner arrays, picking patch indices and sprite receipts while reusing materials.
Face opacity follows the current surface; per-vertex RGBA stays on newly built
geometry. Texture replacement clears old geometry and disposes retained materials
before the old texture. Destruction/failure cleanup disposes all retained
resources once. This avoids shader-program retirement caused by per-frame
material disposal; actual GPU program measurements remain pending.

Task 2 remains as completed: observation release restores all groups and releases
ownership even if one restoration throws, then rethrows the first error. Task 3's
shared fake renderer contract and profiler/series/comparison tools are unchanged.
The 30-run packaged comparison is still outstanding.

## Source-validation argument for review

This uses the Addendum's **mutable-source, bounded pose-only exception**, rather
than claiming models are frozen or that reference identity certifies their literal
contents. `set()` and every ordinary/non-pose rebuild retain the original full
`rendererCheck`: literal renderer-source comparison, native publication/current
checks, bound snapshot check and any correspondence plans. Every content
publication still uses the original literal native source/document validation.
`prepareCapture()` awaits preparation, checks the binding and invokes a full
rebuild with no pose exception. IDs, counts and fingerprints are never substituted
for these checks.

After a successful full layer check, a pose rebuild may reuse that check only
when generation, renderer model, source snapshot, net, cell net, binding and morph
identity match AND the control's completed-refresh receipt still owns the current
presentation. Only the three audited angle-only callers supply that guard. They
publish no new source content or annotation descriptor; they reproject existing
content onto the new published geometry. The guard is rechecked at asynchronous
stereographic publication. A full display replaces the guard immediately, and an
expired guard forces full validation. Section/morph plans continue their full
checks; their angle updates are not admitted to this optimization.

In-place model mutation is still possible. A pose call is not a general source
validity certificate, and arbitrary external mutation during an angle-only update
is not promised to be detected on that frame. Every non-pose display, content
publication and capture performs full literal checks again. Tests mutate source
coordinates and the bound snapshot while retaining ID/count/fingerprint and prove
capture/non-pose refusal. This is the specific alternative allowed by the
Addendum, subject to Claude's review before the task counts as fully accepted.
Stereographic geometry preparation retains its existing bounded root-record and
geometry validation; it is separate from recursive annotation source hashing.

## Verification in this continuation

- `artifacts/focused-pose-materials-wiring-final-0.27.20.tap`: **163 tests passed,
  zero failed** across 21 focused files, sequentially. Includes 31 new pose/material
  tests plus native content/controller, lifecycle/history, section/morph mapping,
  animation framing/capture, observation controls, renderer contract, runtime
  preflight, profile metrics, stereo/worker and viewport numeric tests.
- New behavioral coverage: annotated and explicit-empty pose updates do no
  annotation source enumeration/capture; labels rebuild each time; all five
  orthographic/perspective/stereographic/stereo/exploded modes track geometry and
  UVs; billboard positions move; ownership changes force refresh; held edits retire
  as `AbortError`; pending/failed/cancelled work cannot authorize a skip.
- Material coverage: no constructors during N warmed pose rebuilds (Three's
  monotonic Material IDs), hidden-owner reveal creates no material, retained
  materials dispose exactly once, replacement retires the old material before its
  texture, and opacity/source/patch ownership stay current.
- `npm.cmd run build`: passed, **167 modules**. Receipt:
  `artifacts/build-pose-materials-wiring-final-0.27.20.log`. Existing large-chunk and typeless
  ES-module warnings remain; no dependency changes were made.
- `artifacts/pose-runtime-input-check-0.27.20.json`: all **1,667 engine inputs**,
  including the three protected importers, match the 0.27.19 frozen hashes.
  `artifacts/pose-prior-pair-check-0.27.20.json` also rechecks both original 0.27.19
  portable and source ZIP hashes against their unchanged receipts.
- A materials-only experiment patch against the sealed 0.27.19 source was
  generated, checked and actually applied with `git apply --no-index` in a new
  isolated scratch directory; resulting version/material/full-check assertions pass.
  It changes only material lifetime and package/lock version to 0.27.20;
  it retains all per-frame source checks. It is not a qualified release or freeze.

Initial failures are preserved: `pose-element-content-initial-0.27.20.tap` records
a missing brace in the new test fixture; `pose-element-content-recheck-0.27.20.tap`
and `...-recheck2-...` record fixture issues (edge-on initial face, missing billboard,
camera setup, bounded S3 root-record checks, and a held-job interleaving assertion).
These were corrected without removing cases or relaxing runtime validation.
`...-recheck3-...` passes all 26 then-current new cases. The earlier overlapping
160-test run is `focused-pose-materials-0.27.20.tap`; do not add reruns to the 163.
The earlier 161-test run is `focused-pose-materials-final-0.27.20.tap`, with its
original build log `build-pose-materials-0.27.20.log`. A final wiring assertion
caught plane sliders still using the full path; `pose-wiring-initial-check-0.27.20.json`
records it. The corrected slider and 4D-drag handlers are executed directly by
two added tests. The 163-test run and rebuilt bundle supersede those earlier runs.
Prior 95-test evidence and the archived Task 2 regression remain preserved.
The prior Electron ACL failures remain in `model-view-profile-tcZAdj/failure.json`
and `model-view-profile-xw6RDO/failure.json`; no launch was retried here.

## Measured baseline and outstanding distributions

Claude reproduced packaged 0.27.19 in the normal Windows session before this
continuation. The addendum and raw receipts identify Grand hexacosichoron and a
nominal 1.5-second Rotate window:

| Workload | Raw receipt under artifacts/ | Non-idle / sampled window | RAF median / p95 | New programs |
| --- | --- | --- | --- | --- |
| absent | model-view-profile-YTlmPn | Earlier single-run evidence; no new summary | 5.6 ms / 5.7 ms | 0 |
| emptied | model-view-profile-GFRm4h | 1,618.505 / 1,637.319 ms | 6.3 / 12.7 ms | 0 |
| annotated | model-view-profile-5GRQeE | 2,053.896 / 2,074.114 ms | 31.4 / 32.9 ms | 102 |

Emptied/annotated `rotationSummary.longTaskCount` is zero. These are individual
baseline runs, **not** five-sample medians or IQRs. The emptied profile exposes
memory-signature walkers; annotated adds portable hashing and material/program
churn. The reproduce-first requirement is satisfied. The old blocked comparison
receipt is historical and has not been overwritten.

There are no new packaged 0.27.20 samples, speedup claims, measured distributions,
or valid before/after median/IQR yet. V8 non-idle includes program/native waiting;
RAF is vsync-capped and is not evidence of an FPS gain. The final comparison file
`artifacts/model-view-comparison-0.27.20.json` remains reserved for actual data.

Claude's exact sequential materials-only experiment, final package, alternating
profiles, qualification, and post-check freeze/seal commands are in
[HANDOFF_0.27.20.md](HANDOFF_0.27.20.md). Do not freeze, seal or write the source
pair until the packaged checks have passed, per the environment rule. Full Python
regression, new controls/catalog work, the separate morph investigation and human
fresh-user observation remain outside this task.
