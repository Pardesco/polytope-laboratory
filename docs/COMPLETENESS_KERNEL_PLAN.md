# Catalog and construction completion plan

Assessment date: October 4, 2026. Scope: `LIB-01`–`LIB-08`, `CON-01`–`CON-14`
and `FAC-01`–`FAC-04` in the untouched Stella4D build specification. This is a
plan based on source inspection, existing measured artifacts and published
primary documentation. It does not change the engine, rerun the large corpus,
modify external projects or establish requirement-wide conformance. Production
kernel changes should start after the 0.10.0 packaged engine is frozen.

## Available foundations and their actual limits

| Foundation | Verified local availability | Remaining obligation |
| --- | --- | --- |
| Original reference catalog | 45 entries in `engine/generators.py`: five Platonic, six convex regular 4D, thirteen Archimedean plus two snub mirrors, thirteen Catalan plus two mirrors, four Kepler–Poinsot | Remaining uniforms, Johnson solids, ten nonconvex regular 4D forms and specialized families need named reference coverage and independent classification. |
| Miratope local library | 257 OFF paths: 75 under `3D/uniform`, 33 under `3D/rf`, 16 under `4D/regular`, 41 convex-uniform and 31 nonconvex-uniform 4D labels; remaining paths are unsupported dimensions or the diagnosed teapot | Existing audit records 196 successful imports, including all 16 regular-labeled files. Folder names and importer success do not prove the intended identities. `3D/rf` is a regular-faced source folder, not a measured complete Johnson catalog. |
| Miratope discoveries | 1,652 OFF paths under `target/release/discoveries`; historical inventory found 744 3D and 908 4D headers | Inventory only. Distinguish new candidates, known objects, equivalent realizations, compounds and invalid results before catalog promotion. |
| User-linked Drive data | 3,064 paths, all 4D; fresh audit: 3,050 passing imports, 14 deterministic diagnoses; all source hashes verified | No established 2,191-type crosswalk or publishing license. 13 byte-identical pairs do not supply mathematical deduplication. Retain rejected entries and distinct topology. |
| Current constructions | Convex hulls, polar duals, bounded 3D incidence reciprocation, convex edge-cut truncation/rectification, finite convex Wythoff families, convex integer polygon products/extrusion, origin-centered FCC Waterman, intrinsic affine transforms | No general regular-face catalog builder, star product kernel, runcination, bonding/boolean boundary engine, fitting suite or vertex-figure-to-polychoron reconstruction. |
| Faceting | `engine/faceting.py` commits supplied planar ordered 3D cycles on original vertices | No automatic candidate generation, exhaustive search, faceting diagrams or complete repeated-vertex semantics. Stellation region enumeration is a different operation. |

Local Miratope location: `C:\Users\Randall\Documents\art-projects\miratope-rs`.
Counts were checked by read-only path inventory; geometry was not reimported.
Existing evidence: `docs/LOCAL_CORPUS.md`, `docs/REFERENCE_LIBRARY.md`,
`docs/reference-manifest.json`, `artifacts/miratope-corpus-audit.json` and
`artifacts/drive-corpus-0.9.0-audit-verification.json`. The last artifact records
66 convex and 2,984 generalized passing models, unchanged sources/engine and
complete importer coverage. This is compatibility evidence, not classification.

Current `engine/geometry.py:identity` is a representation fingerprint: vertex
order and incidence order remain significant. It must not be reused as an
ordering-independent mathematical catalog identifier. Current general geometric
symmetry is also bounded to 1,000 vertices; many linked sources exceed that.

## Reusable sources and redistribution decisions

**Antiprism is the strongest concrete source for Johnson 92 and the remaining
3D uniform families.** Its official resource documentation lists generated
Johnson, uniform and polygon-based models. `base/johnson.cc` implements named
Johnson constructions, and `base/uniform.cc` supplies explicit uniform vertex
formulas and ordered face tables. Both inspected files carry permissive
MIT-style notices. Pin the source revision, retain their notices and the
applicable dependency/resource notices, and prefer an isolated build-time
generator that emits a reviewed catalog over adding a runtime executable.
[Resources](https://www.antiprism.com/programs/resources.html),
[Johnson source](https://raw.githubusercontent.com/antiprism/antiprism/master/base/johnson.cc),
[Uniform source](https://raw.githubusercontent.com/antiprism/antiprism/master/base/uniform.cc),
[License inventory](https://raw.githubusercontent.com/antiprism/antiprism/master/COPYING).

Antiprism's gallery includes 92 Johnson examples and 80 uniform resource images;
the latter is not evidence for 80 distinct sporadic uniform types. Its source
explicitly enumerates U1–U75 alongside additional resource cases. Export the
actual resource list and classify prism/antiprism examples and mirrors
separately. Check each generated OFF against our strict format; Antiprism also
uses one/two-vertex OFF records for decorations, so strip only documented
decorations in an attributed adapter rather than changing the incidence parser.
[Named model gallery](https://www.antiprism.com/examples/150_named_models/index.html),
[OFF utility contract](https://www.antiprism.com/programs/off_util.html).

**Miratope is a permissively licensed implementation candidate and local
cross-check corpus for regular 16 and uniform 3D.** Its local root `LICENSE`
matches the MIT notice attributed to the 2021 Miratope authors. Upstream exposes
the same notice. Preserve the exact local file hashes and source changes when
vendoring; do not silently equate this modified fork with upstream. Check the
origin/notice of each catalog asset before bundling it: a code license and a
folder label alone are insufficient per-file provenance. Imported decimal
coordinates remain approximate even if the intended mathematical object has
algebraic coordinates.
[Upstream license](https://github.com/vihdzp/miratope-rs/blob/main/LICENSE).

The local `miratope-core/src/conc/faceting.rs` provides group/vertex-map faceting,
edge/inradius filters, per-hyperplane limits, compound/fissary options and saved
facets. It is a potential attributed algorithm port or isolated CLI backend,
not an already validated replacement for our kernel. The local discovery
classifier labels a result `UNIFORM_CANDIDATE` from isogonality, isotoxality and
absence of its compound-name marker. That predicate does not independently
prove regular faces/cells, full incidence admissibility or absence of hidden
components. Keep discovery labels as claims.

**Do not bundle the Drive collection on the strength of public downloadability.**
Keep it as an authorized linked corpus while publishing rights and upstream
attribution remain unresolved. The existing manifests already preserve Drive
IDs and hashes. George Hart's VRML collection explicitly permits noncommercial
use; it is not a suitable default unrestricted redistribution source. A wrapper
package's MIT license does not erase that upstream restriction. Use such sites
for independently cited counts/metric references or separately licensed assets.
[Hart's original notice](https://www.georgehart.com/virtual-polyhedra/copyright.html).

## Catalog crosswalk and classification contract

Create `data/catalog-crosswalk.json` with separate **mathematical types**,
**realizations/source records** and **benchmark entries**. A type may have several
sources; one named benchmark entry may resolve to an infinite generator family
instead of a finite asset. Suggested record fields:

```json
{
  "typeId": "stable-reviewed-id",
  "names": [], "symbols": [], "externalIndices": [],
  "dimension": 4,
  "classificationClaim": {"family": "source label", "source": "reference"},
  "classificationEvidence": {"status": "unverified", "checks": [], "limits": []},
  "realizations": [{"sourcePath": "relative path", "sourceHash": "sha256",
    "licenseId": "reviewed notice or unresolved", "numericContract": "float64-approximate"}],
  "benchmarkMappings": [{"entry": "baseline identifier", "status": "candidate",
    "evidence": [], "ambiguities": []}]
}
```

Use names, aliases, symbols, index schemes and count signatures to propose
matches. Confirm a proposed match with a full rank-colored incidence mapping
that preserves ordered face-boundary adjacency and cell-face incidences,
followed by a realization congruence/similarity witness when that equivalence
is required. Retain orientation/chirality and multiple coincident abstract
elements. Counts, vertex clouds, edge skeletons and common convex hulls are
candidate filters; none is the final equivalence test. Distinguish byte
identity, abstract incidence equivalence, geometric equivalence and declared
familial relationships. Report `matched`, `ambiguous`, `missing`, `rejected` and
`outside-baseline` independently of importer status.

Build independent classification checks, with pass/fail/unknown per predicate:

- Regular polygons: ordered step/winding, coplanarity, edge/angle/circumradius
  residuals, and repeated/coincident abstract vertex semantics.
- Uniform 3D: regular faces and verified vertex-transitive geometric actions
  preserving complete incidence. Equal edge lengths alone do not prove it.
- Regular 4D: admissible cells/links plus a verified flag-transitive subgroup
  on vertex–edge–face–cell flags. A transitive subgroup is sufficient evidence;
  computing every symmetry is not necessary. Cross-check all ten star types
  using independently sourced symbols, incidence signatures and dual pairings.
- Uniform/scaliform/fissary/coincidic: implement the documented definitions of
  the audited benchmark and record evidence separately. Do not promote
  `uniformCandidate`, equal edges or a single vertex orbit into all these labels.
- Johnson: named J index plus strict convexity, ordinary regular faces,
  equal-edge residuals and identity crosswalk. Near misses retain measured
  deviations and must not become exact Johnson entries.

For sources beyond the current symmetry limit, use verified sparse generator
actions with spatial lookup, bijectivity and every incidence checked; prove the
required orbit/flag transitivity from those actions. Never raise a limit and
replace a timeout with an implicit successful classification. Store importer,
classifier, source and dependency fingerprints separately so a new classifier
does not silently inherit an old proof.

## Implementation batches and independent fixtures

The batches are dependency order, not promised full-parity release increments.
Each ships an explicit parameter/domain contract, cancellation/resource outcome,
source mapping, native persistence and positive/negative tests.

| Batch | Requirements and concrete implementation | Independent completion fixtures |
| --- | --- | --- |
| 1. Catalog infrastructure | LIB-01/02/04/05/06/08: crosswalk/provenance schema, attributed asset-generation manifest, full-incidence equivalence witnesses, classifier results and geometry-property search | Relabeled/scaled cube matches with a mapping; two identical vertex sets with different face cycles stay distinct; different chiral forms remain tagged; unknown licenses prevent bundled promotion; changed source/classifier invalidates evidence. |
| 2. Regular and named 3D catalogs | LIB-01/02/04: independently validate all 16 regular 4D labels; generate Johnson J1–J92 with pinned Antiprism, reconcile all finite 3D uniforms/duals against Miratope and benchmark names | J1 square pyramid: V/E/F=5/8/5, edge-one height 1/sqrt(2), regular-face residuals; J3 triangular cupola: 9/15/8; J84: 8/18/12 and independently verified root/residual; J92: 18/36/20. Every catalog entry receives topology, metrics, provenance and independent expected counts, not only those four examples. Six convex 4D compare with original analytic references; ten stars need distinct incidence/flag/dual tests. |
| 3. Polygon parameters and products | LIB-07, CON-01/11: exact rational parameter parsing, ordinary/star/retrograde/compound polygon definitions, direct incidence products/prisms, regular-height option, validated blocks/grids/irregular tetrahedra/prisms | {5/2} retains five ordered step-2 vertices and winding 2; {6/2} follows an explicitly declared compound policy; prism V=2n/E=3n/F=n+2; antiprism V=2n/E=4n/F=2n+2. Triangular-prism × interval has 12 vertices. Independent Cayley–Menger impossible tetrahedron and near-degenerate cases; do not hull star products. |
| 4. Composition and boundary editing | CON-06/07/10 plus Johnson assembly: disjoint compounds with component IDs; face alignment/bonding, augmentation/excavation, model placement, coplanar blending and coincidence policies | Two separate cubes remain two components; reversed-winding attachment fails or corrects with recorded orientation; tetrahedron face-bonding yields triangular bipyramid 5/9/6; inconsistent edge scales reject. Hole/drill fixtures retain boundary genus; coplanar blending preserves the outer ordered boundary and holes. Hulls must not fill excavations. |
| 5. Hull/core/dual and Wythoff operations | CON-03/04/05: explicitly define convex core; general reciprocation domain and center controls; face-lattice runcination/expansion plus transition parameters instead of assuming every seed change is uniform | Tetrahedron rectifies to octahedron; cube rectifies to cuboctahedron; tesseract truncation has independently expected 64/128/88/24 incidence. Zero/transition parameters, outside polar center, plane-through-center and coincident reciprocal planes have defined outcomes. Compare bounded rational hull fixtures with exhaustive supports, and dual-of-dual metric/incidence recovery. |
| 6. Specialized 3D generators | CON-02, LIB-03: podium/antipodium/stephanoid/torus option contracts and sequences; broader Waterman centers/lattices; separately attributed noble, Stewart and compound catalog records | Torus closed orientable fixture has Euler characteristic 0 and checked genus 1; spherical examples have characteristic 2. Verify generator symmetries/edge lengths when claimed; preserve component/chirality data. Competing near-miss sequences have residual bounds and initialization recorded. |
| 7. Subdivision and fitting | CON-08/09/14: edge/face subdivision, geodesic/sphere projection and zonohedrification; constrained regular-face/equal-edge/equal-area fitting and spring relaxation | Independent icosahedron frequency-k triangular subdivision counts V=10k²+2/E=30k²/F=20k², before any alternate merging policy; sphere radius bounds; zero-vector zonotope rejection and cube zonotope case. Fit a deliberately perturbed tetrahedron, reject inconsistent constraints, record residuals/convergence and preserve a failed preview's source. |
| 8. Segmentotopes and vertex-figure growth | CON-12/13: convex A-atop-B hull construction with orientation controls; separately defined crossed variants; eligible vertex-figure reconstruction with explicit face-choice branches and finite closure | Equal aligned tetrahedra form a tetrahedral prism with V/E/F/C=8/16/14/6. Convex tetrahedral VF reconstructs the 5-cell, octahedral VF the 24-cell, and icosahedral VF the 600-cell under the independently specified local geometry. Ambiguous star VF choices stay distinct; nonclosing/inconsistent growth returns evidence, not a hull. |
| 9. Automatic faceting | FAC-01/02/03/04: coplanar candidate planes/cycles, symmetry orbits, incidence-constrained search, filters, repeated-vertex domain, diagrams and preview/commit parity | Small tetrahedral/cubic vertex sets have an independently brute-forced exhaustive candidate/search oracle. Pentagrams keep crossings outside source vertex identity; cycles with repeated visits follow declared semantics. Renumbered equivalent results deduplicate with witnesses; distinct topology remains. Cancellation and per-plane/type/spiky limits explicitly prevent exhaustive claims. |
| 10. Benchmark-wide catalog reconciliation | LIB-03/05/06 and all remaining catalog domains: reviewed Stella 6.0 entry list, generated-family descriptors, missing/ambiguous report, licensed source replacement, classification/operation domain matrix | Every one of the 2,191 finite baseline identifiers receives a reviewed mapping or explicit unresolved status; fissary/scaliform/compound families remain separately reconciled. Coverage closes only with no unexplained missing/ambiguous entries and independent named evidence, not when path count exceeds 2,191. |

Proposed modules after the freeze: `engine/catalog_crosswalk.py`,
`engine/classification.py`, `engine/products.py`, `engine/composition.py`,
`engine/subdivision.py`, `engine/fitting.py`, `engine/vertex_figure_growth.py`
and `engine/faceting_search.py`; companion tests should contain independently
computed expectations. Add attributed catalog generation under
`scripts/build-reference-catalog.py` and notices under a reviewed `third_party`
directory. These paths are proposed, not existing capabilities.

The first useful parallel batches are catalog schema/classification, Johnson
source export/validation, and rational polygon/product definitions. Composition
then supports both Johnson reconstruction checks and later augmentation;
classification/crosswalk supports the much harder scaliform and faceting work.

## Definition details that must precede implementation

The published Stella workflow calls its **antiduoprism** a 4D prism over a 3D
antiprism, with retrograde polygon parameters for crossed cases. Implement that
observed workflow first and explicitly document the convention. Do not infer
an unrelated twisted product from the name. Its vertex-figure workflow
**attempts** construction and offers choices when regular faces fit an edge in
multiple ways; arbitrary 3D input is not promised to close to a finite 4D
polytope. These are important contracts for CON-11/13.
[Official 4D construction menu](https://www.software3d.com/Manual/Menu4D.php).

For vertex-figure growth, store local edge/face angular choices, expansion order,
spatial merge witnesses, closure errors, maximum vertices/cells and the branch
that generated a result. Validate local links and global flag connectivity;
metric closure alone is insufficient. Crossed/retrograde products and
segmentotopes need direct source incidence and specified interior semantics;
convex hulls are valid only for their explicitly convex branches.

For faceting, separate **candidate completeness** from **result completeness**.
For bounded 3D input enumerate unique coplanar vertex sets from noncollinear
triples, then admissible ordered cycles within each plane. Preserve every
source point and bound the exponential cycle search. Enumerate cycle/face
orbits under verified source symmetry, solve explicit edge/link incidence
constraints and keep partial/nonmanifold result classes distinct. Repeated
visits, holes, hemi faces and coincidence semantics require explicit contracts;
they must not disappear through sorting or angular hull extraction. A diagram
is a derived construction view whose selected candidate IDs must reproduce the
committed cycles. Report `exhausted`, `result-limit`, `candidate-limit`,
`cancelled` and `numerically-unresolved` separately.
[Official automatic faceting](https://mail.software3d.com/Manual/AutoFacet.php?prod=Stella4DPro).

## Evidence required to close a batch

Keep numerical import, mathematical classification, competitor workflow parity
and redistribution provenance as separate results. Every newly supported
operation needs an independently checked ordinary case, transition/degenerate
case and explicit unsupported case, plus source-preserving preview and native
history round-trip. Catalog proof needs a complete manifest, not a few attractive
fixtures. Construction solvers need residuals and termination evidence; search
needs a declared finite domain and actual exhaustion evidence. Geometry-derived
claims must fail or remain unknown when a resource budget is exceeded.

The remaining specialized catalog breadth cannot be inferred from the available
OFF files. An installed Stella 6.0 baseline audit is still needed to settle
ambiguous catalog identifiers, option domains and specialized families. Its
published list of 2,191 uniforms is a target to reconcile, not an independent
proof that any local filename denotes the corresponding mathematical type.
[Official current library statement](https://www.software3d.com/History.php).
