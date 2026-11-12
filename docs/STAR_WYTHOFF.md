# Goursat star Wythoff tranche 1 (R6-UNIFORM)

The baseline already generated 79 rational-angle star Wythoffians, including all
ten Schläfli–Hess regulars. This package reuses that construction and qualifies
**16 existing named identities** with an independent root-group/coset/local-link
adapter. It adds 16 separately keyed, checked native realizations; it adds **zero
new mathematical identities** and **zero reconciled identities against the 2,191
benchmark denominator**. No external face/cell corpus was imported.

## UI and persistence

In **Construct → Create a new shape → Goursat / Wythoff stars**, select **Star
polychoron** (`goursat-wythoff-choice`) and click **Create verified star polychoron**
(`generate-goursat-wythoff`). The tool/card IDs are `goursat-wythoff-settings` and
`construct-card-goursat-wythoff-settings`. Expert mode is unnecessary. Results
appear in `goursat-wythoff-result`; the collapsed **Construction evidence and next
queue** contains `goursat-wythoff-evidence` and `goursat-wythoff-queue`.

The ordinary Library also has the family **Goursat star Wythoff (verified
tranche)**. **Corpus coverage → Review coverage** shows **Goursat H4 stars,
tranche 1** (`corpus-goursat-h4-stars-1`), with direct source buttons, rational
Coxeter–Dynkin symbols, definition hashes and the complete next queue.

Generation uses the existing `generate(kind="regular", key=...)` dispatch and
new-document history workflow. Cancel, export guards and complete source/form
ownership fence publication. Native project saving retains the source snapshot,
construction receipt and numerical evidence; subsequent transform history replays
through the existing recipe system. OFF retains literal incidence and coordinates,
but has no custom receipt fields. No new IPC operation or worker policy is needed.

## Accepted definitions

Full names, aliases, cell inventories and primary incidence-matrix reference URLs
are retained from `star_uniform4.json`. New keys are `goursat-wythoff-<acronym>`;
original `star-uniform4-*` keys and geometry are unchanged.

| Acronym | Coxeter–Dynkin symbol | V / E / F / C | Scope |
| --- | --- | --- | --- |
| gax | x3o3o5/2o | 120 / 720 / 1200 / 600 | Regular |
| gogishi | o3o3o5/2x | 600 / 1200 / 720 / 120 | Regular |
| fix | x3o5o5/2o | 120 / 720 / 1200 / 120 | Regular |
| sishi | x5/2o5o3o | 120 / 1200 / 720 / 120 | Regular |
| gofix | x3o5/2o5o | 120 / 720 / 1200 / 120 | Regular |
| gaghi | x5o5/2o3o | 120 / 1200 / 720 / 120 | Regular |
| gahi | x5o3o5/2o | 120 / 720 / 720 / 120 | Regular |
| gishi | o5o3o5/2x | 120 / 720 / 720 / 120 | Regular |
| gohi | x5o5/2o5o | 120 / 720 / 720 / 120 | Regular |
| gashi | x5/2o5o5/2o | 120 / 720 / 720 / 120 | Regular |
| raggix | o3x3o5/2o | 720 / 3600 / 3600 / 720 | Additional H4 Wythoffian |
| rigogishi | o3o3x5/2o | 1200 / 3600 / 3120 / 720 | Additional H4 Wythoffian |
| taggix | x3x3o5/2o | 1440 / 4320 / 3600 / 720 | Additional H4 Wythoffian |
| sirgax | x3o3x5/2o | 3600 / 10800 / 8640 / 1440 | Additional H4 Wythoffian |
| gixhi | o3x3x5/2o | 3600 / 7200 / 4320 / 720 | Additional H4 Wythoffian |
| graggix | x3x3x5/2o | 7200 / 14400 / 8640 / 1440 | Additional H4 Wythoffian |

The [raggix primary incidence matrix](https://bendwavy.org/klitzing/incmats/raggix.htm)
also records the rational branch variants. The independent classical name/count
table remains `regular4d_validation.CROSSWALK`; `catalog_audit.expected_table()`
now independently computes expectations for these 16 additional realization keys.

## Definitions and evidence

The native Wythoff seed solves the four mirror equations with equal positive
ring weights and zero unringed weights. Ordered parabolic boundary orbits build
edges, faces and cells; no convex hull or cycle sorting replaces star incidence.

Independently of the seed, `goursat_wythoff.root_group()` exhausts the 120 unit
roots. The four simple roots form a faithful frame: integer permutation traversal
on their images exhausts the group of order 14,400 and all proper subgroups.
For an active node subset S, the predicted entity orbit has size
`14400 / (order(W_S) * order(W_Z))`, where Z contains the unringed nodes commuting
with S. Every connected component of S must contain a ring. Vertex stabilizers
use all unringed mirrors. Predictions alone do not admit a model.

On every uncached build, qualification checks:

- Literal V/E/F/C and **each entity orbit size** against those independent cosets.
- Four-dimensional span; no coincident vertices or duplicate element vertex sets.
- Equal edge lengths, regular polygon radii/turns including winding, face planarity
  and cell flatness. Reported flatness is the first excluded singular value
  divided by the largest; reflection predicates use circumradius-normalized units.
- All four reflections preserve complete edges, ordered face cycles and cell
  boundaries, and act transitively on vertices. Every cell orbit's setwise
  stabilizer is independently checked for vertex transitivity.
- Cell-vertex links and polychoron edge links are single cycles; vertex figures
  are connected, with uniform incidence counts, and every ridge has two cells.
  Orientations are checked on the abstract boundary, without filling crossings.
- For all ten regulars, the separate classical validator reaches all 14,400 flags
  in one orbit and checks the named counts and rational symbols.

`metadata.goursatVerification` records residuals, tolerance (1e-8), separate literal
coordinate/incidence SHA-256 values and local/group receipts. Definition SHA-256,
tranche SHA-256, the original source key and Coxeter–Dynkin symbol are in
`provenance.goursatQualification`. A definition change refuses even a cached load;
cached results are detached. These are approximate float64 qualifications, not
exact algebraic certificates. Editable saved metadata alone is not fresh evidence.

## Corpus accounting and next queue

`corpus-reconciliation` adds the versioned tranche as `generatedTranches` without
rewriting the frozen version-1 manifest or its qualification policy. The ten
regular rows link existing `regular4:<acronym>` identity IDs; six other local names
use `native-star:<acronym>`. Every row retains `baselineIdentity: null` and
`releaseQualified: false`. No baseline name/number, license approval or competitor
execution is invented. Mathematical generation does not establish redistribution
qualification or independent specialist review.

The provider manifest retains **70 queued definitions**: 63 other existing native
rows awaiting this stronger qualification, and seven unregistered `[3,3,5/2]`
ring masks (1001, 0101, 0011, 1101, 1011, 0111, 1111). Extra seed stabilizers can
invalidate naive coset predictions: 1001 predicts 2,400 vertices, but the numeric
seed orbit disagrees and is refused. No welding, partial orbit or replacement hull
is returned. General non-chain Goursat tetrahedra, arbitrary marks such as 4/3,
coincident elements and nonorientable results remain outside this tranche; the
existing B4/F4 star providers remain available independently.

## Scenarios and verification

The R5 inventory explicitly delegates LIB-* to R5-CORPUS and has no LIB-05/06
scenario IDs to promote. This tranche defines `r6-uniform-regular-ten` and
`r6-uniform-h4-star-six` (the 16 parametrized output cases),
`r6-uniform-extra-stabilizer-refusal`, and `r6-uniform-history-roundtrip`.
These are native qualification scenarios, not executed Stella conformance claims.

```powershell
python -m pytest tests/test_goursat_wythoff.py tests/test_corpus_reconciliation.py tests/test_catalog_registry.py tests/test_catalog_audit.py tests/test_star_uniform4.py -q -p no:cacheprovider
python -m pytest tests/test_named_counts.py -q -p no:cacheprovider
node --test tests/goursat-wythoff-controls.test.mjs tests/corpus-reconciliation-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/construct-gallery.test.mjs tests/app-chrome.test.mjs tests/renderer-contract.test.mjs tests/star-uniform4.test.mjs
npx.cmd vite build --configLoader native
```

Electron was not launched. The lead should click through both ordinary entry
points, cancel a construction and reopen a saved star project in the desktop app.

Executed: **226** focused native tests plus **597** named-count tests (**823**
distinct Python tests), **119** distinct Node tests, and a successful Vite build
with the existing mixed-import/chunk-size warnings. Final focused reruns cover
the strengthened links, cell stabilizers and stale-definition refusal paths.
Additional Node suites were catalog discovery, library navigation/rail/visual,
common mounted workflows, smoke compatibility and startup performance.

## Round 7: remaining rational chains and Schwarz triangles (R7-STARS2)

This section supersedes the tranche-1 totals and queue above. All **79** existing
native star-polychoron definitions now have the independent Goursat qualification:
the original 16 plus **50 H4, 7 B4 and 6 F4** rows. No supplied mesh or new
mathematical identity was added to the 4D provider. Keys are still
`goursat-wythoff-<bowers>`; the complete names, symbols, expected counts and
definition hashes are in `engine/catalog_data/goursat_wythoff/tranche.json`.
The 63 added rows carry `qualificationRound: 7`.

The root adapter now exhausts both normalized root-length orbits for B4 and F4.
Its independently traversed faithful root-frame actions have the following bounds:

| Family | Normalized roots | Group order | Additional qualified rows |
| --- | ---: | ---: | ---: |
| H4 | 120 | 14,400 | 50 |
| B4 | 32 | 384 | 7 |
| F4 | 48 | 1,152 | 6 |

Every output retains all the tranche-1 metric, entity-orbit, cell-stabilizer,
ordered-incidence, noncoincidence, orientation and local-link checks. Every
remaining `[3,3,5/2]` mask (1001, 0101, 0011, 1101, 1011, 0111, 1111) was retried.
Each has a smaller seed orbit than its inactive-mirror coset prediction and is
refused. The queue now records the mask, predicted V/E/F/C, refusal status and
reason; no partial orbit, welding or replacement hull is returned.

### Native 3D generation

`engine/schwarz_wythoff.py` independently generates **63 reflection-based U1–U75
polyhedra** from rational Schwarz-triangle definitions, using new keys
`schwarz-wythoff-u<number>`. Existing `antiprism-u*` keys remain available.
Twenty overlap existing convex and Kepler–Poinsot native constructors; the other
**43** extend independent construction coverage. Those existing constructors are
retained, including the independent convex snubs outside this reflection tranche.
The data manifest is `engine/catalog_data/goursat_wythoff/schwarz.json`.
The excluded U numbers are **12, 29, 32, 40, 46, 57, 60, 64, 69, 72, 74, 75**:
rotation-only snubs and the exceptional non-three-mark entry need a different
generator. Existing independent convex snub implementations remain available.

For `p q | r`, the first two triangle vertices are ringed; p, q, r are the
opposite mirror-pair rational branch marks. The seed has equal positive signed
distance to ringed mirrors and zero distance to the others. Literal edge orbits
and ordered dihedral face cycles are built without importing source geometry.
Independent matrix-group polygon counts, faithful integer root-frame actions,
three incidence-preserving reflections, transitive vertices, regular face winding,
planarity, equal edges, noncoincidence and single-cycle vertex links qualify every
generated boundary. Collapsed alternating polygons are explicitly excluded and
recorded; they are never welded into smaller polygons or traversed twice.
Convex entries additionally match the entire independently rebuilt hull boundary
before receiving convex classification and supporting-plane data.

All 63 generated results have been compared with their pinned Antiprism sources
by an independent spanning-frame isometry search, including complete edges and
**ordered face cycles**, not just counts or the skeleton. The comparison permits
translation, positive scale and orthogonal motion, including reflection; it makes
no handedness convention claim. Manifest receipts retain the source asset SHA-256
and comparison residual (maximum observed approximately 6.9e-15 in normalized
circumradius units). Runtime construction does not read those source meshes.
Reference comparisons are retained evidence for the pinned asset, while native
geometry checks are recomputed on uncached loads. Current crosswalk-definition
hashes are checked even for cached loads; returned models are detached copies.

### UI, history and corpus

Open **Construct → Create a new shape → Goursat / Wythoff stars**. The existing
panel `goursat-wythoff-settings` now reads **Goursat / Schwarz Wythoff shapes**.
Choose a prefixed **4D** or **3D** entry in **Wythoff shape**
(`goursat-wythoff-choice`) and click **Create verified Wythoff shape**
(`generate-goursat-wythoff`). For example, try `goursat-wythoff-rofix`,
`goursat-wythoff-qrit`, `goursat-wythoff-gic`, and `schwarz-wythoff-u39`.
The status and collapsed evidence retain `goursat-wythoff-result` and
`goursat-wythoff-evidence`. All common actions work with Expert mode off.
The Library exposes **Goursat star Wythoff (verified tranche)** and
**Schwarz triangle Wythoff (generated)** families.

Both dimensions use existing `generate(kind="regular", key=...)` dispatch,
guarded source/form ownership, cancellation, new-document history and saved
snapshot/replay/export workflows. No new IPC op is introduced. Project snapshots
retain `metadata.schwarzVerification` / `provenance.schwarzQualification` for
3D and the existing Goursat receipts for 4D. OFF retains coordinates/incidence.

**Corpus coverage → Review coverage** keeps `corpus-goursat-h4-stars-1` (now
79 definitions) and adds `corpus-schwarz-wythoff-u63` (63 existing `uniform3:U*`
identities with independently generated realizations). Neither supplement
promotes release qualification. The 4D baseline coverage increment remains **0**:
no mapping to the unavailable 2,191-entry roster is invented.

### Scenarios, limits and verification

Closed native qualification scenarios: **`r7-stars2-h4-50`**,
**`r7-stars2-b4-7`**, **`r7-stars2-f4-6`** (all added 4D outputs),
**`r7-stars2-schwarz-u63`** (every admitted U identity, metric and ordered-boundary
source comparison), **`r7-stars2-seven-degenerate-masks`**,
**`r7-stars2-source-independent-generation`**, **`r7-stars2-stale-definition`**,
and **`r7-stars2-common-ui-history`**. These support LIB-05 qualification; they
are not executed competitor-conformance scenarios or a claim that LIB-05 is done.

Float64 predicates use tolerance 1e-8 and expose residuals; no exact algebraic
certificate, star solid-interior interpretation, license/release qualification,
general Goursat tetrahedra, non-chain D4 rational extension, or arbitrary triangle
and ring-mask support is claimed. D4 has no source row in the existing rational
chain queue. Electron was not launched; desktop click-through remains with the
lead. The existing registered Node control suite now covers both dimensions;
no new Node test file or package test-list change is needed.

Executed final verification: **1,231 Python tests passed**: 190 in
`test_schwarz_wythoff.py` + `test_goursat_wythoff.py`, 192 in
`test_corpus_reconciliation.py` + `test_catalog_registry.py` +
`test_catalog_audit.py` + `test_star_uniform4.py`, and 849 in
`test_named_counts.py`. All used `python -m pytest ... -q -p no:cacheprovider`.
**120 Node tests passed** across Goursat controls, corpus reconciliation,
engine-op allowlist, Construct gallery, app chrome, renderer contract, star
uniform controls, catalog discovery, Library navigation/rail/visual, common
mounted workflows, smoke compatibility and startup performance.
`npx.cmd vite build --configLoader native` passed with the existing mixed-import
and chunk-size warnings. Whitespace checks passed with CRLF treated as line ends.
