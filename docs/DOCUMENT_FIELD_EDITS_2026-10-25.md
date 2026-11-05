# October 25 continuation: lightweight notes and observer edits

Follows [net drag ownership](NET_DRAG_OWNERSHIP_2026-10-25.md). Development
remains 0.27.21; published/qualified 0.27.20 is preserved. The high-impact goal
continues with broad release qualification deferred.

## Implemented

Notes input previously called the full markDirty path on every keystroke. That
path updates net actions and synchronizes dozens of construction panels,
including source eligibility scans, comparison choices and annotation signatures.
Notes do not change source geometry or those controls' eligibility.

The actual notes handler now saves the text through markViewDirty, sharing the
existing lightweight revision/dirty bookkeeping used by pose edits. It records
each changed revision and immediately synchronizes pending file-read ownership.
The first edit sets native dirty state and refreshes the unsaved tab indicator;
subsequent edits in an already-dirty workspace avoid repeated dirty IPC. Unchanged
input is a no-op. Clearing the notes remains an explicit saved edit.

Tour preview invalidation remains. Notes still invoke DualMorphControls.sync:
prepared morph source ownership includes notes, so an obsolete prepared source
must retire. This targeted check replaces the broader construction-panel pass.
Notes events queued during animation/tour export restore the applied text instead
of editing the locked document. Empty-workspace events are harmless.

Base and derived camera-end callbacks also use markViewDirty. They save their
separate observer fields, preserve base projection-fit cancellation and the free
orientation indicator, count each revision and invalidate stale tour previews.
They retain both export guards. Camera observation remains independent of native
construction geometry. Viewer emits this callback at gesture end; no per-frame
camera performance or FPS improvement is claimed.

Manual pose edits now reference the shared helper rather than an equivalent
inline callback. Source/model/settings/busy/export transitions keep the full
synchronization path. Native source snapshots and edit-publication checks are
unchanged; no source/signature validation shortcut is introduced.

## Focused evidence

Receipt: `artifacts/document-field-checks-20261025-150311/result.json`.

- **286 Node tests**, seventeen files, zero failures/skips.
- **169-module production build**, with the existing large-chunk warning.
- Selected source/test hashes match before and after execution.

Ten new tests execute the actual app notes/camera/dirty/serialization functions
in the same realm as production validators. Across 100 notes events they confirm
100 revisions, the latest Unicode text, one dirty IPC call and one unsaved-tab
refresh, with no full construction-panel synchronization. Model and view values
are unchanged by notes. Actual DualMorphControls.sync retires a captured source
after notes change. Real ProjectOpening rejects late adoption following either
notes or camera edits; RecoverySnapshots captures each changed revision once.
Cleared/unchanged notes, absent source and export-queued inputs are covered.

Related suites cover pose display with real Viewer/ElementContentControls,
viewport export guards, morph sessions, tours, source publication, project saving
and recovery, navigation, memories, export dialog ownership and native
Save/Open/export integration. The new suite is in npm run test:features. The
camera export regression fixture now supplies the lightweight callback it uses.

This is source-level avoided work and state/ownership evidence, not a visible
typing-latency benchmark. No native implementation changed. Earlier engine
rebuild and consolidated review obligations remain. Broad tests, packaged/visible
interaction and fresh-user release qualification remain deferred.

## Continue

Continue common workflow reliability and responsiveness work. Legacy direct
printing in app actions/main still merits review: compare its current-net and
export checks with the stronger reviewed net-export session, and inspect hidden
print-window cleanup on preparation failure. Keep the broader goal active.
