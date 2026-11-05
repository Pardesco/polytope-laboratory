# Construct, Nets and command vocabulary (V4)

Construct cards lead with mathematical names and explain them in plain language.
Dual describes the source dimension (faces/vertices in 3D, cells/vertices in 4D,
edges/vertices in 2D). Fourteen decorative 24px inline SVG drawings identify tool
families. They use the existing theme colors; no global tokens change.

Available cards remain in the existing task categories. Unavailable cards move
below them into initially closed disclosures, grouped by required dimension or
the live primary action's restriction. The reason appears once in the summary.
Searching includes those cards without automatically opening their groups.
Recent tools retain local storage history but show only usable entries.

Nets leads with the usable type: cell unfolding for a closed 4D shell, face
unfolding for a suitable 3D shell, or paper-surface construction for supported
stars/compounds. The source name heads its card and Generate remains at the top.
Other types and their settings live in the closed **Other net types** group.
**Edge length** retains the same physical-mm scaling: its tooltip identifies
source edge 0, with all other source lengths scaled proportionally.

Ctrl+K indexes mathematical and plain synonyms for the original control IDs and
gallery cards: dual/polar/swap, truncate/cut corners/rectify, stellate/extend face
planes, facet/draw new faces, net/unfold, Coxeter/Wythoff/symmetry and
Schlafli/Schläfli. Search ignores diacritics and preserves the displayed spelling.
Snub search reaches the existing Coxeter builder, whose supported snub choices
are octahedral and icosahedral; it does not imply arbitrary source snubbing.

## Click-through

- Inspector → Construct: `construct-card-gallery-dual` (**Dual**),
  `construct-card-gallery-truncate` (**Truncate / Rectify**),
  `construct-card-stellation-plane-settings` (**Stellate**),
  `construct-card-face-surgery-settings` (**Augment / Excavate**).
- `construct-tool-search`; unavailable disclosures under `construct-unavailable`
  (individual IDs `construct-unavailable-N`, allocated by encountered reason).
- Inspector → Nets: `nets-available-types`; `cell-net-build` (**Generate cell net**),
  `net-rebuild` (**Generate face net**), `net-visible-surface` (**Create paper surface**).
- `nets-other-types` (**Other net types**); `net-length` (**Edge length**).
- Ctrl+K → `command-query`: try “swap faces corners”, “cut corners”, “unfold”,
  “schläfli” and “snub”.

## Validation and limits

Original source nodes, handlers and element IDs remain. Native computation,
validation, residual reporting, Undo/Redo and saved net-layout history use the
existing workflows. Availability remains a UI preflight and does not certify a
construction or change any native geometry limits. Whole-cell nets remain 3D
previews; paper output requires a suitable 3D source. Disclosure state is local
UI state, not project data. No Electron launch was attempted.

- `node --test tests/tool-vocabulary.test.mjs tests/construct-gallery.test.mjs tests/nets-flow.test.mjs tests/discoverability.test.mjs tests/user-guide.test.mjs tests/app-chrome.test.mjs`: 54 tests pass.
- `npx.cmd vite build --configLoader native`: passes; existing large-chunk and
  mixed static/dynamic viewer-import warnings remain.
- `node scripts/nets-flow-browser-smoke.mjs`: 46 assertions pass using headless
  Chromium and the real JSON-lines engine. Covers source switches, disabled
  groups, search, Generate visibility, 4D/3D/star unfolding, packing, output,
  saved layout and smoke reveal.
- Reviewed captures: `build/v4-construct-4d.png`, `build/v4-construct-3d.png`,
  `build/v4-nets-4d.png`, `build/v4-nets-3d.png` (1280×900). Baseline references:
  `../shots/uipass/03-inspector-construct.png`, `04-inspector-net.png`,
  `06-construct-scrolled.png`. Native desktop visual review remains with the lead.
