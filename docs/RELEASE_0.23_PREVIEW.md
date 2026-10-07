# 0.23 community preview

The Windows x64 portable and matching GPLv3 source archive are available locally:

- `release/preview-0.23.0/Polytope Laboratory 0.23.0 preview.exe`
- `release/Polytope Laboratory 0.23.0 source.zip`

This checkpoint includes the earlier 0.22 workflows plus convex 4D expansion,
condition fitting, automatic source labels, metadata JSON export/reopen,
structured catalog queries, material/lighting themes, wave/pebble bump, studio
reflection, stephanoids, edge-defined tetrahedra, irregular triangular prisms,
triangular grids, exact rational 3D surface sections, and stellation cell diagrams.
See [the feature notes](RELEASE_0.23_DEVELOPMENT.md) for scope.

The actual portable passed with development Python unavailable, including
catalog loading, 3D/4D expansion, edge-defined tetrahedron generation, exact
section dispatch and independent views. Every current source hash matched the
source archive at qualification. Source-app checks additionally exercised the
effects shader/capture, rational section adoption, cell selection Undo/Redo,
labels, fitting and metadata export/reopen.

Receipts: `artifacts/community-preview-0.23.0.json`,
`artifacts/source-package-0.23.0.json`, `artifacts/source-pair-0.23.0.json`,
and `artifacts/preview-portable-quick-6LhATu/result.json`.

Development continues in 0.24. Environment refraction, bounded face/cell
measurements, and generalized nonconvex face nets are later changes and are not
in this 0.23 executable or its corresponding source archive. No full regression
or measured 90% Stella4D parity is claimed. Broad generalized construction and
catalog coverage remain unfinished.
