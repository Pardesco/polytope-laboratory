# R9 modules: where things live

This is a move-only extraction from the formatted Round 9 baseline. Existing UI
element IDs, operation names, catalog keys, handlers and history/publication
contracts are retained. No engine computation or feature domain changed.

## Renderer

`ui/app.js` composes the factories in extraction order, creates the viewers and
shared context, and calls each mounting phase at its original initialization
point. Factory composition does not read the context or mount controls.
The original dependency imports intentionally precede the factory imports,
including bindings now used only in the extracted modules: some dependencies
import styles as side effects, so their evaluation order is retained.

| File | Responsibility |
| --- | --- |
| `ui/app/startup.mjs` | Startup catalog/default-document/recovery flow, recovery timer and rendering clock. |
| `ui/app/history-wiring.mjs` | Document tabs and closure, initial states, document creation, commit/replay/branch publication, serialization/adoption, open/save/recover and history navigation. |
| `ui/app/panels.mjs` | Control constructors, viewer adapters and inspector mounting. Separate mounting phases retain the original order around history, export and catalog setup. |
| `ui/app/catalog-view.mjs` | Catalog discovery/loading, library filters, collections/thumbnails, catalog rows, linked folders and library dialogs. |
| `ui/app/export.mjs` | Geometry export controls, reviewed image capture, net SVG/PDF dialog actions and export goals. |
| `ui/app/workspace-render.mjs` | `renderWorkspace`, base/pose display and display diagnostics, including restoring selection before display. |
| `ui/app/context.mjs` | Creates the one explicit live accessor context from the entry's read/write bindings. |

Mutable project, dirty/revision, derived-result and controller bindings are read
through the context, including after awaits. Stable dependencies are destructured
when functions or mounting phases run; they are not copied during module
evaluation. There are no imports between the extracted renderer modules and no
imports back to the entry.

The entry retains analysis/derived computation, selection helpers, numeric/status
utilities, memory/tour publication and the shared action registry. These
coordinators cross source-ownership and cancellation boundaries; keeping their
existing closure together avoids an additional extraction across those contracts.

UI click-through remains the existing Library (`catalog`, `search`,
`library-family`), Analysis/Construct/Nets/Advanced inspector (`construct-panel`,
`net-panel`), Undo/Redo (`undo`, `redo`) and export actions (`export`, `image`,
`print`, `export-dialog`, `export-net`, `export-net-pdf`).

## Desktop

| File | Responsibility |
| --- | --- |
| `desktop/main.cjs` | Application lifecycle, qualification guards, process/queue ownership, recent-file coordination, window construction and shutdown. |
| `desktop/engine-allowlist.cjs` | Exported `allowed` operation set, with the original members. |
| `desktop/ipc-handlers.cjs` | `registerIPCHandlers(context)`, trusted-main-frame checks, IPC routes, linked-library capabilities and hidden print document preparation. |
| `desktop/dialogs.cjs` | Project/tour/geometry/net/animation dialog actions and file chooser callbacks. Window ownership is resolved when a dialog is requested. |
| `desktop/menu.cjs` | Existing menu template and installation, including command bindings and hidden-mode suppression. |

Qualification guards still run before readiness. At readiness the order remains:
IPC registration and net-print manager initialization, menu installation, main
window creation, then main-window closure/fullscreen/navigation handlers and
document loading. In particular the print cleanup listener is attached only after
the main window exists.

## Source readers and packaging

Source assertions still use `tests/helpers/source-match.mjs`. The new
`app-source.cjs`/`.mjs` helper reads the actual entry and extracted files in
separate AST scopes for assertions that span modules. Function harnesses receive
the same explicit context; all existing behavioral assertions remain. The
allowlist test imports the exported set and scans renderer subdirectories too.

Navigation/annotation profiling reads the composed source and hashes every
renderer module. Existing historical patch scripts and main-only qualification
markers continue to name their original entry. Packaged hidden-runtime preflight
also checks all four extracted desktop modules, so matching only the entry is
insufficient. Existing recursive source-archive roots include `ui/app`; the
desktop packaging glob explicitly includes nested files. Vite bundles the renderer
modules into the normal application assets.

## Line counts

Counts include blank lines and are measured after formatting.

| File | Before | After |
| --- | ---: | ---: |
| `ui/app.js` | 4,260 | 1,850 |
| `ui/app/startup.mjs` | 0 | 159 |
| `ui/app/history-wiring.mjs` | 0 | 389 |
| `ui/app/panels.mjs` | 0 | 2,195 |
| `ui/app/catalog-view.mjs` | 0 | 492 |
| `ui/app/export.mjs` | 0 | 165 |
| `ui/app/workspace-render.mjs` | 0 | 325 |
| `ui/app/context.mjs` | 0 | 6 |
| `desktop/main.cjs` | 1,186 | 473 |
| `desktop/engine-allowlist.cjs` | 0 | 137 |
| `desktop/ipc-handlers.cjs` | 0 | 470 |
| `desktop/dialogs.cjs` | 0 | 166 |
| `desktop/menu.cjs` | 0 | 110 |

## Verification

- A local AST comparison checked all 37 moved renderer function declarations
  against the baseline, removing only explicit context linkage: identical bodies.
- Vite production build passes; the existing large-chunk warning remains.
- Production CSS retains the baseline asset hash (`index-cS7-q3Jy.css`).
- The desktop audit preserved all 143 allowlist members and the sequence of all
  52 IPC registrations.
- `npm.cmd run test:features:run`: both face-fill scripts and all 3,638 Node
  tests pass (zero failures, skips or mounted timeouts in the final run).
- `python -m pytest tests -q -p no:cacheprovider`: 8,370 passed, 96 subtests
  passed, one skipped.
- The focused factory/import-order, allowlist and hidden-startup checks also pass
  (37 tests). Source-reader fixtures were migrated before the final full run;
  existing assertions were retained.
- `git diff --check` passes.
- The lead must run the real hidden Electron launch; this worker did not launch
  Electron or qualify a packaged release.

The worktree's three pre-existing `development/*.mjs` edits were left untouched.
