# Live construction sliders (U9)

In **Construct**, look for **Explore** beside the existing edge-cut fraction,
expansion ratio, dual reciprocal radius, Conway kis height, and model scale.
The manual source-incidence cut also has an expert slider. Controls are attached
inside the existing input label, so moving the tool moves its slider too.

Drag or click a named stop to preview in the Model viewport. Release leaves the
preview visible. **Apply** or **Enter** records one normal recipe/history operation;
**Cancel**, **Esc**, or **Cancel preview** restores the source viewport. Typed
expressions still use `NumericEntry`; Enter waits for the current preview before
applying. Existing construction buttons and IDs remain available.

## Click-through IDs

Each row has `live-<input-id>-range`, `-apply`, `-cancel`, and `-status`:

| Input ID | Tool / labels |
| --- | --- |
| `truncation` | Cut corners: Original / Truncated / Rectified |
| `expansion-ratio` | Expand: Original / Expanded / Dual |
| `incidence-cut-amount` | Expert source corner cuts; 3D deep cuts through 0.95 |
| `incidence-dual-radius` | Size the added dual; selects explicit reciprocal sizing |
| `conway-height` | Raise face pyramids (kis); current source, notation `k` |
| `model-scale` | Scale: Original size / Double |

The independent viewer is `live-preview-canvas`; its always-visible exit button
is `live-preview-cancel`. The existing dual-morph panel retains its continuous
`dual-morph-scrub` slider, preparation, playback, and saved-view behavior.

## Definitions and limits

These are existing native constructions, not new geometric approximations of
them. Results use numerical predicates and coordinates, not exact certificates.
Cut corners uses the hull of directed edge-cut points for fractions 0–½.
Manual incidence cuts preserve source incidence; deep cuts can intersect and
are not claimed to be uniform bitruncations or a path to the dual. Their 4D
domain remains positive fractions through ½. There is deliberately no invented
“bitruncated” or “dual” stop on those sliders. Expansion interpolates the native
incidence-product family to its reciprocal dual. Kis heights are source units;
the engine refuses heights that would produce a nonconvex result. Dual size is
reciprocal **radius**, so dual coordinates vary with radius squared.

The slider's useful window does not constrain typed scale, kis height, radius,
or 3D deep-cut expressions; existing native domains apply. Catalog names reuse
`construction_names.construction_name`, conservative numerical recognition rather
than an identity certificate. “Truncated” labels the construction stage; it does
not assert that the result is uniform for every input polytope.

Preview calls debounce for 65 ms and use a warm read-only native worker.
Inputs above 160 vertices, or 4D inputs above 32 vertices / cells, update on
release and show a progress hint. Local warm native samples: cube truncation
~5 ms, expansion ~13 ms, kis ~47 ms; truncated-icosahedron truncation ~24 ms,
expansion ~89 ms. These exclude IPC, drawing, expression evaluation, cold imports,
and debounce time; desktop end-to-end latency is not certified.

Sequence checks, AbortSignals, complete source ownership, and raw-field checks
reject stale work. Preview geometry and preview camera never enter project state,
history, dirty bookkeeping, or autosave. Source normalization remains fixed so
scale is visible. The preview uses its own orbit camera; source annotations,
selection masks, and cell explosion are not applied. Save/export continue to use
the committed model. Apply recomputes through `commitOperation` (undo, replay,
and saved histories); no intermediate model is recorded.

## Verification

- `python -m pytest tests/test_live_sliders.py tests/test_incidence_truncation.py tests/test_w12_constructions.py -q -p no:cacheprovider`
- `node --test tests/live-sliders.test.mjs` plus existing engine-pool, renderer,
  construction ownership/workflow, history, expansion, incidence-cut, Add Dual,
  face-Conway, workspace-numeric, and dual-morph-session tests.
- `npx.cmd vite build --configLoader native`

The new Python cases compare all six preview operations to their native results,
verify refusals, catalog naming, and one-step recipe commits with replay. Node
cases cover stale responses ignoring cancellation, debounce/release, typed entry,
DOM wiring, keyboard actions, repeated Apply, ownership changes, detached display,
and fixed-scale presentation. Electron was not launched in this worktree;
desktop visual/interaction review at 1280px remains a lead-engineer check.
