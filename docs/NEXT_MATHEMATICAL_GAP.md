# Next mathematical construction batch

Read-only assessment: October 5, 2026. This report proposes work after current
candidate qualification. It does not change the original 73 requirements,
the parity ledger, source geometry, or packaged application.

The highest-value next batch is **CON-07: explicit 3D face-to-face augmentation**.
It opens an entirely missing construction workflow and reuses the existing
catalog, Memories sources, boundary editing, independent convex verification,
and operation history. Begin with a bounded convex-source attachment kernel;
retain the full augmentation/excavation/drilling/placement requirement as open.

## Evidence and remaining requirements

The current ledger contains 73 rows: 62 `prototype`, 11 `unstarted`, and
`baselineAuditComplete: false`. Prototype status is evidence of partial work,
not feature-complete conformance. The eleven unstarted rows are LIB-03, LIB-06,
CON-07, CON-13, CON-14, FAC-02, FAC-03, FAC-04, NET-05, ANIM-02, and VIS-04.

| Candidate | Current source evidence | Priority assessment |
|---|---|---|
| CON-07 augmentation/excavation/drilling/placement | No corresponding construction kernel or native dispatch. `compounds.add_models` keeps disjoint source IDs; face pair removal and coplanar blending are separate operations. | First: introduces a useful missing mathematical operation with direct analytic fixtures and reusable assembly infrastructure. |
| CON-08 face subdivision/geodesics/sphere projection/zonohedra | Literal edge subdivision is implemented; the other construction kernels remain missing. | Second: triangular frequency subdivision and radial projection offer an independently testable next batch. Preserve the difference between planar refinement and projected geodesic geometry. |
| CON-03 convex core; CON-05 expansion/runcination | Hull, dual, directed-edge convex truncation/rectification are present. These missing operations are not equivalent to the existing Hull branches. | Follow-up: separate operation definitions and transition fixtures, including 4D domains. |
| FAC-02/03/04 automatic faceting | `faceting.facet` accepts supplied ordered cycles only. It does not enumerate candidates, test the full criteria, or provide faceting diagrams. | Valuable but larger: candidate validity, symmetry replication, and completeness domains require a separate finite search contract. |
| CON-13 vertex-figure completion; CON-14 relaxation | Both ledger rows remain unstarted. A local vertex figure is not a uniform/scaliform completion solver. | Later: admissibility/branch choices and constrained residuals must be defined before implementing a solver. |

Catalog breadth, reinforcement parts, morph methods, and textured/text elements
remain important independent gaps; they are not resolved by another construction
family. Bounded layer joins and the named crossed antiprism product also leave
the full CON-12 baseline open.

Two ledger descriptions lag current source: LIB-07 still says star products and
rational antiprisms/antiduoprisms are pending; CON-11 still calls full 3D-source
prisms, antiduoprisms, and step families unexposed. Current `generators.py`,
`server.py`, and application control wiring do expose these bounded operations.
Their full parameter domains and installed-baseline conformance remain open.
Update those descriptions after qualification; do not mark either row complete.

## Published baseline: preserve the correct semantics

Stella documents attachment at matching faces, selection of one or matching
faces, augmentation versus excavation, source/color inheritance choices,
orientation preview, and an option to retain coincident faces.
[Official augmentation manual](https://www.software3d.com/Manual/Augmentation.php?prod=Stella4DPro).

The author's paper explicitly permits faces to cross during excavation and
describes removing coincident face pairs and stitching the remaining boundary.
Drilling follows additional coincidences; overlapping pyramidal dents do not
automatically become a Boolean tunnel. The paper describes Great Stella 2.0,
so it supports this mathematical distinction rather than proving every modern
dialog setting. [Robert Webb, section 6](https://www.software3d.com/PolyNav/PolyNavigator.php).

Putting models on faces or vertices is a separate placement/compound workflow:
instances need not share edges with the base. The manual includes height,
orientation, scale, color, and rotation-center choices.
[Official placement manual](https://www.software3d.com/Manual/ModelsOnFaces.php).

Consequently, general CSG subtraction is not a substitute for CON-07. Nor does
the existing disjoint Add operation become augmentation merely by renaming it.
Installed Stella fixtures are still needed for orientation ordering, tolerances,
all-face selection, reflection policy, additional coincident pairs, color rules,
preview behavior, and excavation/drilling on intersecting source surfaces.

## Proposed first kernel and domain

Future isolated ownership: `engine/augmentation.py`,
`tests/test_augmentation.py`, and `docs/AUGMENTATION.md`. No frozen importer
changes are needed. Proposed API, subject to integration review:

```python
attach_at_faces(base, addition, base_face_id, addition_face_id,
                *, cycle_offset=0, scale=1.0,
                tolerance=1e-8, color_policy='preserve')
```

Inputs are independently verified single closed convex 3D source boundaries in
intrinsic 3D coordinates. Selected faces must be simple convex planar polygons
with the same arity and congruent ordered cycles after the explicitly supplied
positive scale. Neither matching vertex sets nor equal edge counts suffice.
Stars, ambiguous/degenerate frames, coplanar refinements unsupported by the
classifier, additional face coincidences, and nonconvex sources receive explicit
diagnostics in this first batch. These are temporary implementation limits, not
a reduced definition of CON-07.

1. Validate bounded source JSON before copying snapshots; compute identities
   from current geometry rather than trusting cached fingerprints. Obtain
   independently verified facet supports. Read-only reference Hull verification
   is allowed; source geometry must never be replaced with that Hull.
2. Derive a deterministic proper rigid transform from matched source-face
   frames and an explicit cyclic offset. Opposite outward facet normals and
   reversed gluing traversal identify the attachment. A rotation must have
   determinant +1; implicit reflection is forbidden. Record translation,
   rotation, requested scale, numerical residuals, and correspondence.
3. Check the whole ordered polygon correspondence and supporting halfspaces.
   The two convex interiors must lie on opposite sides of the complete matched
   face. This proves disjoint interiors in this domain. Reject unresolved
   support/rank/congruence predicates, not merely their nonfinite outputs.
4. Remove exactly the two selected face records. Identify only their paired
   vertices and boundary edges; do not perform a global coordinate weld.
   Preserve every other ordered face and the base coordinates. Any transformed
   addition vertex assigned a base seam coordinate must have its bounded snap
   residual and both source owners recorded. Tolerance zero means no nonzero
   snap residual is accepted; approximate matches are never called exact.
5. Check every resulting edge has two incident faces, every vertex link is one
   cycle, and the connected boundary has Euler characteristic 2. Generic
   generalized validation alone does not establish these manifold properties.
   Check all face cycles, planarity, rank, and finite bounds again.
6. Publish a `generalized-complex` boundary with complete historical snapshots,
   vertex/edge/face source maps, explicit removed-face entries, seam maps, and
   retained face RGBA. Preserve the caller unchanged. The connected result must
   not advertise the original solids as disjoint current component leaves.
7. Require native project roundtrip to preserve the complete geometry,
   attributes, provenance, and computed current fingerprint. Reject atomically
   if any payload, serialization, or numerical gate fails.

Start with at most 256 vertices per input, 512 combined, 64 vertices per selected
face, 16,384 total incidence references, 16 MiB combined serialized input, and
64 MiB final native payload. Gate finite positive scale, bounded integer IDs and
offsets, finite nonnegative tolerance, huge integers, deep metadata, invalid
Unicode, and resource overruns before allocation-heavy work. Bounds should be
reported in operation diagnostics and tested at their boundary.

Do not silently blend coplanar seams: those edges are part of the requested
literal result. Do not attach a convex declaration when the output differs from
an unsplit convex boundary. `geometry.validate` checks each supplied convex
piece of a `polyhedral-region-union` but does not independently establish that
arbitrary supplied pieces have disjoint interiors or that the exposed boundary
agrees with them; `intrinsic_measures` sums the declared piece contents. The
initial attachment should therefore publish no filled-volume claim. A later
separate solid interpretation may reuse the opposite-halfspace proof only after
exposed-boundary agreement and finite measure/project gates are independently
tested. This does not require changing the frozen geometry importer.

## Independent acceptance fixtures

| Fixture | Required literal boundary | Independent checks |
|---|---|---|
| Two unit cubes glued at one square | **12 vertices, 20 edges, 10 faces** | Coordinates form a 2 by 1 by 1 box with retained seam vertices/edges. The simplified 8/12/6 box Hull is forbidden. Closed links/Euler 2; exposed area 10. Independently known union volume 2 is fixture evidence, not an automatic model measure. |
| Two unit regular tetrahedra glued at one triangle | **5 vertices, 9 edges, 6 faces** | Triangular bipyramid; six unit equilateral triangles, area 3√3/2; analytic union volume √2/6. Verify the actual outward attachment rather than overlapping coincident tetrahedra. |
| Unit cube plus unit-base square pyramid of height 1/√2 | **9 vertices, 16 edges, 9 faces** | Four equilateral added faces, exposed area 5+√3; analytic content 1+1/(3√2). No Johnson name is inferred merely from counts. |
| Cyclic offsets and non-axis-aligned source frames | Counts and source maps remain correct | Compare independently transformed coordinates, determinant +1, paired edge order, and current fingerprint. Test every offset on square and triangle faces. |
| RGBA and source history | All surviving faces retain their own source attributes | Both removed face IDs remain in historical evidence. Source arrays/metadata unchanged; unit labels and scale covariance survive native save/load. |

Malformed fixtures must include unequal shape despite equal arity, equal point
sets with crossed order, triangle/square mismatch, invalid IDs including bools
and enormous ints, reflected or collapsed frames, nonconvex sources, extra
coincidences, unresolved near-matches, extreme numerical scales, oversized or
deep JSON, and unpaired Unicode. Refusal must leave the current model untouched.

Later native integration acceptance includes preview and commit using the same
kernel/correspondence, source fingerprint changes invalidating a preview,
Memories-selected source snapshots, undo/redo, replay, parameter branches, save
and reopen, export-busy guards, and visible semantic controls. Kernel success
alone does not qualify those workflows.

## Following batches without changing the baseline

- General face alignment and attachment for valid nonconvex source surfaces;
  selected additional coincident-pair handling and explicit keep-faces mode.
- Excavation with reversed placement and literal retained intersecting faces;
  independently derived cube dent and through-coincidence tunnel fixtures.
  Check boundary incidence and genus, not a guessed solid Boolean volume.
- Multiple matching-face selection, color filters, reflection/symmetry choices,
  and the published sizing/color policies; retain instance-level ownership.
- Separate face/vertex placement with explicit local frames, instance IDs,
  source-center policy, and recovery through the genuine compound APIs.
- Installed-baseline comparisons covering all CON-07 cases, including preview
  orientation ordering and nongeneric coincidences.

## Audit anchors

This is source inspection, not a new packaged runtime qualification. No Electron,
browser window, build, package, production source edit, or native test mutation
was performed for the assessment. Read-only Python used `-B`.

| File | SHA-256 at assessment |
|---|---|
| `STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md` | `7DAFEC36E99C7C883A7222F753F67F1C0818638359419A17F7ECBDF8B875DF8D` |
| `docs/parity-ledger.json` | `1048E72C6681B0E06CA7BDB8E82FC50592E127C10E8156C5A2BC0BDCC159D176` |
| `engine/generators.py` | `807DD2EB1B610D61D4E2E3880CC5D38F530DFB41EE5E0D0BEAC25BA75B92C7D0` |
| `engine/operations.py` | `B07ED85F2B55BC43BBD20CDCF0EB08409274DA391B5308532B8053613F3AD6B5` |
| `engine/faceting.py` | `7E605BA542B06CFB8AE790961BDAE610C99126890B5C18ABCC4BB27F3E72CDCD` |
| `engine/face_blending.py` | `0361F381B90F5D3E43787C6B05B2393FAA84F267D7E018E1365C7540BEA1E203` |
| `engine/compounds.py` | `CD96C8A87956B24B0B42F762C1081FDDD0AD4CDF5F9696FD01BD899F19D47928` |
| `engine/convex_classification.py` | `F5E79731FCC60D2AF74A6D226CB1D0AF95F3BEA7BDC4644958A5811E499C8D47` |
| `engine/geometry.py` (read only) | `9A9A1243223CA38AABCE4BC762CBD463939A177F104BFA08C4ADA81774B85414` |
