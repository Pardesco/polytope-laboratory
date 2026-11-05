# October 25 continuation: cancel and folded content ownership

Follows [derived publication](DERIVED_PUBLICATION_2026-10-25.md). Development
remains 0.27.21; published/qualified 0.27.20 is preserved. The high-impact goal
continues with broad release qualification deferred.

## Implemented

**Global Cancel owns delayed and active derived preparation.** It cancels the
depth debounce, revokes the current derived sequence, aborts its local work
signal, clears unfinished geometry/result/net availability and gives explicit
retry guidance. Late ignored provider results cannot restore the canceled view.
Cancel visibility now includes debounce, manual plane preparation and derived
presentation, including image preparation after native jobs have finished.

DerivedViewControls exposes activity changes and a cancelEvaluation method. A
canceled manual plane immediately releases its pending UI lock and invokes the
existing numeric cancel owner. Its old finally can only finish its own pending
job, so it cannot unlock or clear a newer edit. WorkspaceNumericControls retains
the underlying numeric signal/publication fences and prompt cancellation race.
Cancel with no derived work leaves a completed derived result intact.

**Cancel only active ordinary-cell operations.** The new cancelActive method
aborts an active evaluation/promotion controller without advancing the receipt
generation. Global Cancel uses it instead of unconditionally invalidating all
completed receipts. Canceling unrelated work no longer prevents promotion of an
already completed unchanged section. Canceling promotion prevents publication
and still permits a retry using the independently rechecked receipt. The existing
cancel method retains its full supersession behavior for new evaluation owners.

**Late fold-content errors belong to their display request.** Each NetEditor
fold show retains an opaque token. Its error callback checks token, editor
sequence, source state/model, Viewer model/net and the active net/fold mode.
Obsolete failures and AbortError stay silent. A current failure still updates
the diagnostic and status. Source/model references live only in the pending
callback; the retained token contains no workspace or geometry.

The underlying content renderer continues to own descriptor/source/asset and
capture verification. This change fences error reporting; it adds no shortcut
to content or geometry publication. Native Python code and file storage are
unchanged. No new timing or FPS claim is made.

## Focused evidence

Final receipt: `artifacts/cancel-content-checks-20261025-142848/result.json`.

- **156 Node tests**, fourteen files, zero failures/skips.
- The **169-module production build**, with the existing large-chunk warning.
- Selected source/test hashes unchanged across execution.

Sixteen new cases cover depth cancellation before native work, annotation-phase
cancel with late completion, immediate manual-lock release and replacement,
completed-result retention, the actual global Cancel handler, active-only native
section promotion cancellation/retry, current/obsolete fold errors, same-net
replacement, source/Viewer/mode/display/sequence changes and canceled/successful
content. The folded-content suite is included in npm run test:features.

The app-function cases use real derived controls/work and export/memory sessions
with controlled providers; folded-content cases call actual NetEditor.show with
controlled Viewer/DOM and held promises. The ordinary section test uses actual
native-generated section/history fixtures and the production workflow. Related
suites cover native jobs, numeric edits, net presentation/export, section content,
animation capture, memories, geometry export and navigation. This proves source
ownership behavior, not visible desktop cancellation latency.

No real Electron launch, full feature run, packaged/visible or fresh-user
qualification was performed. Earlier receipts bind earlier source snapshots.

## Continue

Continue the broader goal with everyday workflow coherence and usability first.
Inspect promotion handoffs for source units/notes and data preservation, then
address reproducible remaining capture/playback or navigation blockers. Preserve
full literal source, bounds, ownership and file publication checks. Refresh final
review/source inputs and rebuild the native engine for earlier changes before
final packaged qualification; this pass does not establish Stella4D equivalence.
