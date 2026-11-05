# October 25 continuation: completed derived results

Follows [portable source streaming](PORTABLE_SOURCE_STREAM_2026-10-25.md).
Development remains 0.27.21; published/qualified 0.27.20 is preserved. The active
goal prioritizes coherent everyday workflows and defers noncritical broad release
qualification.

## Reproduced problems

The app assigned derivedModel/derivedResult before awaiting complete-cell section
annotation preparation. During that wait, promotion, derived memory capture and
geometry export could see an unfinished result. On a preparation failure the
Viewer was cleared, but the globals remained available and final control sync
could reenable promotion. An older successful preparation could also overwrite
the status of a newer view after its await. Three app-function regression cases
failed before the fix for these exact situations.

## Implemented

**Stage the model/result pair until presentation completes.** The Viewer may
prepare its geometry while content waits, but action availability stays empty.
After the await, request sequence, source/view/input identity, parent ownership
and cancellation are checked again before publishing the geometry/result pair.
Failure clears the current globals as well as the Viewer. The existing source
and native complete-cell/history checks remain in their owning components.

**Scope final UI updates to the latest derived sequence.** Older completions or
failures cannot relabel a newer view, unlock its pending result or refresh its
availability. Export-owned callers receive a stale-presentation error rather than
a successful obsolete result. The net presentation await also rechecks ownership
before returning to a capture caller. Existing empty and other derived modes keep
their behavior.

**Synchronize memory and derived export availability at request boundaries.**
Beginning a derived request cancels its old reviewed derived export, disables that
source option and explains the wait. Completion refreshes the reviewed geometry
automatically; failure leaves explicit unavailable guidance. A reviewed Model
export is retained. Parent manual-plane preparation keeps its existing pending
lock, with one export refresh after that lock releases. Debounced invalidation
also revokes old availability immediately.

**Pause source-changing playback before opening geometry export.** Rotation,
animation, tour and morph playback pause before the modal review. Active animation
export is refused before any pause. If a section animation had an in-flight frame,
pausing revokes that frame's generation; the applied frozen plane is reevaluated
under ordinary ownership so Derived can become available after the old request
is discarded. The modal remains usable for Model export during preparation.

These changes make no geometry algorithm, file writer, native validation, cache
or format changes. No native rebuild was performed in this pass; earlier native
changes still require a fresh bundle before final packaged qualification.

## Focused evidence

Final receipt: `artifacts/derived-publication-checks-20261025-141502/result.json`.

- **174 Node tests including nested cases** (166 top-level), thirteen files,
  zero failures/skips.
- The **169-module production build**, with the existing large-chunk warning.
- Selected source/test hashes unchanged across execution.

The 21 new cases in tests/derived-publication.test.mjs execute actual app functions
with real DerivedViewControls, DerivedWork, MemoryControls and GeometryExportSession
and held native/content providers. They cover unfinished/failed publication,
superseded completion/failure, plane changes, cancellation/export ownership,
retry, reviewed export invalidation, independent Model export, parent pending
locks, six other derived modes, empty sections, stale net presentation, playback
pause ordering and frozen-plane reevaluation. The suite is included in
npm run test:features for final regression preparation.

Other selected suites exercise actual native ordinary-cell section/history,
section annotations, net export state/session, memories, navigation, workspace
availability, animation rendering and capture. The held providers in the new
app-function cases establish publication behavior, not new kernel correctness or
desktop timing. No real Electron launch, full feature run, packaged/visible or
fresh-user qualification was performed. The earlier 173-test receipt
derived-publication-checks-20261025-141155 predates the frozen-plane handoff fix.

## Continue

Continue the broader high-impact goal. Inspect the global Cancel path for queued
or debounced derived work and folded-net annotation completion messages for late
ownership. Prioritize everyday workflow coherence, responsiveness and usability;
this pass establishes no Stella4D conformance claim. Refresh consolidated review/
source inputs and rebuild the earlier native changes before final package checks.
