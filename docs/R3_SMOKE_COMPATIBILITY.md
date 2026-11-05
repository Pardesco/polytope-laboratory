# Round 3 hidden-smoke compatibility audit

All 82 `scripts/*-smoke.cjs` files were inspected for round-3 UI selectors,
text/role/placeholder locators, expected labels, disclosure visibility, header
branding, validation receipts, numeric badges, moved Appearance controls and
command access. The static pass read 8,756 lines and cross-checked literal IDs
against renderer sources. Generated IDs were checked in the mounted renderer.
This is a code/mounted audit; no Electron smoke was launched.

## Decisions

| Contract | Resolution |
| --- | --- |
| `workspace-ui-smoke.cjs`: no visible product name | App fixed: remove `.chrome-brand-name` node; retain icon mark, title and aria-label. |
| `core-experience-smoke.cjs`, `report-startup-workflow-smoke.cjs`: `#evidence pre` | App fixed: full receipt remains under `#evidence #validation-details`; collapsed initially, readable on demand, one receipt after revalidation, stale reports cleared. Both smokes unchanged. |
| `desktop-smoke.cjs`: RATIONAL | App fixed: reparent the existing numeric context above collapsed Precision details for rational-exact models; update synchronously on navigation/construction; return it inside Precision details for float sources. Smoke unchanged. |
| `ui-design-smoke.cjs`: float badges always visible | Smoke updated: open Precision details before checking numeric/dimension badges, then close it. This matches approved V5 plain-confidence wording and collapsed precision details. Checks passed stays visible. |
| Presentation settings / Export model data / Search shapes / Star truncation / Other net types | Original IDs retained. No old text/placeholder-based smoke locator depended on these renamed labels. Mounted test checks current labels and command search. |
| Appearance side sheet | `surface-settings`, `.settings-body`, material/lighting/expert controls retain their ownership and IDs. Dock-open/close and resized canvas checked in mounted tests. Existing dynamic reveal helpers remain in use. No smoke selector change. |
| `command-search` | Original button ID/action retained; accessible header control opens existing command palette. Mounted test searches Star truncation. |
| Other role/text locators | Audit/Verify/Remove library actions, linked catalog entry names, multi-view Maximize/Restore and projective modal Fit clip box/Save PNG/Set clipping distance remain unchanged. |
| Generated IDs | `plane-0`, `plane-2`, `metadata-author`, `metadata-title`, `open-dual-morph-settings`, and Construct card/back IDs verified in mounted renderer. |

`tests/smoke-compat-mounted.test.mjs` uses the real JSON-lines Python engine and
holds completed native replies to reproduce the report-startup ownership cases.
It covers the reported failures and changed/moved control contracts. Header and
precision-wording mounted tests provide additional normal-mode coverage.

Changed app files: `ui/index.html`, `ui/app.js`, `ui/precision-evidence.mjs`.
Updated tests: `tests/header-navigation.test.mjs`,
`tests/precision-wording.test.mjs`, and `tests/helpers/navigation-display.mjs`.
The shared CPU navigation harness now supplies the actual precision helper and
its controlled document, preserving the geometry/display checks. Added
`tests/smoke-compat-mounted.test.mjs`, registered in `package.json`.
`docs/HEADER_NAVIGATION.md` and `docs/PRECISION_WORDING.md` describe the corrected
behavior. `scripts/ui-design-smoke.cjs` is the only changed Electron smoke.

Final verification:

- `npm.cmd run test:features:run`: **3,160 passed, 0 failed**, no skips or
  cancellations. Log: `artifacts-smoke-followup-features-final.log`.
- Focused mounted/contract checks: **23 passed**. Navigation/element
  type/visibility regressions: **59 passed**.
- `npx.cmd vite build --configLoader native`: **passed**, exit 0. Existing
  large-chunk and mixed static/dynamic viewer-import warnings remain.
- `node --check scripts/ui-design-smoke.cjs` and `git diff --check`: passed.

## Complete file inventory

Each row is a completed static check. ?References? means it mentions one of the
round-3 control/receipt/badge/header contracts above; other scripts were also
checked for renamed text/role locators and literal UI IDs. No changes were needed
except the explicit `ui-design-smoke.cjs` disclosure update.

| Script in `scripts/` | Round-3 references |
| --- | --- |
| `animated-tours-smoke.cjs` | none |
| `animation-smoke.cjs` | none |
| `animation-tracks-smoke.cjs` | none |
| `augmentation-smoke.cjs` | yes |
| `automatic-faceting-smoke.cjs` | yes |
| `basic-solids-quick-smoke.cjs` | yes |
| `capture-control-smoke.cjs` | none |
| `catalog-workflow-smoke.cjs` | none |
| `cell-attributes-smoke.cjs` | yes |
| `cell-facing-smoke.cjs` | yes |
| `coincident-assembly-quick-smoke.cjs` | yes |
| `construction-families-smoke.cjs` | none |
| `construction-refinement-smoke.cjs` | none |
| `convex-core4d-smoke.cjs` | none |
| `core-experience-smoke.cjs` | yes |
| `crossed-segmentotope-smoke.cjs` | none |
| `density-info-quick-smoke.cjs` | yes |
| `desktop-smoke.cjs` | yes |
| `dual-morph-smoke.cjs` | yes |
| `element-content-smoke.cjs` | yes |
| `empty-workspace-smoke.cjs` | none |
| `entity-picking-smoke.cjs` | yes |
| `entity-presentation-smoke.cjs` | yes |
| `export-workflow-smoke.cjs` | none |
| `expression-entry-smoke.cjs` | none |
| `face-editing-smoke.cjs` | yes |
| `face-placement-smoke.cjs` | none |
| `faceting-diagram-smoke.cjs` | yes |
| `feature-0.23-quick-smoke.cjs` | yes |
| `feature-0.25-quick-smoke.cjs` | yes |
| `feature-0.26-quick-smoke.cjs` | yes |
| `generalized-4d-morph-quick-smoke.cjs` | yes |
| `generalized-fold-quick-smoke.cjs` | yes |
| `guide-quick-smoke.cjs` | yes |
| `hidden-desktop-smoke.cjs` | yes |
| `inspection-features-smoke.cjs` | none |
| `intrinsic-feedback-smoke.cjs` | yes |
| `layer-join-smoke.cjs` | yes |
| `library-audit-smoke.cjs` | yes |
| `linked-library-smoke.cjs` | none |
| `memories-smoke.cjs` | none |
| `morph-content-quick-smoke.cjs` | yes |
| `morph-workflow-smoke.cjs` | none |
| `multi-view-quick-smoke.cjs` | yes |
| `net-reinforcement-smoke.cjs` | yes |
| `net-workflow-smoke.cjs` | yes |
| `perspective4d-smoke.cjs` | yes |
| `polygon-product-smoke.cjs` | yes |
| `portable-launch-smoke.cjs` | none |
| `portable-smoke.cjs` | yes |
| `preview-portable-quick-smoke.cjs` | yes |
| `projection-fit-smoke.cjs` | none |
| `projective-snub-quick-smoke.cjs` | yes |
| `publication-workflow-smoke.cjs` | yes |
| `recipes-smoke.cjs` | none |
| `refraction-measurements-quick-smoke.cjs` | yes |
| `regiment-distance-quick-smoke.cjs` | yes |
| `regular4d-catalog-smoke.cjs` | yes |
| `report-startup-workflow-smoke.cjs` | yes |
| `section-content-quick-smoke.cjs` | yes |
| `section-workflow-smoke.cjs` | none |
| `source-construction-smoke.cjs` | none |
| `source-zonohedron-smoke.cjs` | none |
| `sphere-cell-stewart-quick-smoke.cjs` | yes |
| `spring-relaxation-smoke.cjs` | none |
| `star-desktop-smoke.cjs` | yes |
| `star-polygon-smoke.cjs` | yes |
| `stereo-quick-smoke.cjs` | none |
| `stereographic-smoke.cjs` | yes |
| `stereographic-surface-seams-smoke.cjs` | yes |
| `stereographic-worker-smoke.cjs` | yes |
| `surface-tools-quick-smoke.cjs` | yes |
| `torus-podia-smoke.cjs` | none |
| `tours-smoke.cjs` | none |
| `truncation-nets-quick-smoke.cjs` | yes |
| `ui-design-smoke.cjs` | yes |
| `units-export-smoke.cjs` | none |
| `video-explicit-pose-smoke.cjs` | none |
| `viewer-graphics-smoke.cjs` | yes |
| `waterman-smoke.cjs` | yes |
| `workspace-numeric-smoke.cjs` | yes |
| `workspace-ui-smoke.cjs` | yes |
