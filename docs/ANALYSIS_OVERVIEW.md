# Analysis overview (U4)

The Analysis tab starts with a friendly Overview card: name, family, short description, large source counts, and supported facts. Element types remain nearby as compact keyboard-accessible disclosures; Related retains its existing library links. Everything else follows a Details heading, starting with Model measurements and Measurements by element type. Existing control IDs, handlers, history and smoke-helper reveal access are preserved.

## Click-through

- Open Inspector → Analysis (`[data-panel="info"]`). The card is `#analysis-overview`; name, family and prose are `#analysis-overview-name`, `#analysis-overview-family`, `#analysis-overview-description`.
- Counts: `#analysis-overview-vertices`, `-edges`, `-faces`, and (4D only) `-cells`. Facts: `#analysis-overview-facts`.
- `#element-types-vertex`, `-edge`, `-face`, `-cell` are native details disclosures. Existing `#element-type-<kind>-<id>` buttons select the same full element orbits.
- `#analysis-details-heading` precedes `#analysis-measurements` (Model measurements), which wraps the original `#analysis` report. The original `#analysis-details` still preserves its open state.
- `#analysis-type-evidence`, `#polychoron-relationships`, `#generalized-density-controls`, and `#density-section-controls` carry `data-expert`. U2 owns the Expert tools toggle/CSS. Numerical type evidence also carries the attribute. The shared smoke `reveal()` enables the `expert-mode` body class when its target has an expert ancestor, then opens owning details as before.

## Data and definitions

`ui/model-descriptions.json` contains 284 offline descriptions keyed by actual catalog keys: all five Platonic solids, thirteen Archimedean and thirteen Catalan types (including separately keyed mirrors), four Kepler–Poinsot solids, 92 Johnson solids, six regular convex and ten regular star polychora, all 47 non-prismatic convex uniform polychora, all eighteen uniform polyhedral prisms, twenty polygonal prism/antiprism examples, notable compounds, and matching Antiprism source aliases. `python scripts/build-model-descriptions.py` reproducibly combines curated prose with retained face/cell inventories. No user-data junction is used.

Unknown models receive a family/domain description. Constructed states describe the current history action and preceding model; their catalog relatives are suppressed so inherited catalog metadata does not identify a different construction. Generated first states use a recorded construction label where available. Document title edits, navigation, Undo/Redo, model operations and project reopen all use the existing analysis refresh path. The overview introduces no persistent state or engine operations.

Counts refer to source records, not visible/projected elements or deduplicated geometric positions. Cell names and dual/vertex-figure facts reuse explicit Related keys, never count-based recognition. “Every face has N sides” reports only the recorded cycle size; it does not establish regularity. “N cells meet at every edge” counts unique cell ownership of each source edge, only for convex 4D sources, with a 250,000-visit/edge budget. Unsupported/nonuniform cases omit that fact.

Symmetry order comes from the existing source-checked element-type computation only when the full orthogonal search is complete and closure is verified. It is explicitly labeled numerical. Tolerance and normalized vertex residual remain in Numerical symmetry evidence below Details. No approximate result is labeled exact; missing or resource-limited results produce no guessed order. Large models can still have catalog descriptions even when numerical element types are unavailable.

## Verification

- `python -m pytest tests/test_analysis_overview.py -q -p no:cacheprovider`: catalog coverage, inventories, reproducibility.
- `node --test tests/analysis-overview.test.mjs`: DOM-stub rendering, conservative facts, source changes, construction/title updates, intact ordering and real element-type callback.
- Regression run: analysis-overview, second-polish, product-polish, discoverability, element-types, information-panel, library-navigation, polychoron-relationships, renderer-contract, navigation-display, density-section-controls, star-uniform4 tests: **124 passed**.
- Focused Python run including test_analysis_overview, test_library_navigation and test_element_types: **102 passed**.
- `npx.cmd vite build --configLoader native`.
- `node scripts/analysis-overview-browser-smoke.mjs`: **19 assertions passed** with the production renderer and real JSON-lines engine in headless Chromium, 1280/1600px screenshots, native type selection/reveal, construction, Undo/Redo and saved-project reopen. Screenshots: `build/analysis-overview-1280.png`, `build/analysis-overview-1600.png`. No Electron launch.

Limits: catalog descriptions are educational identity labels, not a geometric classification certificate for edited/imported coordinates. Unrecognized catalog sources use conservative family/domain fallback text. Desktop interaction and U2's expert-mode styling remain for lead integration qualification.
