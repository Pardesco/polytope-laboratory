# Finite MEAS-04 acceptance audit

The unchanged acceptance is **“Safe expression parser, constants, arithmetic, roots, trig, and polygon helper functions”**. It is one of the 73 rows in `STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md`, SHA-256 `7dafec36e99c7c883a7222f753f67f1c0818638359419a17f7ecbdf8b875df8d`. This audit supports review of a finite gate; writing this document does not close or apply a ledger gate.

The implemented mathematical categories cover that acceptance. `engine/expressions.py` implements a bounded whitelist interpreter with exact rational arithmetic and declared approximate roots/constants/trigonometry. `engine/expression_batch.py` validates an entire batch before returning values. Neither executes Python or JavaScript source. Literal polygon symbols retain their numerator and denominator; they are not evaluated as a quotient. The independent source fixtures comprise 83 helper tests and 32 batch tests, included in the qualified 3,961-pass native run with one documented skip.

The [publisher's equation guide](https://mail.software3d.com/Manual/Equations.php) describes arithmetic, implied products, golden-ratio aliases, radian/degree trigonometry, root shorthand, and the three polygon helpers. In particular, radius uses edge length one, the angle is a corner in degrees, and the diagonal spans two edges. Our tests use literal circle coordinates, endpoint distances and an independent corner-angle dot product. Complementary symbols, unreduced compounds and signed retrograde angles have an explicit application contract. No unsupported installed-competitor behavior is claimed.

The installed application is Stella4D 5.4, not 6.0. Its local HTML manual SHA-256 is `9cda8b03212946417655ce2d95a5ffece4904b83e4c9f8b936434dbf0050e49c`; the executable SHA-256 is `e56977ded0a791da1003ab85a38177923ee08e2502419292dc7bcd0b9d8e0a4d`. Its equation section documents the older core syntax. The public manual supplies the newer helper definitions. Running or purchasing Stella6 is not an added condition of this finite acceptance.

## Existing qualified evidence

| Evidence | Required binding |
| --- | --- |
| `artifacts/native-development-0.20.0.json` | 520 unchanged inputs; all declared native test files; 3,961 passes and one skip; parser/helper/batch source hashes |
| `artifacts/native-bundle-candidate-0.20.0.json` | 73 compiled engine modules plus server; embedded PYZ; 538 exact resource files; same 520-source proof |
| `artifacts/frontend-candidate-0.20.0.json` | Eight actual ASAR entries; all 205 qualified frontend inputs; four freshly reproduced dist files |
| `artifacts/desktop-qualification-O0Sidw/result.json` | Actual packaged `workspaceNumeric` outer run, unchanged runtime, runner and harness hashes |
| `workspace-numeric-smoke-67kEL3/result.json` beneath that run | Exactly 13 workflows; native saved projects; nested vectors, more than 32 hull coordinates, exact FCC/rational thresholds, counts, orientation, pose preservation, source/input/document/cancel refusals and recovery |
| `artifacts/desktop-qualification-lnLnmu/result.json` | Actual packaged `layers` outer run, unchanged runtime, runner and harness hashes |
| `layer-join-packaged-smoke-sF6vpC/result.json` beneath that run | Exactly 11 workflows; expression quarter-turn and reflection matrices, independent coordinates, replay/reopen, full source RGBA and units |

The collector rereads and hashes every saved project, then independently compares 23 source/notes/attribute pairs and layer source-to-output coordinate/color maps. A self-consistent but wrong quarter-turn, reflection or height does not qualify: these particular expected matrices and signed heights are fixed independently.

## Read-only collector

`scripts/qualify-meas04-gate.py` runs no Electron or dialogs and changes no ledger/runtime/source file. It checks the unchanged original specification and all 73 acceptances; verifies the full source proofs, candidate resource membership and actual archive/code bytes; and executes **90 fresh JSONL requests** against the packaged engine. They include independent arithmetic/constants/root/trig/helper oracles, exact rational threshold digits, malicious program syntax, invalid domains, parser/resource limits, an oversized batch, atomic bad-batch refusal, and a subsequent valid batch. Replies must match IDs, order, numeric modes, exact strings, schemas and numerical expectations; successful summaries cannot substitute for those replies.

The output is an exclusive new JSON file beneath `artifacts/`, using format `polytope-requirement-gate`, schema 1, `requirementId: "MEAS-04"`. It retains hashed input references, original specification rows, candidate executable/engine/ASAR references, all 520/205 qualified source hashes, the exact declared domain, ten acceptance checks and a fresh JSONL output hash. Failure writes a diagnosed failed receipt, never a passed gate. Self-tests use inert fixtures and cannot create a qualified pass.

```powershell
python -B scripts/qualify-meas04-gate.py `
  --unpacked-root release/0.20-candidate/win-unpacked `
  --native-source-proof artifacts/native-development-0.20.0.json `
  --native-bundle-proof artifacts/native-bundle-candidate-0.20.0.json `
  --frontend-proof artifacts/frontend-candidate-0.20.0.json `
  --workspace-desktop-proof artifacts/desktop-qualification-O0Sidw/result.json `
  --workspace-suite-result artifacts/desktop-qualification-O0Sidw/workspaceNumeric/workspace-numeric-smoke-67kEL3/result.json `
  --layers-desktop-proof artifacts/desktop-qualification-lnLnmu/result.json `
  --layers-suite-result artifacts/desktop-qualification-lnLnmu/layers/layer-join-packaged-smoke-sF6vpC/result.json `
  --output artifacts/meas04-gate-0.20.0.json
```

Root must review the collector and actual passed receipt before applying it. Candidate `apply-parity-gate.py --receipt <receipt> --check` reruns the complete collector; omitting `--check` changes only `docs/parity-ledger.json`. It retains LIB-04, every other original requirement, prior attributes and publication history. Only LIB-04 and MEAS-04 are reviewed domains; an arbitrary `passed` receipt cannot close another requirement.

For a released association, `promote-parity-gate.py` requires the same 0.20 promotion/release/native/frontend proofs, all 42 packaged suites, and an actual portable launcher whose extracted executable, ASAR, native engine and full resource manifest match the gate candidate. MEAS-04 additionally requires both exact outer runs above in the release evidence. Historical regeneration checks retained frozen source copies and compiled resources, loading the exact executed collector's schema/oracles from its verified frozen copy. It does not require a later development package version, changed collector or changed source to equal version20.

The new release-qualified snapshot must retain `scripts/qualify-meas04-gate.py`, `scripts/apply-parity-gate.py`, `scripts/parity-ledger.py`, `scripts/promote-parity-gate.py` and `scripts/test_parity_ledger.py`, alongside the original collector, source/frontend qualifiers, workspace/layer harnesses, all other 43 harness/runner files and original specification. Do not overwrite any earlier frozen manifest.

## Scope limits

Roots and transcendentals remain uncertified binary64 results. Exact rational mode refuses irrational output instead of silently converting it. Ordinary real-mode integer fields check the rounded real result; exact count semantics beyond that policy are not invented here. Sliders, literal source IDs, masks, polygon symbols, color strings and structured JSON retain their separate grammar. The typed-field migration and actual desktop workflows corroborate the parser's use; unrelated unfinished operations or all 73 gates are not claimed complete. Hash-bound local execution receipts are reproducible evidence, not signed historical attestations.

## Actual candidate gate completed

Root executed the collector against the frozen candidate and reviewed its 90 matched replies (63 positives, 27 refusals), zero stderr, full archive/resource/source bindings and 23 saved-source comparisons. The actual receipt is `artifacts/meas04-gate-0.20.0.json`, SHA-256 `c5326c939d5a5a63d2aed9279604f1514b0aa188e3cd6146eba7d0b55c7fe598`. Root independently repeated ten collector tests and 46 accounting tests, then application reran the whole collector before atomically publishing only MEAS-04. LIB-04 and all other original records/root metadata remain unchanged. Two requirements are validated; 71 remain open.

Candidate0.20 remains unpromoted because an unrelated WebM endpoint defect failed the tour release suite. The finite parser acceptance does not claim that export defect fixed or that all42 desktop suites pass. Complete retained candidate sources/scripts are frozen under `artifacts/frozen-0.20.0-validated-candidate-source`; earlier frozen snapshots remain intact.
