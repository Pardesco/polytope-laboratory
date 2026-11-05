# Bundled catalog geometry audit — 2026-11-05

Run from the repository root:

```powershell
python -m engine.catalog_audit --date 2026-11-05 --jobs 6 --timeout 90
```

Outputs: `artifacts/catalog-audit/2026-11-05/report.json`, `summary.md`, and
`checkpoint.jsonl`. Proven compactions also write correction copies under
`repairs/` and a SHA-256-pinned `repairs.json`. Exit 0 means no failed checks; exit 1 means findings were
recorded, including coincident compound vertices. Exit 2 means invalid CLI
arguments or a refused resume. No Electron launch, engine IPC registration,
renderer controls or dependencies are needed. To inspect a correction in the
app, use **Open** (`#open`) and select the corresponding repaired OFF file.

`--keys cube tesseract antiprism-u3 sample-duoprism-3x5` selects a quick subset;
`--no-data` omits the Drive assets. Use a different `--output` directory for a
subset. `--resume` requires the same selected inventory, timeout and SHA-256 of
the engine sources, catalog manifests/assets and bundled data. A truncated last
checkpoint row is diagnosed rather than silently accepted. The report records
Python/NumPy/SciPy versions and the input content hash. Timings are observational.

## Coverage and definitions

Default inventory: 1,594 actual application catalog-loader entries, 3,064 OFF
files under `data/`, and five explicit family samples (17-prism, 17-antiprism,
5-antiprism-prism, 3×5 and 7×11 duoprisms): **4,663 items**. Registered sources
use `generators.regular()` and therefore retain actual application dispatch,
asset-pin and incidence checks. Raw data uses a separate literal reader, sharing
the importer's boundary/color parser. It deliberately avoids hull recognition
and continues past a wrong edge-count header so geometry can still be measured.
`loadingMode` distinguishes these paths; raw-data success is not an app-import
certificate. Known regular/convex 4D Bowers abbreviations select explicit identity
expectations for corresponding raw assets; other filenames grant no uniformity.

Every check reports `pass`, `fail`, or `not-applicable` with evidence. Float64
checks use **1e-9**; no result certifies exact algebraic coordinates.

- Counts compare both retained manifests and an independent 221-key expectation
  table. The table never reads a retained count field to derive its values.
  Convex Wythoff ranks use integer parabolic stabilizers: an admissible mirror
  subset S contributes `|G| / (|G_S| |G_Z|)`, where Z consists of unringed mirrors
  outside S commuting with S. Each connected component of S must meet a ring.
  This covers all 64 finite convex uniform polychoron indices, including interval
  products. Snub 24-cell counts use degree nine and its 24 icosahedral/120
  tetrahedral cells; grand-antiprism counts use the two removed decagons, degree
  ten and its 300 tetrahedral/20 pentagonal-antiprism cells.
- All 75 classical uniform polyhedra have independent expectations. Rational
  Wythoff triangles enumerate bounded finite reflection-group cosets independently
  of supplied assets; coincident seed orbits are retained and collapsed
  alternating polygons are excluded. These are numerical constructions with
  explicit closure residuals (observed maximum approximately `1.04e-14`). Snub
  counts use proper-group vertex orbits and local polygon incidence. Exceptional
  U75 uses its eight-face vertex configuration and the same 60-vertex proper
  icosahedral orbit. Mirror variants retain the source expectations.
- Ten regular star polychora use the 120- or 600-vertex H4 orbit and independent
  local cell/vertex-figure incidence: `E=V*VF_V/2`,
  `F=V*VF_E/(face vertex count)`, `C=V*VF_F/(cell vertex count)`.
  Numerator polygon sizes, rather than rational winding denominators, count
  vertices. Uncovered families explicitly have no independent count assertion.
- Euler reports `V-E+F` in 3D and `V-E+F-C` in 4D. Expected 2 / 0 applies to
  sources declaring convex/spherical topology. Generalized/star/compound values
  remain visible without a spherical assertion.
- Equal edges reports maximum deviation from the mean divided by the mean,
  plus full relative spread. Only declared uniform sources receive pass/fail.
- Face planarity / cell flatness report the largest orthogonal affine-fit
  residual divided by whole-model maximum coordinate span, and require affine
  rank two / three. Intrinsic model rank and edge ownership are also checked.
- Vertex-figure signatures compare degree, incident polygon sizes, incident cell
  V/E/F signatures and sorted vertex-link chord lengths. Equality is a necessary
  local invariant, **not a proof of vertex transitivity or regularity**.
- Ridges count every face-cycle edge in 3D and every face's owning cells in 4D.
  Declared nonordinary/compound conventions are identified explicitly.
- Duplicate vertices include literal duplicates, minimum normalized separation
  and the number of vertices within tolerance. Coincident abstract compound
  vertices are reported and never welded.
- Orientation solves signed incidence constraints, first on cell surfaces and
  then between cells. In 3D, source-cycle conflicts are also reported. A pass
  means a consistent orientation exists after face/cell reversals; application
  storage does not require all face cycles to arrive outward. Nonorientable
  generalized complexes are reported as such, without assuming a defect or
  changing them.

Each job runs in a persistent isolated Python worker. A timeout or native exit
produces a failed load record and replacement worker. All worker Qhull entry
points receive a finite/full-rank preflight; raw OFF and residual checks never
call Qhull. Windows worker error modes suppress native crash dialogs. This does
not replace the app's existing resource/validation gates.

## Findings and repairs

Full run and unchanged-input resume both completed **4,663 / 4,663** items:
**4,623 pass; 40 retain findings** on their original source representation.
All 3,064 asset pins matched. All 4,663 face-planarity checks passed; no worker
timeout or native exit occurred. The 40 consist of 38 coincident-vertex findings
(including the three repaired originals and legitimate compound coincidences)
and two nonflat-cell sources. Twelve header mismatches overlap those findings.
The three correction copies have no failed applicable checks. Source-content
SHA-256 was independently recomputed after completion and remained unchanged.

All 1,594 registered entries loaded and matched their retained counts. All 221
independent count checks passed, as did every applicable uniform-edge and
vertex-figure check. Maximum observed catalog relative residuals were
`5.17e-13` for uniform edge deviation, `3.49e-11` for face planarity and
`3.39e-11` for cell flatness. Twenty-three compound registrations contain
coincident abstract vertices; they remain separately indexed. Do not
interpret generalized orientability or coincident compound vertices as a reason
to replace a star/compound by its convex hull.

Three raw assets have a proven additional defect: unused vertices that are exact
duplicates of vertices used by the boundary. Removing only those unused records
restores the independent expected face vectors, Euler and local vertex figures.
No used vertex is welded or moved, and all ordered boundaries, cells and color
suffixes survive. All three copies import as `convex-polytope`, pass the app's
native validation and all applicable audit checks. The source reports retain the original failures alongside each
repair's complete after-checks.

| Source under `data/drive-uniforms/` | V before → after | Euler before → after | Local signature classes before → after | E header before → after |
| --- | ---: | ---: | ---: | ---: |
| `Cat13/512-Spic.off` | 240 → 144 | 96 → 0 | 2 → 1 | 576 → 576 |
| `Cat19/901-Tiddip.off` | 122 → 120 | 2 → 0 | 2 → 1 | 241 → 240 |
| `Cat19/911-Iddip.off` | 62 → 60 | 2 → 0 | 2 → 1 | 151 → 150 |

Used-coordinate residual is **0** for each compaction. After-repair maximum edge /
face / cell residuals are respectively `1.71e-15 / 1.94e-16 / 3.74e-16` for Spic,
`3.25e-16 / 5.54e-16 / 2.81e-16` for Tiddip, and
`1.80e-16 / 2.41e-16 / 3.40e-16` for Iddip. Copy pins:

```text
512-Spic.off   0f5cec328249d6772a3415722c1b134e4951a9ee9eb479047ae084f9a6c7c1e9
901-Tiddip.off 6c70b88f3d796200879179e55b6678a75c7c10aa549bd7cb1c2a5fb31d1f9b73
911-Iddip.off  e5e6522f89f45037776001b535a2af3a184b93cdac87847466d5644584a256bd
```

**Worktree boundary:** `data/` resolves through a junction to
the main checkout's `data/` folder, outside the audit worktree.
Original files and download-manifest pins therefore remain intact. Correction
copies and their new pins live inside this worktree's artifact directory,
following the application's existing correction-copy policy. The CLI recreates
them, so ignored artifact/data files need not be merged as source changes.

Twelve Drive headers have the already documented nonzero edge-count mismatch;
two are also covered by the compactions above. Existing **Save corrected
edge-count copy** (`#library-repair-copy`) handles header-only corrections.
Changing a header alone does not remove isolated duplicate vertices. The audit
also finds unused vertices in the other ten header-mismatch files; three contain
coordinates that are not exact duplicates. Those lack independent identity
expectations here, so no automatic compaction is claimed. See the source reports
and the earlier importer evidence in `engine/library_audit.py`.

Unverified discovery candidates include nonorientable generalized 4D boundaries.
They retain their local/global orientation results, measured Euler values and
classification scope. Specialist review must decide whether each is an intended
abstract complex or a defective intended spherical polytope. Coincident vertices
in attributed/generated compounds likewise require their abstract component
interpretation; automatic welding would change incidence. No catalog asset or
loader correction is justified solely by either observation. Specialist review
also remains necessary for two rank-four compound-cell sources:
`Compounds/2demitessic/2hex-Haddet.off` (cells 22, 23) and
`Compounds/2demitessic/2tho-a-Dathah.off` (cells 6, 7). Their maximum relative
flatness residual is **0.5**, versus tolerance `1e-9`. Both are the prior
importer's diagnosed non-3D cells; a replacement 3-cell cannot be inferred from
the source labels. Original source bytes and pins were not changed.

## Regression checks

`tests/test_catalog_audit.py` is automatically included by the existing pytest
suite. It covers all expectation registrations plus a fast actual-model subset:
Platonic/snub/star/hemi/U75, regular/rectified/snub 4D, a regular star polychoron,
prisms/antiprisms/duoprisms. Negative fixtures cover distorted edges/faces/cells,
duplicate vertices, missing ridges, altered local figures, bad indices,
nonorientable generalized boundaries, header mismatches and degenerate raw OFF
without Qhull. CLI tests cover resume/source-change refusal and worker
timeout/native-exit reporting, guarded native hull entry, and exact preservation
of used coordinates, source bytes and colors in correction copies.

```powershell
python -m pytest tests/test_catalog_audit.py tests/test_catalog_registry.py tests/test_antiprism_catalog.py -q -p no:cacheprovider
node --test tests/catalog-loading.test.mjs tests/catalog-discovery.test.mjs
npx.cmd vite build --configLoader native
```

Validation: **416 Python tests passed** (46 new audit tests and 370 existing
catalog tests); **20 Node tests passed**; Vite production build passed with its
existing chunk-size/dynamic-import warnings. Electron was not launched.
