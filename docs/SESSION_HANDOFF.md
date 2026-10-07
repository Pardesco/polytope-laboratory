# Current priority - October 7, 2026

The current direction is to pause feature expansion and improve the core
experience: simplify controls and visible data, measure and improve performance,
investigate reported dual-morph scaling, and verify common workflows. Follow
[the roadmap](OPEN_SOURCE_ROADMAP.md) and [interface contribution guidance](../CONTRIBUTING.md).
The feature-expansion instructions below are historical and are superseded by
this direction. Existing staged features remain deferred.

## Previous development checkpoint - October 7, 2026

The feature-complete goal remains active, using GPT-6.1-Sol subagents. Randall
prioritizes free/open-source feature coverage or roughly 90% of Stella4D,
with a build and relevant checks. Practical 90% coverage is not yet measured.
The historical pause below is superseded; its evidence remains retained.

Working sources are **0.26.0 development**. The usable **0.26.0 GPLv3 community
preview and corresponding source archive** are packaged in `release`.
Its real portable launch passed with development Python unavailable. The prior
qualified 0.21 release is unchanged. Program license is GPL-3.0-only; third-party
licenses remain intact, and contribution guidance and issue templates are ready.

The sources include eight scoped 3D morph methods, faceting diagrams, element
text/PNG content, repeated-instance labels, physical reinforcement and measurement
exports, stereo, one-to-six independent views, project metadata, finite 4D
construction from vertex figures, 80 specialized 3D and 980 attributed 4D entries.
New in 0.23: convex 4D expansion, tidy/spiky search filters, automatic source labels,
structured catalog queries, metadata JSON export/reopen, material/lighting/themes,
regular-face/equal-edge/equal-area fitting, grounded stephanoids, and analytic
tetrahedron, triangular-prism, and triangular-grid controls, procedural bump/studio
reflection, exact rational 3D surface sections, and stellation cell/dependency diagrams.
See `RELEASE_0.26_DEVELOPMENT.md` and `OPEN_SOURCE_ROADMAP.md` for current limits.

Build passes. A short actual-app check passes fitting preview/adoption, 4D
expansion, material presets, labels, and JSON metadata export/reopen:
`artifacts/feature-0.23-quick-hX7RvM/result.json`. Stephanoids passed six focused
staged checks and the mounted build. The final fitting coordinate guard passed
three mounted native checks. FAC03 production sanity passes actual criteria
receipts and adoption. No full regression or requirement-wide conformance closure
is claimed for this community development checkpoint.

The real-app surface-tool check passes shader rendering and PNG capture,
cell selection Undo/Redo/filling, and rational section preview/adoption:
`artifacts/surface-tools-quick-kQ79El/result.json`. Mounted sections and cell
diagrams also pass six native and six controller/Viewer checks.

New in 0.24: environment-only refraction, bounded convex face/cell distances,
source-incidence truncation/quasi cuts, generalized nonconvex face and 4D whole-cell
nets, sphere projection, and seven Stewart entries with checked genera one through
three. The real-app refraction/measurement check passes:
`artifacts/refraction-measurements-quick-jiij6x/result.json`. Quasitruncation
adoption and concave folding/native Save/Open pass:
`artifacts/truncation-nets-quick-hvg5IF/result.json`. Generalized netLayout
restoration routes through the new kernel without changing the protected importer.

Sphere expression/default controls, generalized whole-cell net display and matching
faces, native net Save/Open, and the genus-three Stewart catalog load pass:
`artifacts/sphere-cell-stewart-quick-vVDCuk/result.json`.
Concave ordinary source cells, tidy-dual faceting and generalized sizing are
mounted with focused native/controller/Viewer checks. Moving text/PNG content,
capture, enabled-morph Save/Open and unsupported PNG endpoint retention pass:
`artifacts/morph-content-quick-7Zmypa/result.json`. The actual-app check required
detached camera initialization and readable billboard texture orientation fixes.
Offline help now has 21 searchable topics with F1 control context; its app check
passes in `artifacts/guide-quick-w7OtRW/result.json`.

New in 0.25: generalized expansion morphs, automatic exact full/proper source
symmetry for faceting, per-edge physical glue tabs and literal 4D incidence
reciprocation. Mounted eight native and six Viewer/session/controller groups pass;
source-symmetry native/UI sanity and
build pass. These features are included in the qualified 0.25 binary/source pair.

Exact regular faceting sources and source-color paper batches are also mounted.
Source/adoption Save/Open and history replay, three native printing and two
controller groups pass. The real-app check passes 4D reciprocation/capture,
physical tabs, exact-source faceting, source-RGBA paper batches and star expansion
Save/Open/capture: `artifacts/feature-0.25-quick-NuAPGG/result.json`.

Generalized 4D expansion is mounted: three native and two Viewer/session groups
pass. The real-app check passes concave expansion with four-rank text, moving
face PNG, Save/Open and retained prior pose after unsupported image refusal:
`artifacts/generalized-4d-morph-quick-zxan0U/result.json`.

Generalized net folding is mounted for keyframes/tours and PNG/WebM export.
Two native source checks and six Viewer/animation/tour checks pass. Actual GPU
PNG0/.5/1, three decoded VP8 frames and source/annotation/tab/history Save/Open
pass: `artifacts/generalized-fold-quick-FEbVM9/result.json`.

New in 0.26: complete ordinary 4D cell sections with concave/disconnected/holed
regions, saved dual-morph ratio tracks and PNG/WebM export, and explicit Fit export
frames. Mounted focused checks and actual desktop exports/promotion/SaveOpen pass:
`artifacts/feature-0.26-quick-254ZbX/result.json`. The formerly clipped concave-fold
endpoint is now wholly visible after explicit fitting; continuous-motion/label
extents are not certified by sampled frame fitting.

Four-face coincident-edge assembly supports all four policies for qualified ordinary
convex/concave/toroidal pieces, physical tabs, detached history and source text/PNG SVG/PDF. Mounted native
and five Node groups pass. Actual UI/export/SaveOpen passes in
`artifacts/coincident-assembly-quick-G0Jdvd/result.json`; its PDF review confirms
both support instructions, A4 dimensions and embedded source PNG. Root fixed the
shared print-window data-image policy after the initial PDF omitted that image.
The frozen 0.25 preview retains the old behavior, now recorded publicly.

GitHub is published: https://github.com/Pardesco/polytope-laboratory and its
v0.25.0 prerelease with Issues enabled. Uploaded digests match the original binary
and corresponding source ZIP. Publication came from a clean archive extraction in
`build/github-publication-0.25/source`, preserving runtime files; current 0.26
sources are not pushed. `artifacts/github-publication-0.25.0.json` records it.

Projective infinite/hemi incidence duals, twelve supplied reflected snub forms,
U1-U75 symbol aliases, separate Skilling source and source-owned reflection are
mounted. Eight native/five Node groups and actual desktop catalog/PNG/source
selection/clipping recipes/history SaveOpen pass:
`artifacts/projective-snub-quick-fWUhHk/result.json`. Three controller groups pass
after PNG save feedback integration. Actual concave assembly UI/PDF/SaveOpen passes
`artifacts/coincident-assembly-quick-2rcRiL/result.json`; PNG/SUP instructions are
present and custom 1000 mm paper measures 1000.167 mm.

The public documentation follow-up is pushed at 3ff0111999b4f8d6f31cfa7f5ec95eca1f0fcc7f.
The initial release tag/source remains 4fc3b02a9763860f73349d3f378571dc969a663c.
Current build: 153 modules pass; offline help has 25 searchable topics. Stale unstarted ledger rows for supplied specialized
families, bounded vertex-figure completion, reinforcement and element content now
reflect existing prototypes; no additional conformance gates were closed.

Source-owned content on ordinary 4D cell sections is mounted: repeated formatted
labels retain rank-loss owners and whole-surviving-face PNG retains UV/source alpha.
Three mounted native/four actual Viewer-animation-tour checks and real GUI PNG
sequence/content/promotion/refusal/SaveOpen pass:
`artifacts/section-content-quick-ApisKX/result.json`. Export-owned read admission
was fixed after actual capture hit the construction guard; ordinary construction
and promotion remain blocked during export. Three section-controller groups pass
including late lost-owner refusal. Generalized 3D density/algebraic measures are
mounted; native four-star/analytic/ownership cases and three real-native controller
checks pass. Actual density inspector/query/source JSON/CSV and evidence SaveOpen pass:
`artifacts/density-info-quick-X0hY43/result.json`.

Literal 4D arrangement/regiment comparison and independent-incidence compounds,
plus simple concave-face bounded distances, are mounted. Three regiment native,
six distance native and five combined Node groups pass; actual desktop comparison,
navigation, compound PNG/content/SaveOpen/replay and bounded/flat metrics pass:
`artifacts/regiment-distance-quick-UdLQGc/result.json`. Root fixed comparison
empty-state initialization and the shared history commit return value, and enabled
native-supported comparison/compound history branching. Nine runnable projects
are in examples/0.26. No broad regression was performed.

Next isolated work: 4D D4-lattice Waterman construction, finite completion from
nonconvex/star vertex figures and verified symmetry-orbit coloring.
The 0.25 portable passes with
development Python disabled; all 2,354 archived hashes and 1,828 frozen runtime
inputs matched the actual corresponding source ZIP before this version bump. Via-snub is a proposed
future method, not a grounded current benchmark requirement. Protected importer files and
historical release assets remain unchanged. Initial full-test receipts predate
the new features. The expanded native regression was stopped at Randall's request
and contains unresolved failures; old frontend doubles were fixed in focused
checks. Reinforcement PDF verification was corrected for Chromium quantization;
the complete desktop wrapper was not rerun. Retained failures remain inspectable.

Preview receipt: `artifacts/community-preview-0.26.0.json`.
Source archive receipt: `artifacts/source-package-0.26.0.json`.

---

# Session handoff — 0.22 development checkpoint

Updated October 5, 2026. Randall requested a good stopping point and a clean
handoff for the next session. **The full goal is incomplete and is paused at
this checkpoint. No root test/GUI jobs or subagent jobs remain running.**

Work directory: `C:\Users\Randall\Documents\4d-polytope-desktop`.
Use an explicit workdir for every command. Do not confuse this repository with
the laserburn-suite workspace or the older web/Blender projects.

## Completion and original scope

The original `STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md` and all **73** ledger
requirements remain authoritative. `docs/parity-ledger.json` records **2
validated, 65 partial/prototype, 6 unstarted; 71 open**. Strict completion is
**2/73 = 2.74%, about 3%**. Partial implementation is substantial but does not
justify a larger completion percentage. This checkpoint closes no new gate.

Installed reference is Stella4D 5.4. The user declined paying for 6.0. Preserve
the original documented 6.0 target; do not demand an upgrade or shrink scope.
The user wants a minimalist professional math UI, improved viewport quality,
smooth curved stereographic faces, automatic rotation and complete features.
Parallel agents and local GUI checks were authorized. Visible popups are
currently allowed, but root alone runs GUI checks sequentially.

Never edit `engine/__init__.py`, `engine/formats.py`, or `engine/geometry.py`,
including their copies and frozen snapshots. Never rewrite previous release
proofs, frozen prototypes, or original acceptance criteria. No commits, pushes,
publishing or destructive cleanup were performed at this stopping point.

## Verified release versus current source

The latest qualified portable remains **release/Polytope Laboratory 0.21.0.exe**,
131,830,707 bytes, unsigned, SHA-256:
`f69deb34be6c7856c575f05a3c61f9d3d74f1c5fe856f679c4ec3d0fb5b64077`.
It passed **4,117 native tests/one skip, 1,576 frontend tests, all 43 packaged
desktop suites, and the actual outer portable launcher**. Its exact 847
qualified inputs remain preserved under
`artifacts/frozen-0.21.0-release-qualified-source/source/` and `source-hashes.json`.
Release receipts are `artifacts/release-0.21.0.json` and
`artifacts/promoted-portable-0.21.0.json`; details are in `docs/RELEASE_0.21.md`.
Retained 0.20 is unpromoted due to its decoded video endpoint defect.

**The working source now differs from that release.** Package version still
reads **0.21.0**; no 0.22 portable has been built or promoted. Only the reviewed
stereographic signed-normal fix has been mounted. Diagrams, morphs and element
content remain in isolated copied integration trees.

## Mounted stereographic fix and exact verification

Root mounted four UI modules: `stereographic-normals.mjs`,
`stereographic-dense-refiner.mjs`, `stereographic-conforming-surface.mjs`, and
`viewer-stereographic.mjs`. Analytic normal sign now follows the ordered source
differential, independent of a thin child's projected chord. A rendering-only
corner permutation makes triangle fronts agree with those normals for Three
DoubleSide lighting. Source cycles, barycentric coverage and element IDs remain
unchanged. This repairs a concrete no-pole orientation defect; it does not
prove all curved raster coverage or all transparency ordering.

`scripts/transplant-stereographic-normals-0.22.py` and
`artifacts/stereographic-normal-transplant-0.22.json` record the reviewed mount.
The independent new test `tests/signed-normal-integration.test.mjs` imports the
**frozen 0.21 worker** for its old-behavior comparison. The existing worker test
adapter was byte-identical and reused. The normal test was corrected to use
source orientation. The quality oracle test now compares immutable source
corner order through the explicit rendering permutation.

Final mounted frontend run: **1,584 tests pass**, zero failures/cancellations,
plus the two standalone face-fill checks. Log:
`artifacts/frontend-normal-mounted-0.22-source-order.log`. Vite build passes:
`artifacts/frontend-normal-mounted-0.22-build.log`.

Actual development Electron/GPU/real Worker suite passes:
`artifacts/stereographic-surface-seams-iRftEQ/result.json` and
`artifacts/stereographic-normal-mounted-0.22-gpu-host.log`. It checks opaque and
translucent shared face seams, native source/RGBA/notes/units persistence,
curved lighting and actual tesseract XW rotation. Root also viewed the opaque
curved-face PNG and rotated translucent tesseract capture. This is development
qualification, **not packaged qualification** of the new fix.

The first broad frontend run stalled while formatting an enormous old-oracle
deep comparison after adding `renderCornerOrder`. Root verified and stopped
only that test process tree, fixed source-order comparison, then completed the
fresh run above. Preserve `artifacts/frontend-normal-mounted-0.22.log` as
interrupted evidence, not a pass. The first two GPU attempts failed at Windows
Electron sandbox runtime startup; both logs are retained. Running the same
authorized check outside the tool sandbox succeeded, with Electron renderer
sandbox still enabled. Use `POLYTOPE_TEST_VISIBLE=1`, remove conflicting test
mode/executable/ELECTRON_RUN_AS_NODE env vars, and use host execution when
necessary. Never add `--no-sandbox` to make a check pass.

## Frozen development integrations

| Tree | Verified checkpoint | Next action |
| --- | --- | --- |
| `development/faceting-diagram-integration-0.22/` | 97 native +43 actual controller/native-backed tests; 3 syntax checks | Review `transplant-manifest.json` and README, merge narrow hunks, then actual browser picking/adoption/persistence/package checks |
| `development/dual-morph-integration-0.22/` | 11 copied-native +92 Node checks (24 new,68 copied); app/Viewer syntax | Read README/checkpoint/source-hashes; reconcile 28 hunks and mounted normal dependencies, then real GPU playback/Save/Open/capture |
| `development/element-content-viewport-0.22/` | 54 headless checks (19 new,35 copied) | Read HANDOFF/snapshot; merge four new helpers +Viewer hunks, then actual Canvas/ImageBitmap/GPU qualification |
| `development/element-annotations-integration-0.22/` | Root19 native workflow tests +off_audit5 native-backed controller checks; 3 UI syntax checks | Read ROOT_HANDOFF/UI_HANDOFF/UI_TRANSPLANT_MANIFEST; finish lifecycle, NetEditor, export and specialist-history wiring before merge |

All three agents ended with no live processes or windows. Their copies retain
their original 0.21 baselines. **Never copy an entire UI/engine/app tree over
production or another integration.** App/server/main/display-state/Viewer hunks
overlap. Reconcile additions sequentially and preserve the four mounted normal
fixes. Root's session-stop manifest hashes the current copies and mounted files.

The morph tree is a partial engine overlay, with a NEW test-only
`engine/__init__.py` path adapter into native dependencies. It is not a
byte-identical copy of the protected initializer and **must never be
transplanted**. Root's originals and actual full copied importers are unchanged;
rebuild the morph additions in a proper engine copy during merge review.

Diagram scope includes per-vertex projective charts, verified symmetry picking,
source/search/adoption guards and saved parameters. Native import/cache readiness
must precede initial diagram publication; an uncached source refreshed by Save/Open
is explicitly stale. Broader FAC-04 scope and actual GUI are still open.

Morph math supports scoped sizing, truncation, expansion and tilting quads.
Truncation rebuilds actual supporting-halfspace intersections at each ratio.
Expansion/tilting quads have 3D/4D scope; sizing/truncation currently 3D. Four
other documented 3D modes remain missing; installed Via Snub resource behavior
is unresolved. Timing equivalence to Stella and throughput remain unqualified.
Earlier independent morph kernels/proofs are frozen and must remain unchanged.

Viewport content uses original source IDs and the actual published pose, not
pending desired worker state. It overlays the actual emitted face triangles;
there is no second surface tessellator. Native-to-Node portable source SHA,
RGBA/units, source/asset/cancel/capture fences, stereo/perspective mapping and
folded native net/3D explosion face cases pass headlessly. Repeated-instance
screen labels, actual cell-net/4D explosion fixtures, fonts, image orientation,
opacity, z-fighting and performance remain open. Capture refuses unresolved
requested content; never silently omit it.

Root native content supports text/PNG/list/remove recipes, literal base-input
replay, Undo/Redo/Branch/Save/Open, SVG regeneration and physical packed page
subsets without resizing. Generic transform/dual owner transfer is tested:
unmapped content retains its original source/notes/units in detached records.
**Specialist construction/replay workflows have not yet been wired to that
ownership helper.** NetEditor content threading/restoration, Star's Viewer merge,
global cancellation/export lifecycle, final population, and tour/offscreen
capture remain unfinished. Do not call this a mounted VIS-04 implementation.

Root native log: `artifacts/element-content-integration-0.22-ownership-first.log`.
Its original paper fixture correctly refused an81 mm piece on80 mm printable
paper; the corrected positive fixture uses110 mm paper and a dedicated negative
test retains the refusal. Earlier logs are preserved.

## Resume sequence

1. Read this handoff, `artifacts/session-stop-0.22.json`, the original spec and
   ledger. Verify current hashes before editing. The full goal is paused by
   user request; resume it only when the user requests continued work.
2. On resume, finish source ownership and capture lifecycle in the copied
   annotation tree. Merge the frozen Viewer helpers/hunks into that tree and
   qualify native/controller/Viewer cooperation. Preserve all old proofs.
3. Reconcile diagram/morph/content additions through their checked narrow
   hunks. Add meaningful production tests and the explicit Pillow dependency;
   do not substitute headless checks for actual GUI workflows.
4. Build a new 0.22 candidate only after reviewed source integration. Run
   appropriate source checks, compiled/native/frontend reproduction, actual
   sequential GUI feature qualification, all packaged suites and outer portable.
   Promote only the exact qualified candidate. Preserve released0.21.
5. Continue the original73 scope: catalog identity/classification, all required
   mathematical modes, full finite-camera stereographic clipping, reinforcement
   parts, formatted content, generalized nets, interchange and hardware/clean
   machine qualification remain open. Partial prototypes do not close gates.

Useful commands from repository root (PowerShell):

```powershell
npm.cmd run test:features
npm.cmd run build
$env:PYTHONUTF8='1'
python -B development/element-annotations-integration-0.22/tests/test_element_content_workflow.py
python -B scripts/parity-ledger.py --check
```

Historical ledger associations LIB-04/MEAS-04 are bound to actual retained0.20
candidate/frozen source821/frozen accounting tools5; use historical read checks,
not a claim that broken0.20 was released. Latest read-only ledger check passes:
`artifacts/parity-ledger-session-stop-0.22.log`.

All root handles are terminal:40819 interrupted;69373 frontendPASS;79164 GPUPASS;
96775 sandbox-launchFAIL;28320 ledgerPASS. Other root calls completed directly.
**Do not poll or restart these handles.** Read artifact logs/manifests instead.
The previous large historical handoff is preserved unchanged at
`artifacts/session-handoff-before-stop-0.22.md`; its live-job statements are
historical and must not override this checkpoint.
