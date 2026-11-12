# Large 4D morph performance

Expansion and Tilting quads retain their existing source/dual endpoints, literal
owner maps, RGBA, playback, project reopen and PNG export behavior. No new UI is
added. Open **More → Dual morph** (`open-dual-morph-settings`), choose
`expansion` or `tilting-quads` in `dual-morph-method`, and use Apply, the ratio
slider, or Timeline → Dual morph (`animation-morph`). PNG frames use
`animation-png` in Timeline export settings.

## Causes and changes

The product preflight checks every expanded facet against all vertices. Its
thousands of tall, four-column BLAS matrix-vector calls incurred substantial
dispatch/thread overhead. A direct NumPy `einsum` contraction evaluates the same
complete residual vector. No support, coplanarity, rank, incidence, pole or
resource check is removed; tolerances are unchanged.

Native preparation now seeds the existing bounded literal-input product-plan
cache using the returned normalized settings. The first evaluation reuses that
validated plan instead of repeating the entire preflight. Evaluation still
compares the complete supplied preparation, and changed attributes, context or
forged coefficients still refuse. Public results remain detached.

The mounted harness also sent entire multi-megabyte descriptors through
Playwright's recursive remote-value transport. It now carries native JSON as a
single string in each direction. All engine operations and mounted assertions
remain real. Both 120-cell methods share a browser; each exports exactly three
distinct 480-pixel PNGs. A 170-second overall bound closes the browser and native
worker on timeout. The full five-sample 600-cell native run is an explicit perf
script, outside the everyday Node suite.

The enabling change was `9e2a207` (`r8-morph`, Codex worker, integrated by
Claude). The BLAS expression itself predates that work, appearing in baseline
`2d18847`; R8 enabled the large product domains and introduced the mounted
harness. No other Round 9 package is changed.

## Measurements and checks

An initial cell120 tilting-quads `cProfile` prepare/evaluate pair took 87.8s:
`_plane` accounted for 53.0s across 6,720 calls and preparation ran twice. With
the direct contraction, the same profiled plane checks took 3.7s. Timings vary
with concurrent work and profiling overhead. In an unprofiled native run after
both fixes, preparation plus five frames took 3.34s / 3.39s for cell120 Expansion
/ Tilting quads and 4.41s / 3.95s for cell600. Interior frame evaluations were
about 0.37–0.61s. Chromium profiling of the mounted flow showed mostly idle time,
rather than a face tessellation or content-map CPU hotspot.
Direct renderer-module measurements for cell120 at ratio .37 took 0.418s /
0.414s to build text-owner plans and perform complete ownership checks for
Expansion / Tilting quads. Expansion's two affine PNG sheets, including a
synchronous checked batch and publication checks, took 0.768s. The mounted test
passed alone in 88.27s total (39.95s Expansion, 39.51s Tilting quads plus startup).
The final profiled two-method/five-frame run took 16.55s, with exactly two
preparations for twelve dispatches (two prepares and ten evaluations).

Run the independent large-domain perf check (including literal source
preservation, complete rank-map counts, geometry validation and RGBA alpha):

```powershell
python -B scripts/morph-sparse4d-perf.py --source both
python -B scripts/morph-sparse4d-perf.py --source cell600 --profile
node --test tests/dual-morph-sparse4d-mounted.test.mjs
```

The script defaults to cell600, five fixed ratios (0, .25, .5, .75, 1), and a
60-second budget per source/method. `--max-seconds` permits explicit profiling
on slower machines. It checks numerical structure, not exact certification.
Existing native sparse4d tests retain the independent complete convex-hull
oracle and all cell links; Node sparse4d tests retain both domains' mapped text,
affine PNG ownership/refusals, source RGBA, playback and capture coverage.
All native `test_*morph*.py` tests passed: **215 tests and 40 subtests**.
All remaining `*morph*.test.mjs` tests passed: **110 tests**, plus the standalone
mounted test above (**111 Node tests total**). The four unprofiled native perf
scenarios and the two profiled cell120 scenarios passed their budgets.
The Vite production build passed (existing chunk-size/import warnings remain).

## Limits

This remains approximate float64 geometry. Interior frames retain ordered
generalized incidence; they do not gain exact/filled-volume certificates. PNG
source-face collapse and unsupported combinations still refuse. Complete
per-frame source/preparation ownership and geometry validation still run, so
large-mesh playback is computation-paced. Electron was not launched here.
