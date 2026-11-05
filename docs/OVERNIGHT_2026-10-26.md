# Overnight feature program — October 25–26, 2026

Lead: Claude (operational lead, per Randall). Builders: parallel Codex (gpt-6.1-sol) workers,
one feature package each, in separate worktrees of a private integration repo
(`C:\Users\Randall\Documents\polytope-orchestra`). Claude reviewed each diff, merged,
resolved conflicts, ran the suites and the hidden Electron smokes, clicked through features
in a hidden app, then synced verified checkpoints into this repo. Development version
remains 0.27.21; nothing was committed to this repo, packaged, sealed or published.

Worker briefs: `polytope-orchestra/briefs/`. Final worker reports: `polytope-orchestra/logs/*.last.md`.

## Merged features (where to find them)

| Package | Parity | What users get | UI location | Doc |
| --- | --- | --- | --- | --- |
| W5 Viewer UX | VIEW-05/07, VIS-02 | Thick edge / translucent face / cell selection highlights, element sets, hover identification, 1/2/4/6-view layouts with per-view projection and maximize, compact toolbar, fresh-profile start in rotating 4D perspective | Viewport; **Multiple views** | VIEWER_UX.md |
| W6 Face surgery | CON-07, LIB-03 | Augment/excavate selected face or all congruent faces, prism drilling (genus reported), vertex-orbit placement, intersection refusal | Construct → Augment / excavate | FACE_SURGERY.md |
| W3 Element types | INFO-01, VIS-02 | Symmetry-orbit types of vertices/edges/faces/cells, transitivity labels, components; click a type to select it; color by face/cell type | Analysis → Element types; Appearance → Color by | ELEMENT_TYPES.md |
| W2 Condition fitting | CON-09, LIB-02 | "Make faces regular" (regular/planar/equal-edge/equal-area objectives, symmetry-preserving), residual report, near-miss deviation in Analysis | Construct → Fit geometric conditions | CONDITION_FITTING.md |
| W12 Subdivision & Conway | CON-08 | Kis/midpoint face subdivision, sphere projection with edge variation, symmetry-axis zonohedra and added zones, Conway d/a/k/t/j/e + notation (e.g. `tI`) | Construct → Face subdivision and Conway operators | W12_FACE_CONWAY_ZONES.md |
| W4 Faceting diagram | FAC-01..04 | Interactive faceting diagram: pick vertices to draw facets, Undo/Redo, symmetric 3D preview, Make base model; search result stepping, spiky/tidy filters | Construct → Faceting diagram (3D) | FACETING_DIAGRAM_EDITOR.md |
| W1 Compounds | LIB-03, CON-06 | **Add Dual** (midsphere / 4D ridge sizing); Compounds library family (36 entries, 24 UC indices, chiral pairs, 4D dual compounds) | Construct → Add Dual; Library → Compounds | COMPOUND_LIBRARY.md |
| W7 Printable export | IO-02, VIS-01 | Strut (cylinders+spheres), panel and solid models of the displayed geometry incl. 4D projections; binary/ASCII STL, OBJ, 3MF; mm sizing, warnings, no bases/feet | Export → Printable model | PRINTABLE_EXPORT.md |
| W8 Library coverage | LIB-01/05/07/08 | All 47 non-prismatic convex uniform polychora + 18 polyhedral prisms natively, Bowers/U/C/W aliases, property filters and query syntax (`faces:12 v<100`, `symmetry:Ih`), Related links, uniform family generator | Library → Geometry properties; Analysis → Related | LIBRARY_COVERAGE.md |
| W9 Stellation diagrams | STEL-02/04/05 | Interactive facial stellation diagrams with orbit-replicated clicks, attached filter, cavities, reflexibility, support-closure enumeration | Construct → Advanced → Interactive stellation diagrams | STELLATION_DIAGRAMS.md |
| W9b Miller's rules | STEL-03 | The 59 icosahedra (32 reflexible + 27 chiral) with Du Val labels, stepping, Make base model | Stellation → criteria "Miller's rules" | MILLER_STELLATIONS.md |
| W10 Discoverability | DESK-01, INFO-03 | Command palette (Ctrl+K), group "?" help + F1, shortcut sheet (Shift+/), model information editor | Top bar search icon; group headers | DISCOVERABILITY.md |
| W11 Materials & styles | VIS-01/03, IO-03 | Seven style presets (Studio, Dark gallery, Glass, Metal, Neon edges, Paper, Geomag), procedural reflections, gradient/transparent backgrounds, transparent and ×2/×4 PNG | Appearance → Style; PNG options | MATERIAL_STYLES.md |
| W20 First run | DESK-01 | Welcome panel with 12 rendered featured models, six guided walkthroughs, three sample projects, empty states (suppressed in hidden test mode and on project/recovery startup) | Help → Welcome | FIRST_RUN.md |
| W13 Visibility & orientation | VIEW-01/03/04 | Per-type/per-element/component visibility, orient to symmetry axis (auto "greatest symmetry"), linked selection between base and derived views | Analysis → Element types; Orient to symmetry axis | ELEMENT_VISIBILITY_LINKED_VIEWS.md |
| W16 Interchange | IO-01/02 | Colored GLB, OBJ+MTL, X3D; displayed/derived export across formats; DXF LWPOLYLINE/polygon meshes, layer components, clear binary/ACIS refusals | Export → Displayed geometry | INTERCHANGE.md |
| W22 Near-miss Johnson solids | LIB-02 | 10 near-miss entries fitted with symmetry-preserving least squares, measured deviations shown in Analysis, `near miss` search/filter | Library → Near-miss Johnson solids | NEAR_MISS_JOHNSON_SOLIDS.md |
| W23 Paper nets for stars & compounds | NET-01/02/03 | Visible outer surface of stellations/compounds/stars (e.g. great stellated dodecahedron → 20 spike pieces), tabs, colors, packing/PDF | Nets → Visible surface (paper model) | VISIBLE_SURFACE_NETS.md |
| W25 Dense performance | VIEW-02/05 | Buffer reuse, leaner projection writes, screen-space pick index: 120-cell rotation 1.37 → 0.65 ms/frame, stereographic highlight 89 → 38 ms | — | PERFORMANCE_DENSE.md |
| W26 Generalized 4D | CON-05, VF-01, NET-06 | Incidence-based 4D truncation/rectification (incl. star polychora, counts checked vs Bowers/Klitzing), combinatorial vertex figures, star-cell 4D nets with matching faces | Construct → Incidence truncation / rectification; Vertex figure mode; Nets → 4D whole-cell net | GENERALIZED_4D_CONSTRUCTIONS.md |
| W21 Polish | DESK-01 | Mode-aware export labels, real construction names (e.g. Conway results named from the catalog), grouped Construct panel (Modify / Fit & refine / Facet & stellate / Create), accessibility fixes | — | PRODUCT_POLISH.md |
| W28 Filled density sections | SEC-01/05 | Filled cross-sections of star/nonconvex 3D and 4D models with nonzero / even-odd / density ≥ k fills, density legend, promotion | Section mode → Filled (density) | FILLED_DENSITY_SECTIONS.md |
| W29 Animation | ANIM-01/02/03 | 4D sizing/truncation dual morphs, color interpolation, morph-to-dual tour transitions, deterministic offline WebM | Dual morph; Tours → transition | W29_ANIMATION.md |
| W31 Desktop readiness | DESK-01/02 | `npm run package:installer` (per-user NSIS), .polyproj/.off associations, single-instance open, Open Recent, display-safe window restore | File → Open Recent | DESKTOP_READINESS.md |
| W30 Paper-model UX | NET-02/03, IO-04 | Compact piece layout, P-numbering, scaled edge labels, mountain/valley folds, assembly sheet with 3D thumbnail | Nets → Re-arrange pieces; Paper and export | NET_PAPER_UX.md |
| W32 Solid star printing | IO-02 | Watertight outer-surface solids of stellations/compounds/stars (STL/3MF/OBJ/GLB, colors), convex hollowing | Export → Printable → Solid | SOLID_PRINTING.md |
| W34 Generator options | CON-01/02/11 | Subdivided cuboids, triangular grids, Cayley–Menger tetrahedra, SC/BCC Waterman with stepping, twisted tori, gyrochora | Construct → Create a model | GENERATOR_PARITY.md |
| W35 Information & stereo | INFO-02, VIEW-07 | Per-type measurement table (edges/faces/cells, dihedrals, radii, density, genus) with copy/CSV; cross-eye stereo with separation/convergence | Analysis → Measurements by element type; stereo controls | INFORMATION_PANEL_STEREO.md |
| W33 Star uniform polychora | LIB-05/06 | 79 native star Wythoffians (66 H4, 7 B4, 6 F4) incl. all ten regular stars, Bowers names, counts/cell types checked | Library → Star uniform polychora (Wythoffian) | STAR_UNIFORM4.md |
| W36 GIF & MP4 | IO-03 | Animated GIF (palette/dither/loop) and H.264 MP4 (WebCodecs + built-in muxer) for animations and tours; Reels/square/landscape presets | Animation/Tours → Export format | W36_MEDIA_EXPORT.md |
| W37 Guide | DESK-01 | 52 task-oriented Guide topics in ten goal sections, What's new page, help mappings, action index | Help → What's new; group "?" | W37_GUIDE.md |
| W38 Target rendering | IO-03 | Stills and video rendered at the exact output size/aspect with model fit and margin, ×2 supersampling, 4K presets | PNG options; Animation → Export options | W38_TARGET_RENDER.md |
| W40 4D compounds & scaliforms | LIB-06 | 8 new 4D compounds, Tuta and Koho scaliforms, fissary flags, vertex-link relationships | Library → 4D compounds / Scaliform polychora | COMPOUNDS_SCALIFORMS_4D.md |
| W41 Uniform compounds | LIB-03 | All 75 uniform compounds UC1–UC75 generated by symmetry, 11 angle families + n/d/k parameters, colored components | Library → Compounds; Construct → Uniform compounds | UNIFORM_COMPOUNDS.md |
| W47 Robustness | IO-01, DOC-03 | Seeded fuzzing of OFF/DXF/JSON/project inputs (14k mutations long mode), input/work limits, safer engine request framing, recovery falls back to the previous autosave | — | INPUT_LIMITS.md |
| W44 Presentation mode | (exceeds) | Full-screen showcase with captions, tour/gallery/library playlists, cross-fades and dual morphs, recordable to MP4/WebM/GIF | View → Presentation (F5) | W44_PRESENTATION.md |
| W48 Blending & merge | CON-10, CON-06 | Planar unions with holes and star winding, Merge compound into one polyhedron, approximate pseudo-uniform equal-edge variants | Construct → Modify → Merge compound; Pseudo-uniform; Face editing → Union selected faces | COPLANAR_REGIONS.md |
| W49 Fabrication | NET-05, IO-04 | Inset face braces, dihedral hinge strips, vertex rosettes; edge/face measurement CSV/PDF and labelled flat-face DXF (mm) for laser cutting | Nets → Paper and export → Reinforcement parts and measurements | NET_FABRICATION.md |
| W52 Second polish | DESK-01 | Construction names, Analysis ordering, disabled reasons, help mappings, palette discovery, deferred progress for late features | — | SECOND_POLISH.md |
| Smoke repair 2 | qualification | All 18 hidden Electron smokes pass after the merges; product fixes: welcome cards no longer collide with library selectors, startup view no longer drops the in-flight section, intro spin no longer blocks net edits | — | — |
| Smoke repair | qualification | All stale Electron smokes pass in hidden mode (desktop, inspection, workspace, units, tours, memories, animation, catalog, empty-workspace + core/sections/nets/picking) via `scripts/smoke-helpers.cjs` | — | — |

## Lead fixes during integration

- Startup crash from the Miller controls syncing before any document existed (found in the real app; unit tests passed).
- Startup perspective view condition and projection-select sync.
- Selection sets unified on one highlight engine (W3 + W5 overlap).
- Element-type tests moved to the shared highlight layers.
- Visible-surface net panel was dropped by the Nets layout pass (found in the real app); kept.
- Pose test harness updated for linked-selection sync.
- Welcome cards / startup and test-harness fixes; `test:features:run` added because the declared Node suite exceeded the cmd.exe command-line limit (`npm run test:features` fails on Windows; release qualifiers spawn directly and are unaffected).
- Restored legacy missing-view project migration that W47's hardening had turned into a refusal (my brief's wording caused it).
- Restored the original `block(sizes)` generator after W34's new block kind shadowed it.
- Fixed a merge-tool line corruption in the catalog source list (caught by review; merge tool hardened).
- MP4/GIF framing defaults to crop/fit; viewport PNG sequences capture the viewer directly.

## How to try it

`npm start` (dist is rebuilt). Good first stops: Help → What's new; the Library (Compounds, Star uniform polychora, Near-miss Johnson solids, 4D compounds); Construct → Add Dual / Make faces regular / Conway `tI`; Nets → Visible surface on a great stellated dodecahedron; Export → Printable model (Strut on a 4D projection, Solid on a stellation); Animation → Export format MP4 1080×1920; View → Presentation (F5).

## Honest parity status

Every one of the 73 ledger requirements received working functionality tonight or earlier, and the largest named gaps were closed (uniform compounds, convex and Wythoffian star uniform polychora, faceting and stellation diagrams with the 59 icosahedra, condition fitting, excavation/drilling, element types, visible-surface paper models, filled density sections, 4D incidence truncation, printable and interchange exports, GIF/MP4). The ledger statuses were deliberately left as written: "validated" in this project means benchmark-qualified against an installed Stella4D, which has not been done. Remaining named follow-ups: full 2,191-polychoron native coverage (snubs, non-Wythoffian), arbitrary-subgroup stellation diagrams, exact/interval certificates, physical print/printer calibration, signed installer and clean-machine install qualification, and the fresh-user observation protocol (CORE_WORKFLOW_OBSERVATION.md).

## Verification at the final checkpoint (integration commit 5b3c1c1, synced 03:36)

- Node feature suite (`npm run test:features:run`): **2,837 / 2,837 pass** (2,352 at the start of the night).
- Native pytest: **5,672 passed**, 1 skipped, 96 subtests (4,524 at the start).
- Hidden Electron canary: pass (integration repo and this repo).
- Hidden Electron smoke battery, 17 scripts: core, sections, library, catalog, empty-workspace, reports-startup, morph-workflow, export-workflow, nets, workspace, inspection, units, memories, tours, animation, picking, desktop (68 checks) — **all pass**.
- Hands-on checks in a hidden app: element types, Add Dual, Conway `tI`, library queries (`rox`, `W119`, `faces:12 v<100`), command palette, style presets, printable STL/3MF of a tesseract projection (validated file structure, 100 mm), MP4 export decoded by ffprobe (H.264 1080×1080, 49 frames), visible-surface paper net of the great stellated dodecahedron (20 pieces, no overlaps), Miller criteria present.
- Packaging (unsigned, version still 0.27.21, separate folder so the versioned release history is untouched): `release/overnight-2026-10-26/Polytope Laboratory 0.27.21.exe` (portable) and `Polytope Laboratory Setup 0.27.21.exe` (per-user NSIS installer). The packaged executable passes the hidden canary and the core workflow smoke with its bundled engine (`packaged: true`). The installer's custom shortcut page was fixed to compile after MUI/plugin setup.
- Not done: formal packaged/installer qualification against the release checklist, physical printing, screen-reader and multi-monitor/HiDPI checks, fresh-user observation.
