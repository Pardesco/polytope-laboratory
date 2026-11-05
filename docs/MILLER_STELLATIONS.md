# Miller's 59 icosahedra (W9b / STEL-03)

Construct → Advanced constructions → **3D STELLATION / PLANE REGIONS**:

1. Start with a regular convex 3D icosahedron. Enter `10` in **Observation
   scale** (`stellation-scale`), leave **Facial planes** empty, and press
   **Evaluate facial-plane arrangement** (`stellation-evaluate`). Wait for it.
2. Select **Miller's rules (59 icosahedra)** in `stellation-criteria` and press
   **Enumerate qualifying unions** (`stellation-enumerate`). Other search
   constraints are disabled: Miller uses all 60 rotations and counts mirrors once.
3. **Next** / **Previous** (`stellation-next`, `stellation-previous`) select the
   solid in the derived viewport. `stellation-position` shows, for example,
   **7 of 59 — G**. The candidate dropdown (`stellation-candidate`) also shows
   the Du Val label, book index, reflexibility and selected cell count; use
   **Display selected candidate** (`stellation-use-candidate`) for direct jumps.
4. **Make base model** (`stellation-miller-base`) commits the displayed candidate
   through the existing `stellation-make-base` recipe. Ordinary model Undo/Redo,
   project snapshots and native replay retain the source and resulting solid.
   The existing interactive diagram's **Make base model** also works after
   building its diagram. Criteria, index and selected regions persist in
   `view.stellation`; source/domain changes require re-enumeration.

## Definition and implementation

The five rules are those in Coxeter, Du Val, Flather & Petrie, *The Fifty-Nine
Icosahedra*, third edition (Tarquin, 1999), pp. 15–16. They specify:

- (i) the twenty original face planes;
- (ii) identical face parts in every plane, explicitly permitting disconnected parts;
- (iii) trigonal symmetry, allowing either rotational or reflective symmetry;
- (iv) exterior accessibility of every boundary part, excluding buried cavities;
- (v) exclusion of separable equally symmetric solids, with the disjoint
  enantiomorphic-pair exception.

There is **no face-connectivity rule**. We follow the book's finite-solid
interpretation of (v): edge/vertex contact does not join symmetric shells.
This is connectivity of the cell-orbit quotient, not connectivity of every
individual cell. Thus the discrete `f2` and vertex-contact `g1` cases qualify.
The ambiguity of (v) and the resulting exclusion of some other stellations
are discussed in [Inchbald's original paper, reproduced by its author](https://steelpillow.com/polyhedra/icosa/searchlost/searchlost.html).

`engine/miller_stellations.py` obtains the actual full-facet graph and verified
proper/reflection cell actions through `stellation_diagrams.diagram_data`.
Source incidence, equal edges, all 20 planes, the 120-element source group,
473 enclosed bounded cells, orbit multiplicities, layer adjacency and the
reflection action must agree before enumeration.

| Shell power | Cell sets | Number of individual cells |
| --- | --- | --- |
| 0 | a | 1 |
| 1 | b | 20 |
| 2 | c | 30 |
| 3 | d | 60 |
| 4 | e1, e2 | 20, 60 |
| 5 | f1, f1', f2 | 60, 60, 12 |
| 6 | g1, g2 | 30, 60 |
| 7 | h | 60 |

The verified undirected layer graph has edges `a-b`, `b-c`, `c-d`,
`d-e1`, `d-e2`, `e1-f1`, `e1-f1'`, `e2-f1`, `e2-f1'`, `e2-f2`,
`f1-g1`, `f1'-g1`, `f1-g2`, `f1'-g2`, `f2-g2`, `g1-h`, `g2-h`.
Only `h` neighbors the unbounded exterior. All 4,095 nonempty orbit subsets
are considered. Unselected orbit nodes must all reach the exterior without
crossing selected nodes (iv). Selected quotient nodes must form one component,
or exactly two components interchanged by reflection (v). Reflection swaps only
`f1` and `f1'`. The 86 accepted handed selections reduce to 59 mirror classes:
**32 reflexible + 27 chiral**.

Acceptance is computed, not selected from a hardcoded list. An independent
59-code table is used for the third-edition Crennell ordering and as a fail-closed
crosscheck. Cell codes use bits `a,b,c,d,e1,e2,f1,f1',f2,g1,g2,h` in that order.
The author's [published enumeration printout](https://steelpillow.com/polyhedra/icosa/printouts.html)
provides an independent code crosscheck; its OCR label typos are not imported.
The [Wikipedia list requested in the brief](https://en.wikipedia.org/wiki/The_Fifty-Nine_Icosahedra#List_of_the_fifty-nine_icosahedra)
crosschecks the Crennell indices and names.

Capital letters abbreviate all cells through a complete shell. Verified examples:
`A = a`, `B = a+b`, **C = a+b+c (five octahedra)**,
**G = all cells except h (great icosahedron)**,
**H = all 473 cells (final stellation)**, and `De1 = a+b+c+d+e1`.
The UI uses `f1*` for both mirror sets (the book's bold f1), avoiding a dependence
on font weight; plain `f1` denotes one hand. Its hand is determined by signed-cell
lexicographic order in the supplied facial-plane order. No absolute right-handed
coordinate convention is claimed. Each result includes explicit `cellTypes`.

## Limits and verification

Geometry remains float64 approximate. The result exposes maximum symmetry vertex
residual and tolerance, and never claims an exact certificate or unrestricted
stellation completion. The finite combinatorial search is exhausted for the
stated book convention. Clipped cells, incomplete symmetry, unresolved facets,
partial plane sets and unsupported seeds refuse with a clear error; scale 10 is
sufficient for the standard fixture, not a universal box guarantee for every pose.
The solid boundary is the existing exposed convex-region union, with internal
interfaces canceled. It does not reconstruct intersecting internal triangular
faces of the traditional star/compound presentation.

Native read-only op: `stellation-miller-enumerate` with `{arrangement}` and its
source model; enabled in desktop dispatch and warm-worker reuse. Construction
reuses the existing replayable op with compact signed-cell signatures, bounds
and face IDs. Source/notes/units/domain/selection/criteria and cancellation are
checked at publication. No dependencies, version bump or ledger edits.

Tests: `tests/test_miller_stellations.py` checks the entire independent cell-code
list, 59/32/27/86 counts, named sets, rule counterexamples, mirror exception,
native accessibility/actions, deterministic order, unsupported/clipped/stale
sources and saved/replayed base geometry. `tests/miller-stellation-controls.test.mjs`
mounts the selector and actions against native icosahedron results, steps all 59
entries in both directions, restores saved index/state, and tests adoption,
source/selection/domain/criterion/cancel/export publication fences and IPC wiring.
Electron launch/click-through is reserved for the lead; this sandbox does not
launch Electron.
