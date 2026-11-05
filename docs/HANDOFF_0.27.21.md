> Published October 24, 2026: [0.27.20 community preview](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20) is now public, with matching executable/source ZIP. GitHub main and tag v0.27.20 use the verified sealed source plus publication documentation updates (commit `62abb4c`). Local 0.27.21 remains unqualified. Older public-0.26.0 statements below are historical.

# October 25 continuation

## Paused at Randall's request - October 25, 2026

Stopped at the verified [PNG capture/save checkpoint](IMAGE_CAPTURE_RELIABILITY_2026-10-25.md).
Rechecked `artifacts/image-capture-checks-20261025-152038/result.json`: selected
source/test hashes still match; 467 focused tests, the 171-module production
build and desktop syntax checks passed. No code changes were made during the
follow-up specialist PNG review, and no validation job from that review remains
running. The existing dirty worktree is preserved; nothing was committed,
packaged or released. Development 0.27.21 remains unqualified.

On resume, the next candidate is forwarding multiple-view/projective PNG
source/dialog ownership through the reviewed destination handshake. Their
saveImage callbacks already write atomically; their current post-save source
check can still detect a change only after publication. This was inspected,
not implemented. Broad GUI/package/fresh-user checks, consolidated review
refresh and earlier native engine rebuild obligations remain deferred.

This requested pause supersedes the continuation instructions below until
Randall resumes the goal.

Newest: [image capture reliability](IMAGE_CAPTURE_RELIABILITY_2026-10-25.md)
owns the main screenshot through preparation and destination review, supports
prompt cancellation and writes PNGs through fsynced sibling replacement.
Legacy saveImage callers also gain atomic writes. **467 focused tests, the
171-module build and desktop syntax checks pass** in
`artifacts/image-capture-checks-20261025-152038`. Actual desktop/dialog
qualification remains deferred. Continue the active goal; refresh review/
package inputs and retain earlier native engine rebuild obligations.

Newest: [reviewed net printing](NET_PRINT_OWNERSHIP_2026-10-25.md) checks
current source/layout after private page preparation before opening the
printer dialog. A single main-process owner handles duplicate requests,
cancellation and window cleanup; global Cancel includes net output.
**379 focused Node tests, 13 native tests, the 170-module build and desktop
syntax checks pass** in `artifacts/net-print-checks-20261025-151015`.
Real printer/dialog qualification remains deferred. Continue the active
goal; refresh review/package inputs and retain earlier engine rebuild duties.

Newest: [document-field edits](DOCUMENT_FIELD_EDITS_2026-10-25.md) avoid
full construction-panel synchronization for notes and camera-end events.
Revisions, recovery, stale-read cancellation, tour invalidation and notes-bound
morph retirement remain checked. **286 focused tests and the 169-module build
pass** in `artifacts/document-field-checks-20261025-150311`. No native
implementation changed. Continue the active goal; broad packaged/visible
qualification remains deferred and earlier rebuild/review obligations remain.

Newest: [net drag ownership](NET_DRAG_OWNERSHIP_2026-10-25.md) rolls back
uncommitted SVG movement, releases pointer capture and fences gestures to
their source/layout/sequence. Net export cancels provisional drags before
reviewing output. **258 focused tests and the 169-module build pass** in
`artifacts/net-drag-checks-20261025-145838`. No native implementation changed.
Continue the high-impact goal; broad packaged/visible qualification remains
deferred and earlier rebuild/review obligations remain.

Newest: [DERIVED_DOCUMENT_CONTEXT_2026-10-25.md](DERIVED_DOCUMENT_CONTEXT_2026-10-25.md)
preserves promotion/memory document context, enforces the common document limit
and prevents cleared imported fields returning during JSON export. **173 focused
tests and the 169-module build pass** in
`artifacts/document-export-checks-20261025-145229`. No native implementation
changed. Native Save/Open, physical scale and cleared-field reimport are covered;
packaged/visible/broad qualification and earlier engine rebuild/review remain.
The high-impact goal continues.

Newest: [CANCEL_CONTENT_2026-10-25.md](CANCEL_CONTENT_2026-10-25.md) closes delayed/
derived Cancel gaps, immediately releases manual-plane locks, preserves completed
section receipts and ignores stale folded-content diagnostics. **156 focused
tests and the 169-module build pass** in
`artifacts/cancel-content-checks-20261025-142848`. Native code is unchanged. Next
inspect promotion units/notes/data preservation. The goal remains active; prior
bundle/review obligations and deferred broad qualification remain.

Newest: [DERIVED_PUBLICATION_2026-10-25.md](DERIVED_PUBLICATION_2026-10-25.md) fixes
premature/stale derived result availability for promotion, memory and export.
Export review pauses playback and completes an interrupted section at the frozen
plane. **174 focused tests including nested cases and the 169-module build pass**
in `artifacts/derived-publication-checks-20261025-141502`. Native code is unchanged;
prior bundle/review obligations remain. Next inspect global Cancel/debounce and
late fold annotation ownership. The goal stays active; broad checks remain deferred.

Newest: [PORTABLE_SOURCE_STREAM_2026-10-25.md](PORTABLE_SOURCE_STREAM_2026-10-25.md)
emits bounded canonical source bytes directly, retaining complete visits and
source/hash/ownership checks. **419 focused tests including nested cases and the
169-module build pass** in `artifacts/portable-stream-checks-20261025-135356`.
Portable key CPU median improves 6.173 to 4.578 ms; general navigation timings
remain noisy. Native code is unchanged. Continue the goal with everyday workflow
coherence/responsiveness/usability prioritized; broad release qualification stays
deferred. Stella4D conformance remains largely prototype and incompletely audited.

Newest: [ANNOTATION_SOURCE_ENCODING_2026-10-25.md](ANNOTATION_SOURCE_ENCODING_2026-10-25.md)
retains exact portable floats using shared synchronous word extraction and avoids
reparsing array index keys while inspecting every own slot. **403 focused tests
including nested cases and the 169-module build pass** in
`artifacts/annotation-source-checks-20261025-133411`. Portable key CPU comparison:
8.808 to 5.951 ms; state signature 3.085 to 2.574 ms. Full navigation samples vary
substantially. Native source is unchanged; continue the goal with broad checks
deferred, preserving source-walk/resource/ownership invariants in further work.

Newest: [NAVIGATION_DISPLAY_2026-10-25.md](NAVIGATION_DISPLAY_2026-10-25.md) removes
the second full display for restored entity selection, retaining content and pick
ownership. **171 focused Node tests and the 169-module build pass** in
`artifacts/navigation-display-checks-20261025-132422`. Annotated CPU navigation
measures 363 to 339 ms; this is not desktop timing. Next profile remaining annotated
source capture/verification costs without weakening their checks. Native source
is unchanged here; prior rebuild/review obligations and deferred broad checks remain.

Newest: [MEMORY_TOUR_PUBLICATION_2026-10-25.md](MEMORY_TOUR_PUBLICATION_2026-10-25.md)
closes memory/tour export and capacity races, makes Swap document/slot publication
synchronous, and forwards tour event cancellation to NativeJobs. **148 focused
Node tests and the 169-module build pass** in
`artifacts/memory-tour-publication-20261025-131235`. No native source changed here;
earlier native rebuild/review obligations remain. Continue the active goal with
broad qualification deferred; profile saved-selection navigation display next.

Newest: [VALIDATION_KEY_ENCODING_2026-10-25.md](VALIDATION_KEY_ENCODING_2026-10-25.md)
reduces bounded literal-key overhead, with unchanged keys/complete caller outputs.
**109 native tests and three subtests pass**; current native checks:
`artifacts/validation-key-checks-20261025-130030`, measured comparison:
`artifacts/validation-key-profile-j1y_o5hf`. section_validation.py changed too;
include it in refreshed review/proofs and rebuild the engine before packaging.
No frontend source changed in this pass; broad release testing remains deferred.

Latest: [PROJECT_VALIDATION_REUSE_2026-10-25.md](PROJECT_VALIDATION_REUSE_2026-10-25.md)
implements bounded project-local literal geometry reuse and automatic retirement
of obsolete file reads. **227 native / 140 Node focused tests and the 169-module
build pass** (`artifacts/project-workflow-native-20261025-124730`). The final
source-level comparison is `artifacts/project-validation-profile-g6l8p8s7`.
formats.py changed while parser logic/original geometry helpers remain intact:
older whole-file proofs and review diffs are not current. Requalify native source
and rebuild the bundled engine before final packaged checks. Broad release
testing remains deferred; continue the active high-impact goal.

Current: [LIBRARY_FILE_WORKFLOW_2026-10-25.md](LIBRARY_FILE_WORKFLOW_2026-10-25.md)
adds prepared search, persistent navigation rows, cancellable Open/Recover and a
shared opening lock. **93 focused checks and the 169-module build pass**; receipt:
`artifacts/library-file-workflow-20261025-121616/result.json`. New desktop module:
`desktop/workspace-reads.cjs`; main/preload and file-opening UI changed. Refresh
the review/source/package inputs for final qualification. No real Electron
launch or native-dialog/file-loading timing was performed. The active high-impact
goal and deferred broad testing continue; older receipts below are historical.

Newest: [EXPORT_SAVE_RELIABILITY_2026-10-25.md](EXPORT_SAVE_RELIABILITY_2026-10-25.md).
View/export, drag/observation, asynchronous cell-facing and Save lifecycles are
strengthened. **192 focused tests and the 169-module build pass**; receipt:
`artifacts/export-save-workflow-20261025-115547/result.json`. This includes
source-level PNG/WebM ownership checks, not real packaged captures/dialogs.
Earlier receipts/diffs are preserved snapshots and need refreshing against the
final runtime. Continue high-impact work; broad release testing stays deferred.

Latest: [POSE_WORKFLOW_2026-10-25.md](POSE_WORKFLOW_2026-10-25.md) covers pose-only
UI synchronization, deferred initial display and manual slider export ownership.
**115 focused checks and the 169-module build pass**; receipt:
`artifacts/pose-workflow-20261025-113419/result.json`. CPU-only initialization
comparison: `artifacts/view-initialization-cWk9jq/result.json`. This supersedes
the source currency of the earlier 127-test receipt; preserve both. Continue
high-impact implementation, with broad qualification deferred as requested.

Latest: read [CORE_IMPACT_2026-10-25.md](CORE_IMPACT_2026-10-25.md) for six core
workflow improvements and actual worker measurements. **127 focused tests and
the 169-module build pass** in `artifacts/core-impact-20261025-112057`.
Worker comparisons are in `artifacts/inspection-protocol-h7IZhK`. Current runtime
changes also affect derived request lifecycle, net/stellation cancellation,
point bounds/Viewer normalization, read-only worker eligibility and autosave/
playback revisions. Earlier full qualification and review diffs are historical;
refresh them against the final runtime before final package qualification.
The first-fix checkpoint below is retained for context.

Randall's current direction is highest-impact implementation first; defer
noncritical testing and broad qualification until the end before final release.
Use focused checks for changed behavior.

Automatic analysis and manual validation now pass report-owned abort signals
through the existing native job cancellation path. Navigation/invalidation
revokes output ownership first, then cancels work with no remaining output.
Replacing validation alone keeps a shared automatic analysis alive for its
analysis output. Obsolete running jobs are retired and queued jobs can be removed
through the existing main-process cancel handler. Literal source checks stay in
place. Intrinsic query controls retain their existing independent cancellation.

Changed runtime: `ui/model-reports.mjs`, `ui/app.js`; regression coverage:
`tests/model-reports.test.mjs`. Focused verification:

```powershell
node --test --test-concurrency 1 tests/model-reports.test.mjs tests/native-jobs.test.mjs tests/intrinsic-report-controls.test.mjs tests/engine-pool.test.cjs
npm.cmd run build
```

**31 tests pass; 168-module build passes.** The navigation regression exercises
report ownership, NativeJobs and the actual EnginePool with simulated child
processes. It is not an Electron/IPC or visible-latency measurement. Cancellation
retires an active worker, so measure repeated navigation and cold-worker costs in
the final packaged comparison. No Electron launch, package, freeze or seal ran.
Earlier broad source receipts bind prior inputs and do not qualify these edits;
preserve them and regenerate final evidence under distinct names. The existing
October 24 review diff also predates this change.

# 0.27.21 handoff: three measured improvements, packaged checks pending

October 24, 2026. Read [the development notes](RELEASE_0.27.21_DEVELOPMENT.md).
Package/lock are 0.27.21. The previous qualified local pair is **0.27.20**,
with `artifacts/source-pair-0.27.20.json` and
`release/preview-0.27.20/verification.json`. Its archive/portable bytes are
preserved. Production remains the documented 0.26.0 preview.

Completed work:

- Detached literal display snapshots avoid per-pose JSON conversion while
  detecting nested/in-place edits and preserving publication/capture guards.
- One bounded exact-input cache reuses read-only convex intrinsic 3D sizing
  preparation; other methods retain reconstruction. Exact outputs match 0.27.20.
- Complete unchanged native analysis reuses prior validated reports within a
  bounded LRU cache. New/edited models still run the protected original analyzer.
  Actual JSON-lines round trips match reports from the sealed 0.27.20 server.
- Truncated-tetrahedron endpoint/midpoint investigation and real Viewer camera
  assertions distinguish the defined sizing trajectory from camera rescaling.
- The Guide explains sizing layers. Packaged morph profiling supports explicit
  runtimes and saved-source/observer invariants. Rotation comparison supports
  explicit version pairs while preserving historical defaults/receipts.

Final source checks: **2,075 Node tests**, **4,476 native tests plus 96 subtests**,
and the **168-module production build** pass. Native has one skip; Node has none.
Both qualifiers bind the same 2,474 unchanged inputs. See the release notes for receipts,
measurements, initial failures and limitations. None of these are new desktop
or portable qualification receipts.

## Changed files

Runtime: `ui/element-content-controls.mjs`, new
`ui/element-content-display-owner.mjs`, `ui/user-guide.mjs`,
`engine/dual_morph.py`, `engine/server.py`, new `engine/dual_morph_cache.py`,
new `engine/analysis_cache.py`, package/lock.

Tests: `tests/pose-element-content.test.mjs`,
`tests/dual-morph-viewer.test.mjs`, new
`tests/element-content-display-owner.test.mjs`,
`tests/model-view-profile-versions.test.cjs`, `tests/test_dual_morph_cache.py`,
`tests/test_analysis_cache.py`, `tests/model-view-profile-metrics.test.cjs`.

Tools: `scripts/profile-model-view.cjs`, `scripts/profile-model-view-series.cjs`,
`scripts/compare-model-view-profiles.cjs`, `scripts/morph-playback-benchmark.cjs`,
`scripts/model-view-profile-metrics.cjs`,
new `scripts/model-view-profile-versions.cjs`,
`scripts/benchmark-element-content-owner.mjs`, `scripts/profile-native-sizing.py`,
`scripts/profile-native-analysis.py`, `scripts/profile-analysis-protocol.py`.

Docs: release/handoff, `NATIVE_ANALYSIS_REUSE.md`, `NEXT_SESSION.md`,
`BUILD_STATUS.md`, `SESSION_HANDOFF.md`, `SOURCE_QUALIFICATION_0.27.21.md`,
`CLAUDE_REVIEW_0.27.21.md`, `CORE_WORKFLOW_OBSERVATION.md`, and the replay-context
clarification in `OPERATION_REPLAY.md`. Qualification also updates `test:features`,
both source runners, shared renderer/Viewer/tour fixtures and six older native
expectation suites. The consolidated review patch lists all 43 code/tool/test
changes; `CONTRIBUTING.md` documents sequential source qualification.
The tree was already heavily dirty/untracked. Do not reset or clean it. Deferred
feature stages, protected importers and prior release/evidence bytes are untouched.

## Local verification commands

Run native fixtures and heavy work sequentially. The broader source qualifiers
supersede the earlier 30-file focused command for complete current coverage.
See [source qualification](SOURCE_QUALIFICATION_0.27.21.md) for the exact scope,
initial failures, baseline reproduction and fixture/expectation repairs. Preserve
existing receipt/log bytes under distinct names before a repeat run; the runners
refuse to overwrite receipts.

```powershell
python -B scripts/qualify-native-development.py
node scripts/qualify-frontend-development.cjs
npm.cmd run build
```

These run all 135 native test files and all 168 shipped-code Node suites plus
the two standalone face-fill scripts. Five named unmounted development-only
projection suites remain excluded. Bound source inputs must stay unchanged
through each run. The older focused receipts remain historical overlapping
checks, not the final full-suite proof.

Reproduce the local computation-only comparisons using the already verified
baseline files extracted from the sealed archive:

```powershell
node scripts/benchmark-element-content-owner.mjs artifacts/element-content-controls-baseline-0.27.20.mjs artifacts/model-view-profile-FstP3r/8-before-rotation.polyproj
python -B scripts/profile-native-sizing.py artifacts/dual-morph-baseline-0.27.20.py
python -B scripts/profile-native-analysis.py
python -B scripts/profile-analysis-protocol.py artifacts/server-baseline-0.27.20.py
```

All create new artifact folders. The latter measures native pipe round trips;
none measures Electron IPC, rendering or desktop latency. Do not substitute them
for the real packaged measurements below.

## Next: exact normal-Windows-session sequence

The previous managed-environment rule still applies: **do not retry Electron
launches or ACL workarounds here**. This continuation launched no Electron and
performed no package/freeze/seal. Run the following from Randall's normal Windows
session, in this workspace. Await every command; stop on failure and retain raw
results. Keep the normal Electron sandbox enabled. Do not run GUI, native,
profiling or packaging work in parallel. No online publication is authorized.

### 1. Review, package and canary

Review snapshot comparison, exact-input sizing reuse and analysis reuse against
the sealed 0.27.20 source, using [the review brief](CLAUDE_REVIEW_0.27.21.md),
including output aliasing, full-source keys, resource
bounds and rejected/changed requests. Sizing-plan reuse is intentionally limited
to one read-only class. Do not extend it to other methods without examining their
mutation behavior. Read `NATIVE_ANALYSIS_REUSE.md` for the separate report cache.

```powershell
$taskRoot = (Get-Location).Path
function Invoke-Checked([string]$Program, [string[]]$ArgList) {
  & $Program @ArgList
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit $LASTEXITCODE" }
}
$baselineExe = Join-Path $taskRoot 'release/preview-0.27.20/win-unpacked/Polytope Laboratory.exe'
Invoke-Checked npm.cmd @('run','package:preview')
$candidateExe = Join-Path $taskRoot 'release/preview-0.27.21/win-unpacked/Polytope Laboratory.exe'
$env:POLYTOPE_TEST_EXECUTABLE = $candidateExe
Invoke-Checked node @('scripts/hidden-desktop-smoke.cjs')
$env:POLYTOPE_TEST_VISIBLE = '1'
```

Check the actual unpacked baseline exists. Do not rebuild or replace it.
The packaging script refuses an existing 0.27.21 portable. Preserve an existing
candidate and inspect its provenance rather than overwriting it.

### 2. Thirty alternating navigation/rotation profiles

```powershell
$seriesBefore = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'model-view-series-*' | ForEach-Object FullName)
Invoke-Checked node @('scripts/profile-model-view-series.cjs',$baselineExe,$candidateExe,'--baseline-version=0.27.20','--candidate-version=0.27.21','--navigation')
$seriesNew = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'model-view-series-*' | Where-Object { $_.FullName -notin $seriesBefore })
if ($seriesNew.Count -ne 1) { throw 'Identify the actual new series.' }
$orderedRuns = Join-Path $seriesNew[0].FullName 'ordered-runs.json'
Invoke-Checked node @('scripts/compare-model-view-profiles.cjs',$orderedRuns,'--baseline-version=0.27.20','--candidate-version=0.27.21')
$profileFiles = Get-Content -LiteralPath $orderedRuns -Raw | ConvertFrom-Json
foreach ($profileFile in $profileFiles) {
  $profileProof = Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
  if ($profileProof.navigationRequested -ne $true -or $profileProof.navigations.Count -ne 12) { throw "Missing complete navigation evidence: $profileFile" }
}
$candidateProfileReceipts = @($profileFiles | Where-Object { (Get-Content -LiteralPath $_ -Raw | ConvertFrom-Json).version -eq '0.27.21' })
if ($candidateProfileReceipts.Count -ne 15) { throw 'Expected fifteen candidate profiles.' }
```

The write-once comparison is `artifacts/model-view-comparison-0.27.21.json`.
Report non-idle median/IQR, RAF median/p95, shader program churn and long tasks.
Also report `navigationGroups`: independent per-run first-draw and settled
medians over four revisits per model. The phase occurs before annotation edits.
Full saved source and notes must remain equal. Do not mix runs with/without
navigation or infer navigation latency from the computation/pipe microbenchmarks.
These three workloads have no large PNG. Also inspect actual image labels through
the existing element-content workflow; the synthetic CPU benchmark is not image
qualification. Source/notes/annotation invariants must pass.

### 3. Ten alternating visible morph profiles

```powershell
$morphBefore = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'morph-playback-*' | ForEach-Object FullName)
for ($run = 0; $run -lt 5; $run++) {
  foreach ($version in @('0.27.20','0.27.21')) {
    $env:POLYTOPE_TEST_EXECUTABLE = if ($version -eq '0.27.20') { $baselineExe } else { $candidateExe }
    Invoke-Checked node @('scripts/morph-playback-benchmark.cjs','--visible',"--version=$version")
  }
}
$morphNew = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'morph-playback-*' | Where-Object { $_.FullName -notin $morphBefore })
if ($morphNew.Count -ne 10) { throw 'Expected ten completed morph profiles.' }
$candidateMorphReceipts = @($morphNew | ForEach-Object {
  $file = Join-Path $_.FullName 'result.json'
  $proof = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  if ($proof.passed -ne $true -or $proof.packaged -ne $true -or $proof.developmentPythonDisabled -ne $true -or $proof.sourceAndObserverPreserved -ne $true) { throw "Invalid morph profile: $file" }
  if ($proof.version -eq '0.27.21') { Join-Path (Join-Path 'artifacts' $_.Name) 'result.json' }
})
if ($candidateMorphReceipts.Count -ne 5) { throw 'Expected five candidate morph profiles.' }
```

Preserve raw CPU profiles, pose intervals, RAF and long-task samples. Compare
pose-publication distributions separately from display cadence. Recheck source
and endpoint sizes, midpoint shrink, scrub, Replay/Reset and unchanged camera in
the visible app. Do not infer renderer FPS from the direct-Python comparison.

### 4. Packaged workflows and actual portable wrapper

```powershell
$qualificationBefore = @(Get-ChildItem -LiteralPath artifacts -Directory | ForEach-Object FullName)
$env:POLYTOPE_TEST_EXECUTABLE = $candidateExe
$env:POLYTOPE_REGULAR4D_PROOF = Join-Path $taskRoot 'artifacts/regular4d-proof-0.27.16.json'
$suites = @('hidden-desktop-smoke.cjs','element-content-smoke.cjs','regular4d-catalog-smoke.cjs','capture-control-smoke.cjs','section-workflow-smoke.cjs','net-workflow-smoke.cjs','animated-tours-smoke.cjs','core-experience-smoke.cjs','morph-workflow-smoke.cjs','export-workflow-smoke.cjs','intrinsic-feedback-smoke.cjs')
foreach ($suite in $suites) { Invoke-Checked node @("scripts/$suite") }
$portableExe = Join-Path $taskRoot 'release/preview-0.27.21/Polytope Laboratory 0.27.21 preview.exe'
$env:POLYTOPE_TEST_EXECUTABLE = $portableExe
$env:POLYTOPE_TEST_CANDIDATE_ROOT = Join-Path $taskRoot 'release/preview-0.27.21/win-unpacked'
Invoke-Checked node @('scripts/portable-launch-smoke.cjs')
$qualificationReceipts = @(Get-ChildItem -LiteralPath artifacts -Directory | Where-Object { $_.FullName -notin $qualificationBefore } | ForEach-Object {
  $file = Join-Path $_.FullName 'result.json'
  if (Test-Path -LiteralPath $file) {
    $proof = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
    if ($proof.passed -ne $true -or $proof.version -ne '0.27.21') { throw "Invalid qualification: $file" }
    Join-Path (Join-Path 'artifacts' $_.Name) 'result.json'
  }
})
if ($qualificationReceipts.Count -ne 12) { throw 'Expected twelve workflow/portable receipts.' }
$portableReceipt = @($qualificationReceipts | Where-Object { (Get-Content -LiteralPath $_ -Raw | ConvertFrom-Json).executable -eq $portableExe })
if ($portableReceipt.Count -ne 1) { throw 'Identify the exact portable wrapper receipt.' }
```

The regular-4D proof harness checks the relevant current catalog/validator hashes;
do not suppress it if reuse becomes ineligible. Native engine inputs changed in
this version: rebuild the bundled engine and do not claim full native byte reuse.

### 5. Only after review and all packaged checks: freeze, verify, document, seal

```powershell
Invoke-Checked python @('-B','scripts/freeze-preview-source.py')
$verificationArgs = @('scripts/verify-local-preview.cjs') + $qualificationReceipts + $candidateProfileReceipts + $candidateMorphReceipts
Invoke-Checked node $verificationArgs
Invoke-Checked python @('-B','scripts/record-community-preview.py',$portableReceipt[0])
```

Update current docs with actual receipt paths, review findings and measured
distributions before the final archive. Then:

```powershell
Invoke-Checked python @('-B','scripts/package-source.py')
Invoke-Checked python @('-B','scripts/verify-preview-source-pair.py')
```

Do not alter tested runtime after qualification or archived source/docs after
sealing. No commit, push, tag or publication is part of this continuation.

## Remaining priorities

Finish normal-session review/qualification first. Then use real visible task
measurements and fresh-user observations to prioritize further core UX work.
The [review brief](CLAUDE_REVIEW_0.27.21.md) and
[fresh-user protocol](CORE_WORKFLOW_OBSERVATION.md) are ready; neither represents
a completed independent review or observed participant session.
The scaling analysis covers the supplied sizing mode; investigate other reported
morph settings if a concrete reproduction differs. Large-model loading and
remaining native/renderer latency are still candidates. Feature expansion remains
deferred. The broader development goal remains active.
