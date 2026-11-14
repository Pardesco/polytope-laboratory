# Round 11 fixture repair

Audited the feature-suite failures recorded against `09e1f1f`. All 65 failures
were fixture or source-assertion gaps after hyperbolic document integration;
no application behavior needed changing. Existing publication, cancellation,
history, physical-unit, output-byte and stale-source assertions remain in place.

## Failure classification

Counts below are failures in the supplied QA log, not total tests in each file.

| Test file | Failures | Classification and repair |
| --- | ---: | --- |
| `derived-publication.test.mjs` | 26 | Fixture gaps: supply the real `isHyperbolic` predicate and a Euclidean `model()` for the isolated geometry-export action. |
| `net-print-session.test.mjs` | 19 | Fixture gap: provide live `model()` from the fixture state for the document-kind guard. |
| `derived-document-context.test.mjs` | 11 | Fixture gap: supply the real `isHyperbolic` predicate to extracted document initialization functions. |
| `document-field-edits.test.mjs` | 3 | Fixture gap: supply the real `projectSnapshot` function to extracted serialization code. |
| `pose-element-content.test.mjs` | 2 | Fixture gaps: provide live `model()` in both extracted workspace display tests; retain all pose/content ownership assertions. |
| `analysis-overview.test.mjs` | 1 | Source-assertion gap: execute the actual Euclidean `refreshAnalysis()` branch and verify overview counts and refresh ordering across the paint boundary. |
| `default-look.test.mjs` | 1 | Source-assertion gap: require both kind-aware restore sites to retain the legacy Euclidean defaults followed by saved overrides. |
| `image-capture-session.test.mjs` | 1 | Source-assertion gap: execute the actual image action on a Euclidean model and verify it returns the capture-session result; keep playback/cancellation wiring checks. |
| `history-recovery.test.cjs` | 1 | Stale schema fixture: use unsupported project version 3, since approved version 2 is now valid; still require rejection and unchanged project/backup bytes. |
| `dual-morph-sparse4d-mounted.test.mjs` | — | Pre-existing R10 cell120 timeout; outside this repair. |

The QA log's “Missing expected rejection” belongs to `history-recovery`,
not `pose-element-content`. It is caused by the now-supported version 2 input.
Analysis and image capture were checked behaviorally before their obsolete
source patterns were replaced. No assertions were deleted or relaxed to accept
stale publication or the wrong document-kind branch.

## UI and integration

No new controls or engine operations. Existing click-through paths are Analysis
(`analysis-overview`, `analysis-overview-vertices`), Save picture (`image`),
geometry export (`export-dialog`), net printing, and project save/open/recovery.
Hyperbolic dispatch and geometry remain unchanged. No integration hooks or
`package.json` registrations are needed; all modified tests are already listed.

## Verification

Each repaired file passed **alone** with `node --test --test-reporter tap`:
derived-publication 27, net-print-session 21, derived-document-context 17,
document-field-edits 10, pose-element-content 44, analysis-overview 13,
default-look 14, image-capture-session 16, history-recovery 1: **163 passing**.

`npx.cmd vite build --configLoader native` passed (406 modules); existing chunk
size and mixed static/dynamic import warnings remain. Prettier and
`git diff --check` passed. No Electron launch or Python source changes.

Full `npm.cmd run test:features:run`: **3,731 tests, 3,730 passed, 0 failed,
1 cancelled, 0 skipped**, in 2,338.43 s (38.97 min). The command exits 1 solely
because Node counts the known timeout as a cancelled test. The two face-fill
scripts preceding the Node suite also passed. Local full log: `fixtures-full.log`.

The current full run reproduced the known `cell120` mounted timeout at 170 s,
phase `expansion reopen`, with no reported browser errors or pending jobs.
