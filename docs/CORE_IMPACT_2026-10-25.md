# October 25: core responsiveness and recovery

Local 0.27.21 development continuation. Randall requested highest-impact work
first and noncritical testing at the end before final release. Feature expansion
remains paused. The published/qualified baseline remains 0.27.20.

## Implemented

1. **Cancel obsolete calculations.** Automatic analysis and manual validation
   now cancel when their last report output is superseded. A shared automatic
   analysis remains useful when manual validation replaces only its validation
   output. Derived views also own cancellable requests: navigation, a newer view
   or a changed section depth cancels older work. Signals reach section/dual/entity
   jobs, face/cell net generation, paper packing and stellation. Late results
   cannot append net history or retain an obsolete arrangement. Export parent
   signals remain independent; complete literal-source publication checks remain.
2. **Reuse imports for inspection.** Ten additional read-only operation paths
   can reuse healthy engine workers: `measure`, `entity-measure`, `entity-info`,
   `dihedral`, `align-section`, `entity-orientation`, `cell-facing`, `vertex-figure`,
   `cell` and `element-content-describe`. Each request still supplies its full
   model/parameters and performs its original native computation and validation.
   This adds no result cache. File operations remain isolated; worker count,
   timeout, cancellation, output-size and response-identity bounds are unchanged.
3. **Handle dense geometry bounds safely.** Viewer normalization, net bounds,
   automatic morph radius, section-content tolerance and section slider limits
   scan points without vertex-sized function argument lists. Numerical radius
   computations still use the original coordinate-dimension `Math.hypot` values.
   Focused tests exercise a 200,000-vertex source and literal small-input equality.
   Geometry/incidence and native algorithms are unchanged.
4. **Remove redundant morph scans.** When `setModel` receives an explicit source
   normalization, it validates and uses it directly. It no longer computes the
   displayed frame's center/radius only to discard both. Source normalization
   is still recomputed in `setMorphFrame`; no mutable-source identity shortcut
   was added. Actual native-frame/Viewer tests preserve endpoints, midpoint,
   source picking, materials, camera and changed endpoint topology.
5. **Bound autosave work and preserve playback dirtiness.** Only one recovery
   snapshot may be cloned/sent at a time. Successfully saved unchanged revisions
   skip repeated work. Edits during a write remain eligible at the next interval;
   failures remain retryable. A completion from a replaced project cannot change
   the new project's recovery feedback. The last saved owner is weakly referenced
   so it does not retain a closed large workspace. Rotation/folding and active
   animation playback advance revisions through a lightweight frame path, making
   changed poses dirty without syncing every control on each frame. Native file
   validation and atomic publication/backup logic remain unchanged.
6. **Skip hidden derived rendering.** The ordinary animation-frame loop draws
   the derived viewport only in split layout while its canvas is visible. This
   avoids invisible rendering in model-only and paper/SVG views. Direct
   `draw()`/`image()` and animation/export capture paths remain available.

## Measured worker impact

`scripts/profile-inspection-protocol.cjs` uses the real EnginePool and Python
JSON-lines server on Windows 10.0.26200, with one BLAS/OMP thread. It compares
five samples per case/mode in alternating order, one warm worker against fresh
workers. Warm priming is recorded separately. Cold timings include startup;
steady-state timings assume the worker has not expired or been canceled.

| Cube request | Fresh median (IQR), ms | Warm median (IQR), ms |
| --- | --- | --- |
| Vertex distance | 451.542 (30.207) | 0.364 (0.163) |
| Face entity information | 451.087 (13.648) | 3.029 (0.188) |
| Face text preparation | 460.970 (15.475) | 7.113 (0.139) |
| Edited-coordinate distance | 472.650 (43.063) | 0.401 (0.039) |
| Invalid measurement refusal | 462.369 (32.315) | 0.347 (0.018) |

All decoded results/refusals match between modes. Changed coordinates with the
same supplied identity change the measured result. Fifty requests use 26 spawned
workers including the warm primer. Raw timings, priming, runtime and selected
source hashes are in `artifacts/inspection-protocol-h7IZhK/result.json`.

These are source-worker round trips through EnginePool, not packaged executable,
Electron IPC, GPU, visible task latency or FPS measurements. The other seven
new reusable operation paths are not timed by this comparison. Worker retirement
on cancellation and the existing 60-second idle timeout still incur cold startup.
Dense-bound fixes prevent the argument-limit failure; no end-to-end loading
speedup or morph FPS claim has been measured.

## Focused verification

`artifacts/core-impact-20261025-112057/result.json` records **127 passing tests**
across 16 affected-workflow suites, zero failures/skips, and a successful
**169-module production build**. `focused.tap` and `build.log` retain the raw
output. The receipt binds the changed runtime, profiling script and selected
suite inputs before/after; they remained unchanged during execution. It does not
hash every transitive dependency or constitute full source qualification.

Coverage includes stale/aborted work, independent report channels, worker
cancellation/framing, actual native morph and section content, dense bounds,
net history, autosave overlap/retry/project replacement and fold-pose changes.
The hidden-render guard was code-reviewed and built; its actual GPU effect and
capture behavior remain part of packaged verification.

October 24 broad source receipts and review patches bind earlier inputs. They
remain preserved evidence and do not qualify the changed workspace. No Electron
launch, ACL workaround, native bundle/package, freeze, seal or online publication
was performed. The 0.27.20 baseline is preserved.

## Remaining priority

Continue improving demonstrated core bottlenecks; avoid speculative caches or
deferred feature expansion. The current changes make normal-session visible
navigation/inspection/morph and save/recovery checks particularly valuable at
final qualification. Include hidden-to-split view switching, exact PNG/video
capture, large imports, same-source annotation edits, edits during Save/autosave,
and worker restart costs. Refresh full source checks and review diffs before the
final package/seal sequence in `HANDOFF_0.27.21.md`; retain old receipt bytes.
The prepared fresh-user observation protocol remains outstanding.
