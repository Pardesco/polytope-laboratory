# Learn 4D (U18)

Six short chapters, 16 steps, and a live learning copy of the document. Enter
through **Help → Learn 4D**, search **Learn 4D** in the command palette, or use
the **Learn 4D** card under Welcome → Show me how. The public entry point is
`window.openLearn4D()`. Nothing opens automatically, including in hidden test mode.

## Click-through

- `welcome-learn-4d`: Welcome card; deduplicated if Welcome already supplies it.
- `learn-4d-panel`: right-hand learning panel; the viewport gets the remaining
  width. Existing sidebar classes and controls are retained.
- `learn-4d-chapter`: jump to any of the six chapters.
- `learn-4d-back`, `learn-4d-next`: Back / Next; the last Next becomes Finish.
- `learn-4d-action`: repeat the current action. On the final step this switches
  between the 120-cell and 600-cell.
- `learn-4d-pause`: stop motion or cancel the current sweep, leaving its current
  view available for exploration.
- `learn-4d-close`: Exit; Escape also exits. Header and navigation stay visible
  while the lesson text scrolls on shorter windows.
- `learn-4d-progress`, `learn-4d-progress-text`: overall and per-chapter progress.

The chapters show square → cube → tesseract, three projections, automatic XW
rotation and manual Shift-drag, sections of the tesseract and 24-cell, the
tesseract's eight-cube Dalí cross, and all six convex regular 4D polytopes.
Each step runs on entry and has a replay button and a Try it yourself hint.

## Native and document integration

`ui/learn-4d.mjs` owns navigation, action cancellation and the temporary workspace
adapter; `ui/learn-4d-lessons.json` contains the short captions and action data.
The module uses existing `run('generate', …)` dispatch for the square and regular
models. Projection goes through `ViewportControls.setDisplayOption`; XW motion
uses its existing selected-plane clock. Sections and whole-cell nets use
`refreshDerived`, which retains native validation, cancellation and publication
fences. No native op, IPC permission, dependency or project schema is added.

Learning opens a separate, visibly named **Learn 4D · …** document tab. Example
changes install fresh generator/catalog source states in that tab; they are not
new geometry operations on the user's source. Ordinary construction controls
retain their existing history workflow when used on the learning copy. Advancing
or replaying resets the example, including those experiments.

Exit aborts the current request and removes only the learning tab. The original
document, history, notes, selection and rotation remain intact. The prior
dirty status is restored when the rest of the project is unchanged; unrelated
edits are preserved and remain dirty. A previously running simple rotation
resumes. Other animation/tour/morph/fold playback must be paused before entry.
Switching to another document ends the lesson and honors that navigation;
replacing the project never restores stale documents into the new project.
Entry and exit refresh viewport dimensions before running the existing Fit
path. Exit restores the original document and then refits its camera to the
wider viewport; camera framing is therefore a normal persisted view edit.

Recovery autosave pauses during lessons. Save, Open, Recover and Presentation
exit the lesson first. The panel explicitly warns that experiments in this
temporary copy are discarded on exit. Progress is session-only. Entry respects
the existing 100-document bound. Background native work (including startup
analysis, element types, catalog loading and thumbnails) opens a **Preparing…**
panel, then starts the lesson when those jobs settle. This wait is bounded to
10 seconds, with an explicit retry after timeout, and Exit/Escape cancel it
without creating a learning tab. Exclusive exports, project open/save and
presentation work still refuse entry. While an animation export owns the source, Exit asks the learner to
finish or cancel it first.

The live status under Try it yourself wraps using the panel font. The 4D turn
gizmo stays within the primary viewport when the learning panel narrows it.

## Definitions and limits

- A 4D cell is a three-dimensional boundary piece. A projection is a shadow;
  a section is the intersection with a three-dimensional hyperplane.
- Straight-on perspective shows a farther cube smaller; straight-on parallel
  projection overlaps the two opposite cubes. Stereographic display uses the
  existing radial map to the 3-sphere and pole projection, with its existing
  clipping and subdivision limits. No intrinsic geometry is changed.
- Section depth uses source coordinates. The tesseract sweep uses the unit
  normal `(1,1,1,1)/2`; the 24-cell sweep uses the W normal. Each sweep evaluates
  25 sections serially, from just outside one support level to just outside the
  other, with a 160 ms pause between completed evaluations. It remains
  cancellable and does not promise a fixed playback frame rate.
- The Dalí cross is the existing default root-0 tesseract cell tree: a central
  cube, six neighbors, and an eighth cube beyond one neighbor. The native
  result reports rigidity, shared-face gap and common-hyperplane residuals and
  tolerance. This is an approximate float64 arrangement. General cell-net
  intersection checking remains unsupported.
- The 120-cell and 600-cell use an edge-only view. Their relationship is shown
  by switching real models, rather than claiming a continuous dual morph.
- Electron/native menu interaction still requires the lead's desktop check.
  This worktree was checked using mounted Chromium and the real Python server.

## Verification

New tests:

- `tests/learn-4d.test.mjs`: **25 passed**. DOM-stub panel, chapter boundaries,
  every content/action mapping, sweep serialization and cancellation, source
  ownership, document restoration, empty workspace, capacity, dirty state,
  project replacement, Welcome card and menu/renderer hooks. Follow-up checks
  cover startup waiting, timeout/retry, Exit/Escape cancellation, exclusive-work
  checks during preparation and fitting after layout changes.
- `tests/learn-4d-mounted.test.mjs`: **1 passed**. Real Vite/Three/Python renderer:
  hidden startup, palette and menu bridge entry, all chapters, real Shift-drag,
  XW playback, sections, cell net, family switching, Finish/Escape/tab exit,
  empty-workspace entry/exit, autosave isolation and saved-project equality
  apart from the intentional camera refit. It also holds real startup analysis
  pending to verify first-click preparation/cancellation, and checks camera
  aspect, projected bounds, gizmo placement and status wrapping at 1280 and
  1600 pixels. Screenshots are generated in
  `artifacts/u18-learn-4d/` at 1280×900 and 1600×1000.
- `tests/test_learn_4d.py`: **11 passed**. Native source counts, support-bounded
  sections, source immutability, Dalí-cross arrangement and native residuals.

Both new Node files are registered in `test:features`.

Electron-review follow-up: **128 focused Node tests passed**, including the
mounted renderer with held startup analysis and framing checks. Vite production
build passed (existing bundle-size and mixed-import warnings). No native engine
logic changed in this follow-up; the native results below are from the original
feature verification.

Focused native regressions (`test_learn_4d.py`, `test_cell_nets.py`,
`test_display_state.py`, `test_regular4d_validation.py`): **107 passed**.
Two broader Node batches: **194 passed / 196 unique tests**. Two existing
fixture failures remain outside this package: `app-chrome.test.mjs`'s shared
smoke reveal has no global `document`; `startup-performance.test.mjs`'s extracted
analysis prelude has no `analysisOverview` stub. Those tests/helpers and the
extracted analysis prelude are unchanged from HEAD.

`npx.cmd vite build --configLoader native` passes with the existing chunk-size
and mixed static/dynamic Viewer import warnings. `git diff --check` passes.

```powershell
node --test tests/learn-4d.test.mjs tests/learn-4d-mounted.test.mjs
python -m pytest tests/test_learn_4d.py tests/test_cell_nets.py tests/test_display_state.py tests/test_regular4d_validation.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```
