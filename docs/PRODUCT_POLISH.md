# Product polish (W21)

Construct now groups the existing controls under **Modify**, **Fit & refine**
(`fit-refine-controls`), **Facet & stellate** (`facet-stellate-controls`), and
**Create**. All existing control IDs and history handlers remain. Construct polar
dual (`make-dual`), Add Dual (`add-dual`), Truncate / rectify (`truncate`), and
Make faces regular (`make-faces-regular`) remain outside collapsed disclosures.
Stellation plane regions (`stellation-plane-settings`) starts collapsed.

Export → Printable model (`export-kind`) labels STL as binary or ASCII printable
mesh and OBJ as grouped printable mesh. ASCII STL (`printable-ascii`) is visible
above Mesh quality. Switching back restores the original intrinsic format labels.
Export preview and element classification defer progress for 400 ms; native jobs
already use the shared deferred status path. Export success and construction
receipts are brief; loss/quality evidence remains in the review panels.

Conway results use a familiar name only for a unique bounded numerical match in
the native nonchiral Platonic/Archimedean catalog. Checks include V/E/F counts,
face-size multiplicities, regular polygon metrics, equal edges, incident face-size
signatures and normalized vertex-distance profiles (tolerance 1e-6, at most 120
vertices). This is display-name recognition, not a symmetry/isomorphism or exact
certificate. Nonuniform or ambiguous cases retain notation and source, such as
`t(Cube)`; `tI` is `Truncated icosahedron`. Existing subdivision and Add Dual names
already retain the source. Surgery names now describe the piece, target and action.

Element type buttons include literal whitespace separators as well as visual
spacing. Construction, fitting and dual controls explain disabled states through
tooltips, assistive descriptions and command-palette reasons. Faceting SVG picks
have names, tooltips and Tab/Enter/Space support. Interactive stellation SVGs expose
their button descendants and unavailable regions to assistive tools. Existing
numeric expression evaluation and literal source-ID rules remain.

Guide topics contain **Offline feature notes** links. Their Markdown source is
bundled as local text, so notes are readable without network access or external
navigation. F1 on Element types, Conway, surgery and printable settings selects
the corresponding topic. Historical notes may describe the previous UI grouping;
the topic introduction and this note give the current locations.

Validation:

- `python -m pytest tests/test_product_polish.py tests/test_w12_constructions.py tests/test_face_surgery.py tests/test_edge_subdivision.py tests/test_printable_export.py -q -p no:cacheprovider`: 129 passed.
- Focused construction/export/discovery/faceting Node run: 178 passed.
- Final Guide/stellation/product tests: 29 passed. Pose/content tests: 44 passed.
- `npm.cmd run test:features`: 2,577 passed, 0 failed; rerun after correcting the pose test's
  extraction of the newly merged `syncDerivedSelection` helper. Its real code is
  included; original pose/content assertions remain.
- `npx.cmd vite build --configLoader native`: successful, existing large-chunk warning.
- `node scripts/product-polish-browser-smoke.mjs`: mounted headless Chromium with
  the real Python engine; grouping, primary actions, accessible names, offline
  notes, binary/ASCII/OBJ labels, intrinsic restoration, Conway names, type spacing
  and faceting keyboard activation pass.

Electron launch and native dialog/screen-reader qualification remain with the
desktop lead. The app/engine dispatch and construction history protocols did not
need changes.

Files added:

- `engine/construction_names.py`
- `ui/availability-copy.mjs`, `ui/construct-groups.mjs`, `ui/diagram-accessibility.mjs`,
  `ui/export-format-labels.mjs`, `ui/guide-documents.mjs`, `ui/guide-reference-index.mjs`
- `tests/test_product_polish.py`, `tests/product-polish.test.mjs`,
  `scripts/product-polish-browser-smoke.mjs`, `docs/PRODUCT_POLISH.md`

Files updated:

- `engine/conway.py`, `engine/face_surgery.py`
- `ui/add-dual-controls.mjs`, `ui/automatic-faceting-controls.mjs`,
  `ui/element-type-controls.mjs`, `ui/export-controls.mjs`, `ui/face-conway-controls.mjs`,
  `ui/face-surgery-controls.mjs`, `ui/faceting-diagram-controls.mjs`,
  `ui/fitting-controls.mjs`, `ui/inspector-layout.mjs`, `ui/printable-export.mjs`,
  `ui/stellation-cell-controls.mjs`, `ui/stellation-diagram-controls.mjs`,
  `ui/style.css`, `ui/user-guide.mjs`
- `tests/add-dual-controls.test.mjs`, `tests/faceting-diagram-controls.test.mjs`,
  `tests/pose-element-content.test.mjs`, `package.json`
