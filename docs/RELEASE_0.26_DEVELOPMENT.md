# 0.26 development

The [public GitHub repository](https://github.com/Pardesco/polytope-laboratory)
and [0.25 GPLv3 prerelease](https://github.com/Pardesco/polytope-laboratory/releases/tag/v0.25.0)
are live. Issues are enabled. GitHub asset digests match the frozen Windows
portable and corresponding source ZIP; every archived file and runtime input was
verified against that checkpoint. Ongoing 0.26 sources are not in those assets.

The current source inherits the [0.25 features](RELEASE_0.25_DEVELOPMENT.md) and adds:

- [Complete ordinary 4D cell sections](ORDINARY_CELL_SECTIONS.md), including concave
  regions, disconnected components and checked holes, literal source IDs, cell
  colors, embedding and guarded history promotion. Surface curves remain a
  separate option; star/self-crossing cell filled semantics remain unsupported.
- [Source-owned section content](SECTION_SOURCE_CONTENT.md): formatted source-cell,
  face, edge and surviving vertex text follows ordinary 4D cell sections, including
  repeated and holed regions. PNG is mapped only on a genuinely surviving whole
  source face; unsupported requested mappings refuse explicitly. Animation/tour
  capture and promotion preserve original source ownership.
- [Saved dual-morph ratio tracks](DUAL_MORPH_ANIMATION_EXPORT.md) with rotation,
  actual per-frame native geometry, moving source text/PNG, cancellable PNG/WebM
  capture and original view/ratio restoration. Capture currently requires Base
  model and supported finite morph/content domains.
- [Explicit Fit export frames](ANIMATION_FRAMING.md), sampling every export time
  and saving one camera around its displayed geometry. It fixes the demonstrated
  concave-fold endpoint clipping without changing cameras during ordinary export.
- Four-face coincident-edge assembly for qualified ordinary convex, concave and
  toroidal pieces: explicit
  outside/inside face pairing, tongue-in-groove, internal support, no support and
  disconnected policies, physical tabs, detached editing/history and SVG/PDF.
  Star/immersed and multiple-contact assemblies remain open domains.
- [Projective / infinite incidence duals](PROJECTIVE_INCIDENCE_DUALS.md) with true
  ideal identities, literal source links, independent wire display/camera,
  clipping-distance recipes, source-linked selection and PNG. Infinite-face
  filling, solid measures, nets and infinite-dual morphs remain unavailable.
- Twelve supplied reflected snub forms, searchable U1-U75 Wythoff symbol aliases,
  and the separate attributed Skilling exceptional source. Qualified incidence
  symmetry reports nine chiral and three achiral selected sources; reflection
  alone is not a chirality certificate. Literal source reflection retains
  source IDs, RGBA, text/PNG, units, notes and replayable history.
- [Generalized 3D density and algebraic information](GENERALIZED_DENSITY.md),
  including signed point winding, face-cycle area and volume, orientation choices,
  saved source-bound evidence and CSV/full-source JSON. Union/bulk volume and 4D
  density remain separate domains.
- [Literal 4D arrangement/regiment comparison](COINCIDIC_REGIMENTS.md), saved
  two-source records, rank correspondence navigation and independent-incidence
  compounds with both sources’ RGBA, text/PNG, notes and units.
- [Bounded ordinary concave-face distances](ORDINARY_CONCAVE_DISTANCES.md) with
  actual source-region closest-point witnesses. Star/self-crossing regions and
  nonconvex 4D cell distances remain unavailable.
- Source PNG annotations now survive actual net PDF output. Both print-window
  policies permit embedded data images. The frozen 0.25 preview retains the old
  behavior; its public release notes document that limitation.

Focused mounted native/Node checks and the Vite build pass. Real desktop evidence:
`artifacts/feature-0.26-quick-254ZbX/result.json` verifies five morph PNG poses and
five decoded VP8 frames, three fitted concave-fold PNG poses and three decoded
VP8 frames, source/camera restoration, concave section promotion/Save/Open and
open ring-cap rendering. The cell-section controls and legacy section-depth
animation retain their explicit domain after root integration.

`artifacts/coincident-assembly-quick-G0Jdvd/result.json` verifies all four assembly
policies, source-owned text/PNG, SVG and actual Chromium PDF, compact history and
Save/Open. `pdf-review.json` confirms an embedded PNG, both SUP instructions and
A4 dimensions within Chromium's 0.15 mm print quantization. Earlier failure
artifacts are retained; the first successful PDF exposed the blocked-image bug.

`artifacts/projective-snub-quick-fWUhHk/result.json` verifies actual catalog
selection, Skilling PNG, source reflection/content/history replay, U3 reciprocal
PNG/source selection and clipping recipe Save/Open, and all U75 ranks with sixty
retained ideal IDs. Mounted five projective native and three snub native checks,
plus five Node groups, pass. PNG save feedback was fixed during integration;
three focused controller groups pass afterward.

`artifacts/coincident-assembly-quick-2rcRiL/result.json` verifies the ordinary
concave extension through the same four policies and source-content export and
Save/Open. Actual PDF review proves the PNG and both SUP instructions. Its custom
1000 mm page measures 1000.167 mm; an exact physical-page certificate is not
claimed. The mounted ordinary-solid oracle also passes the concave and genus-one
toroidal native cases, including actual surface-contact and inside/outside checks.

Section content passes three mounted native and four actual Viewer/animation/tour
checks. Build now passes 153 modules. Offline help has 25 searchable topics, with
new projective/assembly control context and updated section/catalog instructions.

Next isolated work is 4D D4-lattice Waterman construction, finite completion
from nonconvex/star vertex figures and verified symmetry-orbit coloring.
GPT-6.1-Sol subagents use separate stages; root mounts completed changes and owns
actual desktop checks. The feature-complete goal remains active. Practical 90%
Stella4D coverage has not been measured; no full regression is claimed.

Section desktop capture/SaveOpen passes `artifacts/section-content-quick-ApisKX/result.json`.
Root fixed export-owned read admission without allowing construction or promotion
during export; three focused section-controller groups pass, including lost-owner refusal.

Generalized density mounted native/three real-native controller groups and actual
inspector/query/JSON/CSV/evidence SaveOpen pass:
`artifacts/density-info-quick-X0hY43/result.json`. The source’s algebraic definitions
and unavailable filled/union measures remain visible in the inspector.

Regiment native three groups, concave-distance native six groups and combined
Node five groups pass. Root fixed empty-workspace comparison initialization and
made the shared history commit return its actual published document; native-supported
comparison/compound branching is enabled in the history UI.

Actual comparison/navigation/compound PNG/source content/SaveOpen/replay and
concave bounded-versus-flat measurement pass:
`artifacts/regiment-distance-quick-UdLQGc/result.json`. Nine runnable native
projects are included in `examples/0.26` and in the matching source archive.
