# UX round integration (U12)

The merged UX tools keep their existing IDs, engine operations, project format
and history. This package fixes their shared reveal, help and display boundaries.

- Smoke `reveal()` uses the target's owner document and Event constructor, enables
  expert presentation, dispatches `app-chrome-reveal`, opens the owning Construct
  pane and expands only ancestor disclosures. A summary retains its normal toggle.
  Missing optional gallery hooks and DOM fixtures without browser globals work.
- Live-slider construction controls synchronize on full display updates and notes
  edits, rather than every pose frame. Annotation and diagnostic updates still run
  on pose displays; native source/publication checks remain intact.
- Escape in an open dialog or presentation belongs to that overlay. Chrome and
  viewport dismissal leave underlying drawers open, preserving help-button focus
  return and the presentation shelf layout. Ordinary Escape/outside dismissal stays
  available once the overlay closes.
- New Analysis, element-type, Nets and Advanced disclosures have explicit offline
  Guide mappings. Advanced numerical help explains full-group closure, restricted
  subgroup scope and approximate coordinates.

## Click-through

1. Analysis: open **Model measurements** (`analysis-measurements`) and its help.
   Element-type disclosures retain `element-types-vertex`, `-edge`, `-face`, `-cell`.
2. Enable **Show expert tools** (`expert-tools`). Advanced **Symmetry checks**
   (`advanced-symmetry-checks`) and **Exact arithmetic**
   (`advanced-exact-arithmetic`) open numerical help.
3. Nets: **Visible surface options** (`nets-surface-options`) and **Numbering and
   assembly sheet** (`nets-numbering-options`) open their task-specific help.
4. Open **Presentation** (`presentation-settings`), activate its header
   `.chrome-drawer-help`, then Escape. The drawer stays open and focus returns to
   its help button. F5 then Escape also restores the open drawer.
5. Rotate the model, or Shift-drag a 4D model. Pose frames update geometry and
   annotations without synchronizing the construction panels.

## Fixture changes

Document-field tests now supply the optional live-slider controller. Actual-app
pose tests supply the optional Coxeter builder, and the startup analysis prelude
supplies the merged Analysis overview. All original dirty/revision,
source ownership and annotation assertions remain.

The mounted Guide test now asserts the intentional Analysis order (Overview,
element types, Related, Details, Model measurements, measurement table), verifies
the original `analysis` node is inside Model measurements, and exercises the new
drawer header help instead of the old summary help. The Nets mount test asserts
ordering rather than adjacency, allowing live-slider initialization between legacy
grouping and Nets flow. No assertions were deleted or disabled.

The older product-polish timer test now expects U11's immediate **Finding element
types…** placeholder, while still checking the 400 ms detailed-progress delay,
cancellation and rejection of a late result.

## Verification

The focused integration suites, mounted Guide and presentation tests, full Node
feature suite, full Python suite and production Vite build are the qualification
checks. `tests/ux-integration.test.mjs` is registered in `test:features`; it covers
combined reveal and the actual viewport dismissal handlers with DOM stubs.

Final receipts:

- `node scripts/run-test-features.cjs`: **3,016 passed**, zero failures/skips;
  both preceding face-fill scripts also passed.
- `python -m pytest tests -q -p no:cacheprovider`: **5,846 passed**, **96 subtests
  passed**, **1 skipped**, in 1,172.74 seconds. No engine changes were needed.
- `npx.cmd vite build --configLoader native`: passed.
- `git -c safe.directory=* diff --check`: passed.

Electron and native dialogs were not launched. No geometry algorithm or numerical
accuracy claim changes. Existing Vite chunk-size and mixed-import warnings remain.

## Files

Product changes: `ui/app.js`, `ui/app-chrome.mjs`, `ui/viewport-controls.mjs`,
`ui/guide-refresh.mjs`, `ui/user-guide.mjs`, `scripts/smoke-helpers.cjs`.

Updated fixtures/regressions: `tests/app-chrome.test.mjs`,
`tests/document-field-edits.test.mjs`, `tests/guide-mounted.test.mjs`,
`tests/nets-flow.test.mjs`, `tests/pose-element-content.test.mjs`,
`tests/product-polish.test.mjs`, `tests/startup-performance.test.mjs`.

Added: `tests/ux-integration.test.mjs`, `docs/UX_INTEGRATION.md`.
`package.json` registers the new Node test.
