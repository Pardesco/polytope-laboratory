# Tuta vertex-figure completion (R7-VF)

This tranche closes the **named convex Tuta case** of
`con-13-scaliform-completion` (CON-13), and qualifies search ambiguity and recipe
persistence for `con-13-finite-completion`. Both broad scenarios remain restricted:
there is no universal uniform/scaliform reconstruction or no-solution theorem.
Catalog/crosswalk identities and conformance records are unchanged.

## UI

Use **Construct → Vertex-figure construction / 4D from vertex figure**
(`vertex-figure-construction-settings`, gallery card
`construct-card-vertex-figure-construction-settings`). Expert mode is unnecessary.
The supplied model must be intrinsic convex 3D, with 4–64 vertices.

To obtain the named figure, open **Truncated tetrahedral alterprism (Tuta)**
(`scaliform4-tuta`) in the Library. In **View options** set **View → Model +
derived** (`viewport-layout=split`); choose **Vertex figure**
(`derived-mode=vertex-figure`), vertex 0, then **Promote** (`promote`).

The default **Candidate domain** (`vertex-figure-domain`) is **Regular + Wythoff +
Tuta scaliform** (`regular-wythoff-and-scaliform`). Click **Find matching
constructions** (`vertex-figure-search`). Choose a **Matching candidate**
(`vertex-figure-candidate`); ambiguity always requires explicit selection. Enter
**Output edge length (source units)** (`vertex-figure-output-length`), accepting
expressions such as `sqrt(4)`, then **Construct 4D polychoron**
(`construct-from-vertex-figure`). The candidate ID is
`scaliform:scaliform4-tuta`.

Construction now adds a recipe/history step to the active document. **Undo**
restores the supplied 3D figure; **Redo** restores the 4D result. Save/open,
**History → Replay**, and **History → Parameters** reproduce the chosen candidate
and edge length. Notes/units survive; source-bound annotations follow the existing
detached-content policy because no source-figure-to-output-element mapping is
asserted. Old documents created as standalone snapshots stay readable.

`vertex-figure-construction-status` reports matches or the exhausted finite domain.
Collapsed **Search domain and numerical evidence**
(`vertex-figure-search-evidence`) lists every searched candidate ID, counts,
tolerance and match residuals. **Cancel** (`vertex-figure-cancel`) revokes pending
search/construction publication. Full source/content, expression, selection,
domain and export guards remain active; synchronization writes only changed
control attributes.

## Definition and evidence

The original domains are unchanged: six regular convex 4D types; or those six
plus 30 equal-weight A4/B4/F4/H4 Wythoff seeds with orbits of at most 128 vertices.
The new domain adds exactly **one** verified convex scaliform candidate, Tuta,
for **37 candidate definitions**. Duplicate geometric regular/Wythoff definitions
remain explicit choices. Koho and generalized/star figures are outside this
convex slicing domain. Searches reuse warm native workers; construction uses the
existing allowlisted operations and recipe dispatch.

The Tuta provider already constructs the even-sign orbit of `(a,b,c,1)/sqrt(8)`,
where `(a,b,c)` runs over permutations of `(3,1,1)`. It verifies vertex
transitivity, equal edges and element circumspheres. Completion reuses this
provider, returning **24 vertices, 60 edges, 52 faces, 16 cells**: two truncated
tetrahedra, eight triangular cupolas and six tetrahedra. It checks the resulting
complete boundary against an independently rebuilt numerical convex hull and
recomputes the scaliform evidence after scaling, binding it to the output
fingerprint. The requested edge-length residual appears in
`metadata.vertexFigureConstruction.outputMetric`.

The independent test figure uses the five neighbor rays at `(-1,-1,-3,-1)` in
unscaled Tuta coordinates:

```
(0,2,0,2), (2,0,0,2), (2,2,0,0), (0,-2,2,0), (-2,0,2,0).
```

Each has dot product 4 with `(1,1,3,1)`, so a sufficiently small normal slice is
similar to their intrinsic projection. An explicit orthonormal frame perpendicular
to that normal gives an independent 3D fixture: five vertices, eight edges, four
triangles and one quadrilateral. Its full metric/incidence matches Tuta and no
candidate in the old 36-definition domain. Tests independently enumerate the
complete expected 4D coordinate set, compare all edges, cyclic faces and cell
face-memberships, and check all 24 local figures. This is numerical evidence;
algebraic-looking coordinates are not an exact certificate.

## Limits and tests

Matching retains RMS-normalized full pairwise metric, a complete vertex
bijection, edge multiplicities and ordered face cycles, within normalized
float64 tolerance `8e-8`. Matching a count/name alone never suffices. Uniform
scale/reflection/rotation/translation and source index permutations are allowed.
Output edge length is bounded to `1e-6..1e6`. A metric frame search exceeding
100,000 nodes refuses unresolved acceptance. Failure excludes only the listed
finite candidates; larger Wythoff orbits, other scaliforms, generalized links,
alternative slice directions and arbitrary growth/face-choice searches remain
unsupported. No competitor comparison, Electron run or mathematical specialist
review is claimed.

Reproduce:

```
python -m pytest tests/test_vertex_figure_scaliform.py tests/test_vertex_figure_construction.py tests/test_scaliform4.py tests/test_history.py tests/test_recipes.py tests/test_history_migrations.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/vertex-figure-construction-controls.test.mjs tests/vertex-figure-scaliform-mounted.test.mjs tests/engine-pool.test.cjs tests/engine-op-allowlist.test.cjs tests/history-workflow.test.mjs tests/history-support.test.mjs tests/history-support-mounted.test.mjs tests/construct-gallery.test.mjs
npx.cmd vite build --configLoader native
```

The mounted test drives the actual renderer against the Python JSON-lines server
in headless Chromium, including expert-off promote/search/build, numeric input,
undo/redo, native project validation/reopen, replay/branch, unmatched and ambiguous
searches, and hidden-mode legacy ID reveal. It is registered in `test:features`.
The native recipe test also replays the saved construction in a fresh JSON-lines
Python process, independently of warmed candidate/provider caches.

Verified 2026-11-09: the listed native selection passed **91 tests plus 10
subtests**, the listed Node selection passed **113 tests**, and the production
Vite build passed (existing chunk-size/dynamic-import warnings remain). The final
fresh-worker native test selection passed **10 tests**. Electron was not launched.
