# Repeat native analysis with complete source ownership

October 24, 2026, 0.27.21 development. Returning to an existing document requests
analysis again. The native server can now reuse a successful report for the
complete unchanged model instead of repeating validation, face measurements,
dihedrals and intrinsic hull reconstruction. First analysis remains unchanged
apart from cache bookkeeping. Independent model generation is not accelerated.

Actual desktop navigation qualification remains pending. The measurements below
cover direct Python computation and real JSON-lines workers, not Electron IPC,
renderer work, monitor presentation or overall loading speed.

## Why the reuse is equivalent

`engine/server.py` changes only its `analyze` dispatch branch. The original
`engine.geometry.analyze`, `validate`, `intrinsic_measures`, hull implementation
and all three protected importers remain byte-identical to sealed 0.27.20.
Explicit `validate` requests keep their original path.

`AnalysisCache` uses the established `SectionValidationCache.key` policy to build
a complete canonical JSON string, not a hash or source ID. All literal model
fields participate, including ordered coordinates/incidence, supplied reports,
measure caches, colors, metadata, IDs and units. Numeric/list/object-key types
cannot be coerced into a different eligible input. Non-JSON direct Python inputs
and ineligible/oversized records fall back to the original analyzer.

The analyzer function itself participates in the cache namespace. On a miss,
the original analyzer runs in full. Errors never enter the cache. A result is
retained only after successful native computation and within the output budget.
Cached records and cache-hit replies are deep copies. Changing a returned report
cannot corrupt retained analysis. The original cold-call numeric-record alias
behavior for direct Python callers is preserved; JSON-lines replies cross the
same detached JSON boundary as before.

Changing coordinates with the same claimed fingerprint, forging supplied
validation or measure records, changing metadata/units, and invalid incidence all
force the original path. The native analyzer still ignores caller-supplied
content/boundary scalars and independently recomputes intrinsic geometry. No
frontend report/publication, source ownership, cancellation or history guard is
changed.

Each worker retains at most four LRU entries, with a 2 MiB key cap, 1 MiB result
cap and 8 MiB total serialized key/result budget. Eligibility also retains the
existing 65,536-node key-policy limit. Keys and result accounting stream with
size checks. These are serialized-data limits, not total Python process-memory
measurements. Oversized inputs/results compute normally without reuse. Worker
retirement or cancellation discards its private cache; reuse is never persisted.

## Investigation and direct computation

The pre-change investigation is retained at
`artifacts/native-load-investigation-0.27.21/`. Its cProfile attributes much of
generation/analysis work to geometry validation, polygon operations and hulls.
It is diagnostic, not a controlled before/after or visible-loading comparison.

`scripts/profile-native-analysis.py` checks the protected analyzer hash against
the 0.27.20 freeze, generates each model once, and compares seven passes in
alternating order. Every complete result is equal and sources remain unchanged.
OpenBLAS and OMP are explicitly set to one thread, following the native section
profiler's configuration. Cold samples are separate single observations.

| Model | Original repeat analysis median (IQR), ms | Cached repeat analysis median (IQR), ms |
| --- | ---: | ---: |
| 120-cell | 353.565 (363.364) | 8.002 (6.304) |
| 600-cell | 1,257.044 (10.571) | 16.632 (0.674) |
| Grand hexacosichoron | 129.587 (1.737) | 9.424 (0.303) |

Receipt: `artifacts/native-analysis-profile-0kc_w57q/result.json`.
The 120-cell timings vary substantially; preserve its IQR and raw samples.
Cold candidate samples include key/storage overhead and are not a cold-load
improvement. Retained key/results occupy about 105, 104 and 42 KiB respectively
in these individual cache instances.

## Actual native JSON-lines round trips

`scripts/profile-analysis-protocol.py` launches the exact sealed 0.27.20 server
file and the current server in separate warm Python workers. Requests alternate
sequentially; no two native calculations run together. The old server hash and
unchanged analyzer/measurement/generator hashes are verified before execution.
New request IDs and complete decoded report equality are checked on every reply.

| Model | 0.27.20 repeat round trip median (IQR), ms | 0.27.21 repeat round trip median (IQR), ms |
| --- | ---: | ---: |
| 120-cell | 342.102 (211.617) | 8.958 (0.224) |
| 600-cell | 1,226.371 (13.976) | 18.405 (0.536) |
| Grand hexacosichoron | 129.457 (2.405) | 10.477 (0.549) |

Receipt: `artifacts/analysis-protocol-profile-6p7c5jny/result.json`.
These seven alternating-order passes exclude request encoding and include pipe
transport, native work, response encoding and decoding. Single cold/startup
observations are recorded separately. Both workers exit normally. Platform:
Windows 10.0.26200, Python 3.10.11, OpenBLAS/OMP one thread. These are local
elapsed-time distributions, not OS CPU utilization or desktop latency results.

## Verification and remaining packaged check

The combined native suite covers analysis cache and resource boundaries, original
kernel/measurement behavior, section validation reuse and every existing morph
suite. It passes **192 tests and 40 subtests** across 15 files. Node report,
catalog, native-job and project ownership tests are included in the **263-test**
focused run across 30 files. See the current release notes for exact logs.

The initial cache test fixture accidentally kept the original analyzer's mutable
numeric-record alias in its expected result. Altering the cold report altered
that expected value too. The expectation now uses a detached copy; tests verify
both cold-output poisoning resistance of cache storage and warm-output isolation.
The initial failures remain in `artifacts/analysis-cache-initial-0.27.21.log`.
No production fix was needed for that test mistake.

The optional `--navigation` mode in `profile-model-view.cjs` revisits the first
three existing model documents four times before annotation edits. Native saved
source data and notes must stay equal. The comparison rejects incomplete visits,
changed sources, invalid times and mixed profiles with/without the phase. It
reports first-draw and settled distributions using independent per-run medians,
rather than treating each revisit as an independent run.

Run the normal-session sequence in [the handoff](HANDOFF_0.27.21.md), including
`--navigation`. The real worker pool may recycle or distribute work between its
processes, and renderer/report/derived-view work may dominate observed latency.
Do not promise a desktop speedup until those observations have been collected.
Fresh-user observation and the broader core-workflow review remain outstanding.
