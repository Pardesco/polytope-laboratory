# Second product polish pass (W52)

This pass keeps existing geometry operations, source ownership, history and
project schemas. No new construction or export domain is added.

- Analysis now places summary → Element types → Measurements by element type
  → Related → 4D compounds / scaliforms. Existing controls and handlers move
  intact. Construct retains Modify / Fit & refine / Facet & stellate / Create;
  Uniform compounds remains under Create, with polygon options collapsed.
- Incidence-cut names retain the source and the edge fraction (except midpoint
  rectification). Block names include dimensions/subdivisions; grids identify
  triangle/hexagon boundary, subdivisions and fold angle; twisted tori identify
  arm-step twist; Waterman balls identify lattice, squared radius and origin.
  Existing UC index/angle names are retained. Names describe supplied numerical
  constructions, without asserting a familiar uniform identity or exact result.
- Incidence, UC, basic generator, Waterman, stereo and measurement controls
  explain disabled states through the existing tooltip/assistive/palette pattern.
  Measurement and vertex-link outputs are live status regions.
- Every named later disclosure has an explicit Guide mapping. Shelf disclosures
  receive the existing keyboard-reachable `?` help buttons. New task topics cover
  UC compounds, 4D relationships, native star inventories, media export and
  presentation; all seven later feature notes are bundled offline. Export options
  opens media help. PNG and animation instructions reflect current size/format
  labels. See the mapping table in `W37_GUIDE.md`.
- Measurement-table, literal vertex-link and presentation preparation messages
  use `createStatus.defer` (400 ms); completion/cancellation retires their timers.
  Native jobs, geometry export preview and element classification already defer
  progress and retain their existing paths.

Click through: `information-panel` / `information-refresh`,
`incidence-truncation-settings` / `preview-incidence-cut`,
`uniform-compound-settings` / `uc-create` / `uc-apply`,
`basic-solid-settings` / `basic-generate`, `waterman-settings`,
`polychoron-relationships` / `polychoron-check-links`, and workspace
`presentation-settings` / `presentation-start` / `presentation-record`.
Ctrl+K indexes the live primary controls; the shortcut action index links these
tasks. Help returns focus through existing dialog behavior; the app's global
focus-intent restore is unchanged.

Tests: `tests/second-polish.test.mjs` checks group order, context mapping,
disabled reasons, 400 ms timing and cancellation. `tests/test_second_polish.py`
checks actual native names, incidence history replay and generator Save/Open.
Mounted `guide-mounted.test.mjs` checks order, collapsed options, live primary
command discovery, offline notes and focus return from inspector/shelf help.
Presentation preparation timing is covered in `showcase-controls.test.mjs`.
Stale baseline assertions now recognize the 4D compound family; export/printing
test extraction ends before the later presentation initialization, retaining
their original ownership assertions.

Electron is not launched. Native dialogs, actual fullscreen transitions and
screen-reader behavior remain desktop qualification. Geometry limits and
numerical residuals are unchanged; detailed technical evidence remains collapsed.
Final verification:

- `npm.cmd run test:features:run`: **2,811 passed, 0 failed**; both preceding
  independent face-fill scripts also passed. Log: `artifacts/w52-features-final.log`.
- `python -m pytest tests/test_second_polish.py tests/test_generator_options.py
  tests/test_incidence_truncation.py tests/test_generalized_4d_constructions.py
  tests/test_waterman.py tests/test_uniform_compounds.py
  tests/test_information_panel.py tests/test_product_polish.py -q -p no:cacheprovider`:
  **403 passed**. Log: `artifacts/w52-python-final.log`.
- Mounted Guide/browser check: **1 passed**, included in the full suite and also
  run independently (`artifacts/w52-mounted-final.log`).
- `npx.cmd vite build --configLoader native`: passed, existing large-chunk
  advisory. `git diff --check`: passed.

File inventory (all changes remain uncommitted):

- Added: `engine/polish_names.py`, `ui/analysis-order.mjs`,
  `ui/late-feature-guide.mjs`, `tests/second-polish.test.mjs`,
  `tests/test_second_polish.py`, this note.
- Engine: `basic_solids.py`, `incidence_truncation.py`,
  `incidence_truncation4d.py`, `twisted_torus.py`, `waterman.py`.
- UI: `basic-solid-controls.mjs`, `discoverability-controls.mjs`,
  `guide-action-index.mjs`, `guide-documents.mjs`, `guide-reference-index.mjs`,
  `guide-refresh.mjs`, `incidence-truncation-controls.mjs`,
  `information-panel.mjs`, `inspector-layout.mjs`, `media-export-options.mjs`,
  `polychoron-relationships.mjs`, `showcase-controls.mjs`, `stereo-controls.mjs`,
  `uniform-compound-controls.mjs`, `user-guide.mjs`, `waterman-controls.mjs`.
- Existing tests: `add-dual-controls.test.mjs`, `derived-publication.test.mjs`,
  `guide-mounted.test.mjs`, `net-print-session.test.mjs`,
  `showcase-controls.test.mjs`. Also `docs/W37_GUIDE.md` and `package.json`.
