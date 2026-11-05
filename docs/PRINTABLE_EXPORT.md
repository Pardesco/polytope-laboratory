# Printable model export (W7 / W32)

File toolbar **Export** → **Export type: Printable model (STL/3MF/OBJ)**.
`export-kind` enables the workflow inside `export-dialog`. Choose **Strut**,
**Panels**, or **Solid** with `printable-mode`. Set longest outer mesh dimension
in mm (`printable-size`), rod/node diameters (`printable-strut`, `printable-node`),
or panel thickness (`printable-thickness`). All numeric fields accept expressions
through NumericEntry. Collapsed **Mesh quality** contains `printable-segments`
(8–64, multiples of 4) and `printable-ascii`. Binary STL is the printable default;
`export-format` also offers ASCII STL, grouped OBJ, and 3MF. Solid additionally
offers colored GLB (serialized meters); printable review dimensions use mm.
Review `export-preview`, then **Choose file & export** (`confirm-export`).

## Geometry and guarantees

The renderer copies the published point/edge/surface buffers, including source
visibility masks, active 4D rotation/frame, perspective clipping and tessellated
stereographic arcs. Sphere/cylinder display styles and dot visibility do not set
physical diameters: the printable parameters do. The observer camera does not
rotate the sculpture. Existing intrinsic geometry export remains available.

Strut export creates one capped cylinder per unique nonzero displayed segment
and one UV sphere per unique visible projected source vertex. Arc subdivision
and clipped endpoints also receive strut-radius joint spheres. Thus a straight
perspective tesseract has 32 rods and 16 nodes; curved arcs have additional rods
and joints. Duplicate and collapsed segments are skipped and reported.

Panels offset each displayed filled triangle by ± thickness/2 along its normal
and close all three side walls. Each patch is an independent outward watertight
triangular prism, named/grouped by its source face. This preserves the viewer's
nonzero/even-odd star fill and handles projected nonplanar/curved faces without
claiming a generalized solid interior. Adjacent patches touch or overlap; they
are **not merged into a single face-wide extrusion**. Collapsed patches are
skipped with a warning. Enable faces before exporting panels. Solid constructs
the closed outer surface of supported 3D stars, compounds, stellations and
ordinary boundaries, retaining source face colors in 3MF, OBJ/MTL and GLB.
Projected 4D and exploded views are refused. The preview reports material volume
and closed components. Collapsed **Solid interior and hollow shell** offers
component winding fill and a guarded convex inward offset with minimum wall
thickness. See [Solid printing](SOLID_PRINTING.md) for definitions and limits.

Each rod, node and panel is a closed outward triangle shell with positive signed
volume. Shells may overlap and are not Boolean-unioned. In a slicer, union
overlapping volumes and inspect connectivity, supports and material settings.
Solid instead removes internal overlapping sheets and verifies manifold edges,
vertex links, orientation, triangle intersections and positive material volume.
Disconnected displayed components remain disconnected. No flat cuts, feet or
bases are added. 3MF uses core-spec XML in an OPC ZIP with millimeter units and
one build assembly containing the named shells; OBJ uses shell groups. STL
contains triangles only and conventionally uses mm.

Target size includes the outer radii/thickness. A bounded numerical solve scales
centerlines/face positions while preserving requested physical diameters and
thickness. Review reports the actual mesh bounding box, triangle/shell count,
float64 size residual and the **serialized** size residual (including binary
STL's float32 quantization). Final shell degeneracy/positive volume are checked
again at STL precision. These are approximate tessellated meshes, not exact
algebraic geometry or certified manufacturing output.

Struts below 1.2 mm warn. A bounded nearest-neighbor heuristic warns about close
endpoints and nearly parallel close segment midpoints; this is not exhaustive
collision, clearance or printability analysis. Display clipping diagnostics are
retained; omitted/resource-limited/undefined requested display geometry refuses
export. Morph previews require disabling the preview or promoting the result.
There are limits of 100,000 input records per kind, 500,000 output triangles and
64 MiB serialized output; reduce display complexity or quality on refusal.
General Strut/Panel Boolean unions, nonconvex hollow offsets and drain holes
remain follow-ups. Solid uses the bounded exterior-union path described above.

## Ownership and verification

`prepare-printable-export` is a read-only warm-worker engine operation. Settings
are transient export choices, like the existing format/unit choices; no source,
saved view or construction history is mutated. The existing reviewed geometry
session binds source, metadata, dialog scope, numeric options and display buffer
versions/pose. It rechecks after asynchronous preparation and destination review.
The existing bounded atomic writer copies binary bytes, fsyncs a private sibling
and renames only at publication. Cancellation and stale reviews cannot write.

New tests: `tests/test_printable_export.py` (16 cases),
`tests/printable-export.test.mjs` (10), and
`tests/printable-export-atomic.test.cjs` (3). They verify tesseract perspective
32+16 topology, oriented manifold shells, physical scaling, float32 STL header
and size, 3MF relationships/assembly, real star winding-fill panels, warnings,
NumericEntry, packed/ordinary display capture, stale reviews and atomic bytes.
Focused existing exporter, numeric-entry, pool and renderer tests also run.
Production Vite build passes. A headless Chromium check mounted the actual
ExportControls against native Python computation, reviewed the 100 mm cube
(2,560 triangles, 20 shells), and passed binary bytes to the save bridge.
Electron and physical slicer/printer qualification remain with the lead.

An additional `tests/test_export_context.py` run has 15 passes and one unrelated
failure: `regular('antiprism-j1')` refuses the existing catalog asset hash. The
same refusal occurs directly in the unchanged generator/catalog loader without
importing the new printable exporter.
