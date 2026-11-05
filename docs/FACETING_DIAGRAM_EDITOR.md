# Editable faceting diagrams

In **Construct → Modify this model → Faceting diagram (3D)**, use **New symmetric
diagram** (`faceting-editor-prepare`). This builds the bounded candidate pool and
discovers the exact symmetry of the supplied metric and ordered source incidence.
Alternatively build a pool in **Automatic facets (3D)** with a declared subgroup
or rotations, then use **Draw** (`faceting-diagram-build`).

Choose **Main vertex** (`faceting-diagram-vertex`), then **Draw polygon**
(`faceting-editor-start`). Click the labelled SVG source vertices in boundary
order and **Finish polygon** (`faceting-editor-finish`). The main vertex starts
and closes the cycle; it is not the blue projected center. Picked vertices turn
orange and their order appears below the chart. Finishing matches the explicit
ordered cycle against the native planar catalogue. Rotation and reversal denote
the same boundary; a different crossing/order remains a different facet. A
nonplanar or missing bounded-domain cycle is refused without moving vertices.

**Chosen seed facets** (`faceting-editor-facets`) lists the cycles. **Remove chosen
facet**, **Undo diagram edit**, and **Redo diagram edit** use ids
`faceting-editor-remove`, `faceting-editor-undo`, and `faceting-editor-redo`.
Undo/Redo covers completed edits and redraws their native replication. The
in-session history keeps at most 100 parameter snapshots, trimming older entries
when their serialized text exceeds 4 MiB (one bounded snapshot is always retained).
Source and catalogue are shared by those history entries rather than duplicated.

The diagram panel has its own live 3D preview (`faceting-diagram-preview`),
independent of the base and search-result viewers. Every chosen cycle replicates
under the verified subgroup, optionally excluding reflections in the collapsed
**Candidate IDs and linked search options**. Equivalent cyclic replicas are
deduplicated. Open, odd, overfull and coplanar edge incidence remains in the native
selection diagnostics; a manual preview makes no closed-manifold or solid claim.

**Make base model** (`faceting-editor-base`) commits `facet-diagram-adopt/0.1.0`
through the existing recipe/history workflow. Native adoption reconstructs the
saved source, candidate planes, ordered cycles and symmetry actions; supplied
preview geometry is never trusted. The model retains all source vertices,
coordinate units and unambiguous matching source face colors. New faces have no
inferred source color. Proven vertex/edge/face annotation correspondences transfer
through the existing content workflow; unrelated content remains detached.
Base Undo/Redo, replay and parameter branching use the ordinary history controls.

Completed polygon edits, removal, diagram Undo/Redo, and changes of main vertex
or display switches save parameters into `view.facetingDiagram` and mark the
project dirty. Saving the project retains those editable parameters. **Restore
saved diagram** (`faceting-diagram-restore`) reconstructs and restores them after
opening or changing documents. It does not silently bind an old diagram to a new
base model. Diagram Undo/Redo history and unfinished click sequences are session
state; the current completed diagram persists. Legacy literal-ID edits retain
their explicit Draw / Save diagram parameters workflow.

## Automatic search

The adjacent **Automatic facets (3D)** panel already implemented tidy-dual,
tidy, spiky, type limits, per-plane limits, partial vertex use, subgroup selection,
and exact result plane counts. They remain native filters. The independent
`faceting-spiky-filter` checkbox additionally permits spiky with tidy-dual or
isohedral criteria. Types mean orbits under the result stabilizer in the selected
source subgroup, not polygon corner counts. Spiky excludes entire segments on
the hull boundary, including facial diagonals. A tidy-dual verdict requires the
finite reciprocal to pass its own tidy and numerical realization checks.

**Bounds and source actions** contains candidate generation caps and the separate
result-plane filters. Generation caps can omit answers; result-plane constraints
filter accepted selections. **Previous result** / **Next result**
(`faceting-previous`, `faceting-next`) preview retained results without wrapping or
committing. Status explicitly distinguishes exhausted recorded domains from
limited/interrupted searches and lower-bound counts. No global enumeration claim
follows from exhausting a restricted candidate pool.

## Limits and verification

The existing domain is intrinsic/embedded 3D with 4–12 distinct vertices, 3–8
corners per cycle, at most 4,096 candidates and 128 displayed replicated facets.
Exact rational predicates concern the supplied integer/binary64 coordinates;
SVG projection and native model validation are numerical. Infinities and finite
paint omissions remain explicit. Repeated vertices are refused by this editor.
Search still uses its closed single-link domain, unlike manual ordered surfaces.

Rounded icosahedral coordinates have an exact source group of order 24 here,
not the ideal algebraic order 120. Great-icosahedron triangular cycles work on
that vertex set. Small-stellated-dodecahedron pentagrams are not exactly planar
in those supplied binary64 coordinates and are refused; algebraic coordinates
or a separately specified approximate-planarity mode remain follow-up work.
This is not a claim of full Stella4D equivalence. Older automatic-faceting docs
and the parity ledger contain stale mounting/availability statements.

`tests/test_faceting_diagram_edit.py` checks cube → tetrahedron (4 faces), full
stella octangula (8), cuboctahedron → octahemioctahedron (8 triangles + 4 hexagons),
icosahedron → great icosahedron (20 triangles), exact spiky witnesses, color/unit
ownership, tamper refusal, saved-project round trip, adoption, replay and branch.
The diagram control tests exercise ordered native picking, preview, removal,
Undo/Redo, restoration and publication fences. Search controls test combined
filters and retained-result traversal; engine-pool tests cover warm worker reuse.

Verification commands: focused pytest for all faceting, history and element
content workflow tests; Node tests for diagram editor/controls, automatic controls,
engine pool, face editing and history workflow; `npx.cmd vite build --configLoader
native`. Electron is intentionally left for the lead's desktop qualification.
