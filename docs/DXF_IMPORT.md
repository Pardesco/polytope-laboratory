# Bounded ASCII DXF import

`engine.dxf.parse_dxf(text, name='DXF import', weld_tolerance=0.0)` returns an
existing validated Model with supplied WCS XYZ coordinates, ordered face cycles,
edges and source metadata. This module is ready for importer integration; it
does not add a desktop format picker or change the existing OFF/JSON importer.
No new dependency is required. No hull, tessellation or solid interior is inferred.

## Supported source geometry

- `3DFACE`: three or four corners. A triangular face repeats the third corner
  in the fourth slot, or omits the fourth corner. A supplied fourth corner must
  include its X/Y components. Optional Z components default to zero. Quad
  planarity and all boundary incidence receive the existing kernel validation.
- Polyface meshes: `POLYLINE` with flag 64, coordinate `VERTEX` records with
  flags 192, face `VERTEX` records with flag 128, and terminating `SEQEND`.
  Faces have three or four contiguous nonzero signed local indices; zero ends
  a face. Indices are one-based in the mesh's coordinate-vertex table.
  Coordinate and face records may be interleaved or faces may come first;
  indices are resolved after collecting the mesh. Header vertex/face counts
  are advisory, as documented by Autodesk. Mismatches are retained as explicit
  warnings, while out-of-range or malformed incidence is rejected.
- `LINE` and `POINT`: finite WCS coordinates, including mixed face/line/point
  drawings. Zero-length or weld-collapsed lines are rejected. Identical source
  lines share one model edge with multiple source references.

Every result is `generalized-complex`, with `dimension=3` and
`embeddingDimension=3` describing the imported XYZ domain. The independently
measured coordinate span is recorded as `metadata.dxf.affineDimension` and may
be 0, 1 or 2 for points, lines or planar drawings. A cube boundary is still a
source surface here; successful validation does not assign convex solid volume
or certify manifoldness. Faces retain supplied order and distinct source
identity, even when two supplied face records coincide.

[Autodesk 3DFACE](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-747865D5-51F0-45F2-BEFE-9572DBC5B151.htm),
[Polyface meshes](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-96B6288E-F413-46C0-968A-A314171C0AAE.htm),
[VERTEX indices and flags](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D.htm),
[WCS/OCS distinction](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-D99F1509-E4E4-47A3-8691-92EA07DC88F5.htm).

## Units, colors and visibility

The importer keeps `metadata.dxf` separate from mathematical incidence:

- `$INSUNITS` code and unit name (0–24), `$ACADVER` when present, and
  `coordinatesScaled=false`. Missing units remain `unspecified`. `$INSUNITS`
  is an insertion-unit declaration, not an independent measurement of physical
  dimensions. No coordinate conversion or guessed scale is applied.
- Layer names and table records, frozen flags, signed ACI off-state, entity
  visibility, handle and extrusion direction. WCS coordinates are unaffected
  by an extrusion normal when entity thickness is zero.
- ACI indices and `bylayer`/`byblock` modes; known layer colors are recorded as
  resolved layer references. Code 420 retains the exact packed 24-bit value and
  extracted RGB channels; it takes precedence as the recorded color method.
  Color names and raw 32-bit transparency codes are retained when supplied.
  The module does not invent an RGB palette for an ACI index or resolve a
  BYBLOCK color without a supported block context.
- Each source face's hidden boundary-edge positions and global edge IDs.
  Negative polyface indices hide the edge **starting** at that index. `3DFACE`
  mask bits refer to its four original corner slots; a triangle's fourth slot
  repeats the third corner, so bit 8 applies to its closing boundary and bit 4
  applies to a collapsed source slot. The original mask remains recorded.

Hidden edges, invisible entities, off/frozen layers and colors do not delete
vertices, faces or edges. Shared boundaries retain per-source-face visibility;
there is no misleading global edge removal. Metadata is JSON-serializable for
native project persistence. Applying CAD visibility/palettes in the renderer
is a separate integration step.

[Autodesk common entity codes](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-3610039E-27D1-4E23-B6D3-7E60B22BB5BD.htm),
[Layer codes](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-D94802B0-8BE8-4AC9-8054-17197688AFDB.htm),
[HEADER units](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm).

## Explicit welding and source mapping

Tolerance zero merges only exactly equal coordinate triples, allowing shared
corners in separate `3DFACE` records to have shared model incidence. A positive
`weld_tolerance` is an absolute Euclidean distance in the supplied coordinate
units. It is independent of display scale and kernel validation tolerance.

The first retained vertex within tolerance is the representative. Coordinates
are never averaged; a sequence of nearby points is not transitively merged
through points that were themselves already welded. Processing is deterministic
for the supplied record order. A spatial grid bounds candidate lookup, and an
explicit comparison budget rejects pathological work.

`sourceVertexMap` records the entity/slot, original coordinate triple and retained
model vertex for every imported coordinate occurrence; polyface face dummy
coordinates are not geometric vertices. `edgeSources` and face source mappings
retain original entity and boundary identities. If welding collapses an edge,
duplicates a face corner or invalidates a face, the entire import fails. The
provenance records text SHA-256, algorithm version and welding tolerance.

## Rejection and resource contract

Binary DXF, unsupported source entities (including arcs, circles, ordinary or
lightweight polylines, splines, inserts, modern MESH, SOLID and text), nonempty
block definitions, nonzero thickness and paper-space geometry are rejected.
Empty named block definitions are allowed. Fitted, bulged or widened polyface
vertex data is rejected. Standard class/object metadata sections do not supply
geometry and may be ignored with their section names recorded. Unknown sections
are rejected. No supported prefix of a mixed unsupported drawing is returned.

Group-code/value pairs, section/table delimiters and EOF must be complete;
duplicate scalar fields, duplicate sections/layers/header variables, malformed
numbers, gaps in face indices and orphan/missing sequence markers fail with a
DXF diagnostic. Coordinate magnitudes are bounded to 1e100, and all coordinates
and tolerances must be finite. Integer and decimal numeric grammar is explicit.

Limits: 128 MiB UTF-8 text, 1,000,000 group pairs, 100,000 entity records,
100,000 source coordinate occurrences, 20,000 retained model vertices and
1,000,000 welding distance comparisons. Exhausting a budget rejects the import;
it does not silently truncate geometry. This domain is deliberately narrower
than general AutoCAD interchange.

## Validation evidence

Run `python -m pytest tests/test_dxf.py -q`. The current 64 tests pass and use
hand-authored cube, tetrahedron, line, point and polyface fixtures rather than
hull-derived expectations. They verify actual coordinates/cycles, independent
counts, units/colors/layer visibility, source maps, negative-index hidden edges,
interleaved mesh order, JSON metadata persistence, explicit welding and source
preservation. Negative cases cover unsupported mixed geometry, nonplanar faces,
collapsed incidence, malformed numerics/structure/indices, blocks/thickness,
integer/Unicode failures and resource/comparison limits.

DXF import completion does not imply native CAD editing, solid Boolean
reconstruction, arcs/spline tessellation, arbitrary block transforms, universal
entity coverage or complete `IO-01` competitor conformance.
