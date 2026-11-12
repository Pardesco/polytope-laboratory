# R7 specialized relationship qualification

The ordinary Library has a collapsed **Specialized relationships** panel
(`library-classification`). No Expert mode is needed. Choose **Classification
tranche** (`classification-tranche`), then the named relationship
(`classification-identity`). **Review relationships** (`classification-refresh`)
reloads its recorded evidence. **Recheck numerical classification**
(`classification-verify`) recomputes that source's checks. The evidence details
retain residuals, separate coordinate/incidence hashes, references and original
classification/chirality/genus hypotheses. Cancellation and changing selections
discard late results. This analysis does not change project history.

**Open source model** (`classification-open-source`), **Open generated dual**
(`classification-open-dual`) and **Open related model**
(`classification-open-related`) use the existing catalog/document loader.
Only relevant actions appear. Generated models retain their receipt in model
metadata through save/reopen; existing recipe generation, Undo/Redo and replay
also support their catalog keys. Generated duals are searchable in the Library
under **Generated uniform duals**, with keys `generated-dual-uN` and U aliases.

## Separately reported tranches

| Tranche | Recorded numerical passes | Explicit unresolved records |
| --- | ---: | ---: |
| 3D: finite generated U dual mappings | 40 | 13 |
| 3D: local fitted near misses | 10 | 0 |
| 3D: Stewart toroids, including original family variants | 7 | 0 |
| 3D: selected compound realizations | 7 | 0 |
| 4D: Tuta and Koho scaliforms | 2 | 0 |
| 4D: two 16-cells, three 16-cells, three tesseracts | 3 | 0 |
| 4D: Koho / 16-cell regiment relation | 1 | 0 |
| 4D: retained named fissary acronym assertions | 0 | 24 missing sources |

These are **107 relationship/realization records**, not 107 new mathematical
identities. The five-tetrahedra A/B realizations remain separate, retaining the
source coordinate convention. No aggregate crosswalk, parity ledger or release
qualification was changed. The lead can merge the 40 successful `dual3:UN`
records' `sourceKey`, `generatedKey` and receipts into the aggregate as
**generated identities**, never supplied sources.

The 3D manifest covers all 53 formerly unmatched dual obligations from the
retained crosswalk. U3, U4, U15, U49, U51, U62, U65, U70, U71 and U75 have
center-plane singularities; U32, U64 and U72 have coincident reciprocal planes.
Their source geometry and explicit refusal reasons remain accessible. No
off-center or large finite substitute is silently introduced. Projective/ideal
dual display remains a separate existing workflow.

## Definitions and limits

Finite duals reciprocate source face planes about the vertex mean with radius
1. Checks qualify each named U source numerically (equal edges, regular ordered
faces, complete incidence-preserving symmetry with one vertex orbit), then
independently verify reversed rank counts, every vertex/face incidence, edge
correspondence, polarity dot products and dual-of-dual coordinates at the same
center. Genus is abstract surface genus with manifold/orientability hypotheses;
no generalized filled interior or embeddedness follows.

Near-miss receipts retain fitted approximation flags and recompute edge,
face-angle and planarity deviations. They establish deviation of this
realization, not impossibility of a regular realization or a global optimum.
Stewart receipts recompute bounded R/A/Q/T/D checks, genus and complete numerical
symmetry/chirality; original source chirality hypotheses stay visible separately.
Compound qualification checks disjoint literal ownership and reconstructs every
constituent's convex boundary, including 4D cell incidence. It does not certify
the full compound's symmetry or source chirality assertion. Coordinate
multiplicity here compares literal binary64 tuples; nearby coordinates are not
silently identified or welded.

Scaliform checks recompute equal edges, element circumspheres, closed cell/ridge
incidence, published cell inventories and complete numerical vertex transitivity.
Koho has 8/24/28/12 elements; the 16-cell has 8/24/32/16. Scaling the latter by
`1/sqrt(2)` gives a verified vertex bijection and common edges while full cyclic
face and cell comparison proves different incidence. Opening the related model
retains its original catalog scale. Shared coordinates never merge topology.
The 24 fissary assertions have no pinned loadable named geometry in this tranche;
fissary rank and chirality remain unqualified. Missing benchmark rosters, other
specialized families, distribution approval and specialist release review remain
follow-ups. Nothing here is an exact algebraic certificate.

## Provider files and reproducibility

`engine/catalog_data/classification/3d.json` and `4d.json` are separate versioned
providers. Runtime pins use bundled JSON metadata and native definition-table
hashes, which work without loose Python sources in a frozen bundle. Retained
Python implementation hashes describe the build-time evidence only. Generated
dual loading verifies current source and output coordinate/incidence bindings
and recomputes polarity/involution before returning geometry. A summary labels
recorded receipts unchecked; only an explicit live check displays a current pass.

Rebuild only these providers offline:

```powershell
python scripts/build-classification-qualification.py
```

Read-only reusable native op: `classification-qualification`, params
`{tranche: "3d" | "4d", id?: string, verify?: boolean}`; no model/path input.
Changed provider definitions or geometry refuse qualification rather than
substituting an identity. Regeneration intentionally requires review of new
receipts before integration.

## Scenario contracts and verification

`tests/fixtures/classification-relationships.json` records the new scenario IDs:

- `r7-classification-finite-u-duals`: 40 finite mappings and 13 explicit refusals.
- `r7-classification-near-miss-realizations`: ten bounded fitted-realization checks.
- `r7-classification-stewart-genus`: seven R/A/Q/T/D/genus receipts.
- `r7-classification-compound3-ownership`: seven literal compound realizations.
- `r7-classification-scaliform-elements`: Tuta and Koho element checks.
- `r7-classification-compound4-ownership`: three literal 4D compounds.
- `r7-classification-koho-regiment`: common skeleton, distinct full topology.
- `r7-classification-fissary-source-gaps`: missing-source reporting only; no
  fissary geometry/classification closure is claimed.

These close the named bounded receipt/refusal contracts, not entire LIB-01/02/03/06
requirements. The existing conformance inventory delegates detailed LIB scenarios
to corpus workers; it and the lead-owned aggregate crosswalk remain untouched.

Tests cover every provider record, deterministic regeneration, all 40 generated
loads, altered source/polarity/topology refusals, stale pins, project history and
replay, JSON-lines dispatch, cancellation, mounted Expert-off controls and native
save/reopen. The mounted browser test uses real Python IPC without Electron.
Packaged desktop qualification remains for the lead.

Executed results: **348 Python tests passed**, **110 Node tests passed** (including
the native mounted browser workflow), and Vite production build passed with the
existing mixed-import and large-chunk warnings. No Electron launch was attempted.
Maximum recorded dual polarity residual: `5.33e-15`; maximum involution coordinate
residual: `2.73e-15`, with numerical tolerance `1e-7`.

```powershell
python -m pytest tests/test_classification_qualification.py tests/test_catalog_registry.py tests/test_scaliform4.py tests/test_corpus_reconciliation.py tests/test_reference_library.py tests/test_near_miss_catalog.py tests/test_compound_library.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/classification-qualification-controls.test.mjs tests/classification-qualification-mounted.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/catalog-discovery.test.mjs tests/corpus-reconciliation-controls.test.mjs tests/library-rail.test.mjs tests/renderer-contract.test.mjs tests/startup-performance.test.mjs tests/app-chrome.test.mjs tests/construct-gallery.test.mjs tests/library-navigation.test.mjs tests/design-tokens.test.mjs
npx.cmd vite build --configLoader native
```

## File inventory

- Native: `engine/classification_qualification.py`, `engine/classification_duals.py`.
- Providers: `engine/catalog_data/classification/3d.json`, `4d.json`.
- Rebuilder: `scripts/build-classification-qualification.py`.
- Renderer: `ui/classification-qualification-controls.mjs`,
  `ui/classification-qualification.css`.
- Additive registrations: `engine/catalog.py`, `engine/server.py`,
  `desktop/main.cjs`, `desktop/engine-pool.cjs`, `ui/app.js`, `ui/style.css`.
- Tests: `tests/test_classification_qualification.py`,
  `tests/classification-qualification-controls.test.mjs`,
  `tests/classification-qualification-mounted.test.mjs`,
  `tests/fixtures/classification-relationships.json`; Node suites added to
  `package.json`'s `test:features` list.
- Documentation: `docs/R7_CLASSIFICATION.md`.
