# App chrome

The viewport keeps projection, surface style, Rotate/Pause, Fit and Snapshot (PNG)
in one row. Projection labels are Perspective, Orthographic and Stereographic;
the existing viewport controller hides/disables 4D projection for 3D sources.
**View options** (`view-options-button`) opens an anchored disclosure containing
viewport layout, observer camera, direction, Reset and the existing PNG options.
Stereo and click-selection options appear with expert tools enabled. Projection
maps 4D coordinates to 3D; Camera controls the separate 3D observer.

The bottom dock keeps Appearance, Rotation, Animation, Tours, History and
Presentation in one row. **More** (`dock-more-button`) offers Memories
(`open-memories-settings`), Dual morph (`open-dual-morph-settings`), Stereo
settings (`open-stereo-settings`) and Multiple views (`open-multiple-views`).
The last two require expert mode. Every drawer retains its original details ID,
inputs and listeners; its panel now has a sticky title, one help button and Close.
Native named disclosures permit only one dock drawer/menu at a time. Panels scroll
internally above the dock. Less-used drawer summaries are replaced visually by
their More entries; the original disclosures remain direct dock children.

The top bar groups File, Undo/Redo, Export, Guide and **Search Ctrl+K**
(`command-search`), with Presentation, Full screen, Library and Inspector on the
right. Presentation, native full screen and sidebar buttons report pressed state.
Native enter/leave-full-screen notifications also cover menu/keyboard changes.

**More app options** (`app-options-button`, the top-right ellipsis) contains
**Show expert tools** (`expert-tools`), also indexed by command search. It toggles
`body.expert-mode`. Preference `polytope.expert-tools.v1` is stored in localStorage;
missing/unavailable storage defaults off. `startupInfo().hidden` forces the initial
session setting on without changing the stored preference. Other feature modules
can mark expert-only controls with `data-expert`; the shared CSS hides them outside
expert mode. Selecting an expert tool through command search enables expert mode
before revealing/focusing it. Turning expert mode off closes an open expert drawer.

Menus use native summaries (Enter/Space), ArrowDown to enter, Escape to close and
return focus, outside-click dismissal and focus-out dismissal. Existing command
and smoke reveal helpers traverse their native details ancestors. The shared smoke
`openDisclosure(page,id)` helper clicks the corresponding More entry for a rare
drawer, with a summary fallback for baseline builds. Nine older smoke/benchmark
scripts use that helper; generic reveal also enables an expert target. No
extra hidden container or geometry/history operation was introduced. Display
settings continue to use their original persistence and validation handlers.

Validation: `node --test tests/app-chrome.test.mjs` covers the mounted DOM with
stubs, existing smoke reveal, keyboard/focus, control identity, exclusivity,
expert persistence/test startup, command reveal and the real preload notification.
The regression run passed 534 Node tests, including 12 new chrome tests and related
discoverability, viewport, hidden qualification, workspace, welcome and presentation
coverage. Ten changed smoke/helper scripts passed `node --check`.
`npx.cmd vite build --configLoader native` passes.
Browser review used the built renderer with the real Python JSON-lines engine and
a local native-shell shim: 1280×800 and 1920×1080, inspector open/closed, no toolbar
or dock overflow/overlap; menus, drawer headers, keyboard, preference reload,
hidden-mode override and hidden/disabled projection on a Cube were checked.
Electron/GPU/native-dialog qualification remains with the lead.
Native full-screen and presentation notifications have automated coverage but
were not exercised against a live Electron window in this sandbox.

Files: new `ui/app-chrome.mjs`, `ui/app-chrome.css`, `tests/app-chrome.test.mjs`
and this document. Small integrations in `ui/app.js`, `ui/command-index.mjs`,
`desktop/main.cjs`, `desktop/preload.cjs`, `package.json` and
`scripts/smoke-helpers.cjs`. Updated overflow callers in `scripts/`:
`augmentation-smoke.cjs`, `core-experience-smoke.cjs`, `face-editing-smoke.cjs`,
`face-placement-smoke.cjs`, `layer-join-smoke.cjs`, `memories-smoke.cjs`,
`morph-content-quick-smoke.cjs`, `morph-playback-benchmark.cjs` and
`morph-workflow-smoke.cjs`. Geometry engine files are unchanged.
