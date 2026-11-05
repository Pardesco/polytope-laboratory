# Element types (W3)

Analysis → **Element types** (`#element-types`) automatically classifies source
vertices, edges, faces and 4D cells into orbits of the full incidence-preserving
Euclidean symmetry group, including reflections. Rows show element/type counts;
buttons (`#element-type-{vertex|edge|face|cell}-{zero-based-type-id}`) select every
element of a type. `#selection-summary` names that type. Vertices receive point
highlights, edges a gold line overlay, and faces/cells a gold surface overlay.
Selection follows rotation, projection, visibility and cell shrink. Existing
single-entity actions use the type's first source element as representative.
Selections survive history navigation and project save/load; constructions use
the existing source-selection clearing policy.

Appearance → **Color by** (`#surface-colors`) offers **Face type** (`face-type`)
and **Cell type** (`cell-type`). These preferences persist in saved views.
The eight-color categorical palette repeats for additional types. Color tables
are computed again on opening a source, never accepted from saved group claims.
Orthographic, perspective and packed stereographic projections share the same
source orbit IDs. Shared unshrunk 4D faces use their first visible cell owner;
isolating or shrinking cells reveals each owner's color. Net/derived geometry
retains its existing independent color policy; source orbit IDs are not inferred
for newly constructed geometry or morph frames.

`element-types` is a read-only, warm-worker operation in `engine/server.py`.
Parameters: `orientation` = `all` (default) or `proper`, `max_frames` = integer
1–20,000 (default 20,000). `types[kind]` records source `ids`, `count`, `typeId`,
`representative`, `description` and setwise `stabilizerOrder`. Other fields include
`groupOrder`, `componentCount`, `transitivity`, `sourceFingerprint`, tolerance,
closure verification and maximum vertex-action residual normalized by source
bounding-box span. Polygon descriptions give side counts, not regularity or
Schläfli symbols; cell descriptions give vertex and face-size inventories.
Different orbits can have identical descriptions. Components are connected
components of the supplied vertex/edge graph, including isolated vertices.

Classification uses the existing exhaustive Gram-frame search and generator
closure checks. It is **float64 numerical**, not an exact algebraic certificate.
Limits: 256 vertices, 8,192 total entities, 32,768 incidence references, 20,000
candidate frames (and the symmetry engine's corresponding search-node bound).
Incomplete searches and unsupported/invalid incidence return `available:false`,
an explicit status, and no type claims. Over-budget sources also have unavailable
component counts. Disconnected valid full-dimensional complexes are supported;
repeated ambiguous face/cell occurrences and rank-deficient embeddings are not.

The native cache holds four detached results keyed by the complete literal
request/source, with the existing analysis-cache byte bounds. The renderer holds
four results keyed by complete source JSON (at most 2 MiB per source key).
Navigation, literal source changes and cancellation fence late publications.
Pending/unavailable colors display neutral slate; image/animation capture refuses
unavailable type colors rather than exporting that fallback as classified output.
For multi-model tours beyond the small cache, switch to source/palette colors;
automatic per-tour orbit preparation is a follow-up. The UI currently uses the
full group; rotation-subgroup classification is exposed through the native op.

Tests: `tests/test_element_types.py` covers cube, cuboctahedron, truncated
icosahedron, rhombic dodecahedron, tesseract, 24-cell, rectified 5-cell, Johnson J1,
an asymmetric tetrahedron, disconnected components, bounded refusal, cache
ownership and native project round trips. `tests/element-types.test.mjs` exercises
real Viewer buffers and viewport controls, all three 4D projection paths,
packed palettes, selected-set restoration, cancellation and stale publication.
It is included in `npm run test:features`. Desktop click-through remains with
the lead; Electron was not launched in this worktree.
