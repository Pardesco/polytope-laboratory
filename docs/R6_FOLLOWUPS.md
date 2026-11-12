# Round 6 follow-ups

## Shape builder

Open **Construct → Shape builder** (`open-coxeter-builder`), choose a family
such as **F4** (`coxeter-builder-family-F4`), and ring diagram nodes
(`coxeter-builder-node-0` … `-3`). Finishing startup element-type classification
now preserves the open panel, diagram, pending/completed preview and Open action.
Previously its color refresh called `displayBase`, which closed every builder.

The builder now retains its opening source-state/model identities. Same-source
display refreshes only synchronize that owner. Navigation/source replacement,
Close (`coxeter-builder-close`), Cancel and export still invalidate previews;
Open as model (`coxeter-builder-open`) keeps existing recipe/history guards.
Builder choices remain session-local unsaved previews until adopted.

## Whole-cell net

With a Tesseract, open **Nets → Unfold Tesseract's cells → Generate / reset
cell net** (`cell-net-build`). Starting from a single viewport now generates
the eight-cell arrangement in the split viewport, including hidden test mode.
Summary/checks remain `cell-net-summary` / `cell-net-checks`.

The baseline refusal was genuine: `refreshDerived` requested split layout, then
`CellNetEditor.evaluate` captured the full expression owner. The later
ResizeObserver resized/refitted the source camera and persisted `view.camera`,
so the unchanged ownership guard correctly refused the result. The mounted
regression reproduced this specifically in hidden mode, recording only that
camera change. The editor now asks the app to resize both viewers synchronously
before owner capture; the observer's subsequent identical-size resize cannot
perform that automatic refit again. Camera/source/view/units/notes/history edits
after capture still refuse publication. No ownership comparison was removed.
Existing native layout history and project persistence are unchanged.

Geometry remains approximate float64. Intact cells and native rigidity/join
residuals retain their existing definitions; intersections between arranged
cells are ignored. No engine operation, dependency, schema or exactness claim
was added.

## Proposed lead-owned documentation

[Architecture replacements](proposed/ARCHITECTURE.md) identify the affected
paragraphs and replacement text. [Build status](proposed/BUILD_STATUS.md)
replaces the stale current-status narrative while preserving historical release
receipts as history. Each includes a change list. Lead-owned original documents
and parity ledgers were not edited; proposals need reconciliation with other
Round 6 work before adoption.

## Verification

**140 Python tests passed**:

```powershell
python -m pytest tests/test_coxeter_builder.py tests/test_cell_nets.py tests/test_generalized_cell_nets.py tests/test_concave_cell_nets.py -q -p no:cacheprovider
```

**173 distinct Node tests passed** (135 focused + 38 shared-harness consumers):

```powershell
node --test --test-concurrency 1 tests/r6-followups-mounted.test.mjs tests/coxeter-builder.test.mjs tests/generalized-cell-net-editor.test.mjs tests/r5-polish.test.mjs tests/nets-flow.test.mjs tests/expression-entry.test.mjs tests/net-generation-history.test.mjs tests/net-content-ownership.test.mjs tests/element-types.test.mjs tests/derived-view-controls.test.mjs tests/navigation-display.test.mjs tests/engine-op-allowlist.test.cjs tests/smoke-compat-mounted.test.mjs
node --test --test-concurrency 1 tests/element-visibility.test.mjs tests/linked-selection.test.mjs tests/symmetry-orientation.test.mjs tests/viewer-ux.test.mjs
npx.cmd vite build --configLoader native
```

The build passed (358 modules); existing chunk-size/mixed-import and Node module
type warnings remain. `git diff --check` passed. The new mounted test uses
Chromium and real JSON-lines Python, with startup classification deliberately
held until after diagram editing; it also checks normal Expert-off and hidden
4D generation, saved native layout/history and a following Cube face net.
The shared CPU harness now supplies the builder Close stub when its automatic
sync discovery includes that control. New mounted tests are in `test:features`.

The original `scripts/nets-flow-browser-smoke.mjs` no longer stalls at its 4D
step. Its first broad run timed out later at Cube face generation (line 60).
A temporary diagnostic rerun completed the 4D/3D nets, packing, DXF, print and
save steps, then stopped at line 70 because `#advanced-checks h2` matches both
Checks and nested Model information. That broad script is **not counted as
passing**; its later selector/timing issues are follow-ups. The diagnostic copy
was removed. No Electron launch or current packaged/printer qualification was
attempted.
