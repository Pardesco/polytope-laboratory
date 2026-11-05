# October 25 continuation: net drag rollback and ownership

Follows [document context preservation](DERIVED_DOCUMENT_CONTEXT_2026-10-25.md).
Development remains 0.27.21; published/qualified 0.27.20 is preserved. The
high-impact goal continues with broad release qualification deferred.

## Implemented

NetEditor now treats the SVG translation during dragging as an uncommitted
preview. Pointer release removes it and releases capture before awaiting the
native edit. A native refusal therefore leaves the visible piece at its saved
position instead of displaying a move that never succeeded. Successful edits
continue through the existing source/expression publication checks and reversible
net history.

A gesture belongs to its pointer, SVG, document state, model, net layout and
editor sequence. Pointer movement checks those identities plus mode/action and
export availability. Release also checks current face-net print/content inputs
before invoking the native edit. A replacement layout or source, a newer
evaluation, changed display/action/scale/content, or export cannot inherit a
gesture begun on an old layout. Obsolete SVG handlers also refuse a new
gesture after their surface, source, layout or sequence is replaced. Unrelated pointers cannot replace, move, cancel
or release the active gesture.

Cancellation and lost capture both remove the provisional transform and release
capture. Workspace synchronization and net presentation cancel outstanding
gestures before replacing the preview. Animation-export notifications retain
their previous rollback behavior through the shared helper. Net export also
cancels the gesture before reviewing saved output, and its busy state prevents
new pointer gestures. No provisional DOM transform is exported or persisted.

Pointer movement performs no JSON serialization. Full annotation/color/options
checks run at gesture boundaries rather than on every motion event; existing
native edit validation and final publication fences remain intact. No new
geometry, native exporter, storage format or mathematical algorithm is introduced.

## Focused evidence

Current receipt: `artifacts/net-drag-checks-20261025-145838/result.json`.

- **258 Node tests**, twenty-one files, zero failures/skips.
- **169-module production build**, with the existing large-chunk warning.
- Selected source/test hashes match before and after execution.

Twenty-four new source-handler tests cover refused and successful native movement,
layout/source/sequence/display/mode/action/scale/content/export changes, stale
motion, independent pointers, cancellation/lost capture, export rollback,
workspace synchronization and supersession during the native await. The motion
check counts zero JSON serializations across 100 events. The suite calls actual
NetEditor.attach/edit/sync/export methods with controlled SVG/DOM/native providers;
it is included in npm run test:features. It is not a visible desktop pointer test.

Related suites cover face and cell generation/history, generalized cell nets,
net export/presentation/content/tabs/color settings, expressions, derived
publication/context, memories, project workflows and navigation. Native
Save/Open and geometry export integration in the context suite still pass.

No native implementation changed. Earlier native engine rebuild and consolidated
review obligations remain. Full feature tests, packaged/visible interaction,
fresh-user observation and release qualification remain deferred. Earlier
receipts bind earlier source snapshots.

## Continue

Continue reviewing common browse, construct/section, net, Save/Open and export
workflows for data preservation, stale publication and avoidable waiting. Before
release, include pointer cancellation, failed movement and export during a drag
in visible interaction checks. Keep the goal active.
