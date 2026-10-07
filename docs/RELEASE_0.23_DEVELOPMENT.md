# 0.23 development

The 0.22 community preview and matching source archive remain available. These
additional features are in the working sources:

- Convex 4D expansion/runcination with measured hypervolume, saved parameters,
  four-coordinate centers, source colors, and replay.
- Tidy/spiky filters in the supported bounded automatic faceting search.
- Automatic source labels: IDs, intrinsic edge lengths, coordinates, and
  incidence counts. Existing text and face images are preserved by default.
- Structured catalog count searches, for example `dim:4 v>=24 c:8`.
- Project metadata and notes in JSON geometry exports, with explicit loss
  reporting for formats that cannot retain them.
- Phong material presets, tint/highlights, light intensity/positions, and
  viewport themes, retained through captures, tours, and multiple views.
- Regular-face, equal-edge, and equal-area fitting with residuals, bounded
  solver work, geometric qualification, explicit near-miss adoption, and replay.
- Stephanoids with grounded `n,a,b` steps, retained bow-tie cycles/constituents,
  uniform-hull, self-dual, and custom sizing, plus parameter navigation.
- Tetrahedra from six edge lengths, irregular triangular prisms with optional
  shear, and planar triangular grids, with expressions and physical units.
- Procedural wave/pebble bump and built-in studio reflections, including
  capture readiness and saved display settings.
- Exact rational surface sections of finite 3D faces, including concave/star
  winding intervals and coplanar faces. Rational coordinates and source edge
  parameters are retained; this workflow does not assign a filled interior.
- Stellation cell/dependency diagrams with support and layer selection,
  conservative cavity filling, saved selection Undo/Redo, and SVG export.

Build and short real-app expansion/labels/metadata-export checks pass. The real
app also passed effects shader rendering and PNG capture, cell selection
Undo/Redo and filling, and rational section preview/adoption. Practical
90% parity has not been measured. Generalized constructions and unrestricted
catalog/classification, faceting/stellation, and net domains remain unfinished.
