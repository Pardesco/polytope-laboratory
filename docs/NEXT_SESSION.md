> November 5, 2026: round 3 UI pass (8 Codex packages + integration polish, Astra-reviewed plan) and catalog audit pushed to GitHub `main` as unreleased source. README gained "What it's for", the Stella4D difference and why Electron.

## Round 3 - November 5, 2026 (read first)

Plan and results: [UI_PASS_2026-11-05.md](UI_PASS_2026-11-05.md). Packages: canvas first impression (v1), header + command
search (v3), tool vocabulary + icons (v4), precision wording + validation summary (v5), Appearance sheet (v6), library rail
(v7), tokens/accessibility (v8), catalog audit (g1, [CATALOG_AUDIT_2026-11-05.md](CATALOG_AUDIT_2026-11-05.md): all 1,594
registered models pass; 2 raw `data/` compound sources need specialist review), integration polish
([INTEGRATION_POLISH.md](INTEGRATION_POLISH.md), [R3_SMOKE_COMPATIBILITY.md](R3_SMOKE_COMPATIBILITY.md)).
Lead fix: stellation generator IDs now update on input; on blur the change handler re-rendered the panel and swallowed the
Enumerate click (found by the desktop smoke after v8's larger type shifted the layout).
Verification: Node 3,160/3,160, pytest 5,911, hidden canary + 17 hidden smokes pass. Version still 0.27.21; not packaged.
Next: community feedback, then release 0.27.21 (steps below), then the deferred Animation timeline redesign.

> November 4, 2026: GitHub main updated to the unreleased 0.27.21 development source + README "New on main" section (commit `959348f`, built with the package-source.py file set, exact bytes; v0.27.20 tag/release unchanged).

> Published October 24, 2026: [0.27.20 community preview](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20) is now public, with matching executable/source ZIP. GitHub main and tag v0.27.20 use the verified sealed source plus publication documentation updates (commit `62abb4c`). Local 0.27.21 remains unqualified. Older public-0.26.0 statements below are historical.

## NEXT STEPS (start here) - written November 4, 2026

State: local 0.27.21 = UX round + Randall's follow-ups (dramatic 4D perspective eye 1.5 + Depth slider; Shift-drag tumble).
Node 3,096/3,096, pytest 5,862, canary + 17 hidden smokes pass. Pushed to GitHub `main` (`959348f`) as unreleased source;
the downloadable release is still v0.27.20. Shared in the polytope Discord 11-04 (Coxeter builder pitch).

1. **Community feedback first:** check GitHub issues and the Discord thread; fix reported problems before new work.
2. **Release 0.27.21:** bump version if needed, then the release order in memory (package → profiles → packaged suites +
   portable smoke → freeze → verify-local-preview → docs → package-source → source pair), publish a GitHub release with
   the .exe + source ZIP, and switch the README download links from 0.27.20 and fold "New on main" into "Try it".
3. **Visible review, not done yet:** Coxeter builder (H4 dense), Learn 4D, Export goals and Construct live sliders in the
   unfocused monitor-2 window (`polytope-orchestra/tryvis.cjs` + `steps/*.cjs`); hidden mode can't show thumbnails/Welcome
   and throttles input to ~1/s.
4. **Optional:** fresh-user observation pass (Astra computer-use only if Randall asks; it takes the real mouse).

Process notes: the integration repo is `C:\Users\Randall\Documents\polytope-orchestra\main` (commit there, then
`sync_to_repo.py`). To update GitHub `main`: clone it into a scratch folder, mirror the `scripts/package-source.py` file set
with `core.autocrlf=false`, commit on top, `git push origin HEAD:main`. The local repo's own git history is NOT GitHub's.

## UX round - November 4, 2026 (read first)

[UX_ROUND_2026-11-04.md](UX_ROUND_2026-11-04.md): goal = best polytope app, user friendly with a simplified UI. 16 Codex packages merged via `polytope-orchestra` (construct tool gallery, View options + Expert tools toggle, Prism default look, analysis overview, visual library, Coxeter Shape builder, Shift-drag 4D, nets flow, live sliders, friendly messages, startup speed, welcome refresh, export by goal, Learn 4D). Node 3,093/3,093, pytest 5,862, hidden canary + 17 smokes pass. Version still 0.27.21; not packaged.

# October 25 continuation: prioritize impact, defer broad qualification

## Overnight program - October 26, 2026 (read first)

October 26 continuation: [specialist PNG destination review](SPECIALIST_PNG_REVIEW_2026-10-26.md)
completes the paused multiple-view/projective save follow-up. Source and camera
checks now precede writing after destination selection; closing aborts the pending
chooser. 56 related tests and the 293-module build pass. The core Electron smoke
could not start because Windows denied its sandbox token runtime-folder access;
native chooser/app qualification remains pending. No ACL workaround, commit,
package or publication. Overnight packages predate this change.

[OVERNIGHT_2026-10-26.md](OVERNIGHT_2026-10-26.md): Claude led ~35 parallel Codex
feature packages toward Stella4D parity, merged in a private integration repo
(`C:\Users\Randall\Documents\polytope-orchestra`) and synced here after full
Node/pytest suites, the hidden canary and the 18-script hidden Electron smoke
battery passed. Use `npm run test:features:run` on Windows (the declared suite
now exceeds the cmd.exe line limit; qualifiers spawn directly). Development
version is still 0.27.21: bump the version before any packaged qualification.

## Claude session - October 25 evening (read first)

[CLAUDE_SESSION_2026-10-25.md](CLAUDE_SESSION_2026-10-25.md): the first real
launch of 0.27.21 found that the app **could not open a window** (net-printing
`window.on('closed')` before window creation); fixed. Also: live section depth
while dragging, quiet status for quick jobs, closable tabs with Undo and
library tab reuse, plain-language selection measurements, morph Play without
Apply, and stale test mocks that had silently disabled 18 main-process tests.
Node `test:features` 2,352/2,352 and native pytest 4,524 pass. Older smoke
scripts still use pre-10-22 inspector selectors (see that doc). Lesson: run at
least one actual Electron launch (`npm run test:hidden` or `test:core`) after
any `desktop/main.cjs` change; unit tests do not boot it.

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

Newest: [document context preservation](DERIVED_DOCUMENT_CONTEXT_2026-10-25.md)
preserves units/notes/metadata in promoted geometry and derived memories, enforces
the common 100-document limit and prevents JSON export from resurrecting cleared
imported notes/metadata. **173 focused tests and the 169-module build pass** in
`artifacts/document-export-checks-20261025-145229`. Native Save/Open, physical-scale
export and cleared-field reimport are covered. No native implementation changed.
Next inspect remaining net/export/transformation handoffs for document attributes
and scale. Continue the active goal; broad release qualification stays deferred.

Newest: [cancel/content ownership](CANCEL_CONTENT_2026-10-25.md) stops delayed and
active derived work, releases canceled plane locks, preserves completed section
receipts and fences stale folded-net diagnostics. **156 focused tests and the
169-module build pass** in `artifacts/cancel-content-checks-20261025-142848`.
No native changes here. Next inspect promotion handoffs for source units/notes
and data preservation. Continue the active goal with everyday workflow coherence
first and broad release qualification deferred. Older receipts bind earlier inputs.

Newest: [completed derived publication](DERIVED_PUBLICATION_2026-10-25.md) stages
section models until content completes, fences stale completion/status updates,
clears failed availability and updates derived export/memories at request boundaries.
Geometry export pauses source-changing playback and reevaluates an interrupted
section frame at its frozen applied plane. **174 focused tests including nested
cases and the 169-module build pass** in
`artifacts/derived-publication-checks-20261025-141502`. No native changes here.
Next inspect global Cancel/debounced derived work and late folded-net annotation
messages. Continue the active goal; broad release qualification remains deferred.

Newest: [portable source streaming](PORTABLE_SOURCE_STREAM_2026-10-25.md) emits
canonical bytes without a temporary tagged tree, enforces portable bytes during
emission and rejects disguised sparse arrays. Bounded per-call scalar spellings
reuse no source authority. Key CPU median 6.173 to 4.578 ms; navigation timings
remain noisy. **419 focused tests including nested cases and the 169-module build
pass** in `artifacts/portable-stream-checks-20261025-135356`; comparison:
`artifacts/annotation-source-profile-5pJNLp`. Prioritize coherent everyday workflows,
responsiveness and usability over further small encoding work. The user asked
about Stella4D viability: substantial working breadth exists, but most ledger
areas remain prototype conformance and full equivalence is unproven. Continue the
active goal; broad release checks remain deferred. Native source is unchanged here.

Newest: [annotation source encoding](ANNOTATION_SOURCE_ENCODING_2026-10-25.md)
removes per-number buffer/BigInt allocations and repeated array-index parsing,
retaining complete walks and checks. Portable key CPU median 8.808 to 5.951 ms;
state signature 3.085 to 2.574 ms. Navigation timings are noisy; do not generalize
their median difference. **403 focused tests including nested cases and the
169-module build pass** in `artifacts/annotation-source-checks-20261025-133411`;
comparison: `artifacts/annotation-source-profile-13CN9t`. Next profile remaining
source walks/container construction while preserving literal mutation/resource/
ownership checks. Native source is unchanged here; continue the active goal and
defer broad release qualification. Earlier receipts bind earlier runtime inputs.

Newest: [single navigation display](NAVIGATION_DISPLAY_2026-10-25.md) restores
saved selection before one full geometry/content display. Annotated saved-selection
CPU navigation measures 362.793 to 338.682 ms; unannotated differences are noisy.
**171 focused Node tests and the 169-module build pass** in
`artifacts/navigation-display-checks-20261025-132422`; comparison:
`artifacts/navigation-display-profile-OcTGR2`. Next profile the remaining ~350 ms
annotated preparation cost, retaining complete literal source/resource/ownership
checks. Native source is unchanged here. The goal remains active and broad release
qualification stays deferred; older receipts bind earlier inputs.

Newest: [memory/tour publication](MEMORY_TOUR_PUBLICATION_2026-10-25.md) closes
export/capacity races in memory Open/Swap/Add, commits swap document/slot together,
checks bank ownership before adoption, forwards tour validation cancellation and
blocks late tour import during export. **148 focused Node tests and the 169-module
build pass** in `artifacts/memory-tour-publication-20261025-131235`. No native
source changed in this pass. Next investigate the duplicate full base display
when renderWorkspace restores a saved entity selection. The broader goal stays
active and release qualification remains deferred; older receipts bind earlier inputs.

Newest: [bounded validation-key encoding](VALIDATION_KEY_ENCODING_2026-10-25.md)
uses the C JSON encoder only after proving its allocation fits existing limits;
streaming handles overestimates with identical complete keys. Warm 600-cell
analysis measures 10.284 to 3.927 ms; six-state validation 489.637 to 423.187 ms.
**109 native tests and three subtests pass** in
`artifacts/validation-key-checks-20261025-130030`; comparison:
`artifacts/validation-key-profile-j1y_o5hf`. Native cache code also changed:
refresh final review/proof inputs and rebuild the engine for packaging. Continue
the goal; broad release testing stays deferred. Earlier receipts bind earlier inputs.

Latest: [project geometry reuse](PROJECT_VALIDATION_REUSE_2026-10-25.md) avoids
repeated native checks/measures for identical complete models within one project
validation, while single-state projects bypass reuse and per-state checks remain.
Six-state 600-cell validation measures 2.046 to 0.486 s median with complete output
and saved-byte equality. Obsolete Open/Recover reads now abort on workspace edits
or export transitions without overwriting newer status. **227 native tests,
140 Node tests and the 169-module build pass** in
`artifacts/project-workflow-native-20261025-124730`; final comparison:
`artifacts/project-validation-profile-g6l8p8s7`. formats.py changed: refresh native
qualification/review and rebuild the engine for final packaging. The goal remains
active; older checkpoints below bind earlier source snapshots.

Current: [Library/file workflow](LIBRARY_FILE_WORKFLOW_2026-10-25.md) prepares
searches once, avoids rebuilding Library rows during model navigation, makes
Open/Recover cancellable across preload/main/engine stages, and prevents their
overlap. **93 focused tests, the 169-module build and desktop syntax checks pass**
in `artifacts/library-file-workflow-20261025-121616`. Search timings/result equality
are preserved in `artifacts/catalog-query-profile-FfLDv8`. Next investigations:
repeated native work in multi-state project loading and automatic invalidation
of file reads after workspace edits. The goal stays active; earlier checkpoints
below bind prior source snapshots. Broad release qualification remains deferred.

Newest: [export/Save reliability](EXPORT_SAVE_RELIABILITY_2026-10-25.md) guards
view/cell/reset/highlight edits, fixes active-drag camera ownership and queued
camera events, fences/cancels native cell-facing work, serializes Save dialogs,
and freezes animation cameras before preparation/dialog waits. **192 focused
tests and the 169-module build pass** in
`artifacts/export-save-workflow-20261025-115547`. The implementation goal remains
active; broad source/package/visible qualification remains deferred. Earlier
checkpoints below describe prior source snapshots.

Latest: [pose workflow continuation](POSE_WORKFLOW_2026-10-25.md) removes 27
construction-panel synchronizations from angle-only displays, omits intermediate
default geometry displays, and gates/streamlines all six manual angle sliders.
**115 focused tests and the 169-module build pass** in
`artifacts/pose-workflow-20261025-113419`. CPU-only initialization has identical
buffer hashes and a modest measured saving; visible desktop timing is pending.
Next: remaining direct viewport toggle/cell-visibility export guards. Older
checkpoints below bind prior source snapshots. The goal remains active.

Latest continuation: [core impact work](CORE_IMPACT_2026-10-25.md) implements
obsolete derived-work cancellation, warm inspection workers, dense bounds,
reduced morph scans, bounded/deduplicated recovery writes and hidden-render
avoidance. **127 focused checks and the 169-module build pass**; source-worker
measurements show substantial avoided startup costs. Packaged timing, broad
source qualification and release checks remain deferred. The goal remains active.
The first-fix checkpoint below predates this continuation.

Randall requested highest-impact implementation first, with noncritical testing
at the end before final release. Focused checks remain part of each fix.

Navigation now aborts automatic analysis and manual validation when their report
ticket no longer owns any output. Previously stale results were hidden but their
jobs continued, occupying workers or the FIFO queue ahead of current work.
Shared analysis remains active if manual validation replaces only its validation
output. Existing complete literal-source publication checks remain intact.

Changed: `ui/model-reports.mjs`, `ui/app.js`, `tests/model-reports.test.mjs`.
The four relevant report/job/pool suites pass **31 tests**, including ten rapid
navigation selections, worker retirement and ignored late responses. The
**168-module production build passes**. No Electron launch or desktop timing
measurement was performed; worker restart costs and visible navigation benefit
remain unmeasured. Broad checks and final packaging remain deferred.

The October 24 source qualification receipts describe the prior inputs and do
not qualify this changed workspace. Preserve those receipts. The sealed 0.27.20
baseline is unchanged. See the updated 0.27.21 handoff before final qualification.

# Current priority - October 24, 2026

0.27.21 source work is implemented and locally verified. Start with
[HANDOFF_0.27.21.md](HANDOFF_0.27.21.md) and
[RELEASE_0.27.21_DEVELOPMENT.md](RELEASE_0.27.21_DEVELOPMENT.md).
The active goal is to complete as much important core performance/reliability
work as possible; feature expansion remains paused.

Pose ownership now uses detached literal snapshots, avoiding per-frame JSON
conversion while detecting nested edits. Convex intrinsic 3D sizing retains one
bounded native plan, keyed by complete literal source/settings/context, while
preserving the full preparation comparison. Other methods retain reconstruction.
Repeat native analysis also reuses reports only for a complete unchanged literal
model, with bounded LRU storage; first analysis and edited models retain the
protected original analyzer. See [the analysis evidence](NATIVE_ANALYSIS_REUSE.md).
The truncated-tetrahedron investigation confirms matching automatic-radius
endpoints, the defined half-radius sizing midpoint and a fixed Viewer camera.

All 2,075 shipped-code Node tests, 4,476 native tests plus 96 subtests, and the
168-module build pass. Native has one skip; Node has none. Both source qualifiers
bind the same 2,474 unchanged inputs. See [source qualification](SOURCE_QUALIFICATION_0.27.21.md)
for repaired inherited tests and preserved initial runs. CPU-only comparisons: saved Grand hexacosichoron ownership checks
0.47959 to 0.27139 ms for a text label; truncated-tetrahedron warm native sizing
3.67552 to 1.01077 ms/pose, with exactly equal sampled frames. These are not
packaged app/GPU/FPS measurements. The handoff gives exact sequential normal-
session package, alternating profile, workflow, portable and sealing commands.
Real native JSON-lines repeat-analysis comparisons match complete old/new
reports: 600-cell median 1,226.371 to 18.405 ms. This excludes Electron IPC and
visible navigation. The packaged profiler now has a required `--navigation`
phase for the pending normal-session comparison.

No Electron launch, package, freeze, seal, commit or publication was performed.
Do not retry managed-sandbox launches/ACL workarounds. The last qualified local
pair remains **0.27.20** (`artifacts/source-pair-0.27.20.json`); its archive and
portable hashes still match. Six old frozen runtime inputs differ; a new snapshot
module and two native caches are added. All three protected importers and 1,665 prior
engine inputs are unchanged. Production remains the documented 0.26.0 preview.

Normal-session packaged checks and independent review are next; the
[review brief](CLAUDE_REVIEW_0.27.21.md) is ready. Fresh-user task observation
remains outstanding; use the prepared [protocol](CORE_WORKFLOW_OBSERVATION.md). The broader development goal remains active.

## Preserved October 23, 2026 checkpoint

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


The 0.27.20 code continuation is implemented and locally tested; **normal-session
packaged checks and Claude review remain pending**. Read
[HANDOFF_0.27.20.md](HANDOFF_0.27.20.md),
[RELEASE_0.27.20_DEVELOPMENT.md](RELEASE_0.27.20_DEVELOPMENT.md), and the complete
[brief including its Addendum](CODEX_BRIEF_0.27.20.md).

Task 1 guards angle-only annotation display updates after a completed full
refresh. Task 4 retains label materials and reuses full source verification only
on the explicitly guarded pose path. Publication, non-pose displays and capture
keep literal checks; the release doc explains the mutable-source argument for
Claude's review. Tasks 2 and 3's existing code remain intact. Empty annotation
documents remain explicit. The final focused run passes **163 tests**; the
**167-module build passes**. All **1,667 engine inputs** match the 0.27.19 freeze.

Claude reproduced annotated and emptied packaged 0.27.19 in the normal Windows
session, satisfying the reproduce-first rule. No Electron launch or ACL workaround
was retried in this continuation. No package, freeze, seal, source-pair write,
commit, push, tag or publication was performed. Do not launch Electron from the
managed sandbox. The handoff lists exact sequential commands for Claude's normal
session: isolated materials-only experiment, final package, 30 alternating
profiles, packaged/portable workflows, then review and deferred freeze/seal.

No new 0.27.20 median/IQR or speedup exists. The old blocked receipt is historical;
the final comparison file is reserved for real samples. The latest qualified local
pair remains **0.27.19**, public production **0.26.0**. Preserve all earlier release,
archive and evidence bytes. Feature expansion stays paused; fresh-user observation
and the separate morph investigation remain outstanding.

## Preserved 0.27.19 stopping-point context

The following stopping-point text is historical; the Claude response and the
incomplete 0.27.20 status above supersede its next-work/review status.

The current direction is to pause feature expansion and improve the core
experience: simplify controls and visible data, measure and improve performance,
investigate reported dual-morph scaling, and verify common workflows. Follow
[the roadmap](OPEN_SOURCE_ROADMAP.md) and [interface contribution guidance](../CONTRIBUTING.md).
The feature-expansion instructions below are historical and are superseded by
this direction. Existing staged features remain deferred.

## Paused at the 0.27.19 stopping point

Randall asked for a stopping point and two documents. Start with the
[next-session handoff](HANDOFF_0.27.19.md) and the separate
[Claude review brief and self-critique](CLAUDE_REVIEW_0.27.19.md).
Independent Claude review has not been run. The continuing development goal is
paused, not complete; resume when requested.

Absent annotation documents no longer trigger complete source cloning and
validation on presentation refresh. Publication/cancellation guards and explicit
document/empty-section validation remain. The actual bundled comparison shows
less sampled renderer non-idle time in one automatic 4D rotation task; RAF cadence
is unchanged. See [0.27.19 notes](RELEASE_0.27.19_DEVELOPMENT.md) for limits.

The 167-module build, 170 focused checks, actual packaged annotation/catalog and
eight core workflows, and portable wrapper pass. The portable's 1,716 extracted
resources match; 1,878 frozen runtime inputs match current package/source. All
1,667 engine inputs remain unchanged. Matching source is sealed with proof at
`artifacts/source-pair-0.27.19.json`; require that successful receipt at resume.

Latest qualified portable: `release/preview-0.27.19/Polytope Laboratory 0.27.19 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.19 source.zip`.
Current-byte/receipt index: `release/preview-0.27.19/verification.json`.
Public production remains 0.26.0. Nothing was published online.

Next work, when resumed: challenge the evidence with the Claude brief, measure
model-load/native latency and explicit-empty-annotation behavior, and arrange
fresh-user task observation. Feature expansion stays paused. Preserve this pair
and bump package/lock to 0.27.20 or later before changing frozen runtime.

## Preserved 0.27.18 implementation

Temporary observation ownership follows the viewer's own control replacements.
Fitting and export restore the original enabled/damping settings, including
nested holders and already disabled observation; independent replacements remain
untouched. Cleanup releases controls/busy state even if camera or presentation
restoration throws. The actual bundled 0.27.17 baseline reproduced both frozen
viewports after fitting and frozen derived rotation after PNG export/Cancel.
Real development pointer/Save checks recover both viewports in all three cases;
the 167-module build and 133 focused checks pass. See
[0.27.18 notes](RELEASE_0.27.18_DEVELOPMENT.md). Actual bundled pointer recovery,
sections, nets/PDF/held export/retry, nine saved-tour checks including decoded
WebM, saved 120-cell program reuse, core history/Save/Open, morphs, geometry
exports, intrinsic feedback and all 16 registered regular 4D sources pass with
development Python unavailable. Actual portable launch passes; 1,716 extracted
resources match the tested app and 1,878 frozen inputs match current source.
All 1,667 engine inputs are unchanged. Matching source is archived and verified:
`artifacts/source-pair-0.27.18.json`.

Latest qualified portable: `release/preview-0.27.18/Polytope Laboratory 0.27.18 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.18 source.zip`.
Package/current receipt: `release/preview-0.27.18/verification.json`.

Next: profile large-model loading and view updates, continue core control and
feedback review, and arrange fresh-user observation. Feature expansion stays
paused.

## Preserved 0.27.17 implementation

Saved-tour sections retain GPU materials across related source/domain cuts;
geometry, colors, picking and ownership are rebuilt. Disabled observation controls
stay still during draw, preventing fitted-camera rounding from invalidating the
exact tour capture. Actual packaged 0.27.16 reproduced the blank/stale frame;
intermediate development measurement found 20 program creations/links/deletions
across five warmed 120-cell cuts, reduced to zero after material reuse. Exact
capture guards remain intact. The 166-module build and 122 focused checks pass;
all 1,667 engine inputs are unchanged. Actual bundled 120-cell saved sections,
nine saved-tour checks (including decoded WebM), sections, core history/Save/Open,
nets/PDF/held export/retry, intrinsic feedback, all 16 registered regular 4D
sources, morphs and geometry exports pass with development Python unavailable.
Actual portable launch passes; 1,716 extracted resources match the tested app and
1,877 frozen inputs match current source. Matching source is archived and
verified: `artifacts/source-pair-0.27.17.json`. See
[0.27.17 notes](RELEASE_0.27.17_DEVELOPMENT.md).

Latest qualified portable: `release/preview-0.27.17/Polytope Laboratory 0.27.17 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.17 source.zip`.
Package/current receipt: `release/preview-0.27.17/verification.json`.

Next: continue measured core renderer/loading work, review capture/view controls,
and arrange fresh-user observation. Feature expansion stays paused.

## Preserved 0.27.16 implementation

Simple distance/angle feedback binds raw inputs and full source content; edits
clear prior data and cancel pending replies. Identity verification clears its
prior receipt while pending, permits notes/unit-display/observer edits and
silently discards work after model navigation. Query channels cancel separately;
global Cancel retains unrelated completed reports. Existing advanced measurement,
faceting, analysis and validation guards remain. The real 0.27.15 baseline
reproduced all five feedback bugs. The 166-module build, 351 focused checks and
development intrinsic/report/discovery/empty workflows pass. See
[0.27.16 notes](RELEASE_0.27.16_DEVELOPMENT.md). Actual bundled intrinsic feedback,
reports/discovery, empty/native history, publication/certification, catalog/linked,
all 16 registered regular 4D sources, core Save/Open, sections, morphs, nets/PDF/
animation and geometry export pass with development Python unavailable. Actual
portable launch passes; 1,716 extracted resources match the tested app and 1,877
frozen inputs match current source. Matching source is archived and verified:
`artifacts/source-pair-0.27.16.json`. All engine files are unchanged.

Latest qualified portable: `release/preview-0.27.16/Polytope Laboratory 0.27.16 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.16 source.zip`.
Package/current receipt: `release/preview-0.27.16/verification.json`.

Next: saved-tour actor section material/program profiling and measured reuse,
then further core UX review and fresh-user observation. Feature expansion stays
paused.

## Preserved 0.27.15 implementation

Empty workspaces disable model controls using parent fieldsets, preserving each
tool's existing limits. Header guidance keeps Library/New/Open easy to find;
Full screen moved to the header. Source-dependent menu actions recheck their
source before work, and native menu availability follows actual model/history
state through a bounded boolean IPC. Hidden mode keeps its null menu and focus
guards. The real 0.27.14 baseline reproduced raw missing-source errors and empty
save pickers. Current development Cancel/canceled-Open/first-model/native-history
workflows, 165-module build and 267 focused checks pass. See
[0.27.15 notes](RELEASE_0.27.15_DEVELOPMENT.md). Packaged empty Cancel/canceled
Open/native-history, reports/discovery, construction cancellation/certification,
startup Open/Recover, catalog/linked loading, core Save/Open, sections, morphs,
nets/PDF/animation and geometry exports pass with development Python unavailable.
Actual portable launch passes; 1,716 extracted resources match the tested app
and 1,876 frozen inputs match current source. Matching source is archived and
verified; receipt: `artifacts/source-pair-0.27.15.json`. All engine files are
unchanged. Earlier qualified pairs and unqualified candidates remain preserved.

Latest qualified portable: `release/preview-0.27.15/Polytope Laboratory 0.27.15 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.15 source.zip`.
Package/current receipt: `release/preview-0.27.15/verification.json`.

Next: remaining measurement/regular-identity feedback after source/input changes,
saved-tour section material reuse and fresh-user observation. Feature expansion
stays paused.

## Preserved 0.27.14 implementation

Analysis/incidence validation now clear old fields while loading, bind complete
literal source content and respect output ownership. Manual validation can
supersede the validation half of automatic analysis without discarding its other
fields. Discovery Cancel/failure offers an explicit Library retry without an
automatic model or project replacement. Late metadata cannot clear a retry.
The real 0.27.13 baseline reproduced stale/cross-source reports and absent retry.
The 164-module build, 261 focused checks and development report/startup/core
workflows pass. See [0.27.14 notes](RELEASE_0.27.14_DEVELOPMENT.md).
Packaged reports/discovery, construction cancellation/certification, startup
Open/Recover, catalog/linked loading, core history/Save/Open, sections, morphs,
nets/PDF/animation and geometry exports pass with development Python unavailable.
Actual portable launch passes; 1,716 extracted resources match the tested app
and 1,874 frozen inputs match current source. Matching source is archived and
verified; receipt: `artifacts/source-pair-0.27.14.json`. All engine files remain
unchanged. Previous qualified pairs and unqualified candidates are preserved.

Latest qualified portable: `release/preview-0.27.14/Polytope Laboratory 0.27.14 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.14 source.zip`.
Package/current receipt: `release/preview-0.27.14/verification.json`.

Next: empty-workspace controls after Cancel/canceled Open, remaining measurement/
regular-identity feedback, saved-tour section material reuse and fresh-user
observation. Feature expansion stays paused.

## Preserved 0.27.13 implementation

Cancel now owns native replies and releases busy state promptly, even when the
engine finished before the reply arrived. Late successes/failures cannot publish
or clear fresh progress. Catalog/linked reads share this owner. Certify current
binds the complete source, project, selected history, notes and units and checks
the 100-document cap twice. Open/Recover before catalog discovery suppress the
automatic default model. Guide text and empty-workspace heading are updated.
The actual 0.27.12 baseline reproduced all three publication bugs; current
development workflows and 251 focused checks pass. See
[0.27.13 notes](RELEASE_0.27.13_DEVELOPMENT.md). Packaged publication/startup
Open/Recover, catalog/linked loading, core construction/history, morphs, sections,
nets/PDF/animation and geometry exports pass with development Python unavailable.
Actual portable launch passes; 1,716 extracted resources match the tested app
and 1,872 frozen inputs match current source. Matching source is archived and
verified; receipt: `artifacts/source-pair-0.27.13.json`. All engine files match
0.27.12. Previous qualified pairs and unqualified candidates remain preserved.

Latest qualified portable: `release/preview-0.27.13/Polytope Laboratory 0.27.13 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.13 source.zip`.
Package/current receipt: `release/preview-0.27.13/verification.json`.

Next: startup Cancel/catalog discovery and late read-only report ownership
(Validate incidence after switching sources). Saved-tour section material reuse
and fresh-user observation remain open. Feature expansion stays paused.

## Preserved 0.27.12 implementation

Catalog loading improvements below are retained. General Export now invalidates
its geometry/net review immediately on Escape, Close or direct closure. Late
destination replies cannot write, close a fresh review or erase its feedback.
Actual native abort/write tracking with delayed close events passes in visible
development workflows. The 161-module build and 242 focused checks pass; see
[0.27.12 notes](RELEASE_0.27.12_DEVELOPMENT.md). Packaged catalog/linked loading,
core construction/history, morphs, sections, nets/PDF/animation and geometry
exports pass with development Python unavailable. Actual portable launch passes;
1,716 extracted resources match the tested app and 1,871 frozen inputs match
current source. Corresponding source is archived and verified; see
`artifacts/source-pair-0.27.12.json`. All native engine files remain unchanged.

Latest qualified portable: `release/preview-0.27.12/Polytope Laboratory 0.27.12 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.12 source.zip`.
Package/current receipt: `release/preview-0.27.12/verification.json`.

0.27.11 is unqualified: final packaged export QA reproduced an old OBJ overwrite
after parent closure. It is preserved unchanged with UNQUALIFIED.txt and
`artifacts/candidate-review-0.27.11.json`. 0.27.10 is also unqualified. The last
qualified pair before this correction was 0.27.9; it remains preserved.

## Preserved 0.27.11 implementation (unqualified candidate)

Catalog, New/default and linked-file opens now have project ownership, visible
pending markers, duplicate coalescing and explicit navigation/focus rules. Cancel,
Open/Recover and animation/tour export discard pending replies. Different model
selections still open separate documents. Linked preflight supports native job
IDs/cancellation before engine submission; existing root/path checks remain.
Malformed native File menu, History close and packed-page range text is repaired.
See [0.27.11 notes](RELEASE_0.27.11_DEVELOPMENT.md).

Unsupported entries keep their original disabled state. The 0.27.10 candidate
is unqualified and preserved unchanged; the filtered replay and gate correction
are in `artifacts/candidate-review-0.27.10-followup.json`. Visible one-second
core playback passes; hidden functional sampling now uses four seconds and
records its duration, retaining the moving-pose assertion.

The actual 0.27.9 baseline reproduced project contamination, publication after
Cancel and stolen focus: `artifacts/catalog-workflow-XZ3BGa/result.json`.
The 161-module build, 185 focused checks and the complete development catalog/
linked/importer/animation workflow pass. Pending state was checked at two sizes.
Packaged/portable/source verification is pending. Native engine sources are
unchanged; prior qualified portable/source pairs remain preserved.

Next: construction feedback and broader publication/export review. Audit direct
`addDocument` awaits such as Certify current, and global Cancel with a held,
already-completed construction reply. Reproduce first; retain source ownership
and native mathematical rules. Saved-tour actor section material reuse and
fresh-user observation remain outstanding. Feature expansion remains paused.

## Preserved 0.27.9 implementation

Native source capture still validates a bounded detached source. Repeated checks
now walk the complete literal state and compare exact model text under the same
resource envelope, avoiding repeated memory-bank cloning/freezing/validation.
Owners require an authentic in-process capture; IDs, fingerprints and reports
are not trusted. Source ID/unit descriptors refuse getters without invoking them.
The memory bank and all native engine files are unchanged.

The 160-module build, 933 ownership/control checks and visible development
section workflow pass. Isolated repeated source checks measure a median 2.59 ms
versus 3.86 ms in 0.27.8; actual desktop timing ranges overlap prior observations.
See [0.27.9 notes](RELEASE_0.27.9_DEVELOPMENT.md). Packaged construction/history,
morphs, sections/animation, nets/PDF and geometry exports pass with development
Python unavailable. Actual portable launch passes; all 1,716 extracted resource
files match the tested app and 1,870 frozen runtime inputs match current source.
Portable: `release/preview-0.27.9/Polytope Laboratory 0.27.9 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.9 source.zip`; source-pair
receipt: `artifacts/source-pair-0.27.9.json`. Prior qualified pairs remain intact.

Next: loading/construction feedback and export ownership review. The bounded
signature walk remains measurable; preserve exact-content, full-state resource
and late-publication checks in any further changes. Saved-tour actor sections
still recreate their materials. Fresh-user observation remains unperformed.

Concrete loading targets: `renderCatalog` and `library-open-anyway` await work
then add documents directly. Reproduce a held load across project replacement,
competing selections, cancellation and export before defining publication rules.
Also inspect and repair the three source lines recorded in
`artifacts/ui-encoding-audit-0.27.9.json`: native File-menu text, packed-page range
error and History parameters close button contain malformed Unicode text.

## Preserved 0.27.8 implementation

Live section results retain compiled display materials between cuts from the
same source/mode. All geometry, colors, picking and source ownership are rebuilt.
Empty results, source/mode changes and nonsections release materials; pending
environment decoding is canceled. Native engine sources are unchanged from
0.27.7. The five-cut visible 120-cell workload now creates/deletes zero programs
instead of 20; task timing ranges overlap prior observations, so no general
latency/FPS claim is made. See [0.27.8 notes](RELEASE_0.27.8_DEVELOPMENT.md).

The 159-module build, 122 focused checks and visible development section workflow
pass. Packaged sections/animation, nets/history/PDF and geometry exports pass
with development Python unavailable. Actual portable launch passes, all 1,716
extracted resource files match the package, and 1,869 frozen runtime inputs match
current source. The packaged profile confirms zero new programs across five cuts.
Portable: `release/preview-0.27.8/Polytope Laboratory 0.27.8 preview.exe`.
Matching source: `release/Polytope Laboratory 0.27.8 source.zip`; source-pair
receipt: `artifacts/source-pair-0.27.8.json`. All 1,667 engine files are unchanged
from 0.27.7; prior qualified portable/source pairs remain preserved.

Next: investigate the bounded clone/validation/freeze work still sampled through
numeric/native source ownership. Preserve exact-content, resource and publication
checks. Continue loading/construction feedback and broader export ownership.
The separate saved-tour actor renderer still recreates section materials.

## Preserved 0.27.7 implementation

Working sources are 0.27.7. Repeated convex section source validation now uses
bounded exact-content reuse, without trusting caller fingerprints/reports or
changing mathematical rules. Every model field participates; changed content
revalidates, failures are not cached, and large/non-JSON inputs validate normally.
Limits are eight entries / 2 MiB per key / 8 MiB total / 65,536 key-walk nodes.
Protected importer and geometry files are unchanged.

Manual plane evaluation now locks promotion, derived export and derived memory
capture until its result is ready. Cancellation reaches the native derived job;
unapplied plane expressions survive animation snapshot restoration for the same
source/plane/units. General Export net PDF now uses guarded atomic publication;
source-unit changes or closing the export dialog preserve prior files. See
[0.27.7 notes](RELEASE_0.27.7_DEVELOPMENT.md) for reproduction and receipts.

The 159-module build, 145 focused Node tests and 38 native tests (plus three
subtests) pass. Packaged section and net/PDF/history/animation workflows pass with
development Python unavailable. Repeated native IPC is 3.5-3.9 ms for tesseract
and 31.4-32.5 ms for 120-cell, versus 6.0-6.4 and 113.6-116.1 ms in 0.27.6.
Geometry matches reference output. These are workload timings, not FPS. Native
profiling separates calculation from JSON; the visible 120-cell task profile
records 51.8-56.5 ms from Evaluate to ready, with its sampling limits documented.
Actual portable launch passes with development Python unavailable; all 1,716
extracted resource files match the tested package. Package/current verification
passes for 1,869 frozen inputs. Matching source is
`release/Polytope Laboratory 0.27.7 source.zip`; source-pair receipt is
`artifacts/source-pair-0.27.7.json`.
Prior qualified releases remain intact. Public production remains 0.26.0;
nothing was published online. Feature expansion stays paused.

Next: investigate section material/program reuse and the bounded snapshot work
seen in `artifacts/section-render-profile-xY5wqB/renderer.cpuprofile`. Existing
Viewer.setModel reuseMaterials is qualified for morphs; section use still needs
source/topology/color/appearance checks and a same-workload comparison. The
sampled clone/freeze/validation path is model-memories/native-source-binding;
do not replace its full ownership or resource checks with a claimed fingerprint.
Then continue model-loading/construction feedback and broader export ownership.
Fresh-user observation remains unperformed. Staged integrations stay deferred.

## Preserved 0.27.6 implementation

Working sources are 0.27.6. Derived controls enforce literal bounded source
indices, animation/tour ownership and source-aware slider debounce. Invalid IDs
restore the applied selection. Slider/mode/entity changes make old derived
results unavailable immediately; older native results cannot publish after
relevant plane/entity/fill changes. Plane evaluation ignores hidden entity text.
Labels and the offline guide explain indices, intrinsic depth and event wrapping.
Superseded static help was removed. See [0.27.6 notes](RELEASE_0.27.6_DEVELOPMENT.md).

Repeated sections now reuse bounded native workers. On the recorded i7-14700K
workload, tesseract native IPC measured 368.6-386 ms before versus 6.0-6.4 ms
packaged; 120-cell measured 496-529.2 ms versus 113.6-116.1 ms. Geometry output
checks match. These are repeated-job measurements, not FPS; startup and the
200 ms slider debounce remain separate costs.

The 159-module build, 141 focused Node tests and 26 native tests (plus three
subtests) pass. Actual packaged section controls, keyboard use, two window sizes,
exact PNG timestamps, oblique section animation, empty cuts, Save/Open, ordinary-
cell promotion and offline guide checks pass with development Python unavailable.
Packaged net/history/print and geometry-export regressions also pass. Actual
portable launch passes and extracted runtime hashes match the tested package.
Portable: `release/preview-0.27.6/Polytope Laboratory 0.27.6 preview.exe`.
Source: `release/Polytope Laboratory 0.27.6 source.zip`. Package verification
checks 1,868 frozen runtime/build inputs; source pairing is
`artifacts/source-pair-0.27.6.json`. Older qualified assets remain intact.
Public release remains 0.26.0; nothing was published online.

Next: profile remaining 120-cell section cost, viewport reconstruction and
serialization, then core model loading/construction feedback. Review manual
plane expression evaluation: the applied old plane remains valid until the
numeric publisher accepts new values, so promotion availability and preservation
of uncommitted input drafts merit a separate UX check. Broader display/selection
handlers still need export-ownership review. Fresh-user observation remains
unperformed. Feature expansion and staged integrations remain deferred.

## Preserved 0.27.5 implementation

Working sources are 0.27.5. Generate/reset and Start with separate faces/cells
now supersede saved reconstruction, append reversible history and preserve
native Open restoration. Animation/tour export ownership reaches net controls;
queued view/selection events cannot mutate the saved layout. Tab-edge selection
remains available and tab refresh respects export ownership. The built-in guide
explains reset/separation. See [0.27.5 notes](RELEASE_0.27.5_DEVELOPMENT.md).

The 158-module build and 131 focused Node checks pass. Actual packaged net
history, native Open, held animation dialogs, cancellation and successful PNG
retry pass with development Python unavailable. PNG source times are exactly
0, 0.125 and 0.25 seconds. The geometry-export/derived-section regression passes.
Actual portable launch passes; extracted resources match the tested package.
Local portable: `release/preview-0.27.5/Polytope Laboratory 0.27.5 preview.exe`.
Corresponding source: `release/Polytope Laboratory 0.27.5 source.zip`.
`verification.json` in the release directory checks package/current bytes and
1,867 frozen runtime/build inputs. Source pairing is recorded in
`artifacts/source-pair-0.27.5.json`.

The intermediate 0.27.4 candidate is unqualified and superseded: review caught
its omission of the existing Select tab edge action. Preserve its files and
`artifacts/candidate-review-0.27.4.json`; do not present it as a verified release.
Previous qualified releases remain intact. Public production remains 0.26.0;
nothing was published online. Feature expansion stays deferred.

Next: reproduce section controls during animation export. Direct derived-mode,
section-depth slider and entity-ID handlers in app.js still need ownership and
literal-ID checks; evaluate in the actual app before changing them. Review
section task organization and status text, then profile larger-model
reconstruction/serialization. Fresh-user observation remains unperformed.
The static fallback help text is superseded at runtime by UserGuide; tidy it
when reviewing section documentation rather than treating it as current UI.

## Preserved 0.27.3 implementation

Working sources are 0.27.3. Face and whole-cell net controls now use task groups,
readable summaries and collapsed numerical checks. Layout-dependent actions and
literal source IDs are guarded. Net SVG/PDF writes bind to the source and print
settings, preserve existing destinations after stale/canceled preparation, and
use one-shot atomic save tickets. PDF titles are readable. Repeated native net
jobs reuse bounded workers. See [0.27.3 notes](RELEASE_0.27.3_DEVELOPMENT.md).

The 158-module build, 62 focused Node checks and 49 native checks pass. Actual
packaged net editing, keyboard controls, fold playback, shrink, paper exports,
Save/Open/history and geometry-export regression pass with development Python
unavailable. Actual portable launch passes and extracted resources match the
package. Local portable: `release/preview-0.27.3/Polytope Laboratory 0.27.3 preview.exe`;
matching source: `release/Polytope Laboratory 0.27.3 source.zip`. Package verification
checks 1,867 frozen runtime inputs; source-pair evidence is
`artifacts/source-pair-0.27.3.json`. Earlier releases remain intact. Public release
remains 0.26.0; nothing was published online.

Repeated small net jobs measured roughly 4-12 ms after worker reuse versus
366-389 ms before. This is end-to-end native IPC on representative cube/tesseract
jobs, not FPS or a universal speedup. Initial process imports and dense geometry
remain separate costs. The release notes retain hardware, ranges and receipts.

Immediate next work: reproduce/fix Generate/reset and Start with separate
faces/cells after an existing history state. Saved reconstruction appears able
to override explicit generation. Preserve native Open restoration and Undo/Redo.
Then audit animation-export state notifications and direct net view/selection
handlers. Continue section task organization and larger-model profiling.
Fresh-user observation remains unperformed. Feature expansion stays deferred.

## Preserved 0.27.2 implementation

Working sources are now 0.27.2. The new export review shows format eligibility,
unit constraints and data losses before selecting a file. Preparation binds to
the source, history, notes, metadata, units and options; a held save dialog cannot
publish a changed or canceled result. Geometry uses one-shot atomic write tickets.
OFF refuses loose edges and incompatible embedding coordinates instead of
writing invalid records. See [0.27.2 notes](RELEASE_0.27.2_DEVELOPMENT.md).

The 155-module build, 35 native checks and 92 focused Node checks pass. Actual
development and packaged export workflows pass, including real OBJ/DXF/STL/VRML/
JSON output and derived 3D sections. The packaged morph/PNG/Save/Open regression
also passes. The qualified local portable is in `release/preview-0.27.2`, with a matching
`release/Polytope Laboratory 0.27.2 source.zip`. Actual portable launch passes;
its extracted runtime matches the tested package. `verification.json` in the
release directory records its hash and source/receipt checks. Runtime inputs
were frozen before packaging; `artifacts/source-pair-0.27.2.json` verifies the
corresponding source archive.

The qualified 0.27.1 portable remains in `release/preview-0.27.1`. Its morph
layout, replay, scrub cancellation and source-default fixes remain in 0.27.2;
see [0.27.1 notes](RELEASE_0.27.1_DEVELOPMENT.md). Its visible profiling removed
repeated shader work without increasing the observed pose throughput. Do not
claim a universal FPS improvement. The reviewed 0.27.0 and public 0.26.0 assets
also remain intact. Nothing from this continuation has been published online.
Staged feature additions remain deferred.

Historical next work: simplify the Nets task organization and its numerical reports,
verify ordinary section/net/save/export paths, and profile larger-model geometry
reconstruction and serialization. Actual user testing remains unperformed;
automated workflows do not substitute for observing fresh users. Hidden
playback has a slow scheduling cadence and does not measure normal visible
presentation. Use `test:export-workflow` or `test:morph-workflow` with
`-- --visible` for the normal desktop environment.

## Historical feature-expansion handoff

# Next session: resume from the published 0.26 checkpoint

Checkpoint: October 7, 2026. Randall requested a good stopping point and a clear
handoff. Production stays at **0.26.0**. Finish this checkpoint, pause the goal,
and start no additional implementation until Randall resumes.

## Start here

Repository/workspace: `C:\Users\Randall\Documents\4d-polytope-desktop`.
Use Windows PowerShell and `npm.cmd`. The long-term goal is feature completeness
or practical approximately 90% Stella4D coverage, using **GPT-6.1-Sol subagents**.
That goal is unfinished; no measured 90% parity is claimed. Program code is
**GPL-3.0-only**, with third-party licenses and attribution retained.

Randall prioritizes features and community GitHub issues. Use a build and small,
relevant checks; investigate actual launch/save/export/geometry failures. Do not
restart a broad regression campaign just because this session resumed.

Read this document before older handoffs. The historical active-development
paragraphs in other documents describe earlier work and do not override this
stopping checkpoint. The next working version should be **0.27.0**, but it has
not been bumped and none of the three new stages below has been mounted.

## Published and usable

- Public repository: https://github.com/Pardesco/polytope-laboratory
- Current prerelease: https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.26.0
- Windows x64 portable: https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.preview.exe
- Matching GPLv3 source: https://github.com/Pardesco/polytope-laboratory/releases/download/v0.26.0/Polytope.Laboratory.0.26.0.source.zip
- Issues: https://github.com/Pardesco/polytope-laboratory/issues

The v0.26.0 tag and main both point to
`a0db858cbf108d3e1399f4577e7758e60692b86d` at this checkpoint. The public README
has download/build instructions, an actual portable screenshot and feature
limits. Nine runnable native projects are in the matching source ZIP under
`examples/0.26`; see `examples/README.md`. The earlier v0.25.0 release remains
available and unchanged.

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| Portable EXE | 143224808 | `323ac9181c4205fdaf814756fde36b1429046a00662dae6cedd9fb59f60d7756` |
| Source ZIP | 26147373 | `ee7cab9441e52c11affe49808cffbb83cad2d3005bd4379835229dc4fb692aef` |

GitHub's uploaded asset digests were checked against both local files. All
2,425 archived files were verified before publication, including 1,860 frozen
runtime/build inputs. The same 1,860 inputs were checked against the committed
Git blobs. The actual portable launched with development Python unavailable;
the final UI build passed with 153 modules. This is a community prerelease.

Local release files:

```text
release/preview-0.26.0/Polytope Laboratory 0.26.0 preview.exe
release/Polytope Laboratory 0.26.0 source.zip
artifacts/github-publication-0.26.0.json
artifacts/preview-build-source-0.26.0.json
artifacts/source-pair-0.26.0.json
artifacts/source-package-0.26.0.json
artifacts/community-preview-0.26.0.json
artifacts/preview-portable-quick-IOCpif/result.json
```

## What is already in production

The 0.26 release includes the earlier workspace, catalog, rendering,
construction, morph, faceting, net, measurement, native project/history and
offline-help tools. New mounted workflows include:

- Complete ordinary 4D cell sections, including concave/disconnected regions
  and holes; source-owned section labels and eligible whole-face PNG content.
- Dual-morph ratio animation with PNG/WebM export and explicit fitting across
  sampled export frames, with source/view restoration.
- Coincident-edge joining of supported ordinary convex and concave/toroidal
  pieces, physical tabs, source content and printing. PNG now appears in net PDF.
- Projective reciprocal ideal-point identities with clipped wire display,
  reflected snub forms, symbol aliases and separate Skilling geometry.
- Generalized 3D signed winding and algebraic area/volume, with evidence export.
- Literal 4D arrangement/regiment comparison and independent-incidence compounds.
- Finite distances to actual simple planar concave 3D faces, with witnesses.

Read `RELEASE_0.26_PREVIEW.md` and `RELEASE_0.26_DEVELOPMENT.md` for supported
domains. Controls being available do not imply support for every star,
singular, compound or nonconvex input. Offline help has 25 searchable topics;
the packaged catalog has 1,305 entries.

Useful actual desktop evidence, already run:

| Workflow | Receipt |
| --- | --- |
| Dual-morph PNG/WebM and fitted fold capture | `artifacts/feature-0.26-quick-254ZbX/result.json` |
| Projective duals, snubs, Skilling, reflection/history | `artifacts/projective-snub-quick-fWUhHk/result.json` |
| Section labels/PNG, capture, promotion, Save/Open | `artifacts/section-content-quick-ApisKX/result.json` |
| Density inspector, JSON/CSV and saved evidence | `artifacts/density-info-quick-X0hY43/result.json` |
| Regiment comparison, compounds, replay and concave distances | `artifacts/regiment-distance-quick-UdLQGc/result.json` |

Root integration fixes include export-owned section read access while
construction/promotion stay blocked, safe empty-workspace comparison startup,
the shared history commit returning its published result, history branching for
native-supported operations, projective PNG status and print-window PNG CSP.
Preserve these when integrating shared app/controller hunks.

## Next features: staged, not shipped

All three stage names end in `0.26` because they were authored against that
baseline. They belong to the next working release. Do not describe them as
available in the published portable. Frozen stages are local development
material; they are not included in the public 0.26 corresponding source archive.

| Stage | Handoff and integration | Scope |
| --- | --- | --- |
| `development/nonconvex-vertex-figure-completion-0.26` | `HANDOFF.md`, `TRANSPLANT_MANIFEST.json` | Completion against ten supplied regular star 4D types, with true local incidence, explicit ambiguity and replayable source history |
| `development/symmetry-orbit-coloring-0.26` | `README.md`, `qualification.json`, `TRANSPLANT_MANIFEST.json` | Verified full/proper/selected-subgroup source-face or 4D-cell colors, undoable RGBA, history, folded 3D colors and color-print pages |
| `development/waterman-4d-0.26` | `NEXT_SESSION.md`, `README.md`, `transplant-manifest.json` | Exact rational D4 lattice/sphere membership and qualified complete 4D convex hull incidence |

Star vertex-figure stage is **READY/frozen**: six new files, six shared targets,
37 guarded hunks. Manifest SHA256:
`8d52f3c64bb7552205e023bc4af4bd12cf7afffe271bc72816533476a646bf39`.
Nine native groups plus ten subtests, six Node groups and an isolated 154-module
build pass. Its optional annotated fixture is
`examples/regular-star-vertex-figure.polyproj` inside the stage. In Construct,
choose **4D from vertex figure**, **Ten supplied regular star 4D types**, find
candidates, explicitly select **Grand hexacosichoron**, and set edge length 3.
Save/Open and inspect Replay/Parameters. This is finite catalog completion,
not a general uniform/scaliform construction theorem.

Orbit-color stage is **READY/frozen**: three new modules, nine shared targets,
26 guarded hunks. Manifest SHA256:
`645c0c326311dd88da7b8b51512b7bb49b0ae8270e99e4caff4c7bc48a72d144`.
Focused native checks, three real-native/controller/Viewer checks and an isolated
155-module build pass. It includes `cube-orbit-review.polyproj` and
`tesseract-orbit-review.polyproj`. Use Appearance -> Verified symmetry orbit
colors -> Preview -> Apply -> Verify saved colors. Cell shrink separates cell
owners in 4D. Plain legacy net SVG and 4D cell-net printing are outside this stage.

The sealed manifests' new-file hashes and guarded hunks matched the current
production baseline at the stopping checkpoint. Recheck shared hunks after each
mount; earlier stages may modify the next stage's shared files.

Waterman stage is also **READY/frozen**: four new runtime/test files and 15 exact
hunks across eight shared targets. Manifest SHA256:
`bf3dc4b6eedbdb8eb955ba4de9a9c01b65e4cb65118f6640c66a98dfb555315f`.
Three native groups, three Node groups, an isolated 157-module build and desktop
syntax checks pass. Exact rational D4 ball membership is certified separately
from the approximate, uncertified hull geometry. The centered first shell
qualifies the full 24-cell incidence; a shifted rational root has 16 tetrahedral
cells. Read the stage's `NEXT_SESSION.md` for exact commands and the remaining
root-owned GUI check. No named Stella root presets are guessed.

## Recommended first work on resume

1. Confirm this checkpoint and the three final stage handoffs; do not rebuild
   or regenerate frozen stage fixtures/manifests. Confirm root versions and
   protected hashes before changes.
2. Bump `package.json`, `package-lock.json` top-level version and
   `package-lock.json`'s `packages[""].version` to **0.27.0**. Create
   `docs/RELEASE_0.27_DEVELOPMENT.md` and update current build status.
3. Integrate one stage at a time using guarded hunks and the root mount helper.
   Start with star vertex figures, then orbit colors, then Waterman. Inspect
   shared-file conflicts rather than replacing entire copied engine/UI trees.
4. Run that stage's mounted focused checks and `npm.cmd run build`, then one
   short actual desktop workflow including native Save/Open/history where
   applicable. Only root launches the real app; subagents remain isolated.
5. Update features/limits, example projects and the coverage ledger. Continue
   GPT-6.1-Sol subagents on fresh, nonoverlapping stages once these are mounted.

Root mount commands (run and review one stage at a time):

```powershell
python -B scripts/mount-feature-stage.py development/nonconvex-vertex-figure-completion-0.26 TRANSPLANT_MANIFEST.json
python -B -m pytest -q tests/test_regular_star_vertex_figure_completion.py tests/test_vertex_figure_construction.py
node --test tests/regular-star-vertex-figure-controls.test.mjs tests/vertex-figure-construction-controls.test.mjs
npm.cmd run build

python -B scripts/mount-feature-stage.py development/symmetry-orbit-coloring-0.26 TRANSPLANT_MANIFEST.json
python development/symmetry-orbit-coloring-0.26/native-sanity.py --mounted
node development/symmetry-orbit-coloring-0.26/sanity.mjs --mounted
npm.cmd run build

python -B scripts/mount-feature-stage.py development/waterman-4d-0.26 transplant-manifest.json
python -B -m unittest discover -s tests -p test_waterman4d.py
node --test tests/waterman4d.test.mjs
npm.cmd run build
```

The helper preflights all changes before writing and records backups/receipts in
`artifacts`. If a later manifest conflicts, create a fresh root integration copy
with documented minimal adjustments and provenance. Never edit the frozen original.

## Git and release safety

**The original development worktree and public repository have different Git
ancestry.** The original HEAD is
`37a602738e478e4996f982c366b1bed3bbed8bed` and many accumulated local changes are
uncommitted. Do not reset/clean it, blindly push it to public main, or force-push.

The actual public-history checkout is:

```text
build/github-publication-0.26/source
```

It is at the published `a0db858...` commit. Its local `core.autocrlf` is false
so committed source bytes match the frozen build inputs. Future publication
should use a fresh checkout of public main and only the verified corresponding
source snapshot plus intentional public documentation. The original root's
origin also points to the public repository; that does not reconcile ancestry.

GitHub CLI is authorized as **Pardesco**; publication was explicitly authorized.
No new sign-in/permission question is needed for the already authorized scope.
Never read or print saved tokens. Some normal sandbox Git pushes fail silently;
the approved escalated push succeeded. Use no force/clobber operations.

Preserve historical executable/ZIP assets, source hashes and receipts. Do not
rerun the 0.26 source-pair verifier against changed 0.27 sources: it correctly
expects the original frozen inputs. For a new release, build, freeze, package,
verify and publish a new version. Package scripts refuse overwrite of an
existing portable. The old v0.25 PNG-in-PDF limitation is historical; v0.26
fixes print-window PNG loading.

## Protected files and development constraints

Do not edit these original importer files; exact expected SHA256:

```text
engine/__init__.py 386c22bb99742201703c33eba63836bd0bebcccff37107c67a06b139fd0e5923
engine/formats.py fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23
engine/geometry.py 9a9a1243223ca38aabce4bc762cbd463939a177f104bfa08c4ada81774b85414
```

Read-only checks confirmed all three hashes at this checkpoint. Frozen previous
stages, receipts and releases stay intact. Assign subagents fresh isolated
directories; root alone mounts production and runs actual GUI checks.

Use `rg` for searches. Actual Electron may require approved escalated execution;
retain its normal sandbox and never substitute `--no-sandbox`. Background helpers
on Windows use hidden windows. Track and poll running tool session IDs rather
than restarting work after a timeout. Keep screenshots/results from failed
checks as evidence. Camera motion alone must not invalidate source ownership.

`scripts/record-development-head.py` generates build status; this handoff is
maintained separately so a future automated refresh cannot silently replace it
with older generated session prose.

## Real remaining gaps

The supplied catalog is not a verified reconciliation of all 2,191 baseline
uniform-polychora identities. Remaining areas include fissary/scaliform
classification, infinite-dual filled faces/nets/morphs, general star-cell
sections, unrestricted nonconvex 4D distances, arrangement-resolved union/bulk
volumes and specialized construction/animation domains. Generalized algebraic
measures are not union measures. Catalog counts alone do not establish parity.

Existing conformance status is mostly prototypes; this release closes no new
requirement-wide gates. Earlier broad regression failures remain retained and
unresolved; the scoped release evidence does not claim full regression success.
Print dimensions have Chromium quantization: the 1,000 mm sheet check measured
1,000.167 mm. Signing, installer/upgrades and clean-machine qualification remain
pending. Keep these limits factual without making them blockers to community
development unless a concrete issue requires it.

## Resume prompt

> Read docs/NEXT_SESSION.md and the sealed stage handoffs. Resume the paused
> feature-complete goal using GPT-6.1-Sol subagents. Keep v0.26 assets unchanged,
> bump working sources to 0.27, mount the three staged features one at a time,
> use builds and focused workflow checks, then continue closing real Stella4D
> feature gaps. Do not force-push the original development Git history.
