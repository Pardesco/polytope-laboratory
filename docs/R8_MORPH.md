# Large convex 4D expansion and tilting quads

The **120-cell** and **600-cell** now support **Expansion** and **Tilting quads**
through the existing read-only dual-morph workflow. These four domains previously
refused Cartesian-pair budgets. Small-source constructions and all other method
refusals retain their existing contracts. No project schema, operation whitelist,
history opcode, timeline or animation implementation changes are needed.

## UI

Library → 120-cell / 600-cell → bottom dock **More** (`dock-more-button`) →
**Dual morph** (`open-dual-morph-settings`). Choose `expansion` or `tilting-quads`
in `dual-morph-method`; enter Ratio (`dual-morph-ratio`, expressions supported)
and **Apply** (`dual-morph-apply`). The new `dual-morph-4d-help` explains scope.
Expert mode is unnecessary. Scrub, Play/Replay, Pause and Reset retain their IDs.
Leave reciprocal radius blank to match source/dual bounding radii.

Save/reopen reconstructs the pose from the literal source and saved `view.dualMorph`.
Reset restores the source. Morphs change display settings, so no geometry history
snapshot is appended. Timeline → **Dual morph** (`animation-morph`) creates the
existing ratio track; Export settings → **Export PNG frames** (`animation-png`)
or **Export WebM video** (`animation-webm`) uses the existing evaluator.

## Numerical and topology contract

The method is unchanged: for each incident vertex/cell pair `(v,c)`, expansion
uses `C + (1-t)(P[v]-C) + t(Q[c]-C)`, where `Q` is the prepared polar at center
`C`, radius `R`. Product elements are precisely `F × D*` with `F ⊆ D` and
`rank(F) + rank(D*)` equal to the output rank. Supplied polygon order and IDs are
retained. Tilting quads uses the reciprocal of expansion at `1-t`:
`C + R² n / (t hP + (1-t) hQ)` on each prepared product support plane.

Vertex posting intersections now enumerate containment in literal ID order,
rather than testing absent Cartesian pairs. The one-million visit budget counts
postings/intersection candidates and emitted incidences; existing 20,000-vertex
and 32,000-element limits remain. Source validation, complete facet supports,
reciprocal supports and factor support checks still run. No production hull,
weld, angular sorting or topology repair is introduced.

For both sources, every resolved strict interior expansion has
`(V,E,F,C) = (2400,7200,7440,2640)`; tilting quads has the reversed vector.
Ratios 0 and 1 return detached literal source and prepared reciprocal snapshots.
`supportEvidence` reports normalized factor planarity/support residuals, minimum
positive support offset, tolerance and `certified:false`; polarity residuals are
also retained. These are binary64 checks, not exact arithmetic certificates or
an installed Stella trajectory comparison.

Every output element retains source owners. Face/cell RGBA retains literal
records or the existing normalized incident means, including alpha. Expansion
PNG sheets attach only to the two true caps of each original face, with affine
source-corner maps. Bridge ancestry is explicitly excluded from sheet ownership.
Text follows declared owners and changes rank at the reciprocal endpoint.
Collapsed PNG endpoints and unsupported tilting PNG correspondences refuse.
Ordinary convex-source 4D product display signatures allow one million visits within their
existing 32 MiB JSON / 128 MiB portable caps. Original annotation sources still
use 250,000 visits / 8 MiB; all finite-data, dense-array, accessor, ownership and
full-content comparisons remain in place.
The existing large generalized-source annotation-cap refusals are retained.
PNG compilation/rebuild uses a synchronous checked batch: full source/frame
checks run at entry, immediately before publication and at exit, and every
asset await remains fenced. Per-polygon calls reuse that batch's completed
check; mutation and asynchronous-batch attempts are tested refusals.

Preparation caching uses the complete finite canonical source, settings and
notes/units key, a separate single-entry slot and a 16 MiB preparation limit.
Every request still compares the full supplied descriptor to native preparation.
Outputs are detached. Changed source attributes, context or forged coefficients
cannot reuse an old preparation.

## Evidence and scope

Local scenarios: `anim-02-4d-cell120-expansion`,
`anim-02-4d-cell600-expansion`, `anim-02-4d-cell120-tilting-quads`,
`anim-02-4d-cell600-tilting-quads`, `anim-02-method-domain-inventory-r8`, and
`view-01-4d-product-content`; history ownership is
`anim-02-morph-animation-history-owner`. These are local tranches of ANIM-02 / VIEW-01.

The versioned `tests/fixtures/morph_method_inventory_r8.json` records all nine
methods on thirteen named current sources: five Platonic solids, great
dodecahedron, all six regular convex polychora and generalized `quidpith`.
It preserves the R7 receipt, samples 0/.25/.5/.75/1, binds source fingerprints
and implementation hashes, and keeps refusals visible.

`S` means sampled successfully; `R` means an explicit native refusal, not a
claim of benchmark unavailability. All samples are uncertified.

| Source | Sizing | Truncation | Augmentation | Expansion | Tilting quads | Tilting triangles | To compound | To rectify | Via snub |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tetrahedron | S | S | S | S | S | S | S | S | R |
| Cube | S | S | S | S | S | S | S | S | S |
| Octahedron | S | S | S | S | S | S | S | S | R |
| Dodecahedron | S | S | S | S | S | S | S | S | S |
| Icosahedron | S | S | S | S | S | S | S | S | S |
| Great dodecahedron (generalized) | S | R | R | S | R | R | R | R | R |
| 5-cell | S | S | R | S | S | R | R | R | R |
| Tesseract | S | S | R | S | S | R | R | R | R |
| 16-cell | S | S | R | S | S | R | R | R | R |
| 24-cell | S | S | R | S | S | R | R | R | R |
| 120-cell | S | S | R | S | S | R | R | R | R |
| 600-cell | S | S | R | S | S | R | R | R | R |
| `star-uniform4-quidpith` (generalized) | R | R | R | S | R | R | R | R | R |

There are **70 sampled rows and 47 explicit refusals**, with no error/timeout
rows. Only the four large 4D rows changed eligibility from the R7 receipt.

The [public 4D manual](https://www.software3d.com/Manual/Features4D.php?prod=Stella4DPro)
names expansion and tilting quads as 4D methods. No additional 4D method domain
or moving-section combination is inferred from it. Arbitrary convex inputs must
pass the existing factor-support contract. Near-degenerate samples can refuse;
there is no endpoint snapping beyond literal 0/1. Off-domain generalized tilting,
other 4D methods, changing sections, shrink/explosion/fold combinations and the
via-snub endpoint collars remain outside this tranche. Broad ANIM-02 / VIEW-01
and installed/packaged platform qualification remain open.
Large attributed poses are costly; playback can coalesce samples and no frame-rate
guarantee is claimed. The new domains have PNG-specific capture evidence; their
WebM/codec and packaged-desktop qualification is not promoted by these tests.

## Reproduce

Implementation files: `engine/dual_morph_sparse4d.py`,
`engine/dual_morph_expansion.py`, `engine/dual_morph.py`,
`engine/dual_morph_cache.py`; `ui/dual-morph-controls.mjs`,
`ui/dual-morph-session.mjs`, `ui/morph-history-owner.mjs`, the one-line
`ui/app.js` animation-history registration,
`ui/element-content-source.mjs`, `ui/morph-element-content.mjs`,
`ui/morph-element-content-renderer.mjs`, `ui/viewer-element-content.mjs`.
Evidence: `scripts/morph4d_oracle.py`, `scripts/morph_method_inventory.py`,
`tests/test_dual_morph_sparse4d.py`, `tests/dual-morph-sparse4d.test.mjs`,
`tests/dual-morph-sparse4d-mounted.test.mjs`, `tests/morph-history-owner.test.mjs`,
the R8 matrix fixture and this doc. `package.json` adds three Node registrations.

`scripts/morph4d_oracle.py` independently reconstructs all maximal facets with
SciPy Qhull, all rank-two intersections and ordered polygon hulls, all edges and
closed cell links. It imports no production morph/incidence helper. Native tests
check both sources/methods at .13/.5/.87, formulas, transformed/renamed sources,
RGBA/maps, budget refusals, literal disk reopen and cache forgery resistance.
Node tests exercise the real Viewer, content sheets, source restoration, ratio
playback, native project reopening and deterministic PNG staging. Mounted tests
use Vite/headless Chromium and the real JSON-lines engine, with Expert off and
actual PNG capture. They do not launch Electron.
The mounted bridge memoizes repeated **identical complete** morph requests in
an eight-entry / 64 MiB serialized-JSON test-only receipt cache; each distinct mathematical pose
still comes from the real JSON-lines engine. Native/Viewer tests independently
exercise repeated evaluation, ownership and restoration without that bridge cache.

Animation-history saves retain the prepared morph only through a synchronous
owned transaction. It cancels pending morph work, verifies the unchanged complete
model, notes, units, annotation and morph settings, checks the exact predecessor
snapshot, branch/truncation rule and current state identity, then captures a new
native source owner. Only animation and its history label may change. This keeps
Reset/Replay available after FPS/track/export configuration. Other history moves,
Undo/Redo, altered snapshots/attributes and late pre-edit frames still refuse.
Project comparisons use the existing JSON normalization of signed zero.

```powershell
python -B scripts/morph_method_inventory.py --scenario anim-02-method-domain-inventory-r8 --timeout 120 --output tests/fixtures/morph_method_inventory_r8.json
python -m pytest tests/test_dual_morph_sparse4d.py tests/test_dual_morph_integration.py tests/test_dual_morph_cache.py tests/test_dual_morph_generalized_expansion_4d.py tests/test_dual_morph_triangles_math.py -q -p no:cacheprovider
node --test --test-concurrency 1 tests/dual-morph-sparse4d.test.mjs tests/dual-morph-sparse4d-mounted.test.mjs tests/morph-history-owner.test.mjs tests/dual-morph-session.test.mjs tests/dual-morph-viewer.test.mjs tests/morph-animation.test.mjs tests/morph-element-content.test.mjs tests/engine-pool.test.cjs tests/engine-op-allowlist.test.cjs
npx.cmd vite build --configLoader native
```

Completed verification (selections overlap; do not sum them):

- Native regression selection: **71 passed, 32 subtests passed**; final sparse
  budget/varied-RGBA selection: **2 passed**.
- New native-to-Viewer/content/playback/reopen/export suite: **14 passed**.
- History/session/workflow/Timeline unit selection: **118 passed**, including
  **15** new ownership cases, held-frame cancellation, branches and the 200-state cap.
- Existing morph/content/pool/allowlist selection: **105 passed**. Final shared
  content/generalized selection: **22 passed**, including the retained refusal.
- Mounted Vite/Chromium: **12 passed** (four new domain cases plus the existing
  Timeline test and its seven subtests). All four domains saved/reopened natively,
  captured distinct actual 480px PNG frames, and reset successfully with Expert off.
- Final convex-source cap/mutation/async-batch selection: **2 passed**.
- `npx.cmd vite build --configLoader native` and `git diff --check`: passed.
  Existing mixed-import/chunk-size and Node module-type warnings remain.
