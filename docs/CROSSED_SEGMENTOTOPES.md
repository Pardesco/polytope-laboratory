# Derived crossed antiprism interval layers

Research and implementation date: 2026-10-04. `engine/crossed_segmentotopes.py` supplies an explicit nonconvex construction with ordered incidence. It is isolated from native dispatch, generator menus and history integration in this change. **CON-12 remains open**: this family does not establish Stella's crossed-checkbox rule, all benchmark variants, presets, or orientation domains. It complements the bounded convex layer join rather than replacing the original requirement.

## Published evidence and remaining baseline gap

The [official segmentotope chapter, §15.10](https://www.software3d.com/Manual/Segmentotopes.php) permits broad unequal-sized joins of convex polyhedral layers; a top may also be lower-dimensional. It describes crossed lateral connections across opposite sides, analogous to crossed antiprisms, but supplies no vertex permutation or ordered cell table. Its `gyro`, `gyro2`, and `flip` names explicitly differ from Klitzing's qualifiers. Automatic orientation, sizing and preset ordering are not specified mathematically there.

The [official 4D menu, §15.9](https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro) identifies an antiduoprism as an antiprism's 4D prism and explicitly names retrograde `5/3` for crossed antiprisms. The [antiprism sizing chapter, §8.8 in the combined manual](https://www.software3d.com/Manual/Glimpse4D.php?prod=Great) distinguishes base radius/edge from side edge/height choices. These establish a construction family, not its equivalence to the segmentotope checkbox.

Klitzing's primary [Convex Segmentochora, pp. 1–7](https://www.orchidpalms.com/polyhedra/segmentochora/artConvSeg_7.pdf) restricts its enumeration to convex cases and uses case-specific axial symmetry/orientation relationships. Its definitions and naming discussion cannot supply an undocumented nonconvex gluing permutation. His current [segmentotope exposition](https://bendwavy.org/klitzing/explain/segmentochora.htm) relates the family to lace prisms and retroprisms. Neither source justifies treating one global rotation as every Stella qualifier.

| Option | Verified published description | Missing installed-baseline evidence |
| --- | --- | --- |
| Crossed | Opposite-side lateral connections; nonconvex result | Exact vertex/ridge/cell correspondence for identical and different caps |
| Gyro / Gyro 2 | Alternative relative orientations | Axes, angles, composition order, dependency on selected polyhedra |
| Flip | Another orientation qualifier | Which reflection, axis/frame and interaction with gyro flags |
| Matching / original sizes | Alternative sizing choices | Edge class for irregular sources, automatic height/domain and degeneracy handling |
| Presets and arrows | Strict-example selection/navigation | Complete inventory, order, saved symbols and settings |

No installed application, browser UI or dialog was launched for this work. The remaining capture package should contain the named preset or full factor files; original and final vertex IDs/coordinates; ordered faces and cell memberships; all flag states; resolved sizes, height and matrices; version; and hashes. Test at least cube/cube, tetrahedron/tetrahedron, an unequal pair and a lower-dimensional top under all eight combinations of the three orientation flags, followed by crossed toggles. For the square benchmark below, identify whether Stella chooses the same 45-degree relative cap phase and far-side triangle attachments. Matching counts or pictures is insufficient.

## Derived definition and API

```python
from engine.crossed_segmentotopes import crossed_antiprism_segmentotope

model = crossed_antiprism_segmentotope(
    "4/3", radius=1, height=1, depth=2**0.5,
)
```

`crossed_antiprism_segmentotope(symbol='4/3', *, radius=None, base_edge=None, height=None, side_edge=None, depth=1.0, orientation=None, cap_colors=None)` composes the existing **literal** rational antiprism and direct closed-shell interval prism, then changes the coordinate frame from `(x,y,z,t)` to `(x,y,t,z)`. Every edge, ordered face and cell membership remains its actual source incidence. This reveals parallel polyhedral layers along the antiprism axis; it does not produce a hull and then relabel its boundary as crossed.

For an unreduced signed symbol `n/d`, let `uᵢ=(r cos(2πi/n),r sin(2πi/n))`, `j=i+d mod n`, and `θ=πd/n` **without reducing or principalizing the raw step**. The antiprism has lower vertices `Bᵢ=(uᵢ,−h/2)` and upper vertices `Tᵢ=(Rot(θ)uᵢ,+h/2)`. Its source cycles step by `d`; connecting triangles are `(Bᵢ,Bⱼ,Tᵢ)` and `(Tᵢ,Bⱼ,Tⱼ)`. An independent interval has endpoints `t=±depth/2`. The output vertices are `(x,y,t,z)`, retaining factor and interval endpoint IDs.

With `g=gcd(n,|d|)`, the literal antiprism has `2n / 4n / (2n+2g)` vertices/edges/faces. Its interval product has:

| Kind | Count |
| --- | --- |
| Vertices | `4n` |
| Edges | `10n` |
| Ordered faces | `8n+4g` |
| Cells | `2n+4g` |

The cells split into `2g` layer-cap polygon prisms, `2g` crossed-antiprism lateral cells at interval endpoints, and `2n` triangular-prism lateral cells. The layer caps are polygon-cycle × interval. Each triangle × interval is bounded by two triangle copies and three edge-wall quads. Each antiprism endpoint cell retains its entire original face shell. Every ridge belongs to exactly two cells, and every cell edge to two of that cell's faces; the constructor checks both incidence conditions and native validation.

This is a derived embedding of a literal generalized incidence structure. Crossings do not create new intersection vertices, faces are not convexified, no welding occurs, and no filled interior or volume is inferred.

## Parameter and orientation domain

The raw retrograde condition is `n/2 < |d| < n`; ordinary and digonal steps are rejected. Signed steps remain signed, and disconnected symbols remain unreduced. For example `6/4` retains two three-vertex cycles, not one reduced `3/2` source. All original literal text is retained in the family evidence, while the factor snapshot retains its parsed pair and full source polygon history.

Size choices follow the explicit local antiprism contract:

- Specify **radius or base-edge length**, not both; default radius is 1.
- Specify **height or side-edge length**, not both. The horizontal connecting chord is `2r|sin(πd/(2n))|`; a requested side edge must resolvably exceed it.
- With neither height nor side specified, the equilateral-triangle default is available only when `|d| < 2n/3`. The exact integer test rejects flat/impossible cases; `4/3` therefore needs explicit height or feasible side length. `5/3` has a real positive equal-triangle default.
- `depth` is a separate positive interval length. It is not the separation between the selected parallel layers: that separation is the antiprism height.
- `orientation` is an optional common orthogonal 3×3 XYZ matrix applied after transposition, with determinant +1 or −1. It rotates/reflects both layer caps together and leaves the fourth coordinate unchanged. It is not a relative gyro/flip option; unknown options reject.

For `|d|=n−1`, both complete connected layer caps are ordinary convex polygon prisms. In other cases a cap may be a literal star prism or a collection of separate prism caps. A disconnected symbol can have individually convex caps while the complete selected layer is a compound: evidence distinguishes `convexCaps` from `singleConvexLayer`. Such star/compound cases are mathematical members of this interval family, **not** evidence that Stella's convex-cap segmentotope dialog accepts them.

Inputs are finite and bounded before float conversion; booleans, huge integers, unsafe scales and relative rank/planarity failures reject as `GeometryError`. The initial output bound is 4,000 vertices (`4n<=4,000`), with inherited incidence/face/component bounds and 64 MiB JSON depth/value/payload checks. The complete parameter/color JSON passes the bounded UTF-8 guard before existing source constructors can copy colors. These limits belong to this derived implementation, not the 64-input-vertex convex join or the competitor's unspecified domain.

## Independent square benchmark

For `4/3`, radius 1 and height 1, the lower XY ring is `(1,0),(0,1),(−1,0),(0,−1)`. The upper ring, with raw rotation `3π/4`, is `(-a,a),(-a,-a),(a,-a),(a,a)` for `a=1/√2`. The source cap cycles traverse ordinary squares in reverse; lateral triangles attach to far-side vertices. With depth `√2`, both fixed-fourth-coordinate caps are literal cubes of edge length `√2`, rotated relative to one another by 45 degrees geometrically.

The full result is `16/40/36/12`: two cube layer caps, eight triangular-prism lateral cells, and two **nonconvex crossed square-antiprism** lateral cells. Independent tests transcribe all factor vertices and faces and derive the entire expected edge, ordered face and cell sets. The two cube caps pass independent complete convex-boundary verification. Each crossed lateral cell fails that verification, and an explicit triangle's plane has other cell vertices strictly on both sides. Thus these are genuine nonconvex incidence cells, rather than a convex join with a changed label. Reference hulls are used only by those read-only independent tests, never by this constructor or its native gate.

## Ownership, attributes and persistence

`metadata.crossedAntiprismSegmentotope` retains the complete source antiprism Model, its fingerprint and bounded-JSON SHA-256, raw symbol/phase/resolved parameters, axis ownership and common matrix, every current incidence-to-source map, source-to-copy maps, current layer/cell roles, and actual final Model ID/fingerprint binding. The full factor snapshot retains its original ordered polygon cycles and genuine historical polygon component IDs.

Disconnected partitions are explicitly **metadata-only** current incidence partitions. Their `historicalSourceComponentIds` refer to genuine leaves in the retained polygon snapshot; they are not fabricated current 4D Keep/Delete component IDs. A future component adapter must create actual current 4D leaves before enabling those operations.

Per-cycle validated RGB/RGBA colors are retained in the factor's cap polygons and both interval endpoint face copies. Connecting triangles, edge-wall faces and every output cell remain explicitly uncolored under the inherited policy. There is no lateral color averaging or inferred cell-alpha policy. Input color arrays remain unchanged.

Every result remains `generalized-complex`, float64 approximate and uncertified. A detached actual native project roundtrip must preserve canonical geometry, identity, all metadata/provenance and absence of a solid measure. No native operation, recipe replay or UI integration is claimed here. `tests/test_crossed_segmentotopes.py` covers the full independent square boundary; genuine convex/nonconvex cell distinction; raw signed phases and unreduced disconnected cycles; historical IDs and incidence ownership; all four explicit sizing modes; rigid reflection; RGBA native save/reopen; no Hull calls; finite/resource/rank guards; proportionate small/large scales; and native refusal of fabricated volume.

The next integration is an explicitly named derived-family generator with these parameters and scope, followed by a genuine current-leaf adapter and replay/undo tests. Full CON-12 additionally requires installed orientation/preset crosswalks, arbitrary unequal convex cap pairs, automatic matching/height domains, lateral color/alpha behavior, and independently verified crossed benchmark incidence. The latter cannot be inferred merely from this product family.
