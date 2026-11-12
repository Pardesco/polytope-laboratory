# Timeline

Open **Animation** (`#animation-settings`) or **Tours** (`#tour-settings`) on the
viewport shelf. Both open `#timeline-panel`, a 260 px dock below the model. Drag
its upper separator (`#timeline-resize`) or focus it and press Up/Down to resize.
The viewport shrinks; the transport stays fixed while the content scrolls.

## Keyframes

Common motion buttons remain available without Expert mode:

- **Turn in 4D / Turn in 3D** (`#animation-rotation`): choose a coordinate plane
  and turns. The initial 4D plane follows the continuous spin, normally XW.
- **Section sweep** (`#animation-section`): lowest to highest source vertex depth.
- **Explode** (`#animation-explosion`), **Fold net (3D)** (`#animation-fold`), and
  **Dual morph** (`#animation-morph`): reuse existing native preflight/adapters.
  Unavailable actions have a visible reason and a matching tooltip.
- **Camera orbit** (`#timeline-camera-orbit`) appears only when the runtime
  registry contains the `camera` lane. It calls T3's `addTrack('camera')`.

Presets start playback and stop continuous Rotate. Replacing a saved sequence
announces that Undo restores it. Rotation's **Record this spin**
(`#timeline-record-spin`) uses the current continuous-rotation plane.

The ruler (`#timeline-ruler`) scrubs by click. **Time**
(`#timeline-exact-time`) accepts native numeric expressions in seconds. Duration
and FPS retain `#animation-duration` / `#animation-fps`. Space plays/pauses while
focus is in the panel, except in editable fields. Manual edits pause playback.

`sequenceLanes()` supplies rows. Varying rows show a diamond for every shared
keyframe; constant rows are muted. A diamond selects and scrubs. Left/Right,
Home/End select times; Up/Down reach other varying lanes. Drag snaps to `1/fps`;
Shift permits unsnapped times. Frames cannot cross or coincide with neighbours.
Endpoints remain at zero and duration. Delete/Backspace or
`#timeline-delete-keyframe` removes a frame, refusing to leave fewer than two.
Deleting an endpoint promotes the adjacent pose to that endpoint's time.

`#animation-keyframe` says **Add keyframe at …** or **Update selected keyframe**.
It captures rotation, section depth and every active track. Expert mode adds
**Numeric keyframes** (`#timeline-numeric`), with native expression fields for
times, vectors and scalar values. Structured camera values list their field order.

Animation saves, records, track changes and lane/table edits use the existing
document snapshot history (maximum 200 states). Undo/Redo and native project
save/load retain these snapshots. Geometry operation-node ownership is preserved;
these are view edits and do not introduce a native geometry recipe operation.

## Tours and export

`#timeline-tour` receives the existing `#tour-controls` element for T2's stop strip.
Modes preserve independent times and selections. Returning from legacy tour
preview documents restores the original Keyframes document. Animated tour previews
are hidden in Keyframes mode. All original animation/tour IDs survive relocation,
and `app-chrome-reveal` opens the appropriate mode for command search and smokes.

**Export video** (`#timeline-export-video`) opens the global Export dialog's video
goal with Animation or Tour selected. The original media controls, export buttons,
cancel buttons and progress remain under **Export settings**
(`#timeline-export-settings`). Capture target/frame fit are Expert options.

## Limits and verification

Keyframes are shared across lanes; there is no independent per-property timing,
curve editor or per-segment easing. Numerical interpolation/preflight retains the
existing engine's domains and residual checks; no exact geometry claim is added.
Camera/display tracks require T3; the new stop-card presentation requires T2.

Run `node --test tests/timeline-panel.test.mjs tests/timeline-mounted.test.mjs`.
The mounted test uses headless Chromium plus the real Python JSON-lines engine,
including pointer retiming, keyboard editing, resizing, independent legacy tour
preview, native project validation/reopen and export-goal routing. Existing
animation, tour-numeric, export, chrome and hidden-smoke compatibility tests apply.
The existing `smoke-compat-mounted` Appearance-width assertion failed both here
and with the modified UI modules restored from HEAD in a separate diagnostic
copy. It checks width before the asynchronous Appearance disclosure layout.
`scripts/timeline-smoke.cjs` is the fresh-profile hidden Electron qualification;
run after building, beneath the standard native HWND watcher with its matching
`POLYTOPE_HIDDEN_CANARY`. Electron was not launched in the worker sandbox.
