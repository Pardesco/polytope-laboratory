# Star surfaces and generalized sections

Generalized imported models and generated Kepler–Poinsot references can display
winding-filled planar faces. The renderer fills each supplied ordered face
cycle independently. This is a surface convention; it assigns no enclosed
solid, volume, density, interior/outside classification, or certification to
the complete model.

## Display controls

**Face fill** selects **Nonzero winding** or **Even / odd**. Nonzero fills
points whose signed winding number is nonzero; even/odd fills points with odd
winding number. A pentagram's central pentagon has winding magnitude two, so
nonzero fills it and even/odd leaves a hole. Changing opacity or choosing
source, face, or cell colors changes presentation buffers only.

For a model with source cells, **Isolate**, **Hide**, and **Show all** retain the
original cell and face IDs. A face shared by multiple cells remains visible
while at least one of its owners is visible. Isolation triangulates the
selected faces independently of the full-view triangle budget, so a late cell
can still display its complete supported faces after a dense full view reaches
its cap. Source coordinates, ordered face cycles, edges, and cell incidence
remain unchanged.

## Face filling algorithm and API

`ui/face-fill.mjs` exports:

```js
buildFaceSurfaces(model, 'nonzero');
buildFaceSurfaces(model, 'even-odd', { faceIds: [sourceFaceId] });
```

It returns intrinsic-coordinate triangles with `face` equal to the source
face ID, `diagnostics`, `filledFaces`, `suppressedFaces`, `consideredFaces`, and
`sourceFaces`. Omitted faces in a requested subset are not unsupported faces.
Convex polygons use a fan and retain `vertices` source IDs. Generalized cycles
use an intrinsic planar frame, split into slabs at vertices and segment
crossings, and triangulate the intervals selected by the winding rule.
Generated crossing points exist only in display triangles; they do not become
vertices in the source model. A convex hull never replaces a source cycle.

Concave polygons, pentagrams, bow ties, and coincident-coordinate source IDs
are covered by fixtures. For example, tracing a square twice with distinct
source IDs fills the square once under nonzero and fills nothing under
even/odd. The convex fast path checks complete supporting half-planes and
coincident coordinates; same-sign local turns alone cannot distinguish a
pentagram from a convex polygon.

Faces must span a finite planar 2-flat in the supported model coordinates.
Invalid IDs, repeated vertex IDs, nonplanar and collapsed faces receive a
per-face diagnostic. Numerical predicates use normalized float64 coordinates
and approximate tolerance; no exact or certified arrangement is asserted.

The limits are 512 vertices per face, 8,192 slab cuts per face, and 250,000
triangles per requested model view. Unsupported or over-budget faces remain
available as source wireframes, and their suppressed-face count is reported.
The whole-view cap can suppress later faces while still allowing their
individual inspection.

## Generalized surface intersections

`engine.operations.section(model, normal=None, offset=0,
fill_rule='nonzero')` dispatches `generalized-complex` sources to
`engine/generalized_sections.py`. Existing convex solid sections and declared
convex-region union sections retain their established contracts.

For generalized sources, the operation intersects each winding-filled source
2-face with the requested hyperplane. A 3D source produces curves in an
intrinsic 2D plane; a 4D source produces curves in an intrinsic 3D hyperplane.
Coplanar source faces retain their ordered cycles. Loose source edges,
coplanar boundary edges, and tangent points are retained as boundary strata.
The intersection may contain disconnected components, holes, open curves,
or isolated points. The operation does not close these curves with inferred
faces or reconstruct filled source 3-cells. Thus an ordinary-looking closed
curve in this mode still carries surface-intersection semantics.

Nonempty results use `status: 'surface-intersection'`, a displayable model with
`interpretation: 'surface-section'`, and
`metadata.fillSemantics: 'source-face-intersection'`. Result and metadata
include `sourceReferences`, `edgeSourceReferences`, `faceSourceReferences`,
`diagnostics`, and the chosen fill rule. Source edge parameters follow the
stored source edge's endpoint orientation. In 4D, segment references include
the source face and its source cell owners. The normal, offset, origin, and
basis provide a reversible embedding back into source coordinates.
Coincident output coordinates may be merged for display while all contributing
source references are retained. The source model itself stays intact.

An empty intersection has `status: 'empty'` and no model. An isolated tangent
point remains a valid surface-section model with no edges. Coplanar faces
whose projected vertices collapse to coincident IDs receive a diagnostic;
their boundary intersections are retained. No filled-solid content or measure
is attached to a generalized surface intersection.

The generalized section limits are 500,000 source face incidences, 100,000
source edges, 512 vertices for each filled source-face interval computation,
20,000 generated vertices, and 100,000 generated edges. Exceeding a total
source/output limit fails explicitly. An oversized individual face gets a
diagnostic while its boundary intersections remain available. These limits
bound numerical work; they are not a guarantee of an interactive frame rate
for every input.

## Verification

```powershell
node scripts/face-fill-test.mjs
node scripts/face-fill-cap-test.mjs
python -m pytest tests/test_generalized_sections.py -q
```

The independent face fixtures compare pentagram fill areas against analytic
inner-pentagon and star-outline areas, and cover reversed winding, concavity,
crossings, source preservation, coincident-coordinate cycles, 4D embedding,
scale covariance, resource diagnostics, and selection IDs. The cap fixture
checks recovery of a late isolated face that the full view suppresses.

Section fixtures independently check a concave U's two disjoint intervals,
the analytic pentagram center-hole length, coplanar star cycle preservation,
source-oriented edge parameters, tangent/empty cases, disconnected source
components, 4D source cell references, all four named Kepler–Poinsot stars,
source-coordinate and normal-scale covariance, and unchanged convex results.

The optional `scripts/face-fill-benchmark.mjs` extracts display cycles from an
already audited OFF source and records a display-only benchmark. The largest
Cat28 source, `1503 - Sudspeshax.off`, has 7,200 vertices and 123,600 faces. The
local run in `artifacts/dense-face-fill-benchmark.json` reached the explicit
250,000-triangle cap in about 1.2 seconds per fill rule and diagnosed the
remaining faces. Isolating source face 123,599 produced its two triangles with
no suppression. These timings are machine-specific and exclude engine import,
renderer setup, and frame rendering; they are not mathematical certification.

After building the renderer, `node scripts/star-desktop-smoke.cjs` runs an
isolated Electron profile. It checks filled and wireframe GPU pixels for all
four named stars, visible parity-rule changes, rule-controlled source-face
sections, coplanar-face promotion and native save/reload, source cell visibility
and source color buffers, and unchanged source incidence. The development
run passed 15 workflow checks with no renderer exceptions, including supported
face/evidence defaults for promoted surfaces and curves; its report and
screenshots are in `artifacts/star-desktop-smoke.json` and
`artifacts/workspace-star-*.png`. Setting `POLYTOPE_TEST_EXECUTABLE` selects an
unpacked packaged application for the same regression. The 0.9.0 Windows
unpacked application also passed all 15 checks with no renderer exceptions and
development Python deliberately unavailable, exercising the bundled engine.
That result is recorded in `artifacts/star-packaged-smoke.json`; it does not
replace clean-machine or actual portable-wrapper qualification.
