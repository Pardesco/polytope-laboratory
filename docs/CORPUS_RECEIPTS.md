# Corpus receipts v2

Round 8 adds a successor evidence policy alongside the unchanged v1 corpus crosswalk. It closes the receipt-ingestion slice of LIB-01/02/03/05/06 and spec §12; it does **not** close those corpus requirements or create new baseline identities. Round 7's generated Goursat/Schwarz and classification evidence remain independent. No catalog aggregator or identity-manifest regeneration is included.

## Click through

In the ordinary **Library → Corpus coverage** (`library-corpus`), choose a family (`corpus-group`), named identity (`corpus-identity`) and source realization (`corpus-realization`). Expand **Corpus receipts — evidence and review gates** (`corpus-receipts`). Expert mode is unnecessary.

- **Prepare selected evidence** (`corpus-receipt-prepare`) computes current numerical geometry and separate coordinate/topology hashes. Classification, chirality, license and baseline statements retain source evidence; review remains pending.
- **Import evidence JSON** (`corpus-receipt-file`) or paste/edit **Version 2 corpus receipt bundle JSON** (`corpus-receipt-json`).
- **Check receipt gates** (`corpus-receipt-check`) shows accepted/rejected/stale evidence, current review blockers and v2 coverage in `corpus-receipt-status` / `corpus-receipt-results`.
- **Save evidence JSON** (`corpus-receipt-save`) uses the existing native save dialog and bounded atomic JSON export. The saved file preserves the editor's literal JSON. Reimport it in a later session; receipt drafts are separate from geometry/project history.

Example: review U1, select Antiprism's U1 realization, prepare evidence, check gates, then save. Expect accepted evidence and **zero qualified baseline identities**, with missing human-review/license/baseline gates visible. Changing the identity, editing JSON or beginning a newer action aborts obsolete requests and exports. Changing external source files requires another check; this is a snapshot, not filesystem monitoring.

## Policy and trust boundary

`engine/catalog_data/corpus_receipts.schema.json` specifies version 2, enforced without new dependencies by `engine/corpus_receipts.py`. A bundle has `format: "polytope-corpus-receipts"`, `schemaVersion: 2`, and at most sixteen receipts. Each receipt has a unique `id`, one explicitly mapped `identity` / `realization`, `pins`, and five independent `evidence` domains: geometry, classification, chirality, license and baselineIdentity.

Evidence acceptance means the named source is current and its recorded numerical audit matches a fresh audit. It does not authenticate the supplied classification/chirality/license/baseline statements. Geometry is float64 tolerance evidence with residuals, not an exact certificate. Rejected evidence has an unsupported mapping or mismatching audit. Stale evidence has changed pins or cannot be rechecked; it contributes no qualification. Malformed bundles are refused with a validation error.

Nine pins bind the complete v1 crosswalk, provider manifest (or native metadata), literal asset where present, ordered coordinates, indexed ordered incidence, actual license document where present, importer/runtime fingerprint, receipt/audit verifier source and policy schema. Coordinate and incidence hashes are independent literal representation hashes; they establish neither congruence nor combinatorial isomorphism. Missing/changed source assets and manifests revoke acceptance even if a loader has a warm cache. Any changed pin revokes qualification. Frozen builds retain the three additional verifier source files for the same fingerprint checks.

Human approval is deliberately separate. `engine/catalog_data/corpus_review_registry.json` is an application-maintained trusted registry; the engine never accepts a registry from renderer parameters or imported bundles. The shipped registry and shipped receipt bundle are **empty**. No real specialist review or license permission is invented.

For a future independently reviewed receipt, maintainers must explicitly register a reviewer (`id`, `name`, allowed `domains`) and an attestation for each approved domain (`receiptSha256`, `reviewer`, `domain`, `decision`, timezone-bearing `reviewedAt`, `reference`). `receiptSha256` is SHA-256 of the complete receipt's canonical JSON: sorted object keys, compact separators, ASCII escapes, finite JSON values. The native result exposes this hash. Attestations are trusted local records, not cryptographic signatures or self-authenticating statements. Their references must identify the actual human review; editing the application registry is a maintainer trust action outside this UI. A receipt edit changes its digest and invalidates old attestations. Any registered rejection vetoes approval; merely naming a reviewer inside uploaded JSON is refused.

Qualification requires all five trusted approvals, passing current numerical geometry, resolved classification/chirality, explicit baseline correspondence, a pinned redistribution document with asserted permission, a named roster and a direct realization. Restricted/unreviewed licenses never qualify, even if attestations exist. Reflected realizations remain inspectable evidence and cannot qualify a baseline identity. Multiple receipts or direct alternate realizations count each named identity once per group. Candidate inventories never enter the numerator. Group totals overlap and must not be summed.

## Native interface and bounds

`corpus-receipts` is allowlisted and reusable, accepts no model or arbitrary path, and uses:

```js
{action: 'prepare', identity: 'uniform3:U1', realization: 'antiprism:antiprism-u1'} // {bundle}
{bundle: {format: 'polytope-corpus-receipts', schemaVersion: 2, receipts: []}} // current evidence / coverage
{} // evaluate the shipped bundle
```

JSON is bounded to 2 MiB (canonical ASCII encoding), sixteen receipts, existing per-model audit limits of 10,000 vertices / 100,000 entities, and an aggregate 20,000-vertex / 200,000-entity audit budget. Split larger submissions. V2 currently accepts mapped U1–75, their named dual obligations, J1–92 and the sixteen classical regular 4D identities. Unmapped duals, near-miss correspondence and specialized/2,191-uniform baseline rosters are still blockers. Native realizations without a retained license-document pin cannot qualify. No automatic claim of absolute left/right chirality is made.

## Scenarios and verification

These new local scenario IDs describe policy checks, not newly completed baseline identities:

| Scenario | Evidence |
| --- | --- |
| `r8-corpus-accepted-unreviewed` | Accepted fixture and live U1/J1/tesseract round trips; no human review inferred |
| `r8-corpus-rejected-audit-forgery` | Rejected fixture; edited residual fails fresh-audit comparison |
| `r8-corpus-stale-pins` | Stale fixture; each of nine pins revokes approval; changed literal asset refused |
| `r8-corpus-candidate-exclusion` | Unknown baseline, wrong realization and unsupported near-miss mapping refused |
| `r8-corpus-reflection-exclusion` | Fully attested synthetic reflection still contributes zero identities |
| `r8-corpus-license-review-gate` | Unreviewed/restricted/unpinned terms and missing domain reviews block qualification |
| `r8-corpus-count-once` | Duplicate realization receipts count a fully reviewed synthetic identity once; order does not change coverage |
| `r8-corpus-review-binding` | Evidence edits invalidate attestations; human rejection vetoes approval; missing roster remains blocked |
| `r8-corpus-common-ui` | Ordinary Library mount, import/save, stale reply/export cancellation and native JSON-lines dispatch |

`tests/fixtures/corpus-receipts/{accepted,rejected,stale}.json` use synthetic pins. Tests inject a fictional reviewer/resolver solely to exercise successful qualification and exclusions; no fixture approvals ship in the product registry.

Verification: focused Python corpus suites **91 passed**; Node receipt/corpus/allowlist/pool suites **37 passed**, Library/chrome/export/renderer regressions **92 passed**; Vite production build passed with existing chunk-size/mixed-import warnings. Electron was not launched; lead desktop click-through and packaged-engine qualification remain outstanding.

```powershell
python -m pytest tests/test_corpus_receipts.py tests/test_corpus_reconciliation.py -q -p no:cacheprovider
node --test tests/corpus-receipt-controls.test.mjs tests/corpus-reconciliation-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs
node --test tests/catalog-discovery.test.mjs tests/library-navigation.test.mjs tests/library-rail.test.mjs tests/app-chrome.test.mjs tests/construct-gallery.test.mjs tests/renderer-contract.test.mjs tests/startup-performance.test.mjs tests/library-visual.test.mjs tests/bounded-export.test.mjs tests/design-tokens.test.mjs
npx.cmd vite build --configLoader native
```
