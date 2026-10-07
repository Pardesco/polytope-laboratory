# Spring relaxation, algorithm 0.1.0

Spring relaxation solves a source-owned network of target distances. It preserves
the original vertex and edge IDs, ordered face cycles, null/RGBA color entries,
coordinate units and a complete historical source snapshot. It does not replace
the topology with a Hull, weld vertices, or classify a result as uniform.

The current domain is a closed XYZ 3D incidence complex with at most 256 vertices,
2,048 edges and 512 faces. Each edge has exactly two incident faces and each
vertex link is a cycle. Multiple components are supported. The starting geometry
may be nonplanar; an adopted result must pass the separate geometric checks.
Source snapshots are bounded at 16 MiB and results at 32 MiB. Compiled constraints
are limited to 8,192 springs and 2,000,000 spring visits. Bounds refuse the entire
request rather than solving a silently truncated source.

## Controls and constraints

The construction disclosure has **Solve preview** and **Adopt preview** actions.
Preview leaves the source and history unchanged. It reports the maximum and RMS
normalized distance residuals, termination status and geometric validity. The
default adoption policy requires all requested distances to satisfy the specified
residual tolerance. A valid realization with unresolved targets requires the
explicit acceptance checkbox; invalid, collapsed or nonplanar previews cannot be
adopted.

Numeric entries accept the native expression syntax. Seed and evaluation limit
must evaluate to integers. Source entity IDs in constraint JSON remain literal
integer references. The scalar defaults are:

| Control | Default | Domain |
| --- | --- | --- |
| Initialization | original vertices | original or seeded random |
| Seed | 0 | integer 0 through 2^32−1 |
| Target edge length | 1 source unit | 10^−100 through 10^100 |
| Random spread | 1 edge unit | .001 through 1,000 |
| Evaluation limit | 500 | integer 1 through 2,000 |
| Residual tolerance | 10^−8 | 10^−12 through 10^−3 |
| Solver tolerance | 10^−11 | 10^−14 through 10^−3 |
| Regular-face distances | off | explicit checkbox |

Advanced JSON accepts arrays named `edge_lengths`, `edge_weights`, `face_steps`,
`face_weights`, `extra_springs` and `pins`. Edge and face arrays follow original
source order. An extra spring is
`{"vertices":[0,2],"length":1,"weight":1}`; a pin is
`{"vertex":0,"position":[0,0,0]}`. Lengths and pin coordinates use source units.
All constraints, including repeated or conflicting pairs, remain explicit.
For regular-face constraints, a signed coprime step d of a face cycle of length n
sets pair distances to
`edge_length * abs(sin(pi*k*d/n)/sin(pi*d/n))`.
Star steps must be supplied explicitly; geometry is not used to guess them.

## Native API and persisted policy

`spring-relaxation-preview` and `spring-relaxation` accept `model`, `params` and an
optional `algorithmVersion` equal to `0.1.0`. Parameters have exactly the form
`{"solver":{...},"adoption":"constraints-satisfied"}` or adoption
`"valid-near-miss"`. The latter name describes explicit residual acceptance and
does not establish a mathematical near-miss classification.

Preview returns a nonrecordable packet containing a model or null, numerical
evidence, and adoption flags. Adoption recomputes the solve and validates the
result before committing. The receipt retains the full source, raw and normalized
controls, all constraints and maps, residuals, solver work and termination,
geometric checks, and NumPy/SciPy/PCG64 implementation versions.

Recorded solves use deterministic evaluation/visit budgets and the same recorded
backend. The solver does not read a clock. An optional unrecorded runtime timeout
or cancellation aborts the workflow: no hardware-dependent partial result is
adopted or recorded. A deterministic evaluation-limited result can be adopted only
when geometrically valid and explicitly accepted. A different recorded algorithm
or numerical backend refuses replay while retaining readable saved snapshots.

Source/workspace/history/parameter ownership is checked before and after native
work. UI callbacks also verify immediately after IPC awaits and immediately before
synchronous publication. Cancellation, export beginning, source changes and
field edits invalidate pending publication and cached previews.

Translation gauges follow the **compiled constraint graph**. Supplemental springs
connecting otherwise separate source components therefore retain their solved
distances. Unpinned constraint groups keep their aggregate starting centroid;
pinned groups keep their exact pin coordinates. Original incidence component IDs
and constraint component IDs are recorded separately.

The numerical backend is sparse TRF/LSMR least squares. It can find a local
stationary realization with unresolved distances; neither optimizer termination
nor small residuals certify global feasibility, embeddedness, uniformity or exact
coordinates. Face planarity, rank, distinct vertices and literal incidence are
checked separately before adoption.

## Baseline evidence and remaining CON14 work

Robert Webb describes equal-rest edge springs, random starts and supplemental
constraints for troublesome isomers in [PolyNavigator section 9](https://www.software3d.com/PolyNav/PolyNavigator.php).
Static inspection of the user's installed Stella 5.4 finds the Spring-Network
Polyhedron dialog, spring-description input and **Start with original vertices**
checkbox. This implementation supports those known concepts through its native
JSON interface. The installed description grammar, exact random distribution,
solver controls and executed 5.4 comparisons remain unverified. It does not claim
full CON14 parity. HEDRON's documented regular-face constraints are independent
context, not evidence of Stella control equivalence. The backend semantics follow
the [SciPy 1.11.4 least-squares documentation](https://docs.scipy.org/doc/scipy-1.11.4/reference/generated/scipy.optimize.least_squares.html).

Headless checks include analytic tetrahedron lengths/area/volume, repaired cube
planarity, literal star steps, conflicting pins and constraints, cross-component
spring ownership, invalid/collapsed cases, deterministic work stops, cancellation,
full source/RGBA/units, native save/load and registered mixed history replay.
Actual UI qualification is recorded separately by the guarded smoke harness;
authoring or native self-tests do not establish GUI evidence.
