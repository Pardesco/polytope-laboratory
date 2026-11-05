# Generator option audit and W34 slice

Audited 2026-10-26 against source, not the stale ledger limits. This is a
documentation/code audit, not installed Stella conformance. The
[manual contents](https://www.software3d.com/Manual/) identifies the 3D families;
the [4D menu](https://www.software3d.com/Manual/Menu4D.php) identifies products,
antiduoprisms, step prisms and their gyrochoron duals. Several individual pages
could not be retrieved (cache misses; direct site returned HTTP 403). Their
option lists therefore remain explicitly unverified, rather than inferred from
the work brief. No access restriction was bypassed.

| Family / requirement | Stella option evidence | Existing implementation verified | W34 additions / remaining limits |
| --- | --- | --- | --- |
| Blocks, CON-01 | [Block chapter](https://www.software3d.com/Manual/Block.php), contents confirmed; detailed options unavailable | No dedicated block generator | Cuboid dimensions and integer XYZ subdivisions, tiled exterior boundary. Cubical tiles when dimension/subdivision ratios agree. Arbitrary polycube stacks remain unsupported. |
| Triangular grids, CON-01 | [Grid chapter](https://www.software3d.com/Manual/TriGrid.php), contents confirmed; detailed options unavailable | Subdivided equilateral triangle, planar mesh | Hexagonal boundary and signed rigid crease fold for either boundary. These are explicit app definitions; arbitrary crease networks and competitor folding semantics remain unverified. |
| Irregular tetrahedra, CON-01 | [Tetrahedron chapter](https://www.software3d.com/Manual/IrregTet.php), detailed options unavailable | Six lengths ordered 01,02,03,12,13,23, analytic embedding and incidence | All four triangle checks plus normalized Cayley–Menger positivity, approximate determinant/volume evidence. No exact-arithmetic certificate. |
| Irregular triangular prisms, CON-01 | [Prism chapter](https://www.software3d.com/Manual/IrregPrism.php), detailed options unavailable | Three base sides, perpendicular height, XY displacement of congruent top; units, native persistence | Audited and regression tested. Independently prescribed noncongruent top triangles or arbitrary nine-edge sizing unsupported. |
| Pyramids / prisms, CON-01 | Contents names pyramids/prisms; 4D menu explicitly offers current-polyhedron prism | Existing pyramid generator; literal polygon × interval and closed 3D shell × interval; current-source actions use operation history | No replacement kernel. Arbitrary generalized filled interiors remain unsupported. |
| Antiprisms, CON-01/02 | [Antiprism chapter](https://www.software3d.com/Manual/Antiprism.php); 4D menu explicitly names retrograde crossed antiprisms | Literal signed n/d, radius or base-edge sizing, height or side edge or equilateral default; raw half-step rotation pi*d/n; compounds | Audited, reused. Arbitrary continuous twist is not a regular antiprism option in our contract. |
| Podia / antipodia, CON-02 | [Podium manual](https://www.software3d.com/Manual/Podium.php?prod=Stella4DPro) verifies four geometric sizing combinations and polygon/vertex-figure sizing | Both radius/edge pairs and height/side-edge modes mounted; aligned podium, signed half-step antipodium; component history adapter | No rebuild. Polygon-derived vertex-figure sizing remains missing. Free twist would make podium quad walls nonplanar and is refused as unsupported. [Antipodium details](https://www.software3d.com/Manual/Antipodium.php) could not be refreshed. |
| Stephanoids, CON-02 | [Manual](https://www.software3d.com/Manual/Stephanoid.php?prod=Great): n,a,b, uniform-hull or geometric self-dual, compounds, sequence | Both named sizing modes, custom height, bow ties and constituents, Previous/Next already mounted | No missing mathematical sizing option found in retrieved text. Existing bounded lexicographic sequence is an app ordering; competitor order/keyboard shortcuts unqualified. |
| Tori, CON-02 | [Torus chapter](https://www.software3d.com/Manual/Torus.php), detailed options unavailable; prior TORUS.md records n,m and arm/ring ratio | Literal n×m periodic planar quads, radius and ratio | Signed integer arm-step twist with explicit triangular faces and seam shift. Twist is an app extension, not verified Stella syntax. Horn/spindle/self-intersection qualification unsupported. |
| Waterman, CON-02 | [Create manual](https://www.software3d.com/Manual/Create.php?prod=Great) verifies type options and sequence, but does not enumerate lattices/origins | Exact rational FCC closed-ball selection, arbitrary rational center, centered root N with r²=2N | SC/BCC exact site selection, coordinate origin presets, exact squared-radius increments and root stepping. No claim that these match Stella's type names/root sequence; exhaustive unique-hull sequence and 4D variants remain open. |
| Cupolae | Not independently specified by retrieved Create contents; local CUPOLAE.md defines contract | n=3..128, common ring edge, regular faces for n=3,4,5 or explicit height | No missing documented option established; arbitrary star cupolae unsupported. |
| Star polygons / products, LIB-07 / CON-11 | 4D menu verifies literal n or n/d factors and one/two factor syntax | Signed unreduced regular cycles, compound factors, separate radii, direct polygon products; no hull substitution | Reused unchanged. General rational polygon step-prism factors remain unsupported. |
| Step prisms / gyrochora, CON-11 | 4D menu defines step prisms by polygon and step, gyrochora as their duals; [author's construction](https://www.software3d.com/Forums/viewtopic.php?p=1676) referenced by existing module | Hull of (i,step*i mod n) in ordinary equal-radius n×n duoprism, signed and noncoprime steps | Added direct gyrochoron result and bounded Previous/Next through n,step; flat ±1 and half-turn steps skipped. Rational symbols, arbitrary multiprisms, competitor sequence order and full parameter-domain parity remain open. |

## UI and native entry points

All panels are existing collapsed disclosures in **Construct → Create a model**
(`#create-model-settings`):

* **Basic geometric constructions**, `#basic-solid-settings`: choose
  `#basic-kind=block`; `#basic-dimensions`, `#basic-block-subdivisions` accept
  three expressions. For `triangular-grid`, use `#basic-grid-shape` (triangle /
  hexagon), `#basic-subdivisions`, `#basic-edge-length`, `#basic-fold-angle`.
  `#basic-generate` creates a document. Existing tetrahedron and prism fields
  remain in the same selector.
* **Waterman (SC / FCC / BCC)**, `#waterman-settings`: `#waterman-lattice`,
  `#waterman-origin` applies explicit coordinate presets, `#waterman-increment`,
  `#waterman-previous`, `#waterman-next`. Centered root mode fixes FCC and steps
  N by one; ordinary sphere mode steps squared radius by a positive exact
  rational increment. Failed generation leaves the displayed threshold alone.
* **Torus**, `#torus-settings`: `#torus-twist`, `#generate-torus`. Zero retains
  the established quad model. Nonzero twist generates triangles.
* **Step prisms (4D)**, `#step-prism-settings`: `#step-prism-kind` chooses
  step prism or gyrochoron; `#step-prism-previous`, `#step-prism-next` navigate
  literal integer parameters. `#generate-step-prism` also accepts expressions.

Native `generate` kinds added: `block`, `waterman-lattice`, `gyrochoron`.
`triangular-grid` adds `shape` and `fold_angle`; `torus` adds `twist`.
No new IPC operation or reusable-worker exception is necessary. All controllers
use NumericEntry and the existing constructDocument/generateConstruction source,
cancellation and export fences. These generators create **source snapshots in new
documents**; they do not mutate the current model. Subsequent geometry changes
use normal operation history and replay. Saved provenance retains generator
parameters; history replays the retained source snapshot, not a newly invented
generate operation/version.

## Definitions and numeric limits

Block vertices are exterior integer-grid indices scaled by dimension/subdivision.
For subdivision counts x,y,z and S=xy+xz+yz, counts are V=2S+2, E=4S, F=2S.
Internal unit-cell faces are omitted. Dimensions are 0.0001..10000, counts
1..32, at most 4000 exterior vertices; unresolved tile aspect ratios fail.
The boundary remains generalized to retain coplanar tiling through native save;
analytic area/volume are generator metadata, not certified convex measures.
Tetrahedra retain the relative Cayley–Menger versus embedded-volume residual;
the basic-construction status shows this or the grid's relative edge residual.

Triangle grids use axial points (i+j/2, sqrt(3)*j/2) times the small edge.
Triangle: i,j>=0, i+j<=n. Hexagon: |i|,|j|,|i+j|<=n. Triangle counts are
((n+1)(n+2)/2, 3n(n+1)/2, n²); hexagon counts are
(3n(n+1)+1, 9n²+3n, 6n²). Hexagon n<=36, triangle n<=50. A fold rotates the
half below lattice row floor(n/2) (triangle) or 0 (hexagon) around that row.
Each triangle stays rigid; maximum relative edge residual is retained. Angles
are -170..170 degrees; a folded triangle needs n>=2. Open shells imply no volume.

Waterman uses integer triples: SC all, FCC even coordinate sum, BCC equal
coordinate parity. Nearest-neighbor lengths in these source units are 1,
sqrt(2), sqrt(3), respectively; BCC has conventional cube side 2. No automatic
rescaling is applied. Existing exact rational membership bounds, site budgets
and approximate hull/measure checks are preserved. Only ball membership is
certified; hull predicates and all geometric output remain approximate.

Torus twist t is an integer -128..128: u=2πi/n,
v=2π(j+t*i/n)/m; coordinates are the existing ring-torus formula with this v.
The seam identifies (n,j) with (0,j+t). Each tile splits along its (0,0)–(1,1)
diagonal: V=nm, E=3nm, F=2nm. Require 4|t|<nm and nm<=4000, and retain
existing radius/clearance checks. Consistent directed edge incidences and
triangle rank are checked. Embeddedness/self-intersections are not certified;
no filled torus volume is asserted. Per-tile colors follow both triangles.

Gyrochora are origin-centered polar duals of the supported step prism, using
reciprocation sphere radius equal to the polygon factor radius. Sequence order
is increasing n, then absolute step 2..n-2, preserving sign and excluding n/2.
Equivalent isometric shapes can recur; n is bounded to 5..128. Native full-rank
checks remain authoritative for direct generation. Exact coordinates, all-cell
congruence certification and installed competitor correspondence remain open.

## Verification

`tests/test_generator_options.py` checks independent counts, face orientations,
complete small-lattice selection, fold edge residuals, torus seam coordinates,
polar support contacts, refusal domains, deterministic fingerprints and actual
save/load plus source/transform history replay for every added family.
`tests/generator-options.test.mjs` exercises mounted controller wiring, numeric
vectors, exact-radius stepping, sequence reversibility/endpoints, cancellation,
changed-option fences and actual Python dispatch. Existing family, construction,
history and renderer tests are also run. Vite is built with `npx.cmd vite build
--configLoader native`. Electron is deliberately not launched in this sandbox.

Recorded verification: 1,028 native tests plus 12 subtests; 132 Node tests;
production Vite build passed (existing large-chunk advisory remains).
