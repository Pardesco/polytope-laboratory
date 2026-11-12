# R5 polish

The Shape builder preview now fits inside the largest rectangular part of the
primary viewport left uncovered by the builder, with a 16px separation. A separate
preview canvas keeps the rest of the viewport covered. Resizing the window,
inspector or builder recomputes this rectangle and refits the preview. Identical
bounds cause no writes or refits. Closing clears the preview rectangle; the source
document camera, geometry and history remain owned by the existing document.

Open **Construct → Shape builder** (`open-coxeter-builder`), choose **H4**
(`coxeter-builder-family-H4`) and ring all four nodes
(`coxeter-builder-node-0` through `coxeter-builder-node-3`). The dense example has
14,400 vertices. `coxeter-builder-preview` remains the full overlay; the fitted
viewer is inside `coxeter-builder-preview-canvas`. Close with
`coxeter-builder-close`, Escape, or the existing navigation/export paths.

**Help → Learn 4D** already existed in the native menu, and `actions.learn4d`
already registered **Learn 4D** in Ctrl+K. Those paths were retained and verified,
without duplicate actions. Search now also accepts “four dimensions”, “fourth
dimension”, “tutorial”, “lessons” and “beginner”. The existing Welcome card
(`welcome-learn-4d`) and `window.openLearn4D` remain available. The lesson panel
is `learn-4d-panel`, with `learn-4d-close` to exit the temporary learning document.

**Export** (`export`) opens six goal cards (`export-goal-cards`). The existing
collapsed **All formats** disclosure (`export-all-formats`) already collects
the original controls. Reopening now also collects any direct buttons mounted
late at the dialog root: `export-net`, `export-net-pdf` and `confirm-export`.
Their nodes, handlers and disabled-state checks are retained. Choosing a geometry
goal still exposes its applicable primary export action; opening All formats
retains the full original workflow and smoke reveal behavior.

No engine operations, mathematical guarantees, project schema or dependencies
were added. Existing builder geometry uses float64 approximations; its reported
residuals and unsupported-domain refusals are unchanged. Preview fitting protects
against the builder rectangle, not arbitrary unrelated floating windows. Windows
smaller than the supported app layout may leave very little preview space.
An existing startup edge case remains: finishing element-type classification
refreshes the main view and closes a builder opened before that classification
settles. The mounted test waits for classification before opening the builder;
this package leaves document/view publication ownership unchanged.

## Verification

Results: **124 Python tests passed; 104 distinct Node tests passed** (4 new
polish tests, 60 focused existing tests, and 40 related/compatibility tests).
The final standalone polish rerun passed all 4 tests after its startup/resize
readiness checks were corrected. Vite production build and `git diff --check`
passed. Existing Vite chunk-size and mixed-import warnings remain.

- `python -m pytest tests/test_coxeter_builder.py -q -p no:cacheprovider`
- `node --test --test-concurrency=1 tests/r5-polish.test.mjs tests/coxeter-builder.test.mjs tests/export-goals.test.mjs tests/learn-4d.test.mjs tests/discoverability.test.mjs`
- `node --test --test-concurrency=1 tests/app-chrome.test.mjs tests/learn-4d-mounted.test.mjs tests/precision-wording.test.mjs tests/canvas-framing.test.mjs tests/view-camera.test.mjs tests/smoke-compat-mounted.test.mjs tests/engine-op-allowlist.test.cjs`
- `npx.cmd vite build --configLoader native`

The new mounted renderer test uses Chromium and the real JSON-lines Python
engine, never Electron. It checks every projected point of the omnitruncated
H4 preview against its own canvas, verifies no canvas/builder overlap at
1600×1000, 1280×800 and 1024×768, checks camera restoration and unchanged source
history, opens Learn 4D through the native action bridge and Ctrl+K with Expert
mode off, and checks legacy export visibility before/after disclosure and reopen.
Screenshots are written under `artifacts/r5-polish/`. Packaged Electron/native
menu clicking and physical high-DPI desktop qualification remain lead checks.
