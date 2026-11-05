# October 25 continuation (Claude): first real launch and fresh-user fixes

Follows [image capture reliability](IMAGE_CAPTURE_RELIABILITY_2026-10-25.md).
Development remains 0.27.21; published/qualified 0.27.20 is preserved. Nothing
was committed, packaged, sealed or published.

Claude launched the development app (hidden-no-focus mode, isolated profile)
for the first time since the 0.27.21 changes and walked the six tasks in
[CORE_WORKFLOW_OBSERVATION.md](CORE_WORKFLOW_OBSERVATION.md) as a stand-in fresh
user. This is not a participant observation; that protocol remains outstanding.

## Fixed

1. **App could not open a window (blocker).** `desktop/main.cjs` registered
   `window.on('closed',()=>netPrinting.dispose())` before `window` was created,
   so startup threw and no window appeared. Moved after `createAppWindow`.
   Focused tests never boot main, and the 18 main-booting tests in
   `hidden-qualification.test.cjs` had been failing on a stale import mock
   (`./net-printing.cjs`, `./image-export.cjs`), so nothing caught it. Both mocks
   added; `net-print-session.test.mjs` now asserts the closure registration is
   after window creation.
2. **Live section depth.** The depth slider was a 200 ms debounce: during a drag
   the section never updated. `DerivedViewControls.setOffset` now evaluates at
   once and coalesces further input to the newest depth, committing it only
   when the previous evaluation finishes (no mid-flight cancellation, so no
   worker retirement, and no stale-discarded results). Measured in the app:
   0 updates during a 2.7 s drag before, 53 (tesseract) / 42 (120-cell) after.
   Cancel still stops the evaluation and the drag.
3. **Status bar noise.** Every native job, including background ones, took the
   status at start and posted "X completed in 0.01 s", overwriting "Opened",
   "Saved" and recovery notices. `createStatus().defer()` now shows progress
   only if a job is still running after 400 ms; quick jobs stay silent and slow
   jobs still report progress and completion. Stale-load diagnoses still report.
4. **Tabs could not be closed; library clicks always added tabs.** After 100
   library clicks nothing more could open. Tabs now have a close button
   (and middle-click), with an Undo toast; closing is refused during export.
   History publication already refuses closed documents. Clicking a library
   model that is already open and unmodified switches to that tab.
5. **Selection readout.** Picking showed only raw JSON with no measurement.
   A visible summary now reads e.g. "Edge 10 · length 2 u", "Face 0 · 5-gon ·
   perimeter 5 u · area 1.7204774 u²" (area only for convex interpretations),
   "Cell 1 · 6 faces · 8 vertices", vertex coordinates. Full JSON stays in
   Selection details.
6. **Dual morph Play.** Play was disabled until Apply; it now prepares the morph
   from the current inputs and plays. Ratio field shows 6 decimals instead of
   float noise. Net status pluralizes "piece(s)".
7. **Keyboard focus lost after numeric commits (real user bug).** Typing in an
   animation field and pressing Tab (or clicking another field) fired `change`,
   which disabled the whole panel while the expression was checked; the field
   focus was moving to was disabled, so focus fell to `body` and the next
   keystrokes vanished or landed in the old field ("0.25" became "0.258").
   Tour and workspace numeric panels share the pattern. `app.js` now records
   the focus target on `focusout` and restores it when that field re-enables,
   unless the user focused elsewhere (10 s window). Verified with real
   keyboard input in the app.
8. **Unchanged tour duration marked the project dirty**, so a Save could report
   "newer changes remain unsaved". `TourControls.setDuration` skips unchanged
   values.

## Checked and fine

Cube dual + Undo, tesseract section, morph Apply (25 ms end to end), Save/Open
(note and morph pose survive), cube net (overlap check, tabs, mm sizing).

## Verification

- `npm run test:features`: 2,352/2,352 on the final source (was 2,331 pass,
  19 fail on stale mocks). Final dist rebuilt; `test:hidden`, `test:core` and
  `test:sections` pass on it.
- Native `pytest tests`: 4,524 passed, 1 skipped, 96 subtests (no native code
  changed this session).
- Electron smokes, hidden mode, on the rebuilt dist: core, sections,
  morph-workflow, library, nets, export-workflow, reports-startup and the
  hidden canary pass; picking passed on the prior build.
- Older smokes fail on stale steps, not product bugs: desktop, inspection,
  tours, memories and units click controls that `inspector-layout.mjs` (10-22)
  moved into closed `<details>`; workspace uses `'#surface-settings summary'`,
  which now matches nested disclosures (use `> summary`); units line 23 expects
  an engine refusal that the 10-22 export guard now prevents; animation line 87
  races a 200-frame export in hidden mode. With groups opened, desktop passes
  (68 checks), inspection, workspace pass. catalog and empty-workspace need a
  visible window (application menu) and were not run.
- `scripts/animation-smoke.cjs:54` no longer waits for "Evaluate section
  completed" status (quick jobs are silent now).

Files changed this session: `desktop/main.cjs`, `ui/app.js`, `ui/status.mjs`,
`ui/native-jobs.mjs`, `ui/derived-view-controls.mjs`, `ui/dual-morph-controls.mjs`,
`ui/tour-controls.mjs`, `ui/net-editor.js`, `ui/cell-net-editor.js`, `ui/style.css`,
`tests/derived-view-controls.test.mjs`, `tests/derived-publication.test.mjs`,
`tests/status.test.mjs`, `tests/net-print-session.test.mjs`,
`tests/hidden-qualification.test.cjs`, `scripts/animation-smoke.cjs`, docs.
Since `desktop/main.cjs` changed, packaging needs a fresh build and the full
qualification sequence in `HANDOFF_0.27.21.md`.

## Suggestions not implemented (need Randall's call)

- Startup tesseract in 4D orthographic reads as a flat box; a default 4D
  perspective/slow 4D rotation would be a stronger first impression.
- Picked edges/faces highlight only their vertices (small dots); a line/face
  highlight would help, but touches every display path (explosion, packed,
  morph, stereographic).
- Model-only layout still evaluates the hidden derived section on every model
  change (cheap once the worker is warm; left alone to avoid touching
  derived-export/promotion availability).
- The view toolbar wraps to a second row at 1500 px with the inspector open.
