# Nets workflow and default tab clearance

Round 10, November 12, 2026. No engine operations, catalog identities or existing control IDs changed.

## Click-through

Open a 3D model, open Inspector → Nets, and click **Generate face net** (`net-rebuild`). The pinned **Choose → Arrange → Print** navigation (`nets-stepper`, `nets-go-1/2/3`) retains the existing `nets-step-1/2/3` sections. Successful explicit generation returns to the flat layout, selects Arrange and scrolls to its result summary (`nets-result-summary`). Ordinary redraws, edits and history restoration do not trigger that scroll.

When intersections exist, the preview shows **N glue-tab overlaps** (`nets-overlap-status`), **Show overlaps** (`nets-show-overlaps`) and **Cuts and piece placement** (`nets-adjust-overlaps`). Show overlaps selects the editable 2D layout and highlights involved tabs and faces. The link opens the existing `net-layout-settings` disclosure, with the existing cut/join and move controls. Highlights are temporary and excluded from saved/exported SVG. A single connected piece disables **Re-arrange pieces** (`net-rearrange`); the adjacent explanation says to cut a hinge first. Rearrangement separates pieces without changing cuts or tab sides.

Print groups **Edge length** (`net-length`), paper size, orientation, page count and exports. **Preview on paper** (`net-pack`) evaluates the edge-length expression along with paper settings, retains the current hinge forest and placements, and records any changed scale in existing net history. Placement translations remain physical millimeters. Changing scale can introduce conflicts; review the resulting layout. Invalid expressions refuse before configuration changes. The caption occupies its own row below the sheet, rather than overlaying it. It states **Outline faces (no face color fill)**, **Filled face colors**, or **Filled and outline faces** from the printable SVG. A source-color batch name is distinct from face fill. The 3D viewer's display palette does not imply recorded source face colors for printing.

The unsupported `promote` action is hidden for face and cell nets. Source cards show readiness or current result status instead of the previous implementation-facing engine note. Whole-cell generation also advances to Arrange; cell intersections remain explicitly unchecked.

## Default geometry

Convex default nets retain their existing deterministic hinge forest. For each cut edge, both incident-face tab candidates are constructed. Default depth remains at most 4 mm and one fifth of the edge length. Numerical half-plane clipping trims bevel corners against neighboring convex faces, retaining the complete glue base and at least 10% of the original tab area. A cut that would leave less area is refused locally and its overlap remains visible. No tab is silently removed. The 18 audited defaults retain at least 35% of original tab area.

A deterministic 2-SAT solve selects one side per cut when a conflict-free assignment exists. Unsatisfiable cases use bounded conflict descent (eight initializations, up to twenty passes each); no global optimum is claimed. Explicit per-edge tab sides, double/none modes and physical widths remain authoritative. Custom tab preferences use side selection but retain their specified bevel geometry; they can still overlap.

`tabOwners` retains source-edge/incident-face choices through annotated page subsets. Geometry is regenerated from source faces, never accepted from cached tab point buffers. Native reopening regenerates the layout through the existing reconstruction path. Face rigidity, areas, fold endpoint residuals, Undo/Redo and existing source ownership guards remain in place.

## Catalog overlap audit

Defaults: starting face 0, E0 = 25 mm, tabs on, no custom tab preferences. Counts are interior-overlap **pairs**, with numerical tolerance E0 × 1e-8 mm. The two alternate chiral mirrors are not counted among the conventional eighteen solids.

| Solid | Previous tab pairs | Current face pairs | Current tab pairs |
| --- | ---: | ---: | ---: |
| Tetrahedron | 0 | 0 | 0 |
| Cube | 0 | 0 | 0 |
| Octahedron | 0 | 0 | 0 |
| Dodecahedron | 6 | 0 | 0 |
| Icosahedron | 0 | 0 | 0 |
| Cuboctahedron | 0 | 0 | 0 |
| Icosidodecahedron | 12 | 0 | 0 |
| Truncated tetrahedron | 0 | 0 | 0 |
| Truncated cube | 10 | 0 | 0 |
| Truncated octahedron | 9 | 0 | 0 |
| Truncated dodecahedron | 22 | 0 | 0 |
| Truncated icosahedron | 11 | 0 | 0 |
| Rhombicuboctahedron | 11 | 0 | 0 |
| Truncated cuboctahedron | 17 | 0 | 0 |
| Rhombicosidodecahedron | 23 | 0 | 0 |
| Truncated icosidodecahedron | 50 | 0 | 0 |
| Snub cube (A) | 11 | 0 | 0 |
| Snub dodecahedron (A) | 24 | 0 | 0 |

No remaining default overlap exceptions in this audit. These are float64 results, not exact certificates or guarantees for arbitrary nets, roots, widths or scales. Folding motion collisions, paper thickness, kerf, adhesive strength and hardware printer calibration are not established. Dry-fit before assembly and print at 100%.

## Verification

- `tests/test_net_default_overlaps.py`: eighteen catalog cases, one tab per cut, complete bases, retained area, independently recomputed intersections, deterministic reconstruction, fold residuals, SVG, annotated packing and tampered-cache native reopen; side assignment and unsatisfiable geometry.
- `tests/nets-ux.test.mjs`: overlap targeting, SVG appearance captions and the real renderer/native engine mounted in Chromium at 1280×800 and 1600×1000. Checks generation progression, pinned navigation, physical-scale expression application, caption separation, disabled-action explanation and overlap controls. Screenshots: `artifacts/nets-ux/`.
- Existing net, content ownership, print-session, expression-entry, derived-control and mounted inspector regressions; Vite production build. Electron was not launched.

Final results: 167 Python tests plus 22 subtests passed in the net/content suite; 14 additional visible-surface tests passed; 185 Node tests passed. Vite build, Prettier and Ruff format checks passed.

PowerShell commands:

```powershell
$netTests = @(rg --files tests -g 'test_*net*.py')
python -m pytest @netTests tests/test_element_content_workflow.py tests/test_element_content_specialists.py -q -p no:cacheprovider
$netTests = @(rg --files tests -g '*net*.test.*')
node --test --test-concurrency=2 @netTests tests/derived-view-controls.test.mjs tests/integration-polish-mounted.test.mjs tests/element-content-controls-native.test.mjs tests/expression-entry.test.mjs
npx.cmd vite build --configLoader native
```
