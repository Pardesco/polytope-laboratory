# Selected-entity First / Last display frames

`engine/view_orientation.py` implements an intrinsic 4D observation-frame core.
It returns an SO(4) matrix and source-reference metadata without modifying model
coordinates, face cycles, cells, properties or cached source data. The native command, selected-entity controls, renderer and saved project validation
apply the frame once before six-plane rotation. Seven desktop workflows verify
First/Last, measured selection, persistence, expressions and DXF import in
`artifacts/inspection-smoke-GgHotx/result.json`.

The official 4D menu describes looking directly at the selected or last-selected
cell, face, edge, vertex or measured item, or putting that item at the back.
It notes that Cell First tends to give an enclosing cell in perspective, while
Cell Last places it toward the projection's center. Automatic direction is a
separate greatest-symmetry choice.
[Official 4D menu](https://www.software3d.com/Manual/Menu4D.php)
That description establishes the workflow; it does not specify an exact roll,
centroid or degenerate-input algorithm. The conventions below are this
application's explicit mathematical contract, not a claim that Stella uses the
same frame algorithm. Installed 6.0 conformance and complete VIEW-03 UI behavior
remain pending.

## API and matrix convention

```python
from engine.view_orientation import orient_entity

result = orient_entity(model, {'kind': 'cell', 'index': 7}, mode='first')
# display_column = matrix @ (source_column - center)
```

`mode` is `first` or `last`. Entity descriptors accept source `vertex`, `edge`,
`face`, or `cell` with an integer source index; explicit measured `line`,
`plane`, or `hyperplane` descriptors use source `vertices` IDs, as in the
measurement core. Sources must have validated incidence, intrinsic and
embedding dimension four, and full affine coordinate rank four. An embedding
containing a lower-rank object is not silently promoted to a full 4-polytope.

The matrix is a row-major 4-by-4 JSON array multiplying column vectors. For a
row-vector cloud, use `(points-center) @ matrix.T`. `center` is the arithmetic
mean of all source vertices. A renderer may additionally divide by its source
normalization radius; that uniform display scale is separate from the returned
orientation. The matrix already includes the requested First/Last alignment.
Avoid applying it twice or interpreting it as six absolute slider angles.

The result includes:

- `matrix`, `center`, `sourceDirection`, and `targetDirection`;
- `mode`, copied `entity`, `sourceVertexIds`, and `affineDimension`;
- intrinsic `entityCentroid`, centered `displayEntityCentroid`, and
  `centeredEntity`;
- `directionPolicy`, `rollPolicy`, optional `supportingPlane`,
  `sourceFingerprint`, `matrixConvention`, `algorithmVersion`, and
  `numericMode`;
- `checks`: determinant, row-orthogonality error, direction residual and
  selected-span residual.

## Geometric definitions

The selected entity has an affine span of rank zero, one, two or three.
The implementation reuses `measurements.entity_frame` for source references,
rank checks, centroid and span projector. Its default observation direction is
the source-mean-to-entity-centroid vector projected into the orthogonal
complement of the entity's affine span, then normalized.

For a declared convex source cell this is the unique outward supporting normal.
The module checks every source vertex against the selected hyperplane before
calling the direction outward. `supportingPlane` stores a unit normal and
intrinsic offset with convention `n dot p <= offset`. Generalized cells retain
an observation direction but receive no inferred convex interior or supporting
solid interpretation.

First maps `sourceDirection` to `(0,0,0,+1)`; Last maps it to `(0,0,0,-1)`.
Thus a unit tesseract cell at intrinsic W=+1 is at displayed W=+1 in First,
and W=-1 in Last; its opposite cell is at the opposite depth. A centered
selected vertex lies on the W axis in either mode. Source perspective or
orthographic projection follows this alignment; it is separate from the
3D observer camera and its axis/isometric directions.

Roll is chosen from source geometry rather than arbitrary coordinate axes or
SVD basis signs. Ascending source vertex IDs provide entity-centered span
vectors; Gram-Schmidt resolves the selected basis. The remaining spatial rows
come from ascending full-source centered vectors, orthogonalized against the
selected span and observation direction. A sign change of the third spatial
row ensures determinant +1. The selected rank-k span occupies the first k
spatial axes: edges along X, faces in XY, and complete cells in XYZ.

For default frames, Last differs from First by a proper half-turn in displayed
ZW, so their XYZ shapes differ by a Z reflection while W direction reverses.
No source reflection is committed. Under a proper intrinsic rotation Q,
translation and positive uniform scale, the corresponding frame transforms
covariantly: `R_new @ Q = R_old`, within float64 tolerance. Intrinsic coordinate
axes therefore do not determine the default roll. Reflection of the source
changes handedness; SO(4) display frames cannot erase that reflection while
claiming proper-rotation covariance.

## Ambiguity and optional inputs

An entity whose affine span passes through the model's vertex mean has zero
radial perpendicular direction. The core refuses to choose an arbitrary axis
for it. Supply `direction=[x,y,z,w]` explicitly; its nonzero perpendicular
projection defines the observation direction. The result marks this case as
`centeredEntity=True`. Its depth remains zero, so First/Last choose opposite
observation directions, not a fictional front/back position of the centered
entity. A direction lying in the entity span is refused.

For a noncentral entity, an optional direction is projected perpendicular to
the span and signed toward the centroid. Reversing that supplied axis does not
replace Last; use `mode='last'` for the opposite view. A direction with no
toward-centroid component is refused. For convex cells the perpendicular space
is one-dimensional, so this still resolves to the checked outward normal.

`reference_matrix` optionally supplies a validated SO(4) frame. It adjusts
roll through orthogonal Procrustes within proper rotations of the selected
spatial span and its remaining spatial complement, separately. W direction and
the canonical selected-axis subspace constraints remain fixed. This is the
closest frame within those declared block rotations; it is not an unrestricted
global optimizer and it does not assert that a symmetric orientation was found.

## Display integration

`ui/display-frame.mjs` resolves saved `view.orientationFrame` metadata against
the current engine-issued `model.fingerprint`. A supplied frame must match that
representation hash, have four finite rows of four numbers, and pass row
orthogonality and determinant +1 checks within `1e-8`. The browser consumes the
engine's verified representation hash; it does not recompute Python's source
serialization or establish a new independent source-identity certificate.
Missing or null frames retain legacy identity behavior. Malformed, mismatched
or non-4D frames fall back to identity with an explicit diagnostic.

`Viewer.setDisplay` applies the validated matrix once to normalized source
points, then applies the six existing display-angle rotations and projection.
Virtual star crossing points use the same path. Normalization already centers
the source vertex mean, so the saved frame's `center` is not subtracted again.
Neither source nor normalized points are mutated, and 3D nets are unaffected.
The return value includes `orientationApplied` and `orientationDiagnostic`;
matching viewer properties let controls inspect the latest result.

`tests/display-frame.test.mjs` verifies an independently composed 90-degree
rotation/projection, ordinary source triangles, actual viewer buffers for
independently intersected star segments, JSON restoration, repeatability,
clear-to-identity, malformed matrices, reflection rejection, hash mismatch,
legacy views and unaffected 3D rendering without a WebGL context.

## Bounds, failures and verification

All calculations are float64 and reuse the engine's relative rank tolerance.
Reorthogonalization and numerical SO(4)/span checks reject unresolved frames.
Limits are 20,000 source vertices, 1,000,000 source face/cell/edge incidences,
and 512 selected-entity vertices. The selected-entity cap bounds the existing
measurement frame's full SVD allocation. Limits fail explicitly; no incomplete
entity frame or source truncation is returned.

Other explicit failures include invalid or missing source IDs, unavailable
entity kinds, coincident/collinear/nonplanar rank mismatches, non-finite or
in-span supplied directions, invalid reference matrices, unsupported dimensions
and ambiguous centered entities. `automatic` is refused; no greatest-symmetry
theorem or heuristic equivalence is guessed.

`tests/test_view_orientation.py` builds a literal tesseract incidence fixture
independently of the hull/generator code, verifies every entity in both modes,
and checks all source pair distances, cycles and cells. Further fixtures cover
a literal simplex, inverse-transpose normals after anisotropic affine changes,
proper-coordinate rotations/translations/scales, a pentagram face, measured
planes, central ambiguity, supplied directions, reference roll, malformed data
and resource bounds. UI integration must additionally verify persisted intent,
selection retention, frame/slider composition, observer-camera independence and
actual perspective First/Last behavior before changing the ledger status.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/inspection-packaged-smoke-hm6QpV/result.json](../artifacts/inspection-packaged-smoke-hm6QpV/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
