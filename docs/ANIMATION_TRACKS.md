# Explosion and rigid folding tracks

The animation core can explicitly upgrade a saved version 1 rotation/section sequence to version 2 with explosion and/or folding tracks. Version 0.12 development integrates evaluated poses, detached source instances, guarded orchestration, native validation, actual viewport adapters and shelf controls. Its [desktop workflow passed 13 checks](ANIMATION_TRACK_CONTROLS.md), including PNG and decoded offscreen WebM endpoints; packaged qualification remains pending. A renderer without a required adapter retains the sequence and diagnoses playback as unavailable. Existing version 1 sequences and their endpoint sampling remain supported.

## Saved sequence

```json
{
  "version": 2,
  "duration": 2,
  "fps": 24,
  "loop": false,
  "tracks": {
    "explosion": {"direction": "normal"},
    "fold": {"kind": "face-net"}
  },
  "keyframes": [
    {"time": 0, "angles": [0,0,0,0,0,0], "sectionOffset": 0, "explosionAmount": 0, "foldFraction": 0},
    {"time": 2, "angles": [360,0,0,0,0,0], "sectionOffset": 0, "explosionAmount": 1, "foldFraction": 1}
  ]
}
```

Version 2 requires at least one supported track, and each keyframe must contain the fields for its active tracks. `explosionAmount` is dimensionless in `[0,10]`; `foldFraction` is in `[0,1]`. Unknown track names, direction policies and fold representations reject explicitly. Neither unknown tracks nor unused fields are silently discarded. Duration, fps and keyframe limits remain 300 seconds, integer 1-60 fps and 2-256 strictly ordered keyframes including both exact endpoints.

`withSequenceTracks(sequence, tracks, defaults)` explicitly upgrades or changes active tracks while preserving all rotation/depth samples. Adding a track defaults its value to zero unless supplied; existing active track values stay intact. Passing an empty track record explicitly removes presentation tracks and produces version 1. `createSequence(view,duration,fps,{tracks})` is the optional version 2 constructor. Capture through `setSequenceKeyframe` uses current view values when supplied and retains evaluated track values when the view lacks them. `resizeSequence` retimes every track together. `evaluateSequence` and `evaluateNormalized` evaluate absolute time, clamp outside duration and return detached angle arrays and active scalar fields. PNG sampling through `sequenceFrameTimes` includes both exact endpoints even for fractional durations.

## Source-space explosion

`resolveExplosion(model,{direction,planeCache})` resolves immutable entity descriptors once. It returns `supported`, `diagnostic`, `dimension`, `sourceFingerprint`, `normalization` and `entities`; unsupported geometry has an explicit diagnostic. Only intrinsic 3D or 4D convex sources qualify. Generalized/star and compound sources need a separate direction policy and are currently rejected for both methods. These restrictions describe the adapter, not a conversion of the saved source.

With `direction:'normal'`, a 3D face translates by `amount * sourceRadius * outwardUnitNormal`. The center is the average of source vertices and radius is the maximum distance from that center. Normals are checked against ordered face planarity, complete source-plane support, simple convex boundary turning and full source rank. For a Cartesian cube of side 2, radius is `sqrt(3)`, so amount 1 moves each face by `sqrt(3)` along its analytic signed coordinate normal. A 4D cell uses the existing independently verified `cell-facing-1` plane cache via `resolveSourcePlanes`; a matching fingerprint alone cannot validate forged planes. Complete ordered cell face cycles are retained.

With `direction:'radial'`, the explicitly different centroid policy translates an entity by `amount * (entityVertexCentroid-modelCenter)`. This scales covariantly with model units and translation. It does not claim to be a supporting normal for asymmetric entities. An entity whose centroid lies at the model center has an unresolved radial direction and rejects. A 4D radial cell does not require a normal cache, but its supplied incidence must span a rank-3 hyperplane.

`explosionGeometry(resolved, amount)` returns fresh entity point buffers, translation vectors, ordered local faces, original vertex/face references, source cycles and source face/cell colors. Mathematical shared vertices are duplicated per displayed entity. Amount zero copies source coordinates exactly. Neither the saved model nor resolved snapshots are mutated by later amounts or edits to returned buffers. Apply these source-space displacements before the observation frame, angle rotations and projection. Keep the original source normalization when displaying or exporting to prevent each frame from refitting away the explosion. Boundaries remain presentation instances; they do not become a new filled solid or section source.

Resolution limits are 20,000 source vertices, 10,000 entities, 1,000,000 incidence/vertex visits and 8,000,000 source support tests. Arithmetic must remain finite. Plane checks use normalized float64 tolerances, not exact certificates.

## Rigid folding

`foldTrackPositions(net,fraction)` validates the shape, dependencies, references, joined flat hinges and unit root quaternions of a native-authoritative version `0.3.0` face-net descriptor, then delegates to the existing `foldPositions` solver. Roots move by rigid quaternion rotation and translation; descendants rotate by signed dihedral angles around transformed shared hinges. Vertex coordinates are never linearly morphed into target positions. The returned point and source-reference arrays are detached from the saved net.

Only existing 3D face nets qualify. Whole 4D cell nets use a different representation and are explicitly rejected by this adapter. The official [4D supported features](https://mail.software3d.com/Manual/Features4D.php?prod=Stella4DPro) excludes partially folded nets, while the [4D nets reference](https://mail.software3d.com/Manual/Net4D.php?prod=Stella4DPro) describes complete intact cells. This implementation preserves that distinction. Folding collision checks and a guarantee of nonintersecting intermediates remain unavailable. The broader interactive explosion and folding workflows are documented in the official [Animation](https://www.software3d.com/Manual/Animate.php?prod=Great) and [Folding Nets](https://mail.software3d.com/Manual/Build.php) references; no interface or file-format parity is claimed here.

## Verification and integration gate

`tests/animation-tracks.test.mjs` passes 14 tests using an independent Cartesian cube, a Cartesian 4D cell/plane fixture and two hand-authored triangular hinge faces. It checks version migration, track capture/resize, exact timestamps, source normal displacement, zero amount, color/incidence ownership, model scale/translation covariance, forged plane rejection, star boundary diagnosis, rigid distances, exact hinge joins at fractions 0, 0.5 and 1, root quaternion interpolation, malformed descriptors, unsupported 4D folding and stale-generation cancellation. Existing `tests/animation.test.mjs` remains unchanged and passes all 17 tests.

`engine/animation_state.py` supplies `validate_animation_sequence` with the same version 1/2 contract and resource bounds; `animation_render_support` distinguishes valid retained data from unavailable rendering capability. Its 40 tests include independent JavaScript/native fixture parity. The native project display-state hook is present for version 0.12 development; the qualified 0.11 package predates it. [Adapter orchestration](ANIMATION_ADAPTERS.md) adds 17 tests, including an actual native cube-net descriptor and cancellation after a renderer has published a known pose. [Display buffer preparation](VIEWER_EXPLOSION.md) adds 14 tests for retained source IDs, ordered fill, original normalization, RGBA and actual projection-helper compatibility.

Actual rendering, qualified targets, native saved-track policy, awaited export poses and desktop first/interior/last/cancellation tests are integrated and qualified in the development build. Packaged workflow proof remains a release gate. Version 2 data remains retained with an explicit unavailable-playback diagnostic in any renderer lacking the relevant capability.
