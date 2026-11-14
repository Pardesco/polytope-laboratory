# Eight-dodecahedron small cover

Package C supplies the native geometry, gluing, analysis and local development for
`{type:"manifold", key:"small-cover-v1", dataHash:...}`. Shared dispatch, documents
and UI are deliberately left to package E. No runtime prototype imports, coloring
searches, new dependencies or network access are used.

The space is the kernel of the characteristic map from the **12-face right-angled
dodecahedral reflection group** onto `(Z/2)^3`, not an index-eight subgroup of the
simplex reflection group `[5,3,4]`. It is closed, compact and orientable. Repeated
developed cells show neighbouring lifts of this one closed space.

## Pinned definition

`engine/hyperbolic_data/small-cover-v1.json` pins the prototype's 20 Poincaré ball
vertices, 30 edges, 12 ordered face cycles, face directions, colors and
characteristic vectors. Its prototype file hashes record provenance; the prototype
files are never executed or imported. Face directions follow `(0,±phi,±1)` cyclic,
in the original face order, not the swapped coordinate convention.

Face colors, indexed `0..11`, are `[0,1,2,3,2,3,0,1,1,2,0,3]`. Colors map to
`(1,0,0), (0,1,0), (0,0,1), (1,1,1)` respectively. Bit 0 is the first vector
coordinate. Crossing face `f` sends integer state `g` to `g xor lambdaBits[f]`.

Data hash:

```text
57b82cec92da2cc42de290f390fb24d8da5acfb6dfa52946daadff1f49fada93
```

The hash is SHA-256 of UTF-8 Python
`json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)`
with the `dataHash` member omitted. Whitespace formatting is irrelevant. The
loader checks both the stored hash and the module's pinned constant.

## Computation and receipt

All geometry uses float64, time-first `(t,x,y,z)`, metric `diag(-1,1,1,1)` and
curvature `-1`. Coordinates are approximations. Incidence and integer-chain
computations use integers.

`fundamental_domain()` returns a shared local template, eight chart records and
96 directed pairings. Each pairing has `cell`, `face`, `toCell`, `toFace`,
`vertexPermutation`, `isometry`, and `localIsometry`. A permutation maps positions
in the source face cycle to positions in the target face cycle. Here each local
face is fixed pointwise, so these permutations are identities.

Deterministic BFS chooses representatives `T_g`. Pairing `isometry` is the deck
map `T_g S_f T_h^-1`, mapping the target representative into the neighbour across
the source face. `localIsometry` is `S_f`, the orientation-reversing local chart
transition. The representatives/charts have handedness `(-1)^popcount(g)`; deck
maps preserve orientation.

`analyze(domain=None)` reconstructs equivalence classes of local vertices, edges
and faces from the pairings. It builds signed cellular boundaries and separately
assembles a barycentric triangulation by gluing local flags directly through face
permutations. The triangulation does not reuse the cellular quotient labels or
boundary matrices. Both use integer Smith reduction after a graph spanning-tree
collapse; sparse unit cancellations precede Euclidean reduction with divisibility
repair. The receipt includes gluing/tetrahedra hashes for the second construction.
Invalid pairings or changed pinned data raise `GeometryError` before publication.

Measured receipt on 13 November 2026:

| Check | Computed result |
| --- | --- |
| Rank at each of 20 vertices | 3 over GF(2) |
| Characteristic map | Rank 3, surjective; all vectors have odd parity |
| Torsion-free kernel | Pass: vertex stabilizers inject under lambda |
| Quotient incidence `(V,E,F,C)` | `(20,60,48,8)` from face identifications |
| Euler characteristic / connectivity / orientability | `0` / connected / orientable |
| 60 edge cycles | Four distinct states each, return to start, angle sum `2*pi` |
| 20 vertex links | Connected closed triangulated surfaces, `(6,12,8)`, Euler 2; every vertex star is a cycle |
| Cellular `d1*d2`, `d2*d3` | Both zero over the integers |
| Cellular H1 | `(Z/2)^9`, free rank 0; Smith diagonal `1^32,2^9` |
| Independent triangulation | `(136,1096,1920,960)` simplices; every triangle has two tetrahedra; `d*d=0` |
| Triangulation H1 | `(Z/2)^9`, free rank 0; agrees with cellular construction |
| H1 receipt status | Verified by agreement of these two constructions; no external interval certification |
| Generator metric / involution residual | `2.665e-15` / `2.665e-15` |
| Vertex hyperboloid / unit face-normal residual | `4.441e-16` / `4.441e-16` |
| Local face permutation residual | `1.665e-15` |
| Deck metric / inverse residual | `6.366e-12` / `5.002e-12` |
| Edge holonomy / angle-sum residual | `8.882e-15` / `8.882e-16` |
| Hyperbolic edge-length relative spread | `0` at this float64 evaluation |
| Volume | `8*Vol(D) ≈ 34.4496`, coarse published reference only |

Generator gates remain `1e-12`, developed/deck gates `1e-8`, and edge relative
spread `1e-7`. They are never relaxed. The volume uses `Vol(D)≈4.3062` from Vesnin,
Table 1, as supplied in the design contract, not a numerical integration or
certified decimal. No spectrum or manifold-classification claim is made.

## Local navigation and bounded development

`cross_face(quotient_state, local_pose, face)` returns
`{quotientState,localPose,face}`, with `localPose = S_f @ oldPose`. The caller detects
the crossing with the template's face planes. Poses are row-major 16-number arrays
mapping camera coordinates to the current local chart. They must be future
Lorentz frames with the chart's handedness. An omitted pose uses the centered
chart frame. After a crossing the determinant changes sign; do not force every
local pose into `SO+(3,1)`. `T_g @ localPose` is proper and future. Save state and
local pose rather than an ever-growing global word. Renormalization belongs to
the navigation layer and must preserve local handedness.

```python
from engine.hyperbolic_manifold import analyze, fundamental_domain, develop_patch, cross_face

domain = fundamental_domain()
receipt = analyze(domain)
patch = develop_patch(quotient_state=0, local_pose=None, depth=3, radius=3)
crossed = cross_face(0, None, 0)
next_patch = develop_patch(crossed['quotientState'], crossed['localPose'])
```

`develop_patch` does connected face-adjacency BFS, merges only after comparing
the full vertex correspondence in a common local Lorentz frame, and retains the
template and face permutations on neighbour records. Every instance includes
`quotientState`, relative face `word`, stable first-discovery `id` within the
request epoch, `type` and row-major `matrix`.

The returned anchor is **observer-centered**: instance matrices are
`inverse(localPose) @ S_word`. The response includes
`anchor:{quotientState,localPose,frame:"observer-centered",observerMatrix:I}`.
Render with this returned observer matrix; applying the saved local pose a second
time would move the camera twice. This choice allows proper camera identity even
in odd-handed local charts. Across a face crossing, the common developed cells
retain the same observer-frame matrices and quotient labels; epoch-local IDs may
change.

Radius marks instances with `visible` and never prunes traversal. The root remains
visible. Defaults are radius 3, depth 3; maximums are radius 5, depth 12, 256
instances and two seconds. One complete depth-two patch has ring counts
`1,12,102` (115 instances). At the default depth-three request the page cap stops
partway through layer three, and only two completed layers are reported. Each
accepted cell has twelve neighbour rows; unknown neighbours use `toCell:null` and
`unexpanded:true`. `frontierCount` counts these unresolved **face incidences**.

This helper produces one bounded page, not resumable BFS checkpoints. It returns
`nextCursor:null`, `resumable:false`, and explicit nonresumable truncation on a cap.
It does not claim a complete radius ball. Full cursor/LRU/resource-protocol
integration remains package E's work; do not turn a capped receipt into a
completion claim. The 256-cell cap also bounds candidates below 50,000 and words
below 256 generators. Tests check the maximum-page JSON stays below 4 MiB.

## Integration notes

Package E must add the following shared hooks; none are installed by this package:

1. **Create/source validation:** recognize source
   `{type:"manifold",key:"small-cover-v1",dataHash:DATA_HASH}`. Use
   `validate_source(source)` to reject unsupported keys/hash changes and normalize
   an omitted hash. Use `fundamental_domain()` as the pinned domain for the new
   hyperbolic document, with the template reused across its eight cells. Persist
   source, pinned domain, analysis receipt, quotient state and local pose under
   approved schema v2. Validate saved domains with `analyze(domain)`.
2. **`hyperbolic-analyze`:** for `params.source.type === "manifold"`, validate
   `params.source` and return `analyze()` (or `analyze(savedDomain)` when validating
   retained domain data). The result is the JSON receipt described above, with
   `pass`, `counts`, `H1`, `triangulation`, residuals and gates. Keep the operation
   warm-worker reusable.
3. **`hyperbolic-patch`:** accept
   `{source,epoch,anchor:{quotientState,localPose},radius,depth,budget:{maxInstances},cursor:null}`.
   Call `develop_patch(anchor.quotientState,anchor.localPose,depth=depth,radius=radius,
   max_instances=budget.maxInstances,epoch=epoch,source=source)`; omit arguments to
   use defaults. Response has the design's `sourceHash,epoch,anchorHash,templates,
   instances,neighbors,coverage,residuals,nextCursor` plus the explicit anchor
   frame above. `templates[0].id` matches instance `type`. Use the returned hashes
   when matching pages. Reject non-null cursors until the shared resumable
   protocol is added. Keep the operation warm-worker reusable. There is no new
   crossing engine op: the viewer can transport `S_f @ pose` from pinned planes,
   or E can route crossing through a validated adapter.
4. **Viewer/navigation:** use `cross_face` as the reference transition, apply all
   crossings before requesting the next patch, and preserve state/local pose when
   rebasing. Account for the observer-centered response as described above. Color
   by `quotientState`; selection IDs are epoch-local. Continue to enforce shared
   request size, response size, cancellation, stale-page and cursor checks.
5. **UI:** mount **Dodecahedral small cover — Closed space with eight cells** under
   **Hyperbolic space** (`hyperbolic-library`). The common controls are
   **Explore inside** (`hyperbolic-explore`), **Return to center** (`hyperbolic-home`),
   **Poincaré ball / Klein model** (`hyperbolic-model`), **Visible radius**
   (`hyperbolic-radius`), **Cell layers** (`hyperbolic-layers`), and
   **Pause generation** (`hyperbolic-pause`). Analysis should display reconstructed
   counts, χ, orientability, the H1 verification qualifier and coarse volume
   status. Put numerical receipts under collapsed **Hyperbolic diagnostics**.
   Show **Finite patch; generation limited** for capped development.
6. **Packaging:** include `engine/hyperbolic_data` in the engine bundle's data
   files. Private Lorentz helpers marked `DEDUPE` may be replaced by the merged
   `engine/hyperbolic.py` API without changing this prototype face numbering.

## Verification

`python -m pytest tests/test_hyperbolic_manifold.py -q -p no:cacheprovider`:
**72 passed**. Includes integer Smith divisibility/rank cases and unimodular
changes, all eight chart crossings, continuity/round trips, pinned-data tampering,
wrong bijective permutations, noninverse pairings, changed lambda/deck/local maps,
bad chart data, input limits, page/time caps and independent-triangulation
agreement requirements.

`ruff check engine/hyperbolic_manifold.py tests/test_hyperbolic_manifold.py` and
`ruff format --check` on those files: pass.
`npx.cmd vite build --configLoader native`: pass (400 modules; existing chunk-size
and mixed static/dynamic import warnings). No Node files or shared integration files are changed;
there is no new Node test registration. Desktop smoke and mounted UI verification
remain for the lead after integration.
