# Workspace, animation, interchange and desktop completeness

Read-only implementation audit, October 4, 2026, against the September 30 build specification, the current parity ledger and 0.10.0 source. This plan covers ANIM-01..03, DOC-01..03, IO-01..04 and DESK-01..02. Every requirement remains a release blocker. A passing bounded workflow is evidence for that scenario, not completion of the entire requirement. No installed Stella4D conformance session was performed. No production source changes or Electron launches were made for this audit.

## Evidence and benchmark interpretation

The local authority is [the build specification](../STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md), particularly sections 3, 5.8, 5.9, 6.4, 13, 14 and 16. The [ledger](parity-ledger.json) contains twelve requirements in these areas: ten prototypes and two unstarted requirements (ANIM-02 and DOC-02). This audit does not change their status.

Official documentation supplies these option inventories, which still need installed-version confirmation:

- [Views](https://www.software3d.com/Manual/Views.php?prod=Small) names eight 3D morph views: sizing, truncation, augmentation, expansion, tilting quads, tilting triangles, tilting to compound and tilting to rectify. [Morphing](https://www.software3d.com/Manual/Morphing.php?prod=Great) describes ratio entry, optional extrapolation, promotion and method-specific limitations. [Supported 4D features](https://www.software3d.com/Manual/Features4D.php) lists expansion and tilting quads in 4D; partially folded 4D nets are outside that documented baseline. Do not accidentally require every 3D morph in 4D.
- [Explosion](https://www.software3d.com/Manual/Animate.php?prod=Great) separates faces for inspection and supports cyclic motion. [Transitions](https://www.software3d.com/Manual/Transitions.php) includes instant, sideways, orbit, shrink/grow and explosion/implosion combinations, configurable occasions, duration and presets. [Tours](https://www.software3d.com/Manual/Tours.php) saves ordered model events with per-event duration, transition and inherited-layout choices, including editing, merging, playback and video export.
- [Memories](https://www.software3d.com/Manual/Memories.php?prod=Stella4DPro) specifies nine model slots, store/retrieve/swap/clear and add/blend; selected derived models can be stored and relative scale matters. Its exceptional model restrictions must be recorded in conformance cases.
- [Import](https://www.software3d.com/Manual/IO.php?prod=Stella4DPro) documents OFF and 3D DXF with precision concerns and a user-selected hull fallback for some OFF sources. [Model export](https://www.software3d.com/Manual/Export.php) uses the selected view, scale/units and orientation choices, with optional vertex spheres and edge cylinders. [Image/video export](https://www.software3d.com/Manual/ExportImage.php) includes custom dimensions, DPI, pixel aspect, fit/margins, oversampling, still/sequences and multiple video containers. Its list includes MP4, MKV, MOV, AVI, OGG, WEBM and WMV; exact available codecs and still formats require installation evidence.
- [Help](https://www.software3d.com/Manual/Help.php) provides context-sensitive F1. [Installation](https://www.software3d.com/Manual/Install.php) documents platform and deployment behavior. Our own Windows x64 support, license and deployment policy must be independently declared; matching a competitor's activation design is not required by the specification.

Some manual pages returned fetch errors on direct opening; indexed official search results supplied the morph, explosion, memories and transitions descriptions. Do not treat this as hands-on option verification. Confirm the complete controls and supported object domains using a licensed 6.0 installation before closing gates.

## Current implementation and remaining obligations

| Requirement | Implemented source and evidence | Missing work preventing completion |
| --- | --- | --- |
| ANIM-01 | `ui/animation.mjs`, `animation-controls.mjs`, `viewport-controls.mjs`: saved six-angle/depth tracks, time-based playback, exact endpoints, cancel and restoration. `net-editor.js` and `net-motion.mjs` supply separate rigid 3D folding. Focused animation tests and nine desktop scenarios pass. | Face/cell explosion, saved fold tracks and common export/playback clock; wider domain qualification. Camera/material tracks are useful supporting scope, not substitutes for the required explosion/fold cases. |
| ANIM-02 | Convex dual and bounded 3D incidence dual exist in the engine, but no morph evaluator or UI exists. | All verified morph methods, parameter/extrapolation rules, topology events, promotion, colors, 4D expansion/tilting-quads and method-specific exceptional cases. |
| ANIM-03 | Single-model numeric keyframes serialize under `view.animation`. | Ordered multi-model tours, transitions, per-event durations/inheritance, edit/reorder/merge, deterministic evaluation and export. |
| DOC-01 | `ui/app.js` multiple tabs, geometry snapshot undo/redo, promotion; `engine/formats.py` validates saved geometry and reconstructs net caches. Camera/presentation/selection/preferences persist. | Full state schema, complete metadata/asset semantics and round trips for every new operation/domain; document lifecycle controls and active-view identity required by memories/export. |
| DOC-02 | No model-memory or add/blend workflow. | Nine immutable slots, retrieve/swap/clear, active-derived storage, relative-scale handling; compound identities and coincidence/blend policy depend on kernel composition work. |
| DOC-03 | Native project v1, atomic engine write, prior-file `.bak`, 30-second recovery. Snapshot state remains inspectable. | Explicit migrations, immutable operation graph and algorithm/numeric version records, parameter editing/replay, durable failure qualification. Current UI truncates history at 200 states; older operations are not a replay graph. |
| IO-01 | Strict bounded OFF/4OFF parser, ordered incidence, face/cell RGB/RGBA, explicit edge-count Save Copy; local catalogs retain source identity. | DXF importer and benchmark entity coverage; OFF attribute/vertex-color and repeated-boundary semantics; user-selected point-cloud/hull fallback preserving original data. |
| IO-02 | OFF/JSON, OBJ/VRML polygon boundaries, DXF LINE edges, convex 3D STL/POV-Ray. | Selected-derived export without mandatory promotion, explicit physical units/precision/orientation, surface DXF, render decorations/material transfer and baseline-supported nonconvex domains. Geometry JSON export is currently not recognized as a model by the desktop Open path. |
| IO-03 | PNG still at current canvas size, exact PNG sequences, real-time WebM. Dedicated capture surface, complete encoded-block readiness, transactional native output. `animation-smoke-qnMEdi` verifies offscreen two-frame endpoint content in 0.10.0. | Fixed resolution/alpha/oversampling/DPI/fit settings, active-view still capture, fold/morph/tour export, transparent stills and complete benchmark container/codec inventory. WebM elapsed timing is not deterministic video presentation timestamps. |
| IO-04 | Reference-edge millimeters, page packing/preview, multipage SVG/PDF and native print. Independent PDF dimension checks exist. | Saved printer calibration, net measurement exports, print configuration and real printer qualification. Digital PDF evidence cannot prove physical accuracy. |
| DESK-01 | Native menus/dialogs, shortcuts, single/compare workspace, collapsible sidebars/settings, high-DPI renderer, embedded Guide. | Context-sensitive searchable offline help, command coverage, configurable benchmark layouts/active-view fullscreen, keyboard accessibility and scaling/multi-monitor qualification. |
| DESK-02 | Windows x64 unpacked/portable bundle runs using bundled engine and no development Python. | Installer/uninstaller, reliable upgrades/rollback, appropriate signing, clean-machine offline tests, hardware support matrix, product/dependency/data distribution policy. |

`engine/formats.py::validate_project` presently validates geometry, cursors and authoritative net parameters but does not validate the complete view/document fields. Saved animation validation currently resides in the renderer. `desktop/main.cjs` export always receives an explicit source model from the renderer; `ui/app.js` routes normal export and image actions to the base model/view. `ui/viewer.js::image` always captures the current-size opaque renderer. These are concrete integration seams, not hypothetical missing APIs.

## Ownership and integration discipline

Assign one integrator exclusive ownership of `ui/app.js`, `ui/index.html`, `ui/style.css`, `desktop/main.cjs`, `desktop/preload.cjs`, `engine/server.py`, `package.json` and `scripts/parity-ledger.py` during each batch. Feature owners implement isolated modules and tests, send narrow public contracts, then the integrator wires commands/IPC/schema registration. `engine/formats.py` has one document/interchange owner at a time; split new codecs into separate modules before parallel work. Renderer mutations in `ui/viewer.js` likewise have one owner; feature agents supply geometry/display adapters separately. Fixture/QA owners should derive expected values independently of feature code.

All file names below marked new are proposals. No module listed as new has been implemented by this plan. Parallel pure work is safe after contracts are agreed; Electron/native-dropdown suites and dist/package mutations run sequentially in a coordinated quiet window. Production renderer sandbox remains enabled. External reference files are read-only and hash recorded.

## Ordered implementation batches

### W0. Record option-level cases before claiming parity

QA/documentation owner creates new `docs/conformance/workspace-cases.json` and `tests/fixtures/conformance/workspace/` records for every row above, with dimension, object class, parameters, manual URL, installed 6.0 evidence, expected exception and numeric/display contract. Integrator later reconciles the ledger generator. Start engineering using explicit proposed cases while awaiting installation; keep unobserved cases open.

Acceptance: an inventory reconciles eight 3D morph methods, two documented 4D methods, nine memories, tour operations, import entities and export options. Each case has an oracle and evidence location; unsupported guesses are never relabeled complete. Requires licensed benchmark access to close the external baseline gate.

### W1. Versioned document state and replay foundation

Document owner: new `engine/projects.py`, `engine/history.py`, `ui/document-state.mjs`; narrowly delegate `engine/formats.py` project validation to these modules. Add schema migrations from preserved v1 fixtures, unique document/state/node IDs, finite view fields, metadata/asset references and immutable graph nodes recording inputs, operation, parameters, numeric policy, algorithm version and snapshot hash. Keep full geometry snapshots readable when replay is unavailable. Parameter edits create a branch/re-evaluation, not silent mutation. Make publication/recovery transaction semantics explicit, including concurrent saves, disk-full and interrupted backup handling.

Independent fixtures: hand-authored legacy projects, malformed view arrays/nonfinite values, unknown algorithm-version snapshot, duplicate IDs, forged cache, interrupted writes and two documents with separate branches. Replay a cube scale/reflect/section chain against analytically known coordinates and counts; compare canonical full incidence rather than only topology fingerprints. Kill a child writer at controlled publication stages and prove either previous or next complete document survives. Close DOC-01/03 only after every operation's replay/migration cases pass.

### W2. Memories, active-view identity and composition

Workspace owner: new `ui/memory-controls.mjs`, `ui/active-view.mjs`, pure `ui/model-memories.mjs`. Store nine immutable geometry/view/metadata snapshots, support keyboard/menu store/retrieve/swap/clear, persist slots and select base/derived model through one active-view resolver. Preserve source IDs/provenance when a derived view becomes a stored model. Kernel composition owner separately adds new `engine/compounds.py` and `tests/test_compounds.py`: disjoint union with explicit component identities and transforms; coincidence removal and coplanar blending must use verified CON-06/10 contracts and previews.

Independent fixtures: cube in slot1 then change source scale without changing slot; store a tesseract cell/section; swap twice recovers both exact snapshots; 2D/3D/4D cases; empty-slot failure; incompatible-dimension add. Two translated cubes have analytically doubled incidence and two components; touching/copied faces exercise a separately declared removal/blend policy. Store/retrieve alone does not complete DOC-02 while add/blend remains unavailable.

### W3. DXF and remaining import semantics

Interchange owner: new `engine/dxf.py`, `tests/test_dxf.py`, hand-authored `tests/fixtures/dxf/`; adapter changes owned centrally in `formats.py`/server/native filters. Start ASCII 3DFACE, polyface and declared line/point objects, retaining layers/colors and hidden-edge attributes separately from mathematical incidence. Parse diagnostics include entity/record and source units; deterministic welding has an explicit tolerance and audit mapping. Unsupported entities or binary encodings produce declared diagnostics; never silently pretend an empty partial model is the full import. Add binary/entity domains verified in W0. Preserve original source for any hull fallback.

Independent fixtures: tetrahedron and cube with exact coordinates, triangle fourth-corner duplication, invisible edges, signed polyface indices, bad counts/order, large/small units, coincident coordinates and unsupported entities. Use [Autodesk 3DFACE](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-747865D5-51F0-45F2-BEFE-9572DBC5B151.htm) and [polyface reference](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-96B6288E-F413-46C0-968A-A314171C0AAE.htm), plus a separately generated CAD fixture; output topology/counts and bounds must match independently recorded values, not merely our exporter. Complete OFF color/boundary cases alongside this importer rather than weakening existing strict validation.

### W4. Model export context, units and attributes

Interchange owner: new `engine/export_context.py` and format-specific modules extracted from `formats.py`; UI owner new `ui/export-controls.mjs`, using W2 active-view identity. Explicitly select intrinsic geometry or projected 3D display geometry, orientation, units, precision and optional decorations. Raw 4D OFF remains supported; projected output carries a loss report and projection parameters. Derived export receives its source/operation context without forcing a permanent document. Add JSON model import with type detection and resource validation.

Independent fixtures: 25.4-mm cube exports at one inch with known bounds; an axis rotation has a known matrix; chosen section and base have distinguishable vertex counts; a star cycle remains ordered in OFF/OBJ. Parse DXF/OBJ/VRML/STL with independent consumers; verify oriented closed triangle boundaries and physical dimensions. Generalized STL/POV and hole-containing boundaries depend on validated solid/triangulation semantics; include all benchmark-supported cases, not a permanent convex-only substitute.

### W5. One clock for explosion and rigid folding

Animation owner: extend `ui/animation.mjs` through a migrated sequence schema, new `ui/animation-tracks.mjs` and `ui/explosion.mjs`; adapter changes to net-editor/viewer are owned centrally. Pure `evaluate(time)` returns rotation, section depth, explosion and fold state. Explosion translates independent rendered faces/cells with a declared direction/rate, preserving source geometry; fold uses existing rigid motion descriptors. Track target and dependencies serialize. Add scrub/play/stop/Escape and exact frame export for folded nets. Camera pose interpolation must state conventions if included; do not interpolate unrelated topology implicitly.

Independent fixtures: cube face-center translations from explicit normals; signed explosion reaches zero exactly without changing intrinsic volume/counts; triangle distances remain rigid at fold fractions0,.5,1; unfolded and reconstructed cube net endpoints match trusted coordinates. Combine XW rotation and section depth at non-frame times, cancel during derived calculation, reopen and reproduce endpoints. W5 can run in parallel with W3 after W1 contracts.

### W6. Method-specific dual morphs

Kernel owner: new `engine/morphs/` modules and `tests/test_morphs.py`; animation owner new `ui/morph-controls.mjs` and pure track adapter. Begin sizing plus convex truncation/augmentation with explicit source-dual normalization, then implement expansion and tilting methods individually, including 4D expansion/tilting-quads. Return intermediate incidence, transition events, source mappings and numeric/domain diagnostics. Promotion and export must use evaluated geometry; an alpha crossfade cannot substitute for a topology-changing morph. Record extrapolation, clamp and new-face color rules by method.

Independent fixtures: cube/octahedron dual endpoints, tetrahedron self-dual, cuboctahedron truncation midpoint and rhombic-dodecahedron augmentation midpoint with analytic incidence/metrics. Verify reciprocal relationships independently. Add prism, nonuniform, star and infinite-dual benchmark success/failure cases, then tesseract/16-cell endpoints and 4D method transitions. Eight visible method labels without distinct verified evaluators do not satisfy ANIM-02. Generalized method domains need mathematical review and the W0 installed baseline.

### W7. Tours and reproducible transitions

Animation owner: new `ui/tour.mjs`, `ui/tour-controls.mjs`, `ui/transitions.mjs`; document owner registers event snapshots/references and tour import/export. Save ordered immutable model events, duration, per-event transition and layout inheritance; support add/replace/delete/reorder/merge/next/previous. Evaluate an absolute time independent of prior playback, including transition boundaries and random methods using recorded seeds. Snapshot source assets needed offline. Transitions compose render states without mutating intrinsic geometry; geometric morph events use W6 evaluators.

Independent fixtures: cube folding -> octahedron morph -> tesseract section, exact boundary times, zero-duration transition, reorder/merge, inherited vs replaced camera/layout, seeded selection and cancellation during model evaluation. Two fresh processes evaluate the same requested times to equivalent geometry/view state. PNG manifests identify event/time/hash; every tour frame references an authoritative source state. W7 depends on W1/W2/W5; full morph tour coverage depends on W6.

### W8. Export renderer and baseline codecs

Rendering owner: new `ui/capture.mjs` creates bounded offscreen captures at fixed pixel dimensions, alpha/background, fit/margins and oversampling without changing the live viewport/camera. Animation export consumes W5/W7 evaluations. Native owner: new `desktop/media-export.cjs`, dependency/publishing review and transactional codec sessions for the W0 inventory. Retain browser WebM as a documented real-time option; exact-rate video needs supplied timestamps or offline frame encoding. Do not describe encoder buffering as deterministic frame timing. Support required still formats and metadata, including DPI where applicable.

Independent fixtures: exact PNG dimensions, transparent background alpha with opaque geometry, checker/diagonal antialiasing, frame state hashes, aspect ratio, DPI tags, fold/morph/tour export and cancellation. Decode every container with independent tools; verify frame counts/timestamps, both endpoint content and no dropped startup/final samples. A codec file signature alone is insufficient. All baseline format gates remain open until available codecs, distribution terms and clean-machine packaged behavior are verified.

### W9. Physical output and offline context help

Net/print owner: extend `engine/net_printing.py`, new `engine/net_measurements.py` and `ui/print-controls.mjs` with printer/page calibration, saved settings and CSV/JSON measurement exports carrying source entity IDs, units and tolerances. Documentation owner: new `docs/manual/` source and `ui/help.mjs` searchable offline help indexed by command/requirement; context F1 routes current focus or active workflow to an operation-domain page. Add keyboard/focus access and multi-layout persistence through the central command registry.

Independent fixtures: reference edge25mm and known hinge angles in exported tables; parse vector PDF scale and source labels; preserve matching tabs and page packing across save/reopen. Print a calibration grid and reference net at100%, measure physical lengths and record printer/driver/paper/settings; no CI mock closes that gate. Help tests run with network disabled and find correct topics from Animation, DXF errors, exact evidence and print controls. Scaling cases include100/125/150/200%, multiple monitors, keyboard-only commands and active-view fullscreen.

### W10. Windows installation, updates and release qualification

Release owner: new installer/update packaging scripts and `desktop/updater.cjs` only after distribution policy is settled; integrator owns package/build config. Provide install/uninstall, associations, non-admin behavior where declared, version upgrade/rollback and preserved private documents/settings. Signed artifacts and an authenticated update manifest are prepared under the approved release identity; update checks remain separate from local mathematical computation. Use [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) and [update documentation](https://www.electronjs.org/docs/latest/tutorial/updates) as implementation guidance without requiring hosted computation.

Independent acceptance: disposable clean Windows10/11 x64 environments with no Python/Node/devtools; offline cold start; non-ASCII/long paths; restricted user; interrupted installation/update; signed artifact verification; downgrade/migration; uninstall preserves user documents; repeated document/export sessions have bounded resources. Record GPU/driver/RAM/display and cold/warm performance. ARM/macOS/Linux remain separate advertised-platform decisions with their own gates.

## External release gates and work that can proceed now

| Gate | Evidence required | Engineering can continue meanwhile |
| --- | --- | --- |
| Licensed installed Stella4D6.0 baseline | Option-level workflow recording, supported class/dimension cases, exceptions and sample outputs | W1 state/replay, W2 memory core, W3 documented DXF entities, W5 common clock and W8 PNG capture |
| Specialist geometry review | Independent morph/nonconvex interpretation, topology-transition and numerical contract review | Convex analytic fixtures and reproducible trace output; retain broader gates |
| Signing identity and distribution policy | Approved publisher identity/credentials, product terms and dependency/catalog/codec notices | Installer draft, local verification and offline qualification scripts; no public publishing implied |
| Clean-machine and hardware access | Genuine supported OS/GPU/driver cases, offline install/update and recovery logs | CI fault injection and repeatable case scripts |
| Physical printers | Measured calibration/printing evidence by declared printer/driver/settings | SVG/PDF/table fixtures and native dialog workflow tests |

Do not pause independent engineering merely because one external gate is pending. Equally, do not convert external absence into a narrower claimed parity domain. Completion requires the entire supported baseline scenario inventory, shipped-interface evidence, independent outputs, migrations/recovery and documentation. The next concrete authorized implementation proposal is W1 state/migration/replay contracts; W3 DXF and W5 track evaluators can then be delegated with isolated module ownership.
