# Hyperbolic UX and independent verification

Round 11 package F. Four regular honeycombs and the pinned eight-cell small cover; no uniform/ringed builder. Curvature is -1. All geometry is float64 approximation.

## Click-through

- Library → Hyperbolic space: existing `hyperbolic-open-534`, `-435`, `-535`, `-353`, `-small-cover`.
- Toolbar: View (`hyperbolic-model`), Return to center (`hyperbolic-home`), Explore inside (`hyperbolic-explore`). First overview outlines one reference cell in gold. Explore shows WASD movement, arrows/drag looking and Escape guidance; it uses Klein.
- Patch (`hyperbolic-patch-controls`): Visible radius (`hyperbolic-radius`, native NumericEntry expressions, 0–2), Cell layers (`hyperbolic-layers`, integer expressions, 0–5 for cubic {4,3,5}, 0–3 otherwise), Coverage (`hyperbolic-patch-mode`) and Apply patch (`hyperbolic-patch-apply`). Observer ball and adjacency layers are separate modes: layers do not certify a ball. Radius zero/layer zero follow the engine contract.
- Pause generation (`hyperbolic-pause`) cancels patch paging and pending rebases and exits Explore. Explore is disabled while paused; Return to center resumes generation and returns to the starting cell. Editing settings while paused saves them without issuing patch requests; unpause regenerates. Patch changes reuse the existing atomic rebase/swap path.
- Inspector → Analysis: cell and vertex figure summary; collapsed Hyperbolic diagnostics (`hyperbolic-diagnostics`) with lengths/angles, visible/accepted cells, exact engine coverage/stop reason, missing-in-R status and scaled residual gates. Copy receipt (JSON) (`hyperbolic-copy-receipt`) retains expert access. Help mappings include Patch and diagnostics. Construct/Nets/Advanced show a Euclidean domain note; Construct also explains unsupported Sections (`hyperbolic-sections-note`).

The caption always explains equal hyperbolic cell size and distance distortion. The small cover explains that eight colours identify quotient cells, and repeated lifts depict one closed space. The finite-patch pause/limit statement follows the engine completeness/stop reason and display caps. Missing-in-R is 0 only for a completed observer-ball receipt; otherwise it is unknown, never an invented count. Cell instance counts precede display caps. Ball completeness and missing-cell status refer to the receipt's generation pose, which is shown explicitly; navigation transports the live observer between generations.

## Persistence and ownership

Display-only patch options live in `state.view.hyperbolicPatch = {radius,depth,mode,paused}` and use `markDirty`, as navigation does; they add no construction history nodes. Saved options are clamped on read. Existing recipe/history/project operations and IDs are unchanged. `NumericEntry` gains optional paired `captureSource`/`verifySource` hooks for document kinds whose model is not Euclidean; default ownership checks remain unchanged. Hyperbolic edits compare project/state identity, the full descriptor signature and their saved patch target before publication. Expression and integer/range validation remain in NumericEntry.

First-open highlighting is a disposable overlay owned by the controls, using the viewer's projection shader and observer uniforms. It is removed when exploring, replacing the anchor or leaving the document; it carries no persistent selection claim across epochs.

## Independent verification

Run these separate steps; neither launches Electron:

```powershell
python scripts/capture-hyperbolic-receipts.py
python scripts/verify-hyperbolic.py
```

The producer calls the engine to capture ten complete radius-2 patches: two distinct off-centre poses for each document. The verifier imports nothing from `engine/`; it reads pinned JSON as data and those untrusted pages:

1. Its own Tits-basis Coxeter reflections, finite parabolic face mirrors and full-coordinate deduplication produce face-adjacency rings 0–3. All four agree with the table transcribed in the design: 534 = 1/12/102/812; 435 = 1/6/30/126; 535 = 1/12/132/1392; 353 = 1/20/260/3212.
2. It reconstructs cells of P × (Z/2)^3 / ~ from local incidence and lambda, builds integer d1/d2/d3, checks d1d2=d2d3=0, collapses a graph spanning tree and calls development-only sympy Smith normal form. Result: (V,E,F,C)=(20,60,48,8), chi=0, orientable, H1=(Z/2)^9, b1=0. It reuses no engine face-pairing, union-find or Smith code.
3. From page geometry it independently reflects around interior vertices and checks 8/20/20/12/8 incident cell centres against the complete loaded patch. Both off-centre probes pass for all five documents. This tests selected local vertex stars, not an exhaustive independent proof of the whole observer ball.

Outputs: `artifacts/verify-hyperbolic/report.md`, `report.json`, and hashed `engine-receipts.json`. The report records source-data and receipt SHA-256 hashes, tested vertices and measured discrepancies. sympy is development-only; no runtime dependency was added.

## Limits

Published ring table numbers are transcribed from the supplied design contract. The published PDF extract/hash and transition matrices are unavailable offline, so the report explicitly withholds a general growth-series/transition-matrix claim. Small-cover runtime H1 retains its engine construction qualifier; the separate development report supplies the independently implemented coset check. Volume 8 × 4.3062 is a coarse published reference, not certified precision. No exact-coordinate or interval certification is claimed. Lead verification in the real desktop app remains required.

## Integration notes

No new engine op or shared app hook is needed. The owned document adapter mounts `HyperbolicControls`; `rebaseHyperbolic` now forwards radius/depth/mode through every page. Existing `hyperbolic-patch` request/response shapes are reused. Shared changes are restricted to NumericEntry's paired owner hooks, guide text/mappings, and the two new Node files in `test:features`.

## Validation

Validation: 113 focused Node cases plus 2 mounted app workflows passed (115 total); 87 pytest cases passed across verification/document/protocol suites. The independent verifier passes all four ring tables, exact integral coset H1 and ten off-centre vertex-star receipts (178 tested vertices, largest relative cell-centre discrepancy 1.422e-14 against the unchanged 1e-8 test gate). Vite build, focused Prettier/Ruff checks and git diff whitespace check pass. Electron was not launched. Mounted screenshots are written to `artifacts/hyperbolic-ux/` at 1600×1000 and 1280×800 for all five presets.


Commands:

```powershell
node --test tests/hyperbolic-ux.test.mjs tests/hyperbolic-math.test.mjs tests/hyperbolic-viewer.test.mjs tests/hyperbolic-protocol.test.mjs tests/hyperbolic-history.test.mjs tests/numeric-entry.test.mjs tests/user-guide.test.mjs tests/help-scope.test.mjs tests/app-chrome.test.mjs
node --test --test-concurrency 1 tests/hyperbolic-ux-mounted.test.mjs tests/hyperbolic-mounted.test.mjs
python -m pytest tests/test_hyperbolic_verification.py tests/test_hyperbolic_document.py tests/test_hyperbolic_protocol.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```
