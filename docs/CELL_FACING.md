# Observer-facing 4D cells

The [official 4D menu](https://www.software3d.com/Manual/Menu4D.php)
describes omitting cells facing toward or away from the 4D observer. It identifies
convex polytopes as the natural domain and describes front-cell removal under
strong perspective as a way to expose a Schlegel diagram. This concerns the
4D-to-3D observation, independently of the later 3D camera and its depth buffer.
The manual does not specify a numerical grazing band or a generalized-cell
orientation certificate. The explicit contract below is this application's
convention. Installed Stella 6.0 comparison and complete VIEW-04 behavior remain
separate conformance work.

## Native API and supported domain

```python
from engine.cell_facing import classify_cells

result = classify_cells(model, projection='perspective', matrix=display_matrix)
```

`model` must declare `interpretation='convex-polytope'`, intrinsic and embedding
dimension four, complete valid source incidence and full affine coordinate rank
four. Each source cell must span a rank-3 hyperplane. The module derives unit
normals from that cell's source vertices and verifies its outward support
against every source vertex; every source vertex on the supporting hyperplane
must appear in the cell. Supplied cached normals or facet tables do not replace
these checks. No hull is substituted for source incidence.

Generalized complexes, star cells, compounds, filled unions and other
interpretations are explicitly unsupported. Their cells need separately
defined source orientation and any solid/interior semantics before front/back
classification can be assigned. Applying a radial sign to a star cell would
not establish outward solid orientation. Manual source-cell hiding/isolation
remains useful independently of this classifier.

All calculations are approximate float64 geometry. Structural validation and
numerical support checks are evidence within the stated tolerance, not an exact
convexity certificate or an unrestricted topology guarantee.

## Normalization and frame convention

Let `c` be the arithmetic mean of all source vertices and `r` the maximum
Euclidean distance of a source vertex from `c`. The renderer's normalized point
is `q=(p-c)/r`. A row-major display matrix acts on columns as `q_display=R@q`.
It must be finite, orthogonal and have determinant +1 within `1e-8`; omitted
matrices mean identity. Source coordinates, source face cycles and cells are
never transformed in place.

A source outward unit supporting plane is `n dot p <= h_source`. Its normalized
offset is `h=(h_source-n dot c)/r`. In the display frame its unit normal is
`n_display=R@n` and its offset remains `h`.

The matrix must include the complete display frame: saved entity First/Last
frame followed by the six angle rotations in viewer order. Centering is already
included in normalization; do not subtract the entity frame's center a second
time. Proper rigid changes of source coordinates, translation and positive
uniform scaling preserve normalized scores when the observer/frame changes
with the source. The later 3D observer camera is not an input.

## Observer and grazing semantics

For `projection='orthographic'`, `direction` points **toward** the parallel 4D
observer. Its default is `[0,0,0,1]`; finite nonzero vectors are normalized before
use. The facing score is `n_display dot direction`.

For `projection='perspective'`, `eye` is a finite location in normalized display
coordinates, default `[0,0,0,3]`. The signed normalized perpendicular distance
from the cell's support plane is `n_display dot eye - h`.

The renderer's corrected `stereographic` mode uses radial projection to S3
followed by `(X,Y,Z)/(1-W)`. Its source support-plane classifier uses the pole
eye `[0,0,0,1]`; this is classification of original source planes, not the
normal of each curved radial surface patch. It does not establish generalized
interpretation for arbitrary source points. A finite-eye mode rejects a
parallel direction; a parallel mode rejects a finite eye. An eye inside a
convex source can legitimately classify every cell as back-facing.

`grazing_tolerance` defaults to `1e-8`, must be positive and at most `1e-3`.
Parallel scores use that band directly. Finite-eye scores use
`grazing_tolerance * max(1, norm(eye))`, accounting for observer magnitude in
normalized coordinates. Scores above the positive band are front, below the
negative band are back, and within the inclusive band are grazing. Grazing is
a separate class; hiding front or back should not silently hide it.

For the literal tesseract with vertices `(±1,±1,±1,±1)`, `c=0`, `r=2`, and each
normalized facet offset is `0.5`. Parallel +W yields one front, one back and six
grazing cells; reversing direction swaps front/back. Eye W=3 yields one front
and seven back cells. Side-cell scores are `-0.5`, rather than zero: finite and
parallel observers are geometrically different. Cell 0 First/Last changes its
normal to +W/-W and therefore changes its facing without editing source data.

## Result and resource bounds

The native result includes ordered `sourceCellIds`; records in `cells` with
`cell`, `sourceVertexIds`, `facing`, `signedFacing`, `sourcePlane`,
`normalizedPlane` and `displayPlane`; Boolean `masks.front/back/grazing`; and
`frontCellIds`, `backCellIds`, `grazingCellIds`. Plane objects contain four
components in `normal` and the right-hand-side `offset`. Additional metadata is
`sourceFingerprint`, `normalization`, `observer`, `matrix`,
`classificationTolerance`, `diagnostics`, `numericMode='float64-approximate'`
and `algorithmVersion='cell-facing-1'`.

Caps are 20,000 source vertices, 10,000 cells, 1,000,000 source face/cell/edge
incidences, 8,000,000 cell-versus-source-vertex support tests and 1,000,000 nested
cell-face vertex visits. Resource limits, malformed data, unresolved rank,
support failure, non-finite eyes/matrices and unrepresentable normalization or
observer arithmetic fail explicitly. No partial masks or truncated source
representation are returned.

## Browser cache and dynamic API

`ui/cell-facing.mjs` keeps costly source-plane verification separate from
per-display-frame observer classification:

```javascript
const resolved = resolveSourcePlanes(model, nativeResult);
const facing = classifyCellFacing(resolved, {
  matrix: savedFrameMatrix, angles: view.angles, projection: view.projection
});
```

`resolveSourcePlanes` requires a matching engine-issued representation hash and
supported algorithm version. It also recomputes source mean/radius, source and
cell rank, source-cell vertex references, unit outward normals, every source
support inequality and complete support membership. A matching hash alone
cannot legitimize a forged cached plane. This is a bounded numerical check of
the cached planes against the current geometry; the browser still consumes an
engine-validated source model and does not reproduce every native manifold,
face-cycle or convexity validation. It does not recompute Python's source-hash
serialization. Cached facing masks, observer state and display normals are
ignored.

Resolved planes are copied records `{cell, normal, offset}` in normalized source
coordinates. `composeDisplayMatrix(matrix, angles)` provides the row-major
post-frame six-angle composition. `classifyCellFacing` recomputes current
normals, scores, masks and source IDs using that composition. Default
projection/observer and tolerance match the native API. Unsupported caches or
observer options return explicit diagnostics with `supported=false`; they do
not invent culling masks. Manual visibility should be retained in that case.

Resolve the cache when the source/cache changes, then recompute facing during
display rotation. Do not invoke the native engine or repeat all-source support
verification on every animation frame. Viewer/app visibility integration is a
separate step; the helpers alone do not change the renderer.

## Independent verification

`tests/test_cell_facing.py` builds literal tesseract and simplex incidences
without hull or generator helpers. It checks analytic normals/offsets,
parallel and finite-eye counts, eye-plane crossings, scale/translation/proper
rotation covariance, signed source-plane distances, Cell 0 First/Last frames,
complete source references, immutability, malformed inputs and explicit caps.

`tests/cell-facing.test.mjs` uses independently supplied literal facet planes
and checks browser cache proof, forged plane/hash/normalization rejection,
dynamic angles, proper-frame composition, finite/parallel observer distinction,
source invariance and unsupported generalized domains. Shared-face ownership,
manual visibility composition, selection and actual desktop presentation need
renderer/UI regressions before any requirement is declared complete.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/facing/cell-facing-packaged-9Vs1sy/result.json](../artifacts/desktop-qualification-E5RVgf/facing/cell-facing-packaged-9Vs1sy/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
