# October 25 continuation: reviewed direct net printing

Follows [document-field edits](DOCUMENT_FIELD_EDITS_2026-10-25.md). Development
remains 0.27.21; published/qualified 0.27.20 is preserved. The high-impact goal
continues with broad release qualification deferred.

## Implemented

The File/toolbar Print action now uses the same current face-net, source and
print-settings ownership checks as net file export. It refuses stale/missing
layouts, missing packed previews and animation/tour export before creating a
print window. Uncommitted SVG dragging is canceled first. The editable layout or
all packed pages are selected according to the applied display mode.

Printing has a two-phase renderer/preload/main protocol. A renderer-generated
bounded ID owns private print-page preparation. After preparation completes,
the renderer rechecks the source, layout, physical reference length, tab/content
and print options, then explicitly commits that ID to open the native printer
dialog. Source or workspace changes during preparation abort the private document
without opening the printer dialog.

The main-process net-printing manager permits one prepared/active print at a
time. Duplicate begin/commit requests cannot produce a second window/dialog.
It tracks the private window as soon as creation succeeds and destroys it on
cancel, preparation/printing failure, completion, main-window closure or abandoned
preparation expiry (five minutes). Existing legacy direct-print bridge methods
also share this manager for duplicate/resource ownership; the actual app action
uses the reviewed two-phase protocol.

Single-page print preparation now destroys its window if loadURL fails; packed
preparation retains that cleanup and also handles cancellation during loading.
Existing SVG bounds, CSP, disabled JavaScript, physical CSS page dimensions and
100% print scale are preserved. Native printer cancellation resolves quietly;
other printer errors remain visible. PDF preparation/export behavior is retained.

Global Cancel now includes pending net output. Net-export activity updates Cancel
availability even with no native geometry job. Cancellation rejects promptly
while a provider is still loading, closes the private window and prevents a late
preparation from printing or interfering with a retry. Once committed, the native
dialog prints the reviewed captured document; later workspace edits do not rewrite
that document. Cancellation cannot retract a job already accepted by a printer.

## Focused evidence

Receipt: `artifacts/net-print-checks-20261025-151015/result.json`.

- **379 Node tests**, twenty-six files, zero failures/skips.
- **13 native tests** covering net printing, color printing and tabs.
- **170-module production build**, with the existing large-chunk warning.
- Syntax checks for main, preload and the new printing manager.
- Selected source/test hashes match before and after execution.

Twenty-one new tests execute actual app print functions, NetExportSession,
preload IPC callbacks, main handlers/page preparation and the new manager, using
controlled windows and printer callbacks. They cover single/packed physical page
CSS, held preparation with source/layout/scale/notes/content/paper/project/export
changes, prompt cancellation and late completion across retry, duplicate begin
and commit, invalid/stale inputs, both page-load failure paths, printer errors,
quiet cancellation, main-window closure, expiry and global Cancel availability.
The existing global Cancel regression now also checks net-output/drag cancellation.
The new suite is included in npm run test:features.

Related source suites cover net exports, drag ownership, generation/history,
content/presentation, bounded export, notes/observer edits, source publication,
project workflows, memories, navigation, tours and qualification preflight. The
qualification preflight does not launch an app.

No actual Electron window or OS printer dialog was opened and no paper was
printed. Real dialog/cancellation behavior, physical hardware calibration and
packaged interaction remain release-preparation obligations. There is no new
visible latency/FPS claim. No Python/native implementation changed; earlier native
rebuild obligations remain. Refresh the consolidated review and source/package
proofs for the main/preload/new-manager changes before packaging; desktop/**
already includes the new module. Full feature and fresh-user qualification remain
deferred. Earlier receipts bind earlier source snapshots.

## Continue

Continue common workflow responsiveness and data-preservation work. Image capture
and legacy direct file-writing bridges remain candidates for the same review of
source ownership and atomic publication. Keep the goal active.
