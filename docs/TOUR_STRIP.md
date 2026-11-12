# Tour stop strip

Tour mode presents saved shapes/views as a horizontal strip of stop cards. Each
card shows its numbered model name and hold duration; chips between cards name
the outgoing transition. Click a card or use Left/Right (Home/End also work) to
select and preview a stop. Selection uses roving keyboard focus and the existing
tour seek/publication checks. Model names are rendered as text.

## UI and integration

- `#tour-controls` remains the live container. T1 can move this exact element into
  `#timeline-tour`; the original Tours disclosure (`#tour-settings`) also works.
- `#tour-add`: **Add current view as stop**. Empty tours explain this action and
  hide the strip, selected-stop editor and playback controls until a stop exists.
- `#tour-strip`: cards (`[data-tour-stop]`) and transition chips.
- `#tour-editor`: Event (`#tour-event`), Duration (`#tour-duration`), Outgoing
  transition (`#tour-transition`), collapsed Transition parameters
  (`#tour-transition-parameters`) and **Apply transition** (`#tour-transition-apply`).
- `#tour-replace`: **Update selected stop**; `#tour-delete`: **Delete**;
  `#tour-up` / `#tour-down`: **Move left** / **Move right**.
- `#tour-more`: collapsed **More** menu containing existing **Save tour**
  (`#tour-save`) and **Merge** (`#tour-merge`) actions, when available.
- `#tour-playback` retains `tour-prev/play/next/loop/scrub/position`.
- `#tour-export-settings`: collapsed **Export settings** contains every existing
  media field, FPS, selected-format/PNG/WebM export, Close preview and Cancel.
  Active media export opens it so Cancel is accessible. Numeric-edit cancellation
  also remains available there. T1 owns the shared Export video action.

`ui/style.css` imports `ui/tour-strip.css`. Styling uses existing theme tokens;
the strip scrolls horizontally, labels retain full text in tooltips, and card
nodes persist across ordinary playback refreshes. Unchanged strip refreshes do
not rewrite attributes. The new controls require no Expert mode.

## Timing, storage and limits

Duration is the saved stop's hold duration, separate from outgoing transition
time. The final outgoing transition plays only when Loop is enabled. Switching
the editor from Instant to an animated method gives an untouched zero transition
time a 0.5-second starting value, so Apply works with parameters collapsed.
Instant transitions still save zero time; NumericEntry and all existing numeric,
combination and native dual-endpoint validation remain in force.

Tour snapshots, dirty tracking, selection ownership, native validation, playback
and exporters reuse the existing implementation. No engine operations, stored
tour formats, `tour.mjs`, or `animated-tour-*` modules changed. Existing bounds
(100 stops, hold time at most 3600 seconds, animated transition time at most 60
seconds) still apply. Reordering uses buttons; drag reordering is not implemented.

## Verification

- `tests/tour-strip.test.mjs`: pure labels/movement plus mounted Chromium checks
  for empty state, literal names, selection/focus, duration/update/reorder/delete,
  More, legacy media handlers, unchanged-sync idempotence and moving the actual
  container into Timeline. Screenshots: `build/tour-strip-dock.png` and
  `build/tour-strip-timeline.png` (isolated DOM fixture, no GPU/native-export claim).
- Existing tour, animated-tour, transition, numeric-entry, publication, media,
  discoverability, renderer-contract, export-goal and theme tests are exercised.
- Native saved-tour regression: `python -m pytest tests/test_tours.py -q -p no:cacheprovider`.
- Production bundle: `npx.cmd vite build --configLoader native`.

Electron was not launched in this worktree. The lead must run the unchanged
`scripts/animation-smoke.cjs`, `scripts/tours-smoke.cjs` and
`scripts/animated-tours-smoke.cjs` after the Timeline packages are merged. Existing
IDs and disclosure ancestry remain available to smoke `reveal()` / `autoReveal()`.
