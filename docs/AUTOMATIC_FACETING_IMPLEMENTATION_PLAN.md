# Automatic faceting: complete scope and bounded development evidence

The original FAC-02, FAC-03 and FAC-04 requirements remain open. Release 0.20 is
frozen; the prototype described here is **not mounted, packaged, or released**.
It is independently defined candidate/incidence/subgroup/filter work, not Stella equivalence.

## Authoritative current implementation

`engine/faceting.py` accepts supplied ordered cycles on intrinsic 3D source
vertices and applies the native validator. It preserves the vertex array and
returns a generalized surface. `ui/app.js` copies existing faces into a textarea
and commits the supplied cycles through operation `facet/0.1.0`. Existing tests
cover ordinary, open, pinched and star-cycle sources. A generalized validation
pass does not require a closed manifold: automatic acceptance must add its own
edge and vertex-link predicates.

There is no automatic candidate search, enumeration receipt, criteria/type
filter, faceting diagram, selected-symmetry replication, or saved faceting
preview distinct from the base document. Manual construction also does not
inherit current units/colors or retain a complete source snapshot. Changing
that legacy operation requires a new version; old replay must stay immutable.

## Documented baseline, not executed conformance

The public manual lists four criteria: Isohedral, Tidy Facetings & Duals, Tidy
Facetings, and Allow Coplanar Faces Sharing Vertices. Tidy requires finite
geometry, two faces per edge, no repeated face vertices, and vertex-disjoint
coplanar faces. The dual criterion additionally tests the reciprocal object.
Controls include minimum/maximum facet types (maximum zero is unlimited), a
per-plane candidate limit, partial vertex use, and a spiky condition excluding
edges on the convex hull. Traversal covers facetings, edge types, planes and
facets; reverse faceting traversal is documented only for isohedral results.
[Automatic Faceting](https://www.software3d.com/Manual/AutoFacet.php)

The installed 5.4 manual's `#autoFacet`, `#faceting` and `#facetDiag` sections
describe these workflows. Inspection was read-only: no launch, installed model
read, catalog extraction, or installed-file write. Manual SHA256:
`9cda8b03212946417655ce2d95a5ffece4904b83e4c9f8b936434dbf0050e49c`.
Its default values, enumeration order, limit behavior and degenerate-case outputs
have not been executed here. No paid version 6 installation is required or
pending. Version 6 documentation and 5.4 observations remain separate evidence.

The local 5.4 section defines the four criteria, type range, partial and spiky
controls; it does not list the public manual's later per-plane control. In the
public manual, that control limits **candidate generation**, which can omit
results. A separate result-plane count constraint below is a derived capability,
not an asserted equivalent meaning of Stella's control. A tidy dual needs its
own reconstructed reciprocal eligibility tests; checking only that primal
planes avoid the center would be insufficient. The spiky predicate concerns
whole segments on the convex hull boundary, including facial diagonals,
not only convex-hull one-skeleton edges.

The manual describes facets replicated by selected symmetry/reflection settings,
an editable preview saved with the document, and conversion into a new base.
Its vertex-specific diagram projects other vertices and represents potential
facial planes with selectable lines; selected facets have stronger styling.
[Faceting](https://www.software3d.com/Manual/Faceting.php),
[Faceting Diagram](https://www.software3d.com/Manual/FacetDiag.php).
Those two web endpoints were unavailable during this audit; the local manual
supplied their descriptive evidence.

Face type cannot simply mean polygon size or edge-length multiset. The author's
snub-cube faceting illustrates symmetry-identical irregular faces and a genuinely
nonconvex result. Congruence alone also does not establish selected-group
isohedrality. [Author's noble snub-cube faceting](https://www.software3d.com/NobleSnub.php)

## Development kernel and precise API

`development/automatic_faceting.py`, version `0.3.0-development`, exports:

```python
verify_source_symmetry(source, symmetry_permutations=None)
candidate_facets(source, *, max_face_vertices=8, max_candidates=4096,
                 max_cycles_per_plane=4096, symmetry_permutations=None,
                 cancelled=None)
enumerate_facetings(source, candidate_ids=None, *, criteria=None,
                   max_face_vertices=8, max_candidates=4096,
                   max_cycles_per_plane=4096, node_limit=200_000,
                   result_limit=128, symmetry_permutations=None,
                   equivalence='labeled', invariant_under_subgroup=False,
                   cancelled=None)
realize_faceting(source, search, result_id)
```

The input is a valid native intrinsic-3D Model with 4–12 distinct-coordinate
vertices and exact affine rank three. JSON is bounded before copying. Actual
integer/binary64 coordinates are interpreted as rational numbers for plane
anchors, membership and plane equality, with a 4096-bit arithmetic bound.
This is exact evidence about the supplied coordinates, not their intended
symbolic realization. A nearly coplanar quadrilateral is not silently snapped.
Approximate or symbolic-planarity support is a required subsequent domain.

The catalogue enumerates every source-supported planar, nonrepeating cyclic
boundary of 3–8 corners in its recorded domain, including self-crossing cycles.
Collinear subsets are omitted. Cyclic rotation/reversal are equivalent;
different Hamiltonian cycles on the same point set stay distinct. No angular
sort, Hull boundary, or triangulation substitutes for these cycles. Source-ID
labels remain the default equivalence; arbitrary relabeling, graph isomorphism
and isometries outside the selected subgroup are not equivalences here.

An optional subgroup is an explicit complete list of 1–128 vertex permutations,
**not generators**. Verification checks every exact squared pair distance,
original source edges, ordered face cycles, a deterministic source-face-ID lift,
and original cell membership where present. Identity, inverses and composition
must all be present. Exact tetrahedral anchor determinants distinguish proper
and improper affine isometries; a translated source need not fix the world
origin. The list is a verified subgroup, never a maximal-source-group claim.
Duplicate source-cycle owners use a rank-preserving face-ID lift; incompatible
cell ownership is explicitly refused rather than verified only by cell points.
Approximate/symbolic actions on intended trigonometric coordinates remain open.

Full candidate cycles map through actual subgroup permutations. Ordinary and
crossed cycles on identical planar vertex sets do not become a single candidate.
The catalogue records candidate actions and their orbits. Explicit search domains
must be unions of complete selected-subgroup orbits; seeds are not silently
expanded. `invariant_under_subgroup=True` searches whole orbit unions, followed
by the same actual incidence/link predicates. This is genuine symmetry-constrained
generation, not a claim that every orbit union is a valid faceting.

`equivalence='subgroup'` canonicalizes each accepted cycle-set under that verified
action and identifies geometric result classes. It records the labeled selections
accepted separately from distinct stored results. Color attributes are explicitly
excluded from geometric equivalence, remain untouched in source snapshots, and
are inherited from the selected representative's actual source owners. Labeled
mode remains available to retain every distinct source-ID choice.

Result face types are the orbits of the **result stabilizer within the selected
subgroup**, not ambient candidate orbits or polygon corner counts. Their witnesses
include stabilizing action indices and orbit/stabilizer orders. A single such face
orbit proves isohedrality under that subgroup; multiple orbits do not disprove
isohedrality under some larger uncomputed group. Criterion/type-range controls
still need a separate implementation; these evidence fields are not a mounted
baseline filter.

Subset search requires two distinct face incidences on every used edge and one
simple connected face-link cycle at each used vertex. Its optional criteria are:

| Parameter | Meaning |
| --- | --- |
| `accept_partial` | Boolean; default false. All literal source vertices remain in every result. |
| `coplanar_vertices` | `disjoint` (default) or `allow`, using exact source-plane keys. |
| `isohedral` | Boolean; default false. Require one face orbit under the **result stabilizer** of the verified selected source subgroup. |
| `min_face_types` | Positive integer; default 1. Count result-stabilizer face orbits. |
| `max_face_types` | Nonnegative integer; default 0 means unlimited. A positive maximum must be at least the minimum. |
| `max_faces_per_plane` | Nonnegative integer; default 0 means unlimited. Bound selected faces per exact source plane; a derived result filter. |
| `plane_face_counts` | Object mapping generated exact plane IDs to nonnegative integer **exact** selected counts. Default empty. Count 0 excludes that plane. A derived result filter. |

Count fields are bounded by the 4,096-candidate resource ceiling; that ceiling
is not a mathematical baseline-domain restriction. Candidate orbits, polygon
corner counts and congruent point sets never substitute for result face types.
Each accepted result records its normalized criteria, individual checks, and
exact plane equations with the owning candidate IDs/counts, including requested
zero-count planes. The evidence is rebuilt on adoption. With geometric subgroup
equivalence, fixed plane constraints must be constant on complete source-plane
orbits; non-invariant constraints refuse explicitly. Labeled equivalence permits
fixed source-plane constraints without claiming they are symmetry-invariant.

Every result retains all source vertices, identifying unused IDs explicitly.
Connected face components are recorded as incidence evidence, not fabricated
compound leaf snapshots or a filled-volume decomposition. Native adoption
additionally validates the reconstructed generalized model and rejects failure
atomically. The search's incidence witnesses alone do not certify a native
realization, orientability, density, or filled solid.

Search reports bind the complete source attributes, geometry fingerprint,
candidate IDs, explicit selection, numerical domain, criteria and limits.
They return `complete`, `resource-limited` or `user-cancelled`; malformed requests
raise `GeometryError` rather than fabricating successful/failed search results.
A future native job envelope must translate exceptions into `failed` receipts.
Complete means exhausted **the recorded candidate/face-size domain**. A partial
table, result-storage stop, node stop, or candidate-domain frontier yields only
a found lower bound. Enumeration beyond 256 **search variables** returns an
explicit frontier instead of overflowing Python recursion. Labeled subset
search has one variable per candidate; invariant search has one per complete
candidate orbit and may safely search more than 256 candidate rows. It remains
subject to candidate/action/node/storage budgets. A supplied smaller
candidate subset is recorded as restricted, even if completely exhausted. Source
subgroup verification has a 100,000-reference work bound; exceeding it refuses
the request before a verified group/count is asserted. Candidate-action tables
also have a 100,000-reference budget. An incomplete or truncated action table
returns an explicit limit/cancel status and prevents subgroup search. A per-plane
limit may break action closure; missing images are never ignored to invent orbits.
Source snapshot fences reject caller changes made during candidate generation
or search, including changes made by cancellation callbacks; they do not roll
back an external caller's edits.

`phaseStatus` separates candidate generation, symmetry-action construction and
subset search (`not-started` where applicable). Overall `complete` requires all
three phases to finish; exhausting a truncated available table is still a
lower-bound overall report. `labeledSelectionsAccepted` counts labeled selections
that pass the requested filters, before quotient deduplication. The separately
reported incidence selections examined and criterion rejections at leaves do
not count pruned branches; no total rejected-selection count is invented.

Realization rebuilds source-bound candidates and the selected incidence witness.
It reconstructs the selected source subgroup, complete candidate action table,
orbit witnesses, result stabilizer/types and exact result-plane filter ownership.
It does not independently reexecute
an entire interrupted search or certify its
completion claim. A production search/replay adapter must qualify that separately.
It preserves literal coordinates/IDs, matching source edge IDs, complete source
face-owner sets and the entire original Model snapshot. Units are inherited.
Exact cycle matches inherit RGB/RGBA; genuinely new facets have explicit null
color. Conflicting colors on duplicate source-cycle owners are refused. All
other original attributes remain in the historical source snapshot. There is
no inherited convex support certificate, invented uniformity, or volume claim.

## Independent evidence

`development/test_automatic_faceting.py` contains 113 passing checks:

- A literal right tetrahedron has four candidate planes/cycles and one fully
  exhausted boundary result, without a Hull reference.
- Eight literal cube vertices have 20 planes, 56 triangle cycles and 36
  quadrilateral cycles, including crossed square traversals: 92 candidates.
- A separately specified 14-candidate domain exhausts 32,767 search nodes and
  produces the cube (8/12/6) and two alternating tetrahedra (8/12/8). Partial
  vertex use additionally produces either tetrahedron, retaining all eight IDs.
- Literal `5/2` polygon-prism cap cycles remain stars, with result 10/15/7.
- Triangulating one cube face gives 8/13/7 only when coplanar vertex sharing is
  allowed. Open shells and a two-tetrahedron pinched vertex are rejected.
- Cancellation, each numerical/storage frontier, exact versus nearly planar
  membership, malformed JSON/surrogates/depth/huge integers, source/receipt
  tampering, ambiguous colors and deterministic IDs are checked.
- Actual native project Save/Open retains selected topology, source snapshots,
  source maps, units, RGBA and notes. No desktop qualification was performed.
- The literal cube's 48 signed-coordinate actions have 24 proper/24 improper
  determinant signs and give candidate-orbit sizes 6,6,6,6,8,12,24,24. Full cycle
  actions and exact edge-length signatures independently separate their types.
- Subgroup equivalence merges the two single-tetrahedron choices: four labeled
  accepted selections become three geometric classes, with orbit size two and
  stabilizer order 24. Full cube symmetry excludes either single tetrahedron
  from invariant generation; the 14-candidate domain has two orbit variables
  and exhausts seven nodes to find the cube and two-tetrahedron compound.
- The complete 92-candidate cube domain has eight orbit variables; closed-link
  tests still reject invalid orbit unions. The right tetrahedron's six coordinate
  permutations give two face types (sizes 1 and 3), despite all faces being
  triangles. A regular tetrahedron under 12 proper actions has one face type.
- Forged distances, incomplete element lists, missing identity/inverses/closure,
  unordered point-set-only source claims, nonclosed seed domains, false action/
  orbit/type receipts, translated-source actions, color-independent geometry,
  distinct source face/cell ownership, action budgets and cancellation are checked.
- Right-tetrahedron type limits accept exactly two result face types and reject
  isohedral/one-type filters. Full cube actions retain three geometric classes
  from four partial labeled selections with the isohedral filter. Identity-only
  action does not claim that all triangular faces are one type.
- A cube face split into two triangles is selected by exact plane count 2;
  count 1 or a result maximum of 1 selects the six-square cube. Zero counts
  exclude a plane, with explicit empty owner evidence. Nearly parallel planes
  separated by `1e-12` retain distinct exact keys instead of tolerance merging.
- A literal crossed-cap six-face surface with one unused center vertex has
  three result face types under eight verified actions. Type/isohedral/partial
  filters preserve ordered crossed cycles and retain all source coordinates.
- A literal ten-vertex octagonal bipyramid has more than 256 candidates but
  fewer than 256 verified orbit variables; it reaches a requested node stop,
  rather than a candidate-row frontier. Phase-specific limits/cancellation,
  non-invariant quotient plane constraints and forged filter/plane ownership
  receipts are tested. Native project Save/Open preserves filtered evidence,
  source snapshots, units, RGBA and notes.

## Remaining mathematics and implementation batches

| Batch | Required work and acceptance evidence |
| --- | --- |
| Candidate generalization | Approximate/symbolic plane ownership, scalable complete candidate generation, nonrepeating stars and documented degenerate cycles; retain separate exact/tolerance receipts. Test irregular/noncospherical sources and existing star catalogues without Hull substitution. |
| Broader symmetry/equivalence domains | Exact supplied subgroups, full-cycle actions, orbit-union search and subgroup equivalence now exist in development. Add complete numerical/symbolic source-group acquisition and subgroup/reflexibility UI; retain actual source/candidate actions, distinguish geometric/color/chiral policies, and qualify non-axis irregular/star sources. No maximal group or production conformance claim is made. |
| Complete FAC-03 criteria | Development now has selected-subgroup isohedral/type-range filters, exact result-plane count filters, relaxed coplanar sharing, literal partial use and candidate-per-plane truncation with phase accounting. Still qualify full source-group/type domains, baseline partial vertex-orbit semantics, tidy surface versus this prototype's stricter connected vertex links, tidy reciprocal checks and spiky predicates. Unsupported choices reject explicitly. |
| Reciprocal domains | Audit through-center planes, coincident reciprocal vertices, compound links and infinite duals. Existing `incidence_dual` is useful evidence, but its bounded rejection domain cannot silently define all baseline tidy-dual semantics. |
| Spiky filter | Test whether each entire candidate edge lies on a Hull support face. Merely checking Hull one-skeleton edges misses face diagonals. Hull may support this predicate, never replace result incidence. Independently verify cube face diagonals as non-spiky and named nonconvex fixtures. |
| Search and persistence | Versioned strict transport, deterministic continuation/checkpoints, cancel/resource accounting, page/step cursors, immutable complete-source receipts and original-parent replay/branches. Reconstruct accepted cycles, filters and source ownership after Python/JS Save/Open; never convert lower bounds into counts of all facetings. |
| FAC-04 diagrams | Explicit selected vertex and projection convention, projective singular/infinite-point handling, exact native point/plane/cycle ownership, diagram picks, orbit replication, source preview, saved selection and promotion using identical topology. Diagrams must not invent source vertices at crossings. |
| Baseline qualification | Read-only owned 5.4 runs on independently authored cube/tetra/compound/irregular/star fixtures when parent authorizes GUI. Record options, criterion counts and limits. Public 6 documentation establishes required scope but is not executed 6 conformance. |

## Proposed future native/UI contract

Use separate versioned operations `facet-candidates`, `facet-search`,
`facet-diagram` and `facet-adopt`. This is a proposal; none is registered.
Each request binds the full source Model and a strict params object. Search
params must include criterion, selected verified subgroup, reflection policy,
equivalence policy, partial-coverage flag, type range, per-plane cap and work/
storage budgets. An omitted or zero unlimited setting must retain its documented
meaning; transport bounds must report a resource limit rather than reinterpret it.

Return stable source-owned plane/cycle/orbit/result IDs, criterion witnesses,
completed-domain description, frontier/checkpoint and termination reason.
Adoption accepts a source-bound selection receipt, not caller-supplied alternate
coordinates or a result count. It produces a generalized ordered model plus
full maps/colors/source history and passes native project validation. Exact
search predicates and approximate downstream native validation remain distinct.

The compact Faceting workspace needs a source preview; selectors for criterion,
group/reflections, type limits, per-plane limit, partial and spiky options;
candidate/faceting stepping; and a separate vertex-specific diagram with native
IDs. Stop, resume, exhaustion/restriction status and Promote must be visible.
Fields await native expressions under full source/document/units/notes/RGBA and
form ownership, with cancellation and a final publication check. Observer
camera motion stays independent. Saved diagram/preview selection and the adopted
base must reconstruct the same ordered cycles and source maps.

Unresolved installed details include plane/cycle ordering, default limit values,
equivalence of mirrored results, type identity under reduced groups, diagram
projection scale, singular dual display and color inheritance. These are
specific qualification tasks, not permission to remove any original FAC domain.
