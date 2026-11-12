# R9: density section latency

The Grand hexacosichoron density preview spent most of its winding work in a
Python loop: every arrangement witness tested every source cell, for each ray.
The shallow regression section has 980 arrangement regions and 600 source cells.
This was slow computation, not an unresolved promise or a swallowed exception.

`engine/filled_sections.py` now packs request-local cell frames once and batches
ray/plane intersections and intrinsic bounding-box rejection with NumPy. Only
candidate cells enter the original signed solid-angle and contact checks.
Arrangement tetrahedron volumes also use a batched scalar triple product.
Cell order, retry directions, signed-fan work bounds, two-ray agreement,
orientation checks and area/volume conservation requirements remain enforced.
There is no result cache, new dependency or timeout increase.

## UI and persistence

Use Analysis > Section (`#derived-mode`, value `section`), then Section mode >
Filled (density) (`#section-density-mode`, value `density`). The plane fields
are `#section-normal` and `#section-depth`; evaluate with `#apply-section`.
`#derived-status` reports completion and `#promote` records the native recipe.
Promotion, Undo/Redo, replay and project validation keep their existing workflow.

## Provenance and limits

The scalar bottleneck entered in `27cb3b1` (`w28-solid-sections`, Codex
gpt-6.1-sol worker, integrated by Claude). The filled-section module is byte
identical at r5 `86d82b7`, r6 `1433d42`, failing baseline `10ea054`, and the
starting HEAD. Direct historical-module runs took 10.27 and 10.28 seconds for
r5 and `10ea054`; batching the ray checks reduced that to 4.11 seconds before
the additional volume batching (final native run: 2.841 seconds). Their complete outputs matched except for
maximum integer residual (3.87e-15 versus 2.11e-15); all 38,456 signed triangle
visits and the geometry were unchanged. These are machine/load-specific timings;
there is no evidence identifying an r6/r8 density algorithm regression.

Results remain bounded float64 approximations. Unsupported/open/nonorientable
boundaries, source contacts in global density fill, unresolved winding and
resource exhaustion still refuse; no exact or general unbounded fill is claimed.

## Verification

The unchanged mounted test exercises surface/density/ordinary choices, native
refusals, promotion, project save/reopen, and Undo/Redo. A native regression in
`tests/test_filled_sections.py` additionally checks overlapping cell degrees,
negative orientation, off-source zero degree, degenerate-ray refusal, and the
signed-fan budget. Run all `tests/*section*.test.mjs`,
`tests/test_*section*.py`, neighbouring information-panel/star-contact tests,
and `npx.cmd vite build --configLoader native`.

Verified on November 10, 2026:

- `node --test tests/section-choices-mounted.test.mjs`: 5 passed, unchanged.
- Remaining section Node tests plus star-cell contacts, prism density and
  information panel: 54 passed.
- All section Python tests plus information panel and star-cell contacts:
  153 passed, 3 subtests passed.
- `npx.cmd vite build --configLoader native`: passed (existing bundle warnings).
- Final native geometry/incidence and face densities match the historical
  result; all 38,456 triangle visits remain. Volume batching changes only
  floating-point summation roundoff in content/conservation reports.
