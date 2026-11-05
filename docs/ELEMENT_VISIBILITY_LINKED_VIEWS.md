# Element visibility, symmetry orientation and linked views (W13)

Analysis → **Element types** now provides per-type visibility buttons
`#element-type-eye-{vertex|edge|face|cell}-{typeId}`, **Hide selected**
(`#element-hide-selected`) and **Show all** (`#element-show-all`). Select an
individual source index or a whole type before hiding it. Compound component
buttons are inside **Component visibility** (`#element-component-eye-{index}`).
These actions work even when classification is unavailable, provided source
component maps or a current selection exist.

Masks are display preferences, stored as `view.elementVisibility` version 1
with a source geometry fingerprint and distinct hidden source IDs. They never
edit coordinates, incidence or intrinsic measurements. Hidden cells retain the
existing shared-face rule: a face remains visible while another owner is active.
Hiding faces removes edges/vertices no longer used by any displayed face;
individual edge/vertex toggles affect those primitives without deleting faces.
Show all also clears cell isolation, manual hidden cells and facing filters.
Native project validation checks the mask schema and current-source IDs.
Unrelated construction workflows may inherit an old fingerprint-bound mask;
it is inert on different geometry. Ordinary recipe constructions clear it.

Picking, selection surfaces, ordinary/perspective/stereographic buffers,
exploded instances, PNG/video rendering and printable struts/panels consume
the same masks. Printable export omits collapsed hidden edge slots and refuses
source-solid export when displayed primitives are filtered. Intrinsic geometry
export remains a source-geometry operation. Disable dual morph previews before
editing source visibility; their transient topology has independent IDs.

Analysis → **Orient to symmetry axis** (`#symmetry-orientation-settings`) is
collapsed initially. Click **List symmetry directions**
(`#symmetry-directions-list`), choose `#symmetry-direction`, then click
**Orient to symmetry axis** (`#symmetry-direction-apply`). The default is
**Greatest symmetry (automatic)**. A 450 ms proper-rotation transition preserves
source geometry. 3D changes and saves the observer camera; 4D changes and saves
the existing source-bound orientation frame and resets coordinate-plane angles.
Late native results, source navigation, export and cancellation cannot publish
an obsolete orientation. Observation controls and damping are held during motion.

`symmetry-orientation` is a read-only warm-worker op. With no parameters it
returns directions; `{choice:"greatest"}` or a returned choice ID selects one.
3D axes are unoriented lines, classified by their maximal proper rotation order
(2, 3, 4 or 5). Thus a cube's three 4-fold axes are not counted again as 2-fold.
Expected counts: cube 6/4/3 for orders 2/3/4; icosahedron 15/10/6 for 2/3/5.
4D considers the perpendicular radial direction of every vertex/edge/face/cell
orbit, ranks the full orthogonal source subgroup fixing that signed direction,
and prefers cell, vertex, face, edge on ties. Tesseract and 24-cell select
cell-first, projected source-group order 48. This includes reflections; it is
not a cyclic rotation order. The report states this domain and supplies axis
and normalized vertex-action residuals. Calculations are float64 numerical.
Limits: 256 source vertices, 8,192 entities, 20,000 candidate symmetry frames;
incomplete searches and unsupported domains refuse with an explicit message.

Split **Dual** views link polar complementary entities in both directions:
3D face ↔ vertex and edge ↔ edge; 4D cell ↔ vertex and face ↔ edge. Native dual
construction records correspondence from returned hull vertex ownership and
source facet intersections, rather than assuming IDs survive hull construction.
3D incidence dual uses its existing face/vertex correspondence. Sections link
cut source edges/faces/cells to derived vertices/edges/faces using retained
intersection references; coincident references can select several source items.
Vertex figures link their vertices to the incident source edges and highlight
the whole figure's vertex set when its generating source vertex is selected.
Pick mode is shared with the source toolbar. Multiple-view tiles share full
type selection sets (`ids`) and current visibility; grid capture binds those
filters so changed inputs cannot publish an obsolete PNG.

Limits: automatic 4D orientation maximizes the inherited source symmetry among
canonical feature directions, not every possible shadow or accidental projected
symmetry. Generalized cell-facing classification remains restricted by the
existing convex supporting-plane contract. Diagram/compound cross-document
selection linkage and 4D incidence-dual-specific correspondence remain follow-ups.
Section/figure linkage declines sources with more than one million aggregate
source/target entity pairs; polar linkage declines more than two million.
No new generalized solid-interior claims are made. Electron was not launched;
native desktop click-through and hardware/video capture remain lead verification.

Tests: `tests/test_symmetry_orientation.py` (9 cases); Node
`tests/element-visibility.test.mjs` (10), `tests/symmetry-orientation.test.mjs`
(5), `tests/linked-selection.test.mjs` (7). Coverage includes native save/load,
axis counts, greatest direction, dual polarity, real Viewer picking and printable
buffers across projections, mounted controls, smooth SO(4) orthogonality,
cancellation, app split selection and tile sharing. The three Node files are
included in `test:features`.
