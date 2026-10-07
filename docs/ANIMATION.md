# Saved animation and frame export

Open **Animation** in the workspace shelf beneath the viewport for saved 3D/4D tracks, playback and export. The visible **Rotate** button starts continuous coordinate rotation; choose its plane and angular speed under **Rotation**. Continuous rotation is separate from the saved sequence. The project saves a sequence in the current history state's `view.animation` field, including duration, frame rate, loop setting, and keyframes. Sequences contain six rotation angles in degrees and intrinsic section depth, with optional version 2 source face/cell explosion and rigid face-net folding in version 0.12 development. Camera orbit, projection, section normal, face fill, opacity, and cell visibility use the current view settings; they are not animated tracks.

## Create and preview

1. Set duration and frames per second.
2. Choose a supported rotation plane, enter the number of turns, and select **Create rotation from current view**. A positive turn interpolates directly through 360 degrees. Unsupported planes are disabled for 3D geometry.
3. Alternatively, select **Create section depth sweep**. This retains the current orientation and sweeps between the lowest and highest source vertex depths along the current normalized section normal. It selects the section capture target.
4. Use **Play**, **Pause**, **Go to start**, **Go to end**, or the time slider. Rotation playback uses elapsed time; section playback waits for the current calculation before requesting another frame. Slow calculations can skip intermediate playback times.
5. To add a keyframe, pause or scrub to its time, set the desired rotation angles or section depth using the workspace controls, and select **Record current pose at time**. Recording at an existing time replaces that keyframe. Changing duration scales all keyframe times proportionally.

Angles interpolate numerically rather than selecting the shortest circular path. For example, 0 to 360 performs a full turn; -170 to 170 passes through zero. Sections use intrinsic source coordinates and remain independent of display rotation. Save the project to retain the animation. Opening another document or history state stops playback and cancels an active export.

Choose normal or explicit radial direction and **Add explosion track** for an intrinsic convex 3D/4D source. The endpoint amount is dimensionless from 0 through 10 and retains the original source normalization. **Add rigid face-net fold** adds a flat-to-folded 3D net and displays it in Compare beside the source. Both tracks retain source coordinates and incidence; they change presentation instances. Generalized/compound explosion directions and partially folded 4D cell nets diagnose as unsupported before publishing the candidate. Current explosion/fold pose sliders record a keyframe at the selected time. [Track controls and qualification](ANIMATION_TRACK_CONTROLS.md) describe exact contracts and limits.

## Export

Choose **Base model**, **Section**, or **Face net** in the capture selector. A folding sequence requires Face net or Base model capture because the shared derived viewport displays the net.

**Export PNG frames** opens a native save dialog for a new destination such as `Rotation.frames`. The destination becomes a folder containing `frame-000000.png`, subsequent numbered PNGs, and `sequence.json`. The manifest records exact frame times, frame count, and frame rate. Samples begin at time zero, continue at `1 / fps` intervals, and include the exact endpoint even when the duration is fractional. Section captures await each computed section before capturing it. Tangent or empty intersections can produce lower dimensional geometry or an empty viewport.

**Export WebM video** records rendered frames with the browser's video encoder and streams chunks to disk. A separate capture canvas copies the selected viewport's pixels, so capture continues when the viewport is scrolled offscreen. Export waits for encoder startup and a complete encoded video block before advancing from each pose, including the endpoint. Metadata alone does not signal frame readiness. Poses can be held while the encoder produces a frame. Video timing is real time: encoder buffering and expensive section calculations extend recording duration. PNG sequences are the reproducible choice for exact time samples. WebM uses an available VP9, VP8, or WebM encoder and does not require FFmpeg. Native WebM output replaces the selected file only after successful completion.

During export, the camera controls and animation controls are disabled. **Cancel animation export** discards staging files. The original complete view, presentation pose and time position are restored when exporting finishes or is cancelled while the source/view still belongs to that export. A new source or external view edit prevents old-state restoration. Export uses an exclusive temporary folder beside the selected destination and publishes completed output at the end. An existing PNG destination folder is never overwritten.

Limits are 300 seconds, 60 frames per second, 256 keyframes, 18,001 PNG frames, and 512 MiB per export. Each PNG or video chunk is limited to 32 MiB; PNG dimensions are limited to 8,192 pixels on either axis and 33,554,432 pixels in total. Native file paths come only from trusted dialogs; the renderer receives opaque session identifiers.

## Validation

Run the focused tests with:

```powershell
node --test tests/animation.test.mjs
```

After building the desktop renderer, run the integrated Electron smoke test:

```powershell
npm run build
node scripts/animation-smoke.cjs
```

The 17 focused tests cover sequence interpolation, duration/frame-rate editing, invalid records and bytes, native export resource bounds, destination preservation, cancellation, WebM signatures split across chunks, encoder cold starts, final-chunk draining, encoder errors, and structural video-block readiness across stream boundaries. The nine Electron checks cover 3D/4D playback, exact PNG output, saved-project persistence and reload, section capture, short WebM output with the source viewport scrolled offscreen, explicit cancellation, and document-switch cancellation. The smoke script substitutes native dialog choices only in its own test process and saves results under an isolated `artifacts/animation-smoke-*` folder.

Two fresh-process development runs of the 0.1-second offscreen capture passed all nine checks. Independent FFprobe decoding found two VP9 frames in each video, and FFmpeg frame hashes differed between the start and end images. Evidence is in `artifacts/animation-smoke-CUY3wE/` and `artifacts/animation-smoke-iZ5JG9/`, including `rotation.framemd5`.

To test an unpacked packaged executable instead of the development app:

```powershell
$env:POLYTOPE_TEST_EXECUTABLE = 'C:\path\to\win-unpacked\Polytope Laboratory.exe'
node scripts/animation-smoke.cjs
Remove-Item Env:\POLYTOPE_TEST_EXECUTABLE
```

Packaged runs use an isolated profile and an unavailable development Python path to verify the bundled engine. Their artifacts use the `artifacts/animation-packaged-smoke-*` prefix. Self-extracting portable launchers may not forward the inspector streams needed by Playwright's Electron launcher; use the unpacked executable for these native-dialog checks and `scripts/portable-smoke.cjs` for the portable launcher itself.

The final unpacked 0.9.0 application passed all nine checks with development Python deliberately unavailable. Packaged evidence is in `artifacts/animation-packaged-smoke-XTYtFl/`. Its 0.1-second offscreen video independently decoded to two visible VP9 model frames matching their respective exact PNG reference poses more closely than the opposite poses; `video-verification.json` records compression-error measurements and model-pixel counts.

For independent media verification when FFmpeg and FFprobe are installed:

```powershell
node scripts/verify-animation-video.cjs artifacts/animation-packaged-smoke-XTYtFl
```

These utilities are used only for optional validation. Application video export does not depend on them.
