# Startup performance (U11)

Startup now reuses a disposable catalog **metadata** index, imports optional
construction/solver workflows on their first operation, and loads video/GIF
encoders only when export starts. Existing controls, IDs, history, model outputs
and native operation names are preserved. No new dependency or preference is
required.

The base canvas draws before automatic incidence analysis and element-type
symmetry work starts. Analysis → `#analysis` / `#evidence` show their existing
progress messages; `#element-types` immediately shows “Finding element types…”.
Two animation callbacks allow a paint between model publication and secondary
work. A 100 ms fallback prevents an occluded renderer from waiting indefinitely.
Source ownership and Cancel are checked again after that wait. Measurements
remain available through the existing controls.

## Local measurements

Windows x64, Python 3.10.11, NumPy 1.26.4, SciPy 1.11.4; source baseline
`678f3d8`. Five interleaved fresh-process samples per case, with the desktop's
`OPENBLAS_NUM_THREADS=1` / `OMP_NUM_THREADS=1`. These are CPU/catalog timings,
**not measured Electron launch or first-interactive-model times**. OS file caches
were warm, and other work on this shared machine makes absolute times variable.
All catalog cases returned the same 1,594 records.

| Median, milliseconds | Baseline | New, index absent | New, persisted index |
| --- | ---: | ---: | ---: |
| Import engine server | 361.26 | 255.62 | 255.96 |
| First catalog request | 177.27 | 260.99 | 30.88 |
| Repeat catalog request in that process | 100.59 | 19.06 | 19.09 |
| Import + first catalog, per-sample total | 550.67 | 516.61 | 287.87 |

Import ranges in this run were 346–390 ms baseline and 248–277 ms new. Initial
index construction costs more than the old catalog call; the reduced imports
offset that cost in these samples. Subsequent launches benefit most. Raw samples
are in `artifacts/startup-paired.json` in this worktree. Reproduce against a
baseline ref with:

```powershell
python scripts/benchmark-startup.py --baseline-ref 678f3d8
python scripts/benchmark-startup.py
```

The baseline mode executes the retained server/catalog source from git in fresh
Python processes, excluding git retrieval time. It uses unchanged supporting
engine modules. `python -X importtime -c "import engine.server"` identified eager
solver/workflow imports. `scipy.optimize` and spring workflows are now absent
after importing the server; core NumPy/SciPy spatial support remains eager.

`npx.cmd vite build --configLoader native`:

| Renderer artifact | Before | After |
| --- | ---: | ---: |
| Main JS (Vite decimal kB) | 1,889.43 | 1,873.46 |
| Main JS, gzip kB | 524.87 | 518.61 |
| Video encoder, fetched on export | included in main | 11.60 |
| GIF encoder, fetched on export | included in main | 5.60 |

The large main-chunk warning remains. Panels whose constructors create IDs at
startup stay mounted, including presentation and diagram editors. The deferred
export wrappers recheck cancellation after importing and allow failed imports
to be retried.

## Native startup profile (lead runs outside sandbox)

```powershell
npx.cmd vite build --configLoader native
node scripts/startup-profile.cjs
```

`npm run profile:startup` is equivalent to the second command. The script uses
the existing hidden-runtime preflight, `hidden-no-focus`, a fresh isolated
user-data profile, and independent native visibility/focus monitoring. It runs
once without an index, then again with the same index, prints timing tables,
and writes screenshots and `result.json` under `artifacts/startup-profile-*`.
An optional `POLYTOPE_TEST_EXECUTABLE` must satisfy the existing byte-matched
unpacked-runtime preflight. No Electron launch was attempted in the sandbox.

Main-process marks are enabled only by `POLYTOPE_STARTUP_PROFILE=1` and exposed
to the profiler through `app.polytopeStartupProfile`: Electron ready, window
created, first engine spawned and first engine ready. The engine emits one
readiness marker on **stderr**, immediately before its JSON-lines request loop;
stdout framing is unchanged. Renderer `performance.mark` milestones use the
`polytope:` prefix: `renderer-script-parsed` (first app module statement after
dependency evaluation), `catalog-loaded`, `first-model-rendered` (first base
draw with a model), `analysis-started`, `analysis-done`. The script combines
renderer `performance.timeOrigin` with native epoch times and asserts the first
canvas draw precedes secondary analysis. The marks measure draw submission,
not GPU completion or visible-screen pixel presentation. It also waits for
native jobs, including element-type work, to settle.

## Index validity and limits

The desktop supplies `<userData>/catalog-index-v1.json`; direct engine callers
can opt into disk reuse with `POLYTOPE_CATALOG_CACHE`. Without it, reuse is
process-local. Every catalog request keys the index by all engine Python source
paths/sizes/nanosecond mtimes and all catalog JSON paths/sizes/mtimes, plus the
Python version. Frozen builds additionally key the engine executable. Metadata
helper caches are cleared on an index miss so changed manifests are reread.
New/deleted inputs invalidate the index. A second signature check refuses
publication if inputs change while rebuilding.

The compact JSON index has a versioned key, payload checksum, bounded reads and
atomic replacement. Corrupt, oversized or unreadable indexes rebuild; an
unwritable cache does not stop the Library. Each result is detached from the
cached bytes. The index is an optimization for local metadata, not an integrity
certificate against deliberate cache/source tampering. Same-size source edits
with deliberately preserved mtimes are outside the invalidation contract.

Geometry is never stored in this index. Opening an attributed model still runs
its original source hash, incidence, numeric and applicable certificate checks.
Changing an OFF file cannot make cached listing metadata qualify that geometry.
Linked-folder discovery, user projects and history validation are unchanged.

## Verification

Focused pytest runs use `-q -p no:cacheprovider`. They cover catalog/source
checks, analysis reuse, recipe/replay dispatch, deferred construction workflows,
solver workflows and JSON-lines framing. `tests/test_startup_performance.py`
contains 11 passing cache/protocol/import tests. The initial workflow batch
passed 395 tests plus 22 subtests; the face-placement/startup batch passed 95.
The additional construction/solver batch passed 483 tests plus 10 subtests.
These batches overlap in startup tests (952 distinct test cases overall).

The focused Node run passed 251 tests, including 11 new startup tests, actual
renderer prelude cancellation, DOM-stub element-type waiting, export backends,
existing catalog/navigation/report tests, worker-pool checks and hidden desktop
policy mocks. The new test is registered in `test:features`. Vite build and
`git diff --check` pass. Full desktop/packaged startup measurements and visual
qualification remain for the lead; no desktop latency claim is made here.

Files added: `engine/catalog_index.py`, `desktop/startup-profile.cjs`,
`ui/startup-performance.mjs`, `ui/deferred-media.mjs`,
`scripts/startup-profile.cjs`, `scripts/benchmark-startup.py`,
`tests/startup-performance.test.mjs`, `tests/test_startup_performance.py`, and
this document. Small integration edits: `engine/catalog.py`, `engine/server.py`,
`desktop/main.cjs`, `ui/app.js`, `ui/element-type-controls.mjs`,
`ui/animation-controls.mjs`, `ui/animated-tour-export.mjs`, `package.json`,
and the existing `tests/hidden-qualification.test.cjs` require mock.
