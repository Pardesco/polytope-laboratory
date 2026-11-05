# Generalized 4D constructions (W26)

Construct → Modify this model → **Incidence truncation / rectification (3D / 4D)**
(`incidence-truncation-settings`) extends the existing preview/adopt workflow to
4D. Choose Manual edge-cut fraction (`incidence-cut-preset`,
`incidence-cut-amount`) or Edge midpoint rectification, then **Preview edge cut**
(`preview-incidence-cut`) and **Adopt edge cut** (`adopt-incidence-cut`).
Adoption uses the existing operation graph, Undo/Redo, replay and saved projects.
The existing 3D regular-face and deep-cut presets retain their domain.

Each directed edge owns `(1-t)Va+tVb`, for `0<t<1/2`. At `t=1/2` each source
edge owns one midpoint. Original ordered faces become cut faces; each actual
cell/vertex link supplies a cap face. The output contains one cut cell per
source cell and one vertex-figure cell per source vertex. Links use incidence
traversal, never angular sorting, coordinate welding or a convex hull.
Metadata records source snapshots, rank owners and maximum normalized planarity
residual. Output retains generalized boundary semantics, including for convex
sources; no new filled-solid certificate is inferred.

In the derived **Vertex figure** view, **Vertex figure mode**
(`vertex-figure-mode`) chooses the established convex slicing realization or the
new combinatorial incidence link. **Link placement** (`vertex-figure-placement`)
chooses edge midpoints or one source unit along each incident edge. Source edges,
faces and cells become figure vertices, edges and ordered faces respectively.
3D sources produce ordered polygons, including pentagrams. Intrinsic charts
retain reversible origin/basis records and measured embedding residuals.
Both options persist in the source view and enter asynchronous result ownership.

Nets → **4D WHOLE-CELL NET** now admits simple or regular star planar faces in
closed orientable incidence shells, including nonspherical vertex links of
regular stars. Use **Generate / reset cell net** (`cell-net-build`), Source face
(`cell-net-face`) and **Highlight matching faces** (`cell-net-match`). Existing
cut/join, subtree reattachment, rigid placement, shrink, net Undo/Redo and saved
layout reconstruction apply. Cell and shell orientation propagate through
literal shared edges/faces. A signed boundary integral chooses cell orientation;
its scalar is uncertified. Existing simple-cell net routes remain preferred.
Star fills use the established winding-aware renderer; mathematical crossings
introduce no new source vertices. Matching selection highlights both owner copies.

## Independent checks

| Construction | V, E, F, C | Complete cell types |
|---|---|---|
| Rectified tesseract | 32, 96, 88, 24 | 8 cuboctahedra + 16 tetrahedra |
| Truncated 5-cell, t=1/3 | 20, 40, 30, 10 | 5 truncated tetrahedra + 5 tetrahedra |
| Rectified 120-cell | 1200, 3600, 3120, 720 | 120 icosidodecahedra + 600 tetrahedra |
| Rectified small stellated 120-cell | 1200, 3600, 2160, 240 | 120 dodecadodecahedra + 120 dodecahedra |

Primary published expectations: [Bowers' triangular rectates](https://polytope.net/hedrondude/rectates.htm)
gives cell types; [Klitzing's dimensional index](https://bendwavy.org/klitzing/explain/index-dimensional.htm)
gives the Rahi/Rasishi count tuples; Teo's [rectified tesseract](https://www.qfbox.info/4d/rect8cell),
[truncated 5-cell](https://www.qfbox.info/4d/trunc5cell) and
[rectified 120-cell](https://www.qfbox.info/4d/rect120cell) provide independent descriptions.
[Bowers' regulars](https://www.polytope.net/hedrondude/regulars.htm) identifies
the grand stellated 120-cell's great-dodecahedral vertex figure. Tests verify its
pentagonal face cycles and its own pentagram vertex link.
The latter agrees with [Bowers' 3D regulars](https://www.polytope.net/hedrondude/regular3.htm).
Whole-cell intersection policy follows [Stella manual §15.8](https://www.software3d.com/Manual/Net4D.php).

## Limits and verification

All coordinates/predicates are approximate float64. Constant edge fractions and
unit-distance placements need not give planar caps for arbitrary irregular
metrics. Such realizations are refused with a clear explanation; the engine
does not flatten links or substitute a slice. No universal metric realization
theorem or unrestricted generalized-polytope coverage is claimed.

Source limits: 4,000 vertices, 32,000 edges/faces, 2,048 cells, 200,000 face-corner
visits and the existing one-million cell-boundary traversal budget. Nets retain
1,024 cells, 250 faces/256 vertices per cell, 128 vertices per face, 4,000 local
face corners, 100,000 global face corners and 20,000 cell/vertex incidences.
Open, pinched, disconnected local links, nonorientable nets, nonplanarity,
unresolved signed area/orientation volume and irregular crossing/touching faces
are refused. Neither source self-intersections nor arranged-cell intersections
are certified or removed. Layout aesthetics remain the existing deterministic
forest arrangement.

`tests/test_generalized_4d_constructions.py` checks published counts and cell
signatures including winding, independent convex hull agreement, all ten regular
star cuts, cube/tesseract/great-dodecahedron/grand-stellated-120-cell figures,
rigidity and matching faces, edits, Save/Open/history/replay, colors/units/notes
and refusals. `tests/generalized-4d-controls.test.mjs` checks applied options,
source guards, native expression/commit callbacks and actual star-net Viewer
fill, shrink and matching selection. Electron was not launched in this sandbox.
