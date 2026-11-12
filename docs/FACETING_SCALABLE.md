# Bounded 20-vertex faceting (R6-FACETING)

Automatic facets now accepts intrinsic 3D sources with 4 to 20 vertices. The
qualified extension is the **integer pyritohedral dodecahedron** in
[`examples/faceting/pyritohedron-20.off`](../examples/faceting/pyritohedron-20.off).
It has 20 vertices, 30 edges and 12 planar pentagons. This is a rational
dodecahedron, not a regular algebraic dodecahedron or a Stella comparison.

## Click-through

Open the OFF fixture. In **Construct > Stars & facets > Facet (search)**,
open `automatic-faceting-settings` (Automatic facets (3D)):

1. Set Source symmetry (`faceting-symmetry-mode`) to **Discover full source group**.
2. Check **Keep selected subgroup symmetry** (`faceting-invariant`).
3. Set Criterion (`faceting-criterion`) to **Isohedral in selected subgroup**.
4. Leave Candidate IDs blank and click **Build candidate pool**
   (`faceting-candidates`), then **Search** (`faceting-search`).
5. The status (`faceting-status`) reports one result, finite-domain exhaustion,
   plane work 4,929/50,000, variables 101 to 62 and 113 search nodes.
6. **Preview** (`faceting-preview`) is read-only; **Adopt** (`faceting-adopt`)
   uses the existing operation/history workflow. Undo/Redo, replay and project
   save/open retain the source and search receipt. Bounds remain collapsed.

No Expert mode is needed. **Use source faces** remains an alternative narrower
search domain. Clearing the invariant checkbox searches labeled subsets and
can encounter the existing variable frontier. Leaving Closed incidence selected
searches broader orbit unions; its default result cap is reached, so it reports
`resource-limited`, not exhaustive enumeration.

## Definitions and independent expectations

The fixture uses the eight points `(±4, ±4, ±4)` and the twelve cyclic coordinate
permutations of `(0, ±6, ±3)`. Its supplied pentagons lie in the twelve supporting
planes obtained from `±x ±2y = 12` by cyclic coordinate permutations.

An independent integer cross-product/GCD plane oracle exhausts all 1,140 source
triples. It finds 624 planes with three vertices, 99 with four, and 12 with five.
On a plane with `m` vertices, cycles of length `k` number
`choose(m,k) * (k-1)! / 2`; rotation and reversal identify the same boundary.
There are no collinear triples in this fixture. Thus the independently expected
candidate pool is **1,761**: 1,140 triangles, 477 quadrilaterals, 144 pentagons.
Crossed cycles remain eligible; vertices never repeat within a cycle.

An independent signed-coordinate-permutation oracle gives 24 source isometries
and 101 candidate-cycle orbits. This is a full point-group oracle here: the
centroid is zero, squared radii 48 and 45 separate the eight cube corners from
the other twelve vertices, and any cube isometry is a signed coordinate
permutation. Separate neighbor-link graph checks examine each
whole orbit, without native incidence/search helpers. They independently give:

| Invariant isohedral domain | Expected results |
| --- | ---: |
| All 20 vertices, disjoint coplanar vertex use | 1 |
| All 20 vertices, coplanar sharing allowed | 1 |
| Unused source vertices allowed, disjoint coplanar use | 3 |

The sole full-vertex result is the original twelve-pentagon boundary. A closed
result requires two distinct incident faces per edge and one cyclic face link
per active vertex. Disconnected surface components are allowed. These are
ordered surfaces, with no filled-solid, volume or density assertion.

## Algorithm, work and profile

For 13 to 20 vertices, exact representative-plane membership predicates are
transported through the already verified source isometries. Every image gets
its own exact plane equation and canonical source anchor. Covered triples are
skipped. On this fixture the full group needs 42 representative planes rather
than 735, reducing charged plane work from **18,498 to 4,929**. The plane table
and candidate cycles agree with the independent exhaustive oracle.

Invariant search discards whole candidate orbits that already violate edge
multiplicity, coplanar vertex use or result-plane caps. Remaining-edge and
source-vertex coverage prune impossible branches. For an invariant selection,
the result stabilizer is the entire selected subgroup, so its number of face
types is exactly the number of selected candidate orbits. Isohedral/max-type
bounds can therefore force exclusions without searching their power set.
This fixture discards 28 orbits for edge multiplicity and 11 for coplanar use,
retaining 62; the complete isohedral search visits 113 nodes. Small-source
traversal and receipts (4 to 12 vertices) keep their existing behavior.

| Budget | Bound |
| --- | ---: |
| Source vertices / face corners | 20 / 8 |
| Candidates / cycles per plane | 4,096 / 4,096 |
| New exact plane-orbit work | 50,000 |
| Automatic source-symmetry work | 500,000 |
| Candidate action references | 100,000 |
| Search variables / nodes / stored results | 256 / 200,000 / 128 |
| Exact policy work / ratio bit size | 500,000 / 4,096 |

Plane work charges a representative or image-anchor plane test, each source
membership test, and each transported vertex reference. It is a deterministic
work budget, not a count of machine instructions. Existing candidate, subgroup,
node, result and policy budgets remain independent. Cancellation and exhausted
budgets name the phase that stopped. `planeWork` and `searchPruning` are included
in the deterministically reverified receipt and visible status/evidence.

Run `python scripts/profile-faceting.py` for repeatable bounded profiles. One local
run, while verification jobs also ran, measured identity candidate generation
1.42 s, verified-group generation 1.36 s, invariant isohedral search 1.88 s, and
broader invariant unions 5.33 s. Timings are observations, not test thresholds.
The last search retained 128 results after 11,619 nodes and explicitly stopped
at its result cap; those 128 are a lower bound, not an expected total.

## Qualification and remaining gaps

Chosen conformance scenarios: `fac-02-dodecahedron-frontier`,
`fac-02-limited-search`, `fac-03-isohedral`, `fac-03-type-plane-limits` and
`fac-04-replication-adoption`. This closes a rational 20-vertex candidate tranche
and a restricted invariant isohedral search, with linked diagram/history
coverage. **FAC-02/03/04 remain partial.** The ordinary regular-dodecahedron
scenario is not qualified by this rational fixture. Full unconstrained searches,
larger sources and all benchmark diagram/options semantics remain follow-ups.

Predicates are exact for the supplied integer/binary64-ratio coordinates, not
for an intended algebraic solid. Rounded regular sources may have fewer exact
symmetries and coplanar faces. There is no snapping or tolerance-based plane
merge. Native realized surfaces and measurements remain numerical and carry
`certified: false`. Tidy and spiky filters are verified on this 20-vertex slice;
tidy-dual retains its explicit 4-to-12-vertex domain and refuses larger sources.
No Electron launch or competitor comparison was performed.

## Verification

```powershell
python -m pytest tests/test_faceting_scalable.py -q -p no:cacheprovider
python -m pytest tests/test_automatic_faceting.py tests/test_automatic_faceting_workflow.py tests/test_faceting_diagram.py tests/test_faceting_diagram_edit.py tests/test_faceting_diagram_workflow.py -q -p no:cacheprovider
node --test tests/automatic-faceting-controls.test.mjs tests/faceting-diagram-controls.test.mjs tests/faceting-diagram-editor.test.mjs tests/engine-op-allowlist.test.cjs
npx.cmd vite build --configLoader native
```

The new Python tests use independent integer planes, explicit cycle orbits and
neighbor-link graphs, then cover exact policy filters, budgets, cancellation,
native dispatch, linked diagram adoption, history replay and project save/open.
The mounted Node test drives the real 20-vertex fixture through native JSONL
candidate/search/preview and checks adoption arguments and visible status.
No new operation, dependency, test file registration or package version change
is needed; the Node cases extend the existing registered feature test file.

Executed results: **10 new Python tests + 264 existing Python tests passed;
87 Node tests passed; Vite production build passed**. Vite retains its existing
mixed static/dynamic viewer import and large-chunk warnings. `git diff --check`
also passed. The profile script completed all four bounded profiles.
