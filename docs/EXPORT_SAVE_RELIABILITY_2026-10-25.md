# October 25 continuation: export and Save reliability

Follows [the pose workflow pass](POSE_WORKFLOW_2026-10-25.md). Local development
remains 0.27.21; published/qualified 0.27.20 and all prior evidence are preserved.
The active user goal prioritizes high-impact core work, using focused validation
and deferring noncritical broad testing until final release preparation.

## Implemented

1. **Guard common view edits during export.** Projection, face/vertex visibility,
   fill rule, surface color/opacity and source-cell Hide/Isolate/Show all now go
   through ViewportControls. Queued/programmatic events also pass the export
   gate before mutation. Inputs are disabled during export; refused appearance
   edits restore applied values. Allowed enum/boolean/range values are checked,
   and cell indices must be literal bounded nonnegative integers. Projection
   fitting and fill-rule derived refresh remain connected. Reset uses the same
   gate. Source selection/highlight events refuse during export and restore the
   applied source selection inputs. These edits prevent interruption; existing
   exact capture/source guards remain in place.
2. **End active 4D drags safely.** The drag uses the established observation hold
   lifecycle instead of directly restoring an old `controls.enabled` boolean.
   Related Viewer control replacements retain the hold, and ending the drag
   cannot release a nested capture hold or modify unrelated controls. Export
   synchronization retires active drags; late pointer moves also check editability
   before changing angles. Pointer capture is released, and every accepted move
   records its pose/revision, including when pointer capture is lost before a
   normal pointer-up event. Manual drag also cancels pending projection fitting.
   Camera-end callbacks do not persist transient camera values while either
   animation or tour export owns the view; normal camera persistence resumes
   afterward.
3. **Fence asynchronous cell-facing results.** CellFacingControls uses
   ModelReports ownership over the complete literal model, project/document/state
   and requested/applied mode. Native preparation receives a detached full source
   and abort signal. Export, navigation and Cancel invalidate pending work;
   an ignored late reply cannot adopt a cache, change the view or clear a newer
   query's busy state. In-place source edits retaining fingerprints refuse.
   Observer-angle and notes edits remain independent. Pending selection and
   preparation feedback survive ordinary display synchronization; previously
   sync could reset the requested dropdown before the native result arrived.
4. **Allow one project Save at a time.** ProjectSaving prevents overlapping native
   dialogs/snapshots; a repeated command is refused while the first Save is in
   progress. The toolbar Save button is disabled while busy. A successful write
   clears dirty state only for the captured project/revision. Newer edits remain
   dirty and the completion says so. Replacement projects receive no old Save
   completion/clean-state update. Dialog cancellation reports cancellation,
   rather than leaving “Saving project…” displayed. Snapshot/native failures
   release the lock and remain retryable. Native validation, atomic file
   publication and backup behavior are unchanged.
5. **Lock export observation before preparation/dialogs.** Animation export now
   acquires its camera hold before native track preparation and the native save
   dialog, covering the awaits that previously preceded the hold. Canceled/failed
   dialogs release it without writing frames. Busy-state notification runs within
   cleanup ownership, and a failing control restoration cannot skip resetting
   the export flag and notifying the UI. Existing frame times, fine-pose waits,
   immutable pixel copies, WebM endpoint checks and native staging are unchanged.

## Focused verification

`artifacts/export-save-workflow-20261025-115547/result.json` records **192 passing
tests across 12 relevant suites**, zero failures/skips, and a successful
**169-module production build**. `focused.tap` and `build.log` retain raw output.
Selected runtime and suite inputs match before and after the run. Tests include
actual app handler/camera callback execution, real controller/report/observation
lifecycle logic, actual Viewer picking/facing checks, controlled delayed native
providers, and PNG/WebM export preparation/error paths.

This is focused source verification. Native dialogs, real pointer delivery,
Electron IPC/window behavior, actual GPU captures, packaged workers and portable
launching are not qualified by these tests. No new performance timing claim is
made in this pass. The previous 115- and 127-test receipts remain preserved
snapshots and do not bind the newly changed app/control/save sources.

Changed runtime: `ui/app.js`, `ui/viewport-controls.mjs`,
`ui/cell-facing-controls.mjs`, `ui/project-workflow.mjs`,
`ui/animation-controls.mjs`. Focused new coverage is in the existing
viewport/pose, cell-facing, project-workflow and animation-recovery suites.
No native geometry/importer changes, Electron launch, ACL workaround, package,
source freeze/seal, commit or online publication ran.

## Remaining work

Continue the active core-performance/reliability goal. Prior worker timing and
initialization comparisons keep their documented narrow scope. Visible
navigation, renderer/morph behavior and fresh-user observation remain unmeasured.
Prioritize reproducible remaining delays or blocked workflows over more features.

At final normal-session qualification, exercise exports while attempting all
view/cell/selection/reset controls, start export during a 4D drag and cell-facing
preparation, cancel native dialogs, verify post-export camera recovery, and Save
while editing or attempting a second Save. Reopen saved files to verify the
captured revision and retained newer dirty state. Refresh the consolidated review
diff and broad source receipts against the final runtime before packaging and
sealing. Preserve prior release/archive/receipt bytes.
