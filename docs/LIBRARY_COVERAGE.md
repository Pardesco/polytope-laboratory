# Library coverage and navigation (W8)

The native convex registry covers all 47 non-prismatic convex uniform polychora:
9 A4, 12 additional B4, 9 F4, 15 H4, the snub 24-cell and grand antiprism.
The six existing regular keys remain unchanged. There are also 18 native
convex polyhedral prisms; the cube prism duplicates the tesseract, so these
65 records represent 64 distinct finite cases. Attributed Miratope meshes
remain separate records with their original classification qualifications.

The manifest is `engine/catalog_data/convex_uniform4.json`. Its V/E/F/C facts
and Olshevsky indices follow the [published convex tables](https://en.wikipedia.org/wiki/Uniform_4-polytope).
The retained builder `scripts/build-convex-uniform-manifest.py` reproduces the
registry and checks every generated boundary against those independent counts.
Cell inventories identify convex uniform cell boundary signatures (V/E/F and
polygon multiplicities); they are checked against the existing polyhedron
catalog. Bowers acronyms, O indices, Coxeter family and ring diagram are metadata.
`x` means ringed, `o` unringed, and numbers between nodes are Coxeter orders.
The grand antiprism has no Wythoff ring diagram. The snub 24-cell and snub-base
prisms use explicit snub notation instead of an ordinary binary mask.

Native Wythoff entries exhaust the existing finite reflection orbit, then
enumerate faces as parabolic subgroup orbits. The existing numerical closure
and orbit-size checks remain in force. This handles the 14,400-vertex H4
omnitruncation without raising the general Wythoff control's 4,096 default.
The snub 24-cell removes a 24-cell from analytic 600-cell coordinates; the
grand antiprism removes two orthogonal decagons. Polyhedral prisms use a
height equal to the base edge length. Native entry loads check counts and
record relative edge-length spread in `uniformVerification`; coordinates and
predicates are float64, with no exact certificate. Existing analysis and project
validation still perform their independent convex checks.

All 75 existing Antiprism U1–U75 sources remain reachable. C (Coxeter), W
(Wenninger), and K aliases come from the factual crosswalk in
[Antiprism's uniform table](https://github.com/antiprism/antiprism/blob/master/base/uniform.cc),
whose downloaded SHA-256 is retained in `uniform_crosswalk.json`. Existing
names, source Wythoff symbols and geometry are preserved. U75 is the exceptional
non-Wythoffian case; its source string is a conventional pseudo-symbol.
U numbers refer to polyhedra; use O1–O64 for convex polychora to avoid ambiguity.
The attributed 75 includes the conventional U75 edge-degenerate exception.

## Click-through

- Library → **Geometry properties** (`library-properties`): **Symmetry group**
  (`library-symmetry`), **Convex / star** (`library-shape`), **Vertex transitive**
  (`library-vt`), **Uniform** (`library-uniform`), **Regular** (`library-regular`),
  **Chirality** (`library-chiral`). Unknown metadata never matches yes/no filters.
- Search (`search`) supports AND-combined terms: `faces:12`, `v<100`,
  `e>=30`, `cells:8`, `dim:4`, `symmetry:Ih`, `symmetry:[3,3,5]`,
  `uniform:true`, `regular:false`, `vt:true`, `convex:true`, `shape:star`,
  `chiral:unknown`, quoted phrases, Bowers acronyms and U/C/W/O numbers.
  Number aliases match complete numbers (`U1` does not match `U10`). The search
  tooltip documents syntax. Queries compile once per render; only 250 result
  buttons mount, while filtering still visits the full catalog.
- Analysis → **Related** (`library-related`): buttons with
  `data-related-key` open explicit dual, rectified/truncated, cell type and
  vertex figure type entries through the existing cancelable library loader.
  Try Tesseract → Dual / Rectified / Truncated / Cube / Tetrahedron;
  `gap` → Tetrahedron / pentagonal antiprism; `rox` → Icosahedron / Octahedron.
  Cell and vertex figure links identify types; catalog scale/proportions can differ.
- Construct → **Create a model** → **Uniform prism families**
  (`uniform-family-settings`). Choose family (`uniform-family`), enter expressions
  in n/m (`uniform-family-n`, `uniform-family-m`), then **Create uniform model**
  (`generate-uniform-family`). Includes 3D prism/antiprism, 4D equal-edge duoprism
  and 4D antiprismatic prism. Polygon counts 3–200; duoprisms at most 4,000 vertices.
  Unequal n/m automatically receive different circumradii to keep all edges equal.
  NumericEntry protects source and input ownership, export, and cancellation.
  Generation uses the existing new-document snapshot workflow; later modifications
  retain normal Undo/Redo. Family parameters persist in native provenance.

## Qualification and limits

No mathematical classification is inferred from linked folders or unverified
Miratope directory names. Chirality means chirality in the entry's intrinsic
dimension; a 4D prism of a chiral 3D base has a reflection in its interval axis.
Type links require explicit catalog identities; arbitrary imported models and
uncatalogued/nonuniform vertex figures do not acquire guessed links. Polygonal
prism/antiprism library samples cover n=3–12; the construction controls cover
the larger parameter domain. Large convex analysis/save validation retains the
existing independent hull resource costs. The largest H4 entry generated in
3.14 seconds and completed existing analysis in 15.17 seconds in this worktree.
Electron was not launched here.

Catalog `.gitattributes` preserves byte hashes across Windows checkouts. This
worktree initially had CRLF-converted Antiprism adapted assets and license/notice
files; restoring LF bytes was accepted only where the original recorded SHA-256
matched. Original Antiprism `sources/*.off` tool output explicitly retains CRLF;
the Skilling adapted asset retains LF. Miratope raw sources and their retained
license use their pinned CRLF bytes. Hash validation was not relaxed, and source
geometry was not repaired.

## Tests

`python -m pytest tests/test_library_navigation.py tests/test_catalog_registry.py tests/test_reference_library.py -q -p no:cacheprovider`
checks every one of the 65 native entries against published counts, cell
inventories, equal edges, circular face vertices and two-cell ridge incidence;
also independent Qhull/OFF comparisons, source crosswalks, parameter bounds,
deterministic regeneration and project persistence: **117 passed**.

`python -m pytest tests/test_antiprism_catalog.py tests/test_uniform_snub_variants.py tests/test_miratope_catalog.py -q -p no:cacheprovider`
checks the existing full attributed polyhedron coverage and reflected sources:
**390 passed**.

`node --test tests/library-navigation.test.mjs tests/catalog-discovery.test.mjs tests/catalog-loading.test.mjs tests/construction-workflow.test.mjs tests/renderer-contract.test.mjs tests/uniform-snub-variants.test.mjs tests/antiprism-controls.test.mjs`
checks aliases, property queries, 3,500-entry traversal, mounted filter/Related
controls, loader behavior and atomic family construction. The new test is included
in `test:features`: **53 passed**. Renderer build:
`npx.cmd vite build --configLoader native` passed with the existing large-chunk warning.
