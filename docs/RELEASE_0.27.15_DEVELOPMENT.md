# 0.27.15: usable empty workspaces and native history menus

Local development preview, October 22, 2026. Feature expansion remains paused.
Public production remains 0.26.0; nothing was published online. Previous local
portable/source pairs remain preserved.

Before a model is open, model tools, Save, Export and history actions wait for
a source. A short message points to Library, New and Open. Guide, Library and
window controls remain available. Full screen is now in the header beside the
Library/Inspector buttons so it remains available without a model.

Parent fieldsets disable model controls without replacing each child's existing
disabled state. Opening the first model restores availability while preserving
3D/4D restrictions, unsupported options and history limits. Native menus follow
source availability; Undo/Redo also follow the selected document's actual cursor.
Directly dispatched menu actions recheck their source and show guidance before
performing any save, image, export or reset work. The guide describes this flow.

The main-frame IPC accepts three boolean availability fields and updates fixed
menu IDs only. Malformed values are refused. Hidden qualification retains its
null menu and never creates or activates a window for these updates. Geometry,
native file authorization and mathematical algorithms are unchanged.

## Reproduced baseline

Real packaged 0.27.14, after its initial generated model was canceled before
publication, left model toolbar buttons and native menu actions enabled. Reset
and PNG showed `Cannot read properties of undefined (reading 'view')`. Empty
Save/direct menu Save invoked the native save picker twice. Receipt:
`artifacts/empty-workspace-2kYpas/result.json`. This is a behavior baseline,
not a release qualification.

## Development verification

- Production build: 165 UI modules.
- 267 focused checks: `artifacts/empty-workspace-controls-0.27.15.tap`.
  New coverage includes parent/child capability preservation, empty action guards,
  bounded native-menu updates, malformed state and the real main-process IPC in
  ordinary and hidden modes. Existing cancellation, source ownership, history,
  reports, discovery, numeric, export and engine policies also pass.
- Startup Cancel: `artifacts/empty-workspace-F3FG9T/result.json`.
- Canceled startup Open: `artifacts/empty-workspace-jeViE6/result.json`.
  Both real desktop workflows exercise disabled controls, direct native menu
  dispatch, zero empty save dialogs, Guide/New, first-model recovery, preserved
  3D restrictions and actual dual/Undo/Redo menu changes.
- Layout checked at 1200 by 760 and 1500 by 950 without horizontal overflow;
  the smaller empty view was visually inspected.
- Core inspector/construction/history/Save/Open/visible playback:
  `artifacts/core-experience-rp5KkM/result.json`.
- Report ownership and Library discovery/retry:
  `artifacts/report-startup-YZ7clv/result.json`.

## Packaged verification

The actual 0.27.15 app passes with development Python unavailable:

- Empty state after startup Cancel: `artifacts/empty-workspace-OHYfmL/result.json`.
- Empty state after canceled Open: `artifacts/empty-workspace-q54xAi/result.json`.
  Both verify disabled native/toolbar actions, guarded direct menu dispatch,
  zero empty save dialogs, first-model recovery, 3D limits and native history.
- Hidden-window/focus/native-dialog canary:
  `artifacts/hidden-desktop-canary-9yQYBu/result.json`.
- Current reports and Library retry/project preservation:
  `artifacts/report-startup-9PoZnP/result.json`.
- Construction cancellation, certification and startup Open/Recover:
  `artifacts/publication-workflow-Jk4gg7/result.json`.
- Catalog/linked loading, focus and unsupported entries:
  `artifacts/catalog-workflow-Vj9tEf/result.json`.
- Core inspector, constructions/history/Save/Open and visible one-second morph
  playback: `artifacts/core-experience-IO92Yg/result.json`.
- Geometry exports and delayed-close/save ownership:
  `artifacts/export-workflow-i8rVtR/result.json`.
- Nets/history/SVG/PDF/exact-frame animation:
  `artifacts/net-workflow-EGLFDY/result.json`.
- Sections, promotion and animation ownership:
  `artifacts/section-workflow-hQbomJ/result.json`.
- Morph controls/capture/saved poses:
  `artifacts/morph-workflow-sscQ4m/result.json`.
- Legacy linked-library persistence/authorization (11 checks):
  `artifacts/linked-compat-64d558603c174be5bfc6db62ad34a9b2/linked-packaged-smoke.json`.

All 1,667 native engine files match 0.27.14:
`artifacts/engine-unchanged-0.27.15.json`. The actual self-extracting portable
passes with development Python unavailable:
`artifacts/portable-launch-a9ousk/result.json`. All 1,716 extracted resource files
match the tested app and bundled cube/dual/intermediate-morph operations pass.
Package/current verification matches 1,876 frozen runtime/build inputs:
`release/preview-0.27.15/verification.json`. Corresponding source is archived
and verified against those inputs and every current archive file. No complete
regression or general performance claim is made.

## Local package

Portable: `release/preview-0.27.15/Polytope Laboratory 0.27.15 preview.exe`,
143,239,582 bytes, SHA256
`c7b65b24e1ee9b332ffb7c600071a886dcb669c50586812c558991e65666e6c0`.
Matching source: `release/Polytope Laboratory 0.27.15 source.zip`.
Source-pair receipt: `artifacts/source-pair-0.27.15.json`.
Previous qualified pairs and unqualified intermediate binaries remain preserved.

## Next core work

Audit remaining read-only measurement/regular-identity feedback after source or
input changes. Reproduce before editing. Saved-tour actor sections still recreate
materials; fresh-user observation and broader core UX/performance work remain.
