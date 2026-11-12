# Common section choices

Select **View options → Viewports → Model + derived**, then choose **Section**
in the derived-view menu. Beside the section normal
and depth, **Section mode** (`section-density-mode`) offers three interpretations
without Expert mode. The existing derived-view selector and its handlers remain.

- **Surface / convex** uses the existing source-dependent section kernel. Convex
  sources reconstruct filled sections. Declared convex-region unions retain
  disconnected regions. Generalized sources intersect recorded face fills;
  their surface curves do not establish a solid interior.
- **Filled (density)** selects regions of a closed oriented boundary by signed
  winding. Analysis → **Filled section settings** (`density-section-settings`,
  collapsed) offers nonzero winding, even/odd winding, or signed winding ≥ k.
  Threshold expressions use NumericEntry. Multiplicity is not material density.
- **Filled (ordinary 4D cells)** slices qualified closed embedded source cells,
  including supported concave, disconnected and holed regions. Intersecting
  cell sheets remain separate; this makes no global star-interior claim. This
  choice also synchronizes `derived-mode=cell-section` and is disabled for 3D.

`section-density-interpretation` states the current meaning beside the plane.
Native failures appear there and in `derived-status`; no fallback silently
changes the interpretation. Correct the plane/source or explicitly choose Surface.
The density legend retains signed values and winding residuals. These kernels
use approximate float64 geometry, not exact or certified solids.

Evaluate a supported nonempty result, then **Promote** (`promote`) to open an
independent document. Existing native history reconstruction, literal preview
comparison, source/content/plane/settings checks and cancellation/export fences
remain. Ordinary-cell receipts additionally bind the chosen derived mode.
Undo/Redo, Save/Open and replay retain the source, construction parameters and
numeric status. Failed/stale results cannot be promoted.

Limits: closed/orientable boundary checks, embedded-cell qualification, ambiguous
contacts and fixed arrangement/resource budgets still apply. Generalized density
fill normally requires an off-vertex plane. Deep 4D stars may exceed budgets;
ordinary-cell fill and density fill express different mathematics even when both
succeed. No geometry kernel or supported domain was expanded in this package.

Tests: `tests/test_section_choices.py` covers separated 3D cubes, a literal
ordinary concave 4D source, and a shallow Grand hexacosichoron density section;
each filled result is promoted, saved/opened, undone/redone and replayed.
`tests/section-choices-mounted.test.mjs` drives the real renderer and Python
server in headless Chromium with Expert mode off, including visible refusal,
promotion, history and validated save/reopen. Existing density/ordinary-cell
workflow suites cover ownership and cancellation. Electron was not launched.
