# Library rail polish (V7, November 5, 2026)

The Library leads with a ringed three-node Coxeter glyph and **Build from symmetry** (`library-build-symmetry`). Its existing guarded Shape builder callback is preserved, including late installation and hidden qualification behavior. The subtitle is the approved discovery copy; it does not expand the builder's supported mathematical domain.

Search retains `search` and its query handler. `library-search-clear` clears through the same input event and returns keyboard focus to search. `library-result-count` announces the full filtered count with locale formatting and singular/plural labels; the visually hidden `library-count` retains its raw numeric text for existing desktop smokes. Counts include indexed records, including unsupported/unverified records; they do not certify classifications or count just the first 250 displayed results.

The original `link-library` node and native handler move into the app's top-right **More app options** (`app-options`). Collections ends with a quiet `library-link-local` button invoking that same node. Existing smoke `reveal()` can open the relocated button's owning disclosure. No linking capability or native ownership checks were replaced.

The rail owns vertical scrolling. Catalog, expert filters and linked-folder rows no longer create nested scroll areas. Collections retain two equal-height columns at the default 218px rail width, balanced wrapping, 12px secondary labels and visible keyboard focus. Styling is confined to `ui/library-visual.css` and consumes the existing color variables; global design tokens are unchanged.

Rows display the family, e.g. **Convex uniform**, while the redundant `(Miratope source)` suffix moves to native tooltips and focus/hover previews. **Analysis → More model information → Source provenance** shows retained source/provider/classification text. Original catalog families, search metadata, filter values and classification caveats remain intact. No mathematical results, engine operations, history or project format changed.

Validation:

- 138 Node tests passed across library rail/visual/navigation, catalog loading/discovery, app chrome, overview, hidden qualification, discoverability, second polish, startup and UI integration. New `tests/library-rail.test.mjs` is registered in `test:features`.
- `python -m pytest tests/test_library_visual.py tests/test_library_navigation.py -q -p no:cacheprovider`: 91 passed, including native collection representatives.
- `npx.cmd vite build --configLoader native`: passed (existing large-bundle and mixed dynamic/static Viewer import warnings).
- Browser fixture using the real rail modules/CSS and 1,594 native catalog records: 10 checks passed (scroll ownership, two columns/equal unclipped card heights, localized and legacy counts, hero callback, clear/focus, collection navigation, both linking entries, provenance placement).

Before/after and interaction captures are local artifacts under `artifacts/ui-pass-v7/` (01–05). These are renderer-only fixture screenshots with neutral thumbnail placeholders and callback probes. Electron, native dialogs, actual thumbnail rendering and integrated desktop layout still need the lead's desktop click-through. No Electron launch was attempted.
