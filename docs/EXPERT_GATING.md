# Expert gating and focused workflows

With Expert tools off (the default), Library keeps search, dimension/family filters, discovery-candidate opt-in, Collections/List/Grid and catalog browsing. Four collapsed expert panels follow `#catalog`: `#library-symmetry-evidence`, `#library-corpus`, `#library-classification` and `#library-u-dual-obstructions`. Enable them with **More → Show expert tools** (`#expert-tools`). Their original controls, lazy loading and help remain intact. `scripts/smoke-helpers.cjs` reveal/autoReveal enables expert mode and opens their owning disclosures.

Construct shows ten common cards: Dual, Truncate / Rectify, Expand / Runcinate, Scale / Reflect / Extrude, Compound with dual, Convex hull, Prism / Polygon / Block, Antiprism / Antiduoprism, Product / Duoprism and Coxeter / Wythoff / Snub. Remaining cards are in the closed **More tools** disclosure (`#construct-more-tools`), including specialist tools and duplicate Wythoff settings. Expert mode restores the full category list. **Find a tool** (`#construct-tool-search`) searches all mounted tools and displays matching cards, including unavailable cards with their existing restrictions. Recent shortcuts include common tools only while Expert is off. Card and action IDs are unchanged; controls still own their original history and validation behavior.

The duplicate legacy builder launcher (`#open-coxeter-builder`) lives in the Wythoff settings pane; the common builder card and Library hero remain the primary launchers. The hero subtitle now says “Coxeter diagrams · choose symmetry and rings” rather than claiming coverage of every uniform polytope.

The gallery does not replace the Construct panel or reserve its top position. An additional registered tool can opt into the common gallery using `common: true`; independent cards can mount before the gallery. This leaves the parallel Cross-section workflow free to mount near the top.

Opening Build from symmetry, a split section view (surface, ordinary-cell or section-evidence), or the Nets inspector tab consumes the shared canvas hint queue. Tips and Explore stay dismissed for that renderer session, including subsequent model opens and reloads. The session flag is `polytope.canvas.focused-workflow.v1`; it does not permanently disable Explore in future sessions. If session storage is unavailable, the suppression lasts for the current renderer lifetime. An unused section mode in the default single viewport does not suppress hints.

Typography changes use existing theme tokens, without palette changes:

- Toolbar buttons/selects, View options and dock More increase from 11px to `--font-secondary` (12px); dock More uses `--muted`.
- Library status/results/discovery instructions and Construct prose/status outputs use `--font-ui`, replacing inherited monospace output styling. Numeric entry fields and code blocks retain their own styling.
- Tip prose explicitly uses `--font-ui`; secondary card descriptions, unavailable explanations and More options use `--muted`. The existing token contrast test checks WCAG AA (4.5:1) on normal and selected surfaces.

No engine operations, geometry domains, project format or mathematical claims change.

## Verification

`tests/expert-gating.test.mjs` exercises ordinary startup with the native JSON-lines engine in headless Chromium: hidden/ordered evidence panels, autoReveal, every mounted specialist search result, expert toggling, More tools help, readable typography and all three session dismissal paths through reload. `tests/canvas-overlays.test.mjs` also checks default dormant sections, denied storage and fresh sessions. Existing Library, Construct, chrome, Guide, symmetry/classification/U-dual evidence, discovery, common workflow and layout tests cover integration. Electron launch is left to the lead's desktop checks.

Verified: 185/185 affected Node tests passed in the combined run; 46/46 focused tests passed again after relocating the legacy builder launcher and correcting the hero subtitle. Vite production build and Prettier checks passed. Logs: `artifacts/r10-chrome-tests.log` and `artifacts/r10-chrome-final-focused.log` (generated, untracked).

## File inventory

- UI: `ui/library-collections.mjs`; `ui/library-visual.mjs` and `.css`; `ui/construct-gallery.mjs` and `.css`; `ui/app-chrome.mjs` and `.css`; `ui/tips.mjs` and `.css`; `ui/canvas-overlays.mjs`; `ui/guide-refresh.mjs`.
- Added: `tests/expert-gating.test.mjs`, `docs/EXPERT_GATING.md`.
- Updated tests: `canvas-overlays`, `classification-qualification-mounted`, `common-workflows-mounted`, `construct-gallery`, `guide-mounted`, `integration-polish-mounted`, `library-rail`, `symmetry-evidence-controls`, `u-dual-obstructions-mounted` (all `tests/<name>.test.mjs`).
- Registration: `package.json` (`test:features`).
