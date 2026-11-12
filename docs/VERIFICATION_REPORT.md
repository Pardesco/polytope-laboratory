# External verification report

Snapshot: **2026-11-10**, R9-VERIFY. This is a bounded numerical cross-check, not a certification of the catalog or an enumeration theorem. No catalog data, keys, element IDs or geometry were changed.

## Scope and reproducibility

The current engine returns **1,778 registrations**. This report examines the **870 default-visible registrations**, excluding all **908 discovery candidates**, using exactly the predicate in `ui/catalog-defaults.mjs`. This operational meaning of "VERIFIED catalog" must not be mistaken for a mathematical guarantee: the visible set itself contains **228 `classificationVerified:true`, 73 false and 569 unspecified** flags. The 72 attributed Miratope uniform registrations remain classification-unverified. Reflected realizations, independently generated copies, source copies and parameterized family samples count as separate rows, not separate mathematical identities.

Run from the repository root, with the existing Python dependencies installed:

```powershell
python scripts/verify_external.py --output artifacts/external-verification.json
python scripts/verify_external.py --keys tetrahedron antiprism-u75 tesseract --output artifacts/external-slice.json
python -m pytest tests/test_verify_external.py tests/test_catalog_audit.py tests/test_catalog_registry.py -q -p no:cacheprovider
```

The checker has **no network calls**. It rejects changed extract hashes, escaped cache paths and hidden/unknown requested keys. JSON output includes every selected registration, source mapping, performed check, omission, numerical residual, engine/checker/cache SHA-256 and runtime versions. The full run exits **1 intentionally** because six differences remain; exit 0 means no performed comparison differed, not complete coverage. Exit 2 covers argument errors. A worker deadline/native exit is retained as incomplete and also causes exit 1.

Default bounds are **640 vertices** per locally loaded model and per retained outside coordinate set, **64 vertices** for fresh full symmetry searches, **20,000 symmetry frames**, **100,000 correspondence-search nodes**, and **60 seconds per mapped entry**. Retained complete chirality receipts and explicit construction-group orders may also supply reported engine orders. `--max-vertices`, `--symmetry-vertices` and `--timeout` change local computation bounds; increasing the first does not restore omitted outside coordinates. Workers use the engine's guarded hull entry points. Runtime for this snapshot: Python 3.10.11, NumPy 1.26.4, SciPy 1.11.4. Electron was not launched.

An optional network refresh is `python scripts/fetch_verification_sources.py`. It fetches missing/changed extractor versions, reuses pinned existing extracts, and preserves the manually reviewed Moeller summary extract. It is not required for a rerun. A new upstream snapshot requires deliberate removal/review of the corresponding cached source record, not an implicit update during verification.

## Outside sources and retained evidence

All sources were retrieved **2026-11-10 UTC**. `data-external/verification/manifest.json` records each original URL, retrieval timestamp, response SHA-256, response size, retained JSON filename and extract SHA-256. The 662 factual extracts occupy about **2.55 MiB**, plus the manifest; the largest is about 260 KiB. Original HTML/PDF/OFF mirrors and rendered review images are not shipped. The source hashes identify original responses; an offline rerun verifies the retained extracts, not unavailable original response bytes.

| Source | Retained material and role |
| --- | --- |
| [Richard Klitzing: polyhedra](https://bendwavy.org/klitzing/dimensions/polyhedra.htm), [polychora](https://bendwavy.org/klitzing/dimensions/polychora.htm), individual `incmats/<acronym>.htm` pages | Names, explicit linked-name aliases, face vectors, first full-symmetry orbit-incidence matrix and row links. Alternative subsymmetry matrices and pictures are omitted. |
| [Klitzing: Dynkin diagrams](https://bendwavy.org/klitzing/explain/dynkin.htm) | Published full Coxeter-group orders A3=24, B3=48, H3=120, A4=120, B4=384, D4=192, F4=1152, H4=14,400. A construction subgroup is not assumed to be the full geometric symmetry group. |
| [Miratope Rust library](https://github.com/vihdzp/miratope-rs/tree/main/lib) | Source Git tree `dc63c4c101c88402fa02c5dddf66942a1f72093f`; 196 OFF-derived extracts from 3D uniform/regular-faced and 4D regular/convex-uniform/nonconvex-uniform folders. Each raw URL is pinned to that immutable tree. OFF reading uses `engine.catalog_audit.read_off_literal`; coordinates and literal incidence are retained only within the 640-vertex bound. The MIT license and author notice are retained in `miratope-license.json`. |
| [Jonathan Bowers: uniform polyhedra](http://www.polytope.net/hedrondude/polyhedra.htm), [uniform polychora](http://www.polytope.net/hedrondude/polychora.htm) | Small factual count excerpts, obtained over HTTP. The polychoron page's dated June 2023 update and current introduction state 2,191 known uniform polychora. Fissaries and pseudo-uniforms have separate categories. |
| [Klitzing: polytope definitions](https://bendwavy.org/klitzing/explain/polytope-tree.htm) | Contrasting published totals: 8,190 allowing exotic/coincident/compound-element cases and 1,849 after exclusions. This explanatory paragraph is not the current Bowers 2,191 roster. |
| [Marco Moeller, 2004 dissertation record](https://ediss.sub.uni-hamburg.de/handle/ediss/689), [author's summary, p. 1](https://ediss.sub.uni-hamburg.de/bitstream/ediss/689/2/Zusammen.pdf) | Manually transcribed factual counts after visually rendering the primary PDF (its embedded-font text extraction is unusable): 6 regular, 4 additional Platonic prisms, 13 Archimedean prisms, 41 other non-prismatic convex uniform forms; total 64. Hence 6+41=47 non-prismatic forms. The summary also states the two infinite prismatic classes. |

These are outside publications, but not necessarily independent *lineages*: some catalog expectations already cite Klitzing and some catalog assets already come from Miratope. Agreement with the freshly fetched upstream OFF therefore checks preservation, source correspondence and independently generated realizations; it is not a second independent construction of an imported asset. Source reformatting/hashes do not prove the source authors' mathematics. No large corpus or 2,191-name roster was scraped or inferred from file totals.

## Published family counts

| Family / convention | Outside count | Current check |
| --- | ---: | --- |
| Platonic polyhedra | 5 | All five native rows match counts and outside OFF similarity. |
| Archimedean polyhedra | 13 | All 13 identities match; 15 native rows include both reflected snub realizations. Klitzing's definitions page supplies the 13 count. |
| Kepler-Poinsot polyhedra | 4 | All four native rows match; stars retain ordered polygon winding. |
| Other nonconvex uniform polyhedra | 53 | Derived remainder 75-5-13-4 from the published totals; not 53 in addition to 57 nonconvex forms. |
| Ordinary uniform polyhedra, excluding infinite prism/antiprism series | 75 | All U1-U75 have mapped outside counts and OFF comparisons. 87 Antiprism rows include 12 reflected copies. Skilling's exceptional figure is separate. |
| Convex regular 4-polytopes | 6 | All six native rows match counts and full-incidence OFF similarity. |
| Schlaefli-Hess regular star 4-polytopes | 10 | All ten attributed rows match counts, named vertex-figure labels and full-incidence OFF similarity. The outside regular list has six convex plus ten star entries; completeness is not reproved here. |
| Conway-Guy convex non-prismatic uniform polychora | 47 | 6 regular + Moeller's 41 non-prismatic nonregular forms. All 47 have outside count records; large entries are metadata-only under the stated bound. The native 65-row convex/prism manifest includes the cube prism as another realization of the tesseract, so 65 is not a new identity total. |
| Known ordinary uniform polychora, Bowers convention | 2,191 | Published current known total, **not a completeness theorem** and not current catalog coverage. Klitzing's older 1,849/exotic 8,190 statements have different date/scope; do not substitute them silently. |

## What each comparison establishes

* Counts compare both catalog-declared and, when loaded, actual V/E/F/C against outside face vectors and OFF-derived incidence. Euler is computed from those counts, `V-E+F` in 3D and `V-E+F-C` in 4D. It is not forced to 2/0 for star/generalized/compound boundaries. It is a derived count consistency check, not an independent topological theorem.
* The first Klitzing orbit matrix supplies diagonal orbit totals, polygon-size and, where unambiguous, ordinary/star polygon counts, cell V/E/F plus face-size signatures, and the incident-element counts of a vertex figure. Regular polygon/winding measurement reuses `engine.star_uniform4.polygon_symbol`; local geometry/edge residuals reuse `engine.catalog_audit.audit_model`. Cell signatures reuse `engine.library_navigation.cell_signature`. A cell signature does not establish a named cell's combinatorial or metric type. No complete rank-by-rank orbit-incidence isomorphism is claimed.
* Vertex-figure f-vectors are necessary local invariants. Only the 16 regular 4D entries have reported named-type labels compared here; no general vertex-figure type classifier/congruence proof is supplied. The remaining type requests stay explicitly not checked, even when local counts agree.
* Outside group orders are used only for recognized ordinary linear Coxeter diagrams. Rational stars, snubs and products require additional group identification and stay not checked unless independently represented. This deliberately exposes subgroup/full-group differences below.
* OFF comparisons center and normalize both clouds to unit RMS radius, search Gram-compatible spanning frames for a complete vertex bijection, then compute a SciPy orthogonal Procrustes fit. Ordered face cycles (up to start/reversal), edge multiplicities and cell incidence must map as well. Translation, positive common scale, orthogonal rotations **and reflections** are allowed. This checks similarity of the complete supplied boundary within `1e-7`; it does not distinguish absolute handedness. Coincident target vertices or exhausted correspondence bounds are unresolved, never welded or accepted.

The run loaded **354** models and compared **284** full OFF geometries: all 284 similarity checks and all 284 paired edge-uniformity checks matched. Maximum normalized vertex-fit residual was **6.13e-10** (Antiprism U74 reflected, after Procrustes); maximum local relative edge deviation was **1.13e-10**. These are float64 measurements, not exact certificates. The engine audit's 281 applicable asserted-uniform edge checks passed; 73 imported rows lacked that assertion, but their measured deviations remain in the output and paired OFF checks still run. There were **275** matching polygon-type-count comparisons and **130** matching cell-signature-count comparisons. The **160** larger mapped entries received declared-count checks only. No worker timeout/native exit occurred.

## Summary by catalog family

"Checked" means at least one outside comparison, including declared counts alone. "Match" means **all performed comparisons agree**, with omissions still recorded; it never means every requested property was verified. "Mismatch" is a row with any difference, including a documented convention difference. "No outside data" means no defensible identity/source mapping in this cache, not that no publication exists. Geometry-loaded counts are a subset of checked rows.

| Family (catalog label) | Rows | Checked | Match | Mismatch | No outside data | Geometry loaded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4D compounds | 13 | 0 | 0 | 0 | 13 | 0 |
| Archimedean | 15 | 15 | 15 | 0 | 0 | 15 |
| Catalan | 15 | 0 | 0 | 0 | 15 | 0 |
| Compound | 75 | 0 | 0 | 0 | 75 | 0 |
| Compounds | 108 | 0 | 0 | 0 | 108 | 0 |
| Convex uniform 4D | 41 | 41 | 39 | 2 | 0 | 27 |
| Convex uniform polyhedral prisms | 18 | 18 | 17 | 1 | 0 | 18 |
| Exact regular source | 3 | 3 | 3 | 0 | 0 | 3 |
| Generated uniform duals | 40 | 0 | 0 | 0 | 40 | 0 |
| Goursat star Wythoff (verified tranche) | 79 | 79 | 79 | 0 | 0 | 22 |
| Johnson | 92 | 28 | 28 | 0 | 64 | 28 |
| Kepler-Poinsot | 4 | 4 | 4 | 0 | 0 | 4 |
| Near-miss Johnson solids | 10 | 0 | 0 | 0 | 10 | 0 |
| Noble | 4 | 0 | 0 | 0 | 4 | 0 |
| Platonic | 5 | 5 | 5 | 0 | 0 | 5 |
| Regular convex | 6 | 6 | 6 | 0 | 0 | 6 |
| Regular star | 10 | 10 | 10 | 0 | 0 | 10 |
| Scaliform polychora | 2 | 1 | 1 | 0 | 1 | 1 |
| Schwarz triangle Wythoff (generated) | 63 | 63 | 63 | 0 | 0 | 63 |
| Star uniform polychora (Wythoffian) | 79 | 79 | 79 | 0 | 0 | 22 |
| Stewart toroids | 7 | 0 | 0 | 0 | 7 | 0 |
| Toroidal | 1 | 0 | 0 | 0 | 1 | 0 |
| Uniform | 87 | 87 | 87 | 0 | 0 | 87 |
| Uniform exceptional | 1 | 1 | 0 | 1 | 0 | 1 |
| Uniform polygonal antiprisms | 10 | 0 | 0 | 0 | 10 | 0 |
| Uniform polygonal prisms | 10 | 2 | 2 | 0 | 8 | 2 |
| convex uniform (Miratope source) | 41 | 41 | 39 | 2 | 0 | 27 |
| nonconvex uniform (Miratope source) | 31 | 31 | 31 | 0 | 0 | 13 |
| **Total** | **870** | **514** | **508** | **6** | **356** | **354** |

## Every observed difference

| Catalog key(s) | Our value | Outside value | Diagnosis |
| --- | --- | --- | --- |
| `antiprism-skilling` | `[60,240,204,0]`; Euler 24 | `[60,360,204,0]`; Euler -96 | **Convention difference.** The engine explicitly stores unique vertex-pair edges: 120 with two incident faces and 120 with four. [Klitzing's gidisdrid](https://bendwavy.org/klitzing/incmats/gidisdrid.htm) counts three abstract 120-edge classes, with two classes geometrically coincident. Neither the four-face edges nor the 360-edge pairing is silently repaired. |
| `uniform4-spid` | Full numerical Euclidean symmetry order 240 | A4 construction group order 120 | **Group convention difference.** The [spid diagram](https://bendwavy.org/klitzing/incmats/spid.htm) generates the A4 subgroup; the supplied geometric boundary has an additional symmetry. Counts and outside OFF geometry agree where available. The catalog group label is a construction label, not a full-order certificate. |
| `miratope-expanded-6c471182769cdd9d6272` (runcinated pentachoron) | 240 | 120 | **Same subgroup/full-group convention** as `uniform4-spid`; separate source registration retained. |
| `uniform4-deca` | Full numerical Euclidean symmetry order 240 | A4 construction group order 120 | **Group convention difference.** The [deca diagram](https://bendwavy.org/klitzing/incmats/deca.htm) generates an index-two subgroup of the enumerated geometric group. Counts and OFF geometry agree. |
| `miratope-expanded-5e9164d469a2a8f483a9` (bitruncated pentachoron) | 240 | 120 | **Same subgroup/full-group convention** as `uniform4-deca`; separate source registration retained. |
| `uniform4-prism-truncated-icosahedron` | Vertex-figure f-vector `[4,6,4]` at every vertex | First matrix vertex row `[3,6,4]` | **Likely outside typo.** [Klitzing's tipe](https://bendwavy.org/klitzing/incmats/tipe.htm) gives total V=120, E=240, implying degree `2E/V=4`, inconsistent with its vertex-row 3. The product construction and complete loaded incidence give 4. Its global counts and cell signatures agree. |

The first row accounts for three differing comparisons (declared counts, loaded counts, Euler); the other five account for one each: **eight differing comparisons across six registrations**. This run found no new demonstrated catalog geometry defect. The source typo is reported as likely; no outside page or local catalog was edited.

Two naming collisions are handled explicitly, not by selecting whichever counts fit: Antiprism's nonconvex **U17 "great rhombicuboctahedron" -> querco** and **U67 "great rhombicosidodecahedron" -> qrid**, rather than the convex synonyms girco/grid. Full OFF similarity independently checks these selected correspondences. Compound aliases naming a constituent are never treated as an identity of the whole compound.

## Uniform-polychora identity mapping and dual obligations

There are **240 visible 4D registrations with `uniform:true`**, including seven compound registrations. **223** have a literal `bowers` field. An explicit regular-name crosswalk maps ten additional Schlaefli-Hess source rows: **233 registrations map to 143 distinct published acronyms** after repeated realizations are kept separate. The seven unmapped uniform-flagged registrations are compounds: `compound4-two-16-cells`, `compound4-three-16-cells`, `compound4-three-tesseracts`, `compound4-fifteen-16-cells`, `compound4-seventy-five-16-cells`, `compound4-seventy-five-tesseracts`, `compound4-twenty-five-24-cells`. They must not be counted as seven ordinary uniform polychora.

Twelve generated rows use six local alternate acronyms; their explicit catalog `referenceUrls` resolve to published source spellings: `qrigogishi->qrahi`, `qrigfix->querfix`, `qragishi->qraghi`, `paqrigagishi->paqrahi`, `paqrigafix->paquerfix`, `paqrigshi->paqraghi`. The exact mappings in JSON are authoritative if upstream naming changes; failed constructed URLs remain recorded as retrieval failures rather than missing identities. These are realization/name correspondences, not new entries in a 2,191-identity roster.

Including the **72 classification-unverified attributed Miratope uniform rows** and excluding compounds gives **305 named uniform-polychoron registrations**: **277** have published acronym/page correspondences, **28** have canonical-name OFF correspondence only. These counts are registrations, contain repeated identities and must not be subtracted from 2,191.

The current `corpus-reconciliation` uniform4 group still has **0 named / 0 mapped / 0 release-qualified of 2,191**, so **2,191 baseline obligations remain unnamed/unmapped** in that schema. A total on a webpage supplies no identity roster. The missing work is an attributable entry-level roster and reviewed name/alias/topology/chirality correspondence, particularly for non-Wythoff and fissary/exotic conventions, plus source/distribution review. This checker supplies numerical comparisons, not those receipts.

The dual count needs two separate statements. The unchanged v1 crosswalk has **22 mapped and 53 unmatched of 75** named U-dual obligations. Current classification-provider pins, however, are valid and retain **40 numerical-pass generated finite dual realizations** from those 53, registered separately in the catalog. The union supplies **62 distinct local representations**; **13 still lack a finite local representation**: U3, U4, U15, U32, U49, U51, U62, U64, U65, U70, U71, U72, U75. Ten recorded failures identify source face planes through or too close to the chosen center. U32, U64 and U72 instead retain coincident/unresolved reciprocal face-plane obstructions that would collapse distinct source face identities. Ideal/projective dual display is a separate workflow. These are retained local receipts, not 40 independently checked outside duals or release approvals. All 75 still lack release qualification in the v1 schema. The JSON `dualMapping` section recomputes the union and refuses to count generated receipts when provider pins are stale.

## Limits and follow-ups

1. Most compound/Catalan/Stewart/near-miss/noble families have no mapped outside expectations here; the family table and JSON preserve every omission. The cache contains only 28 matching Johnson geometries. No absence claim about the literature follows.
2. Load the 160 larger entries under a deliberately expanded computation/coordinate budget before claiming geometric verification of them. Native count formulas and retained manifest counts alone are insufficient evidence of a correct realization.
3. Add external named cell/vertex-figure models and complete orbit-incidence matching before treating matching signatures as full type verification. Extend full symmetry comparisons beyond the bounded ordinary-diagram slice.
4. Resolve source naming/group conventions and independently review the probable tipe typo. Preserve Skilling's documented geometric/abstract edge distinction.
5. Obtain and reconcile the actual 2,191-identity roster and remaining dual domains. Neither source file counts nor repeated generated forms close those gaps.

## Validation and UI

**75 Python tests passed**: 24 verifier tests plus existing catalog-audit/registry checks. Tests cover pin/path tampering, hidden-entry refusal, compound/component alias separation, alternate and ambiguous names, orbit-matrix decoding, ordinary/star face types, source typo exposure, reordered/reflected/scaled Procrustes matches, metric/cell corruption, bounded unresolved searches and stale dual receipt exclusion.

**37 Node tests passed** with `node --test tests/catalog-defaults.test.mjs tests/catalog-loading.test.mjs tests/catalog-discovery.test.mjs tests/corpus-reconciliation-controls.test.mjs`. `npx.cmd vite build --configLoader native` passed with the existing chunk-size/mixed-import warnings. No new Node test file or package script was needed.

This package adds a developer-facing report/CLI, not new app controls. To inspect the same population in the app, keep **Library > Discovery candidates (unverified)** (`#library-discovery-candidates`) unchecked. Existing Library coverage controls retain their own identity/qualification semantics. No model operations, history, persistence or IPC routes were changed.
