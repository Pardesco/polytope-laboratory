> Published October 24, 2026: [0.27.20 community preview](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.27.20) is now public, with matching executable/source ZIP. GitHub main and tag v0.27.20 use the verified sealed source plus publication documentation updates (commit `62abb4c`). Local 0.27.21 remains unqualified. Older public-0.26.0 statements below are historical.

# 0.27.21 source qualification

October 25 update: this document records the October 24 source snapshot. Subsequent
core-workflow changes, including [native project validation](PROJECT_VALIDATION_REUSE_2026-10-25.md),
change its bound inputs. Preserve these receipts; refresh full source qualification
against the final runtime before release preparation. Focused current checks do
not replace that deferred full proof.

October 24, 2026. This continuation broadens development regression coverage;
it does not qualify the Electron bundle or portable wrapper. The qualified
local pair remains **0.27.20**, public production remains the documented 0.26.0
preview, and feature expansion remains paused.

## Coverage

`test:features` now declares all **168 shipped-code Node test files**, rather
than 135, plus the two existing standalone face-fill scripts. Node test execution
is sequential and uses explicit TAP output. Five named, unmounted development
projection prototypes remain excluded. The frontend qualifier fails if a shipped
suite is missing, duplicated or unexpectedly excluded.

Native qualification discovers all **135 `tests/test_*.py` files**. Both runners
bind UI/desktop and native dependencies, catalog data, scripts, test helpers and
fixtures, top-level development references and package/build configuration
before and after execution. Native execution uses below-normal Windows process
priority and one BLAS/OMP thread. Frontend fixtures are pinned to this workspace.
The relevant stage-override environment variables were absent in this session.

These hashes bind the repository inputs in the stated scope, not every installed
Python/Node dependency byte. Runtime versions and lock/configuration are recorded.
Do not edit bound inputs while a qualifier is running. Preserve the existing
receipt and raw logs before repeating a run; receipts now refuse overwrite.

## Inherited fixture and expectation repairs

The first expanded frontend run had **2,044 passes and 30 failures** with
unchanged inputs. Six local Viewer fixtures lacked the renderer's production
clear-color API, and one tour layer lacked `setSectionModel()`. They now use or
implement the actual test contract. The shared renderer contract checks the
appearance helper and transparent alpha. All **51 focused checks** passed; the
next broad frontend run passed **2,075 tests** before native test repairs.

The initial complete native run had **4,459 passes, 14 failures, one skip and
96 passing subtests** with unchanged inputs. Every failing node reproduced on
the sealed 0.27.20 source; all six affected test files were identical there.
The strengthened six-file suite now passes **339 tests**:

- Malformed boolean filters still refuse. Supported spiky and tidy-dual filters
  additionally prove completed negative results and verified adoption/replay.
- Antiprism catalog membership checks the original 167 entries, twelve reflected
  snubs and the separately attributed Skilling figure against their manifests.
- Pose-only history uses the existing parent; edited notes seed a retained full
  source before the operation. Tests verify graph preservation, dependencies,
  source immutability and replayed notes.
- Ordinary-faced star nets preserve face/edge owners and rigid folding;
  pentagram-face nets and convex-only duals still refuse. Tesseract incidence
  reciprocation verifies counts, round-trip geometry/incidence and open-boundary
  refusal.

Production geometry, history and rendering were not weakened to satisfy these
older tests. See [the review brief](CLAUDE_REVIEW_0.27.21.md) for the rationale.

## Evidence

The complete final frontend run passed **2,075 tests**, zero failures/skips,
plus both standalone face-fill scripts. The complete native run passed
**4,476 tests and 96 subtests**, with one skip and zero failures/errors.
The Windows-only skip is the POSIX named-pipe test. Both runners bind exactly
the same **2,474 unchanged inputs**, which still match the workspace.
The **168-module build passed with actual npm exit code zero**. Its existing
chunk-size warning caused PowerShell to classify the first command as failed;
that raw log is retained separately, and a subprocess receipt records the actual
build exit code.

Current evidence:

- `artifacts/frontend-source-tests-0.27.21.json` and `.log`.
- `artifacts/native-development-0.27.21.json` and
  `artifacts/native-qualification-console-0.27.21.log`.
- `artifacts/build-source-qualification-0.27.21.json` and `.log`.
- `artifacts/local-checks-source-qualification-0.27.21.json`: current source,
  measurement, test and build consistency, documentation links and log hashes.
- `artifacts/prior-pair-and-runtime-source-qualification-0.27.21.json`: unchanged
  prior release/archive and protected inputs; six old runtime inputs differ and
  three modules are new. This audit is not a candidate freeze.

Earlier evidence remains preserved:

- `artifacts/frontend-qualification-initial-index-0.27.21.json`: original failed
  frontend receipt/log bytes and their preserved paths.
- `artifacts/qualification-before-native-repair-index-0.27.21.json`: initial
  failed native run and green frontend run before native-test changes.
- `artifacts/native-inherited-baseline-0.27.21.json` and `.log`: exact fourteen
  failures reproduced against the verified sealed baseline.
- `artifacts/fixture-repair-focused-0.27.21.tap`: 51 frontend repair checks.
- `artifacts/native-test-repairs-focused-0.27.21.log`: 339 native repair checks.
- `artifacts/runtime-review-source-qualification-0.27.21.patch` and `.json`:
  consolidated 43-file runtime/tool/test diff against sealed 0.27.20, with hashes.

The older 263-Node/192-native focused receipts remain overlapping evidence.
Their source audit predates the broader test/tool changes. Use the final source
qualification receipts for the current complete test inputs.

Normal-session packaging, alternating navigation/rotation and morph profiles,
packaged workflows, actual portable launch, independent review and fresh-user
observation remain outstanding. Follow [the handoff](HANDOFF_0.27.21.md) and
[observation protocol](CORE_WORKFLOW_OBSERVATION.md). No Electron launch, ACL
workaround, package, freeze, seal, commit or publication was performed here.
