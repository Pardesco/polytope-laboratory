# Arbitrary planes and facial-editor subgroups (R6-STELLATION)

Chosen R5 scenarios: **`stel-01-arbitrary-planes`** and
**`stel-04-editor-subgroups`**. The literal subgroup fixture also strengthens
`stel-04-group-scope`; promotion exercises `stel-05-promotion-history`.
These are native/UI conformance receipts, not an executed Stella 6.0 comparison.

## UI

In **Construct → Stars & facets → Stellate**, open **Stellation plane regions**
(`stellation-plane-settings`), then **Arbitrary planes and observation bounds**
(`stellation-arbitrary-settings`). No Expert mode is needed.

- `stellation-arbitrary-planes`: one `nx, ny, nz, offset` row per plane,
  defining `n·x + offset = 0`; numeric expressions use `NumericEntry`.
- `stellation-bounds-min`, `stellation-bounds-max`: explicit XYZ observation box
  in reference-model coordinates. Every maximum must exceed its minimum.
- `stellation-region-limit`: integer 1–2048; budget exhaustion refuses an
  incomplete result. `stellation-evaluate-arbitrary` evaluates the list.
- `stellation-evaluate` returns to the original facial-plane workflow.

Inputs accept 1–32 rows, at most 16,384 plane-text characters, with the shared
512-character per-expression limit. Normals must be nonzero. A convex 3D
reference model supplies document ownership and source symmetries; its hull
does not replace the entered planes. The source fingerprint and original
numeric coefficients travel with the arrangement. Entered plane/bounds text
and evaluated values persist in `view.stellation`, including save/reopen.
The initial arbitrary-plane view is the diagram, so unbounded cells are visible.
Original-seed selection/inclusion is unavailable for arbitrary lists: an all-+1
signature need not describe the reference model. Here +1 denotes `n·x+d ≤ 0`;
the outside-plane count becomes a count of positive plane sides.

In **Interactive stellation diagrams** (`stellation-cell-settings`), build
diagrams, then open **Custom subgroup generators**
(`stellation-face-subgroup-settings`). `stellation-face-action` lists verified
source action IDs and matrices about the source vertex mean. Enter distinct IDs
in `stellation-face-generators` (or `identity`), then click
**Build generator subgroup** (`stellation-face-subgroup`).
`stellation-face-symmetry` now offers **Custom generator subgroup**. Diagram
clicks toggle complete subgroup orbits; existing selection undo/redo persists.
Generator IDs are source-specific; `diagramGeneratorIds` and `diagramSymmetry`
persist with that source. Analysis is invalidated when their owner/domain changes.

`stellation-face-base` promotes selected enclosed cells using the existing
`stellation-make-base` recipe/commit workflow. Arbitrary-plane promotion records
the numeric plane rows, observation bounds and signed cell signatures, so geometry
undo/redo, project reopen and recipe replay reconstruct the same union.

## Independent semantic case

Use the regular octahedron with intercepts ±1, all eight facial planes and box
scale 3. Its nine bounded cells are the octahedron (R58) and eight tetrahedra
centered at `(±1/2, ±1/2, ±1/2)`, ordered lexicographically as
R19, R30, R39, R44, R51, R54, R56, R57. Source action **8** is independently
checked against `diag(-1,1,1)`, the reflection `x → -x`.

Its order-two subgroup has literal orbits:

```
{19,51}, {30,54}, {39,56}, {44,57}, {58}
```

The test compares the entire region permutation, its square against identity,
and all 16 seed-included invariant unions against independent pair-subset sets.
R19 + R51 has volume 2/3. Above diagram plane 0, clicking R19 from the original
seed selection must select **[19,51,58]**; undo restores **[58]**.
Full/proper source groups still give shell orbit size 8; identity gives nine
singletons. A box that fails to preserve every requested subgroup action is
refused rather than silently reducing the requested group.

## Numerical scope and limits

The summary reports absolute partition-volume residual. Diagram analysis reports
maximum vertex residual/tolerance and full-domain versus subgroup orders.
Clipping and LP boundedness remain float64 numerical predicates. Completion
means full-dimensional regions intersecting the recorded finite box; neither
unrestricted stellations nor exact algebraic symmetry is certified. Only enclosed,
unclipped regions can become ordinary solids. Diagrams require at least one such
cell; a plane missing the box displays an explicit empty-diagram message.

No new engine operation, IPC entry, dependency or Miller-59 implementation was
introduced. Arbitrary 4D/generalized references remain unsupported. Broader
benchmark criteria/inaccessible-cell equivalence, large-family qualification and
packaged Electron checks remain follow-ups. Electron was not launched.

## Verification

- `python -B -m pytest tests/test_stellation.py tests/test_stellation_cells.py tests/test_stellation_diagrams.py tests/test_stellation_plane_input.py tests/test_miller_stellations.py -q -p no:cacheprovider`: **58 passed**.
- New `tests/test_stellation_plane_input.py`: **8 tests**, including literal
  subgroup/orbit oracles, arbitrary-plane source binding, budget refusal and
  project validation/replay.
- Node regression selection: `tests/stellation-cell-controls.test.mjs`,
  `tests/stellation-diagram-controls.test.mjs`, `tests/numeric-analysis-controls.test.mjs`,
  `tests/miller-stellation-controls.test.mjs`, `tests/engine-op-allowlist.test.cjs`:
  **43 passed**.
- New `tests/stellation-plane-input.test.mjs` is registered in `test:features`.
  **7 passed** (including two mounted subtests). It covers malformed input,
  pending edit ownership/cancellation, saved selection
  history, and real mounted browser/native workflows with Expert off.
- `npx.cmd vite build --configLoader native`: passed (existing chunk-size and
  mixed viewer import warnings).
