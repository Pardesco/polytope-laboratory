# Compound cell review — 2026-11-09

Two separate, pinned correction copies are registered in the offline Library.
Search **Haddet** or **Dathah** in `#search`, then select the row in `#catalog`:

- `data-key="compound-repaired-haddet"`: **Haddet (2 16-cells): corrected cell groups**.
- `data-key="compound-repaired-dathah"`: **Dathah (2 tesseractihemioctachora): corrected cell groups**.

The existing row tooltip and Analysis **Source provenance** show
`corrected from <filename>: cells N,M rebuilt`. Existing catalog loading,
generation history and saved project snapshots apply; no new UI or IPC operation
is needed. Original bytes are retained next to the derived assets under
`engine/catalog_data/compound_repair/`. The original linked-library files, their
hash pins and their inspector diagnostics remain unchanged. Original invalid
cell records are inspectable as source data, but still cannot be adopted as a
validated model. No import validation was weakened.

## Identification and reconstruction

Both files have all sixteen distinct coordinates `(±1,±1,±1,±1)`. Edges of squared
length 8 split that graph into two connected parity classes of eight vertices.
Each class is a 4-orthoplex: four antipodal pairs, 24 edges, 32 triangular cliques
and sixteen tetrahedral cliques. Thus **hex is the 16-cell**, not a guessed label.
The vertex symmetry group consists of all 384 signed coordinate permutations;
every action preserves the reconstructed face cycles and cell groups.

**Haddet** is the two-16-cell compound (demidistesseract / hexadecadistesseract).
Each constituent has V/E/F/C = **8/24/32/16**, Euler 0 and an orientable boundary.
The input format groups the two tetrahedra on each coordinate hyperplane into
one disconnected cell record: sixteen remaining tetrahedra plus eight paired
groups, giving **16/48/64/24** and grouped Euler **8**.

**Dathah** is the paired tesseractihemioctachoron configuration on those same
two parity classes. Within each orthoplex retain the eight coordinate-plane
tetrahedra; omitting each of the four antipodal pairs gives four central regular
octahedra, whose eight triangular faces are derived from the edge graph. Each
constituent has **8/24/32/12**, Euler **4**, and a nonorientable generalized
boundary. These are the cells of a tesseractihemioctachoron, not a tesseract.
Grouping the same eight coplanar tetrahedral pairs gives **16/48/64/16**, grouped
Euler **16**. See [Klitzing's tho incidence and coordinates](https://bendwavy.org/klitzing/incmats/tho.htm)
and [his name index, Haddet](https://bendwavy.org/klitzing/explain/index.htm).
Identification follows the reconstructed incidence; the names alone are not evidence.

The grouping convention matters: each paired cell record has two disjoint
tetrahedral surfaces, boundary Euler **4**, not the ordinary 3-cell value 2.
Both corrected entries remain **generalized complexes**. They assert neither
a filled solid nor an ordinary spherical cell decomposition. Component Euler
checks are performed on the ungrouped constituents. The loader exposes the
ungrouped constituent-to-source face maps in `metadata.compoundCellReview`.

## The corrupted records

Cell IDs and face IDs below are **zero based**, matching the importer diagnosis.
Faces 48–51 and 56–59 lie on `w=-1`; faces 52–55 and 60–63 lie on `w=+1`.
The source instead joins each consecutive run of eight faces, mixing both planes.

| Source | Cells replaced | Correct face IDs, respectively |
| --- | --- | --- |
| `2hex-Haddet.off` | 22, 23 | `48 49 50 51 56 57 58 59`; `52 53 54 55 60 61 62 63` |
| `2tho-a-Dathah.off` | 6, 7 | same two face lists |

Reconstruction uniquely determines the unordered pair of missing cell groups;
their IDs follow the source's negative/positive coordinate-plane ordering.
Every other record, comment, coordinate, face cycle and newline is **byte-for-byte
unchanged**. Every reconstructed constituent cell and corrected cell group has
affine rank three and relative flatness residual below `1e-9`. Worst corrected
residuals are **1.39e-16** (Haddet) and **1.67e-16** (Dathah), versus **0.5** before.
Residuals use the maximum point-to-affine-fit distance divided by coordinate span 2.
These are float64 checks, not an exact algebraic certificate.

| Asset | SHA-256 |
| --- | --- |
| Original Haddet | `ce3346a17176df5b323a321c93b1cbf72a8659f36c769ae12c7cfa3ebe86ad85` |
| Corrected Haddet | `b9d012a0913d8c65832fa5e7da3296c7cf144ad7eaae797794e17c1fbd1de4fa` |
| Original Dathah | `1fcba6e5b53a74f43c80e69e5593a3741896b34d7a0b93721cb74309ba91bec0` |
| Corrected Dathah | `7aa92a7e225099e9088944e43674764708b91bbbc46106b545903985518bc7ab` |

The bounded loader verifies both source and copy pins and independently rebuilds
the correction before returning it. It calls **no Qhull/native hull routine**.
Duplicate, nonfinite or degenerate input and any broader incidence defect are
refused, rather than joggled, welded or replaced by a whole-compound hull.

## Named-count cross-check

[Generated count table and registration comparisons](COMPOUND_CELL_NAMED_COUNTS_2026-11-09.json)
cover **149 classical identities**: all 64 O-indices (including 18 fixed
polyhedron-prisms), U1–U75, and ten Schläfli–Hess stars. The table has 150 keys
because tesseract and cube-prism both represent O10. Five additional actual
family constructions cover the 17-prism, 17-antiprism, 5-antiprism-prism,
3×5 duoprism and 7×11 duoprism.

Reused `engine.catalog_audit` generates Wythoff orbit counts by parabolic
stabilizers `|G|/(|G_S||G_Z|)`; full-ring tests independently check group orders
as products of invariant degrees. Rational Wythoff triangles enumerate U-model
cosets numerically, including collapsed alternating polygons and coincident
seeds. Snubs, U75 and grand antiprism retain explicitly stated local-incidence
derivations because they are not ordinary ringed Wythoff cases. The ten regular
stars are additionally recomputed from finite triangle-group cell/vertex-figure
orbits and H4 vertex stabilizers, without copying a polyhedral face-vector table.

The scan matches mathematical names across **every catalog registration**,
normalizing explicit synonyms such as “24-cell” / “icositetrachoron” and the
known “semisnub” / “snub 24-cell” synonym. It also checks existing independently
mapped keys. All **270 matching registrations**, including attributed duplicates,
were loaded in isolated audit workers and compared to the computed expectations.
**No name/count mismatch was found; no relabeling was justified.** Counts are a
necessary identity check, not a proof: several distinct regular stars have the
same face vector. Unknown names are not identified from counts alone.

Regenerate the machine-readable table from the repository root:

```powershell
python -m tests.test_named_counts docs/COMPOUND_CELL_NAMED_COUNTS_2026-11-09.json
```

## Verification

```powershell
python -m pytest tests/test_compound_repair.py tests/test_named_counts.py -q -p no:cacheprovider
python -m pytest tests/test_catalog_audit.py tests/test_catalog_registry.py tests/test_antiprism_catalog.py -q -p no:cacheprovider
node --test tests/catalog-loading.test.mjs tests/catalog-discovery.test.mjs tests/library-visual.test.mjs tests/engine-op-allowlist.test.cjs
npx.cmd vite build --configLoader native
```

Focused package: **579 passed**; existing Python regressions: **416 passed**;
Node regressions: **36 passed**. Production build passes with the existing
dynamic-import/chunk-size warnings. Electron was not launched. The original
source representations remain invalid, and generic ordinary-cell/solid tools
must continue to respect the generalized grouped-cell interpretation.
