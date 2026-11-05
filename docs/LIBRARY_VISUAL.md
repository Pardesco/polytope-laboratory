# Visual library browsing (U5)

The Library opens with collection cards above the existing catalog rows when search and family are empty. Each card shows the current matching record count and a representative model. Counts are catalog records, including separately catalogued mirror forms and source copies; overlapping collections do not form a partition. Categories use explicit catalog family labels, without inferring mathematical classification. The 908 source discovery candidates have their own collection.

## Click through

- `library-home` — **Collections**: return home and clear search, dimension, family, validation and property filters.
- `library-collections` — open Collections disclosure; `library-collection-platonic`, `library-collection-regular4`, etc. select a category. `library-breadcrumb` shows the selection; `library-back` returns home.
- `library-show-all` — **Show all models**, above the cards, restores the flat catalog. Existing `catalog`, `.catalog-entry[data-key]`, search syntax, dimension buttons and `library-family` keep their identities and behavior. Search and filters intersect the selected collection.
- `library-view-list` / `library-view-grid` — **List** / **Grid**. List is the startup default, including long results. View and collection are session browsing state, separate from project history and dirty state.
- Hover a row for 300 ms or focus it with the keyboard: `library-item-preview` shows its thumbnail and source vertex/edge/face/cell counts. Escape, blur, scrolling or navigation dismisses it.
- `library-more-filters` — **More filters**, a `data-expert` details disclosure containing the existing validation selector `library-audit-filter` and Geometry properties (`library-properties`). The U2 Expert tools toggle owns expert visibility.
- `library-build-symmetry` — **Build from symmetry**. Hidden when `window.openCoxeterBuilder` is absent; availability is checked at mount, catalog refresh and click. Uses the app's guarded action handling.

## Thumbnail contract

`library-thumbnails.mjs` reuses Welcome's `Viewer` and `featuredView()` rendering path in one offscreen 128 × 128 host at pixel ratio 1. IntersectionObserver queues visible cards; grid rows and focus previews use the same service. A single serialized queue yields to idle time before native reads and rendering. Background reads use a separate silent `NativeJobs` instance and the existing `generate` / library-model IPC. `generate` already belongs to the desktop warm worker operations. Opening a row still uses the original catalog loading/document workflow, including history and project ownership.

Foreground native work, exports, hidden documents and an open Welcome panel suspend previews; foreground activity aborts a pending preview read. Catalog rerenders cancel obsolete requests and prevent late publication into removed slots. Previews never modify the workspace model or create documents. POLYTOPE_TEST_MODE's `startup.hidden` disables thumbnail reads, rendering and cache access. An isolated test can explicitly opt in via `configure({hidden:true,explicit:true})`.

PNG data URLs are cached in IndexedDB (`polytope-library-thumbnails`, up to 256 images), with bounded memory fallback. Keys include model id, a version derived from the full catalog metadata, preview style version and available source hash. Linked files without a source hash use memory only. Bump `THUMBNAIL_STYLE` when changing preview rendering or when geometry changes without a catalog metadata change.

## Limits

The existing 250-row window remains; full search still covers every indexed record. Previews exceeding 4,000 vertices / 8,000 edges / 4,000 faces / 2,000 cells, rejected or unsupported sources, unavailable WebGL and native failures retain a neutral diamond. Rendering uses approximate source coordinates and projected 4D views; images are illustrative, without new exactness or validation claims. Near-miss cards retain their approximate classification. Source counts are metadata, not independently recomputed by a tooltip. Browser checks do not qualify packaged Electron/GPU behavior; the lead should click through the desktop app after merge.

## Verification

`node --test tests/library-visual.test.mjs tests/library-navigation.test.mjs tests/catalog-discovery.test.mjs tests/catalog-loading.test.mjs tests/welcome.test.mjs tests/native-jobs.test.mjs`

`python -m pytest tests/test_library_visual.py tests/test_welcome.py -q -p no:cacheprovider`

`npx.cmd vite build --configLoader native`

The new Node suite covers mounted navigation, query intersection, filter reparenting, optional symmetry integration, focus previews, hidden mode, laziness, serialized generation, versioned caches, cancellation, foreground priority and failure glyphs. The Python suite verifies all twelve explicit representatives through native generation and compares their full incidence counts. A browser harness at 1280 × 800 additionally checked actual WebGL previews, the six regular 4D grid models, focus/Escape, search, back, Show all and the reparented validation filter. No Electron launch was used.
