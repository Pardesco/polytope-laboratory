# Near-miss Johnson solids (W22 / LIB-02)

The offline Library family **Near-miss Johnson solids** contains ten independently
constructed, fitted convex polyhedra. Every name ends in **(near miss)**. Search
`near miss` or `nearmiss:true`; Library → **Geometry properties** → **Near-miss
Johnson solid** (`library-nearmiss`) is the explicit flag filter. The family
selector is `library-family`. Ordinary sources with no flag remain unknown.

Open an entry normally. Analysis shows **Approximate near miss: edges within …**
(`near-miss-catalog`), including face types, numerical symmetry order, maximum edge
and face-angle errors, and planarity. **Near-miss construction and references**
(`near-miss-catalog-evidence`) is collapsed initially. It explains the construction,
local fitting contract, and available published comparisons. Reports are bound to
the loaded geometry fingerprint; geometry-changing operations hide historical
catalog residuals. The existing live deviation report remains available on sources
within its 64-vertex bound.

| Construction | V/E/F | Faces | Full symmetry order | Max edge error % | Max angle error ° |
| --- | --- | --- | --- | --- | --- |
| Chamfered cube | 32/48/18 | 6 squares, 12 hexagons | Oh 48 | 2.39893 | 10.52878 |
| Chamfered dodecahedron | 80/120/42 | 12 pentagons, 30 hexagons | Ih 120 | 0.79971 | 3.43495 |
| Rectified truncated icosahedron | 90/180/92 | 60 triangles, 12 pentagons, 20 hexagons | Ih 120 | 1.45500 | 3.15294 |
| Truncated truncated icosahedron | 180/270/92 | 60 triangles, 12 decagons, 20 dodecagons | Ih 120 | 2.12998 | 2.06297 |
| Expanded truncated icosahedron | 180/360/182 | 60 triangles, 90 squares, 12 pentagons, 20 hexagons | Ih 120 | 1.98618 | 1.54908 |
| Truncated triakis tetrahedron | 28/42/16 | 12 pentagons, 4 hexagons | Td 24 | 3.08504 | 5.17996 |
| Associahedron K5 | 14/21/9 | 3 squares, 6 pentagons | D3h 12 | 7.92311 | 8.71489 |
| Square-pentagon wedge | 9/17/10 | 7 triangles, 2 squares, 1 pentagon | Cs 2 | 2.49980 | 2.64222 |
| Top-augmented wedge | 10/21/13 | 11 triangles, 1 square, 1 pentagon | Cs 2 | 2.42666 | 2.59991 |
| Side-augmented wedge | 10/21/13 | 11 triangles, 1 square, 1 pentagon | Cs 2 | 2.46695 | 2.64016 |

Polygon names in this table describe incidence, not exact regularity. In particular,
the chamfered cube and associahedron have visibly larger angle errors; no universal
near-miss cutoff is asserted. All planarity residuals are below 1e-8 mean edges.
Regression ranges are the tabulated maxima ±0.0002 percentage points / degrees;
these ranges are implementation checks, not published deviation claims.

## Construction and measurement

`engine/near_miss_construction.py` constructs topology from analytic native seeds:
selective radial plane truncations of Catalan polar duals, rectifications and
truncation of the uniform truncated icosahedron, and a regular square/pentagon
wedge belt. The square and pentagon are hinged to a joining square; two hinge
angles minimize edge errors. Top/side variants add a regular square pyramid to
the base/joining square respectively. No downloaded mesh coordinates are used.
The expanded form uses `aa` topology, consistent with the app's Conway definition.
Vertex configurations retain cyclic face order, including 3.5.3.6 and 3.4.5.4.

Fitting reuses `condition_fitting.condition_arrays` and its complete-source-symmetry
projector. Mean edge length is fixed to 1. The objective is the sum of squared
equal-edge and regular-face residuals (local sides, angles/π, regular chord ratios,
planarity). A bounded least-squares initializer is followed by SLSQP in the
symmetry-invariant coordinate space, with independent planarity equations and
supporting-plane inequalities. Nonincident vertices must clear every face plane
by at least 0.0001 mean edges. Qualification checks every original face and the
convex supporting boundary; fitting never repairs topology with a hull. Both
optimizer phases are bounded at 400 evaluations/iterations respectively. These
are local fits, without a global minimum or exactness certificate.

Global edge error is `100 max |length / mean(length) - 1|`. Face edge error uses
the mean of each face. Angle error is the largest absolute departure from the
regular n-gon interior angle, in degrees. Planarity uses the largest coordinate
component of best-fit-plane residuals divided by global mean edge length. An
aggregate angle error is also retained for reference comparison. These definitions
match the existing Analysis fitter report and are scale invariant.

Run `python scripts/build-near-miss-catalog.py` to regenerate. The script verifies
the complete fitted symmetry order and saves original fitted JSON assets, SHA-256
hashes, backend versions, face/vertex configurations, fitting evidence and metrics
under `engine/catalog_data/near_miss/`. Normal `catalog` and `generate` requests use
`engine/catalog.py`; load checks hashes, incidence, supporting geometry and
recomputes residuals. Runtime loading never runs an optimizer or accesses the
network. Assets are deterministic for normal loading; numerical regeneration may
differ with NumPy/SciPy versions. The ordinary interactive fitter limits are unchanged.

Catalog opening uses the app's existing source-snapshot document workflow. Source
metadata survives project save/open and Undo; subsequent supported operations use
the existing recipe/replay path. No new operation or IPC permission is needed.

## Published comparisons and limits

The named high-symmetry constructions and associahedron counts agree with the
[near-miss table](https://en.wikipedia.org/wiki/Near-miss_Johnson_solid).
The wedge and both square augmentations are explicitly described in
[Jim McNeill's Number 7](https://www.orchidpalms.com/polyhedra/acrohedra/nearmiss/jsmn.htm).
McNeill reports **aggregate** edge error E=0.194 and angle error A=34.0°, with
nontriangular faces regular. Independent hinge construction reproduces E=0.1918521
and A=33.63472° for all three forms. The absolute comparison tolerances are 0.005
and 0.5° to accommodate the different local objectives and rounded reference values.
These checked reference configurations precede the catalog fit, which allows all
faces to vary. Final catalog maxima must not be compared directly with those sums.

McNeill Number 22 lists the truncated triakis tetrahedron at E=0.316, P=3.07 and
A=52.47° while constraining hexagons to be regular. Those figures are retained as
a differently constrained reference, with no numerical agreement claim. No
comparable published maximum-deviation dataset was located for the other entries.
[McCooey's equal-edge chamfered dodecahedron](https://dmccooey.com/polyhedra/ChamferedDodecahedron1.html)
provides an additional independent count/symmetry check; that equal-edge objective
differs from this catalog's combined objective.

This is a ten-entry subset, not an exhaustive near-miss list. Tetrated/medial,
snub antiprism derivatives and other ambiguous constructions are deferred. None
of these entries is classified as a Johnson solid, exactly regular-faced, uniform,
or certified. Published comparisons do not establish optimality or impossibility.

## Verification

`tests/test_near_miss_catalog.py` checks all ten V/E/F and face inventories,
independently measured edge/angle errors, planar convex hull agreement, complete
symmetry orders, deterministic normal generation, recipe regeneration, published
wedge comparisons, cyclic configurations, corrupt-asset refusals, save/open and
subsequent operation replay. `tests/near-miss-catalog.test.mjs` checks real-manifest
search, mounted property filtering, small/large Analysis readouts, stale evidence
rejection and collapsed publication comparisons. It is included in `test:features`.

Verified in this worktree: focused Python suite (this file, catalog registry and
condition fitting) **48 passed**; focused Node suite (near-miss, library navigation,
fitting report, renderer contract, discoverability, catalog discovery, uniform snub
variants and Add Dual) **49 passed**; `npx.cmd vite build --configLoader native`
passed with the existing large-chunk warning. Electron launch is left to the lead.
