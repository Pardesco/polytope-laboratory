# Source entity presentation

Appearance provides source vertices as points or lit spheres, source edges as lines or lit cylinders, and independently shrunk 4D cell surfaces. These are view settings. They do not edit coordinates, edge endpoints, face cycles, cell incidence, source colors, or the mathematical interpretation of the model.

The primary reference is Stella's [Visuals manual](https://www.software3d.com/Manual/Visuals.php), which distinguishes true source vertices and edges from intersections of displayed polygons and describes sphere/cylinder presentation. Its [4D projection manual](https://www.software3d.com/Manual/Proj4D.php) describes shrinking displayed cells while retaining full-size edges. This implementation supports those specific display behaviors. It does not qualify a physical Geomag construction, implement every publisher radius basis, or assert that a generalized source complex bounds a solid.

## Saved view contract

| Field | Values or bounds | Legacy default |
| --- | --- | --- |
| `vertexStyle` | `point`, `sphere` | `point` |
| `edgeStyle` | `line`, `cylinder` | `line` |
| `vertexRadius` | finite number in `(0, 0.5]` | `0.015` |
| `edgeRadius` | finite number in `(0, 0.5]` | `0.006` |
| `cellShrink` | finite number in `(0, 1]` | `1` |

Radii use **normalized projected 3D view units**. Source vertices first undergo the existing vertex-mean/radius normalization, saved 4D frame, incremental plane rotations and selected 4D projection. The resulting sphere/cylinder radii are constant in that 3D view coordinate system. They are not measurements in intrinsic source units, nor observer screen-pixel radii. An ordinary 3D perspective camera can therefore change apparent screen size with depth.

Selecting sphere/cylinder presentation enables the corresponding vertex/edge visibility option. The visibility options still control actual rendering. Native project validation rejects invalid stored styles, zero/nonfinite/out-of-range radii and shrink outside `(0, 1]`; defensive renderer helpers diagnose malformed runtime values and use legacy defaults.

## Primitive identity and GPU bounds

Only source vertex and edge IDs produce primitives. Star face crossing points introduced by winding triangulation remain virtual surface points. They do not become source vertices or cylinder endpoints. A cylinder connects the actual projected source endpoints: its midpoint, direction and length are computed after 4D projection. Clipped or manually hidden primitives are omitted. A projected edge shorter than `1e-12` has no cylinder; its source edge remains intact and is counted as collapsed.

Spheres and cylinders use separate `THREE.InstancedMesh` objects, bounded at 20,000 visible spheres and 30,000 noncollapsed visible cylinders. Capacity grows geometrically and is reused. The mesh's `userData.sourceVertexIds` or `userData.sourceEdgeIds` maps each actual GPU instance to the source ID. Geometry replacement disposes the instance buffers as well as geometry/material resources.

If a primitive count exceeds its limit, the **entire requested style** falls back to source points or lines, with an explicit diagnostic. The renderer does not present a silently incomplete set of spheres or cylinders. The current matte sphere and cylinder colors follow existing neutral vertex/edge materials; source surface RGBA continues to apply to faces and cell surfaces. Cylinder wireframe opacity follows the edge opacity setting.

## Independent 4D cell surfaces

Shrink is supported for intrinsic 4D models embedded in 4D with source cells. For each active source cell, its center is the arithmetic mean of the unique source vertices incident through its source face cycles. For any filled source face triangle point `p`, the displayed intrinsic cell point is

```
p_shrunk = cell_center + cellShrink * (p - cell_center)
```

This interpolation occurs **before** normalization, the saved SO(4) frame, incremental rotations, and 4D projection. The common projection path then applies the display frame exactly once, including winding-generated crossing points. Independent owners of a shared source face receive separate surface instances when shrink is below one. Source face/cell IDs remain attached to the instances. Source face RGBA takes priority; otherwise each instance uses its source cell RGBA or selected cell palette.

At shrink one, the renderer retains the ordinary shared source-face triangulation. Shrinking never scales the source edge or source vertex buffers. Thus the visible full-size skeleton can remain around separated cell surfaces. This is a rendering operation; no new intrinsic cell, volume, watertight solid, or topological incidence is created.

Active cells are the intersection of manual hide/isolate settings and validated observer-facing masks. A shared source face remains available if any owning source cell is active. Grazing and unsupported generalized facing retain the existing facing rules and diagnostics. Generalized winding-filled faces can be shrunk using source incidence without a claim of convex cell orientation or solid interior.

Shrink preflights a 250,000-triangle instance limit and a 1,000,000 nested source face-vertex traversal limit. An invalid cell reference, unsupported dimension or exceeded resource bound restores the complete full-size face surface with a diagnostic, rather than showing partial shrunk cells. Source faces with no owning source cell remain full-size once, explicitly diagnosed.

## Independent verification

`tests/entity-presentation.test.mjs` covers eleven pure/renderer cases: a literal tesseract and both owners of shared faces; invalid dimensions and bounded fallback; source primitive mapping and collapsed edges; exact cylinder endpoint transforms; saved-frame/angle/perspective order; per-instance cell colors and RGBA; facing/isolation intersections; immutable coordinates/cycles; and winding crossing points in a generalized pentagram prism cell. The combined geometry/frame/facing run passed 48 tests.

`scripts/entity-presentation-smoke.cjs` runs the actual Electron UI in an isolated profile, including native save/reopen and direct WebGL instanced draw observation. It supports `POLYTOPE_TEST_EXECUTABLE` for a packaged executable and `POLYTOPE_TEST_ARTIFACTS` for a separate evidence directory.

The development 0.11.0 run passed **six checks with no renderer errors**. Evidence is in `artifacts/entity-presentation-smoke-QIcmUh/result.json` with six screenshots. The literal cube issued actual GPU draws for eight spheres and twelve cylinders, increasing nonbackground pixels from 6,948 for lines to 40,964 for sphere/cylinder styles. The full tesseract skeleton retained sixteen spheres and thirty-two cylinders while shrink .6 produced ninety-six independent cell-face triangles. Facing, manual isolation, cell 0 First/Last and complete native reload preserved source geometry; the native parser rejected zero vertex/edge radii and shrink 1.01. Point/line restoration produced no instanced draws.

No packaged run or large-model interactive performance qualification is claimed here. The pure bounds fixtures verify complete fallback and diagnostics independently of the desktop run.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/presentation/entity-presentation-packaged-eL4sf6/result.json](../artifacts/desktop-qualification-E5RVgf/presentation/entity-presentation-packaged-eL4sf6/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
