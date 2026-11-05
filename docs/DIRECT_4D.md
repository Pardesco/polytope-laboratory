# Direct 4D manipulation (U7)

For intrinsic 4D models, **Shift-drag to turn in 4D** in the Model viewport.
Ordinary drag keeps the existing 3D orbit and picking behavior. Shift-scroll
turns in ZW; ordinary scrolling zooms. The existing expert **Drag in 4D**
checkbox (`four-dimensional-drag`) still supports dragging without Shift.
3D models ignore these 4D gestures.

The upper-right **4D turn** gizmo (`direct-4d-gizmo`) contains XW, YW and ZW
drag pads (`direct-4d-xw`, `direct-4d-yw`, `direct-4d-zw`). Drag horizontally
or vertically, use arrow keys for 2-degree steps (Shift for 10 degrees), or
activate a focused pad with Enter/Space for a 5-degree step. **Straighten**
(`direct-4d-straighten`) smoothly restores the app's default six angles
`[0, 0, 24, 0, 18, 0]` over 450 ms. An explicitly chosen source orientation
frame and the 3D camera are retained.

**Rotation → Show 4D turn controls** (`direct-4d-visible`) hides the gizmo.
The future View popover can call
`viewportControls.set4DGizmoVisible(boolean)`; the checkbox stays synchronized.
Visibility is an app-local preference, stored as `polytope.direct4d.gizmo`.
The hint (`direct-4d-hint`) appears in the first three window sessions that
actually display a 4D model. Its close button (`direct-4d-dismiss-hint`)
persists dismissal. Keys: `polytope.direct4d.sessions` and
`polytope.direct4d.hint-dismissed`. Storage denial does not disable manipulation.
New controls use the existing Rotation disclosure; no additional hidden
wrapper needs special handling in `smoke-helpers.cjs`.

## Rotation and persistence

Horizontal/vertical displacement uses the observer camera's screen-right/up
axes in display coordinates (0.35 degrees per CSS pixel). The resulting
spatial direction rotates toward W **after** the current 4D pose, before its
3D projection. From a front-facing camera these are XW/YW turns; an orbited
or rolled camera mixes XW/YW/ZW so motion follows the screen. Gizmo pads and
Shift-scroll use their named display-coordinate planes.

The module composes proper 4×4 rotations, then decomposes them in the
renderer’s six-plane order. It writes the existing `view.angles` array;
the sliders, rotation animation, memories, autosave, projects and exports
therefore share one pose. It introduces no native op, project schema,
geometry construction or extra Undo/Redo entry, matching existing sliders.
Equivalent Euler angles can change several slider values or jump at a
coordinate singularity while the visible orientation remains continuous.
These are floating-point display rotations. Round-trip and independent
composition tests bound matrix/point differences by `1e-10`; they are not
exact algebraic certificates.

Pointer movement queues small angular deltas; `ViewportControls.tick()`
renders at most once per animation frame through `displayPose()`. No native
engine computation runs per frame. Inertia uses exponential damping
`exp(-9 dt)`, a 240°/s release-speed cap, and a 0.5°/s stop threshold.
Holding still for 100 ms before release suppresses coasting. Escape, blur,
hidden-window transitions, cancellation, competing playback, source/pose
changes and export cancel motion. Camera observation locks retain the
existing nested ownership/rebinding contract. Hover picking is suspended
during direct manipulation and inertia; the Viewer's click threshold is
unchanged.

## Verification

On 2026-11-04:

- Node: **195 passed**, including **18** new math/DOM tests and existing
  viewport, observer-lock, dense-display, pose, animation and memory tests.
  `tests/direct-4d.test.mjs` is registered in `test:features`.
- Native saved-display/memory/animation validation: **62 passed**.
- Mounted Chromium renderer with the real JSON-lines engine: **21 checks
  passed**, including shared sliders/save, ordinary orbit, inertia, keyboard
  pads, Straighten, preferences, hint and the 3D guard. Screenshots inspected
  at 1280×900 and 1600×1000: `build/direct-4d-1280.png` and
  `build/direct-4d-1600.png`.
- `npx.cmd vite build --configLoader native` passed (existing large-chunk warning).

```powershell
node --test tests/direct-4d.test.mjs tests/viewport-numeric-controls.test.mjs tests/pose-element-content.test.mjs tests/observation-controls.test.mjs tests/viewer-ux.test.mjs tests/display-frame.test.mjs tests/dense-display.test.mjs tests/renderer-contract.test.mjs tests/animation-renderer.test.mjs tests/model-memories.test.mjs tests/memory-tour-publication.test.mjs
python -m pytest tests/test_display_state.py tests/test_model_memories.py tests/test_animation_state.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
node scripts/direct-4d-browser-smoke.mjs
```

An isolated warmed `turn4D` measurement (9 × 10,000 calls) had a median of
0.0028 ms/call. A 120-cell orthographic CPU comparison (9 × 64 poses, 600
vertices / 1,200 edges / 720 faces / 120 cells) measured 0.375 ms/frame with
precomputed poses and 0.373 ms/frame including composition/decomposition.
Final Float32 surface buffers matched exactly and the source geometry hash
remained `f0fd64c6ca3cf426a77e94e3fb831a945aa315d2866cc7078e58d06e02af3b87`.
This difference is timing noise, not a speedup claim. These measurements
exclude DOM, GPU uploads and rendering. The existing expensive stereographic
projection limits remain; no Electron/GPU performance qualification was run.
Optional two-finger viewport gestures are not implemented; pads support pointer
input, including touch.
