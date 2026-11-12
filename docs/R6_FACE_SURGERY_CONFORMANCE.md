# R6 convex face-surgery color and target tranche

Chosen R5 scenario IDs: **`con-07-target-filters`** and
**`con-07-color-coincidence`**, restricted to congruent convex 3D face
augmentation/excavation. This closes concrete subcases, not every option in
those inventory records or the whole CON-07/CON-10 requirement. No competitor
application comparison or Electron qualification was performed.

## Common UI and click-through

Construct → Modify → **Augment / Excavate** (`face-surgery-settings`, gallery
card `construct-card-face-surgery-settings`), with Expert mode off.

1. Pick a face using Select → Pick: face, then a viewport face.
2. Choose Pyramid or a colored model memory (`surgery-piece`).
3. Enable **All congruent faces / symmetry-equivalent vertices** (`surgery-all`).
   Choose **Congruent faces with the selected face's RGBA color** in
   **Face filter** (`surgery-target-filter`).
4. Choose **New side colors** (`surgery-side-colors`): Piece face colors,
   Target face color, or Unassigned. Toggle `surgery-excavate` for cavities.
5. **Preview selected surgery** (`preview-face-surgery`) computes a native
   result without editing the document. `surgery-preview-result` reports
   target IDs, V/E/F, matching residual/tolerance and approximate arithmetic.
   The collapsed **Preview face owners and colors** contains per-output-face
   source IDs, color owners and stored RGB/RGBA (`surgery-preview-owners`).
6. **Adopt preview** (`adopt-face-surgery`) creates one ordinary `face-surgery`
   history operation. Existing **Apply to selection** and **Drill opposite
   faces (prism)** IDs/handlers remain available. Cancel uses the existing
   `cancel-face-surgery` action.

The preview is a numerical/incidence/color report; the viewport retains the
source until adoption. Orientation/model options and the ownership report
remain collapsed. Numeric fields continue through NumericEntry.

## Definitions and receipts

- Selected-face behavior is unchanged. `all_of_type=true` still means ordered
  polygon congruence including size, not a face symmetry-orbit assertion.
  Optional `target_filter="same-color"` intersects that congruent-face set
  with the selected face's normalized RGBA. Byte and unit encodings compare
  after normalization, RGB implies opaque alpha, and unassigned matches only
  unassigned. Comparison has no color-distance tolerance. Unsupported filters
  refuse; same-color never broadens the congruent set.
- `side_colors="piece"` preserves each addition face's stored color (the
  backward-compatible default); `"base"` copies the individual target face's
  color to its new sides; `"none"` leaves new sides unassigned. Surviving base
  faces retain their colors. Filtering normalizes colors for comparison only;
  output retains the original encoding, channels and alpha.
- Both matched attachment faces are removed; seam vertex IDs are welded.
  Other faces survive. Optional blending still merges only equal **stored**
  color records. Unequal-color coplanar boundaries remain; there is no averaging
  or arbitrary coincident-surface retention policy.
- `metadata.faceSurgery.faceOrigins` parallels output faces. Every entry lists
  its base/addition face origins, attachment face and color owner. Coplanar
  merges compose all origins rather than losing contributors. Receipts also
  name removed base faces, addition attachment face/model, target/color policy,
  pre-snap maximum seam-match residual and tolerance (`1e-8` × base axis span).
- `face-surgery-preview` calls the same native computation as construction and
  is allowlisted/reusable in the desktop pool. Adoption rechecks complete source
  attributes, notes, units, history, selection, input expressions and memory.
  The small optional `commitOperation(...,{verifyResult})` hook checks prepared
  geometry, numeric policy, colors and construction receipt before publication.
  A mismatch invalidates the preview and leaves the document/history unchanged.
  Undo/Redo, saved projects and graph replay use existing recipes.

## Independent fixture and verification

`tests/fixtures/r6_face_surgery.json` supplies literal ordered cube/pyramid
incidence, distinct side colors, equivalent byte/unit red opposite faces, an
alpha counterexample and unassigned faces. At pyramid height/edge 1/4:

| Targets | IDs | V/E/F | Augmented / excavated unit-cube volume |
| --- | --- | --- | --- |
| Selected | 0 | 9/16/9 | 13/12 / 11/12 |
| Same RGBA and congruent | 0, 1 | 10/20/12 | 7/6 / 5/6 |
| All congruent | 0–5 | 14/36/24 | 3/2 / 1/2 |

Native tests check independent boundary integration and apex positions,
literal memory cycles through all four twists, all three color policies,
generated/memory pieces, seam removal, owner composition after blending,
unsupported-policy refusal, preview/result equality, and undo/reopen/replay.
History scenarios retain source notes and RGBA. Mounted tests additionally
check memory immutability and Expert-off visibility using the real renderer
and Python JSON-lines server. An altered returned color is rejected by the
actual app publication gate.

Executed on this worktree:

```powershell
python -m pytest tests/test_face_surgery.py tests/test_face_surgery_conformance.py tests/test_augmentation_workflow.py tests/test_face_blending.py -q -p no:cacheprovider
# 195 passed (74 in the new conformance file)

node --test --test-concurrency 1 tests/face-surgery-controls.test.mjs tests/face-surgery-mounted.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/history-workflow.test.mjs tests/project-workflow.test.mjs tests/construct-gallery.test.mjs tests/app-chrome.test.mjs tests/common-workflows-mounted.test.mjs
# 167 passed before the additional mounted disagreement subtest

node --test tests/face-surgery-mounted.test.mjs
# Final mounted suite: 5 passed, including the new disagreement subtest

npx.cmd vite build --configLoader native
# Passed; existing mixed-import and large-chunk warnings remain
```

## Remaining domains

Sources retain the existing independently verified convex XYZ boundary
contract: 4–256 vertices, at most 128 faces, at most 64 target faces, and
4096 vertices / 256 faces in output. Nonconvex/generalized interiors, 4D
surgery, unconstrained Booleans, similarity-based resizing, generalized
same-type filters and benchmark height-policy crosswalks remain unsupported
or unqualified. The new filter/color parameters apply to face augmentation
and excavation, not drilling or vertex copies. Geometry-bound annotations
continue through the existing content detachment policy; these face-origin
receipts do not introduce annotation transfer. All geometry and residuals
are float64 approximate, with existing manifold/intersection checks; there
is no exact solid or algebraic certificate.
