# W38: target-resolution image and animation rendering

PNG stills, PNG sequences, WebM, MP4 and GIF now render the prepared Three.js
scene into an independent WebGL target at the requested dimensions. Video and
GIF encoders retain their existing exact-pose, cancellation and native atomic
publication contracts. Raster export needs no engine operation or new IPC route.

## Click-through

- Workspace toolbar: open **PNG options** (`png-settings`). Choose **Size**
  (`png-size`): viewport, 1080×1080, 1080×1920, 1920×1080 or 3840×2160.
  Click **PNG** (`image`). Existing transparency (`png-transparent`) and
  dimension multipliers ×1/×2/×4 (`png-scale`) remain available.
- Workspace **Animation** / **Tours** shelves: choose **Export size**
  (`animation-size`, `tour-size`), including the new **4K** preset, and
  **Export selected format** (`animation-export`, `tour-export`).
- Open the collapsed **Export options** for animation/tours, or PNG options:
  `*-framing`: **Fit model** (default) / **Match viewport**;
  `*-margin`: 10% (default), 5%, 0% or 20%;
  `*-supersample`: native / **×2 supersampling**.
  Prefixes are `png`, `animation` and `tour`.

## Definitions and implementation

Fit model retains observer direction/up and fits the current projected geometry
to the target aspect. Margin is a fraction of each image dimension reserved on
each side. Orthographic fitting uses camera-frame bounds; perspective fitting
checks each point against horizontal/vertical frustum constraints, including
depth. Both use floating-point arithmetic. Match viewport preserves pose, zoom
and vertical field while adapting horizontal coverage to the new aspect; it can
crop geometry. It does not add letterbox bars.

Supersampling renders both dimensions at ×2 and downsamples to the exact chosen
output dimensions. It is independent of PNG Scale, which multiplies final pixel
dimensions. Texture-size and 32 Mi-pixel render bounds automatically reduce ×2
to ×1 with a diagnostic; an unsupported native target refuses with a smaller-size
instruction. Native-size targets use up to four hardware AA samples when
available; supersampled targets avoid an additional multisample allocation.

The target uses a cloned camera, the same scene/materials/lights/background and
sRGB output. Readback flips GPU rows and unpremultiplies alpha for ImageData.
Point sizes and LineMaterial widths/resolution scale with output size. Ordinary
unindexed edge segments temporarily use the existing wide-line shader, avoiding
hardware one-pixel line clamps. Cylinder/sphere primitives retain world sizes.
Owned targets and line buffers are reused across poses and disposed at the end.

The visible canvas, renderer pixel ratio and observer camera are never resized
or replaced by capture. Render target, cube face/mip, viewport/scissor, clear
alpha, background, primitive sizes and line resolutions restore synchronously
even after render/readback/encoding errors. A source-canvas resize invalidates
capture. Animation shows a frozen preview overlay until restoration finishes;
Cancel stays available. Tours render into independent target-sized actor viewers
and a separate composite canvas, retaining split panes, saved backgrounds,
transition transforms/opacities and source ownership. Export never advances the
visible tour preview. Preferences remain transient, like existing export options;
model/history/project schemas are unchanged.

## Limits and follow-ups

- All target-resolution stereo modes, including anaglyph, explicitly refuse;
  select Stereo: None. Legacy synchronous non-Viewer adapters retain their old
  bitmap capture behavior for compatibility.
- Fit model fits each pose independently; rotating/exploding geometry can change
  apparent scale. Match viewport provides fixed observer framing. Tour fitting
  occurs before presentation transforms, preserving slide/shrink transitions.
- Margin bounds geometry points, not label extents or sphere/strut radii.
  Existing qualified display tessellation is reused; supersampling does not
  recompute stereographic curve/surface tolerances at a higher pixel density.
- Tour composites retain their existing 4096-per-axis / 16 Mi-pixel bound.
  Existing PNG byte, encoder capability, frame-count and native file limits
  still apply. GIF/video remain opaque; GIF palette/timing losses remain.
- Actual GPU/driver and Electron native-dialog qualification remains with the
  lead. Electron was not launched. An optional browser smoke attempt could not
  start because Playwright wanted cache writes outside this restricted worktree;
  no browser pixel correctness is claimed from that attempt.

## Verification

- `tests/target-render.test.mjs`: **16 passing** tests for arbitrary-aspect
  orthographic/perspective fits, margins, exact presets, GPU-size fallback,
  renderer/material restoration, both line paths, alpha/row handling, resize
  refusal, stereo refusal, PNG/media routing and frozen-preview ownership.
  Registered in `package.json` `test:features`.
- Added tour renderer/exporter integration tests verify separate 1080×1920
  output, half-width split panes, two live transition actors, target reuse,
  disposal and an untouched visible preview.
- Broader Node regression run: **263 passed** across 23 files; final focused
  rerun after the additional resize/exporter tests: **75 passed**.
  Logs: `artifacts/w38-render-size/node-tests.log` and `final-node-tests.log`.
- `python -m pytest tests/test_animation_4d.py tests/test_material_styles.py
  tests/test_display_state.py -q -p no:cacheprovider`: **48 passed**.
- `npx.cmd vite build --configLoader native`: passed, existing bundle-size warning.
  `git diff --check`: passed.
