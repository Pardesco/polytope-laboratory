# Literal regular polygon steps

`engine.star_polygons.regular_star_polygon(n, d=1, radius=1.0)` constructs an
ordinary, star or compound polygon from angular positions and exact modular
incidence. This is a kernel foundation for LIB-07 and CON-11; prism, antiprism
and product construction remain separate work.

The [official Stella glossary](https://www.software3d.com/Glossary.php) recognizes
regular polygons that wind around their center more than once, and gives 5/3
as the retrograde counterpart of 5/2. The
[official equations manual](https://mail.software3d.com/Manual/Equations.php)
treats a polygon symbol inside `faceRad`, `faceAngle` and `diag` as a literal
pair rather than ordinary arithmetic division. The implementation follows
those positive-symbol conventions and documents negative steps as an explicit
additional oriented-input convention. Existing equation syntax is unchanged.

## Parameters and cycles

Both `n` and `d` must be actual integers, with `3 <= n <= 1024` and
`0 < abs(d) < n`. Radius must be finite and positive, no greater than `1e100`.
Booleans, numeric strings and floating-point counts are rejected. A half-turn
step `abs(d) = n/2` is rejected because it gives two-vertex digon cycles, which
the current Model face schema does not support. Coordinates unresolved at
float64 precision are diagnosed rather than collapsed or welded.

Vertex ID `i` always denotes the literal point
`radius * [cos(2pi*i/n), sin(2pi*i/n)]`. Begin a cycle at the smallest unused
angular ID, then repeatedly add `d` modulo `n` until it returns. Repeat for
remaining IDs. This gives exactly `n` vertices and edges and
`gcd(n, abs(d))` faces. Edge crossings do not create new incidence vertices.

| Symbol | Ordered source cycles | Origin winding per cycle |
| --- | --- | --- |
| 5/1 | 0,1,2,3,4 | +1 |
| 5/2 | 0,2,4,1,3 | +2 |
| 5/3 | 0,3,1,4,2 | -2 |
| 5/-2 | 0,3,1,4,2 | -2 |
| 5/-3 | 0,2,4,1,3 | +2 |
| 6/2 | 0,2,4 and 1,3,5 | +1 each |

The symbol is never reduced as a rational number. `6/2` is a two-triangle
hexagram with six source vertices, not one `3/1` triangle. Crossing triangles
remain disconnected in source incidence.

`parse_polygon_symbol(text)` returns an unreduced `{n, d}` pair from a literal
integer or `n/d` string. It accepts whitespace around the slash and an explicit
sign immediately before denominator digits. Length is bounded to 32
characters. Decimal/exponential counts, arithmetic arguments and code are
rejected; it does not evaluate `n/d` as a quotient. For example, ordinary
`evaluate('5/2')` is 2.5, while `parse_polygon_symbol('5/2')` is `{n: 5, d: 2}`.

## Signed winding and metric evidence

Reduce the step modulo `n` to `effectiveStep` in `1..n-1`. Its principal signed
step `s` lies strictly between `-n/2` and `n/2`; replace `effectiveStep` by
`effectiveStep-n` when it exceeds `n/2`. Origin winding is the integer
`s / gcd(n,abs(d))`. These are shortest angular turns along the actual straight
edges, so 5/3 winds -2 rather than +3. Half-turn steps are excluded because an
edge would pass through the origin and its winding would be undefined.

For each cycle with `m` vertices:

```text
edge length / radius = 2 sin(pi * min(abs(d), n-abs(d)) / n)
signed algebraic area / radius^2 = (m/2) sin(2pi*s/n)
```

The recorded signed algebraic area is the shoelace integral of the ordered
cycle. It is neither a union area nor a nonzero/even-odd filled area. Large or
small scales preserve normalized metrics; if a physical area scalar underflows
it is `null` with an explicit status and the unit-radius value is retained.
Subnormal metric scalars are diagnosed with their separate scale factors.
All trigonometric coordinates remain approximate and uncertified.

## Component source maps and provenance

Every result is a generalized incidence model without a hull, support-plane
certificate or filled-area cache. `metadata.regularStarPolygon` retains the
unreduced pair, original symbol, radius, modular and principal steps, ordered
cycles, angular vertex IDs and per-cycle evidence. Its source Model ID and
representation fingerprint bind those cycle IDs and metrics to the generated
geometry. Operations that change this geometry may retain that record as
historical evidence; they must compare its fingerprint before applying it to
current source incidence.

When the greatest common divisor exceeds one, every cycle has its own current
component UUID and complete vertex/edge/face/cell maps. Existing binary compound
assembly provides literal leaf snapshots and historical source paths. The
final current geometry is explicitly remapped back to original angular vertex
IDs and deterministic sorted edges; no recentering or coordinate transformation
occurs. Immediate historical input maps and current component maps are remapped
together. Leaf snapshots preserve their original phase and parent symbol, so
existing `retrieve_source`, `extract_component`, `remove_component` and
`add_models` APIs operate on legitimate source records.

Single-cycle polygons are standalone models. Top-level generator provenance
records `regular-star-polygon`, algorithm version and replayable numeric `n`,
`d`, `radius` parameters. Historical leaves instead record
`regular-star-polygon-cycle`, the original pair and selected cycle index. This
keeps their rotated phase explicit rather than falsely identifying them as a
zero-phase reduced generator. No external catalog assets or identities are
inferred.

## Independent checks and remaining work

`tests/test_star_polygons.py` uses radical pentagon coordinates, literal star
cycles, independently computed ray-crossing winding and shoelace integrals.
It verifies step-edge lengths against existing literal `faceRad` helpers,
ordinary-cycle incidence against the existing convex polygon generator,
hexagram triangles, unreduced/signed parsing, component source snapshots,
extraction/deletion/addition and all map ownership. Maximum-size compound
inputs validate every map, with representative deep leaf extraction. Scale,
degeneracy, precision, JSON, input/resource and explicit no-hull checks cover
the bounded domain.

## Native generator and dedicated controls

`generate('regular-star-polygon', symbol='6/2', radius=1)` uses the literal
parser before creating geometry. Explicit numeric `n`, `d`, `radius` parameters
are also accepted; mixing a symbol with either count or supplying unknown
parameters is diagnosed. The default is a unit-radius 5/2 pentagram. A symbol
is never passed through ordinary numeric expression evaluation.

`ui/star-polygon-controls.mjs` exports `StarPolygonControls(context)` for the
Construct inspector. Its Star polygon disclosure follows Cupola, with a
literal Polygon field and a separately expression-evaluated Radius field.
Default inputs are `5/2` and `1`. Busy and animation-export guards protect the
new-document construction callback. The integration context supplies `guard`,
`number`, `generate` and optional `isExporting`; it dispatches generate kind
`regular-star-polygon` using `{symbol, radius}`. Main app instantiation and the
matching UI build are coordinated separately.

`tests/test_star_polygon_generator.py` verifies actual generator dispatch,
separate expression evaluation, malformed/ambiguous parameter rejection,
component extraction/deletion and JSON-line server transport. An invalid
digon request fails explicitly without preventing subsequent valid requests.
No Electron or packaged UI evidence is claimed from these native tests.

The dedicated desktop regression is `scripts/star-polygon-smoke.cjs`. It uses
an isolated profile and actual native project saves for literal/signed cycles,
expression radius, unreduced hexagram components, Keep/Delete, undo/replay,
persistence and atomic digon refusal. Independent observer-camera projection
from a saved state locates GPU samples at the pentagram center, an arm and a
gap that a convex hull would fill. Nonzero versus even/odd changes that center
without changing source geometry. Model and camera checks read saved projects,
not renderer globals. `POLYTOPE_TEST_EXECUTABLE` selects packaged testing;
`POLYTOPE_TEST_ARTIFACTS` selects the parent artifact directory. Run only after
the matching application build and exclusive Electron test window are ready.
Desktop qualification is established by an actual successful run report,
separately from the native kernel checks above.

## Ordered product kernel: not yet integrated into the application

`engine.products.polygon_prism(source, height=1.0)` constructs a 3D prism from
intrinsic 2D ordered cycles. `polygon_product(left, right)` constructs their
literal 4D polygon product. These are independent kernel APIs for the next
development batch; the frozen 0.12 application and its extrusion command do
not dispatch them. Source generator/controller integration is described below;
no built UI, recipe replay or packaged product qualification is claimed.

Inputs must be validated 2D models embedded in two coordinates. Every vertex
and edge belongs to exactly one polygon cycle; isolated wire/point strata,
shared vertices/edges and planar filled subdivisions are diagnosed as outside
this initial domain. Self-crossing cycles and coincident but separately indexed
cycles are retained. No crossing vertices, welds, convex hulls, solid interiors
or filled measures are inferred. All results are generalized and uncertified,
even for convex factors; cached source measures and support planes survive
only inside the complete historical input snapshots.

For a prism, vertex `i + layer*V` is the unchanged source point with interval
coordinate `-height/2` or `+height/2`. Source edges are copied to both layers,
one interval edge joins each source vertex, the lower cap reverses the source
cycle and the upper cap retains it. Each oriented boundary segment `a -> b`
produces wall `[a,b,b+V,a+V]`, regardless of the stored source edge's endpoint
order. Counts are `2V`, `2E+V`, `2F+E`, with no cells. A literal pentagram has
10 vertices, 15 edges and 7 faces; a `6/2` hexagram has two triangular prism
partitions with totals 12, 18 and 10.

For a polygon product, vertex `a*V_right+b` concatenates both literal source
coordinate pairs. Edges are edge-times-vertex and vertex-times-edge. Faces
are ordered polygon-times-vertex, vertex-times-polygon and edge-times-edge
quadrilaterals. Each polygon-times-edge cell contains its two polygon caps
and one quadrilateral per polygon boundary edge. Edge-times-polygon cells
follow the symmetric construction. With `g_left` and `g_right` source cycles:

```text
V = n_left*n_right
E = 2V
F = V + g_left*n_right + n_left*g_right
C = g_left*n_right + n_left*g_right
disconnected partitions = g_left*g_right
```

Square-times-square has the complete tesseract incidence `16/32/24/8`.
`5/2`-times-triangle has `15/30/23/8`; unreduced `6/2`-times-triangle has two
triangle-product partitions with `18/36/30/12`. Every output ridge has exactly
two cells, and each cell's edges have exactly two face incidences. These
combinatorial checks do not assert a filled star-cell volume.

`metadata.orderedProduct` preserves full input models, input IDs, geometry
fingerprints and complete-snapshot SHA-256 values. The latter normalizes
equivalent JSON numbers such as `1.0`/`1` and `-0.0`/`0`, and includes source
attributes. Output element records identify every contributing factor element;
source maps list the copied output vertices, edges and faces, while interval
endpoint records identify the two prism layers. Polygon colors retain all
RGB/RGBA channels on the corresponding caps or factor polygon copies. New
walls and cells are explicitly uncolored. Source metadata and input arrays
remain untouched.

Disconnected output currently exposes ordered `componentPartitions` covering
every current vertex, edge, face and cell exactly once. It deliberately does
not forge the binary historical compound schema: `recoverableCompoundComponents`
is false, no top-level `components` list is provided, and existing Keep/Delete
APIs reject partition IDs. Recoverable output leaf snapshots require a later
implementation before those operations can be integrated.

Preflight limits include 4,000 output vertices, 100,000 entries per incidence
array, 1,000,000 coordinate/incidence references, 2,048 vertices per face and
1,024 disconnected partitions. Preserved sources and maps count toward the
64 MiB payload limit. Height is finite, positive and bounded to `1e100`;
unresolved relative aspect ratios, rank or face planarity are explicitly
diagnosed at the existing float64 tolerance.

`tests/test_products.py` compares every tesseract edge, ordered square and cube
boundary with an independent fixed-axis construction. Radical pentagram
fixtures verify signed cap/wall order and edge metrics. Hexagrams, source
translations, colors, numeric JSON equivalence, coincident disjoint cycles,
full partition ownership, strict refusals and actual resource boundaries are
also tested. These kernel checks do not establish application integration.

### Source generator and controller: awaiting main application integration

The development generator now accepts:

```python
generate('polygon-product',
         left={'symbol': '6/2', 'radius': 2},
         right={'symbol': '5/-3', 'radius': 1})
```

Both factor objects are required, and each must provide a literal `symbol` or
explicit integer `n` and optional `d`. Factors reuse the existing regular star
polygon generator, including its strict unreduced/signed semantics and default
unit radius. Mixing symbol and count parameters, unknown fields, missing
symbols/counts and unsupported sizes is diagnosed. Complete literal factor
models are retained; `provenance.generator` separately records the generator
kind and original parameter objects. This is generation provenance, rather
than a claim that a generator operation graph has been integrated.

`ui/product-controls.mjs` exports `ProductControls(context)` and inserts a
Polygon products disclosure after the Star polygon controls. First and second
polygon symbols remain literal strings; their radius fields are separately
evaluated numeric expressions. The default `5/2`-times-`3` product dispatches
through `context.generate({left, right})`. Prism from current polygon evaluates
its height and calls `context.commit('polygon-prism', {height}, label)`.
The context also supplies `guard`, `number`, `getState` and optional
`isExporting`. Main app instantiation, native prism dispatch, operation history
and desktop capabilities are coordinated separately.

Busy and export guards prevent construction callbacks during captured
animation; the prism action is enabled only for an active intrinsic 2D model
embedded in two coordinates. An active-model change during asynchronous height
evaluation cancels the prism callback. `tests/product-controls.test.mjs`
exercises the actual controller methods with isolated context stubs to verify
those guards, expression/symbol separation and callback parameters. It does
not replace an actual desktop interaction test.

`tests/test_product_generator.py` verifies native generation, numeric pairs,
signed/unreduced factor source incidence, strict parameter refusals, native
project validation and actual JSON-line server continuation after a rejected
digon request. No build or Electron launch establishes product UI qualification
at this stage.

## Primary definitions and subsequent construction work

Stella's [prism manual](https://mail.software3d.com/Manual/Prism.php) accepts
literal `n/d` bases with independently sized base edges/radius and height.
Its [antiprism manual](https://software3d.com/Manual/Antiprism.php) additionally
supports side-edge sizing. The [official 4D menu](https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro)
defines a duoprism from two polygon symbols and an antiduoprism as a 4D prism
over a 3D antiprism; it explicitly identifies `5/3` for crossed antiprisms.

The proposed next antiprism contract uses the original signed `d` in the upper
ring rotation `pi*d/n`, rather than the polygon's principal winding step.
Replacing `5/3` with principal step `-2` before choosing that rotation would
erase its crossed attachment. Triangle incidence and feasible equal-edge
height need independent tests before implementation. Signed input support is
our explicit extension, rather than a claim about Stella's published parser.

Step prisms are a separate construction. Robert Webb's
[original author-posted explanation](https://www.software3d.com/Forums/viewtopic.php?p=1676)
selects correlated duoprism vertices `(i,step*i mod n)` and defines their
convex hull; its dual is a gyrochoron. A hull in that explicitly defined family
is intentional. It must not replace literal star product incidence. Exact
competitor behavior for non-coprime or rational step-prism input remains to
be qualified.

Rational antiprisms, 3D-source prisms, antiduoprisms, stepped 4D families,
recoverable product components, filled-region measures and product generator
history remain separate requirements. This work does not claim full library
or construction parity.
