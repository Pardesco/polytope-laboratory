# Guided Nets and Advanced layout (U8)

The Nets inspector reuses the existing editors, native operations and export
sessions in three numbered sections. Existing control ids and handlers are
preserved; moving a control does not change its saved parameters or history.

1. **Choose net type** (`nets-step-1`): `net-rebuild` / **Unfold faces**,
   `cell-net-build` / **Unfold 4D cells**, and `net-visible-surface` /
   **Paper model of the visible surface**. Every card stays visible, including
   a written reason when unavailable. Starting face/cell and visible-surface
   interpretation options use collapsed disclosures.
2. **Arrange** (`nets-step-2`): existing source-bound summaries, view choices,
   piece rearrangement, edit Undo/Redo, folding and connections. Numbering and
   assembly-sheet options are under `nets-numbering-options`. The preview stays
   in the derived viewport.
3. **Print or export** (`nets-step-3`): `net-print`, `net-export-svg`,
   `net-export-pdf`, `net-export-dxf`. Packing and packed-page PDF/SVG actions
   remain directly accessible. `net-paper-settings`, now **Page and paper
   options**, contains paper size, orientation, margins, glue tabs, colors and
   fold-line guidance. Reinforcement, fabrication/measurement sheets and
   four-face assembly retain their controls under `data-expert` disclosures.

The Advanced tab remains `evidence-panel`. Its intro precedes **Checks**
(`advanced-checks`), collapsed **Exact arithmetic**
(`advanced-exact-arithmetic`), and **Model information**
(`advanced-model-information`). Technical symmetry controls are under
`advanced-symmetry-checks`. The three former “Method notes” disclosures now
name rational certificates, numerical tolerances and imported-face support.
Raw validation details and technical groups carry `data-expert`; U2 owns the
global Expert tools toggle and visibility CSS. No second toggle is installed.

## Definitions and limits

- Face nets flatten a closed 3D shell. Whole-cell nets arrange complete 3D
  cells of a closed 4D shell in a 3D preview; these are not printable flat
  paper nets. Extract a 3D source entity for paper output.
- Visible surface constructs an undoable outer shell first. Choose **Unfold
  faces** on the resulting model to make its net. Native source ownership,
  refusal messages and history behavior remain unchanged.
- Card availability is a cached, bounded numerical preflight: dimension,
  closure incidence, resource limits and simple-face checks. It is not a
  geometric certificate. Native operations still verify orientation,
  planarity, manifold conditions and residuals, and may refuse unsupported
  geometry. Existing overlap and folding-collision limitations remain.
- Print uses the existing reviewed print session and all packed pages when
  available. SVG/PDF toolbar actions retain their original unpaged-net
  handlers; use **Export all packed pages as PDF** for paper-size PDF output.
  DXF reuses the W49 fabrication session: separate labeled face outlines in
  millimeters, with no glue tabs, packing, thickness or kerf allowance.
- New layout containers are always visible. Existing dimension-specific
  editor visibility is unchanged. `scripts/smoke-helpers.cjs` now enables the
  shared `expert-mode` class when revealing an expert descendant, then opens
  its ancestor disclosures as before. Net workflow/reinforcement and affected
  Advanced desktop smokes now call that helper for moved controls.

## Verification

Latest run: 195 focused Node tests, 63 Python tests and 27 mounted-browser
assertions passed. Seven affected desktop smoke scripts pass syntax checks;
the production Vite build passes.

- `node --test tests/nets-flow.test.mjs`: DOM-stub mounting, preservation of
  nodes/handlers, eligibility reasons, current-layout/busy checks, guarded
  Print/DXF routing, Advanced organization and smoke reveal.
- Focused existing Node coverage includes the face/cell editors, export and
  print ownership, native fabrication, history, tabs, colors, assembly,
  visible surface, reports and discoverability.
- `python -m pytest tests/test_nets.py tests/test_generalized_nets.py
  tests/test_cell_nets.py tests/test_visible_surface.py
  tests/test_net_fabrication.py tests/test_net_paper_ux.py -q -p no:cacheprovider`.
- `npx.cmd vite build --configLoader native` then
  `node scripts/nets-flow-browser-smoke.mjs`: mounted renderer with the real
  Python JSON-lines engine at 1280px. Exercises tesseract/cube/star workflows,
  packing, saved net history, guarded DXF and print handoff, toolbar sizing,
  Advanced and reveal. Native print/file dialogs are stubbed. Screenshots:
  `build/nets-flow-4d.png`, `build/nets-flow-print.png`,
  `build/nets-flow-advanced.png`.

Electron desktop smokes and physical printing require the lead's desktop run.
The broader existing `welcome-browser-smoke.mjs` completed its paper tutorial
but timed out at line 45 in the project-open race case; the unchanged HEAD
renderer reproduces the identical timeout. This is a baseline follow-up.
