# Development roadmap

Updated October 7, 2026: **pause feature expansion and make the core experience
excellent.** This replaces the earlier feature-coverage priority. Polytope
Laboratory is an early community preview, not yet a direct Stella4D competitor.
Stella4D remains a reference for long-term scope, rather than the measure of
success for the next release.

The immediate goal is to make existing workflows simpler, faster and more
reliable. A longer feature list is not a substitute for a usable application.

## Core workflows first

Focus on finding and opening a model, controlling the view, inspecting geometry,
constructing a dual or truncation, exploring a section or net, saving a project,
and exporting a result. Review the complete path through each task, including
defaults, feedback, undo and errors.

1. **Simplify the interface.** Group controls in the order a task requires them.
   Keep common actions easy to find, use consistent labels and units, and show
   advanced settings only when relevant. Reduce competing panels, scrolling and
   repeated buttons. Judge visual polish alongside readability and discoverability.
2. **Review every visible data field.** Ask whether it helps someone act or
   understand the current result, and whether it needs to appear now. Put raw
   JSON, provenance records and detailed validation behind an explicit details
   action. Keep limitations that affect the current task visible and explain
   them in plain language. Preserve access to the underlying mathematical data.
3. **Measure and improve performance.** Record end-to-end timings for model
   loading, duals, truncations, sections and nets, plus frame times for rotation
   and morph playback. State the hardware, model and settings. Profile before
   choosing an optimization, then compare the same workload before and after.
4. **Investigate reported morph problems.** Reproduce slow playback and
   unexpected scaling on the 3D truncated tetrahedron. Establish the intended
   center, radius and framing behavior, then verify intermediate poses and
   endpoints. These are reported problems, not completed fixes.
5. **Make documentation useful.** Lead with what the app does, how to start and
   known limits. Write release notes around changes a user can observe. Keep
   test logs and implementation detail in technical reference documents.
6. **Test with users.** Have people attempt the core tasks without coaching.
   Record where they hesitate, what they expect and whether they finish. Use
   those observations to choose the next simplification.

## Conditions for resuming feature expansion

Resume deliberately after the core workflow review, rather than after a set
number of new controls or catalog entries. Before resuming:

- Fresh users can complete the core tasks without being guided through the UI.
- Reported dual latency and truncated-tetrahedron morph problems have been
  reproduced or investigated with their remaining uncertainties documented.
- Representative performance measurements have a recorded baseline and
  comparisons for the changes made; no unmeasured FPS promises are published.
- Common controls have consistent placement, clear labels and sensible defaults,
  and unnecessary technical data has moved out of the default view.
- Save/Open, undo/redo and affected exports pass relevant checks in the packaged
  app. Any unresolved limitations are stated in the release notes.

Feature implementation already staged for a future version remains deferred.
Necessary fixes to current workflows can continue during the pause.

## Available in the development build

- 3D/4D catalog browsing, source-preserving imports, parameterized generators,
  and structured count searches such as `dim:4 v>=24`.
- Hulls, duals, truncation, prisms/products, compounds, face placement,
  augmentation, geodesics, zonohedra, segmentotopes, and spring relaxation.
- Source-incidence 3D cuts, midpoint rectification and regular-face quasitruncation.
- Sections, vertex figures, symmetry, measurements, expressions, and units.
- Literal finite 3D/4D incidence reciprocation retaining ordered star/generalized links.
- Orthographic, perspective, stereographic, and stereo displays; picking and visibility.
- One-to-six independent views, saved cameras, linked picking, and grid PNG export.
- Static expansion/runcination of closed convex 3D/4D sources with saved recipes.
- Regular-face, equal-edge, and equal-area condition fitting with residuals
  and explicit adoption of valid near misses.
- Stellation, automatic faceting, and editable source-linked faceting diagrams.
- Supported tidy/spiky automatic faceting search filters with bounded work receipts.
- Editable nets, folding, paper packing, physical SVG/PDF exports, and printing.
- Nonconvex/toroidal closed 3D face nets, including simple planar concave faces.
- Whole-cell nets of nonconvex 4D shells with complete ordinary convex/concave cells.
- Internal support panels and CSV/JSON construction measurements.
- Formatted element text, PNG face textures, annotated nets, and capture.
- Automatic source ID, edge-length, coordinate, and incidence labels.
- Material presets, source-color tinting, highlights, lights, and viewport themes.
- Procedural bump and fixed studio reflections, with capture readiness.
- Environment-only refraction with expression input and saved refractive index.
- Bounded convex face/cell distances, closest points and numerical distance bounds.
- Exact rational 3D surface sections with concave/star winding and source evidence.
- Stellation cell diagrams, support/layer selection, conservative cavity filling.
- Stephanoid construction with explicit bow ties, compounds, and sizing options.
- Edge-defined tetrahedra, irregular triangular prisms, and triangular grids.
- Sphere projection in 3D/4D, preserving source incidence and planar faces/cells.
- Eight 3D dual-morph methods, keyframe animation, saved tours, PNG/video export.
- Source-owned moving morph labels and eligible affine PNG face sheets.
- Sizing morphs of finite closed star/nonconvex 3D boundaries.
- Expansion morphs retaining actual star/nonconvex source flags and planar sheets.
- Tidy-dual faceting criteria with actual polar geometry and complete/unknown receipts.
- Automatic exact full/proper source-symmetry faceting with exhaustive discovery receipts.
- Default/per-edge no, single or double physical tabs, side choice and saved preferences.
- Exact integer regular source choices with full/proper faceting symmetry groups.
- Source-color paper batches with detached print cuts, saved IDs, tabs and content.
- Generalized 4D expansion with complete source/polar product cells and source content.
- Concave/toroidal 3D net folding through saved keyframes, tours and PNG/WebM export.
- Searchable offline guide with 23 topics and F1 control context.
- Complete ordinary 4D cell sections, with concave/disconnected/holed regions.
- Source-owned section labels and eligible whole-face PNG, animation and tours.
- Saved dual-morph ratio tracks with source content and PNG/WebM export.
- Explicit camera fitting across sampled export frames.
- Four-face coincident-edge joining for ordinary convex/concave/toroidal pieces.
- True projective ideal identities with clipped wire duals and saved view recipes.
- Supplied snub reflected forms, symbol aliases and separate Skilling geometry.
- Signed 3D winding and algebraic area/volume with saved JSON/CSV evidence.
- Literal 4D arrangement/regiment comparison and source-owned compounds.
- Finite distances to actual simple planar concave 3D face regions.
- Multiple documents, project metadata, undo/redo, operation replay, saving, and recovery.
- JSON geometry exports retain project metadata and notes; other formats report losses.
- Matching 3D vertex figures to finite 4D constructions.
- Attributed compound/noble/toroidal families and 980 additional 4D source entries.
- Seven regular-faced Stewart toroids, including five named excavations and two
  original variants, with attributed source parts and checked genera one through three.

Each workflow has supported geometry domains; available controls do not imply
every generalized, nonconvex, or singular input is supported.

## Deferred feature work

The previous expansion plans remain a backlog: broader morph domains and
combinations, specialized 3D families, more 4D catalog coverage, generalized
construction and fitting, source-incidence cuts, 4D Waterman construction,
completion from star vertex figures, and symmetry-orbit coloring. They are not
the immediate development queue.

The [0.26 community preview](RELEASE_0.26_PREVIEW.md) and corresponding source
archive are published. Detailed feature inventories and historical checks
describe supported domains; they do not establish complete Stella4D parity.

## Development checks

Use a build and a small relevant check for each change. Fix obvious launch,
save, export, and geometry errors before shipping. Reserve broad regression
runs and exhaustive competitor comparisons for stable-release preparation or
specific investigations. Retain existing evidence without treating every
historical conformance gate as a blocker to an open-source development release.
