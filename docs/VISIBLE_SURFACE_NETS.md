# Visible surface paper models

In **Nets**, choose **Visible surface (paper model)** (`net-visible-surface`,
inside `net-visible-surface-settings`). This is offered for generalized 3D
sources, including stars and compounds. **Interior interpretation** is collapsed;
`net-visible-fill` chooses nonzero or even/odd winding, initially following the
source display setting. The operation creates an ordinary undoable model and
switches to the existing net view. The previous mathematical star/compound is
retained in history. `net-visible-summary` reports faces, triangulation count,
closed shells, total genus and winding residual. `net-summary` reports actual
paper pieces and face/tab overlaps and identifies outer-surface assembly.

The native `visible-surface` operation accepts `{fill_rule:'nonzero'}` or
`{fill_rule:'even-odd'}`. Each edge-connected orientable source shell defines a
signed generalized winding number (signed fan integration also handles planar
self-crossing cycles). A component is filled where its winding is nonzero or
odd, respectively. Component interiors are **unioned**. This explicitly assigns
a solid interpretation to the construction; it does not change the source's
original interpretation. Reversing a component's orientation does not change
its fill. Cavities encoded as separate nested shells are filled by this union
policy; this is not an oriented nested-shell subtraction operation.

Face planes and coplanar boundary lines form a bounded arrangement refining all
face intersections. Exterior cells separate filled and empty side samples.
Two sample distances must agree, and winding numbers must resolve to integers.
Internal subdivisions merge within each source face; coplanar source-face seams
are retained for color/provenance. Duplicate coplanar sheets choose the first
source face. Welding and edge subdivision conform the output before checking
two faces per edge, orientability and a circular link at every vertex.
No 3D hull substitutes for the exterior. Float64 results are approximate.

`metadata.visibleSurface` records source face/component IDs per output face,
surviving source vertex IDs, arrangement size, closure, Euler characteristic,
total genus, and normalized planarity/winding residuals. Source OFF RGB/RGBA
face records are copied to their pieces. The source-tip heuristic keeps each
spike's face fan together, cuts its cycle, and separates different spikes.
Groups with flat face overlaps split into individual faces. A bounded 2-SAT
choice assigns exactly one glue-tab side to every cut edge, with explicit saved
tab preferences; conflicts are verified against all faces and tabs. Width is
`max(0.1, min(2, 0.08 * E0))` mm. If no assignment exists, generation refuses
with an assembly message. Existing root/E0, cut/join, move/rotate, net Undo/Redo,
folding, SVG/PDF, source color batches, physical paper packing and reviewed
printing remain available. Native Save/Open reconstructs the layout and pages.

Verified independent reference results (nonzero union):

| Source | V / E / simple faces | Triangles | Paper pieces | Flat face/tab overlaps |
|---|---|---|---|---|
| Small stellated dodecahedron | 32 / 90 / 60 | 60 | 12 | 0 / 0 |
| Great stellated dodecahedron | 32 / 90 / 60 | 60 | 20 | 0 / 0 |
| Stella octangula / two tetrahedra | 14 / 36 / 24 | 24 | 8 | 0 / 0 |
| Five tetrahedra | 92 / 150 / 60 | 180 | 20 | 0 / 0 |

The five-tetrahedra exterior has **60 concave pentagons**, each triangulating
into three triangles. Thus 180 is a triangulation count, rather than 180 maximal
planar exterior faces. Both decompositions independently satisfy Euler 2:
`92 - 150 + 60 = 2`, or after 120 triangulation diagonals,
`92 - 270 + 180 = 2`. The fixture enumerates equilateral tetrahedra in an
independently authored analytic dodecahedral vertex set and finds a five-part
exact vertex cover. Exterior samples are cross-checked against the tetrahedra's
convex halfspaces, independently of the extractor's winding calculation.
All four listed surfaces are closed and genus zero. Also tested: great
dodecahedron (60 separate triangles) and great icosahedron (180 triangles,
72 pieces). The latter two use conservative face separation where needed.

Limits: 3 coordinates and intrinsic dimension 3; 4–100 source faces, 1,200
source boundary vertices, 30,000 arrangement cells; output must satisfy the
existing 250-face/128-vertices-per-face/4,000-boundary-vertices net limits.
Open/nonorientable source shells, nonplanar faces, unresolved thin geometry,
hole-bearing merged faces, and pinched/nonmanifold output are refused. Predicates
use normalized tolerance `2e-8`; side samples use `2e-6` and `5e-7` of source
span, with maximum integer-winding residual `2e-4`.
Side samples require `4e-6` clearance from every distinct noncoplanar plane;
small arrangement cells can therefore trigger a conservative refusal even when
the underlying surface would otherwise be constructible.
This is numerical evidence, not an exact/certified geometry kernel or a universal
decomposition guarantee.
Folding collisions and printer hardware are not qualified. Source text/PNG
annotations follow the existing detached-content policy when incidence changes;
only source face colors have a piece correspondence in this slice.

Tests: `tests/test_visible_surface.py` covers reference counts, independent
union membership, closure, colors/alpha, one-tab ownership, matching labels,
nonoverlapping nets, folding, pages, history/replay, saved reconstruction,
similarities/reversed cycles, duplicates/nesting/disjoint shells, and refusals.
`tests/visible-surface-controls.test.mjs` covers mounting, native recipe routing,
source/form/export fences, cancellation, receipts and saved automatic tab options.
Run focused pytest with `-q -p no:cacheprovider`, Node with `node --test`, and
renderer compilation with `npx.cmd vite build --configLoader native`.

Workflow reference: [Stella Build manual](https://www.software3d.com/Manual/Build.php).
The author's [five-tetrahedra paper model](https://mail.software3d.com/5Tet.php)
independently identifies this compound as a dodecahedral faceting/icosahedral
stellation and illustrates its colored paper assembly. The numerical counts
above are computed and checked here, not attributed to a published face count.
