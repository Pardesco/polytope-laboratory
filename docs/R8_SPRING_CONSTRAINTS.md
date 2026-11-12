# Spring distance constraints and pins

This tranche owns spring controls only. The merged `spring/0.1.0` native solver,
dispatch, adoption checks and recipe/history registrations already implement the
necessary computation; they are reused without changing their mathematics or
saved format. Fitting and its disjoint-component/convex 3D/4D support are unchanged.
The workspace refresh now synchronizes spring controls before the construction
gallery, fixing stale disabled controls when a 3D saved project replaces a 4D source.

## Click through

Construct → Make it regular → Spring relaxation (`spring-settings`) →
**Distance constraints and pins** (`spring-constraint-editor`), available with
Expert off. Enter **First vertex ID** / **Second vertex ID** (`spring-pair-a`,
`spring-pair-b`), **Distance** / **Weight** (`spring-pair-length`,
`spring-pair-weight`), then **Add distance constraint** (`spring-add-pair`). These
four fields use NumericEntry and native real expressions; IDs must evaluate to
in-range integers and the endpoints must differ. Each click adds a distinct
constraint, including conflicting or repeated pairs.

**Pin vertex IDs** (`spring-pin-ids`) accepts comma-separated literal source IDs.
**Pin at source positions** (`spring-add-pins`) copies their current coordinates
in source units, with no optimizer freedom for those vertices. Duplicate pins
are refused. `spring-constraint-list` summarizes the first eight distances and
32 pin IDs. **Remove last distance constraint** (`spring-remove-pair`) and
**Remove all pins** (`spring-clear-pins`) leave other arrays intact. Advanced
constraint JSON (`spring-constraints`) remains the single editable definition;
arbitrary pin positions, per-edge targets/weights and signed face steps use it.
Editor changes are drafts until adoption; opening another source retains the
existing constraint fields and interprets their IDs against that current source.

Use **Solve preview** (`preview-spring`), inspect `spring-result`, then
**Adopt preview** (`adopt-spring`). Preview and constraint editing do not change
the document. Adoption recomputes through the existing native recipe workflow;
the evaluated arrays are persisted in history, Undo/Redo, project snapshots and
replay. Expression evaluation refuses publication after source, unit, notes,
history, export, JSON or draft-field changes; **Cancel** (`cancel-spring`) also
cancels an outstanding constraint expression evaluation.

## Definitions and bounded qualification

For spring endpoints a,b, normalization edge length s, target L and weight w,
the normalized residual is `(distance(a,b)-L)/s`, and energy is
`sum(w * residual^2)/2`. Maximum/RMS residuals are unweighted. Pins are exact
coordinate assignments, not additional weighted springs. Ordinary square face
constraints produce four side and two sqrt(2)-diagonal distances, in addition
to the base edge constraints; duplicates are deliberately retained.

Scenario **con-14-constraints** is qualified locally for ordinary square-face
versus explicit-pair equivalence (including nonzero residuals), a pinned
tetrahedron with a redundant distance, a conflicting weighted pair, all-pinned
unsatisfied targets, and collapsed/nonplanar rejection, including a rank-two
candidate with exactly zero distance residuals. The conflict fixture has
edge target 1 and supplemental target 5/3 with weight 3, so that pair's analytic
optimum is 3/2 and total energy is 1/6. Valid unresolved geometry requires
`spring-accept-near-miss`; invalid geometry cannot be adopted under either policy.

Scenario **con-14-initialization** is qualified for the current native PCG64
uniform[-1,1] centered-start contract with seeds 0, 19 and 4294967295, random
spread and pin override. The tests independently reconstruct the stream and
check repeatability. These are bounded local closures of the named scenarios,
not installed Stella option equivalence or full CON-14 parity.

**con-14-grammar remains open.** The installed 5.4 static command/dialog evidence
in `STELLA54_STATIC_CONSTRUCTION_BASELINE.md` and `SPRING_RELAXATION.md` does not
define an executable description grammar or baseline random stream. This editor
does not invent one. Geometry validity here means the existing rank, distinct
vertices, noncollapsed edges, face planarity/area and native incidence checks.
It does not establish embeddedness, absence of self-intersections, uniformity,
global feasibility, exact arithmetic or mathematical near-miss classification.
The existing bounds (256 vertices, 2048 edges, 512 faces, 8192 compiled springs,
2 million spring visits) and clear domain refusals remain enforced by native code.

## Verification

- `python -B -m pytest tests/test_spring_constraints.py tests/test_spring_relaxation.py tests/test_spring_workflow.py -q -p no:cacheprovider`
- `node --test --test-concurrency 1 tests/spring-constraint-editor.test.mjs tests/spring-constraints-mounted.test.mjs tests/spring-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs`
- `npx.cmd vite build --configLoader native`

The independent native oracle recomputes distances, weighted energy, scalar
triple-product planarity and tetrahedral determinants without calling solver
metric/validity helpers. It checks preview/adopt, saved evaluated parameters,
save/load/replay, and successful, unsatisfied and invalid cases. The mounted
Chromium test uses the real app modules and Python JSON-lines server with mocked
desktop file dialogs; it checks Expert-off controls, native expressions, source
pins, preview immutability, adoption, Undo/Redo, reopen/replay and refusal gates.
This is renderer/native integration evidence; Electron and installed competitor
qualification are separate and were not launched here.
