# Condition fitting (W2)

Construct → Modify this model → **Make faces regular** (`make-faces-regular`,
inside `fitting-settings`) solves and commits a valid, tolerance-satisfying result.
Undo restores the original snapshot. **Fitting options** (`fitting-options`,
collapsed initially) contains the primary condition (`fitting-mode`), additional
objective checkboxes (`fitting-regular-faces`, `fitting-planar-faces`,
`fitting-equal-edges`, `fitting-equal-areas`), tolerance (`fitting-residual`),
evaluation budget (`fitting-evaluations`), symmetry and scale preferences.
**Solve preview** (`preview-fitting`) and **Adopt fitted model** (`adopt-fitting`)
support reviewing other conditions. Unresolved candidates need explicit residual
acceptance (`accept-fitting-near-miss`); invalid candidates cannot be adopted.
`fitting-result` separates optimizer termination, tolerance and geometric validity,
with max/RMS before and after for every condition. Numeric fields accept expressions.

Analysis automatically shows `near-miss-deviation` for supported current sources:
global and per-face edge deviation percentages, maximum regular-angle deviation
in degrees, and normalized best-fit planarity. “Nearly regular faces” means local
edge deviation ≤5%, angle deviation ≤5°, and planarity ≤1e-4 mean edges. This is a
display threshold, not a catalog or Johnson-solid classification. Regular-faced
solids can have different face areas and different edge lengths between faces.

## Native computation and definitions

`geometry-fit-preview` / `geometry-fit` retain the existing preview/adopt protocol.
New parameters select the condition solver: `objectives` (nonempty list of
`regular-faces`, `planar-faces`, `equal-edges`, `equal-areas`), `fix_scale` (default
true), `keep_symmetry` (default false), optional regular `face_ids`, and existing
bounded `max_evaluations`, `residual_tolerance`, `solver_tolerance` controls.
`mode: planar-faces` also selects this solver. Legacy requests on valid planar
sources retain their numerical path and replay behavior; previously refused
warped-source requests use the new repair solver. No algorithm or product
version was changed. Normal recipe history records new parameters and evidence;
save/open/replay uses the existing registered `geometry-fit` operation.

The bounded SciPy TRF/LSMR least-squares solve moves source vertices without
changing edges, ordered face cycles or cells. Regular faces combine face-relative
equal sides, equal interior angles, regular polygon chord ratios, and planarity.
Equal edges and equal areas use deviations from the current mean unless an explicit
target is supplied. Explicit targets require Fix scale off and a single edge/area
objective. Area is the norm of the oriented boundary bivector; on warped input it
is an area proxy, and on planar convex output it is polygon area. Angle residuals
are radians; the regular-face aggregate divides angles by π. Planarity residuals
are coordinate components of best-fit affine-plane errors divided by mean edge.
All objectives additionally enforce face planarity, and 4D cell hyperplanarity,
because adopted models must remain valid native convex boundaries.

Fix scale normalizes every candidate to the source mean edge while retaining its
centroid. Keep symmetry enumerates the source's complete Euclidean incidence group
through `engine/symmetry.py`, averages its coordinate actions into an invariant
projector, and solves in that projector's invariant basis. It preserves existing
numerical symmetry; it does not infer an intended higher group. This option needs
a valid planar source and refuses an incomplete 10,000-frame search.

`geometry-fit-deviation` is read-only and uses the same residual functions. It is
registered for warm-worker reuse. Analysis owns its request through the existing
report ticket; stale responses never replace a newer source's metrics. Fitting
uses NumericEntry/source/history/control guards and cancelable native requests.

## Bounds and mathematical limits

The source must have intrinsic convex 3D/4D incidence, 4/5–64 vertices, ≤256 faces,
≤128 cells, and ≤32 vertices per face. Warped starting faces/cells are accepted for
repair; malformed incidence, coincident vertices and degenerate faces/cells are
refused. Generalized, star and nonconvex sources are unsupported. Imports/projects
still use their existing strict validation, so accepting a warped solver input
does not expand the app's import domain.

Maximum work is 400 solver function evaluations and 12,000 residual calls
(including finite differences). SciPy reports evaluations rather than its internal
iteration count; an interrupted residual budget reports that count as unavailable.
There is no global feasibility or exactness certificate. Stationary non-solutions
retain residuals and remain “Not converged,” even when SciPy reports success.
Adoption separately checks native planarity/rank, convex cycles and supporting
facets, distinct vertices and source-relative face/cell orientation. These convex
checks provide the intersection safeguard; no general mesh collision algorithm
or nonconvex embeddedness claim is made. Collapsed or flipped realizations cannot
be adopted even if objective residuals are tiny. Replay depends on deterministic
floating-point backend behavior; saved snapshots remain available independently.

## Verification

`tests/test_condition_fitting.py`: perturbed cube/icosahedron regularization,
Johnson J1 preservation, impossible symmetric heptagonal bipyramid with exposed
stationary residuals, perturbed 4D tesseract, planar/equal-area and combined fits,
source symmetry, scale/targets, collapsed/flipped refusal, work limits,
cancellation/source mutation, deviation metrics, and save/open/history replay.
`tests/test_geometric_fitting.py` retains the legacy fitting checks.
Node tests cover primary-button history dispatch, options, stale/canceled/export
publication, result reporting and warm deviation workers. Vite build verifies
renderer bundling. Electron was not launched in the sandbox.
