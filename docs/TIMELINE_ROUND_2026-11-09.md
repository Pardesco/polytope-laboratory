# Timeline round - November 9, 2026 (round 4)

Goal: animation becomes something a new user can make in two clicks and an expert can edit precisely.
Spec rows: ANIM-01 (rotation, explosion, section depth, fold animation), ANIM-02 (dual morph), ANIM-03 (tours).

## What is wrong today (screenshots: polytope-orchestra/shots/r4)

- **Animation** is a small floating card over the viewport (04-dock-Animation). Without Expert mode it shows only a time
  slider, Play, capture target and four export buttons. The controls that CREATE an animation (rotation, section sweep,
  record keyframe, explosion, fold, morph) are expert-only, so a new user cannot make one at all.
- Keyframes are invisible: the only trace is "2 keyframes" in a monospace status line. There is no way to see, select,
  move or delete a keyframe.
- **Tours** is a second floating card with its own transport, scrubber, FPS field and export block (06-dock-Tours). Edit
  buttons (Add, Replace, Delete, Up, Down, Merge, Save tour) are squeezed into one row and truncate.
- Export is duplicated three times per dock ("Export selected format", "Export PNG frames", "Export WebM video") and again
  in the global Export dialog.
- Many properties cannot be animated: camera orbit, 4D projection depth/eye, opacity and section normal.

## Design (decided)

One **Timeline** panel replaces both floating cards. It docks across the bottom of the viewport, full width, about 260 px
tall and resizable (it does not cover the model). The shelf tabs "Animation" and "Tours" both open it, in the matching mode.

```
+-- Timeline ---------------------------------------------------------------------------------------------+
| [Keyframes | Tour]   |<  >  >|  [loop]   00:02.40 / 00:08.00   Duration [8] s  FPS [24]   [Export video] |
|-------------------------------------------------------------------------------------------------------------|
| + Add motion v  |  0s      1s      2s      3s      4s      5s      6s      7s      8s                       |
|   Turn in 4D    |  Rotation  <>--------------------------------------------------------------<>             |
|   Section sweep |  Section       <>-----------------<>                                                       |
|   Explode       |  Camera                                                                                    |
|   Fold net (3D) |                         | playhead                                                         |
|   Dual morph    |  [Record keyframe at 2.40 s]  [Delete keyframe]                                            |
+-------------------------------------------------------------------------------------------------------------+
```

- **Add motion** recipes (always visible, no Expert mode): Turn in 4D (plane + turns), Section sweep, Explode,
  Fold net (3D only), Dual morph, Camera orbit. Each builds the track from the current view, shows it in the lanes and
  plays it once. Math name first, plain subtitle second ("Section sweep: slide a hyperplane through the shape").
  Unavailable recipes are disabled with the reason as a tooltip and visible subtitle (e.g. "Fold net needs a 3D shape").
- **Lanes**: one row per animated property, built from the saved sequence through `ui/animation-track-registry.mjs`
  (lead-created contract; tracks register `key`, `label`, `subtitle`, `fields`, `available(model)`). Keyframes are
  diamonds. Click = select and jump the playhead. Drag = retime (snaps to frames; Shift = free). Delete/Backspace
  removes the selected keyframe (never the last two). Arrow keys move between keyframes. Each diamond has a tooltip
  with time and value. Lanes are keyboard reachable (roving tabindex) with aria-labels.
- **Record keyframe** stores the current pose at the playhead (existing record()); editing a pose while paused on a
  keyframe shows "Update keyframe".
- **Transport**: Go to start, Play/Pause (Space while the timeline has focus), Go to end, Loop, time readout mm:ss.ff,
  Duration and FPS as compact NumericEntry fields. Ruler with second ticks; click the ruler to scrub.
- **Export video** is one button that opens the existing global Export dialog on its Animation goal with the current
  mode preselected. The per-dock media controls (format, size, export options, PNG/WebM buttons, cancel, progress) move
  into a collapsed "Export settings" disclosure at the end of the panel. Every existing id survives (smokes).
- **Tour mode** shows the tour as a horizontal strip of stop cards (name, duration, transition chip between cards),
  with "Add current view as stop", a selected-stop editor (duration, transition and its parameters collapsed),
  Replace / Delete / Move left / Move right, and Save tour / Merge in a "More" menu. Same transport row and same
  Export video button. Drag-reorder is optional; buttons are required for accessibility.
- **Expert mode** adds: numeric keyframe table (time + every field, editable), easing per segment if the sequence
  model supports it, explicit capture-target select, frame-fit and raw media options.
- Rotation shelf tab (continuous spin) gets "Record this spin" which creates a Turn in 4D track with the current plane.

## New animatable properties (t3)

Version 4 sequences may add tracks: `camera` (orbit azimuth, elevation, distance; interpolated in spherical coordinates),
`projection` (4D eye distance / Depth slider value), `opacity` (face opacity 0-1), `sectionNormal` (unit 4-vector,
interpolated by normalized slerp, antipodal endpoints rejected with a message). Versions 1-3 load unchanged and keep
validating exactly as before. Export and playback evaluate the same pure functions so PNG/WebM frames stay deterministic.

## Packages

| Pkg | Owns | Summary |
| --- | --- | --- |
| t1 timeline shell | new ui/timeline-panel.mjs, ui/timeline.css, ui/animation-lanes.mjs; edits ui/animation-controls.mjs markup, shelf wiring in index.html/app.js (additive) | Panel, transport, recipes, lanes, record/update/delete/retime keyframes, export disclosure, mode switch with `#timeline-tour` mount that receives the existing `#tour-controls` container |
| t2 tour strip | ui/tour-controls.mjs markup/behaviour, new ui/tour-strip.css | Stop-card strip and stop editor inside `#timeline-tour`; keeps every tour id; works if mounted in the old dock too |
| t3 animated properties | ui/animation.mjs (v4), ui/animation-adapters.mjs, ui/animation-renderer.mjs, registry entries | camera / projection / opacity / sectionNormal tracks with save/load, playback and export; tests for v1-v3 compatibility and determinism |

Contract file `ui/animation-track-registry.mjs` is created by the lead before the fork; t1 consumes it, t3 extends it.

## Acceptance

- Fresh profile, no Expert mode: load Tesseract, open Animation, click Turn in 4D, see a Rotation lane with two
  diamonds, press Play, click Export video and reach the Export dialog. Under 30 seconds.
- Keyframe add / select / retime / delete with mouse and keyboard; Undo restores (animation edits go through markDirty
  and the existing history pattern used by record()).
- Existing animation-smoke and tour smokes pass unchanged (ids preserved), plus a new timeline smoke.
- Node suite, pytest, hidden canary and the hidden smoke battery pass.

## Astra review adopted (reviews/astra_timeline_review.md)

- Exact time entry next to the readout (typing a time moves the playhead); dragging supplements precise editing.
- Capture wording: "Add keyframe" / "Update selected keyframe", with a one-line hint of what is captured
  ("Captures rotation, section depth and every animated track").
- Motion ownership: starting animation or tour playback stops the continuous Rotate spin and shows it stopped; any
  manual edit while playing pauses playback first.
- A preset that replaces an existing animation says so in the status line with Undo ("Replaced the 3-keyframe
  animation. Undo restores it.").
- Keyframes and Tour modes keep their own playhead/selection when switching; switching never converts or discards work.
- Tour empty state leads with "Add current view as stop" and hides editing controls until there is a stop.
- Naming kept math-first per the round-3 rule (Turn in 4D, Section sweep, Explode, Fold net, Dual morph, Camera
  orbit), each with an outcome subtitle ("Spin the shape through the fourth dimension").
- Cut for v1: curve editor, per-track independent keyframes, nested tours, preset management.
