# Remaining named U-dual obstruction receipts

This tranche covers exactly **dual3:U3, U4, U15, U32, U49, U51, U62, U64,
U65, U70, U71, U72 and U75**, disjoint from Round 7's 40 generated duals.
Each closes its bounded diagnostic scenario `r8-dual-obstruction-uN` (one
scenario per number above). These are precise source/singularity reports;
**zero new finite catalog models or qualified corpus identities** are claimed.
The aggregate crosswalk and Round 7 provider are untouched.

## UI

In the ordinary Library, expand **Singular U-duals**
(`library-u-dual-obstructions`), choose **Named U-dual** (`u-dual-identity`),
then **Recheck plane witnesses** (`u-dual-verify`). No Expert mode is required.
**Review dual obstructions** (`u-dual-refresh`) reloads recorded evidence.
**Open source polyhedron** (`u-dual-open-source`) uses the existing catalog
document loader and preserves the original source geometry. The report shows
zero-based source face IDs, abstract topology, turning numbers, residuals,
separate coordinate/incidence hashes and provider/license evidence.

Advanced evidence stays collapsed: recorded receipt (`u-dual-receipt`) and
current numerical plane witnesses (`u-dual-verification`). The latter includes
every literal source face cycle, plane normal/offset, homogeneous reciprocal
vertex, dual face cycle and source-edge correspondence. Status lives in
`u-dual-status`; global Cancel and changed selections discard late results.
Read-only diagnostics do not alter history, notes, geometry or saved projects.
Only opening a source creates a document, using the established workflow.

## Finite-domain contract

The pole is the mean of the retained source vertices; reciprocal radius is 1.
This does not prove impossibility for other poles, scales or object classes.
Source polygon cycles are never sorted, welded, repaired or convexified.

| U number | Center-plane faces | Coincident projective plane pairs |
| --- | ---: | ---: |
| 3 | 4 | 0 |
| 4 | 3 | 0 |
| 15 | 4 | 0 |
| 32 | 0 | 20 |
| 49 | 6 | 0 |
| 51 | 6 | 0 |
| 62 | 10 | 0 |
| 64 | 0 | 12 |
| 65 | 10 | 0 |
| 70 | 6 | 0 |
| 71 | 6 | 0 |
| 72 | 0 | 20 |
| 75 | 60 | 62 |

U75 has **both** obstructions; Round 7's first-error refusal only exposed its
center-plane failure. Of its 62 coincident pairs, 30 pairs lie at infinity.
U32/U64/U72 have finite reciprocal coordinates, but distinct face identities
coincide. They fail the ordinary finite dual's distinct-vertex contract; this
is not a claim that every generalized representation is impossible.

The existing projective polarity implementation supplies homogeneous witnesses
without substituting large finite coordinates for infinity. Finite dual refusal
uses distance `4e-8 * source span`; numerical ideal classification uses
`1e-12 * source span`. Projectively normalized point coincidence uses `1e-9`.
All residuals and tolerances are retained. These Float64 numerical receipts
are not algebraic certificates. Infinite fillings, solid measures and nets
remain unassigned. The separate existing Projective / infinite dual workflow
can display such source geometry; this panel does not save a view recipe.

Fixed expected fixtures check source and abstract-dual V/E/F, Euler
characteristic, orientability/genus and polygon turning inventories independently
of dual generation. Nonorientable orientable-genus values remain null. For
example, U70 retains twelve `{5/2}` and six `{10/3}` cycles. Fixtures qualify
the retained named source representation, not an authoritative benchmark roster
or specialist review. U32 and U72 remain distinct source identities even though
their rank counts and genus agree. Source-relative chirality is not newly
qualified, and no absolute handedness is assigned.

## Provider and API

Owned files: `engine/u_dual_obstructions.py`,
`engine/catalog_data/u_dual_obstructions/{expected,manifest}.json`,
`scripts/build-u-dual-obstructions.py`,
`ui/u-dual-obstructions-controls.mjs`, `ui/u-dual-obstructions.css`,
`tests/test_u_dual_obstructions.py`,
`tests/u-dual-obstructions-{controls,mounted}.test.mjs` and this document.
Small additive registrations: `engine/server.py`, `desktop/main.cjs`,
`desktop/engine-pool.cjs`, `ui/app.js`, and `package.json`'s feature test list.

The provider pins all 26 original/adapted OFF assets, the Antiprism manifest
and retained COPYING file. Every source preserves its U-number, catalog key,
aliases, original/adapted asset hashes and separate geometry bindings. Changed
or missing pins disable current checks; changed loaded geometry returns
`unresolved` and publishes no new witnesses. License retention does not imply
redistribution approval. Existing assets are reused without adding dependencies.

Read-only reusable native op: `u-dual-obstructions`, params
`{id?: "dual3:UN", verify?: boolean}`; no model, path, pole or radius input.
Lists are `recorded-unchecked` until explicit current verification; successful
verification means `obstruction-confirmed`, never a finite model pass.
No automatic aggregator registration is made; the lead can ingest these as
**obstruction evidence only**, never generated or supplied finite geometry.

```powershell
python scripts/build-u-dual-obstructions.py
python -m engine.u_dual_obstructions --identity dual3:U75 --verify --output artifacts/u75-obstructions.json
```

## Verification

```powershell
python -m pytest tests/test_u_dual_obstructions.py tests/test_classification_qualification.py tests/test_projective_incidence_dual.py tests/test_catalog_registry.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/u-dual-obstructions-controls.test.mjs tests/u-dual-obstructions-mounted.test.mjs tests/classification-qualification-controls.test.mjs tests/classification-qualification-mounted.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/catalog-discovery.test.mjs tests/corpus-reconciliation-controls.test.mjs tests/library-rail.test.mjs tests/renderer-contract.test.mjs tests/startup-performance.test.mjs tests/app-chrome.test.mjs tests/construct-gallery.test.mjs tests/library-navigation.test.mjs tests/design-tokens.test.mjs
npx.cmd vite build --configLoader native
```

The new Python suite covers all thirteen live receipts, independent plane and
cyclic incidence checks, source drift, topology/winding fixtures, deterministic
regeneration and strict request boundaries. Node tests cover Expert-off lazy
mounting, source opening, cancellation, stale response exclusion, retry and
JSON-lines dispatch. The mounted browser test uses the real Python server to
recheck U75 and U70, open U75's source, and save/reopen it while verifying that
read-only diagnostics leave its history unchanged. Electron is not launched;
packaged desktop click-through and specialist mathematical review remain for
the lead.

Results: **212 Python tests passed** (40 in the new suite), **121 Node tests
passed** (11 new, including the real mounted workflow), and Vite production
build passed with the existing mixed-import/large-chunk warnings. Maximum
recorded plane-fit residual is below `1e-14`; no exactness is inferred.
