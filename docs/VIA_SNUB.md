# Via-snub: first production domain (R6-SNUB)

The ordinary Library **Cube** can now preview a cube → snub family → reciprocal
octahedron morph. This implements the source-bound production integration of
[the R5 contract](SNUB_MORPH_CONTRACT.md); that document's “unregistered” status
describes the historical R5 baseline. It does not establish Stella trajectory
or broad ANIM-02 parity.

## Click path

1. Library → Cube.
2. Bottom dock → More (`dock-more-button`) → Dual morph
   (`open-dual-morph-settings`, drawer `dual-morph-settings`). Expert mode is
   unnecessary.
3. Method (`dual-morph-method`) → **Via-snub (Cube through snub family to
   octahedron)**. Its domain and numerical limits appear in
   `dual-morph-snub-help`.
4. Enter Ratio (`dual-morph-ratio`, expressions supported) and Apply
   (`dual-morph-apply`), or Play (`dual-morph-play`). The empty reciprocal radius
   matches endpoint bounding radii using the existing native preparation route.
   Explicit center/radius remain inside **Center and size**.
5. Scrub `dual-morph-scrub`, Pause, Replay at the endpoint, or Reset to the
   retained source. `dual-morph-result` reports approximate status and normalized
   planarity, support violation and minimum strict support gap.

The existing Animation ratio sweep (`animation-morph`) and Base model exports
evaluate the same native method at each requested sample time. No timeline,
animation, export, project schema, desktop allowlist or pool-policy changes were
needed: `prepare-dual-morph` and `evaluate-dual-morph` are already whitelisted,
read-only reusable operations.

## Definitions and identities

The source must have literal coordinates `(±a,±a,±a)`, `a>0`, full ordinary cube
edges and ordered face cycles, convex interpretation and intrinsic/embedding
dimension 3. Coordinate signs, complete incidence and cyclic boundaries are
checked independently of catalog name; reordered source vertex/edge/face IDs
are accepted. Only the origin center and form A are supported.

For ratio `t`, `q=1-t`, `h=(1-t)a+t(r²/a)`. Coordinates are `h` times the 24
proper signed permutations of `(q²,q,1)`, in the R5 form-A convention. The
prescribed open-interval topology has 24 vertices, 60 edges and 38 faces (six
squares, eight diagonal triangles, 24 bridge triangles). No per-frame hull,
vertex welding or interpolation between guessed endpoint vertex pairs defines
the path. Shared numerical validation independently checks the emitted model.

The uniform snub event is `t=1-q*≈0.4563109873079236`, with
`q*³+q*²+q*-1=0`; **0.5 is not uniform**. Form A matches the generated
`snub-cube` convention, as proved by the R5 fixture and catalog crosswalk.

At parameter 0 the packet contains the complete literal source snapshot; at 1
it contains the prepared literal geometric polar snapshot, with numeric polarity
residual. `endpointIdentity` names these snapshots. These are exact endpoint
*identifications*, not exact-coordinate certificates. All frames remain
`certified:false`.

`endpointQuotients` remaps the 24 canonical corners to actual supplied source
vertex IDs and polar vertex IDs (source face IDs). Each interior owner also
records `endpointImages.source/dual` with the literal endpoint rank and element
ID, including edges collapsing to vertices. Square faces survive at the cube,
diagonal triangles survive at the octahedron; bridge triangles become edges at
both ends. The saved descriptor binds all maps and coefficients to the complete
source attributes, notes and effective units.

Square faces retain their source face RGBA and affine source-corner PNG sheets.
Diagonal triangles use mean incident source-face RGBA at their source vertex;
bridge triangles use the mean at their source edge. These new triangles own
their declared vertex/edge, rather than claiming an unchanged source face.
Source text follows explicit owners, including endpoint rank changes. Optional
RGBA interpolation uses the existing owner-aware adapter. Indexed palettes
requiring a mean remain unsupported and diagnosed.

## Persistence, ownership and limits

This is a read-only display operation. The source model/history is never
replaced or baked; the existing session saves only `view.dualMorph` settings and
reconstructs native frames after reopening. It uses the existing dirty tracking,
source/context fences, cancellation, exact seek and replay behavior. No new
model-changing history operation or replay opcode is introduced. Source notes,
units, attributes and annotations retain their original owner.

Accepted ratios are exactly 0 and 1, or numerical interiors `[0.001,0.999]`.
The open endpoint collars refuse explicitly without snapping. Playback/export
can therefore fail if an arbitrary requested sample falls in a collar; no
time-warping or approximate endpoint substitution hides that failure. A two-fps,
one-second 0→1 sequence samples 0, 0.5, 1 and is qualified here. Interior PNG
sheets can export, while a source-face PNG at the collapsed polar endpoint
refuses before output staging. Overflow, vanished support and unresolved
incidence also refuse.

Rotated/translated cubes, rectangular boxes, octahedron-as-source, all other
families, generalized sources, compounds, off-center polarity, form B,
extrapolation and 4D remain unavailable. Changing morph sections and combined
fold/explosion retain the existing explicit adapter refusals. Real encoders,
packaged Electron, competitor trajectories and desktop GPU pixels remain
qualification work for R7.

## Scenario tranche and verification

The R5 conformance inventory explicitly excludes ANIM-02 into R5-MORPH-SCOPE.
This package implements its B3 contract tranche and exercises existing scenario
IDs **`io-03-png-sequence`** (native mathematical-time samples, capture staging,
restoration) and **`io-03-combined-motion-scope`** (existing combined-adapter
refusals retained). It does not promote their shipped-media/competitor evidence.

Focused native checks cover literal endpoints/interior hull oracles, the uniform
event, source ID permutations, all endpoint quotient images, source colors and
optional RGBA interpolation, unsupported domains, numerical collars, forged
preparations, detached plans, save/reopen and deterministic reconstruction:

```powershell
python -m pytest tests/test_dual_morph_snub.py tests/test_snub_morph_contract.py tests/test_dual_morph_integration.py tests/test_morph_animation.py -q -p no:cacheprovider
```

Node checks include actual Three.js Viewer/source content, native session
restore and endpoint Replay, deterministic PNG staging, refusal/restoration,
and a mounted Vite/Chromium UI test through ordinary startup, Expert off,
selection/Apply/scrub/Reset and native-validated save/reopen. New suites are
registered in `test:features`.

```powershell
node --test --test-concurrency 1 tests/dual-morph-snub.test.mjs tests/dual-morph-snub-mounted.test.mjs tests/dual-morph-augmentation.test.mjs
node --test --test-concurrency 1 tests/dual-morph-session.test.mjs tests/dual-morph-viewer.test.mjs tests/dual-morph-combinations.test.mjs tests/morph-animation.test.mjs tests/morph-element-content.test.mjs tests/dual-morph-rectify.test.mjs tests/dual-morph-triangles.test.mjs tests/dual-morph-compound.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/animation-adapters.test.mjs tests/presentation.test.mjs
npx.cmd vite build --configLoader native
```

Results on 2026-11-09: **98 Python tests plus 22 subtests passed; 111 Node
tests passed** across those selections. Vite production build passed with its
existing mixed-import/chunk-size warnings. Electron was not launched.
