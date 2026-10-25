# 0.27.20 handoff: code complete, normal-session packaged checks pending

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


Prepared October 23, 2026. Read `CODEX_BRIEF_0.27.20.md` **through its Addendum**
and `RELEASE_0.27.20_DEVELOPMENT.md`. Tasks 1 and 4 are implemented and locally
tested; Claude must review the bounded pose-validation argument and run packaged
measurements/qualification before accepting the release. Tasks 2 and 3's existing
implementation is preserved. Task 3's 30-run measurement remains outstanding.

The baseline is now reproduced by Claude in the normal Windows session. Do not
retry Electron or ACL workarounds in this managed environment. This continuation
launched no Electron, ran no packaging/freeze/seal/source-pair writer, and made
no commit, push, tag or publication. Earlier releases, receipts and source
archives remain untouched. The working tree was already heavily dirty/untracked;
never reset or clean it. No engine or deferred feature work was done.

## Completed source and tests

This continuation changed only these source/test files and the three current docs:

- `ui/app.js`: `displayPose`; Rotate/plane/4D-drag wiring; guarded content display.
- `ui/viewport-controls.mjs`: tick and angle-only pointer movement request pose display.
- `ui/element-content-controls.mjs`: completed full-refresh receipts, cheap ownership
  guard, direct-refresh/invalidation revocation and full fallback.
- `ui/viewer.js`: pass the explicit pose guard through synchronous and asynchronous
  geometry publication to label rebuilds; ordinary callers keep full checking.
- `ui/viewer-element-content.mjs`: retain materials per texture record, dispose them
  with the record, allocate before hidden-owner reveal, and guard pose-only reuse
  of a completed full check. Capture and publication checks remain literal/full.
- `tests/pose-element-content.test.mjs`: 31 behavioral cases, with source Proxy traps,
  five projection modes, async workers, ownership changes, held/stale edits,
  capture refusal and material lifetime/construction assertions.
- `docs/HANDOFF_0.27.20.md`, `docs/RELEASE_0.27.20_DEVELOPMENT.md`, `docs/NEXT_SESSION.md`.

Earlier-run Task 2, Task 3, package/lock 0.27.20 and profiler tooling files remain
as listed in the previous handoff: observation controls/test, shared fake renderer
and contract/presentation test, hidden runtime/test, profile/metrics/series/comparison
scripts and metrics tests. They were not reimplemented here.

`artifacts/pose-runtime-input-check-0.27.20.json` confirms all **1,667 engine
inputs** match 0.27.19, including the three protected importers. Only eight frozen
runtime inputs differ: package/lock, app, viewport controls, element-content
controls, Viewer, ViewerElementContent and observation controls.

The mutable-source validation argument, limits, baseline receipts and retained
initial failures are in the release doc. There is no claim that reference identity
certifies arbitrary in-place mutation. The narrowly audited angle-only path
reprojects existing content; non-pose displays, capture and every new content
publication retain full literal checks. Section/morph paths stay conservative.

## Verification actually run

Final **163 tests passed, zero failed**, including 31 new cases. The earlier
160/161-test runs and the previous 95-test run overlap; do not add them to this count.
Native fixtures ran sequentially, then the build ran. No full Python/all-feature
regression or GUI qualification is claimed.

```powershell
node --test --test-reporter=tap --test-concurrency=1 tests/pose-element-content.test.mjs tests/observation-controls.test.mjs tests/renderer-contract.test.mjs tests/hidden-runtime.test.cjs tests/model-view-profile-metrics.test.cjs tests/animation-control-recovery.test.mjs tests/animation-framing.test.mjs tests/animation-export-capture.test.mjs tests/viewer-frozen-camera.test.mjs tests/empty-element-content.test.mjs tests/element-content-controls-native.test.mjs tests/element-content-lifecycle.test.mjs tests/element-content-presentations.test.mjs tests/section-source-content.test.mjs tests/element-content-viewport.test.mjs tests/element-content-history.test.mjs tests/viewport-numeric-controls.test.mjs tests/viewer-stereo.test.mjs tests/viewer-stereographic-worker.test.mjs tests/dual-morph-viewer.test.mjs tests/dual-morph-combinations.test.mjs
npm.cmd run build
```

Receipts: `artifacts/focused-pose-materials-wiring-final-0.27.20.tap` (163),
`artifacts/build-pose-materials-wiring-final-0.27.20.log` (167 modules). Existing Vite chunk-size
and Node typeless-module warnings remain. New test development failures are
retained in `artifacts/pose-element-content-initial-0.27.20.tap`, `...-recheck-...`
and `...-recheck2-...`; `...-recheck3-...` passes all 26 then-current cases.
`artifacts/focused-pose-materials-0.27.20.tap` passes the earlier overlapping 160.
The earlier 161-test run/build are retained as
`focused-pose-materials-final-0.27.20.tap` / `build-pose-materials-0.27.20.log`.
The final wiring assertion caught the plane-slider omission; the inspection is
recorded in `pose-wiring-initial-check-0.27.20.json`. Both actual slider and 4D-drag
handlers now have direct execution tests.
The previous archived observation-controls regression still has its expected
failure, proving the Task 2 fix against actual 0.27.19 source.

## Claude: exact normal-session commands, in order

Run the following **outside this managed sandbox**, in the workspace root, on an
otherwise idle machine. Each harness creates an isolated user profile. Await every
command; stop on the first failure and preserve its raw evidence. No parallel GUI,
native, profiling or packaging work. Keep Electron's normal sandbox enabled.
These commands have **not** been run in this continuation.

Start with this helper, which checks native exit codes (including npm warnings):

```powershell
$taskRoot = (Get-Location).Path
function Invoke-Checked([string]$Program, [string[]]$ArgList) {
  $ErrorActionPreference = 'Continue'
  & $Program @ArgList
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit $LASTEXITCODE" }
}
```

### 1. Measure materials separately, without modifying the main workspace

`artifacts/task4-materials-only-0.27.20.patch` applies to the sealed 0.27.19 source.
It changes material lifetime and package/lock version only; all per-frame source
checks remain. Its application and resulting material/full-check code were verified in
`build/materials-patch-check-0.27.20`. This is a disposable experiment, not a new
0.27.19 package or a qualified 0.27.20 release. Its output is isolated under the
new copy. Do not mix its samples into the final alternating comparison.

```powershell
$materialsRoot = Join-Path $taskRoot 'build/profile-materials-only-0.27.20'
if (Test-Path -LiteralPath $materialsRoot) { throw 'Preserve existing experiment; choose a new directory.' }
Expand-Archive -LiteralPath (Join-Path $taskRoot 'release/Polytope Laboratory 0.27.19 source.zip') -DestinationPath $materialsRoot -ErrorAction Stop
Push-Location -LiteralPath $materialsRoot
try {
  Invoke-Checked git @('apply', '--no-index', '--ignore-space-change', (Join-Path $taskRoot 'artifacts/task4-materials-only-0.27.20.patch'))
  Invoke-Checked npm.cmd @('ci')
  Invoke-Checked npm.cmd @('run', 'package:preview')
} finally { Pop-Location }
$env:POLYTOPE_TEST_EXECUTABLE = Join-Path $materialsRoot 'release/preview-0.27.20/win-unpacked/Polytope Laboratory.exe'
foreach ($workload in @('absent','annotated','emptied')) {
  Invoke-Checked node @('scripts/profile-model-view.cjs', '--version=0.27.20', "--workload=$workload", '--baseline')
}
```

Record each emitted folder as a **materials-only diagnostic**. Inspect annotated
program creation/deletion and source walkers against Claude's original receipts
`model-view-profile-5GRQeE` / `-GFRm4h` / `-YTlmPn`. The expected mechanism is
retained programs while source hashing remains expensive; report what actually
happens. These three diagnostics are not a median/IQR distribution.

### 2. Package the integrated final workspace; do not freeze yet

```powershell
if (Test-Path -LiteralPath 'release/preview-0.27.20/Polytope Laboratory 0.27.20 preview.exe') { throw 'Preserve existing candidate; inspect before proceeding.' }
Invoke-Checked npm.cmd @('run', 'package:preview')
$baselineExe = Join-Path $taskRoot 'build/profile-baseline-0.27.19/Polytope Laboratory.exe'
$candidateExe = Join-Path $taskRoot 'release/preview-0.27.20/win-unpacked/Polytope Laboratory.exe'
$env:POLYTOPE_TEST_EXECUTABLE = $candidateExe
Invoke-Checked node @('scripts/hidden-desktop-smoke.cjs')
```

The byte-identical baseline copy has 1,788 verified files; its proof is
`artifacts/profile-baseline-copy-0.27.20.json`. Its original managed-launch failures
are historical; use it only where normal sandboxed launches work.

### 3. Collect the 30 alternating final profiles, then compare

```powershell
$seriesBefore = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'model-view-series-*' | ForEach-Object FullName)
Invoke-Checked node @('scripts/profile-model-view-series.cjs', $baselineExe, $candidateExe)
$seriesNew = @(Get-ChildItem -LiteralPath artifacts -Directory -Filter 'model-view-series-*' | Where-Object { $_.FullName -notin $seriesBefore })
if ($seriesNew.Count -ne 1) { throw 'Identify the actual emitted series; do not guess.' }
$orderedRuns = Join-Path $seriesNew[0].FullName 'ordered-runs.json'
Invoke-Checked node @('scripts/compare-model-view-profiles.cjs', $orderedRuns)
$profileFiles = Get-Content -LiteralPath $orderedRuns -Raw | ConvertFrom-Json
$candidateProfileReceipts = @($profileFiles | Where-Object { (Get-Content -LiteralPath $_ -Raw | ConvertFrom-Json).version -eq '0.27.20' })
if ($candidateProfileReceipts.Count -ne 15) { throw 'Expected fifteen final candidate receipts.' }
```

The runner awaits baseline then candidate, five pairs per workload in order
absent, annotated, emptied. Retain CPU profiles, long tasks, RAF, shader counters,
source/notes/document invariants and logs. The write-once comparison is
`artifacts/model-view-comparison-0.27.20.json`: report non-idle and long-task
median/IQR and RAF median/p95 distributions without an FPS claim. Check annotated
program churn and full-source hotspots after both fixes, not only absent content.

### 4. Run all packaged workflows sequentially, then the actual portable wrapper

```powershell
$qualificationBefore = @(Get-ChildItem -LiteralPath artifacts -Directory | ForEach-Object FullName)
$env:POLYTOPE_TEST_EXECUTABLE = $candidateExe
$env:POLYTOPE_REGULAR4D_PROOF = Join-Path $taskRoot 'artifacts/regular4d-proof-0.27.16.json'
$suites = @('hidden-desktop-smoke.cjs','element-content-smoke.cjs','regular4d-catalog-smoke.cjs','capture-control-smoke.cjs','section-workflow-smoke.cjs','net-workflow-smoke.cjs','animated-tours-smoke.cjs','core-experience-smoke.cjs','morph-workflow-smoke.cjs','export-workflow-smoke.cjs','intrinsic-feedback-smoke.cjs')
foreach ($suite in $suites) { Invoke-Checked node @("scripts/$suite") }
$portableExe = Join-Path $taskRoot 'release/preview-0.27.20/Polytope Laboratory 0.27.20 preview.exe'
$env:POLYTOPE_TEST_EXECUTABLE = $portableExe
$env:POLYTOPE_TEST_CANDIDATE_ROOT = Join-Path $taskRoot 'release/preview-0.27.20/win-unpacked'
Invoke-Checked node @('scripts/portable-launch-smoke.cjs')
$qualificationReceipts = @(Get-ChildItem -LiteralPath artifacts -Directory | Where-Object { $_.FullName -notin $qualificationBefore } | ForEach-Object {
  $resultFile = Join-Path $_.FullName 'result.json'
  if (Test-Path -LiteralPath $resultFile) {
    $proof = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
    if ($proof.passed -ne $true -or $proof.version -ne '0.27.20') { throw "Invalid qualification: $resultFile" }
    Join-Path (Join-Path 'artifacts' $_.Name) 'result.json'
  }
})
if ($qualificationReceipts.Count -ne 12) { throw 'Expected twelve new packaged/portable workflow receipts; inspect all results.' }
$portableReceipt = @($qualificationReceipts | Where-Object { (Get-Content -LiteralPath $_ -Raw | ConvertFrom-Json).executable -eq $portableExe })
if ($portableReceipt.Count -ne 1) { throw 'Identify the exact new portable wrapper receipt.' }
```

The regular-4D harness verifies reuse eligibility against current native
catalog/validator hashes; do not suppress those assertions. Also inspect the
annotated projection/rotation screens and orbit after export/cancel. Unit rebuild
assertions cover all modes but do not replace real GPU/interaction checks.

### 5. Only after checks pass and Claude accepts the argument: freeze and seal

The Addendum overrides the older freeze-before-package ordering. Package and test
first; freeze the **unchanged tested runtime** only now. If code changes after any
candidate run, stop and resolve version/artifact ownership without overwriting a
portable, comparison, receipt or source ZIP. Never reseal 0.27.19.

```powershell
Invoke-Checked python @('-B','scripts/freeze-preview-source.py')
$verificationArgs = @('scripts/verify-local-preview.cjs') + $qualificationReceipts + $candidateProfileReceipts
Invoke-Checked node $verificationArgs
Invoke-Checked python @('-B','scripts/record-community-preview.py', $portableReceipt[0])
```

Update this handoff, release notes and `NEXT_SESSION.md` with actual receipt paths,
measured medians/IQRs, shader changes, review result and any failures. Finalize docs
**before** the following write-once corresponding-source archive and proof:

```powershell
Invoke-Checked python @('-B','scripts/package-source.py')
Invoke-Checked python @('-B','scripts/verify-preview-source-pair.py')
```

Do not edit archived source/docs after sealing. No online publication is authorized.

## Open status and preserved history

There is no new 0.27.20 package/freeze/source ZIP/source pair or before/after
measurement yet. Claude's successful baseline receipts unblock implementation;
the earlier `artifacts/model-view-comparison-0.27.20-blocked.json` describes the
previous run only. The final comparison filename has not been populated with
invented data. Single baseline annotated/emptied measurements are in the release
doc; their RAF medians are 31.4 / 6.3 ms, not a before/after distribution.

The latest qualified pair is still indexed by
`release/preview-0.27.19/verification.json` and `artifacts/source-pair-0.27.19.json`.
Its portable SHA-256 is
`1e36841c5f22f6d2908761b1e4dcf641605c7bc6910cf85ca95e9b6a84dd2279`.
Both original portable and source ZIP hashes were rechecked against their original
receipts: `artifacts/pose-prior-pair-check-0.27.20.json`.
Original launch failures `model-view-profile-tcZAdj/failure.json` and
`model-view-profile-xw6RDO/failure.json`, copy equality and prior tests are retained.

Out of scope: engine/catalog/features, morph-scaling investigation, fresh-user
observation, observation acquisition-error precedence and a hypothetical different
replacement-controls state policy. No extra issue was fixed under this brief.
