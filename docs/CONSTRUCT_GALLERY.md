# Construct tool gallery

The Inspector → Construct tab now starts with **Find a tool…** (`construct-tool-search`) and cards in six task categories: Change this shape, Make it regular, Stars & facets, Combine, Create a new shape, and Expert. Search matches plain names, synonyms and original technical names. Unrecognized construction groups receive an Expert card, preserving access to their controls.

Choose a card to open one focused pane. **All tools** returns to the gallery and retains the search. Alt+Left also returns; Down from search focuses its first matching available card. The pane header's **?** opens the original group's offline Guide topic. The main action is highlighted; existing secondary disclosures sit under **More options**. Expert cards and their category carry `data-expert`, ready for U2's shared Expert tools toggle; this package adds no global toggle.

## Integration and preservation

`ui/construct-gallery.mjs` mounts immediately after `organizeInspector(document)` in `ui/app.js`. CSS is imported separately there, so the module also runs in Node DOM-stub tests. Original control nodes, IDs, input values, event handlers and controller roots remain intact. The original container IDs remain as layout shells. No mathematical operations, native dispatch, history or project format change: all actions still use their existing engine, NumericEntry, publication checks and history workflows.

`window.openConstructTool(idOrElement, {focus = true})` opens the owning pane, selects Construct, reveals Inspector and opens containing disclosures for a nested target. It returns false for unknown targets. Pass any original group/control ID, card or control element; e.g. `openConstructTool('make-dual')`, `openConstructTool('fitting-mode')`, or `openConstructTool('expansion-settings')`. This opens controls without executing a construction. Pane IDs are `construct-pane-<tool-id>`, card IDs `construct-card-<tool-id>`, and Back buttons `construct-back-<tool-id>`. The two legacy primary tool IDs are `gallery-dual` and `gallery-truncate`; the basic generator uses `gallery-generator`.

The Shape builder card (`construct-card-shape-builder`) calls `window.openCoxeterBuilder?.()` and stays hidden while that function is absent. A module registering the hook after startup can dispatch `new Event('construct-tools-changed')`; activating the Construct tab also refreshes it.

The command palette disregards closed gallery panes when deciding whether a control is available, adds the plain tool name and synonyms to control entries, and opens the correct pane before focus/click. Genuine hidden or disabled controls keep their restrictions. `scripts/smoke-helpers.cjs` now calls the same opener before expanding a target's disclosures. Smoke checks that intentionally clicked old group headings now use the gallery cards/header help.

The Recent row stores at most four distinct tool IDs in localStorage under `polytope.construct.recent`. It records tool visits, not document changes. Invalid/obsolete entries and denied storage are harmless. A reopened application starts at the gallery, with the recent visits available.

## Availability and limits

Cards show dimension restrictions and reuse the primary action's current disabled state and explanation. Updates follow controller availability changes and workspace rendering. This is a quick entry check; native validation still decides the supported geometry, incidence, resource bounds and numeric validity. A tool that opens may refuse an unsupported parameter/domain without changing the document. Fitting and spring results retain their original residuals and approximate-status reports; the gallery makes no new exactness or regularity claims.

Original expert controls are retained. Tools mounted before the gallery are discovered automatically; new independently mounted tools should integrate at that same initialization stage. The optional Coxeter builder itself belongs to another package. Electron execution and native dialogs remain the lead's desktop qualification.

## Verification

- `node --test tests/construct-gallery.test.mjs`: 12 DOM-stub tests for search, storage, node/handler preservation, focused panes, availability, help, Expert tags, optional builder, palette access and smoke reveal.
- Related Node suites: discoverability, product-polish, second-polish, user-guide, welcome, renderer-contract, construction-workflow and history-workflow (132 passing including the new suite).
- `node --test tests/guide-mounted.test.mjs`: 1 passing mounted browser test with the real JSON-lines engine.
- `python -m pytest tests/test_construction_finalization.py tests/test_w12_constructions.py -q -p no:cacheprovider`: 105 passing tests of the reused native construction paths.
- `node scripts/discoverability-browser-smoke.mjs`: 21 passing assertions, including construction/history and project validation through the real native engine.
- `npx.cmd vite build --configLoader native`; renderer browser review at 1280px checks gallery/pane layout, existing control ownership, nested reveal and palette access. No Electron launch is required.

The broader `scripts/welcome-browser-smoke.mjs` completes all six walkthroughs (including the gallery's dual construction/Undo/Redo), then times out at its line 45 project-open status-text wait. The same timeout reproduces when the gallery mount/import/sync are removed through a temporary Vite transform. This downstream status check is outside this package; it is not reported as passing.
