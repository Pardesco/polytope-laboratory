# Welcome and first run (U13 / W20)

Welcome is a non-modal, skippable panel over the startup tesseract. Its hero is
**Explore shapes in three and four dimensions**, with three starting actions:

- **Browse the library** (`welcome-library`) reveals Library and opens Collections,
  clearing the current library filters through its existing Home handler.
- **Build from symmetry** (`welcome-symmetry`) calls `window.openCoxeterBuilder()`.
- **Open a file** (`welcome-open`) uses the ordinary native Open workflow.

**Close** (`welcome-close`) and Escape dismiss it. Help ? Welcome and command
search reopen it. **Show at startup** (`welcome-never`, retained for compatibility)
is checked when startup display is enabled. It reads/writes the existing opt-out
key `polytope-welcome-v1`; previous preferences remain valid. Explicit reopening
still works with startup display off. Automatic display stays suppressed during
hidden qualification, recovery availability, and startup project/import adoption.
Hidden test mode also suppresses explicit reopening and thumbnail requests.

The horizontal featured strip (`welcome-gallery`) retains twelve offline catalog
models. Keyboard focus scrolls its cards into view; thumbnails load on demand.
Existing `featured-<key>`, `sample-sections`, `sample-paper`, `sample-dual`,
`welcome-whats-new`, `welcome-motion`, and `welcome-paper` actions remain available.
Recent files retain their existing native open tokens and workflow. Empty workspaces
have the same three primary actions (`empty-library`, `empty-symmetry`, `empty-open`)
and retain the original `empty-motion` and `empty-paper` shortcuts.

## Walkthroughs

**Show me how** has eight buttons, `walkthrough-<id>`:

| ID | Lesson | Revealed controls |
| --- | --- | --- |
| `measure` | Measure an edge | Analysis measurements, source edge selector and content |
| `dual` | Make the dual | Construct gallery pane, then Undo / Redo |
| `slice` | Slice a 4D object | Second viewport, Evaluate and Depth |
| `morph` | Morph to the dual | More ? Dual morph, Play / Pause / ratio |
| `paper` | Make and print a net | Nets: edge length, Unfold faces, pack and PDF |
| `struts` | Export a 3D-printable strut model | Export dialog, Printable model, dimensions |
| `turn4d` | Turn a shape in 4D | Shift-drag, XW / YW turn pads, Straighten |
| `cut-corners` | Morph a cube into an octahedron | Cut corners stops and Apply, then Undo ? Make dual |

Each starts a learning document without replacing existing documents. The coach
(`walkthrough-coach`) offers Next / Finish, Skip step and Exit tour; Escape exits.
Matching UI events advance steps, and Next permits skipping. Dragging or arrow-key
turns can be followed by Next; Enter activates a 4D pad and advances automatically.
Opening hidden turn pads uses the existing saved visibility preference.

`welcome-reveal.mjs` uses the existing Construct opener and command reveal path
(including the app-chrome reveal event, View options, inspector tabs and details).
Rare dock drawers open through their More entry. Skipping an export-opening step
still uses the existing Export action; printable options open through their selector.
The coach belongs to the active modal when necessary, with stale/reentrant step
publication checks and no unnecessary reparenting between modal steps.

**Mathematical correction to the brief:** rectifying a cube gives a cuboctahedron,
not an octahedron. The live Cut corners tour accurately teaches Original ?
Truncated ? Rectified ? Apply, explicitly naming that intermediate cuboctahedron.
It then uses Undo ? Make dual to reach the octahedron. No slider domain, native
construction or mathematical label is changed. Named live-slider stops now have
stable IDs (`live-<input-id>-stop-<index>`); the three corner-cut stops are
`live-truncation-stop-0`, `-1`, `-2`, followed by `live-truncation-apply`.

## Tip line

`workspace-tip` sits below the viewport counts; `workspace-tip-dismiss` dismisses
it for the session. Ten short tips cover search, 4D gestures, live sliders,
symmetry building, paper nets, F5 presentation, Collections, View options, More
and Undo/Redo. There is no timer: one tip is chosen per session, retained across
renderer reloads in `sessionStorage` (`polytope.tip.session.v1`). The next session
advances the index in `localStorage` (`polytope.tip.next.v1`). Dismissal survives
reloads in that session. Denied/malformed storage is harmless. Hidden test mode
neither displays a tip nor advances its index. Long lines truncate with a native
title tooltip; the dismiss control remains visible and keyboard accessible.

## Computation and persistence

Native catalog loading, cancellation/publication guards, `NumericEntry`,
construction recipes/history and export review are reused. Live preview stays
detached; Apply and Make dual use the ordinary commit path. Source geometry,
Undo/Redo, project validation and all numerical limits keep their existing contracts.
Guidance progress and thumbnails are session-only; no engine operation or project
schema is added. Native errors do not count as construction success: the coach
advances on action, and users must wait for the operation or use Next/Skip.

Thumbnails use one offscreen Viewer and a twelve-image bounded cache; closing
cancels queued native reads. Three bundled native projects in `examples/welcome/`
use `restoreMemoryState` and `validate-project`, appending documents with their
notes, views and net. Regenerate with `python scripts/generate-welcome-samples.py`.

## Verification

- `python -m pytest tests/test_welcome.py tests/test_live_sliders.py -q -p no:cacheprovider`:
  **36 passed**, validating gallery models, samples, native previews and recipe replay.
- `tests/tips.test.mjs`: **10 passed**, including session rotation/dismissal,
  hidden suppression, denied storage and DOM-stub reveal paths.
- `tests/welcome-mounted.test.mjs`: **1 passed** with Chromium and the real
  JSON-lines engine. Checks all 31 step targets after the mounted layout, visible
  anchors in all eight tours, the three starting actions, Shift-drag, hidden pads,
  native corner cutting / dual construction, saved history, Undo/Redo, startup
  preference, tip dismissal/reload and hidden mode. Screenshots at 1280 and 1600:
  ignored `build/welcome-refresh-1280.png` and `build/welcome-refresh-1600.png`.
- Focused Node regression run: **188 passed** across `tests/welcome.test.mjs`
  and existing slider, construct gallery, discoverability,
  direct-4D, renderer, navigation and construction/history suites are included in
  regression verification. Both new suites are registered in `test:features`.
- `npx.cmd vite build --configLoader native`: passed (existing viewer import and
  large-chunk warnings). `node scripts/welcome-browser-smoke.mjs`: **36 assertions
  passed** against the built renderer, including twelve distinct thumbnails,
  eight tours, samples, recovery, startup file ownership and empty-state recovery.
  Its shell shim now supplies the existing project-open confirmation API, and
  its held-startup check awaits Welcome initialization rather than transient status.

Existing regression failures were reproduced with baseline source restored:
`app-chrome.test.mjs` smoke stub uses an undefined global `document`;
`startup-performance.test.mjs` lacks `analysisOverview` in its analysis stub;
`product-polish.test.mjs` expects an outdated deferred element-type placeholder;
`user-guide.test.mjs` lacks an Analysis measurements help mapping;
`guide-mounted.test.mjs` expects the old Analysis direct-child ordering. These
unrelated contracts are left for their owners. Electron/native dialogs, printing
and GPU behavior remain lead-engineer qualification. Numerical constructions
remain approximate; no exactness guarantee is introduced.
