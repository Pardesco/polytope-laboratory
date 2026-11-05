# W44 — Presentation mode

**View → Presentation**, **F5**, the command palette's **Presentation**, and the
toolbar button `presentation` enter a fullscreen showcase. **Presentation** on
the workspace shelf (`presentation-settings`) configures the playlist:

- `presentation-source`: Current model / Current tour / Featured gallery /
  Library family or search results. The library source captures every filtered
  result, including entries beyond the visible 250-entry catalog window.
- `presentation-duration`, `presentation-transition`: expression-aware seconds;
  tours keep their individual saved event durations. `presentation-loop` and
  `presentation-captions` are transient preferences.
- `presentation-start`: Start presentation. The nested **Record presentation**
  disclosure contains `presentation-format`, `presentation-size`, existing media
  options, `presentation-fps`, and `presentation-record`.

The showcase is `presentation-showcase`, with `presentation-canvas` and
`presentation-status`. Left/right navigate, Space pauses or resumes, C toggles
captions, and Escape exits or cancels preparation/recording. Equivalent buttons
are `presentation-prev`, `presentation-next`, `presentation-pause`,
`presentation-toggle-captions`, and `presentation-exit`. Controls fade after
inactivity and return on pointer motion, keyboard input, or button focus.

## Rendering and ownership

Playlists are detached, bounded tour snapshots. No document, history, saved tour,
selection, source coordinates, or dirty revision is edited. Existing native
catalog generation and linked-library reads provide geometry. The existing
animated-tour renderer owns two independent actor layers and guards native
results against the actual source/project/document. Existing native
`verify-dual-tour` verifies reciprocal endpoints before a morph is rendered;
there is no new geometry operation or project schema.

Current-model/gallery/library slides use the current material style and a slow
selected-plane spin (3D or 4D). Gallery entries supply featured angles/projection.
A full revolution is evaluated at absolute time and loops without orientation
drift; a repeating single-current-model showcase uses its full revolution period.
Recording still uses the requested slide duration. Saved tour animations, views,
split panes, event durations and noninstant transitions are retained. Slides
without saved animation receive an independent spin. Ordinary boundaries use the
existing opacity transition with zero translation; eligible native convex dual
pairs automatically use the existing sizing morph. Unsupported automatic dual
domains retain a cross-fade; explicitly saved unsupported morphs are refused by
the existing validators.

Captions paint into the composed canvas, so live and exported output share text,
responsive typography, bottom gradient and absolute-time fades. They contain the
model name, gallery description or first nonempty metadata/notes line, actual
V/E/F counts (plus C for 4D), and a supplied symmetry label when available.
Symmetry labels are declared source/catalog information, not a new exact group
certificate. Caption strings are drawn as text, never interpreted as HTML.

The layout holder retains sidebar classes, viewport configuration, inline size
values/priorities, focus, and each chrome element's inert/ARIA state. It freezes
underlying workspace dimensions during native fullscreen changes and preserves
open shelf panels. Exit restores those values. Native ownership also restores
the prior fullscreen, menu visibility, menu auto-hide and zoom settings, including
an already-fullscreen window. Rotation that was running on entry resumes on the
same source. Other explicit animation/tour/morph/fold playback must be paused
before entry. In-flight computation or file actions must finish first.

## Recording and limits

Record runs one finite playlist pass through `AnimatedTourExporter`, its native
staging API, and the existing target-resolution rendering/MP4/WebM/GIF/PNG
pipeline. Captions are included at the chosen size. Every frame awaits complete
geometry at `min(i/fps, duration)`; both endpoints are included. Encoding speed
does not set pose times. Cancel waits for encoder/staging cleanup before releasing
the workspace. Destination cancellation publishes no partial recording.

- Open a source document before presenting. At most 100 slides, 32 MiB per event,
  128 MiB per playlist; rejected/unsupported library entries refuse the playlist.
  Narrow a broad family/search rather than silently truncating it.
- New slide durations are >0–300 s, transitions >0–10 s; saved tour limits remain.
  Recordings are capped at 300 s including transitions, 1–60 FPS and 18,001 frames.
- Existing tour limits remain: 4096 pixels per axis / 16 Mi-pixel composites,
  bounded native caches and encoder output. Target stereo refuses explicitly.
  GPU/codec numerical and compression output is not bitwise reproducible across
  devices; GIF palette/delay quantization and MP4 timing limits are unchanged.
- A later window resize letterboxes the fixed live canvas. Restart to render at
  the new live size; recording still uses its independently chosen target size.
- Explicit hidden qualification never auto-enters; renderer startup checks and
  native IPC both refuse presentation activation in that mode.
- Actual Electron fullscreen transitions, native destination dialogs and hardware
  codec/GPU behavior still need the lead's desktop qualification. Electron was
  not launched in this worktree.

## Verification

- `tests/presentation.test.mjs`: playlist construction, tour preservation,
  gallery/search order, limits/cancellation, captions, clock/navigation, layout,
  target caption rendering, deterministic fake-encoder schedules and cancellation.
- `tests/showcase-controls.test.mjs`: real entry/exit methods, hidden mode,
  pending-fullscreen cancellation, encoder cleanup ordering and repeated entry.
- `tests/presentation-window.test.cjs`: native restoration, hidden refusal,
  fullscreen failure rollback, real preload and F5/menu binding.
- `tests/showcase-mounted.test.mjs`: mounted app with real Python/Three rendering,
  F5/Space/C/arrows/Escape, simulated fullscreen resize, layout restoration,
  save-content equality, and real three-frame WebM encoding through native API
  stubs. Screenshot: `artifacts/w44-presentation/showcase.png`.
- `tests/test_presentation.py`: native tour acceptance of 3D/4D spins and
  independent automatic-dual verification, with unchanged source snapshots.
- Hidden qualification's real-main IPC regression test was extended; no existing
  tests were removed. All four new Node files are in `test:features`.

Final verification: 252 Node regressions plus the mounted browser check, 101
Python tests (`test_presentation.py` and `test_tours.py`), Vite production build,
and `git diff --check`. Logs are under `artifacts/w44-presentation/`.

Files added: `ui/presentation.mjs`, `ui/presentation-layout.mjs`,
`ui/presentation-renderer.mjs`, `ui/showcase-controls.mjs`, `ui/presentation.css`,
`desktop/presentation-window.cjs`, the four Node test files and Python test above,
and this document. Files modified: `ui/app.js`, `desktop/main.cjs`,
`desktop/preload.cjs`, `desktop/command-bindings.json`, `package.json`, and
`tests/hidden-qualification.test.cjs`. Existing geometry-style
`ui/presentation-controls.mjs` is unchanged.
