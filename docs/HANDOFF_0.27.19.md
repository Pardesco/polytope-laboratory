# Next-session handoff: 0.27.19 stopping point

Prepared October 22, 2026 for the next Codex session, at Randall's request to
find a good stopping point and leave a separate Claude review document.
The continuing development goal is paused, not complete. Do not automatically
resume feature expansion. Read this document before older session instructions.

## Authoritative checkpoint

- Workspace: `C:\Users\Randall\Documents\4d-polytope-desktop`.
- Local development/package version: **0.27.19**. Public production remains
  **0.26.0**; this session did not publish, push, or commit a release.
- Qualified portable: `release/preview-0.27.19/Polytope Laboratory 0.27.19 preview.exe`.
  Size: **143,241,196 bytes**. SHA-256:
  `1e36841c5f22f6d2908761b1e4dcf641605c7bc6910cf85ca95e9b6a84dd2279`.
- Matching source: `release/Polytope Laboratory 0.27.19 source.zip`.
  The archive manifest and `artifacts/source-package-0.27.19.json` supply its
  exact file hashes; `artifacts/source-pair-0.27.19.json` proves correspondence.
  This document is finalized before creating that archive; require the successful
  source-pair receipt before treating the checkpoint as sealed.
- Package/current-source proof: `release/preview-0.27.19/verification.json`.
  It binds 1,878 frozen inputs, current packaged desktop/dist bytes, protected
  importer hashes, portable hash, and 13 actual packaged/portable receipts.
- Freeze: `artifacts/preview-build-source-0.27.19.json`.
  Portable launch: `artifacts/portable-launch-9f6qpq/result.json`.
  Community record: `artifacts/community-preview-0.27.19.json`.
- All 1,667 engine inputs are unchanged from 0.27.18:
  `artifacts/engine-unchanged-0.27.19.json`.
- Earlier local preview/source pairs, including 0.27.18, remain preserved.
  Failed or unqualified historical candidates are not substitutes for this pair.

No task-owned build, test, or profiler is intended to remain running at handoff.
All qualification processes reached terminal success before the final response.
Check receipts and local process state if interrupted before that response.

## Direction and project map

The current mandate is [OPEN_SOURCE_ROADMAP.md](OPEN_SOURCE_ROADMAP.md): make
existing core workflows simpler, faster, and reliable. Follow
[CONTRIBUTING.md](../CONTRIBUTING.md) for interface changes. Fresh-user task
observation remains outstanding. Historical instructions to integrate staged
features are superseded; `STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md` is long-term
scope, not a current expansion order. Deferred stages must stay deferred unless
Randall changes direction.

Polytope Laboratory is an offline Windows Electron application for viewing,
constructing, inspecting, sectioning, unfolding, animating, saving, and exporting
3D/4D polytopes. It remains an early community preview, not demonstrated feature
parity with Stella4D. Source distribution is GPL-3.0-only with third-party notices.

| Area | Entry points / role |
| --- | --- |
| Desktop/native boundary | `desktop/main.cjs`, preload/IPC code under `desktop/` |
| Renderer orchestration | `ui/app.js`; broad workspace, presentation, and control synchronization |
| Three.js rendering | `ui/viewer.js`; model/derived actors, cameras, controls, capture |
| Element annotations | `ui/element-content-controls.mjs`, `ui/element-content-lifecycle.mjs` |
| Section-specific content | `ui/section-source-content.mjs`; retain pose/correspondence validation |
| Observation ownership | `ui/observation-controls.mjs`, animation framing/export controls |
| Native engine | `engine/server.py` and `engine/`; packaged using PyInstaller |
| Build / dependencies | `package.json`, `package-lock.json`, `requirements.txt`, `vite.config.mjs` |
| Evidence / release | `artifacts/`, `release/`, `scripts/*smoke.cjs`, frozen manifests |

The package declares Electron ^44.5.1, Three ^0.180.0, Vite ^7.1.7, Playwright
^1.55.1 and electron-builder ^26.0.12. Consult the lockfile for exact installed
versions. The package build compiled 167 UI modules. `package.json` is the
authoritative script inventory. Use `npm.cmd` in PowerShell.

## What changed through this checkpoint

See [release notes](RELEASE_0.27.19_DEVELOPMENT.md) for the complete current
evidence and [Claude review brief](CLAUDE_REVIEW_0.27.19.md) for open challenges.

**0.27.19:** Profiling the actual 0.27.18 packaged app showed header-driven 4D
rotation repeatedly cloning, validating, and serializing the full model through
element-content refresh when there was no annotation document. Both interactive
controls and offscreen preparation now clear absent content without walking the
source. This applies to `null`/`undefined` annotation documents only. Explicit
documents, even `{entries: []}`, keep full descriptor/source validation.

Section source pose and empty-section correspondence checks run first. Empty
clears verify the request, workspace/current state as applicable, annotation
absence, and viewer model/net/cellNet references before and after rendering.
They retire previous preparation; a delayed clear cannot destroy new content.
`Viewer.setElementContent` checks publication ownership before destroying its
current layer. Retired native failures become `AbortError`; `displayBase` ignores
those expected cancellations and still reports genuine current failures.

The frozen runtime changes relative to 0.27.18 are exactly `package.json`,
`package-lock.json`, `ui/app.js`, `ui/viewer.js`,
`ui/element-content-controls.mjs`, and `ui/element-content-lifecycle.mjs`.
New supporting files include `tests/empty-element-content.test.mjs` and
`scripts/profile-model-view.cjs`. An existing presentation test renderer gained
its missing `setClearColor` method; original geometry/UV assertions were retained.

**0.27.18:** Temporary observation holds now follow the viewer's initialized
OrbitControls replacements. Fitting and completed/canceled section capture
restore both viewports' original enabled/damping settings, including nested
holds and initially disabled controls. Cleanup releases busy/ownership state even
when restoration fails. The actual 0.27.17 baseline reproduced four frozen-view
cases; actual 0.27.18 and 0.27.19 pointer workloads recover afterward.

**0.27.17:** Saved-tour sections retain source/domain-scoped GPU materials while
rebuilding geometry, colors, and picking. A bounded five-cut 120-cell workload
went from 20 program creations/links/deletions to zero. A fitted disabled-camera
rounding issue that produced a blank/stale composite was reproduced and fixed.
These claims are workload-specific, not general FPS results. Earlier 0.27.13-16
source-publication, cancellation, startup/report and empty-workspace fixes are
recorded in the versioned notes and preserved sections of `NEXT_SESSION.md`.

## Performance evidence and its limits

Final comparison: `artifacts/model-view-comparison-0.27.19.json`.
Baseline: `artifacts/model-view-profile-nX9H47/result.json` (actual 0.27.18).
Candidate: `artifacts/model-view-profile-YTlmPn/result.json` (actual 0.27.19).
Sibling raw CPU profiles, native saved projects, and screenshots are retained.

The harness uses a fresh profile, 1500 x 950 normal visible window, single view,
two Library passes through 120-cell, 600-cell, and Grand hexacosichoron, then a
1.5-second header `Rotate` task with no annotation document. Native Save verifies
the complete model and notes are unchanged by rotation, including IDs. The six
generated source models match across versions except generated top-level model
IDs and provenance source IDs. That exclusion is for comparing separate
generations only; runtime source-owner guards were not weakened.

| Rotation sample | 0.27.18 | 0.27.19 |
| --- | ---: | ---: |
| Total V8 sampled time | 1,632.933 ms | 1,578.257 ms |
| Sampled idle | 227.627 ms | 1,123.593 ms |
| Sampled non-idle | 1,405.306 ms | 454.664 ms |
| Non-idle fraction | 86.06% | 28.81% |
| RAF intervals | 270 | 270 |
| RAF median / p95 | 5.6 / 5.7 ms | 5.6 / 5.7 ms |

Hardware: Intel Core i7-14700K, 28 logical CPUs, about 63.7 GiB RAM,
Windows 10.0.26200. This is one pair of bounded runs. Sampled non-idle time
includes program/native waiting; it is not isolated GPU timing or OS process CPU
utilization. The evidence supports removing source-walk CPU work; it does not
show increased FPS, universal load-latency gains, or improvement for explicit
annotation documents. Ordinary 3D pointer orbit is not the measured header task.
Model loads still create four programs per load; native job latency remains.

The final packaged screenshot `artifacts/model-view-profile-YTlmPn/workspace.png`
was visually inspected: the named star model, viewport and counts are visible.
That single image is not a usability study or comprehensive visual audit.

## Verification completed

- 37 focused annotation/section cases:
  `artifacts/empty-content-regression-final-0.27.19.tap`.
- 133 renderer/capture cases:
  `artifacts/empty-content-renderer-0.27.19.tap`. Total: **170 focused checks**.
- New tests use source-enumeration traps, held render/native replies, model/net
  replacement, missing workspace, malformed explicit documents, and independent
  current/stale owners. These are more than a timing-only benchmark.
- Actual development annotation workflow:
  `artifacts/element-content-smoke-R992Px/result.json`.
- Actual packaged annotation text/PNG/RGBA/history/net/tour workflow:
  `artifacts/element-content-smoke-xm9PQN/result.json`.
- All 16 registered regular 4D sources, source attributes, native identity and
  Save/Open: `artifacts/regular4d-catalog-smoke-6qaaWy/result.json` and sibling
  `loaded-receipts.json`. Reference `artifacts/regular4d-proof-0.27.16.json` is
  reused only after its catalog/validator hashes still match.
- Packaged pointer recovery, sections, nets/history/PDF/held export/retry,
  saved tours including decoded WebM, core history/Save/Open, morphs, geometry
  exports, and intrinsic feedback all pass. Exact eight receipt paths are in
  `release/preview-0.27.19/verification.json`; suite logs are
  `artifacts/qualification-0.27.19-<script filename>.log`.
- Final packaged profile and hidden desktop canary pass. Host development Python
  is made unavailable by packaged harnesses, exercising the bundled engine.
- Actual self-extracting portable launch passes: all **1,716** extracted ASAR /
  engine resources match the tested unpacked app; native cube, dual and morph
  operations pass. Qualification is local; no online release was made.

Initial failures were retained. Six presentation cases exposed an incomplete
test renderer, fixed in the mock. One native fixture timed out under competing
setup; the recheck and final sequential suites passed with unchanged timeout and
no removed cases. See `artifacts/empty-content-targeted-0.27.19.tap`,
`artifacts/content-presentations-0.27.19.tap`, and
`artifacts/section-content-fixture-recheck-0.27.19.tap`.
This checkpoint does not claim an exhaustive Python/JavaScript regression run,
mathematical certification of every catalog item, or measured feature parity.

## Safe resume procedure

1. Read this file, `CLAUDE_REVIEW_0.27.19.md`, `OPEN_SOURCE_ROADMAP.md`, and the
   current release notes. Confirm `package.json` and the source-pair receipt.
2. Treat the heavily dirty/untracked working tree as user work. Git diff alone
   does not describe the delivered program. Do not reset, clean, delete old
   artifacts, or roll back changes. Compare frozen manifests and source archives.
3. Recheck current source against the archive with a read-only script if needed.
   Existing archive/qualification writers are write-once; do not rerun them over
   this version's receipts. Never relabel an older receipt as a new qualification.
4. For a runtime change, bump package and lock versions to **0.27.20 or later**
   before editing/building. Preserve 0.27.19 source, portable and manifests.
   Do not silently mutate a frozen runtime and retain its qualified version.
5. Pick one measured core issue. Good next candidates: a controlled repeat of
   the profile, reproducing the explicit-empty-document cost after removing
   annotations, model-load/native latency, or fresh-user task observations.
   Review the reported truncated-tetrahedron morph scaling against the roadmap;
   existing targeted passes do not close that user report universally.
6. Keep heavy native/GUI suites sequential, use isolated profiles and avoid
   concurrent packaging/profiling. Save raw evidence, not just averages.

For local development: `npm.cmd run build`, then `npm.cmd start`. For the new
annotation suite:

```powershell
node --test --test-concurrency=1 tests/empty-element-content.test.mjs tests/element-content-controls-native.test.mjs tests/element-content-lifecycle.test.mjs tests/element-content-presentations.test.mjs tests/section-source-content.test.mjs
```

The profiling harness uses `POLYTOPE_TEST_EXECUTABLE` set to the absolute
**unpacked** `Polytope Laboratory.exe` for a version-matched packaged app. Check
`scripts/hidden-runtime.cjs` and the current package version first; it rejects a
mismatched main process/version and is not for an outer portable wrapper. For a
future version, qualification order is build/freeze/package, actual desktop
checks, profile without competing jobs, portable wrapper check, current-byte
verification, community record, final docs, source ZIP, source-pair verification.
See `scripts/freeze-preview-source.py`, `package-preview.cjs`,
`verify-local-preview.cjs`, `record-community-preview.py`, `package-source.py`,
and `verify-preview-source-pair.py`. Read script arguments before running them.

Protected files must retain these SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `engine/__init__.py` | `386c22bb99742201703c33eba63836bd0bebcccff37107c67a06b139fd0e5923` |
| `engine/formats.py` | `fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23` |
| `engine/geometry.py` | `9a9a1243223ca38aabce4bc762cbd463939a177f104bfa08c4ada81774b85414` |

Do not replace full publication ownership with model ID, counts, or a fingerprint
shortcut. Actual content/construction/capture still binds literal source data,
attributes, units, notes, document selection and current presentation as required.
An empty-overlay clear is not a certificate that the whole source model is valid.

The remaining work is intentionally open. The next session should resume only
when Randall asks; the long-running development goal is paused at this checkpoint.
