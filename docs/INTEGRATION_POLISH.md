# Round 3 integration polish

The inspector is 340px wide, with single-line Analysis / Construct / Nets /
Advanced tabs. Library collection cards use consistent 160px heights, 80px
thumbnails, and counts directly below names. The rail remains the single vertical
scroll area; every card, including the third row, can scroll fully into view.
Search (`search`) says **Search shapes**; its existing detailed query tooltip
remains available. Selected library filters and header panel toggles use the
shared selection background. No global typography or color token changes.

At viewport widths up to 1400px, Depth uses a 48px slider; Snapshot (`image`)
and View options (`view-options-button`) retain their labels for accessibility
and command search while displaying icons with matching tooltips. The toolbar
stays on one row from 1280px to 1400px, including **Pause rotation** with both
sidebars open. Wider windows retain visible text labels. Smaller windows may
wrap. The mounted test checks the actual controls share a row, their horizontal
bounds, the compact/expanded labels, the options action, and all four full tab
labels at 1280×800 and 1600×1000.

Construct's `construct-card-incidence-truncation-settings` is **Star truncation**:
“Cut corners of star and compound shapes, keeping the ordered face connections.”
It retains the existing incidence-preserving preview/adoption workflow and IDs.
The ordinary **Truncate / Rectify** card is unchanged.

Nets' `nets-other-types` summary is **Other net types (2)** for the tesseract;
dimension/domain reasons appear inside the closed group and in its tooltip.
`cell-net-generation-settings` says **Starting cell and pieces**. Both summaries
fit beside their help buttons. Arrange no longer repeats the whole-cell hint.
Help mappings cover `analysis-overview-method` and `precision-details` (numerical methods),
`appearance-expert-settings` (Appearance), `nets-other-types` (Nets), and dynamic
`construct-unavailable-N` groups (construction, via `data-guide-topic`).

Presentation captures the toolbar and dock's current flex heights before native
fullscreen crosses responsive breakpoints. Exit restores their exact previous
inline values/priorities and style-attribute presence, alongside the existing
body/inert/focus restoration. The viewport-bounds assertion stays exact.

## Regression causes and intended expectation changes

- The library stylesheet overrode the selected-tab token with `panel2`; it and
  the header panel-toggle rule now use `selection-bg`.
- The Prism diagnostic test extracted `displayDiagnostic` without supplying its
  newly referenced `appearanceSheet`. Production already declares it at module
  scope before use and initializes it after AppChrome. The test fixture now
  supplies the controller; no production declaration was moved.
- All eight walkthrough targets were already reachable after the merge. Their
  copy now names Dual, Truncate / Rectify and Generate face net. The failing
  post-tour assertion expected a persistent tip. It now checks that interaction
  dismisses the tip and records the session preference, as required by V1's
  single, timed hint queue. Existing IDs, actions and history checks remain.
- The Nets unit expectation follows the requested shorter summary and verifies
  that the dimension reason is visible inside the disclosure.
- The mounted Guide check now accepts either a registered ID or an explicit
  `data-guide-topic`, both validated against actual Guide topic IDs. This is the
  existing Guide contract; dynamically allocated Construct IDs use the latter.
- Learn 4D's old mounted bridge serialized all work into one Python process and
  ignored cancellation. After leaving the 600-cell it remained blocked behind
  cancelled element classification and analysis; restored-tesseract work queued
  behind them. The test now uses the real desktop EnginePool, three workers,
  queued-job cancellation and process termination, with the desktop's BLAS thread
  settings. It checks actual cancellation and empty native/queued job maps.
  No timeout was increased and no lesson assertion was removed.

## Verification

`tests/integration-polish-mounted.test.mjs` is registered in `test:features`.
It checks full tab text, window bounds, single-line Nets summaries and help-button
separation, reasons inside unavailable types, every collection card's content and
scroll reachability, the search hint, and Appearance beside the resized canvas.
Screenshots at 1280×800 and 1600×1000 are in `artifacts/integration-polish/`.
Existing mounted tests retain native actions, saved-project and history checks.

Final verification:

- `npm.cmd run test:features:run`: **3,154 passed, 0 failed** (including both
  newly added tests; no skips or cancellations).
- `python -m pytest tests/test_learn_4d.py tests/test_welcome.py tests/test_nets.py tests/test_cell_nets.py -q -p no:cacheprovider`:
  **43 passed**.
- `npx.cmd vite build --configLoader native`: **passed**, exit 0; existing
  large-chunk and mixed static/dynamic viewer-import warnings remain.
- `git diff --check`: passed.

Toolbar follow-up verification: **71 passed, 0 failed** across AppChrome,
header navigation, design tokens (unit/mounted), UX integration, perspective
strength, PNG options, image capture, Presentation (unit/mounted), and the mounted
integration layout check. The production Vite build and `git diff --check` passed
again. Updated captures are `artifacts/integration-polish/info-1280.png` and
`info-1600.png` (plus the other tabs and Appearance).

Electron was not launched; native desktop click-through remains with the lead.
Collection cards and long
Appearance/inspector forms intentionally scroll vertically. Geometry arithmetic,
engine operations, validation domains, saved project/history formats and their
existing numerical limits are unchanged.

## Files

- UI: `ui/app-chrome.css`, `ui/construct-gallery.mjs`, `ui/guide-refresh.mjs`,
  `ui/index.html`, `ui/library-visual.css`, `ui/net-inspector-layout.mjs`,
  `ui/nets-flow.css`, `ui/nets-flow.mjs`, `ui/presentation-layout.mjs`,
  `ui/style.css`, `ui/walkthrough.mjs`.
- Toolbar follow-up: `ui/app-chrome.mjs`, `ui/app-chrome.css`, `ui/icons.mjs`,
  `tests/app-chrome.test.mjs`, `tests/integration-polish-mounted.test.mjs`.
- Updated tests: `tests/construct-gallery.test.mjs`, `tests/guide-mounted.test.mjs`,
  `tests/learn-4d-mounted.test.mjs`, `tests/nets-flow.test.mjs`,
  `tests/presentation.test.mjs`, `tests/prism-color-classes.test.mjs`,
  `tests/tool-vocabulary.test.mjs`, `tests/welcome-mounted.test.mjs`.
- Added: `tests/integration-polish-mounted.test.mjs` and this document.
  `package.json` registers the new mounted test.
