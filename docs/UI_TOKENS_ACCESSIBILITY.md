# UI tokens and accessibility (V8, November 2026)

The shared scale lives in `ui/theme.css`: 14px body/controls, 12px secondary
text, 18px panel titles, 36px controls, at least 32px help/close targets,
8px spacing increments and 16px panel padding. `ui/style.css` consumes the
tokens, including the minimum text sizes for existing feature styles. The
palette preserves the previously effective charcoal theme; duplicated palette
overrides have been removed from `style.css`. The Library is 248px wide so
larger collection labels fit. Toolbars wrap within the available workspace.

Inspector tabs, segmented buttons, document tabs and open dock tabs have a
filled selection plus a 2px indicator. Keyboard focus uses a contrasting 2px
outline with an offset, including SVG diagram nodes. Existing IDs, handlers,
expert controls and hidden qualification behavior are preserved.

## Contrast measurements

Ratios use linearized sRGB relative luminance, `(lighter + .05)/(darker + .05)`.
The previous footer secondary pair `#707b87` / `#15171a` measured **4.17:1**;
the viewport secondary pair `#737b84` / `#0f1114` measured **4.41:1**. Both
now use the shared secondary token `#aab4c0`.

| Shared secondary background | Ratio |
| --- | ---: |
| `--bg` (`#111315`) | 8.87:1 |
| `--panel` (`#17191c`) | 8.39:1 |
| `--panel2` (`#202327`) | 7.51:1 |
| `--selection-bg` (`#304757`) | 4.62:1 |

Disabled controls retain their existing disabled treatment. These measurements
cover the shared palette, not mathematical canvas labels or every custom material.

## Click-through

- Library → **Build from symmetry** (`#library-build-symmetry`): the Shape
  builder (`#coxeter-builder`) and sticky header are opaque. Preview body copy
  (`#coxeter-builder-status`) uses the UI font; Coxeter notation keeps monospace.
  Its wider panel accommodates 12px family labels. Vertical scrolling retains
  the sticky **Open as model** button (`#coxeter-builder-open`).
- Header → **Guide** (`#help`): the search label has its own grid row and an 8px
  gap above `#help-search`. **What's new** (`[data-topic="whats-new"]`) starts
  with the November UI pass and retains the October entry and task links.
- Open **Inspector** (`#toggle-inspector`) and keyboard-tab through its tabs.
  Open **Rotation** (`#rotation-settings > summary`): Tab reaches Help, then
  Close; Escape returns to the dock tab. Help/close targets are at least 32px.

With OS/browser `prefers-reduced-motion: reduce`, introductory rotation stays
off, CSS animation/transitions are disabled and symmetry orientation reaches
its final pose in one render. **Rotate** remains available as an explicit action.
The two one-line JavaScript changes in viewport and symmetry controls are needed
because CSS cannot suppress those render-loop actions. Geometry, saved projects
and deliberately requested animation/export timing are unchanged.

## Verification and limits

`tests/design-tokens.test.mjs` checks token values, AA secondary contrast, release
ordering, startup motion and reduced-motion orientation. The mounted companion
uses Vite, headless Chromium and the real JSON-lines Python engine; it checks
1280×800 fit with both sidebars, text sizes across all four inspector tabs, focus, selected tabs, dock keyboard
order/targets, builder font/opacity, Guide spacing and explicit rotation.
Both tests are registered in `test:features`.

The focused Node regression run passed 149 tests across tokens, builder, Guide,
viewport, chrome, direct 4D, presentation, Learn 4D and symmetry orientation.
The final token/browser checks passed all six tests; the production Vite build
passed with its existing bundle-size/dynamic-import warnings.
The focused Python builder/orientation suite passed 133 tests (including dense H4).

```powershell
node --test tests/design-tokens.test.mjs tests/design-tokens-mounted.test.mjs
python -m pytest tests/test_coxeter_builder.py tests/test_symmetry_orientation.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```

Screenshots regenerate in ignored `artifacts/ui-pass-v8/` at 1280×800 and
1600×1000 (default, builder and Guide). Before captures are the approved-plan
screenshots in `../shots/uipass/`, especially 07 and 09. Electron was not launched;
the lead still needs to inspect the merged native app alongside the other UI
packages. No engine or project schema changes were required.
