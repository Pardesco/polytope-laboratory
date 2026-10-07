# Ordinary cupola construction

`engine.cupola.cupola(n=3, edge_length=1.0, height=None)` generates an ordinary
convex cupola directly from two regular polygon rings. This implements a
bounded parameterized construction subset of CON-01. The Construct inspector
has separate Cupola controls. This does not close the full cupola, cuploid or
rotunda requirements.

The [official Stella glossary](https://www.software3d.com/Glossary.php) describes
a cupola using parallel n/d and 2n/d polygons, alternating lateral squares and
triangles. Its definition also covers star and retrograde polygons. This module
implements the ordinary `d=1` case. With adjustable height the squares become
rectangles and the lateral triangles become isosceles. The
[official version history](https://www.software3d.com/History.php) describes
custom constructions whose bases need not admit regular lateral faces;
matching that entire workflow remains pending.

## Parameters and incidence

`n` is an actual integer from 3 through 128. Ring edge length and explicit height
must be finite positive numbers at most `1e100`; booleans and numeric strings
are rejected. All ring radii must also stay within `1e100`. Extreme aspect
ratios are rejected when complete supporting incidence cannot be separated at
the existing `1e-8` scale-relative tolerance. There is no silent flattening,
height correction or clamp.

For ring edge length `e`, let `delta = pi/(2n)`. The upper and lower radii are

```text
r = e / (2 sin(pi/n))
R = e / (2 sin(delta))
q = R cos(delta) - r cos(pi/n)
lateral edge length = hypot(q, height)
```

The upper vertices have angles `2pi*i/n`, the lower vertices have angles
`pi*j/n - delta`. Their planes lie at `+height/2` and `-height/2`. The origin is
the axis midpoint between these planes, not the vertex arithmetic centroid.

Omitting height sets `height = sqrt(e^2 - q^2)`. A strictly positive
regular-face solution exists only for `n=3,4,5`; omitted height is explicitly
rejected for `n>=6`. The unit-edge heights are respectively `sqrt(2/3)`,
`1/sqrt(2)` and `sqrt((5-sqrt(5))/10)`. Supplying height is allowed for every
supported `n`. Explicit unequal height does not acquire a Johnson identity.

The source boundary has exactly `3n` vertices, `5n` edges and `2n+2` faces:
one upper n-gon, one lower 2n-gon, n triangles and n rectangles. For upper
vertex `T_i` and lower vertex `B_j`, outward lateral cycles are
`[T_i, B_2i, B_(2i+1)]` and
`[T_i, B_(2i+1), B_(2i+2), T_(i+1)]`, with cyclic indices. The lower polygon
is reversed. Incidence comes from these formulas, never a convex hull.

## Validation and provenance

The model is an approximate convex polytope with a complete support table.
Every supplied face gets an outward unit normal computed from its ordered
source cycle. Its vertices must lie in the support plane; every nonincident
vertex must be strictly inside with normalized separation greater than four
times the configured tolerance. Existing kernel validation independently
checks face planarity, boundary links, Euler characteristic, affine rank and
the supplied supporting planes. Trigonometric coordinates are evaluated in
float64, and `numeric.certified` remains false.

`metadata.cupola` retains the input size, actual height, automatic or explicit
height mode, radii, lateral edge length, origin definition, and complete
vertex/edge/face role maps. `regularFacesWithinFloatTolerance` is numerical
evidence, not a symbolic certificate. Provenance records operation `cupola`,
algorithm version, and replayable `n`, `edge_length`, and optional `height`.
The generator uses original mathematical coordinates and no catalog file;
there are no inherited source colors or source-model IDs to misattribute.

No cached content/area, rational certificate, catalog classification or
component hierarchy is invented. Existing project validation may build the
appropriate derived support and measure fields from the supplied convex
source geometry. Such caches must preserve its direct incidence and remain
subject to the established validation rules.

## Independent evidence and remaining scope

`tests/test_cupola.py` checks literal square-cupola coordinates/cycles,
analytic regular heights, all edge lengths, rectangular right angles,
isosceles triangle lengths, outward support, manifold links, role-map
partitions, scale changes and explicit malformed/resource diagnoses.
Independent Qhull tests compare full supporting vertex sets for selected
ordinary cases, and a prismoid section-area formula crosschecks volume.
Qhull is only a test oracle; it does not generate this module's incidence.

The three regular cases are crosschecked against the retained, hash-verified
Antiprism assets `antiprism-j3`, `antiprism-j4` and `antiprism-j5`. For each,
four spanning metric anchors produce a bijective vertex map; all pairwise
vertex distances and every edge and ordered face cycle then agree. These
checks establish the specific approximate geometric crosswalk without
changing or copying the attributed records into the generator.

## Construct workflow

Open Inspector, choose Construct, and expand Cupola. Enter the upper polygon
side count and ring edge length. Edge length and height accept the app's numeric
expressions. Blank height requests regular faces for 3, 4 or 5 sides; for 6 or
more sides an explicit positive height is required. Generate opens a separate
source document. Animation export disables these controls.

Generation retains native provenance parameters but currently opens a source
snapshot rather than a recorded generation operation. Later edge subdivision
on that snapshot supports undo, verified replay and parameter branching. There
is no claim that the cupola generator itself has a history parameter branch.
`scripts/construction-refinement-smoke.cjs` checks these native workflows with
isolated profiles and actual saved projects; execution requires the matching
app build. `POLYTOPE_TEST_EXECUTABLE` selects a packaged executable and
`POLYTOPE_TEST_ARTIFACTS` changes the parent artifact directory.

The actual 0.12.0 development app passed all six combined construction and
refinement GUI groups in 31.528 seconds, with zero page errors. Evidence is
[the isolated run report](../artifacts/construction-refinement-smoke-8UYCCC/result.json),
27 native project snapshots and three inspected screenshots in that directory.
The tests load J3/J4/J5 through the real catalog UI, verify the source asset
hashes, construct each regular cupola and compare every metric and incidence.
They also verify atomic refusal of blank height for n=6, expression-evaluated
explicit height 1, unequal rectangular sides, save/reopen and subsequent
refinement replay. The independently authored source fixture stayed unchanged.
This is development desktop evidence; a packaged pass remains separate.

Star or retrograde cupolae, cuploids, cupolaic blends, rotunda generators,
augmentation onto an existing face, and generator-operation history remain
separate work. This module makes no claim of full Stella construction parity.
