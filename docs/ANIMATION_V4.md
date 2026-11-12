# Animation version 4

In **Animation / Timeline**, open **Camera and display tracks**
(`#animation-v4-options`). No Expert mode is needed. Buttons:

| Label | Element id | Result |
| --- | --- | --- |
| Camera orbit | `animation-add-camera` | A 360° azimuth sweep from the current observer camera |
| 4D perspective eye | `animation-add-projection` | Capture the current Depth / eye distance |
| Face opacity | `animation-add-opacity` | Capture the current face opacity |
| Section normal | `animation-add-sectionNormal` | Capture the current 4D section normal |

The controller also exposes `addTrack('camera' | 'projection' | 'opacity' |
'sectionNormal')` for Timeline recipes. Adding preserves existing tracks and
duration. On a fresh sequence it holds model rotation fixed. For the three
constant-value tracks, scrub to another time, change the matching view control,
then use **Record current pose at time** (`animation-keyframe`, renamed by the
Timeline shell). Recording captures every enabled track, including the actual
observer camera. Changes use the existing sequence save / `markDirty` workflow.
For section-normal editing, choose **View options → Model + derived** to show
the existing **Normal** field; close the floating Animation card while editing.
Existing sequences and animation/tour element ids are retained.

## Saved representation

Any new track makes the sequence version 4. New track options are empty records:
`tracks: {camera:{}, projection:{}, opacity:{}, sectionNormal:{}}`. Each enabled
track has the identically named field on every keyframe; disabled fields reject.
Removing all new tracks returns to v1/v2/v3 according to the remaining tracks.
Loading an existing v1/v2/v3 sequence does not migrate or add fields.

- `camera`: `{azimuth,elevation,distance}`. Azimuth and elevation are degrees;
  distance is measured from the saved camera target. World +Y is up; azimuth
  zero is +Z and increases toward +X. All three values interpolate linearly in
  these spherical coordinates. Azimuth interpolates directly, so 0→360 is a
  full turn. Recording selects the equivalent azimuth nearest the existing
  interpolated value, preserving the turn count. Target, observer projection,
  zoom and orthographic scale are fixed. This is the Base model observer;
  the derived observer and camera roll are not animated.
- `projection`: the numeric `view.perspectiveDistance4D`, used by the viewer's
  **Depth** slider, interpolated linearly. This is the 4D eye, independent of the
  observer's orthographic/perspective setting. Requires a 4D embedding with
  Perspective 4D projection, and every value must exceed the current near depth.
- `opacity`: numeric `view.surfaceOpacity` in [0,1], interpolated linearly.
  Existing source RGBA and display-material policies still apply.
- `sectionNormal`: a finite nonzero 4-vector, normalized on input. Slerp follows
  the oriented great circle on S³, without changing a normal's sign. Interpolated
  vectors are renormalized. Input unit-length residual up to 1e-12 is retained
  to keep repeated normalization stable. Consecutive dot products ≤ -1+1e-10
  reject as antipodal / nearly antipodal: insert an intermediate normal to
  specify the route. Requires an intrinsic 4D model. Normal changes invalidate
  saved section alignment and recompute a visible section even at fixed depth.

Camera azimuth is bounded to ±1,000,000°, elevation to ±90°, distance to
(0,1,000,000]. Eye distance is in (0,100]. Existing duration/FPS/keyframe bounds
apply. These are floating-point display tracks, without exact-arithmetic claims.

## Playback and export

Playback, PNG, WebM, GIF and MP4 share absolute sequence evaluation and the same
guarded adapters. Repeated sample times reproduce the same mathematical pose.
Camera tracks use observer framing for export when the format's default is
**Fit model**, so auto-fitting cannot overwrite animated distance. Different
output aspect ratios may crop differently. The complete prior saved view and
actual observer camera (even without a saved camera field) restore after success
or cancellation while the source/view still belongs to the export. External
source/view changes retain their existing cancellation and restoration fences.
GPU pixels and compressed bytes are not promised identical across machines.

No new engine operation or dependency was added. Native project validation
accepts v4 and keeps strict older schemas. The lane registration contract is
unchanged; a lane may supply an `equal` comparator for structured camera values.

## Validation

`tests/animation-v4.test.mjs` covers legacy fixtures copied from existing sequence
tests, migration, finite limits, spherical interpolation, normal residuals and
antipodal refusal, recording, lane registration, real Three geometry/material /
camera application, section refresh and deterministic export poses/restoration
for all four formats. Its video encoders are stubbed; the existing media export
suite exercises actual writers and recorder plumbing. `tests/test_animation_v4.py`
checks native/JS agreement, malformed inputs and project/history/tour save-load.
`tests/animation-v4-mounted.test.mjs` checks the real mounted UI with headless
Chromium and the Python engine, without starting Electron.

```powershell
node --test tests/animation-v4.test.mjs tests/animation-renderer.test.mjs tests/animation-adapters.test.mjs tests/animation-track-controls.test.mjs tests/media-export-controls.test.mjs
python -m pytest tests/test_animation_v4.py tests/test_animation_state.py tests/test_morph_animation.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```

Electron smokes remain unchanged and require the lead's desktop run.
