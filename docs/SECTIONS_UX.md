# Cross-section workflow

Construct → **Cross-section** (`#open-cross-section`, in `#cross-section-card`) opens the existing split view and evaluates a central slice. Ctrl+K searches for **slice**, **section**, or **cross-section** reach the same action. The card is available for 3D and 4D models. The slice walkthrough uses this entry.

The panes show **Original · model name** and **Cross-section · 3D** (4D source) or **Cross-section · 2D** (3D source). Rotating either displayed shape changes its presentation only: the slice uses intrinsic source coordinates.

Under the section pane, `#section-toolbar` provides:

- **Slice position**: `#section-offset` slider and `#section-depth` expression field. Dragging waits 90 ms after the latest input, cancels superseded derived work immediately, and evaluates only the newest position. Numeric expressions use the existing NumericEntry path through **Update section** (`#apply-section`) or Enter.
- **Slice direction** (`#slice-direction`): X/Y/Z axes in 3D and X/Y/Z/W in 4D. **Custom…** opens **Advanced slice settings** (`#advanced-slice-settings`) and focuses the existing `#section-normal` field.
- **Next vertex level** (`#section-events`): advances through source vertex projections on the normalized normal, wrapping to the first level. This can produce a tangent or degenerate intersection; it is not necessarily a full-dimensional section.
- `#slice-feedback`: pending, completed, canceled and refused updates. Completion is reported even when successive sections have identical geometry.
- **Open section as model** (`#promote`): uses the existing source-bound promotion workflow, including native history reconstruction for filled density and ordinary-cell sections.

Advanced settings contain `#derived-mode`, the normal vector, **Section mode** (`#section-density-mode`), and algorithm/interpretation notes. Existing element-index controls and other derived modes retain their IDs and handlers. The new disclosure maps to the Sections guide topic.

## Definitions and limits

For a nonzero normal n, depth d means `(n / |n|) · x = d`; it is independent of display rotations. The initial normal is the last intrinsic coordinate axis (Z or W). Its initial depth is the midpoint of the minimum and maximum source vertex projections, including translated sources. Slider bounds are those projection extrema; expressions can request a depth beyond them to inspect an empty intersection. Preset changes retain depth, clamped to the new direction's bounds.

No section mathematics or engine operations changed. Existing numerical residuals, interpretation distinctions, source-domain refusals, arrangement budgets and promotion checks remain in effect. Surface intersections of generalized sources do not imply a filled solid. The central slice can be degenerate on special sources; unsupported sources are refused by the existing path. Axis-aligned tesseract slices can remain congruent while the position changes.

View settings continue to use existing dirty/save/restore ownership. Debounced edits cannot run after cancellation, document/project replacement, changed applied section settings, or animation export. Opening a section uses the existing new-document behavior; the source document remains available.

## Verification

- `tests/section-toolbar.test.mjs`: direct entry, translated defaults, preset normals, command synonyms, debounce, cancellation and ownership fences.
- `tests/section-toolbar-mounted.test.mjs`: expert-off app with the Python engine, 4D/3D sections, pane titles, collapsed advanced settings, expressions, repeated updates, live slider, command entry and promotion. Screenshot: `artifacts/sections-ux/cross-section-4d.png`.
- Existing section choices, independent winding cells, star-cell contacts and refusal/Timeline integration tests explicitly open the new disclosure and retain their assertions. Existing numeric entry, derived publication, section rendering, exact/ordinary/density section and source-content tests cover the reused paths.
- Vite production build. Electron launch is left to the lead's desktop qualification; `scripts/section-workflow-smoke.cjs` retains all IDs and already reveals owning disclosures.
