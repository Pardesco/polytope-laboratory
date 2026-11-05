# Precision wording (V5 UI pass)

Analysis → Overview shows `Symmetry: B4, order 384` for a tesseract. Known
orders come from recognized group names in regular/uniform catalog metadata,
with matching source entity counts. The label describes the mathematical catalog
family, not an exact certificate for stored coordinates. Unknown groups, changed
constructions and unlabelled imports use `Detected symmetry order … (numerical
check)` only after complete, full-orientation detection and verified closure.
A conflicting complete detection takes precedence over the catalog order.
Unsupported group names fall back to detection; no group is inferred from counts.

`#analysis-overview-method` (“How this was computed”) explains the distinction,
including numerical tolerance and maximum normalized vertex residual when available.

Advanced → Checks starts with `#validation-summary`: “Checks passed. Coordinates
are double-precision floating point.” Failed checks and warnings stay visible.
`#precision-details` (“Precision details”) holds float `#dimension-badge` /
`#numeric-badge` metadata, numerical contract/import notes and the scoped
certificate explanation. Rational-exact models show the original RATIONAL badge
above that collapsed disclosure. `#evidence` retains the full validation JSON
under the independently collapsed `#validation-details` summary. Repeated generic precision prose is merged;
the detailed tolerance/domain information remains. Existing control IDs, handlers
and smoke reveal behavior are retained. Starting a check clears the previous raw
receipt so a different model cannot display stale evidence. Disclosure state
survives validation updates; it is a presentation preference, not a history edit.

Export → `#export-goal-geometry` is “Export model data”, with “Coordinates and
connections. OFF / JSON, full double precision”. Ctrl+K uses the same title.
OFF writes 17 significant digits (`engine/formats.py`); JSON uses Python’s
round-trippable float encoding. Tests compare parsed coordinates directly.
Without unit conversion JSON retains supplied rational coordinates/certificates;
OFF stores numerical coordinates. Unit conversion drops exact guarantees.
The measurements table explicitly describes numerically checked symmetry types.

The UI-wide `exact` string audit found scoped rational hull/dual/section workflows,
exact FAC supplied-coordinate predicates, and deterministic frame-time statements.
Those remain valid in their stated domains. Removed the ambiguous “exact saved
poses” animation claim. No engine arithmetic or construction/history changed.

Verification:

- `node --test --test-concurrency 1 tests/precision-wording.test.mjs tests/analysis-overview.test.mjs tests/export-goals.test.mjs tests/nets-flow.test.mjs tests/information-panel.test.mjs tests/discoverability.test.mjs tests/second-polish.test.mjs tests/product-polish.test.mjs tests/ux-integration.test.mjs tests/renderer-contract.test.mjs` — 79 passed.
- `node --test tests/animation-control-recovery.test.mjs tests/media-export-controls.test.mjs tests/animation-w29.test.mjs` — 22 passed (101 Node tests total).
- `python -m pytest tests/test_precision_exports.py tests/test_export_options.py tests/test_information_panel.py -q -p no:cacheprovider` — 24 passed.
- `npx.cmd vite build --configLoader native` — passed; existing bundle-size and mixed-import warnings.

Original desktop captures: `../../shots/uipass/02-inspector-analysis.png`,
`05-inspector-evidence.png`, `08-export.png`. Browser-mounted after captures:
`artifacts/v5-credibility/analysis-advanced.png`, `precision-details.png`, and
the existing export workflow’s `artifacts/u14-export-goals/chooser.png`.
These exercise real renderer modules/native models; Electron was not launched.
The lead should verify the merged desktop layout with V8’s global typography tokens.
