# Literal compound addition

`engine.compounds.add_models(base, other)` adds two validated source Models as
a disjoint incidence union in dimensions 2, 3 or 4. Both intrinsic dimensions
and embedding dimensions must match. An embedded 2D model in 4D is supported
when both inputs use that embedding. The operation returns a new validated
`generalized-complex`; it does not modify either source.

This is the base compound part of Stella's Add/Blend from Memory workflow.
The official manual describes addition of the stored model to the current model,
with relative scale set before addition. Removing coincident faces in pairs and
blending adjacent coplanar faces are subsequent offered operations. This kernel
implements addition only; it does not implement either cleanup or all of that
workflow. [Official Memories manual](https://www.software3d.com/Manual/Memories.php?prod=Stella4DPro).

## Geometry and mathematical limits

Source coordinates are copied literally, without scaling, rotation, centering,
welding, convexification, face sorting or automatic deletion. Vertices from the
second source receive an ID offset equal to the first source's vertex count.
Its edge endpoints and ordered face cycles receive that offset. Its cells receive
the first source's face-count offset. Existing first-source incidence is copied
unchanged. Star polygon winding therefore survives addition.

Two coincident cubes have 16 vertices, 24 edges and 12 faces, even though their
coordinates coincide. They remain two distinct components. A translated cube
pair has the same counts and retains the supplied translation. Two tesseracts
retain 32 vertices, 64 edges, 48 faces and 16 cells.

The output does not claim an inferred interior, union volume, convex support
planes, or Boolean reconstruction. Individual source measures and certificates
are preserved in historical source snapshots, not transferred to a potentially
overlapping compound as an aggregate mathematical certificate. Numerical
validation remains approximate and uses the existing kernel's global normalized
tolerance. Extreme relative scales or separations can make an otherwise valid
individual component unresolved under the combined normalization; addition then
fails validation with a diagnostic rather than bypassing that check.

## Component and source evidence

Top-level `components` records every leaf component:

- `id`: a distinct output component UUID, even if a source is added twice.
- `name`, `sourceModelId`, `sourceFingerprint`: historical leaf source identity;
  fingerprints are recomputed from geometry rather than trusting cached values.
- `sourceComponentId`: the previous component ID for an existing nested compound,
  or null for an ordinary source Model.
- `sourcePath`: the sequence of immediate source indices 0 or 1 that reaches the
  original leaf snapshot through nested additions.
- `maps.vertices/edges/faces/cells`: ordered source-local to output-global IDs.

Existing nested components remain separate leaves; their maps are offset and
their source paths prefixed by the input index. Component maps must partition all
incidence without overlap, omitted IDs or references crossing component boundaries.
Stale maps are rejected.

`metadata.compound` has schema version 1, two `inputs` records containing the
immediate source identities and four source-to-output maps, and `sourceModels`
containing full independent copies of those two input Models. This preserves
original metadata, provenance, IDs and any nested compound history. Historical
snapshots consume the same explicit payload budget as the compound itself.

`metadata.offColors.faces` and `.cells` concatenate source color arrays in their
new incidence order. Missing colors become null entries. RGB/RGBA byte and unit
encodings are validated and preserved, including alpha and colors on 4D cells.
Other source metadata, including DXF layer/visibility records, remains available
in the source snapshots; it is not reinterpreted as a merged global CAD table.

`provenance.operation` is `add-models`, with algorithm version `0.1.0`, both
recomputed input fingerprints and explicit false flags for welding, rescaling,
rotation, coincident-face removal and coplanar blending. All evidence is JSON
serializable for native project persistence.

## Retrieval APIs

`retrieve_source(compound, source_index)` returns an independent full copy of
immediate source 0 or 1 as it existed at addition time, including its original
Model ID, interpretation, metadata and source certificates.

`extract_component(compound, component_id)` returns the selected leaf's current
coordinates/incidence, remapped to local IDs and independently validated as a
generalized complex. It retains the leaf's historical source metadata, current
compound face/cell colors, original source ID and explicit extraction maps in
provenance. It assigns a new Model ID and recomputes the geometry fingerprint.
Source convexity/volume certificates are not reassigned to the extracted model.
If the compound was subsequently moved, extraction uses its current coordinates;
source retrieval still returns the original addition-time snapshot.

## Explicit leaf-component deletion

`remove_component(compound, component_id)` removes exactly one current leaf,
including a leaf inside a nested compound. It preserves the UUIDs, names,
historical source IDs and source paths of every remaining component. Deleting
the last component is rejected because the kernel has no valid empty Model.

Remaining vertices retain their current coordinates and original global order,
with compact new IDs. Edge endpoints, ordered face cycles, cell face incidence,
component maps and OFF face/cell RGBA tables are remapped accordingly. Owned
isolated vertices and wires survive when their component survives, and are
removed only when their owning component is selected. Coincident coordinates
do not change ownership; deleting one of three coincident cubes leaves two
independent cube components. No hull, automatic weld, rotation, scale change,
solid reconstruction or union volume is inferred.

`metadata.compoundComponentEditing` has schema version 1, a full independent
historical `sourceModel`, `removedComponentId`, `removedSourceModelId` and
`sourceMaps.vertices/edges/faces/cells`. Each source array maps to compact output
IDs; deleted entries are null. Original `metadata.compound.sourceModels` snapshots
and nested source paths remain historical and retrievable. Immediate
`metadata.compound.inputs[].maps` are updated to current IDs and now contain null
for deleted source elements. Repeated deletion retains those null slots. Current
component extraction still uses current geometry; retrieving an immediate source
still returns the complete addition-time source, including subsequently deleted
parts.

The operation returns a new validated generalized Model, records
`provenance.operation='remove-component'`, recomputed source fingerprint,
selected component ID and explicit source maps. The source itself is unchanged.
The full retained history remains subject to the 64 MiB payload limit.

Run `python -m pytest tests/test_remove_component.py -q`. Independent 2D square,
3D cube and combinatorially authored 4D tesseract fixtures cover either leaf's
deletion, a nested middle leaf, translated current geometry, all incidence maps,
RGBA offsets, unchanged component identities, coincident components, owned
point/wire leftovers, repeated removal, JSON persistence and subsequent addition
with leaf extraction. Invalid/stale IDs/maps, last-leaf deletion and full-history
payload exhaustion are diagnosed.

## Bounds and validation

Coordinates must be finite numeric values with magnitude at most `1e100`.
Inputs and output are bounded to 20,000 vertices, 100,000 edges/faces/cells each,
1,000,000 total coordinate/incidence entries, 2,048 corners per face, 1,024 leaf
components and 64 MiB
serialized UTF-8 JSON per Model, including retained snapshots. Both sources and
the result undergo fresh existing-kernel incidence validation. Invalid incidence,
dimension mismatch, non-JSON or nonfinite data, invalid color arity/ranges and
exhausted budgets reject the operation. No partial result is returned.

Run `python -m pytest tests/test_compounds.py -q`. The independent fixtures cover
literal translated and coincident cubes, a combinatorially authored tesseract,
ordered pentagram cycles and RGBA, nested compounds on either side, exact source
retrieval, current-geometry extraction, JSON persistence, corrupted maps and
cached validation, unsupported dimensions, malformed coordinates/incidence/colors,
and aggregate geometry/history budgets. No expected incidence is generated by a
hull or by the compound operation itself.

## Actual desktop workflows

Memories **Add** now creates a separate native compound document with literal
stored/current source coordinates. In the Operations inspector, **Compound
component** selects a leaf UUID; **Keep component** extracts that leaf and
**Delete component** removes it. Deleting the last leaf is disabled in the UI
and rejected by the kernel. Keep/Delete commit replayable native construction
history, with Undo and project persistence.

`scripts/face-editing-smoke.cjs` passed five scenario groups against the 0.11.0
development desktop build in 29.11 seconds, with zero page errors. Its component
scenario stored a cube, scaled the current cube by 2, and used Add to obtain
16 vertices/24 edges/12 faces at the literal two relative sizes. Keeping the
stored-size leaf restored its original geometry. Undo followed by deleting that
leaf retained the scaled cube, its current coordinates, six faces, original
remaining component UUID and explicit null entries for deleted source vertices.
Replay and native save/reopen preserved these results and the unchanged memory
bank. The test also verified Add-driven double/triple coincidence cases without
automatic cleanup. Evidence and 24 native snapshots are under
[`artifacts/face-editing-smoke-P6EnZx`](../artifacts/face-editing-smoke-P6EnZx/result.json).

Explicit optional pair removal and bounded coplanar blending are documented in
[`FACE_BLENDING.md`](FACE_BLENDING.md). Their successful desktop integration
does not complete arbitrary star-region blending, holes, solid reconstruction
or all `CON-06`/`DOC-02` release-level competitor parity requirements.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/faces/face-editing-packaged-smoke-XM5bHg/result.json](../artifacts/desktop-qualification-E5RVgf/faces/face-editing-packaged-smoke-XM5bHg/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
