# Library parity domains: LIB-01, LIB-02, LIB-04, LIB-05

Read-only audit, 2026-10-05. This document assesses the original requirements against the registered catalog, retained acquisition manifests, current implementation and existing independent fixtures. It changes no requirement or ledger status. No installed licensed catalog contents were extracted; no application or baseline GUI was launched; no full geometry audit was repeated.

The most useful finite closure candidates are the Johnson 92 subdomain and the regular 4D set of 16. Both have actual source realizations. The largest outstanding catalog obligation is the entry-level 2,191 uniform-polychora crosswalk. Importer compatibility and a source's attributed classification are separate evidence.

## Acceptance and baseline boundaries

The acceptance conditions in [the original specification](../STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md) are:

| Requirement | Original domain and acceptance | What must not replace it |
| --- | --- | --- |
| LIB-01 | Platonic, Archimedean, Kepler–Poinsot, remaining uniform polyhedra, and duals; named manifest, checked counts/incidence, alias and symbol search | The 45 independent references alone, or U1–U75 without their dual domains |
| LIB-02 | Johnson solids and documented near misses; distinguish exact/approximate status and supply near-miss deviation metrics | Johnson 92 alone, or confusing float64 approximation with mathematical near-miss status |
| LIB-04 | Six convex and ten nonconvex regular 4-polytopes, independently represented and validated | Six convex generators plus ten unverified source labels |
| LIB-05 | All 2,191 baseline known uniform polychora; entry-level crosswalk, preserving different topologies with the same skeleton | Number of files, successful imports, or vertex/edge point-set deduplication |

The public version history states that Stella 6.0 expanded the earlier 1,849 known uniforms by 342 to 2,191 and updated names/numbers. The user's installed baseline is paid 5.4. It remains useful for permitted direct evidence about that version; it cannot establish executed 6.0 conformance. No purchase or installation is required for the independent implementation route proposed here. [Official version history](https://www.software3d.com/History.php)

Parameterized prism/antiprism/duoprism/antiduoprism families remain LIB-07. Specialized compounds, fissaries and scaliforms remain LIB-03/06. Their current generators or files must not inflate the finite LIB-05 total.

## Actual registered coverage

| Source | Records exposed in the built-in library | Current evidence and limits |
| --- | ---: | --- |
| Independent construction catalog | 45 | Five Platonic, six convex regular 4D, thirteen Archimedean types plus two snub mirrors, thirteen Catalan types plus two dual mirrors, four Kepler–Poinsot. Construction, incidence and independent metric fixtures exist. |
| Pinned Antiprism 0.32 | 167 | J1–J92 and U1–U75. Raw/adapted hashes, ordered polygon cycles, RGB, source attribution, strict import and independent necessary regular-face/equal-edge checks are retained. These are supplied realizations, not 167 independent analytic constructions. |
| Pinned Miratope | 10 additional | Ten source-labeled regular stars. Its manifest also retains six alternate convex files, which do not create duplicate browser entries. All 16 source files have independent incidence/metric fixtures; selected symmetry evidence is stronger than the remaining entries. |
| Linked user-supplied Drive tree | 3,064 paths, separate from the 222 built-in records | Header indexing, literal geometry loading, distinct source paths, compact importer evidence and explicit hash verification. No baseline identity crosswalk or complete mathematical classification is implied. |

The built-in total is **222 records**, with semantic overlap between the independent and Antiprism realizations. Mirrors are distinct coordinate realizations, not new combinatorial types. The opening coverage claim in [REFERENCE_LIBRARY.md](REFERENCE_LIBRARY.md) describes the historical 45-record independent subset; it is not the current complete registry inventory.

Implementation reviewed: [catalog.py](../engine/catalog.py), [generators.py](../engine/generators.py), [app.js](../ui/app.js), [incidence_dual.py](../engine/incidence_dual.py), [library.py](../engine/library.py), the three catalog manifests, acquisition inventory, and the existing reference/Antiprism/Miratope/catalog-registry tests. This audit did not rerun those tests or claim fresh packaged execution.

## LIB-01: most finite primal geometry is present; duals still have real gaps

The published categories include the 75 usual finite uniform types, nonconvex snubs, Skilling's figure, degenerates and dihedral families. Their incidence conventions must be reconciled explicitly. The public manual also makes Catalans available through dual views. [Built-in catalog](https://www.software3d.com/Manual/Builtin.php?prod=Stella4DPro)

**Bounded missing implementation/evidence:**

1. Project the Antiprism manifest's `wythoffSymbol` into the library's searchable symbol metadata. Currently `catalog._sources()` copies only `symbol`, which these entries do not supply; `renderCatalog()` consequently cannot find their retained Wythoff symbols. Keep their literal fractional tokens and bars, with normalized search aliases rather than arithmetic reduction.
2. Create a finite identity crosswalk for U1–U75, including canonical public name, U index, alternative names, symbol, source key, V/E/F, ordered incidence fingerprint, face-cycle/winding distribution, and chirality/variant status. Existing six uniform symmetry samples are numerical evidence; remaining source labels are attributed classifications. Explicitly record which identities were checked independently.
3. Cover the remaining snub mirror variants, or expose a source-preserving reflected construction with traceable handedness. Independent snub cube/dodecahedron mirrors exist; the acquisition does not supply all nonconvex snub mirrors. A model name containing “snub” is insufficient chirality evidence.

**Missing mathematical domain:** ordinary convex polar duals and the bounded 3D incidence dual do not cover all catalog duals. `incidence_dual()` requires two distinct faces per edge, one simple cyclic vertex link, distinct reciprocal points and no face plane through the chosen center. The public baseline represents infinite dual parts with finite display clipping; moving the center to avoid singularity changes the requested dual. This needs a separate honest unbounded-dual representation and display contract, not a huge finite coordinate substitute. [Dual semantics](https://www.software3d.com/Manual/Dual.php?prod=Stella4DPro)

Use U3's center-crossing face planes and U75's coplanar/center-crossing planes as explicit refusals until supported. U75 is Miller's Monster, with 60/240/124, matching the author's published counts; it is **not** Skilling's additional figure. Do not “correct” its 240 source edges by merging visual coincidences. [Author's U75 model](https://www.software3d.com/MillersMonster.php)

Skilling's figure and the baseline's separate degenerate category have no named registered counterparts in this acquisition. Their multivalued/coincident incidences and duals need genuine sources and an explicit source topology convention. A single connected boundary or a matching vertex/edge skeleton cannot establish that coverage.

**Finite acceptance fixtures:** symbol and alias lookup for U1/U6/U12/U29/U34/U75; independent whole ordered-boundary checks for each crosswalk row; proper/improper actions for chiral variants; unchanged source cycles/colors after load/save; V↔F/E dual maps and double-dual recovery where finite; deliberate through-center and multivalued-edge cases that remain diagnosed until implemented. These are catalog acceptance checks, not a demand that every unrelated editing operation work on every catalog entry.

## LIB-02: Johnson 92 can be qualified separately from near misses

All J1–J92 records are present. Existing tests check every retained source hash, ordered polygon/circle geometry, equal model edge length, two-face edge incidence and Euler characteristic. Independent named fixtures include J1/J2/J3/J84; cupola construction supplies additional independent J3/J4/J5 comparisons. There is no need to reacquire all 92 merely because the broad ledger gate remains open.

Close the Johnson subdomain with an explicit J1–J92 name/identity table, retained numerical residuals/tolerances, and visible distinction between **a known Johnson identity represented by approximate coordinates** and **a near miss with mathematically nonregular faces**. The current supplied-source numeric contract already denies exact algebraic certification; that is honest, not evidence that the identity is a near miss. The original requirement does not mandate a symbolic algebraic coordinate certificate for every Johnson solid.

No registered near-miss family or named near-miss deviation table was found. The public manual documents both Near Misses and More Near Misses, but does not enumerate their complete named contents on that page. The history reports additions, so an undated arbitrary set cannot establish current matching coverage. [Published near-miss categories](https://www.software3d.com/Manual/Builtin.php?prod=Stella4DPro), [catalog changes](https://www.software3d.com/History.php)

An actionable near-miss batch needs an authorized/public name inventory before independent construction or legitimately reusable assets. For each model report dimensionless edge-length spread, face planarity residual, circle residual, and deviation from the claimed ordinary/star polygon traversal; preserve which faces fail and source numeric uncertainty. Tests should compare a genuine regular Johnson reference, a controlled nonregular perturbation, scaling invariance, and residuals above/below declared tolerance. Near-zero float noise must not become a fabricated near-miss identity. The missing public exhaustive near-miss inventory is an evidence gap; installed licensed geometry must not be copied to fill it.

## LIB-04: a finite, achievable closure batch

The required 16 realizations exist: six independent convex constructions and ten unchanged Miratope star assets. All Miratope entries preserve literal coordinates and face/cell membership; no hull substitutes for the stars. The ten star records lack Schläfli symbols in the registered manifest. Their source names and counts alone are not an independent regularity or identity proof.

The remaining batch should establish a dated 16-row crosswalk containing conventional names/aliases, unreduced Schläfli symbol, expected V/E/F/C, regular face step, cell type, vertex figure, and dual partner. Preserve original provider naming separately. Validate every edge, ordered polygon, cell boundary and vertex link. For the stars, a supporting vertex set or equal edge lengths must not override an incorrect step cycle or cell membership.

Existing exhausted numerical symmetry evidence covers four convex Miratope references and one star, Grand hecatonicosachoron (14,400 actions); the latter has single entity-rank orbits. **Separate transitivity on each rank does not by itself prove transitivity on incident vertex–edge–face–cell flags.** Extend the independent verifier with incidence-preserving proper/reflection generator permutations and flag-orbit checks. Verified sparse generators can prove transitivity of their action without repeatedly searching every spanning frame. Keep numerical tolerance and approximate status explicit.

A read-only bounded probe during this audit constructed four flag-adjacent reflections independently from each source's vertex/edge/face/cell barycenters. All 16 sources preserved complete incidence and reached every enumerated flag: 120 for the simplex, 384 for tesseract/16-cell, 1,152 for 24-cell, and 14,400 for each remaining source. Total numerical probe time was 3.969 seconds; maximum normalized coordinate-bijection residual was approximately `1.045e-12`. This is concrete evidence that the proposed verifier fits the existing assets. It is not yet a permanent tested classifier or a symbolic certificate; retained receipts and tamper/negative fixtures are still required.

Acceptance should include all 16 full source boundaries, independently matched symbol/cell/vertex-link data, flag transitivity under verified actions, dual-pair count/incidence checks, and negative fixtures with a bow-tie/star-step substitution or changed cell face set despite unchanged counts/skeleton. Full generic star-4D dual editing is a separate operation requirement; it is not necessary to pretend that unsupported operations pass in order to qualify a correct finite catalog representation.

This can satisfy the original “independently represented/validated” domain through independent ordered-incidence and numerical regularity evidence on the source realizations. It does not inherently require inventing ten new analytic coordinate generators or executing paid Stella 6. Public documented identities plus independent fixtures can support closure, while unavailable direct 6.0 execution remains explicitly absent.

## LIB-05: acquisition and identity reconciliation remain substantial

The public manual places the finite uniforms in Bowers categories 1–30, permits regiment duplicates, and separates fissaries, compounds and infinite product families. It also documents vertex-figure reconstruction and ambiguous face choices. Complete literal OFF sources can satisfy the catalog crosswalk without copying the baseline's proprietary vertex-figure files; that does not independently complete a general reconstruction operation. [4D library conventions](https://www.software3d.com/Manual/Load4D.php)

The acquisition inventory alone yields:

| Path-level observation | Count |
| --- | ---: |
| Files inside Cat1–Cat30 | 1,944 |
| Such files with a leading numeric ID followed by a hyphen/space | 1,662 |
| Distinct numeric prefix candidates in 1–2,191 | 1,659 |
| Other Cat1–Cat30 filenames | 282 |
| Numbers without a numeric-prefix candidate | 532 |

The absent numeric candidate intervals are 1611–1628, 1650–1668, 1671–1845, 1865–2098, 2102–2184 and 2186–2188. IDs 4, 10 and 11 appear twice. **These are filename observations, not proof that 532 mathematical types are absent.** The 282 other files, changed numbering and regiment/fissary aliases still require reconciliation. Conversely, 3,064 total paths cannot establish all 2,191 identities.

Historical importer receipts differ: `drive-corpus-full-audit.library-index.json` records 3,048 parsed/16 diagnosed; the later `drive-corpus-0.9.0-audit-verification.json` records 3,050 parsed/14 diagnosed with all source hashes matching at that run. They must not be treated as interchangeable current proofs. This audit read compact metadata only and did not recompute source/importer freshness. The older diagnoses include twelve declared-edge mismatches, two malformed boundaries and two non-3D cell boundaries. Explicit copy repair may correct an edge declaration; it cannot silently repair source incidence or establish uniform identity.

The next deliverable is a **2,191-row dated identity manifest**, separate from path inventory. Each row needs public classification/name/number provenance; zero, one or several source realizations; alias/regiment links; complete ordered incidence and cell maps; coordinate/attribute/source hashes; independent classification evidence and a status such as missing, ambiguous, incompatible, supplied-unclassified or independently-validated. Extras remain outside the finite count. Keep abstract/source IDs even when elements coincide geometrically.

An exact graph crosswalk must compare faces with their cyclic adjacency and cells with their face memberships, not just V/E/F/C or the 1-skeleton. Mathematical uniformity also requires regular faces, uniform cells and vertex transitivity under the chosen generalized incidence convention. Parser checks, hull/classifier checks and render screenshots do not establish these jointly. Independently sourced realizations or derivations are needed for uncovered identities, with license/provenance records for anything redistributed. External user-linked files can remain linked without an inferred redistribution license.

## Prioritized completion route

| Batch | Concrete output | Can it close an original requirement? |
| --- | --- | --- |
| 1. Searchable identity metadata | U/J name-index crosswalk, literal Wythoff search, precise source/chirality/numeric labels; update stale coverage prose | Closes bounded LIB-01 naming/search gaps; not its missing dual/degenerate domains |
| 2. Regular 16 independent verifier | Full symbol/incidence/cell/link table, verified group actions and flag orbits, negative fixtures | Can close LIB-04's finite catalog domain, without unavailable 6.0 execution claims |
| 3. Johnson qualification + near-miss inventory | J1–J92 complete identity evidence; then named authorized near-miss sources and deviation metrics | Johnson subdomain is close; whole LIB-02 remains open until the near-miss domain is reconciled |
| 4. Unbounded/degenerate duals | Source-owned infinite directions/incidences, explicit bounded presentation, no fake finite model/volume | Real missing LIB-01 mathematics; separate from metadata work |
| 5. Uniform 4D crosswalk | All 2,191 dated identities, preserved coincident topology and per-entry independent evidence/acquisition | Can close LIB-05 only after substantial reconciliation; a small sample suite cannot do so |

None of these batches narrows LIB-03, LIB-06, LIB-07, construction/operation requirements, or the full 73-item goal. Operation parity and catalog acceptance should have separate explicit gates instead of using either as a proxy for the other.

## Audit provenance

Small metadata files inspected; SHA-256 binds this report's observations rather than promising future freshness:

| File | SHA-256 |
| --- | --- |
| `engine/catalog_data/antiprism/manifest.json` | `aabffc47ffe70f7dc19c4a0267342b5660df12951e65d96b4e0b25a594055800` |
| `engine/catalog_data/miratope/manifest.json` | `8d790ea68f6f8ee53631840f4c26aeab776af75fadd8a6579bc45eb4f09d756f` |
| `docs/reference-manifest.json` | `6973d7acc159390cf9658bd404c31270267777e710a924270846fddf74455190` |
| `data/drive-uniforms/inventory-manifest.json` | `be53d68d04814b3185ed046d7603f9ee852c8c683e8c7397440b66be27656bae` |
| `artifacts/drive-corpus-full-audit.library-index.json` | `a833de6f8139d405683ec2024700c68cb295fedb027b6a733003edb923b22c13` |
| `artifacts/drive-corpus-0.9.0-audit-verification.json` | `d111e6d48784d03d6fcc09c88c031a93482525e7ff03ec5276681f8315a326fc` |
