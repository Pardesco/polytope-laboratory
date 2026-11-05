# Appearance side sheet (V6)

Open **Appearance** in the bottom dock (`surface-settings`). It reserves space at
the right of the viewport and refits the model to the remaining canvas. Canvas
interaction leaves it open. Close, Esc, or another dock drawer restores the canvas
width and refits. Single and split viewports are supported. Opening/closing is
temporarily blocked during animation export so its capture size stays stable.

The form contains Style + Reset (`presentation-style`, `style-reset`), Show
Faces/Edges/Vertices (`faces-visible`, `edges-visible`, `vertices-visible`), Color
by (`surface-colors`), Face opacity (`surface-opacity`), Vertex size
(`vertex-radius-slider`), Edge thickness (`edge-radius-slider`), and Cell shrink
(`cell-shrink`). Material and lighting stays collapsed. Enable **Show expert
tools** in the app menu, then expand **Expert appearance**
(`appearance-expert-settings`) for fill rule, point/sphere and line/cylinder
styles, expression-capable numeric radii, source-cell isolation/hiding, 4D cell
direction filters, and bump/environment settings. Every original control ID and
handler is retained, including native details ancestry for smoke reveal helpers.

Radius sliders use `r = min * (max/min)^(s/1000)`, where `s` is 0..1000. Vertex
radius spans 0.001..0.5 and edge radius 0.0001..0.5 in normalized projected 3D
display coordinates. Readouts show the stored radius. A slider edit chooses
spheres/cylinders so radius changes remain visible in older point/line views;
the Show switches are preserved. Numeric entry keeps its original expression
validation and full domain `0 < radius <= 0.5`. Smaller typed radii retain their
value/readout while the slider sits at its minimum. Cell shrink is the retained
size ratio: 1 means unshrunk; it remains a 4D display control.

These are numerical display settings, with no source-geometry operation or new
engine/IPC contract. They use existing document view persistence and dirty
bookkeeping. Project save/restore and geometry history keep their existing
behavior; opening the sheet itself is transient. Existing renderer primitive
budgets and dense-model fallbacks still apply.

Validation:

- `node --test tests/appearance-sheet.test.mjs tests/display-numeric-controls.test.mjs tests/viewport-numeric-controls.test.mjs tests/app-chrome.test.mjs tests/ux-integration.test.mjs tests/default-look.test.mjs tests/live-sliders.test.mjs tests/material-styles.test.mjs tests/entity-presentation.test.mjs tests/viewer-ux.test.mjs` — 119 passed.
- `python -m pytest tests/test_presentation.py tests/test_material_styles.py -q -p no:cacheprovider` — 17 passed.
- `npx.cmd vite build --configLoader native` — passed (existing chunk warnings).
- After building, `node scripts/appearance-sheet-browser-check.cjs` — 29
  assertions against the built renderer in Chromium and the real Python
  JSON-lines engine. Electron dialog/preload methods are stubbed. Covers layout,
  live controls, expression entry, native project validation/save/restore, Esc
  focus, sibling drawers, expert reveal, 3D/4D, and split/narrow viewports, with
  zero renderer exceptions. Captures are in `artifacts/appearance-sheet/`:
  `before-open.png`, `after-open.png`, `expert-open.png`, `narrow-open.png`,
  `split-open.png`.

Electron was not launched. The lead should verify the merged desktop layout,
especially alongside the global-token and canvas-framing packages. Screenshots
use this worktree's existing global tokens; the sheet uses its own scoped CSS
and existing theme color variables.
