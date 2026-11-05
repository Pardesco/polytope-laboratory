# Canvas first impression (V1)

Fresh library opens and startup now frame the displayed shape with 10% padding
inside the canvas's reserved overlay area. Fit, projection changes, Depth edits,
and startup rotation use the same fit. Resizing an untouched fitted camera keeps
it framed; saved/restored cameras and manual observer changes retain ownership.

For an ordinary normalized 4D source of circumradius `r`, orthographic display
has radius at most `r` through every SO(4) turn. Finite 4D perspective with eye
distance `d` outside the ball has projected radius at most
`n*r/sqrt(d*d-r*r)` (`n=d` for equatorial scaling). This bounds the entire turn,
including the default XW spin, without sampling gaps. Both on-screen camera
projections fit that ball plus the actual display cloud. Camera fitting uses
floating-point arithmetic; it does not certify intrinsic geometry.

The safe area excludes the measured stats/hint heights and chooses a rectangle
beside or below the 4D turn widget. Generic/derived viewers retain their existing
20% padding; only the main canvas opts into 10%. Explicit animation framing
continues to fit its supplied frame cloud without the source rotation bound.

## Controls and behavior

- Toolbar: visible **4D projection**, `#projection-label` / `#projection`;
  hidden for 3D sources. Existing option values and handler remain intact.
  **Depth**, `#perspective-strength`, retains its explanatory tooltip.
- **View options → 3D camera**, `#camera-projection`; tooltip distinguishes
  the on-screen observer from the 4D-to-3D projection.
- Bottom left: compact `#counts-strip`. The original Model corner label remains
  in the DOM but is hidden.
- Bottom center: `#canvas-hint-slot` queues one item at a time: opening strip,
  gesture hint (`#direct-4d-hint`), then session tip (`#workspace-tip`). Items
  expire after eight seconds; keyboard focus holds the timer. Canvas interaction
  clears the queue. Showing a later hint refits only an untouched fitted camera.
- **Explore this shape**, `#explore-shape`, appears on fresh active library
  opens, never ordinary history edits. `#explore-shape-turn` highlights the
  `#direct-4d-gizmo` and demonstrates a 1.4-second turn returning to its pose.
  Reduced motion focuses a pad without animation. `#explore-shape-elements`
  opens Analysis, expands cells/faces and invokes the first existing type button.
  `#explore-shape-build` opens Shape builder. `#explore-shape-dismiss` dismisses
  the strip. Completed actions and explicit dismissal persist in local storage
  under `polytope.canvas.explore.v1`. Existing tip/gesture preference keys remain.
- Hidden qualification suppresses the hint queue while preserving existing
  control IDs, handlers and the 4D widget.

## Limits

Stereographic turns can approach a pole and have no finite global bound. They
fit the published display cloud using existing projection readiness/diagnostics.
Near-clipped perspective with an eye inside the source ball, exploded displays,
morphs and nets also fit the actual displayed cloud, without claiming a bound
over future poses. Extremely small canvas areas cannot provide an unobstructed
model beside all controls. User zoom/pan can deliberately leave the fitted area.

Element type classification uses the existing native analysis and selection
workflow. If it is still pending, the opening action waits up to 30 seconds;
navigation/export cancels the pending selection. Unsupported classification
leaves the existing Analysis diagnostic visible and does not record completion.
No new engine operation or model construction/history schema is introduced.

## Verification

- `node --test tests/canvas-framing.test.mjs tests/canvas-overlays.test.mjs`
  covers full rotations at Depth distances 1.15/1.5/3/4, both observer cameras,
  five viewport shapes, asymmetric safe areas, queue/persistence/focus/hidden
  mode and stale source/export guards.
- Existing viewer, projection, direct-4D, tips, viewport, chrome, capture,
  animation-framing and numeric-control regression tests: final focused run
  131 passed. The broader import/reference-selected run passed 547/548 tests.
  `learn-4d-mounted.test.mjs:82` timed out waiting for `nativePending === 0`;
  an isolated rerun and a copy of the original baseline UI reproduce that same
  timeout. This remains a lead follow-up; no test timeout or validation was relaxed.
- `python -m pytest tests/test_generator_options.py -q -p no:cacheprovider`:
  61 passed.
- `npx.cmd vite build --configLoader native`.
- `node scripts/canvas-overlays-browser-smoke.mjs`: real renderer plus native
  JSON-lines engine, no Electron; opening actions, native cell selection,
  persistence, 3D guards and hidden mode (23 checks).
- Browser captures: `build/canvas-v1-opening-1600.png`,
  `build/canvas-v1-projection-options.png`, `build/canvas-v1-framed-1280.png`.
  Before images are the supplied UI-pass captures 01, 02 and 10. Desktop review
  remains with the lead engineer.
