# 0.24 development

The [0.23 community preview](RELEASE_0.23_PREVIEW.md) is packaged with its matching
GPLv3 source. These additions are in the current working sources:

- Environment-only studio refraction with refractive index 1..3 and expression
  input, retained in native projects. This samples a cube environment; it does
  not trace rays through the object or model object thickness.
- Minimum intrinsic distances between bounded vertices, edges, qualified convex
  face regions and convex 3D cell interiors, including 4D embeddings. Witness
  points, barycentric weights and numerical distance bounds are reported.
  Existing affine-flat distances remain available. Concave/star filled-region
  distance and generalized cell interiors retain explicit refusals.
- Source-preserving nets for closed orientable nonconvex/toroidal 3D shells with
  simple planar concave faces. Cuts, joins, placement, annotations, physical
  packing, folding and saved history use the existing editor. See
  [generalized face-net domains](GENERALIZED_FACE_NETS.md).
- Source-incidence 3D truncation, midpoint rectification and regular-face
  quasitruncation with retained star cycles, source maps and operation history.
  Quasi results preserve closed incidence without claiming a filled-solid volume.
- Three named regular-faced genus-one Stewart toroids: Q3Q3/S3S3, Q4Q4/B4,
  and Q3P6/P3Q3, with retained attributed source stages and numerical regularity,
  aplanarity, hull-edge, topology and intersection checks.
- Two further named Stewart excavations, K3/4Q3(S3) and K3/Q3T3, plus two
  explicitly original variants. These retain source parts and maps, with actual
  genera one through three checked on load. The catalog now has seven entries.
- Whole-cell nets for globally nonconvex 4D shells with complete convex 3D
  source cells, including coplanar shared-face hinges, editing and saved history.
  See [generalized cell-net domains](GENERALIZED_CELL_NETS.md). Intersections
  between arranged cells remain unchecked.
- Direct source-preserving sphere projection with XYZ/XYZW expression controls,
  sensible empty-field defaults, operation replay, and retained element content.
  Newly nonplanar faces/cells are refused. See [sphere projection](SPHERE_PROJECTION.md).
- Expanded whole-cell nets retaining complete ordinary concave 3D cells and
  simple planar concave faces. Display triangulation uses original cell corners;
  mathematical face/cell incidence remains intact. See
  [concave cell-net domains](GENERALIZED_CONCAVE_CELL_NETS.md).
- Optional tidy-dual faceting criteria test actual primal and finite reciprocal
  incidence, independently qualify native polarity, and retain search/replay
  receipts. Infinite planes reject; unresolved reciprocal domains remain unknown.
  See [tidy-dual domains](TIDY_DUAL_FACETING.md).
- [Moving source text and eligible PNG face sheets](MORPH_ELEMENT_CONTENT.md)
  on supported morphs, including repeated owners and reciprocal rank changes.
- [Generalized 3D sizing](GENERALIZED_DUAL_SIZING.md) for finite closed star and
  nonconvex ordinary boundaries, including all four regular stars.
- Searchable offline guide with 21 topics and F1 context for focused controls.

The build and 24 measurement checks pass. A short actual-app check passes
refraction rendering, expression input, native saved settings and opposite 4D
cell distance. Generalized face nets passed three native and two Viewer adapter
groups. No complete regression run or requirement-wide parity closure is claimed.
Quasitruncation adoption and concave net folding/native Save/Open also pass in
the real app. Saved generalized net layouts now use the same new kernel during
native validation and reopening. All three Stewart entries load through the
production catalog with their source counts and genus intact.

All seven Stewart entries load with expected source counts and genera. Sphere
projection passes three native groups; generalized whole-cell nets pass three
native and three controller groups. A short actual-app check passes explicit
sphere expressions and default controls, displayed generalized 4D cell nets,
matching source-face selection, native net Save/Open and a genus-three Stewart
catalog load: `artifacts/sphere-cell-stewart-quick-vVDCuk/result.json`.

Concave whole-cell integration passes six native and two display groups. Tidy-dual
native/UI sanity checks pass. Generalized sizing passes three native and two
Viewer/session groups; moving content passes five production groups. Real-app
moving text/PNG capture, enabled-morph Save/Open and unsupported endpoint refusal
pass; detached-camera initialization was corrected during that check. The offline
guide passes real F1 context, search/empty results, Escape and focus restoration:
`artifacts/guide-quick-w7OtRW/result.json`.
Readable billboard orientation was also corrected and the same actual morph
workflow passes afterward: `artifacts/morph-content-quick-7Zmypa/result.json`.
