# W16 — colored and displayed geometry interchange

File toolbar **Export** opens `export-dialog`. **Geometry** (`export-source`)
selects Model or Derived result. Sections, duals and vertex figures retain their
existing intrinsic export path. Flat/folded face nets and cell nets now also
appear as Derived result, without promotion or a construction-history change.
Net assemblies use Displayed geometry and its explicit physical-size control.

Choose **Export type → Displayed geometry (GLB / colored surfaces)** in
`export-kind`. Set **Longest dimension (meters)** (`interchange-size`, default
0.1; NumericEntry expressions accepted), then **File format** (`export-format`).
Review triangle/line counts, losses and the GLB float32 size residual in
`export-preview`; **Choose file & export** is `confirm-export`.

Displayed output supports GLB, OBJ/MTL, X3D, OFF, JSON, STL, DXF, VRML and POV.
It copies the selected viewport's published 3D projection/rotation, winding-fill
triangles, visibility and colors, including source, face and element-type
palettes. Observer camera position/zoom does not rotate or scale the exported
object. Physical size is explicitly chosen because viewport buffers are
normalized display coordinates. GLB and displayed VRML use meters; the other
formats use Output units (`export-units`). X3D declares its physical length
conversion in `head/unit`. Unitless intrinsic X3D retains supplied coordinates
without inventing a physical source-unit conversion.

GLB is glTF 2.0 binary with aligned JSON/BIN chunks, float32 POSITION/COLOR_0
accessors, explicit position bounds, flat RGBA face colors, double-sided PBR
surfaces, LINES and visible POINTS. Source components become child mesh nodes
below the model root. Title/author/description and other document metadata are
in `asset.extras`; physical size and meter units are also recorded. Face colors
are copied in linear space, including surface opacity. `validate_glb` validates
this emitted subset (header, chunks, lengths, accessor bounds/values, color
counts and node tree); it is not a general-purpose glTF conformance validator.
The layout is based on the [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Intrinsic OBJ and X3D also retain supplied face RGB/RGBA colors. OBJ writes one
MTL material per distinct face color and includes source line records. Export
creates an exclusively named `polytope-materials-<uuid>.mtl` beside the selected
OBJ, fsyncs it, then atomically replaces the OBJ with its actual MTL reference.
Failure/cancellation removes the unreferenced companion and preserves the prior
OBJ. Keep the pair together. Existing materials are never overwritten; an older
companion can remain after successfully replacing an older OBJ. A process crash
between the two writes can leave an unreferenced material file. Native `export`
returns both text/materials, or writes this same exclusive companion convention
when a path is supplied. X3D writes XML IndexedFaceSet with
`colorPerVertex="false"`, ColorRGBA and IndexedLineSet. Legacy VRML is retained.

Displayed STL/POV encode triangle **surfaces**, with an explicit warning that
closedness, outward orientation and printable solid status are not asserted.
The existing Printable export type remains the route for thickened struts,
panels and qualified solid shells. GLB lines/points have no physical thickness.
OFF omits standalone lines and points with honest boundary-edge counts; DXF
exports edges only; legacy VRML omits face colors and standalone lines. Display
triangulation loses original face incidence and intrinsic 4D cells. Notes,
annotations, textures, labels, net tabs/paper packing, lighting and material
effects are not reproduced. Flat/page net export uses the underlying layout
faces, not printed pages. Morph previews and incomplete/unsupported fills refuse
export. Curved stereographic geometry is its displayed tessellation. Geometry
is approximate: GLB reports serialized size residual in meters; no exact or
manufacturing guarantee is added. Input records are bounded at 100,000 per kind,
components at 1,024, and displayed serialization at 64 MiB.

## DXF import breadth

Binary DXF's `AutoCAD Binary DXF` sentinel is detected before UTF-8 decoding;
the error requests ASCII DXF. 3DSOLID/REGION/BODY refuse with an ACIS diagnostic
and a request for tessellated 3DFACE or POLYLINE meshes. No partial model returns.

Straight LWPOLYLINE supports open edge chains and closed planar face cycles,
elevation, arbitrary-axis OCS-to-WCS conversion, and repeated closing corners.
Bulges, widths and thickness refuse; curves are not silently chorded. Group 90
counts and per-vertex records are checked. See Autodesk's
[LWPOLYLINE group definitions](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm).
Unfitted POLYLINE polygon meshes (flag 16) support ordered M×N grids and closed
M/N seams with explicit count/SEQEND/planarity checks. Nonplanar quad patches,
fitted/smoothed grids and ordinary 3D polylines remain unsupported. Existing
polyface signed edge indices, advisory counts and source styles are preserved.

Each nonempty layer becomes a native component with complete incidence maps.
Welding is confined to a layer, so coincident coordinates on distinct layers
remain independently selectable/exportable components. Layer/entity styles,
original source coordinates and welding diagnostics remain in DXF metadata.
Planar DXF remains a 3D-embedded generalized complex with affine dimension 2;
closed paths are boundary faces, not an inferred union with holes or solids.

## Verification

`tests/test_interchange.py` covers cube/tesseract GLB counts/colors/bounds,
corruption rejection, component hierarchy, OBJ/MTL independent color reading,
X3D XML, every displayed section format, DXF sentinel/ACIS/LWPOLYLINE/polygon
meshes/layer components. Existing format/domain tests now expect X3D and OBJ
line/material retention.

`tests/interchange-controls.test.mjs` exercises actual Viewer buffers, 4D
projection, derived sections/duals/vertex figures, net layouts, NumericEntry,
review ownership and native dispatch. `tests/interchange-atomic.test.cjs`
checks companions, cancellation, fsync/rename failures and binary byte copying.
`tests/interchange-mounted.test.mjs` mounts the actual dialog in headless
Chromium against Python and reviews/saves GLB and OBJ/MTL, then checks derived
X3D XML, units and all nine displayed format choices. These are included in
`test:features`. No Electron launch or external DCC application qualification
is claimed.

Final focused run: 166 Python tests and 158 Node tests passed (including the
mounted Chromium check). `npx.cmd vite build --configLoader native` passed with
the existing large-chunk warning. No dependencies or version were changed.
