# Explicit face pairing and coplanar blending

The new `engine.face_blending` module implements separate requested operations.
Compound addition does not invoke them. It does not infer a solid interior,
Boolean union, hull, inaccessible-cell filling or arbitrary star-face union.

The official Memories manual describes forming a compound before offering
coincident-face removal in pairs and coplanar blending. The Blend manual requires
coplanar faces sharing an edge; disabling its prompt leaves geometry unchanged.
The Part of Compound manual defines parts through face-to-face edge connectivity.
Historical component identity alone therefore does not prove that the result
after welding or editing has the same connected parts.
[Memories](https://software3d.com/Manual/Memories.php),
[Blending Coplanar Faces](https://www.software3d.com/Manual/Blend.php?prod=Stella4DPro),
[Keep/Delete Part of Compound](https://software3d.com/Manual/PartOfCompound.php).

## Public API

```python
analyze_coincidences(source, tolerance=0)
remove_coincident_pairs(source, tolerance=0, *, weld=False)
blend_faces(source, face_ids, tolerance=0, *, weld=False,
            color_policy='require-equal')
```

Every source receives fresh bounded incidence validation. Source Models remain
unchanged. Editing returns a new validated `generalized-complex` Model in the
same intrinsic and embedding dimensions; analysis returns read-only evidence.
Dimensions 2, 3 and 4, including compatible higher-dimensional embeddings, are
supported within the domain below.

## Coincidence means the same coordinate cycle

`analyze_coincidences` compares the ordered boundary adjacency at supplied
coordinates, allowing cyclic rotations and reversal. It does not sort a face's
vertex set and call every order equivalent: an ordinary pentagon and a pentagram
on the same five points remain different cycles. Different source vertex IDs at
exactly equal coordinates can nevertheless identify coincident faces.

The evidence has schema version 1, `sourceModelId`, recomputed `sourceFingerprint`,
`faceKeys`, `groups`, flattened `pairs`, `unpairedFaceIds`, and `welding`.
Each group records its `faceIds`, canonical coordinate-cycle key, deterministic
pairs, and any final unmatched face. Pairing uses ascending source face IDs.
Three equivalent faces remove the first two and leave the third, including its
source winding and RGBA. `unpairedFaceIds` refers to odd coincidence groups;
ordinary unique faces remain untouched too.

`remove_coincident_pairs` removes those pairs, rather than deleting every face
in a coincidence group. With `weld=False`, all source vertices and edges are
retained literally, including wires or vertices left without face incidence.
It remaps surviving cell boundaries; empty cells are explicitly removed with a
null source-cell map entry. A surviving cell that loses its required affine
dimension fails validation. Generalized nonmanifold/open-cell warnings remain
visible; removal is not a solid reconstruction certificate.

## Explicit coordinate welding

The default tolerance is zero: analysis identifies exact coordinate equality,
and no actual coordinate welding is applied unless `weld=True` is supplied to
the requested editing operation. Positive tolerance is an absolute Euclidean
distance in supplied source-coordinate units, not a display-space epsilon.

Welding deterministically uses the first retained source coordinate within
tolerance. It never averages coordinates or transitively merges a chain through
vertices already welded. It applies globally, including unselected geometry,
so all affected source vertex and edge IDs are recorded. Duplicate mapped edges
share one retained edge; collapsed mapped wire edges receive null map entries.
A collapsed face boundary rejects the operation. Every representative retains
its original literal source coordinate.

Analysis exposes the candidate `vertexMap` and `representativeSourceVertices`
with `applied=false`. Removal with positive tolerance and `weld=False` requests
approximate pairing but still retains literal source coordinates. Blending uses
actual shared source IDs; positive tolerance alone does not weld them. Adjacent
faces added from independent compound components require explicit `weld=True`
before their coincident endpoints become shared incidence.

## Blending domain and boundary reconstruction

`blend_faces` accepts 2–512 distinct selected face IDs, with at most 4,096 selected
corners. Selection order is normalized to ascending source IDs. All selected
faces must lie in one resolved plane. Simple concave input polygons and concave
output boundaries are supported; star/self-intersecting and degenerate polygons
are diagnosed. Polygon interiors must be disjoint and shared segments conforming
whole source edges. Crossing, containment, overlaps, T-junctions requiring edge
subdivision, and vertex-only branching receive explicit diagnostics.

The operation orients selected polygons consistently in a numerical plane,
cancels shared internal segments, and walks the remaining directed boundary
cycles. It does not calculate a convex hull or sort boundary vertices around a
centroid. Collinear boundary vertices remain. Multiple disconnected outer cycles
produce separate faces with separate source groups. A nested/inner boundary is
a hole, which the existing single-cycle face schema cannot preserve; the whole
operation is rejected rather than returning a filled outer polygon.

It verifies boundary area against the sum of disjoint selected polygon areas.
Planar predicates use epsilon `1e-10` after normalizing the selected coordinate
span; that approximation is recorded separately from coordinate-welding
tolerance. Source and output normalized areas and coordinate scale are recorded
as diagnostic evidence, not as a model volume.

Internal edges are removed only when absent from all resulting face boundaries;
other source edges and all retained source vertices survive. Selected 4D faces
can blend only when all contributing faces have identical source-cell
membership. This avoids assigning a larger merged ridge to a cell that
originally contained only one contributor. Other cell-reconstruction cases are
diagnosed. Successful output undergoes the existing incidence validator too.

## Attributes and source maps

The default `color_policy='require-equal'` preserves a common literal OFF RGB or
RGBA record, and rejects contributing faces with different records, including
different encodings. `color_policy='first-source'` explicitly chooses the color
of the lowest contributing source face ID. It does not average colors or lose
alpha. Unselected face colors and retained cell colors follow their new IDs.

`metadata.faceEditing` contains:

- `sourceModel`: a full independent historical source snapshot, including its
  metadata, component records, coordinates, incidence, colors and provenance.
- `sourceMaps.vertices`: each source vertex's output vertex ID.
- `sourceMaps.edges`: each source edge's output ID, or null when removed.
- `sourceMaps.faces`: each source face's list of output face IDs; removed pairs
  map to empty lists, and merged contributors map to the same resulting face.
- `sourceMaps.cells`: each source cell's output ID, or null for an empty cell.
- `faceSources`: inverse output-face to contributing-source-face lists.
- `evidence`: explicit tolerance/weld policy, pairing or boundary/group evidence,
  and resource/predicate diagnostics.

Output `metadata.offColors` is a correctly indexed face/cell table. Arbitrary
original DXF/CAD attributes remain in the historical source snapshot; this
kernel does not guess how to merge independent layer or image tables.
Output provenance identifies the operation, version, source ID, recomputed
geometry fingerprint, tolerance, coordinate-weld and color policies. Source
component partitions and convexity/measure certificates are not reassigned to
the changed global topology. No output compound-part identity is asserted merely
from its pre-edit source component IDs.

## Bounds and independent evidence

The existing compound source bounds apply: 20,000 vertices, 100,000
edges/faces/cells each, 1,000,000 total coordinate/incidence entries, 2,048 corners
per face, 1,024 declared components and 64 MiB JSON including history. Coordinates
and welding tolerance are finite and bounded by `1e100`. Welding and segment
intersection checks have separate 1,000,000 comparison budgets. Selected-corner
and output-face bounds are enforced before returning any result. Exhaustion
rejects without truncation or partial geometry.

Run `python -m pytest tests/test_face_blending.py -q`. The current 37 passing tests
use independent fixtures to verify
six pairs from coincident double cubes (12 source faces), triple preservation,
cycle adjacency, near/exact coordinate policies, two unit squares with area 2,
a three-square concave L with area 3 and analytic point membership, disconnected
rectangle regions, a six-quad annulus whose hole is rejected, opposite winding,
RGBA policies, source immutability and maps, 4D cell membership/remapping,
nonplanar/shared-vertex/overlap/star diagnostics, and resource limits.

## Actual desktop integration evidence

The Operations inspector now exposes **Face editing** with tolerance, an explicit
coordinate-weld checkbox, Inspect pairs, Remove pairs, selected source face IDs
and the two color policies. Inspection leaves the current model unchanged.
Removal and blending commit native construction-history nodes; Undo/Redo,
Replay and native project persistence use the same validated source geometry.

`node scripts/face-editing-smoke.cjs` passed five scenario groups against the
development 0.11.0 desktop build in 29.11 seconds with zero page errors. It used
a private profile, actual buttons and native project saves rather than reading
application model globals. The test verified:

- Memories-created double cubes: 16 vertices, 24 edges and 12 faces; six inspected
  pairs; explicit removal leaves all 16 vertices/24 source edges and zero faces.
  Stored memory geometry, Undo/Redo and independently opened Replay remained valid.
- A triple colored cube leaves six original RGBA faces after pair removal.
- Two independently indexed adjacent quads require the requested coordinate weld.
  Their eight source vertices map to six retained vertices and one six-corner
  rectangle with six boundary edges and independently measured area 2. The result
  keeps collinear source corners, source maps, alpha, Replay and native persistence.
- Different source colors are rejected until the user explicitly selects
  first-source policy. A six-quad ring receives a hole diagnostic and remains six
  unchanged source faces, with its visible opening preserved.
- Fixture bytes and source memories remain unchanged throughout. Component
  Keep/Delete, current coordinates and remaining component IDs also survive
  native save/reopen and recorded replay.

The run saved 24 semantic native snapshots and four screenshots in
[`artifacts/face-editing-smoke-P6EnZx/result.json`](../artifacts/face-editing-smoke-P6EnZx/result.json).
The script supports `POLYTOPE_TEST_ARTIFACTS` for private output namespaces and
`POLYTOPE_TEST_EXECUTABLE` for a future packaged run, where development Python is
made unavailable to the app. The evidence above is a development-build result;
it does not claim a packaged run of these commands.

These bounded operations do not close complete `CON-06`/`DOC-02` release gates
for arbitrary stellated faces, holes, inaccessible regions, image/material
attribute blending, independent CAD segment subdivision or solid union semantics.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/faces/face-editing-packaged-smoke-XM5bHg/result.json](../artifacts/desktop-qualification-E5RVgf/faces/face-editing-packaged-smoke-XM5bHg/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
