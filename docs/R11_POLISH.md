# R11 polish: R10 review follow-ups

Implements the four R10 UX follow-ups. No engine mathematics, operation names, catalog entries, project schema, dependencies, or versions change.

## Click-through and verification

| Item | User-facing result and location | Verification |
| --- | --- | --- |
| Builder identity | Library **Build from symmetry** (`library-build-symmetry`) / Construct builder (`open-coxeter-builder`). The main `model-name` heading says **Symmetry preview** while geometry is previewed; document tabs retain their titles. Closing restores the heading. `coxeter-builder-enter` names the same action as `coxeter-builder-open`: **Replace current model**, or **Open in new tab** in an empty workspace. | Builder unit and mounted tests; existing keyboard, ring accessibility, family and small-window checks retained. Smoke's heading assertion updated. |
| Builder continuity | Replacement retains the preview's camera direction, up vector, intrinsic rotation and projection. Its fit preserves apparent pixel size where space permits, while fitting safely into a smaller destination. The resulting camera/pose lives in the new history state's view, so Redo restores it. Document appearance settings still apply; a changed appearance produces one status message. | Native Python + Chromium replacement test measures projected width/height within 1% and camera direction within `1e-10`, checks Undo/Redo, heading restoration, unchanged tab identity, and appearance notice. Unit tests cover fit scaling and pose persistence. |
| Sections | Construct **Cross-section** (`open-cross-section`). `slice-feedback` reports the evaluated plane, e.g. **Section updated · W axis at 0.25**. Slider input immediately shows **Updating…**; unapplied expression edits say **Changes pending**. Axis/custom-normal labels come from the returned plane, not current draft inputs. `promote` now says **Open section in new tab**, matching its existing destination. | Native mounted test checks W/X directions, expression offset, rapid input coalescing, pending text, result labels, and document-count growth on promotion. Unit tests cover empty/custom planes and queued-result freshness. |
| Split framing | Both section panes refit on opening split view, including reopening it through View options. The `direct-4d-gizmo` is docked in reserved space below the source canvas in split views; its former overlay inset is excluded from fitting when it is outside the canvas. Net opening refits the source without changing its orientation. | Mounted section test checks both fit calls, repeated split opening, and non-overlapping canvas/dock bounds. Mounted net test observes source fitting at the narrower pane width. Camera fits are saved in view state. |
| Nets | Inspector **Nets**: `nets-go-1/2/3` track selection, focus, scrolling, paper preview, and print actions. `net-pack` (**Preview on paper**) and `net-print` activate **3 Print**. `nets-result-summary` appears beside the net; redundant inspector summaries remain hidden with their original IDs/data intact. Paper mode keeps its page caption. Label-size warnings remain available. | Net unit and native mounted tests check Print state, guarded printing, summary placement/visibility, physical paper captions at 1280/1600 widths, overlaps, and adjustment navigation. Refit runs before native source ownership is captured, preventing camera changes from invalidating generation. |
| Status lifetime | Transient workflow completions clear on inspector/document/construct/net-step switches, derived-mode changes, and model-heading replacement. Errors and save notices retain their existing lifetime. | Friendly-message unit tests cover workflow changes, model observer, retained errors/save notices, and appearance notice. Native builder test switches away from a **Corner cut ready** status. |

Section directions are intrinsic source coordinates. Custom normals are normalized for display; plane labels use six significant digits without changing computed geometry or saved values. Builder continuity concerns geometry and pose; document appearance is deliberately retained and explained.

## Files

- UI: `ui/coxeter-builder.mjs`, `ui/section-toolbar.mjs`, `ui/section-toolbar.css`, `ui/nets-flow.mjs`, `ui/nets-flow.css`, `ui/net-editor.js`, `ui/friendly-messages.mjs`.
- Shared refit hooks only: `ui/app/workspace-render.mjs` (two additive lines).
- Extended existing tests: `coxeter-builder`, `coxeter-builder-mounted`, `section-toolbar`, `section-toolbar-mounted`, `nets-flow`, `nets-ux`, and `friendly-messages` under `tests/`.
- Label-only smoke correction: `scripts/coxeter-builder-browser-smoke.mjs`.

## Checks

- Focused suites above plus `tests/app-modules.test.mjs`: **86 tests passed**.
- Affected regression suites: **187 tests passed** across derived controls/publication, workspace numeric controls, net history/content/drag/export/print/source/presentation/fabrication, canvas overlays/framing, section viewer/source content, and mounted section choices (including save/reopen and native refusals).
- `npx.cmd vite build --configLoader native`: passed (400 modules). Existing bundle-size and mixed static/dynamic Viewer import warnings remain.
- Prettier check and `git diff --check`: passed.
- Native mounted screenshots: `artifacts/sections-ux/cross-section-4d.png`, `artifacts/nets-ux/paper-1280.png`, `paper-1600.png`, and `overlaps.png`.

No standalone pytest suite was needed: engine code is unchanged, and the mounted tests invoke the actual JSON-lines Python engine. Electron and the OS print dialog were not launched; packaged desktop QA remains with the lead. The expanded builder smoke script was not run; its changed label is exercised by the mounted tests.

## Integration notes

Retain these two calls immediately after the primary `displayBase()` in the Euclidean `renderWorkspace()` path when package E adds document-kind branching:

```js
ctx.coxeterPreviewFrame?.refitReplacement(base, v, displayBase);
ctx.sectionToolbar?.refitLayout(base, ctx.derived);
```

`refitReplacement(viewer, view, display)` consumes the builder's pending preview snapshot once and updates the new view camera/pose. `refitLayout(base, derived)` binds the section viewers and handles split-entry fitting. The section and net layout observers use the existing `views[data-layout]` attribute. Nets wrap the existing editor `prepareLayout()` callbacks so source refits precede native ownership checks.

`FriendlyMessages` accepts the renderer-local `polytope:workflow-status` CustomEvent with a string `detail`; the builder uses it for the one-time appearance notice. No engine operations or IPC hooks are added. All extended Node test filenames are already registered in `test:features`, so package E needs no package.json additions for this slice.
