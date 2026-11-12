# Architecture

Polytope Laboratory is a Windows desktop app for building, inspecting and exporting 3D polyhedra and 4D polytopes.
It has three parts: an Electron shell, a browser-style renderer, and a Python geometry engine.

```
┌───────────────────────────── Electron main process (desktop/) ──────────────────────────────┐
│ window, menus, file dialogs, saving, printing, export sessions, engine process pool          │
│                                                                                              │
│   ┌──────── renderer (ui/, sandboxed) ────────┐     JSON lines over stdin/stdout             │
│   │ three.js viewer, inspector panels,        │  ┌──────────────────────────────────────┐   │
│   │ documents + undo history                  │  │ Python engine (engine/server.py)     │   │
│   │      window.polytope.engine(request) ─────┼─▶│ numpy/scipy geometry, one op per job │   │
│   └────────────── preload.cjs ────────────────┘  └──────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## The three processes

**Main process (`desktop/`).** Owns everything that touches the operating system: windows, menus, native dialogs,
reading and writing files, printing, and the engine processes. The renderer can't reach Node or the file system; it
calls a small set of methods that `desktop/preload.cjs` exposes as `window.polytope`.

| File | Role |
| --- | --- |
| `main.cjs` | App lifecycle, window creation, hidden test mode, shutdown |
| `ipc-handlers.cjs` | Every IPC route the renderer may call |
| `engine-allowlist.cjs` | The engine operations the renderer is allowed to request |
| `engine-pool.cjs` | Up to 3 engine processes, a bounded queue, 2-minute timeout, warm reuse for read-only ops |
| `dialogs.cjs`, `menu.cjs` | File choosers and the application menu |
| `project-storage.cjs` | Atomic project saves with a `.bak` copy, plus crash recovery snapshots |
| `animation-export.cjs`, `image-export.cjs`, `geometry-export.cjs`, `net-printing.cjs` | Output sessions |

**Renderer (`ui/`).** Plain ES modules bundled by Vite, drawing with three.js. `ui/app.js` is the entry point; it
composes the modules in `ui/app/`:

| File | Role |
| --- | --- |
| `app/startup.mjs` | Catalog load, the first document, crash recovery |
| `app/history-wiring.mjs` | Document tabs, undo/redo history, open/save |
| `app/panels.mjs` | Builds and mounts the inspector panels |
| `app/catalog-view.mjs` | Library browsing, search and filters |
| `app/export.mjs` | Export, image capture and net printing actions |
| `app/workspace-render.mjs` | Redraws the workspace when the document or view changes |
| `app/context.mjs` | The one shared state object the modules read through |

Feature controls live in their own files (`ui/*-controls.mjs`, `ui/net-editor.js`, `ui/timeline-panel.mjs`, …).
`ui/viewer.js` is the 3D viewer. Theme tokens are in `ui/theme.css`.

**Engine (`engine/`).** A Python process that reads one JSON request per line on stdin and writes one JSON response
per line on stdout:

```
→ {"id": 7, "op": "dual", "model": {...}, "params": {...}}
← {"id": 7, "ok": true, "result": {...}}
← {"id": 7, "ok": false, "error": "message", "type": "GeometryError"}
```

`engine/server.py` dispatches each `op` to a module. Models are plain JSON: `vertices` (coordinates), `edges`,
`faces` (ordered vertex cycles), `cells` (lists of faces, for 4D), plus `metadata`. The main modules:

| Area | Modules |
| --- | --- |
| Convex hulls, validation, measures | `geometry.py`, `measurements.py` |
| Constructions | `operations.py`, `wythoff.py`, `schwarz_wythoff.py`, `chiral.py`, `faceting.py`, `stellation.py` |
| Catalog | `catalog.py`, `generators.py`, `catalog_data/` (hash-pinned, don't reformat) |
| Symmetry | `symmetry.py` |
| Sections | `operations.py` (`section`), `generalized_sections.py`, `filled_sections.py` |
| Nets and printing | `nets.py`, `cell_nets.py`, `net_printing.py` |
| Files | `formats.py` (OFF, projects, exports) |
| Exact arithmetic | `rational.py` (exact hulls for small rational inputs) |

## How a construction runs

1. A control calls `run(op, params, model)` in the renderer.
2. The main process checks the op against the allowlist and hands it to a pool process.
3. The engine computes, validates the result, and replies.
4. The renderer commits the new model as a history step (`commitOperation`). Undo/redo, replay and saved projects all
   use these steps. A result is dropped if the source document changed while it was computing.

Cancel kills the running process or drops the queued request, so the document is never left half-changed.

## Correctness rules

- Approximate results are never labelled exact. Floating-point results report residuals; `rational.py` results carry
  exact coordinates and a certificate that is rechecked on load.
- Unsupported inputs are refused with a message, not approximated silently.
- Catalog entries are checked against independent counts (see `CATALOG_AUDIT_2026-11-05.md`); unverified discovery
  candidates are hidden by default (`CATALOG_DEFAULTS.md`).
- What is and isn't verified is tracked in `GAP_AUDIT_2026-11-10.md` and `conformance/`.

## Running and testing

```
npm install
npm run build                # bundle the renderer with Vite
npm start                    # launch the app
npm run test:features:run    # Node tests (unit + mounted browser tests)
python -m pytest tests -q    # engine tests
npm run test:hidden          # launches the real app off-screen and checks startup
npm run format               # Prettier + Ruff (npm run format:check only checks)
```

Mounted Node tests start Chromium and can time out on a loaded machine; rerun a failing file on its own before
treating it as real. Each `npm run test:<area>` script is an end-to-end smoke of one workflow in the real app.

Adding an engine operation needs three things: the op in `engine/server.py`, its name in
`desktop/engine-allowlist.cjs` (a test enforces this), and a test in `tests/test_<feature>.py`.

## Where else to look

- `CONTRIBUTING.md`: code style and how to propose changes.
- `docs/` feature pages: one per feature, e.g. `TIMELINE.md`, `MEASUREMENTS.md`, `SYMMETRY.md`.
- `docs/history/`: dated design notes and change records, including the earlier version of this page
  (`ARCHITECTURE_NOTES_2026-10.md`), the formatting round (`R9_FORMAT.md`) and the module split (`R9_MODULES.md`).

Built with Electron ([IPC](https://www.electronjs.org/docs/latest/tutorial/ipc),
[context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)), three.js, NumPy and SciPy
([ConvexHull](https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.ConvexHull.html)).
