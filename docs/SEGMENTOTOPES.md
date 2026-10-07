# Convex parallel-layer joins

`engine/segmentotopes.py` implements a bounded mathematical construction, independently of Stella's preset system. Development 0.14 integrates it as a native command with replayable history and compact UI controls; it is not yet qualified in a packaged release. CON-12 remains open, including benchmark crossed variants and the documented orientation and parameter domains.

## Definition and published baseline

The result is the **convex hull of two explicitly positioned convex sources in parallel 3D hyperplanes of 4D space**. Here a hull is the definition of the operation. It is never used to replace a star polygon's ordered source boundary or to invent a crossed join.

The [official Stella segmentotope chapter, §15.10](https://www.software3d.com/Manual/Segmentotopes.php) distinguishes the strict common-hypersphere/equal-edge family from a broader two-layer construction. Its top may be a polyhedron, polygon, edge or point. The chapter also documents edge matching, orientation qualifiers and a nonconvex crossed mode. Klitzing's primary [Convex Segmentochora, pp. 1–6](https://www.orchidpalms.com/polyhedra/segmentochora/artConvSeg_7.pdf) gives the strict defining conditions and prism/pyramid examples. These sources do not supply a verified incidence rule for every crossed or gyro option.

This implementation accepts an explicit signed height and rigid XYZ transformations. It supplies a separately scoped positive-height edge fit described below. It does not supply automatic orientation or size matching, preset identities, sequence navigation, lateral color settings, `gyro`, `gyro2`, `flip`, or crossed incidence. A reflection matrix is an explicit geometric input; it does not assert equivalence to Stella's `flip` qualifier. See [the construction baseline research](CONSTRUCTION_BASELINE_NEXT.md) for unresolved installed-baseline evidence.

## API

```python
from engine.segmentotopes import (
    point_source, edge_source, convex_layer_join,
    analyze_strict_segmentotope,
)

apex = point_source([0, 0, 0], source_id="apex")
result = convex_layer_join(cube_model, apex, height=0.5)
evidence = analyze_strict_segmentotope(result)
```

`convex_layer_join(base, top, height=1.0, *, base_matrix=None, base_translation=None, top_matrix=None, top_translation=None)` takes a full intrinsic 3D base Model. The top may be an intrinsic 3D Model, an intrinsic 2D polygon embedded in 2D or 3D, or a strict point/edge record. Model input declarations may be generalized; the complete ordered convex source boundary must independently pass `analyze_convex_boundary` before construction. A convex vertex set with crossed face cycles is rejected. Incomplete shells, duplicate/nonextreme source vertices, collinear boundary subdivisions and coplanar face subdivisions are outside this initial predicate domain.

For an embedded 3D polygon, the kernel verifies rank two and coplanarity, then projects a **detached predicate copy** onto an orthonormal intrinsic plane. The join uses the original XYZ coordinates, IDs, source snapshot and attributes. A 2D polygon's coordinates are embedded as `(x, y, 0)`. No coordinate recentering, size matching, rotation or welding is implicit.

Matrices are explicit orthogonal 3×3 transformations with determinant +1 or −1, checked to absolute residual `1e-10`. Transform order is `matrix @ point + translation`. Scaling and shear matrices are rejected. Source coordinates themselves may already express the desired sizes. The base receives fourth coordinate `−height/2`, the top `+height/2`. A negative nonzero height reverses their geometric positions while retaining the named base/top ownership. Height zero, numerically unresolved separation, booleans, nonfinite values and oversized integers are rejected as `GeometryError`.

`point_source(coordinates=(0,0,0), *, source_id=None, metadata=None)` and `edge_source(start, end, *, source_id=None, metadata=None)` create strict `polytope-layer-source`, version 1 records. They retain three-dimensional coordinates, a source ID, metadata and explicit incidence. These **are not native Models**: the current Model schema permits only dimensions 2–4. Do not open or validate a point/edge record as a project document. The records are retained as bounded JSON source evidence inside the resulting 4D Model. A strict record has precisely the helper's fields; an edge has exactly two distinct endpoints and the incidence `[0,1]`. Unknown record fields, malformed IDs/incidence and malformed source face/cell color tables are rejected.

The complete point/edge record passes the bounded finite UTF-8 JSON walker **before metadata is copied**. Invalid depth, cycles, nonplain objects, payload size and unpaired UTF-16 surrogates in IDs, keys or values reject as `GeometryError`; traversal Unicode, recursion and overflow exceptions receive the same structured error treatment. Valid Unicode metadata is detached without altering the caller. These guards cover the documented JSON source boundary; they do not claim every arbitrary Python object or downstream external failure is supported.

## Source preservation and attributes

`metadata.convexLayerJoin` retains:

- Complete unchanged source snapshots and SHA-256 digests, source Model IDs/fingerprints, independent source boundary evidence, and explicit transforms.
- All selected 4D coordinates, global input point IDs, input-to-output and output-to-input vertex maps, and output vertex ownership `(base/top, sourceVertexId)`.
- Per-layer source vertex/edge/ordered face maps and the corresponding 3D cap cell IDs. Cap membership must equal the entire selected source shell; point and edge tops have no invented cap cells.
- Explicit `nonextremeInputPointIds` and resource/attribute policy. In the accepted domain this table is empty: every vertex of a convex source in an exposed layer must be an extreme point of the join. Any numerical hull dropping a selected vertex is rejected atomically, rather than silently changing the selected source.

Matched original source faces inherit their exact validated RGB/RGBA records, including byte/unit encoding and alpha. Lateral faces and output cells are explicitly uncolored; all original attributes remain in the source snapshots. There is no inferred color averaging or propagation from a shell face to a lateral cell. Unknown color or other construction options are rejected. The two layers are historical factors of one connected 4D solid, not disjoint full-dimensional components; no fabricated compound component schema is attached.

The defining hull is float64 approximate, with ordinary validated convex interpretation. Its source point order is retained through explicit maps, and every returned coordinate must exactly match its transformed selected coordinate. The result passes positive finite **normal float64** content and boundary-measure gates, plus a detached actual native project validation roundtrip. The roundtrip must preserve canonical geometry, identity, metadata and provenance. Extremely large/small geometries that overflow or underflow the existing native measure path reject atomically. Source snapshots, their metadata and the callers' Models are never mutated.

## Separate strict predicates

`analyze_strict_segmentotope(model, tolerance=1e-8)` is read-only and returns `passed`, `not-strict`, `unsupported` or `invalid`, with the actual source Model ID/fingerprint. It requires an independently verified complete ordered convex 4D boundary and checks:

1. Two distinct parallel layer levels in the explicit fourth coordinate, at normalized tolerance.
2. Equal lengths of every actual source edge, with a relative residual.
3. A common 4D hypersphere, from a rank-four least-squares center fit and relative radial residual.
4. Each **ordered** polygon face's equal consecutive side lengths, equal turning angles `cos(2π/n)`, and equal distances from the face centroid.

Sphere centers, radii, layer levels and residuals are reported in a stated normalized coordinate frame. This does not search for an alternate layer partition after a general rotation of 4D space. The tolerance must be in `1e-12…1e-4`. All evidence remains **approximate and uncertified**, including a passed result; it is not an exact or uniformity proof. A broader unequal-sized valid convex join may fail these predicates without invalidating its ordinary convex boundary.

## Bounds and independent validation

The combined input is limited to **64 selected vertices**, corresponding to the independently qualified 4D reference frontier. Source and result JSON use the existing depth/value bounds and a 64 MiB payload budget. Finite coordinates and translation components are bounded to `1e100`, with bounds tested before converting huge Python integers to floats. Rank, source incidence, full cap membership and native finite measures remain additional limits. Larger boundaries and automatic extension of that frontier require separate work; these are local engineering limits, not claimed Stella limits.

`tests/test_segmentotopes.py` covers independent coordinate/edge/cycle/cell references:

| Construction | Coordinates and sizing | V/E/F/C | Independent evidence |
| --- | --- | --- | --- |
| Cube + aligned cube | XYZ `±1`, fourth-coordinate layers `±1` | 16/32/24/8 | Every tesseract edge, ordered square face and complete cell face set; content 16, boundary 64 |
| Unit tetrahedron + point | Tetrahedron parity coordinates `±1/(2√2)`, separation `√(5/8)` | 5/10/10/5 | Complete simplex incidence; every edge 1; content `√5/96`, boundary `5√2/12`, circumradius `√(2/5)` |
| Unit cube + point | Cube XYZ `±1/2`, centered apex separation `1/2` | 9/20/18/7 | Base squares, all edge-to-apex triangles, full pyramid cell shells; every edge 1, content `1/8` |

Tests also cover point/edge/polygon tops, an oblique planar polygon, negative height, rigid rotation/reflection, source RGBA and native save/reopen, unequal-sized non-strict joins, equal-sided nonregular rhombic faces, source immutability, star/bow-tie refusal, malformed strict records, source depth/color bounds, the 64-vertex cap, unresolved rank, scale overflow/underflow, and atomic native persistence failures. Guard tests verify rejection before copying for deep/cyclic/oversized metadata, nonplain objects, invalid UTF-8 IDs/keys/values, and structured traversal exceptions; valid Unicode detachment and subnormal height/edge refusal are also covered. These tests qualify this construction domain; they do not close CON-12 or the original 73-requirement baseline.

## Development workflow integration

Native command `convex-layer-join`, algorithm0.1.0, takes the current base Model
and the kernel options above. `params.top` may retain a complete native Model or
strict point/edge source record. Compact point/edge forms require a stable
`source_id` alongside `kind` and `coordinates` (point), or `start`/`end` (edge).
This ID is retained in recipe parameters so replay does not invent new historical
source identities. Unknown fields, non-JSON data and unsupported algorithm
versions reject atomically. Parameters can be branched in the history editor.

The collapsed Parallel layer join (4D) controls select a current copy, one of nine
model memories, a point or an edge. They expose signed height, literal orthogonal
XYZ matrix and translation. Complete source attributes are detached and checked
through numeric awaits; native publication retains workspace/history/export
ownership checks. The separate read-only `analyze-strict-segmentotope` command
accepts only an optional tolerance and returns scoped approximate predicates.
No installed Stella crossed/gyro or automatic matching equivalence is claimed.


## Positive-height edge fitting

`engine/strict_layer_fit.py` and native/history command `fit-strict-layer-join`
(version0.1.0) solve height from explicitly positioned source layers. The compact
UI checkbox Match edges (positive height) disables and ignores manual height.
Transport refuses a supplied height, undocumented fitting options and tolerance
changes. All XYZ rotations, translations and source sizes remain explicit inputs.

A positive W scaling preserves the convex join incidence. For every actual
lateral edge, squared length is squared XYZ distance plus squared separation.
The solver therefore first constructs a bounded trial join at one base-edge
length, checks that every source-layer edge has that same length, and checks
that every lateral XYZ distance agrees. It solves
height=edgeLength*sqrt(1-(lateralXYZ/edgeLength)^2), using a factored difference,
then constructs the result and independently checks all four strict predicates.
Unequal source edges, varying lateral distances, unresolved positive separation
or a failed common sphere/ordered regular face predicate reject atomically.
There is no guessed gyro/flip, rescaling or nonconvex Hull replacement.

The model retains resolved height, target edge, numerical residuals and complete
source-bound strict evidence with certified=false. Cube/copy fixtures at four
scales resolve height=edge; a centered point over a cube resolves edge/2; a
regular tetrahedron-to-center-point resolves edge*sqrt(5/8). Independent incidence,
edge lengths and 4D contents, actual persistence, recipe replay and parameter
branches are tested. 22 solver/workflow tests pass, plus154 combined native layer
tests. This is numerical fitting for the published strict predicates, not uniformity
or installed Stella automatic-matching equivalence.

The read-only Strict predicates button reports W-aligned layer, equal-edge,
common-hypersphere and ordered-face residuals at float64 tolerance1e-8. It binds
results to the current full model/source ID/fingerprint and discards stale results.
Camera/rotation and note changes do not change that geometric source. It issues
no exact certificate and requires at most64 input vertices.
