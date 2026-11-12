# Corpus reconciliation

The ordinary Library now has a collapsed **Corpus coverage** panel (`library-corpus`). Open it or press **Review coverage** (`corpus-refresh`), choose **Corpus family** (`corpus-group`), **Named corpus identity** (`corpus-identity`) and **Source realization** (`corpus-realization`). **Open source model** (`corpus-open`) uses the existing catalog/document loader. **Check numerical geometry** (`corpus-verify`) audits that one source; `corpus-audit` shows residuals and separate coordinate/incidence hashes. No Expert mode is required. This is read-only analysis: it does not alter geometry, project history or saved documents.

## First manifest

`engine/catalog_data/corpus_reconciliation.json` is a versioned, reproducible crosswalk, with a companion JSON Schema. `python scripts/build-corpus-reconciliation.py` regenerates it offline from explicit identity tables and source manifests. It does not compare names fuzzily, coordinates, vertex counts or skeletons to merge records. Public catalog keys are unchanged; no new geometry is registered.

| Obligation | Required | Named identities | Current source matches | Release qualified |
| --- | ---: | ---: | ---: | ---: |
| Classical regular 4D | 16 | 16 | 16 | 0 |
| U1–75 | 75 | 75 | 75 | 0 |
| Dual of each U1–75 | 75 | 75 | 22 | 0 |
| J1–92 | 92 | 92 | 92 | 0 |
| Near misses | Unknown benchmark total | 10 local names | 10 local matches | 0 |
| Baseline uniform 4D | 2,191 | 0 baseline names | 0 baseline matches | 0 |

“Release qualified” means a reconciled identity with independently reviewed current classification, chirality, geometry and redistribution evidence. Version 1 inventories the evidence and **accepts no qualification receipts**; all qualification slots are null. Zero here does not revoke existing mathematical validation elsewhere in the app. A numerical audit pass is insufficient to promote an identity. A later reviewed schema migration and per-entry receipts must implement promotion. Coverage counts distinct qualified identity IDs, separately for each obligation; it never counts registry entries, assets, candidates or enantiomorph realizations. The groups overlap and must not be summed into a total.

The 22 mapped duals cover the five Platonic, thirteen Archimedean and four Kepler–Poinsot identities. The other **53 obligations remain named and unmatched**. No generic reciprocation operation is substituted for a named source; finite duals of center-plane/nonordinary sources are not assumed. Both native snub-dual forms are retained. Source-relative reflected U snubs are additional realizations of the same U identity, with no absolute left/right convention. The regular six retain both native and alternate Miratope sources; all ten regular stars retain their existing source keys and dual relationships.

Local near-miss names are chamfered cube, chamfered dodecahedron, rectified truncated icosahedron, truncated truncated icosahedron, expanded truncated icosahedron, truncated triakis tetrahedron, associahedron K5, square-pentagon wedge and its top- and side-augmented forms. Their fitted-realization metrics and approximation flags are retained; correspondence to the complete benchmark list remains unverified.

## Source inventory and identity layers

The manifest pins twelve bundled provider/data manifests by SHA-256. Source record counts are exact inventory counts for those pins, not mathematical coverage:

| Source | Records / scope |
| --- | --- |
| Antiprism | 167: U75 + J92 |
| Miratope regular | 16, including six alternate convex sources |
| Miratope expanded | 980: 41 convex labels + 31 nonconvex labels + 908 unclassified discovery candidates |
| Native convex uniform manifest | 65 realizations, 64 O indices |
| Native rational-angle star manifest | 79 |
| Near misses | 10 fitted assets |
| Uniform snub evidence | 12 reflected definitions + one supplemental Skilling asset outside U75 |
| Specialized Antiprism | 75 fixed compound realizations |
| Uniform-compound construction data | 75 definitions; overlaps specialized source records |
| Stewart sources / families | 3 / 4, including original variants |
| Corrected 4D compound copies | 2; originals remain distinct |
| Native ordinary catalog | 45 realizations |
| Native specialized 3D | 38: 33 compounds + four noble realizations + one sweep torus |
| Native specialized 4D | 13: eleven compound records + two scaliforms |
| Drive download inventory snapshot | 3,064 named files, 3,064 recorded downloads; licenses and baseline correspondence unverified |

The 4D uniform candidate groups retain **216** records (65 + 79 + 41 + 31). The other **908** expanded discovery records stay unclassified. Specialized groups retain **121** 3D and **923** 4D candidate realizations. None is assigned an invented baseline identity. Candidate details list every source key and retain unsupported/missing records. The Drive inventory also retains its exact top-level directory counts and listing-completeness limitation; external/junction data is reported as a snapshot without following it outside this worktree. A packaged build without Drive data keeps the snapshot and diagnoses it as unavailable/stale.

Each identity links to separate realization records. Each realization has a coordinate-set ID, indexed ordered-incidence ID, classification evidence, chirality evidence, license evidence and optional construction/source hash. IDs are scoped to the source realization. A coordinate-set hash and an incidence hash are produced independently by a live audit. They compare literal ordered representations; they establish neither congruence nor combinatorial isomorphism. No unused-vertex removal, welding, topology repair or hull reconstruction occurs in reconciliation.

“Manifest current” rechecks the provider metadata pin, not every geometry asset. Geometry loading retains its existing hash/import validations. A current source match is a correspondence record, not proof of asset validity. Changed/missing manifests revoke current matches and remain diagnosable. License files are marked documented only when a retained expected hash matches; unknown or unpinned terms stay unverified. Documented terms do not constitute distribution approval.

## Native API and audit reuse

`corpus-reconciliation` is an allowlisted reusable read-only op. With empty params it returns coverage, inventory and blockers; `{group}` adds named identities/candidate lists; `{identity}` adds full evidence; `{identity, realization, verify: true}` runs the existing `catalog_audit.audit_model` against the current catalog loader. Arbitrary source paths and model input are refused. Interactive audits are bounded to 10,000 vertices and 100,000 total entities; larger jobs use the existing isolated catalog-audit CLI. Checks report numeric residuals and tolerances, never exact certificates. Audit results are transient; refresh does not persist or promote them.

Export a portable report, including optional current catalog-audit output:

```powershell
python -m engine.corpus_reconciliation --output artifacts/corpus-summary.json
python -m engine.corpus_reconciliation --group uniform4 --output artifacts/corpus-candidates.json
python -m engine.corpus_reconciliation --identity uniform3:U1 --verify --output artifacts/corpus-u1.json
```

Remaining source/data blockers: authoritative 2,191-entry baseline names/topology identities; benchmark near-miss and specialized family rosters; sources/finite-domain evidence for 53 U duals; independent per-realization classification/chirality receipts; and redistribution review, especially the Drive collection and local generated assets. This first manifest does not close LIB-01/02/03/05/06 parity.

## Verification

Focused tests cover deterministic regeneration, provider pins, all U/J numbers and regular dual pairs, unmatched duals, candidate retention, reflected forms, separate coordinate/incidence hashes, stale sources, invalid requests, native JSON-lines dispatch, mounted UI, stale-response cancellation and numerical audits without qualification promotion.

```powershell
python -m pytest tests/test_corpus_reconciliation.py tests/test_catalog_registry.py tests/test_catalog_audit.py tests/test_reference_library.py -q -p no:cacheprovider
node --test tests/corpus-reconciliation-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/catalog-discovery.test.mjs tests/library-navigation.test.mjs tests/library-rail.test.mjs tests/app-chrome.test.mjs tests/construct-gallery.test.mjs tests/renderer-contract.test.mjs tests/startup-performance.test.mjs tests/library-visual.test.mjs
npx.cmd vite build --configLoader native
```

Results: **125 Python tests and 104 Node tests passed**; Vite built successfully with existing chunk-size/mixed-import warnings. The new Node suite is registered in `test:features`. Electron was not launched; the lead still needs to click through the packaged desktop panel.
