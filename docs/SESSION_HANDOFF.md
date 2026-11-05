> Published October 24, 2026: [0.27.20 community preview](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20) is now public, with matching executable/source ZIP. GitHub main and tag v0.27.20 use the verified sealed source plus publication documentation updates (commit `62abb4c`). Local 0.27.21 remains unqualified. Older public-0.26.0 statements below are historical.

# Current handoff - October 25, 2026

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
retains promoted/memory units and document fields, rejects the 101st document at
append and prevents old imported notes/metadata returning in JSON export.
**173 focused tests and the 169-module build pass**, including native Save/Open,
physical scale and cleared-field export/reimport. Continue remaining workflow
handoffs; broad qualification remains deferred and the goal is active.

Newest: [cancel/content ownership](CANCEL_CONTENT_2026-10-25.md) stops delayed/
active derived work, releases canceled plane locks, retains completed receipts
and fences obsolete fold diagnostics. **156 focused tests and the 169-module
build pass**. Next inspect promotion units/notes/data handoffs. Continue the
active goal with broad qualification deferred.

Newest: [derived publication](DERIVED_PUBLICATION_2026-10-25.md) keeps unfinished,
failed and stale results unavailable to promotion, memory and export; current
completion refreshes the derived preview. Export pauses playback and completes
the frozen plane after an interrupted section frame. **174 focused tests including
nested cases and the 169-module build pass**. Continue with Cancel/debounce and
late fold-content ownership; broad qualification remains deferred.

Newest: [portable source streaming](PORTABLE_SOURCE_STREAM_2026-10-25.md) removes
the temporary tagged tree, retains exact bytes/checks and refuses disguised sparse
arrays. **419 focused tests including nested cases and the 169-module build pass**.
Portable key CPU median: 6.173 to 4.578 ms; no general navigation timing claim.
Continue the goal with coherent everyday workflows and usability prioritized.
Stella4D equivalence and broad release qualification remain unproven/deferred.

Newest: [annotation source encoding](ANNOTATION_SOURCE_ENCODING_2026-10-25.md)
removes buffer/BigInt allocations and repeated index-key parsing without skipping
source fields/checks. **403 focused tests including nested cases and the 169-module
build pass**. Portable key CPU encoding: 8.808 to 5.951 ms; full navigation samples
vary. Continue profiling source-walk/container costs; defer broad release checks.

Newest: [navigation display](NAVIGATION_DISPLAY_2026-10-25.md) restores selection
before a single full display, preserving geometry/content/picking ownership.
**171 focused Node tests and the 169-module build pass**. Annotated source CPU
navigation measures 363 to 339 ms; remaining ~350 ms annotated preparation is the
next profiling candidate. Continue the active goal with broad qualification deferred.

Newest: [memory/tour publication](MEMORY_TOUR_PUBLICATION_2026-10-25.md).
Memory Open/Swap/Add recheck export/capacity, Swap commits its document/slot in
one continuation, tour event cancellation reaches NativeJobs, and late tour
import cannot publish during export. **148 focused Node tests and the 169-module
build pass**. Continue the goal; profile duplicate saved-selection display work
next. Broad release qualification remains deferred.

Newest: [bounded validation-key encoding](VALIDATION_KEY_ENCODING_2026-10-25.md).
**109 native tests and three subtests pass**. Complete-key warm analysis measures
10.284 to 3.927 ms; six-state validation 489.637 to 423.187 ms with full output
equality. Native cache source changed; refresh final proofs/review and rebuild
the engine. Continue the goal with broad release checks deferred.

Current: [project validation reuse](PROJECT_VALIDATION_REUSE_2026-10-25.md).
**227 native / 140 Node focused checks and the 169-module build pass**. Complete
identical project models reuse native geometry results within one request;
obsolete file reads abort promptly when their workspace becomes ineligible.
formats.py changed, requiring refreshed native proof/review and a rebuilt engine
for final packaging. Continue the goal; broader qualification remains deferred.

Newest work: [Library/file loading](LIBRARY_FILE_WORKFLOW_2026-10-25.md).
**93 focused checks, the 169-module build and desktop syntax checks pass**.
Open/Recover now have cancellable request IDs and a shared lock; Library search
and navigation avoid repeated work. Review repeated native work in multi-state
projects next. The goal remains active, and broad real-desktop/release checks
remain deferred. Earlier receipts below bind prior snapshots.

Current work: [export/Save reliability](EXPORT_SAVE_RELIABILITY_2026-10-25.md).
**192 focused checks and the 169-module build pass**. New guards cover viewport
edits, active drag/camera ownership, delayed cell-facing publication, overlapping
Save and export preparation/dialog waits. Continue the active high-impact goal;
real packaged/visible checks and broad release qualification remain deferred.
Earlier checkpoints below describe prior source snapshots.

Newest work: [pose workflow continuation](POSE_WORKFLOW_2026-10-25.md).
It removes repeated panel scans and intermediate display work, and makes manual
rotation obey export ownership. **115 focused checks and the 169-module build
pass**. The next identified reliability item is the remaining direct viewport
toggle/cell-visibility handlers. Continue the active goal; broad release testing
is deferred. Earlier receipts below describe earlier source snapshots.

Continue the active highest-impact core performance/reliability goal. Read
[the current changes and evidence](CORE_IMPACT_2026-10-25.md) and
[NEXT_SESSION.md](NEXT_SESSION.md). Six improvements cover cancellation,
inspection startup, dense bounds, morph normalization, recovery and hidden
rendering. **127 focused tests and the 169-module build pass**. Broad source and
packaged release qualification remain deferred. Earlier receipts below are
preserved history and do not bind the current changed source.

## October 24 handoff

Use [NEXT_SESSION.md](NEXT_SESSION.md),
[HANDOFF_0.27.21.md](HANDOFF_0.27.21.md) and
[RELEASE_0.27.21_DEVELOPMENT.md](RELEASE_0.27.21_DEVELOPMENT.md).
0.27.21 complete source suites and build pass: 2,075 Node tests, 4,476 native
tests plus 96 subtests, with one native skip. Both qualifiers bind the same
2,474 unchanged inputs. See [source qualification](SOURCE_QUALIFICATION_0.27.21.md).
The candidate is ready for normal-session packaged qualification;
the last qualified local pair is 0.27.20. Production remains the documented
0.26.0 preview. The active goal prioritizes important core performance and
reliability work; feature expansion remains paused. Earlier directions below
are historical and do not supersede the current handoff.

## Preserved October 22, 2026 checkpoint

Start with [HANDOFF_0.27.19.md](HANDOFF_0.27.19.md) and
[CLAUDE_REVIEW_0.27.19.md](CLAUDE_REVIEW_0.27.19.md).
The current verified local preview is 0.27.19; production remains 0.26.0.
The older session text below is preserved as history. Its integration instructions
are superseded by the core-workflow roadmap and the new paused handoff.

# Current priority - October 7, 2026

The current direction is to pause feature expansion and improve the core
experience: simplify controls and visible data, measure and improve performance,
investigate reported dual-morph scaling, and verify common workflows. Follow
[the roadmap](OPEN_SOURCE_ROADMAP.md) and [interface contribution guidance](../CONTRIBUTING.md).
The feature-expansion instructions below are historical and are superseded by
this direction. Existing staged features remain deferred.

## Current 0.27 implementation

Working sources are now 0.27.0. The first core-experience pass adds a task-based
Inspector, collapsed numerical reports, warm workers for frequent calculations,
and a source-size default for new dual morphs. See [0.27 development notes](RELEASE_0.27_DEVELOPMENT.md).
The reviewed local portable is `release/preview-0.27.0-reviewed/Polytope Laboratory 0.27.0 preview.exe`.
GitHub's public executable remains 0.26.0; public documentation was updated at
`0a6d371f17c9b3df447141e2f9c40fe5bec196dc`. Runtime changes have not been published.
The staged feature additions remain deferred. Older instructions to integrate
those stages are historical and must not drive the next task.

Next work: measure visible-window rendering, test common workflows with users,
and further simplify task organization. The hidden playback test has a slow
scheduling cadence; its engine timings do not imply a measured rendering FPS.

## Previous development checkpoint - October 7, 2026

Read [NEXT_SESSION.md](NEXT_SESSION.md) first. It is the authoritative resume
handoff for the October 7, 2026 stopping checkpoint requested by Randall.

The 0.26 Windows portable and matching GPLv3 source are published on GitHub.
Production remains 0.26.0. Star vertex-figure completion, symmetry orbit coloring
and D4 Waterman are READY/frozen in isolated stages and are not mounted or shipped.
Next session should bump to 0.27 and integrate them one at a time.

The feature-complete goal is unfinished and paused at Randall's request.
The detailed handoff records release links, hashes, evidence, pending checks,
exact mount commands, protected files and separate public/development Git ancestry.

Earlier prose is retained in
[the historical handoff](history/session-handoff-before-2026-10-07-stopping-point.md).
Its active-development instructions are superseded by this checkpoint.
