# Exact FCC ball selection and approximate Waterman hull

`engine.waterman` provides a headless 3D kernel. Current native integration exposes strict JSON generator kinds `waterman-fcc` (`radius_squared`, `center`) and `waterman-root` (`root`); it leaves the existing `generate('waterman', radiusSquared=...)` branch unchanged. The checks below qualify native behavior, not a visible desktop workflow.

```python
from fractions import Fraction
from engine.waterman import waterman_fcc, centered_waterman_root

model = waterman_fcc(10, center=(0, 0, 0))
tetrahedron = waterman_fcc('3/4', center=('1/2', '1/2', '1/2'))
same_standard_ball = centered_waterman_root(5)
```

Steve Waterman's [original definition](https://watermanpolyhedron.com/watermanpolyhedra1.html) uses the convex hull of cubic-close-packed sphere centers inside a closed ball. Paul Bourke's [coordinate construction](https://paulbourke.net/geometry/waterman/) uses integer lattice sites with even `x+y+z`; the standard centered author root `N` has radius `sqrt(2N)`. Consequently `centered_waterman_root(5)` means squared radius 10. It does not change the legacy `radiusSquared=10` parameter into root 10.

## Input and coordinate contract

`waterman_fcc(radius_squared=10, *, center=(0,0,0))` accepts a positive exact rational squared radius and exactly three rational center coordinates. Scalars may be actual Python integers, `Fraction` instances, literal signed integers or `p/q` strings with positive denominators, or strict JSON objects containing only integer `numerator` and positive integer `denominator`. For example `{'numerator':6,'denominator':8}` normalizes to `3/4` while its raw pair is retained as text in provenance. Fractions are reduced after the raw arithmetic bounds are checked.

Floats, booleans, decimal strings, arithmetic expressions and missing/extra ratio-object fields are refused. Use `'1/2'` for an exact half; an accepted `Fraction` denotes its actual rational value. Unknown keyword options, including colors, alternative lattices, scale and dimension, produce `GeometryError` rather than being ignored. The root wrapper accepts a positive actual integer and no configurable origin: its name denotes the standard sphere-center series.

The Python kernel accepts `Fraction`; the JSON generator accepts only JSON values, so a protocol caller must use integer/literal/ratio-object forms. The generator retains the original JSON parameter spelling in `provenance.generator.parameters`, separately from normalized exact parameters and raw selection evidence.

Coordinates remain in the original FCC lattice frame. Moving the ball center changes the selected sites; it does not recenter the output or change unit lattice spacing. Even-sum integer translations preserve the FCC frame. The kernel neither welds points nor substitutes a catalog identity.

## Exact selection and retained source IDs

The algorithm builds a conservative finite integer box using the exact ceiling of the radius and the rational center's floor/ceiling. Every site in this box is considered. Odd-sum sites are excluded. Let `D` be the common denominator of the center and `Ai` its scaled integer coordinates; a site is selected exactly when

```text
sum((site_i*D - Ai)^2) * radiusSquared.denominator
    <= radiusSquared.numerator * D^2
```

No float is used for membership or equality at the sphere. Selected site IDs follow lexicographic XYZ enumeration. Metadata retains every selected integer coordinate, exact squared-distance strings, boundary site IDs, bounding-box/inspection evidence and normalized rational input. The source manifest has a SHA-256 binding. An exact threshold immediately below a shell remains below it even if both values round to the same float.

The defining convex hull determines which selected sites are extreme. Metadata stores output vertex → selected site IDs, selected site → output vertex IDs or `None`, and all nonextreme selected IDs. Ordered output face cycles and complete current hull facets map back to their extreme selected IDs. These maps describe output boundaries; they do not falsely identify those extreme IDs with every selected lattice point lying in a facet's plane. Nonextreme points on facets or inside the hull remain in the manifest.

The `selectionCertificate` certifies complete **ball membership**, including closed-boundary inclusion and box exhaustion. It does not certify hull topology, support planes or measurements. The model retains `numeric.mode='float64-approximate'`, `numeric.certified=False`, supplied float64 hull supports and an approximate convex interpretation. It is not a `rational-exact` model and has no exhaustive exact hull certificate. Membership evidence cannot establish Stella sequence or 4D parity.

Evidence records the generated model ID and geometry fingerprint. The repository fingerprint includes literal coordinates/incidence, not metadata. Maps apply to that generated source; after editing geometry they are historical. The bounded manifest hash binds its exact parameters and site coordinates. Native project loading preserves this evidence, but does not independently rerun a saved membership certificate or make its hull exact.

## Bounds and native gates

Raw rational numerators/denominators are limited to 256 bits before reduction; literals are at most 256 characters. The center's common denominator is at most 512 bits. Bounding-box coordinates must lie within ±1,000,000. At most 1,000,000 box sites may be inspected, at most 20,000 FCC points selected and at most 4,000 hull vertices returned. Selection stops explicitly if the selected-point budget is exceeded. Full model/provenance JSON is limited to 64 MiB under native depth/value bounds. Counts and projection arithmetic are checked before coordinate enumeration.

At least four selected points and a resolved full-dimensional hull are required. Hull construction can reject a degenerate or numerically unresolved source. Returned content and surface area must be finite, positive normal float64 values. An actual detached native project roundtrip must preserve coordinates, ordered boundaries, model ID, metadata and provenance, and independently regenerate safe convex measures. Any failure rejects the operation atomically. Raw huge integers are bounded before float conversion, and native/hull arithmetic failures become structured `GeometryError` responses.

The hull is appropriate here because it is the family definition. This permission does not extend to replacing star, crossed or toroidal source incidence with a hull. The kernel makes no claim of exact/uniform certification, author sequence ordering, duplicate-shell skipping, Stella origin/method options, alternative packings or 4D Waterman construction. Those remain baseline gates in [CONSTRUCTION_BASELINE_NEXT.md](CONSTRUCTION_BASELINE_NEXT.md).

## Independent fixtures

`tests/test_waterman.py` checks hand-derived coordinate sets and support/edge metrics for standard root 1 (cuboctahedron: 12/24/14) and root 2 (octahedron: 6/12/8). Their selected manifest sizes are 13 and 19, including sites the hull omits. Other fixtures use center `(1,0,0)`, squared radius 1 for an octahedron; center `(1/2,1/2,1/2)`, radius squared `3/4` for a tetrahedron; center `(0,0,1/2)`, radius squared `5/4` for a square pyramid; and center `(1,0,0)`, radius squared 3 for a cube.

A separate fixed-box Fraction enumerator verifies full membership, distances and sphere boundary IDs without using the production scaled-integer predicate. The regression threshold `4−10^-40` selects the cuboctahedron; exact 4 selects the octahedron, despite both converting to float 4. Tests also cover literal maps, raw-input reduction, unchanged legacy semantics, native save/reopen, payload/arithmetic/site bounds, unsupported attributes, finite-measure gates and native source nonmutation. No visible process or dialog is needed.

`tests/test_waterman_workflow.py` exercises real strict generator dispatch, Analyze, native save/load, JSON geometry export and a hidden JSON-lines engine process recovering after malformed requests. Root 5 and root 10 happen to share topology counts in these fixtures while their thresholds and literal coordinates differ; identity is never inferred from counts alone. The integrated kernel/workflow batch passes 105 tests.
