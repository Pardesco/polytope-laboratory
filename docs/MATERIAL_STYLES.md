# Materials and presentation styles (W11)

The workspace **Appearance** shelf (`surface-settings`) starts with **Style**
(`presentation-style`) and **Reset to preset** (`style-reset`). Styles coordinate
face tint/specular, lighting, background, edges, vertices, opacity and primitive
sizes. Available styles are Studio, Dark gallery, Glass, Metal, Neon edges, Paper
and Geomag. Geomag uses opaque reflective steel spheres and red cylinder struts;
Neon uses emissive cyan cylinders; Paper uses unlit source colors and black lines.
These are display settings for both 3D sources and projected 4D sources. Source
coordinates, incidence, selected cells and observer pose are preserved.

**Material and lighting** (`material-lighting-settings`) contains **Background
type** (`appearance-backgroundMode`: Solid / Vertical gradient / Transparent),
top/solid color (`appearance-background`), gradient bottom
(`appearance-backgroundBottom`), edge glow (`appearance-edgeGlow`) and the existing
color/light expression entries. Use **Apply** (`appearance-apply`).
**Bump and environment** (`material-effects-settings`) retains its existing bump,
environment blend and refractive-index controls. Both advanced groups are collapsed
inside the scrollable Appearance popover.

The selected style identifier and all overrides are literal saved view data in
`view.appearance`, `view.materialEffects` and existing surface/primitive fields.
Manual material edits retain the selected style identifier. Reset reapplies the
style defaults, including its visibility/opacity and effects. Applying another
style also replaces these overrides. Like other appearance changes, these mark the
current document dirty without adding a geometry operation/history node. Existing
project/history snapshots and memories retain them. Native project validation
accepts the new bounded fields and still accepts legacy sparse appearance records.
No new native computation operation or IPC route is needed for display materials.

The environment is generated locally as six deterministic 32×32 canvas images:
soft rectangular highlights, a narrow highlight and a brighter sky/darker ground.
No asset fetch or external file is required. The existing owned readiness/cancel/
disposal path is retained. Optional analytic Waves/Pebbles bump is reused. Gradient
GPU textures are reused until colors change, then disposed; tour gradient paints
are cached. There is no environment generation or GPU texture allocation in the
render loop. Tours composite saved backgrounds independently of transparent actor
canvases.

Beside **PNG**, open **PNG options** (`png-settings`): **Transparent background**
(`png-transparent`) and **Scale** (`png-scale`: ×1 / ×2 / ×4). Then click **PNG**
(`image`). Options are frozen before async preparation. Scale multiplies the
current canvas pixel dimensions, rendering at the increased pixel ratio instead
of resizing an existing bitmap. Transparency clears both the solid clear color
and gradient background to alpha zero. The renderer's size, ratio, clear color,
alpha and scene background are restored synchronously before destination review,
including when encoding fails. Existing source/camera ownership and atomic native
PNG publication remain in force.

## Limits

- Phong environment mixing and environment-only refraction are visual effects,
  not physical metal, ray-traced transmission, thickness or a 4D light simulation.
  Glass keeps ordinary translucent face sorting and source RGBA alpha semantics.
- Reflection is disabled above **12,000 source faces** with a visible viewport
  note. The saved request is retained and PNG uses the same diagnosed fallback.
  Existing sphere/cylinder resource caps still fall back to points/lines visibly.
- PNG scaling is bounded by the GPU texture-size limit and **32 megapixels**;
  existing native limits are 32 MiB data URL / 24 MiB PNG bytes. Transparent or
  scaled anaglyph captures explicitly refuse; single and side-by-side views work.
- Scaling increases raster resolution using the already prepared mathematical
  display geometry; it does not retessellate stereographic curves for the larger
  target. PNG preferences are session controls, not saved view fields. Tour/video
  output keeps its existing fixed background and export settings.
- No Electron process or native dialog was launched. Actual GPU appearance,
  desktop layout and native alpha PNG inspection remain lead review checks.

## Verification

**123 Node tests passed**, including 22 new tests for preset expectations, real
Three.js 3D/4D primitives, mounted control actions, overrides, NumericEntry edits,
owned environment disposal, dense-model fallback, PNG bounds/alpha/scaling,
failure restoration and frozen export options. Existing image ownership, atomic
output, section materials, sphere/strut, stereo, animation and tour suites passed.

`node --test tests/material-styles.test.mjs tests/png-capture-options.test.mjs tests/image-capture-session.test.mjs tests/renderer-contract.test.mjs tests/section-viewer.test.mjs tests/viewer-geometry.test.mjs tests/entity-presentation.test.mjs tests/image-export.test.cjs tests/animated-tour-renderer.test.mjs tests/animated-tour-layer.test.mjs tests/animation-export-capture.test.mjs tests/viewer-stereo.test.mjs tests/display-numeric-controls.test.mjs`

**26 Python tests passed**, including an actual native project validation and
filesystem save/load round trip for every renderer preset plus customized Glass.

`python -m pytest tests/test_material_styles.py tests/test_display_state.py -q -p no:cacheprovider`

`npx.cmd vite build --configLoader native` passed (199 modules; existing bundle
size warning). Both new Node test files are included in `test:features`.
