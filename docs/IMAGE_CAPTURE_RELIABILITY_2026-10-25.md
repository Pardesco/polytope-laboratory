# October 25 continuation: owned capture and atomic PNG saves

Follows [reviewed net printing](NET_PRINT_OWNERSHIP_2026-10-25.md). Development
remains 0.27.21; published/qualified 0.27.20 is preserved. The high-impact goal
continues with broad release qualification deferred.

## Implemented

Main screenshot capture now uses ImageCaptureSession. It refuses duplicate
commands and active animation/tour export, pauses viewport/animation/tour/morph
playback, settles and holds observation controls, then captures the current
document/model/notes/units/view and actual camera/canvas dimensions before any
asynchronous preparation. Morph and Viewer/content preparation receive its
cancellation signal and current-source predicate.

The prepared PNG belongs to that source/view through destination selection.
The renderer rechecks ownership after preparation and the native chooser before
submitting bytes for publication. Source, notes, pose, actual camera, workspace or
export changes cannot silently substitute another screenshot. Dirty/revision
hooks, workspace rendering and export transitions synchronize capture ownership.
Global Cancel includes screenshot work even without a native geometry job.

Cancellation races ignored preparation providers so the renderer releases its
busy state promptly. The native chooser is owned by a client-known bounded ID:
abort reaches its ticket while the dialog is still pending. A late chooser result
cannot create a writable ticket. Observation settings are restored through the
existing holder, including Viewer-owned control replacements and controls that
were already disabled. The shared holder behavior remains covered by its suite.

PNG output uses a dedicated one-session profile of the atomic export writer.
The complete PNG bytes go to a private sibling temporary, are fsynced and closed,
then replace the selected destination through rename. Failed write/sync/rename
and cancellation before publication preserve the prior file and clean up the
temporary. Duplicate captures/legacy image saves cannot open overlapping image
choosers. Publication already completed by rename cannot be retracted.

The old saveImage bridge also uses this profile, so multiple-view and projective
PNG callers gain atomic writes. Their existing capture/ownership behavior is
otherwise retained; this pass does not add the main screenshot's reviewed chooser
handshake to those specialist controls.

The existing 32 MiB data-URL bound is retained, with a 24 MiB decoded binary profile.
PNG input needs canonical base64 and a positive-size PNG/IHDR header. This is not
a complete PNG decoder/CRC audit. Ordinary supporting and geometry export profiles
still exclude PNG. The shared writer additionally accepts optional bounded request
IDs and copies PNG bytes through its existing binary/atomic path; defaults and
other format domains remain unchanged. Legacy image saves decode before opening
the chooser. No native Python or geometry algorithm changes.

## Focused evidence

Receipt: `artifacts/image-capture-checks-20261025-152038/result.json`.

- **467 Node tests**, thirty-five files, zero failures/skips.
- **171-module production build**, with the existing large-chunk warning.
- Syntax checks for main, preload, image profile and shared export writer.
- Selected source/test hashes match before and after execution.

Twenty-four new tests execute ImageCaptureSession, actual app capture context,
preload IPC callbacks, main handlers and the real atomic writer/filesystem.
They cover exact PNG bytes, source/notes/pose/camera/project/export changes in a
held chooser, prompt decoder/chooser cancellation, late completion across retry,
duplicate commands, disabled observation restoration, legacy saves, partial-write,
sync and rename failures, cancellation during a held file sync, temporary cleanup,
format/PNG/request-ID validation and ticket collision/disposal. Temporary test
directories are verified under their intended OS temporary prefix before removal.

Related suites cover text and geometry atomic exports, specialist views,
Viewer/content capture, observation holding, source/view publication, document
fields, net printing/dragging, recovery, navigation, morphs and tours. Existing
global Cancel tests additionally check screenshot cancellation. Scoped app test
fixtures now declare the screenshot owner where those actual functions use it.
The new suites are in npm run test:features.

No Electron app, native file chooser or visible capture was launched. Tests use
controlled windows/renderers and real temporary filesystem operations, not actual
desktop pixels. Full feature, native-dialog, packaged and fresh-user qualification
remain deferred. Refresh consolidated review and source/package proofs for changed
main/preload/shared-writer/new modules before packaging; desktop/** already covers
the new desktop module. Earlier native rebuild obligations remain. Earlier
receipts bind earlier source snapshots.

## Continue

Continue coherent core workflows. Specialist multiple-view/projective PNG controls
still use their existing saveImage callback; consider forwarding their own source
and dialog ownership through the reviewed destination handshake so a late change
is rejected before publication rather than after save. Other legacy direct file
bridges also merit review. Keep the goal active.
