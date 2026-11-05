# Header and navigation (V3)

The header groups File actions (`new`, `open`, `save`), Edit (`undo`, `redo`)
and an accent Export (`export`). A polytope mark identifies Polytope Laboratory.
Undo/Redo use 32px icon buttons with accessible names and shortcut tooltips.
File actions, Export, Help and Presentation keep readable text labels.

The central `command-search` button looks like a search field and opens the
existing command palette; Ctrl+K still works. Right-side actions are Help
(`help`), Presentation (`presentation`), Full screen (`fullscreen`), the
Library/Inspector toggle group (`toggle-library`, `toggle-inspector`) and
More app options (`app-options-button`). Filled panel toggles include an accent
indicator and retain their existing `aria-pressed` state and handlers.

The bottom dock's `presentation-settings` disclosure is now labeled
**Presentation settings**. It is retained because it contains playlist,
timing, captions, looping and recording controls, rather than only a duplicate
launcher. All existing ids, native disabled fieldsets, handlers, smoke reveal
paths and hidden startup behavior remain intact. No geometry, saved state or
history format changes are needed.

## Sizing and icons

Header text is 14px; keyboard hints are 12px. Standard buttons are 36px high,
utility controls 32px, and keyboard focus has a 2px accent outline. Styling is
scoped in `ui/app-chrome.css` and uses the existing theme colors without changing
global tokens. Full screen becomes an icon at 1500px and below. Below 1200px, decorative icons on
File, Help and panel controls disappear while their text labels remain. The
header is verified on one line at 1024, 1280, 1360, 1440, 1500 and 1600px.
The brand is an icon mark with its accessible label and tooltip; the header
contains no visible product-name text, following the settled product decision.

`ui/icons.mjs` exports `icon(name, {document, size})` and `ICON_NAMES` for reuse.
The default is an 18px inline SVG with a 1.5px current-color stroke. Icons are
decorative (`aria-hidden`, non-focusable); callers provide the control's name.
Unknown icon names throw. The set covers the app mark and all header actions.

## Verification

```powershell
node --test --test-concurrency 1 tests/app-chrome.test.mjs tests/header-navigation.test.mjs tests/discoverability.test.mjs tests/ux-integration.test.mjs tests/guide-mounted.test.mjs tests/showcase-mounted.test.mjs tests/presentation.test.mjs
npx.cmd vite build --configLoader native
```

Mounted tests use Chromium, the actual renderer and Python JSON-lines engine,
with a native-shell bridge shim. They check responsive bounds, keyboard focus,
palette/Help, panel state, fullscreen notifications, settings and Presentation's
frozen workspace across fullscreen resize. Screenshots are regenerated under
`artifacts/header-navigation/after-{1280,1600}[-inspector].png`. Before captures
are the supplied `shots/uipass/01-start-default.png` and
`02-inspector-analysis.png` in the parent project.

Electron was not launched. Native window behavior still needs the lead's desktop
click-through; widths below 1024px and integration with the separate V8 token
package are not qualified here. Geometry computations and numerical guarantees
are unchanged. No new engine op, dependency or persistence field was introduced.
