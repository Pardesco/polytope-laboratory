# H3 via-snub and method/domain qualification

R7-MORPH adds the regular **Dodecahedron → snub family → Icosahedron** path,
including the reverse source direction. It reuses the existing native dispatch,
read-only session, content, project, playback and export adapters. The cube path
is retained. No new operation, model mutation, history opcode or schema is added.

## Click path

Library → **Dodecahedron** or **Icosahedron** → bottom dock **More**
(`dock-more-button`) → **Dual morph** (`open-dual-morph-settings`). Choose
**Via-snub (Cube or Dodecahedron / Icosahedron)** (`dual-morph-method`), enter
Ratio (`dual-morph-ratio`, expressions supported), then **Apply**
(`dual-morph-apply`). Ratio **0.5** is the H3 uniform snub event. The cube's
uniform event remains approximately **0.456311**. Help and residuals appear in
`dual-morph-snub-help` and `dual-morph-result`.

Scrub (`dual-morph-scrub`), **Play**, **Replay**, **Pause**, **Reset** and the
existing automatic reciprocal radius work. Save/reopen retains the literal
source and `view.dualMorph`, then reconstructs the display. Expert mode is
unnecessary. For video, open Timeline → **Dual morph** (`animation-morph`),
choose Duration/FPS, then Export settings → **Export WebM video**
(`animation-webm`). Base model capture evaluates the changing morph itself.

## Mathematical contract

Sources must be complete convex ordinary regular dodecahedra or icosahedra in
intrinsic/embedding dimension 3. Rotation, translation, uniform positive scale,
entity ID permutations and reversed face windings are supported. Names are
irrelevant. Normalized distance spectra, shortest-edge incidence, polygon
cycles, full native validation and all supporting planes are checked. Metric
regularity tolerance is `1e-8` of circumradius. Polarity uses the vertex mean;
an explicitly supplied center must agree within `1e-10` of source circumradius.

There are 60 source vertex/incident-face corners. Let `A` be a unit source
vertex vector and `B` the unit reciprocal-face vector at that corner. Solve
the three prescribed edge-class equalities for
`U = normalize((1-u)A + uB + k(A × B))`. Numerically,
`u ≈ 0.396435875218182` from the dodecahedron and
`u ≈ 0.603564124781818` from the icosahedron; `k ≈ 0.140524880566223`.
All 150 edge lengths are independently checked after solving.

For ratio `t ≤ 1/2`, the unit-corner path is
`(1-2t)² A + 4t(1-t) U`; for `t ≥ 1/2`, it is
`(2t-1)² B + 4t(1-t) U`. Multiply by the linearly interpolated endpoint
circumradius and add the geometric center. This declared C1 path has a stationary
normalized uniform event. It is not an installed Stella trajectory certificate.
The form is named **positive-corner-cross**; no absolute/catalog chirality label
is inferred across arbitrary source orientations.

Interior incidence is prescribed once: one polygon per source face, one per
source vertex, and two bridge triangles per source edge. Outward source cycles
determine the bridge diagonal. Every interior has **60 vertices, 150 edges,
80 triangles and 12 pentagons**. No per-frame hull, welding or topology repair
defines the method. Independent test hulls check the entire emitted boundary.
The uniform event also matches the separate Coxeter-orbit snub dodecahedron
under a full coordinate/incidence isometry (allowing either mirror convention).

At 0 and 1, the complete literal source and prepared polar snapshots are returned.
Corner quotients and every entity's endpoint images retain supplied IDs, including
rank collapses. This is literal endpoint identification, not exact arithmetic.
All frames report `certified:false`, normalized planarity/support residuals,
minimum strict support gap and the polarity residual.

Source polygons retain literal face RGBA and affine PNG sheets. New polygons
use incident source-face RGBA means and explicit vertex/edge owners. Text follows
those owners, including rank reversal at the dual. Optional color interpolation
uses the existing adapter. Indexed colors requiring a mean refuse. A source PNG
face collapsing to a polar vertex refuses instead of silently disappearing.

## Inventory and remaining baseline obligations

`tests/fixtures/morph_method_inventory_r7.json` records **117 native rows**:
all nine methods across five convex Platonic solids, a generalized great
dodecahedron, six convex regular polychora and generalized
`star-uniform4-quidpith`. Each sampled row validates ratios 0, .25, .5, .75, 1.
There are **66 sampled rows and 51 explicit refusals**, no timeout/error rows.
Source fingerprints and engine module SHA256s bind the receipt. These samples
establish neither arbitrary-input support nor independent mathematical parity
for every preexisting method.

| Source fixtures | Methods sampled successfully |
| --- | --- |
| Tetrahedron, octahedron | All eight methods other than via-snub |
| Cube, dodecahedron, icosahedron | All nine |
| Great dodecahedron (generalized) | Sizing, expansion |
| 5-cell, tesseract, 16-cell, 24-cell | Sizing, truncation, expansion, tilting quads |
| 120-cell, 600-cell | Sizing, truncation |
| Generalized 4D `quidpith` | Expansion |

The [public 4D manual](https://www.software3d.com/Manual/Features4D.php?prod=Stella4DPro)
names expansion and tilting quads. These are required documented 4D method
families. **The 120-cell and 600-cell rows remain gaps**: expansion/tilting quads
refuse current incidence-visit/pair budgets. Do not count their visible inventory
options as qualified. Existing sizing/truncation are additional implemented 4D
paths. The [morph manual](https://www.software3d.com/Manual/Morphing.php?prod=Stella4DPro)
does not specify a via-snub trajectory or establish a 4D via-snub baseline.
4D augmentation, tilting triangles/compound/rectify and via-snub remain unavailable;
an installed baseline comparison is still needed to settle any further obligation.
Neither public documentation nor this tranche waives ANIM-02's release gate.

## Scenarios, limits and verification

Local tranche scenarios **`anim-02-h3-via-snub`** and
**`anim-02-method-domain-inventory-r7`** qualify the H3 path and record the matrix.
Existing **`io-03-png-sequence`**, **`io-03-webm`** and
**`io-03-combined-motion-scope`** receive H3-specific evidence; their broader
platform/codec scope is not promoted. ANIM-02 is outside the original 139-case
R5 inventory and remains partial overall.

Supported ratios are exactly 0 and 1, plus numerical interiors `[.001,.999]`.
Open endpoint collars refuse without snapping; arbitrary high-FPS sequences can
therefore encounter an explicit refusal. Source sections, fold/explosion mixes,
off-center polarity, distorted/generalized sources, extrapolation and 4D via-snub
remain unsupported. Changing morph sections retain the adapter's explicit refusal;
the original source section is never substituted.

Verification on 2026-11-09:

- Native focused selection: **128 passed, 22 subtests passed** (30 new H3 tests).
  Endpoints, independent intermediate hulls, full uniform isometry, transformed
  sources, every endpoint image, RGBA means, forgery/refusal and disk save/reopen.
- Node selection: **135 passed** (8 new H3 tests), no skips. Actual Three.js
  content, PNG persistence, session/replay, deterministic PNG staging, ownership,
  refusals, and existing affected morph/pool/allowlist/video suites.
- Both H3 directions passed mounted Vite/Chromium startup with Expert off,
  native-validated save/reopen and real WebCodecs VP8 export. Independent
  FFprobe/FFmpeg decoded three distinct **480px-wide** frames at **0, .5, 1s**.
  The mounted suite requires `ffprobe` and `ffmpeg` on PATH; no dependency was added.
- `npx.cmd vite build --configLoader native` passed with existing mixed-import
  and chunk-size warnings. No Electron launch, packaged runtime, hardware encoder,
  MP4/GIF qualification or installed competitor comparison was performed.

Reproduce:

```powershell
python -B scripts/morph_method_inventory.py --timeout 15 --output tests/fixtures/morph_method_inventory_r7.json
python -m pytest tests/test_dual_morph_snub_h3.py tests/test_dual_morph_snub.py tests/test_snub_morph_contract.py tests/test_dual_morph_integration.py tests/test_morph_animation.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/dual-morph-snub-h3.test.mjs tests/dual-morph-snub-h3-mounted.test.mjs tests/dual-morph-snub.test.mjs tests/dual-morph-snub-mounted.test.mjs
node --test --test-concurrency 1 tests/dual-morph-session.test.mjs tests/dual-morph-viewer.test.mjs tests/dual-morph-combinations.test.mjs tests/morph-animation.test.mjs tests/morph-element-content.test.mjs tests/dual-morph-rectify.test.mjs tests/dual-morph-triangles.test.mjs tests/dual-morph-compound.test.mjs tests/dual-morph-augmentation.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/animation-adapters.test.mjs tests/presentation.test.mjs tests/video-recorder.test.mjs tests/vp8-webm.test.mjs
npx.cmd vite build --configLoader native
```
