# Hyperbolic navigation correctness

13 November 2026, r11-nav. Addresses the navigation findings in
`FABLE_REVIEW_2026-11-13.md`. All coordinates remain float64 approximations.

## Where to try it

Open **Hyperbolic space** (`hyperbolic-library`) and any of
`hyperbolic-open-534`, `hyperbolic-open-435`, `hyperbolic-open-535`,
`hyperbolic-open-353`, `hyperbolic-open-small-cover`.
**Explore inside** (`hyperbolic-explore`) supports WASD and arrow keys; drag to
look after pointer capture. **Return to center** (`hyperbolic-home`) returns to
the document's starting cell. **View** (`hyperbolic-model`) chooses the Overview
projection. Explore always uses Klein, with one straight segment per edge and a
shader fade `exp(-0.22 * hyperbolicDistance)`.

## Findings and fixes

1. **Rebase drift.** Repair the incoming observer and the carried pose with
   timelike-first, parity-preserving Lorentz Gram–Schmidt. Repair again after
   honeycomb face crossings; manifold crossings preserve their quotient chart
   parity. Already repaired retained anchors remain stable under validation.
   The tolerance scheme is:

   | Check | Bound |
   | --- | --- |
   | Incoming navigation frame | absolute metric residual <= 1e-8; finite, future and correct parity |
   | Viewer repair | every 128 compositions or absolute residual > 1e-12 |
   | Published quadratic metric residual | <= 1e-12 * scale² |
   | Linear correspondence/reconstruction discrepancy | <= 1e-12 * scale |
   | Maximum coordinate/matrix scale | 10,000; larger inputs/results are refused |

   Boundary repair is unconditional in `_rebase`; retained-frame validation
   repairs only measurable drift above 1e-14, avoiding repeated changes to
   anchor hashes. No gate is relaxed after a failure.

2. **Coverage.** Radius mode means every cell meeting the ball about the
   request's observer, including cells whose centres lie outside the ball.
   `CellBall` projects onto the cell interior, faces, edge spans and vertices;
   a circumradius bound cheaply rejects distant candidates. BFS crosses only
   cells meeting the ball, until every incident face has been examined. This
   covers the ball because the ball's intersected convex cells form a connected
   adjacency patch. Tangency tolerances may include extra boundary cells.
   The initial anchor cell must meet the ball; otherwise the caller must rebase
   first. Excluded candidates are culled before developing distant vertices.

   Honeycombs and the small cover now share `Development`, its bounded cache,
   replay-verified cursors, resource caps and neighbour schema. Radius defaults
   to 2 and is clamped to 2 for all five documents. Complete-depth requests are
   clamped to 5 for `{4,3,5}`, 3 otherwise. The 4,096-cell hard cap remains.
   Coverage reports the effective radius/depth, observer in output coordinates,
   completeness and explicit stop reason. Radius mode does not claim complete
   unculled adjacency layers. Resource-limited pages never claim completeness.
   The renderer requests 128 instances / 4,096 candidate examinations per page;
   the small cover no longer has a 16-instance nonresumable cap.

3. **Seamless rebase.** Request around displacement 0.7. Keep drawing the old
   buffers with the live observer while fetching the complete replacement ball
   and cooperatively preparing its buffers. Tick and look continue. Transport
   the latest observer, including movement after the request, by the returned
   anchor transform. Publish observer, anchor, binding and prepared geometry in
   one synchronous swap. Projection/LOD changes during preparation cause a
   fresh preparation before publication. Cancellation/failure retains the old
   coherent view. Existing worker edge-sample reuse still applies to appends;
   replacement geometry is rebuilt rather than reusing samples across anchors.

4. **Precision gates.** Linear discrepancies now divide by scale, not scale².
   Nearby centres (within 0.1 hyperbolic unit, smaller than these cells'
   inradii) that fail bucket/correspondence checks raise instead of creating a
   second cell. Distant generator products are checked directly: applying
   Gram–Schmidt to their already-rounded entries amplifies their error. Nearby
   development charts are repaired; distant products retain every metric,
   correspondence and edge-spread gate. Viewer metric checks use scale² and
   weld checks use scale. Klein buckets locate candidates; all four coordinates
   must pass the linear weld gate. Point normalization remains diagnostic; it
   does not replace the authoritative developed matrices.

5. **Cold-cache cursors.** Verification/replay has a separate 60-second bound;
   the two-second page budget begins afterwards. Cache eviction changes neither
   cursor validation nor deterministic incidence. On cursor/checkpoint refusal,
   renderer paging restarts once with a fresh matching generation and replaces
   its page list cleanly. Superseded bindings still refuse publication.

6. **Smaller items.** Explore uses Klein independently of the Overview toggle;
   distant edges fade by observer distance. Home requests an empty starting
   address instead of resetting only the current chart. Consecutive identical
   honeycomb face generators cancel; the existing 16,000-generator / 64 KiB
   address bounds remain. Both document kinds emit neighbour rows
   `{cell,face,toCell,toFace,vertexPermutation,status}` with full template
   permutations and null unexpanded targets. Manifold rows additionally carry
   `quotientState`. Earlier saved manifold rows remain readable. Model memory
   capture explains that hyperbolic documents should be saved as native projects
   before invoking Euclidean validation.

## Measured evidence

Seeded random headings and frame-by-frame wobble, 200 rebases per document
(1,000 rebases total), with output gates checked on every rebase:

| Document | Maximum absolute carried-frame metric residual |
| --- | ---: |
| `{5,3,4}` | 8.882e-16 |
| `{4,3,5}` | 6.661e-16 |
| `{5,3,5}` | 2.665e-15 |
| `{3,5,3}` | 8.882e-16 |
| Small cover | 9.548e-15 |

Coverage tests independently enumerate each incident star by reflecting only
across faces through a fixed vertex. Every anchor vertex is checked at the
default observer; opposite vertex rays are checked 0.01 unit before and one unit
beyond the vertex. Expected star sizes are 8, 20, 20, 12 and 8. All are complete,
with no gate trips. Default complete ball counts: 63, 165, 273, 93 and 63 cells.
Off-centre probes used 116–320 cells for the honeycombs, 135–152 for the cover.
The maximum allowed complete-depth patches were also measured: 927 cells at
depth 3 for `{5,3,4}`, 2,643 at depth 5 for `{4,3,5}`, 1,537 at depth 3 for
`{5,3,5}`, and 3,493 at depth 3 for `{3,5,3}`. All completed without gate trips;
the largest measured vertex time among those patches was approximately 1,190.603.

The atomic-swap test records **zero blank draw ranges**, keeps the old buffers
during preparation, verifies live motion transport and checks coherent state at
the publication callback. Every shared-face vertex pair in the 4,096-cell
`{5,3,5}` depth-four probe welds under the linear gate (more than 20,000 pairs).
The mounted Chromium flow exercises all five presets, repeated rebasing,
save/reopen, mixed projects, history, cancellation and Euclidean-tab isolation.

Verification: **227 Python tests**, **118 Node tests**, and
`npx.cmd vite build --configLoader native` pass. The Node run includes all five
hyperbolic files and affected model-memory, memory-addition and publication
suites. Added Node cases live in existing registered files; no package script
changes are needed. Python navigation regressions are in
`tests/test_hyperbolic_navigation.py`.

## Limits and integration

No new op names, app wiring or project-schema changes are required. Public
`hyperbolic-patch` still accepts the same parameters; manifold budgets now also
accept the shared honeycomb budget fields, with `maxInstances` retained as an
alias for `pageSize`. Cursors remain disposable and may restart after upgrades.
Cell IDs and picks remain epoch-local. Full Coxeter word reduction and reuse of
prepared geometry across anchors remain follow-ups. Continuous motion consumes
the margin of the observer ball generated at request time; it is refreshed by
early rebasing.

Electron was not launched. Desktop frame rate and first-patch performance need
lead verification on the actual app. The concurrent headless verification run
measured first visible patches at approximately 0.88 / 1.51 / 2.62 / 3.15 / 3.24
seconds; these are Chromium test observations, not a desktop performance claim.
The independent homology reconstruction mentioned in review finding 6 belongs
to the verification package and is unchanged here.

## File manifest

- Engine: `engine/hyperbolic.py`, `engine/hyperbolic_document.py`,
  `engine/hyperbolic_manifold.py`, `engine/hyperbolic_orbit.py`,
  `engine/hyperbolic_protocol.py`; added `engine/hyperbolic_coverage.py`.
- Renderer: `ui/hyperbolic-document.mjs`, `ui/hyperbolic-math.mjs`,
  `ui/hyperbolic-viewer.mjs`, `ui/hyperbolic-worker.mjs`,
  `ui/memory-controls.mjs`.
- Python tests: `tests/test_hyperbolic_document.py`,
  `tests/test_hyperbolic_manifold.py`, `tests/test_hyperbolic_orbit.py`,
  `tests/test_hyperbolic_protocol.py`; added
  `tests/test_hyperbolic_navigation.py`.
- Node tests: `tests/hyperbolic-mounted.test.mjs`,
  `tests/hyperbolic-protocol.test.mjs`, `tests/hyperbolic-viewer.test.mjs`,
  `tests/model-memories.test.mjs`.
- Added this document: `docs/HYPERBOLIC_NAVIGATION.md`.
