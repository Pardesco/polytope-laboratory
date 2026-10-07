# Verified release 0.21: faceting, stereographic refinement and video repair

The original 73-requirement objective remains active. The ledger has **2 validated, 65 partial implementations and 6 unstarted requirements; 71 gates remain open**. FAC-02/FAC-03 now have actual mounted workflows, and FAC-04 has verified preview/adoption/history; its required faceting diagrams remain incomplete. These development records preserve the original acceptance text and do not close a gate.

The exact qualified candidate is promoted as `release/Polytope Laboratory 0.21.0.exe`, 131,830,707 bytes, SHA-256 `f69deb34be6c7856c575f05a3c61f9d3d74f1c5fe856f679c4ec3d0fb5b64077`, unsigned. The original candidate, release 0.19 and all older candidates/proofs remain retained. Candidate 0.20 was held for the independently demonstrated missing video endpoint; it was not promoted.

## Source and build evidence

- Full native suite: **4,117 passed, one skip**, all 524 inputs unchanged. `artifacts/native-development-0.21.0.json` and its log.
- Full declared frontend suite: all three commands pass, **1,576 Node tests**, zero skips/failures; all 221 UI/desktop/test/fixture/oracle/package inputs unchanged. `artifacts/frontend-source-tests-0.21.0.json` and its log. The two standalone face-fill commands also pass.
- Actual candidate native archive: all 75 engine modules plus the server match current qualified source; all 538 resources and 358 catalog assets match. Frozen importers remain byte-identical. `artifacts/native-bundle-candidate-0.21.0.json`.
- Actual candidate frontend: all eight packaged frontend/desktop files match; a fresh Vite build reproduces all four dist files exactly. `artifacts/frontend-candidate-0.21.0.json`.
- Retained immutable inputs: `artifacts/frozen-0.21.0-qualified-native-source` (524 files) and `artifacts/frozen-0.21.0-candidate-inputs` (108 files).

LIB-04 and MEAS-04 remain validated against their actual 0.20 candidate. Both were freshly requalified and bound to the retained original 821-file snapshot plus a separate five-file accounting-tools snapshot before changing production sources. Later read-only checks verify frozen code/data/resources without asserting that 0.21 is 0.20. Both acceptance/status records are preserved; no released or all-suite claim was introduced.

## Actual development desktop checks

`artifacts/desktop-qualification-Z0vNQL/result.json` passes animated tours and single-model animation. Both use actual WebCodecs encoding, native file staging/publication, independent PNG endpoint comparisons, source guards, cancellation and restoration. Single-animation WebM timestamps match 0 and 0.1 seconds exactly. The tour has seven decoded poses; the first and final frames are uniquely closest to their corresponding PNGs among all seven.

`artifacts/desktop-qualification-ouZ2aB/result.json` passes workers, surface seams, stereographic projection and graphics. Root inspected the opaque curved-face and rotated translucent screenshots. Shared same-face refinement, analytic smooth normals, real Worker transfer/publication, picking and capture refusal/retry remain intact. Dense refinement retains more source parameter area under existing caps, but unresolved pole/depth/resource geometry still cannot qualify complete capture. No new universal FPS or camera-complete claim is made.

`artifacts/automatic-faceting-smoke-rlmgom/result.json` passes all 12 mounted groups: cube/tetra candidate pools and source-face searches, detached preview, explicit adoption, Undo/Redo/Replay/Branch/native Save/Open, an independent alternating-tetra branch, empty/limited/refused inputs, and held actual native responses rejected after source/unit/notes/document/criteria/cancel changes. Observer orientation remains allowed. The first failed run is preserved; its unsupported-option assertion was repaired after inspecting Playwright's label-to-select retargeting, without changing production code.

## Complete packaged release qualification

All **43 packaged suites pass**, with independent runtime/runner/harness proofs in `artifacts/desktop-series-hCyNxk/result.json`. Packaged tour proof `artifacts/desktop-qualification-G4SE7y/animatedTours/animated-tours-packaged-gzHPU8/result.json` verifies **all seven decoded timestamps and uniquely corresponding PNG poses**, including both endpoints. Single-animation proof is `artifacts/animation-packaged-smoke-YlsElb/result.json`.

The actual outer portable launcher passes with development Python disabled and its entire extracted runtime matching the qualified candidate before/after (`artifacts/portable-candidate-0.21.0/portable-smoke.json`). All 3,064 linked-source hashes are checked; 3,050 parsed/14 diagnosed remains a file audit rather than mathematical classification. `artifacts/release-0.21.0.json` records all 43 proofs; `artifacts/promoted-portable-0.21.0.json` records the exact copied bytes and unchanged older releases. All 847 qualified source/test/oracle/script/specification inputs are preserved in `artifacts/frozen-0.21.0-release-qualified-source`. Passing these workflows does not imply full mathematical or Stella parity.

## Continuing parallel work

Finite-frustum stereographic classification, exact boundary roots, interior loops, sphere and plane arc arrangements have 72 isolated checks. Curved region filling, shared cross-domain boundaries, raster margins and complete visible-domain capture remain under development; these prototypes are not mounted.

Additional tidy/spiky/reciprocal/partial faceting policy predicates pass 187 isolated checks, including 74 new policy cases. They are not yet production search filters. Tidy-dual and spiky options remain unavailable. The detached per-vertex projective diagram kernel passes 77 tests, including exact picked-cycle/search/adoption correspondence and native replay/Save/Open. It is not mounted; the current 3D result preview does not substitute for a faceting diagram. Copied 0.22 UI integration is underway.

Dual morph work preserves all eight documented 3D views and the two documented 4D views. Detached expansion/tilting-quads pass 62 tests and 80 native-frame comparisons; separate 3D sizing passes 48 tests and 35 frames. Remaining methods, installed-baseline trajectories and actual rendered/saved/exported playback stay open. An additional installed 5.4 menu command is recorded as a baseline ambiguity rather than an invented supported mode.

New source-bound formatted text/PNG/net-SVG groundwork passes 24 independent tests plus hostile-input review. It preserves full source attributes through actual Node persistence and follows actual native net-part rotations at physical scale. It is not mounted, does not cover all baseline formatting/mapping or packed/PDF/viewport output, and does not close VIS-04. Remaining catalog, construction, net reinforcement and broader qualification requirements stay in the unchanged ledger.
