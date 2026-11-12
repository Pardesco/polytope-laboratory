# Transverse star-cell contact sections (R8-SECTIONS)

Closes local scenario `r8-sec05-pentagram-product-edge-event`, extending the
R6 pentagram-prism domain under SEC-05. Supplemental case
`r8-sec05-pentagram-product-vertex-event` checks nonzero fill under coordinate
and orientation changes; it is not an additional all-rule oracle qualification.
The independent oracle covers every cell at the edge
event and both neighboring depths for nonzero, even/odd, and signed threshold
2. These are additional native qualifications of `sec-05-filled-density`;
`sec-05-unknown-interior` still requires its global-interior refusal. No
competitor run or full SEC-05 completion is claimed.

## Click through

Generate polygon `5/2`, **Prism from current polygon** (`make-polygon-prism`),
height 2, then **4D prism from current model** (`make-polyhedron-prism`),
height 2. Choose Section (`derived-mode=section`) and **Winding cells —
independent star-cell fill** (`section-density-mode=winding-cells`).
Set `section-normal` to `0, 1, 0, 1`, `section-depth` to `-1 / sqrt(2)`, then
**Evaluate** (`apply-section`). This is the plane `y+w=-1` because depth
is measured along the unit normal. No Expert mode is required.

Analysis → **Filled section settings** (`density-section-settings`, initially
collapsed) offers `section-density-rule`, NumericEntry expression field
`section-density-threshold`, and `apply-density-section`. Try nonzero, even/odd,
and threshold 2. `section-density-legend` reports contact-cell count, winding
integer residual and maximum source-plane residual in source length units.
`promote` uses the existing native recipe history, Undo/Redo, save/reopen and
replay. Contact receipts remain in the promoted model.

## Definition and limits

Only the existing independent-cell route uses `engine/star_cell_contacts.py`:
`section_domain=density`, `cell_orientation=independent`. Global density,
ordinary cells and surface routing are unchanged; no new IPC op is needed.
The parent still validates every closed, connected, orientable source-cell
shell and chooses its positive algebraic-volume orientation independently.

- **Empty:** no intersection produces `empty`; an unselected fill may retain
  separate literal tangent strata under the existing zero-area policy.
- **Supporting vertex/edge:** literal source identities and edges, zero area,
  no assigned boundary winding; output is degenerate when no filled sheets exist.
- **Transverse vertex/edge:** source face planes subdivide the unperturbed
  section plane into open regions. Solid angles classify interior witnesses;
  selected region closures supply patches, boundaries and loops. Boundary
  winding itself is undefined. No offset perturbation or convex hull is used.
- **Coplanar source face/whole cell:** refuses the entire request. Surface /
  convex remains the explicit alternative. No one-sided limiting fill is inferred.

Coincidence/rank and arrangement predicates remain approximate float64, with
the existing 16e-9 normalized-span contact tolerance. Witnesses approaching a
source face plane refuse, even if the solid angle rounds to an integer.
Unresolved predicates, nonintegral winding and all existing source, arrangement,
output and aggregate work limits refuse without publishing partial geometry.
The generic vertex-only event also passes rotation, reflection, scaling and
face-orientation changes. Broader star families remain unqualified.

`densityDiagnostics.contactEvents` identifies original cells, source vertices,
literal cell-owned source edges and helper version. Diagnostics additionally
record `maxPlaneResidual` before projection, `maxCellEmbeddingResidual` and
`maxSourceContactResidual` in source units, plus arrangement conservation and
integer-winding residuals. The existing cell origins/bases and intrinsic
coordinates reconstruct every emitted point independently. Overlapping source
cells retain separate sheets and IDs; area sums count overlap separately.
No global intersecting 4D solid, union volume or exact certificate is asserted.

## Verification

`tests/test_star_cell_contacts.py` derives a pentagram as its analytic central
pentagon (radius phi^-2) and five tip triangles, independent of the section
engine. Convex clipping, interval unions and lifted chord rectangles give each
cell's area and perimeter for `y+w=t`, `t=-1-0.0001,-1,-1+0.0001`; patch metrics
and every boundary edge/loop are checked against these expectations. Additional
tests cover reversible embeddings, source immutability, exact source contact
IDs, vertex-only events, empty/tangent/coplanar policies, global refusal,
resource refusal, warm JSON-lines recovery and all-rule native
promotion/Undo/Redo/project reopen/replay.

`tests/star-cell-contacts.test.mjs` runs all rules through the production Viewer
and promotion workflow. Its mounted Expert-off Chromium/Vite app uses real
Python workers, evaluates expressions, recovers from a coplanar refusal, promotes,
undoes/redoes and saves/reopens identical native geometry. Electron is not launched.

Worker verification: the seven-file native section sweep passed **121 tests +
3 subtests**; after final diagnostic/oracle changes the two independent-cell
files passed **39 tests** (16 new contact cases). The final Node selection
(`star-cell-contacts`, `independent-cell-section-controls`,
`density-section-controls`, `ordinary-cell-section-controls`, `section-viewer`,
`engine-op-allowlist`) passed **28/28**. `npx.cmd vite build --configLoader native`
passed; existing mixed-import/large-chunk and Node module-type warnings remain.

The additional existing `section-choices-mounted.test.mjs` sweep was not green:
its **Grand hexacosichoron** global-density case exceeded its 30-second wait
while showing “Computing section…” in two runs; the second run's other source
cases and refusal/recovery passed. That native case passed in the Python sweep.
The global-density implementation is unchanged; its mounted timing remains a
lead follow-up, not claimed fixed by this independent-cell contact tranche.
