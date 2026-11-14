# Hyperbolic space: Round 11 design

Design only, 12 November 2026. Curvature is fixed at −1. Decisions below describe proposed implementation, not shipped capabilities or mathematical certification.

## 1. Release boundary

Ship four compact regular honeycombs and all 15 nonempty binary Wythoff ringings of each diagram. These are 60 diagram configurations, **not 60 distinct honeycombs**: diagram reversal and additional symmetries identify duplicates. Ring weights are equal; snubs, arbitrary weights, nonconvex forms and unrestricted diagrams are excluded. Every configuration must pass the local uniformity checks before release; do not silently substitute a regular skeleton.

| Regular preset | Cell                 | Spherical vertex figure | Cell dihedral angle |
| -------------- | -------------------- | ----------------------- | ------------------- |
| `{5,3,4}`      | Dodecahedron `{5,3}` | Octahedron `{3,4}`      | π/2                 |
| `{4,3,5}`      | Cube `{4,3}`         | Icosahedron `{3,5}`     | 2π/5                |
| `{5,3,5}`      | Dodecahedron `{5,3}` | Icosahedron `{3,5}`     | 2π/5                |
| `{3,5,3}`      | Icosahedron `{3,5}`  | Dodecahedron `{5,3}`    | 2π/3                |

These angles are 2π/r, distinct from simplex mirror angles π/p, π/q, π/r. Regular presets use rings `1000`, nodes ordered along `[p,q,r]`.

Ship one closed manifold: the existing eight-dodecahedron orientable small cover. Freeze its explicit characteristic map and face numbering. The prototype's index eight refers to the **12-face right-angled dodecahedral reflection group**, not simplex `[5,3,4]`. Small covers follow [Davis–Januszkiewicz, §1](https://people.math.osu.edu/davis.12/old_papers/DJ_toric.dmj.pdf).

Defer Seifert–Weber to a subsequent package. It is feasible using one `{5,3,5}` dodecahedron: opposite faces have a 3/10-turn identification, with orientation conventions requiring explicit vertex permutations ([Lin–Lipnowski](https://academic.oup.com/imrn/article/2022/9/6540/6027896)). Acceptance requires inverse pairings, five-cell edge cycles, spherical vertex links, orientation, and a triangulation corresponding to the pairings whose integral H1 matches `(Z/5)^3` ([SnapPy census](https://snappy.computop.org/platonic_census.html)). Matching H1 alone does not identify a manifold. Other `{5,3,4}`/`{5,3,5}` quotients need equivalent certificates; no quotient search ships.

Later: paracompact `{6,3,3}`, `{6,3,4}`, `{6,3,5}` with infinite cells, then ideal vertices/cusps. Exclude hyperideal truncations, arbitrary manifold imports, hyperbolic sections/nets, geometry export, spectra and closed-geodesic search. Screenshots and native projects are supported.

## 2. Native geometry and development

Create `engine/hyperbolic.py`: port only NumPy/math geometry from `hyperbolic_honeycombs/honeycomb_engine.py`; no `bpy`, `mathutils` or art-project imports. Standardize **time-first** `X=(t,x,y,z)`, `J=diag(-1,1,1,1)`, `XᵀJX=-1`, `t>0`. The older generic engine is time-last; explicitly permute its port. Coordinates/matrices are float64 approximations. Store integer Coxeter matrix and symbolic Gram entries `-cos(pi/m)` alongside numerical Gram values; these exact definitions do not make coordinates exact.

Normals satisfy `N J Nᵀ=G`; reflection `R=I-2n(nᵀJ)`. Require Gram signature `(3+,1−)` and positive-definite proper principal submatrices. Solve signed mirror distances proportional to the ring mask, then normalize the timelike seed. Generate finite parabolic face/cell templates and incidence from Wythoff stabilizers, **not a convex hull of the truncated infinite orbit**.

`engine/hyperbolic_orbit.py` enumerates connected cell adjacency with deterministic BFS, carrying transforms, generator words and template permutations. A rounded coordinate is only a bucket: compare candidates in a common local Lorentz frame, including template type and full vertex correspondence. Different word matrices can represent the same cell with different stabilizer permutations. Never discard that permutation. Preserve first-discovery IDs within a generation epoch; selections do not survive rebase unless explicitly remapped.

Default center radius 3, maximum 5 hyperbolic units; cell-depth default 3, maximum 12. Stop at the first of 4,096 cells, 50,000 visited candidates, 256 MiB estimated working storage or two seconds per page. Radius culling must not prune traversal paths and claim complete balls: complete-depth mode expands unculled BFS layers; interactive radius mode reports a sampled patch. Publish complete entities only, frontier counts, completed layers and stop reason. An unfinished page is resumable; a failed residual check publishes nothing.

Report maximum absolute `|XᵀJX+1|`, `|NJNᵀ-G|`, `|RᵀJR-J|`, `|R²-I|`, Coxeter relation residuals, transform metric error, merge discrepancy and edge-length relative spread. Initial gates: `1e-12` for generators, `1e-8` for developed coordinates/transforms, `1e-7` for edge spread; record actual bounds and scales. Rebuild from words in a nearby frame when needed; never relax thresholds automatically.

`engine/hyperbolic_manifold.py` stores a fundamental domain with eight cells, local vertices/faces, and pairings `{cell,face,toCell,toFace,vertexPermutation,isometry}`. Pin characteristic vectors from `small_cover_quotient.py` in `engine/hyperbolic_data/small-cover-v1.json`; do not rerun a coloring search on load. States `g` lie in `(Z/2)^3`; crossing face f changes state to `g xor lambda[f]`. Choose spanning-tree representatives `T_g`; boundary deck maps are `T_g S_f T_h^-1`, `h=g xor lambda[f]`. Develop neighboring lifts around the observer, not eight disconnected render copies. Local chart handedness alternates; deck maps preserve orientation. Quotient labels survive rebasing. The prototype's adjacency spectrum is not a smooth Laplace spectrum.

## 3. Document and JSON-lines contract

Add a document kind, not a Euclidean four-coordinate model. Existing `Viewer.setModel`, `projection.js`, validation and intrinsic measures assume Euclidean geometry. Retain `states[].model`/`view`, with homogeneous document kind and this model shape:

```json
{
  "kind": "hyperbolic-space",
  "dimension": 3,
  "coordinateDimension": 4,
  "name": "Dodecahedral honeycomb {5,3,4}",
  "source": { "type": "honeycomb", "pqr": [5,3,4], "rings": [1,0,0,0] },
  "curvature": -1,
  "algorithmVersion": "1",
  "anchorPatch": {},
  "provenance": {}
}
```

Manifold source is `{type:"manifold",key:"small-cover-v1",dataHash:...}`. Save recipe, pinned domain, bounded anchor geometry, observer local frame/address and analysis receipt. Tiles are disposable. Add kind adapters in `engine/hyperbolic_document.py` and `ui/hyperbolic-document.mjs`; branch before Euclidean validation, history fingerprints, replay, rendering and capability checks. Extend `engine/formats.py`, `engine/history.py` and display validation additively. Project schema v2 permits mixed document kinds; load v1 unchanged, save polytope-only projects as v1. Older builds reject v2 explicitly. Preserve atomic storage/recovery and existing limits.

New allowlisted ops: `hyperbolic-create` returns the descriptor plus anchor; `hyperbolic-patch` returns one page; `hyperbolic-analyze` returns local/quotient evidence; `hyperbolic-validate` checks descriptors and retained geometry. All accept full source parameters; the last three reuse warm workers. Creation and source/ring edits use `commitOperation`/history replay; exploration updates view, calls `markDirty()` at gesture end, and adds no history node per frame. Opening a library item uses the existing guarded new-document workflow.

Patch request: `{source,epoch,anchor:{word,observerMatrix},radius,depth,budget,cursor}`. Response: `{sourceHash,epoch,anchorHash,templates,instances,neighbors,coverage,residuals,nextCursor}`. Templates contain hyperboloid vertices, indexed edges, ordered face cycles and face planes. Instances contain `{id,type,word,matrix,quotientState}`; matrices are row-major 16-number arrays mapping template to anchor frame. Neighbor rows include source/target face IDs and permutations; unexpanded neighbors are explicit. IDs are epoch-local. Shared edges are welded only after geometric matching.

One normal response per JSON line: **no unsolicited streaming**, which the pool rejects. Limit requests/responses to 4 MiB UTF-8 each; pages contain ≤256 instances, including templates/checkpoint in the byte budget. Cursor is a self-contained JSON BFS checkpoint: accepted cell words/types, frontier, next expansion index and cumulative counters, bound to source/anchor/budget hashes. Cap checkpoint at 1 MiB and relative words at 256 generators; report nonresumable truncation if exceeded. Another worker reconstructs transforms from words; no affinity or essential cache handles. Checkpoints are untrusted: recheck incidence/identity and coverage claims. Use a 64 MiB LRU per worker keyed by source/algorithm/anchor/budget and a 64 MiB renderer cache. Never deserialize executable objects. Restart/cancel loses only caches. Reject nonfinite matrices and oversized arrays before allocation. Match document revision, source and epoch before publication; cancel superseded jobs. Anchor snapshots stay under 1 MiB/state and existing 128 MiB/project limits.

## 4. Viewer and navigation

Implement `ui/hyperbolic-viewer.mjs`, `hyperbolic-math.mjs`, `hyperbolic-worker.mjs`. Dispatch by kind in workspace rendering, using the existing three.js version and canvas lifecycle. Keep `viewer.js` and 4D projection mathematics untouched. Hyperbolic controls replace 4D rotations; existing Euclidean tools show a concise domain explanation.

Provide Poincaré ball `x/(t+1)` and Klein `x/t`. Defer upper half-space: conversion is cheap, clipping/picking near infinity is not. Overview uses ordinary orbit controls on the displayed ball. Explore uses observer `C∈SO⁺(3,1)` mapping camera frame to current anchor frame; draw `C^-1 X`, fixing the three.js camera at the origin. Movement composes boosts, looking composes spatial rotations. Perspective rays from the recentered origin are hyperbolic geodesics; Euclidean camera translation is not navigation. Pointer capture requires an explicit action; Escape exits, and keyboard-only movement works.

Re-orthonormalize the Lorentz frame by timelike-first Lorentz Gram–Schmidt every 128 steps or metric residual above `1e-10`; reject nonfuture/nonproper frames. Rebase after displacement 1 from the anchor using a nearby cell word; transport both observer and geometry consistently, retaining quotient address and orientation. Manifolds save quotient-cell/local-pose coordinates; honeycombs save chunked anchor words (64 KiB/address cap, explicit navigation limit). No growing global float64 position is authoritative.

Sample edges by hyperboloid sinh interpolation, adaptively projected to ≤1 px deviation. Klein edges are straight. Project in JS float64, then upload local float32 buffers. Limit 50,000 unique visible edges and 200,000 segments; report quality caps. Use wireframe by default; defer filled curved faces. Optional thin Poincaré tubes use the first-order conformal radius `rho*(1-|p|²)/2`, labelled a rendering approximation. LOD affects display only. Picking returns cell/edge identity, not Euclidean measurements.

## 5. First thirty seconds and Analysis

Library collection **Hyperbolic space** (`hyperbolic-library`) shows four presets and **Dodecahedral small cover — Closed space with eight cells**. First click opens a cell-centered Poincaré overview. Highlight one cell and explain: “Cells have equal hyperbolic size; this view makes distant cells look smaller.” Sticky **Explore inside** (`hyperbolic-explore`) starts slow movement with visible WASD/arrows guidance. **Return to center** (`hyperbolic-home`) is always reachable. The small cover colors eight quotient states and explains why repeated cells depict one closed space.

Main controls: **Poincaré ball / Klein model** (`hyperbolic-model`), **Visible radius** (`hyperbolic-radius`, NumericEntry), **Cell layers** (`hyperbolic-layers`), **Pause generation** (`hyperbolic-pause`). Always show “Finite patch; generation paused/limited” when applicable. Put budgets/residuals under collapsed **Hyperbolic diagnostics**, registered in `NEW_GROUP_GUIDE_TOPICS`.

Extend Build from symmetry with an **H³ honeycombs** section through `ui/hyperbolic-builder.mjs`; retain existing spherical keys/IDs. Four-node diagrams are labelled `[5,3,4] — Dodecahedral honeycomb symmetry`, not “4D”. Reuse accessible ring targets, preview ownership and sticky opening action. Show ring mask plus cell-type summary; avoid unsupported conventional uniform names. Preview explicitly says “Finite patch of an infinite honeycomb.”

Analysis reports cell/vertex-figure types, r cells/edge, hyperbolic lengths/angles, visible counts versus complete layers, and verification status. Uniform variants show their actual multiple cell orbits and local vertex link, not the regular preset's figure. Infinite honeycomb Euler characteristic/total volume are “not reported”; patch boundary counts are separate. Small cover reports independently reconstructed `(V,E,F,C)=(20,60,48,8)`, χ=0 and orientability. Volume is `8*Vol(D) ≈34.45`, using published `Vol(D)≈4.3062` ([Vesnin, Table 1](https://math.nsc.ru/~vesnin/papers/modena.pdf)); this is a coarse reference, not a certified decimal. Do not invent H1 for this particular coloring. Show it only after integer-chain computation and independent triangulation agreement.

## 6. Verification and release gates

Independent uncropped face-adjacency ring counts, n=0…3:

| Honeycomb | Expected counts  |
| --------- | ---------------- |
| `{5,3,4}` | 1, 12, 102, 812  |
| `{4,3,5}` | 1, 6, 30, 126    |
| `{5,3,5}` | 1, 12, 132, 1392 |
| `{3,5,3}` | 1, 20, 260, 3212 |

Source: [Celińska-Kopczyńska–Kopczyński, Table 2](https://arxiv.org/pdf/2208.13816). Pin extracts/hashes. For `{5,3,4}`, independently expand `(1+t)^3/(1-9t+9t²-t³)`. For the others, retain published tree transition data and compare coefficients of `u(I-tA)^-1v`; do not fit recurrences to generated counts. Distinguish these rings from simplex word-length growth. Missing independent data blocks that claim, not a fabricated formula.

For each regular preset check Gram angles, measured cell dihedrals, spherical tangent-link incidence, r sectors around an interior edge, and p-fold face-axis rotations. Cross-check `{5,3,4}` against independent sphere inversions; pin normals `(0,±phi,±1)` cyclic for the prototype vertex convention, **not** swapped coordinates. All 60 masks need equal hyperbolic edges, regular polygon faces, closed local incidence and vertex transitivity evidence from stabilizers.

Small cover: exact GF(2) rank three at every vertex proves torsion-free kernel because finite stabilizers are conjugate into vertex stabilizers; odd-parity characteristic vectors prove orientability. Check surjectivity, pairing inverses/permutations, edge holonomy, spherical links, connectivity, chain `d²=0`, integral H1 via integer Smith reduction, and volume against eight domains. Reconstruct quotient incidence by face identifications; the prototype's count formula is only an expectation. Independent triangulation receipts must identify the same gluing. Optional development-only [SnapPy/Sage interval verification](https://snappy.computop.org/verify.html) adds evidence; no runtime dependency or certification claim without success.

Add pytest `test_hyperbolic_{metric,orbit,manifold,document,verification}.py`; Node `hyperbolic-{math,protocol,history,viewer}.test.mjs`; mounted `hyperbolic-mounted.test.mjs` covering every preset, ring toggles, movement, model switching, quotient crossings, save/reopen, undo/redo, cancellation/stale pages and Euclidean-tab isolation. Test corrupted pairings, cursor eviction and every resource cap. Register Node files in `test:features`. Run focused suites and Vite; lead runs packaged desktop smoke and measures ≤3 s first patch, ≥30 fps navigation at 1080p/default budget on recorded hardware. Targets are unmeasured. Retain failures/omissions and hashes as in `VERIFICATION_REPORT.md`.

## 7. Parallel work allocation

Freeze the contract above before coding. Estimates are engineering hours including tests, not promises.

| Package                  | Owned files                                                                                                    | Dependencies; exit criterion                                                    | Hours |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| A: Metric/Wythoff        | `engine/hyperbolic.py`; metric tests                                                                           | None; all 60 local templates validated                                          | 16–24 |
| B: Bounded development   | `engine/hyperbolic_orbit.py`, `hyperbolic_protocol.py`; orbit/protocol tests                                   | A; paged deterministic BFS, caps/cancel/replay and four ring fixtures pass      | 32–48 |
| C: Quotient              | `engine/hyperbolic_manifold.py`, `hyperbolic_data/`; manifold tests                                            | A; pinned eight-cell pairings, kernel/link/H1 evidence and continuous crossings | 20–32 |
| D: Viewer                | Three viewer/math/worker files above; viewer/math tests                                                        | A/B contract; two models, geodesics, navigation/rebase and disposal pass        | 32–48 |
| E: Documents/integration | Two document adapters; document/history tests; all shared integration edits                                    | A/B/C contracts; mixed save/recovery/replay and kind isolation pass             | 24–36 |
| F: UX/independent review | `ui/hyperbolic-{controls,builder}.mjs`, scoped CSS; mounted/verification tests; `scripts/verify-hyperbolic.py` | A–E; clickable novice flow, independent fixtures and evidence report            | 24–36 |

E alone edits shared app/panels/catalog/builder hooks, engine dispatch/history/formats/display validation, desktop allowlist/pool, inspector/help maps and package.json; other workers supply small integration blocks. No global token changes; scope buttons with `:not(.group-help)`. F owns help prose and verification fixtures. Total 148–224 hours plus 8–12 lead integration/desktop hours. Do not merge a skeleton-only uniform builder under a uniform label.

## 8. Decisions for Randall

Approve schema v2's older-build incompatibility and the proposed wireframe-first presentation. Decide whether all ringings are essential to the Round 11 date: if time is fixed, explicitly release four regular presets plus the small cover and defer the uniform builder as a whole. Numerical deduplication and exponential growth are the main technical risks; larger radius is not the remedy. Long-distance exploration must rebase reliably before density increases. Seifert–Weber remains deferred regardless of how attractive an unverified preview looks.

Design audit: inspected architecture, verification report, spherical builder/Wythoff, project/history/pool and viewer paths, specified art prototypes/tests, and the Round 10 UX review. Read-only probes passed 66 cases: four metric/signature checks, 60 timelike ring seeds/equal generator-edge lengths, one prototype small-cover rank/count report, one growth-series expansion. These do not validate full uniform incidence, a future port, quotient gluing or navigation. No product code changed.

## 9. Decisions recorded (Randall, 12 November 2026)

- Round 11 ships the four regular presets, the eight-dodecahedron small cover and navigation. The uniform (ringed) hyperbolic builder is deferred as a whole to a later round; package F drops the H³ builder section and A validates only the four regular templates (the other 56 masks stay out of the UI).
- Project schema v2 is approved: mixed-kind projects save as v2 and older builds refuse them explicitly; polytope-only projects still save as v1.
- Lead decision 13 Nov 2026: developed-geometry gates are t²-relative (1e-12) because absolute hyperboloid residuals scale like t²·eps; absolute values remain reported.
- Lead decision 13 Nov 2026 (after the independent review): a hyperbolic patch is every cell meeting the ball of radius R around the observer (complete coverage), not a BFS depth filtered by centre distance. Radius is therefore clamped to 2 for all five documents (larger complete balls exceed the 4,096-cell cap); complete-depth is clamped to 5 for {4,3,5} and 3 otherwise. Explore always projects with Klein.
