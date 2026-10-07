# Saved model tours

Open **Tours** on the workspace shelf to capture the current model and its view as an event. Add, Replace, Delete, Up and Down edit the saved sequence; Prev, Next, Play, Pause and the time slider display events in a separate reusable preview document. Source documents and retained event snapshots stay independent. Duration is in seconds. Loop repeats the sequence. Merge reads a native-validated `.polytour` or JSON tour; Save tour writes a standalone `.polytour`. The project file also retains its tour and selected event.

Keyboard shortcuts are Ctrl+Alt+T to add, Ctrl+Alt+Left/Right to step and Ctrl+Alt+Space to play or pause. Shortcuts ignore editable fields, open dialogs, pending tour actions and animation export. Changing the source or project, starting export or pressing Pause cancels pending playback publication. Other rotation and animation playback stops before a tour displays an event.

## Persistence and timing

The version 1 record is plain JSON:

```json
{"version":1,"events":[{"id":"cube","state":{"model":{},"view":{}},"duration":5,"transition":"instant"}],"cursor":0}
```

`model` in this abbreviated example must be complete valid geometry. Every saved state retains ordered source incidence, view, notes, metadata, provenance and offline asset information. Geometry remains in its original dimension; projection does not replace it. Captured `operationNode` is inert lineage in the tour bank. A preview detaches that association into `sourceOperationNode` instead of inventing a document recipe graph.

The pure `evaluateTour(tour, time, {loop})` evaluator uses absolute elapsed seconds, independent of previous seeks or frame rate. An exact interior boundary selects the next event at local time zero. A nonlooping seek clamps to `[0,totalDuration]`; its exact endpoint selects the last event at its full local duration and reports `ended`. Looping uses modulo total duration, including negative seeks. An empty sequence has no displayed event. Playback reads one monotonic clock and uses the same evaluator. Slow native validation can skip short events; this is an instant slideshow, not a guarantee that every event occupies a rendered frame.

## Validation and integration

`ui/tour.mjs` supplies `createTour`, `normalizeTour`, `addTourEvent`, `replaceTourEvent`, `setTourDuration`, `selectTourEvent`, `deleteTourEvent`, `moveTourEvent`, `mergeTours`, `tourDuration`, `tourEventStart` and `evaluateTour`. Banks and their snapshots are deeply immutable. Merge appends events and deterministically renames duplicate IDs with `~1`, `~2`, etc. Earlier banks remain readable.

`TourControls` mounts its compact disclosure before `#history-settings`. Instantiate it before viewport disclosure bindings. Its context supplies `getProject`, `getState`, asynchronous `showEvent(snapshot,label,{signal,isCurrent})`, `markDirty`, `guard`, `isExporting` and `stopOther`. Optional `importTour` and `exportTour` callbacks expose Merge and Save tour; optional `setStatus` reports errors. Call `sync()` after source, project and export changes. `showEvent` must validate a detached snapshot and check cancellation immediately before publishing the preview; the controller changes the persisted cursor only after successful display. `destroy()` cancels playback and removes its keyboard listener.

`engine/tours.py` exposes `tour_documents` for authoritative project validation and `validate_tour` for standalone imports. Native validation checks every event, including unused events, rebuilds fingerprint and measure caches, reconstructs saved net layouts and rechecks exact certificate inputs through the same model validation as ordinary documents. Import is detached, so rejected validation cannot partially publish caller data. Renderer IPC accepts tour records; native file dialogs choose read/write paths. The public native `validate-tour` operation has no filesystem parameters.

Limits are 100 events, 32 MiB UTF-8 JSON per event, 128 MiB per tour, depth 64 and 8,000,000 JSON values. Event duration must be finite, greater than zero and at most 3600 seconds. IDs must be unique strings of 1-128 characters. Invalid cursors, nonfinite metadata, sparse/accessor records, invalid geometry and unknown transitions reject explicitly. The enclosing project retains its separate 128 MiB file limit.

## Scope and verification

Only `instant` transitions are implemented. Fade, geometric morph, inheritance of spin/layout, multiselection and direct whole-tour video export are pending work. This format does not claim interoperability with Stella `.tour` files. The official [Tours](https://mail.software3d.com/Manual/Tours.php) and [Transitions](https://mail.software3d.com/Manual/Transitions.php?prod=Stella4DPro) references describe a broader event/layout and transition workflow; they are requirements context, not a claim of feature parity.

Verification: `node --test tests/tour.test.mjs` passes 15 tests; `python -m pytest tests/test_tours.py -q` passes 32 tests. The fixtures include an independent Cartesian cube, a central tesseract section, ordered star incidence, exact boundary/loop/end timing, byte limits, failed native display, cancellation, captured recipe lineage and native save/reopen. `scripts/tours-smoke.cjs` passes 10 actual Electron workflows on 0.11.0 with no renderer errors, including standalone native save/import/Merge, project reopen, retained source documents, reusable validated preview, endpoint and loop playback, editable/dialog shortcut guards and export cancellation. Evidence: `artifacts/tours-smoke-oSGltq/result.json` and visually inspected `tours-workspace.png`. The script supports `POLYTOPE_TEST_EXECUTABLE` and forces an unavailable development Python for packaged validation; packaged tour proof is pending.

`ui/transitions.mjs` is a separate presentation building block awaiting renderer adapters and a future tour schema. `createTransition`/`normalizeTransition` validate versioned instant, sideways, tilted orbit, shrink-grow, explode-grow, shrink-implode, explode-implode and combination definitions. `evaluateTransition` returns immutable outgoing/incoming translation, six rotation angles, scale, opacity and entity explosion factor at absolute elapsed time. `captureTransition` retains an interruption pose that can be supplied as `initial` for continuous restarting with a new method and exact terminal pose. Combinations add translation and multiply shrink/grow scales; only one explosion family is permitted. `explosionOffsets` computes `(factor-1)*(centroid-center)` in source dimension 2, 3 or 4 without changing source vertices or incidence. Coordinates must be supplied from validated source entities; this helper does not infer solid interiors or repair nonconvex geometry. Its 12 independent mathematical tests pass, but these methods are not exposed as completed tour transitions until both simultaneous-model rendering and persistence are integrated and visually tested.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/tours-packaged-smoke-xfCW6C/result.json](../artifacts/tours-packaged-smoke-xfCW6C/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
