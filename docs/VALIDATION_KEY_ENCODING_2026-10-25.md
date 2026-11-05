# October 25 continuation: bounded validation-key encoding

Follows [project validation reuse](PROJECT_VALIDATION_REUSE_2026-10-25.md).
Development remains 0.27.21; the published/qualified 0.27.20 baseline is preserved.
The active goal continues to prioritize existing core performance and reliability,
with noncritical broad qualification deferred until final release preparation.

## Implemented

`SectionValidationCache.key` retains its plain JSON type and 65,536-node preflight
and now computes a conservative upper bound on the canonical ASCII wire length.
When that bound fits both configured byte limits, Python's C JSON encoder creates
the complete sorted literal key. Larger overestimates use the original streaming
encoder and exact byte checks. Nothing substitutes a fingerprint or caller report
for source data, and models are still walked on each request to detect mutations.

The bound counts container punctuation, quotes, at most twelve ASCII bytes per
Unicode codepoint (including supplementary characters), at most one decimal digit
per integer bit plus sign allowance, and 32 bytes per float. Unsupported direct
Python types, cycles/node overflow, oversized strings/keys and nonfinite numbers
still bypass reuse. The C path can allocate only a key within the configured byte
limits; the fallback preserves eligibility for compact data whose conservative
bound is larger than its actual encoded length. Entry/result/LRU budgets, analyzer
ownership, output copies, validation and geometric algorithms are unchanged.

This shared helper benefits section-source validation, repeat analysis and the
new request-local project geometry cache. No UI behavior or hidden derived-view
availability changed in this pass. The renderer investigation found no reason to
alter hidden derived computation before resolving its export/memory consumers.

## Evidence

Preserved pre-change source:
`artifacts/validation-key-baseline-_06u6uom/section_validation.py`.
The comparison script verifies that only `SectionValidationCache.key` differs
from that source by comparing the remaining AST.

`scripts/profile-validation-keys.py` records seven alternating before/after
samples after warmup, with native imports outside timing and one BLAS/OMP thread.
Final receipt: `artifacts/validation-key-profile-j1y_o5hf/result.json`.

| Direct Python workload | Before median (IQR) | After median (IQR) |
| --- | ---: | ---: |
| 600-cell complete key | 8.692 ms (1.115 ms) | 3.315 ms (0.153 ms) |
| Small mixed-type key | 0.0071 ms (0.0008 ms) | 0.0040 ms (0.00075 ms) |
| Streaming fallback, 200,000-character string | 0.209 ms (0.002 ms) | 0.210 ms (0.005 ms) |
| Warm complete 600-cell analysis | 10.284 ms (0.224 ms) | 3.927 ms (0.267 ms) |
| Warm 600-cell section | 55.785 ms (1.620 ms) | 51.237 ms (2.362 ms) |
| Six-state 600-cell project validation | 489.637 ms (9.234 ms) | 423.187 ms (8.581 ms) |

Keys and complete caller outputs match. Section comparison fixes only newly
generated UUIDs to permit full dictionary equality, preserving geometry,
provenance and numerical fields. Complete expected results, raw timing samples,
input/baseline hashes and unchanged selected before/after source hashes are saved.
The six-state starting point already includes the previous project reuse change;
this is a further reduction of about 14% in that source-level workload. These are
CPU measurements on Python 3.10.11/Windows, not desktop latency or FPS claims.

Focused verification receipt:
`artifacts/validation-key-checks-20261025-130030/result.json`.
**109 tests and three subtests pass**, covering the new encoding paths and their
actual analysis/project/convex/generalized/exact/ordinary-cell/worker consumers.
The receipt records all selected source/test input hashes and the raw native log.

New tests cover canonical keys for escaping, supplementary Unicode/lone
surrogates, integer/float/bool distinctions, signed zero, extreme numbers,
300 deterministic mixed JSON inputs, exact entry/total byte boundaries,
fallback ownership, subclasses and oversized/cyclic/deep inputs. An initial test
incorrectly assumed supplementary-only strings always overestimate their wire
size; that fixture was corrected to include ASCII so it exercises the fallback.
Production allocation and eligibility checks were not relaxed.

No frontend source changed and no new frontend build was needed for this native
pass. Earlier frontend/build receipts remain historical evidence for their bound
inputs. No Electron/portable/visible/fresh-user check was run.

## Continuation

Continue the active high-impact goal. Measure remaining navigation/display and
native work before adding caches or changing derived readiness. Native
`section_validation.py` now changes as well as `formats.py`; refresh consolidated
review/proof inputs and rebuild the bundled engine before final package testing.
This focused evidence does not qualify the full source tree or a release.
