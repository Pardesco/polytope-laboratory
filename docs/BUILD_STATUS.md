# Active development - October 7, 2026

The feature-complete goal remains active, using GPT-6.1-Sol subagents. Randall
prioritizes free/open-source feature coverage or roughly 90% of Stella4D,
with a build and relevant checks. Practical 90% coverage is not yet measured.
The historical pause below is superseded; its evidence remains retained.

Working sources are **0.25.0 development**. The usable **0.25.0 GPLv3 community
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
See `RELEASE_0.25_DEVELOPMENT.md` and `OPEN_SOURCE_ROADMAP.md` for current limits.

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
build pass. These later additions are not in the 0.24 binary or source ZIP.

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

Next staged work: complete generalized 4D cell sections, four-face coincident-edge
assembly, and actual dual-morph animation/video export. Via-snub is a proposed
future method, not a grounded current benchmark requirement. Protected importer files and
historical release assets remain unchanged. Initial full-test receipts predate
the new features. The expanded native regression was stopped at Randall's request
and contains unresolved failures; old frontend doubles were fixed in focused
checks. Reinforcement PDF verification was corrected for Chromium quantization;
the complete desktop wrapper was not rerun. Retained failures remain inspectable.

Preview receipt: `artifacts/community-preview-0.25.0.json`.
Source archive receipt: `artifacts/source-package-0.25.0.json`.

---

# Overnight build work record

Current working checkpoint: development stereographic normal fix passes1,584
frontend tests, Vite build and actual development GPU/Worker seam checks. The
qualified portable remains0.21; diagrams, dual morphs and element content remain
separate copied integrations. Work is paused at Randall's request for the next
session. Full parity remains2/73 validated (~3%),65partial,6unstarted.
Read [the current handoff](SESSION_HANDOFF.md) before resuming; historical
release/test milestones below describe their retained source snapshots.

The initial folder contained only the September 30 build specification. A standalone implementation now exists; the active goal is to continue toward feature completeness. The original specification and existing web/addon projects have not been changed.

## Latest checkpoint: verified release 0.21

Release 0.21 integrates bounded automatic faceting with native history, improved dense conforming stereographic refinement and immutable timestamped video capture. Full native **4,117 passed/one skip**, frontend **1,576 Node tests passed**, all 524/221 source inputs unchanged. Compiled native and exact frontend reproduction pass. All **43 packaged suites and the actual portable launcher pass**. The exact unsigned portable is promoted locally, older releases unchanged, and 847 qualified inputs preserved. The ledger is **2 validated, 65 partial, 6 unstarted; 71 open**. See [release evidence and remaining work](CANDIDATE_0.21.md). Candidate 0.20 stays unpromoted with its preserved endpoint defect. Historical milestones below retain their original evidence, including weaker endpoint checks superseded by the new diagnosis.

## Historical verified release: 0.19

Source-feature zonohedra support ordered mixed selections and native operation history; the actual development desktop check passes eight groups (`artifacts/source-zonohedron-smoke-Xbtbyx/result.json`). Cell extraction 0.2 preserves ordered source faces, RGBA/null colors and units while retaining explicit legacy replay behavior. Its corrected centroid frame passes the fresh full native suite: **3,702 passed, one skip**, with all 510 qualification inputs unchanged (`artifacts/native-development-0.19.0-centroid-fixed-qualified.json`). The actual cell desktop suite passes five groups including source/promotion attributes, visible source coloring, Save/Open, Undo/Redo/Replay/Branch and version compatibility (`artifacts/cell-attributes-smoke-64wHrk/result.json`).

Animated tour v2 passes all nine actual development desktop groups (`artifacts/animated-tours-po3atU/result.json`): deterministic GPU composition, persistence, exact PNG endpoints, decoded WebM endpoints, competing controls, cancellation and project replacement. Face/cell net expressions pass seven actual desktop groups (`artifacts/expression-entry-smoke-hLZOUS/result.json`) with independent placement mathematics and invalid/stale/canceled edit fences. The full frontend suite passes **1,037 tests**, with all 182 qualification inputs unchanged (`artifacts/frontend-source-tests-0.19.0.json`).

The isolated 0.19 candidate is built. Its eight packaged frontend/desktop files match source/build bytes, and a fresh Vite build reproduces all four output files exactly (`artifacts/frontend-candidate-0.19.0.json`). All 39 packaged desktop suites pass against the unchanged candidate, and the actual outer portable launcher passes with development Python disabled. The exact qualified file is promoted as **0.19**, preserving all earlier releases. See [release details](RELEASE_0.19.md), `artifacts/release-0.19.0.json` and `artifacts/promoted-portable-0.19.0.json`. All 73 parity gates remain open; development continues toward the unchanged full goal.

## Historical development: 0.20 (retained unpromoted)

The full native suite passes **3,961 tests, one skip**, with all **520 inputs unchanged** (`artifacts/native-development-0.20.0.json`). The full declared frontend suite passes **1,520 tests**, with all **205 inputs unchanged** (`artifacts/frontend-source-tests-0.20.0.json`). The original failed frontend proof is retained under `frontend-source-tests-0.20.0-batch-assumptions-failed.*`; its two failures were obsolete sequential-coordinate test assumptions, now replaced by complete batched/source ownership checks. The three frozen importer files still match the retained corpus audit byte for byte.

Production spring relaxation 0.1 supports read-only preview, explicit adoption, original/seeded initialization and explicit distance/face-step/pin constraints. All eight actual desktop groups pass (`artifacts/spring-smoke-UqC9Eq/result.json`), including residual acceptance, invalid realizations, Undo/Redo/Branch/Replay/Save/Open and cancellation/source/export fences. The first run exposed missing spring eligibility in the history parameter button; that production integration is corrected. Full installed-baseline spring constraints and near-miss equivalence remain unqualified.

All sixteen regular 4D entries pass actual desktop load/search/numerical verification and representative Save/Open (`artifacts/desktop-qualification-EYCogq/result.json`). Complete current source receipts, original ordered incidence, alias/symbol/cell/vertex-figure/dual crosswalks and independent reciprocal-dual maps are retained. These are numerical checks within normalized tolerance 1e-8; no exact-coordinate, star density or generalized volume certificate is claimed. The fresh packaged catalog workflow and independently repeated native/source/dual/compiled/frontend collector now pass (`artifacts/lib04-gate-0.20.0.json`). Original finite LIB-04 is validated. The actual MEAS-04 collector also passes 90 fresh packaged JSONL requests, full source/archive bindings and 23 saved-source comparisons; root applied it after independent review and reexecution. Two original requirements are validated and 71 gates remain open. Neither gate implies a released portable.

Expression entry now has an atomic native real/canonical-rational batch endpoint for up to 80,000 values. Workspace, viewport, construction, measurement, symmetry, stellation, animation/tour and intrinsic orientation inputs use full source/project/document/units/notes/RGBA and form guards with cancellation. Exact Waterman and rational hull paths preserve rational distinctions below float rounding. Ordinary real integer fields check binary64 results. Layer-join matrices accept nested expressions and trigonometric entries while retaining rigid-matrix validation. Later observer edits during same-dimensional history commits are preserved without changing native dimensional-reset policy.

The workspace expression and expanded layer suites pass in the actual development desktop (`artifacts/desktop-qualification-hingT6/result.json`). Native and frontend sources are frozen under `artifacts/frozen-0.20.0-qualified-native-source` and `artifacts/frozen-0.20.0-candidate-inputs`. The isolated candidate is built and passes compiled native bundle and exact frontend reproduction checks. The first full packaged run passes spring, regular4d, workspace expressions, layers and products, then stops on a core harness readiness race: it promoted the retained offset-0 section before the offset-0.5 numeric edit finished. Strict source ownership correctly refuses that stale edit. The corrected harness now waits for the requested section and independently checks saved offset/normal/content; packaged regression reruns and the actual outer portable launcher remain required before promotion. Failed evidence is retained in `artifacts/desktop-qualification-psaFHc/result.json`. **0.19 remains the verified release.** The unchanged 73-requirement ledger has two validated gates (LIB-04/MEAS-04), 62 partial implementations, two research requirements (FAC-02/FAC-03) and seven unstarted requirements; 71 gates remain open. This is meaningful production progress, not a full parity claim.

The corrected core, workspace and presentation harnesses now pass independently against the frozen candidate. Thirty of the 42 packaged suites have complete passing runtime proofs. The remaining twelve run sequentially with independent proofs, beginning with an updated Waterman expression contract check. Earlier failures remain preserved; no production source changed during these harness repairs. Faceting is still research, supported by independently repeated frozen development tests; its production integration and dense stereographic improvements are isolated for 0.21.

### Release hold: WebM endpoint defect

Forty-one of the 42 packaged suites have independently complete passing runtime proofs. The actual outer portable launcher also passes with development Python disabled; its extracted executable, ASAR, native engine and all 538 resource files equal the frozen candidate. All 3,064 linked sources retain matching audit hashes. These checks do not waive the failing animated-tour suite.

Independent comparison of every decoded video frame against all seven exact PNG samples proves that WebM can finish on an earlier pose. One recording ended nearest time0.625 instead of0.75 but passed the old RGB-error threshold; another ended nearest0.5 and failed that threshold. The encoder block count is not an acknowledgement of canvas pose identity. Evidence: `artifacts/animated-tour-webm-endpoint-diagnosis-0.20.0.json`. Root added a stronger endpoint oracle requiring unique closest identity among all sample poses; four headless tests and rejection of both actual incomplete recordings pass. Production repair is isolated under development for0.21. **0.20 will not be promoted with this defect.** PNG exact sample/endpoints remain separately qualified; existing MediaRecorder WebM endpoint reliability is unresolved.

Both finite gate receipts, their 520 native/205 frontend inputs and supporting scripts are preserved under `artifacts/frozen-0.20.0-validated-candidate-source` (821 files). This is a retained unpromoted candidate, not an all-suite release qualification. Earlier releases, candidates and failures remain intact.

## Verified so far

Work resumed October 3, 2026 with parallel agents, then shifted to the user's local Miratope checkout and shared Drive library. The current verified portable is **0.19.0**; development continues under the user's explicit full-feature-completeness goal. [SESSION_HANDOFF.md](SESSION_HANDOFF.md) records evidence and next steps. Earlier release evidence below remains historical.

- 213 kernel tests pass: catalog counts and declared edge uniformity, independently constructed reflection orbits, analytic volume/surface fixtures, dual-of-dual recovery, tangent/empty/oblique sections, vertex figures, products, scale covariance, incidence-aware symmetry, strict imports, persistence, safe expressions, exact rational predicates/hulls/polar duals, generalized incidence, faceting, net face/hinge measurements, exhaustive geometric symmetry, finite plane arrangements/union enumeration, nonconvex union slices, source/observation domain covariance, all six regular convex whole-cell 4D nets, component reattachment/placement, standard-paper packing, all Archimedean/Catalan types, all regular 3D stars, generalized extraction and incidence reciprocity. New fixtures independently check supporting-flat and segment distances, unequal 4D principal angles, common circumradii, analytic convex dihedrals, entity-aligned sections and forged measurement-cache removal. All six regular 4D full groups, independent scalar action/incidence products, transformed realizations, restricted/generated subgroups and subgroup-constrained region searches are also checked.
- Development and packaged Electron smoke pass 68 workflows, including face/cell net editing, placements, face-piece dragging, layout undo/redo, folding/playback, native layout persistence, packed paper preview/multipage PDF, supporting-flat/segment measurements, principal angles, entity content/radii, convex dihedrals, entity-aligned sections, measurement preference persistence, forged cache reconstruction, full 4D groups, proper/stabilizer/generated subgroups, entity orbits/highlighting, action inspection, subgroup-constrained stellation, preference persistence and stale symmetry responses, snub mirror forms, Catalan alias search, star OFF/native round trips, incidence-dual undo/redo, source selection persistence, cancellation, recovery, backups and the full icosahedral plane-region search. Packaged tests deliberately use an unavailable development Python path to exercise the bundled engine. Evidence/screenshots live in `artifacts/`.
- The actual 0.7.0 portable launcher also passes a separate CDP attachment test: initial Tesseract UI, bundled icosahedron generation, full order-120 symmetry, 703-region arrangement, complete 256-subset finite search, cut/moved/rotated cube net reconstruction, tesseract cell-net cuts/placements six-page dodecahedron paper packing, 45 library entries, snub mirror coordinates/proper symmetry and regular-star double reciprocation, intrinsic 4D distances/dihedrals/cell volume and aligned sections, plus source-volume reconstruction after a forged cached scalar and all six regular convex 4D full groups including both 14,400-action groups, with development Python disabled. Playwright's direct Electron launcher cannot attach through the portable wrapper; `npm.cmd run test:portable` handles this separately.
- Renderer production build, PyInstaller bundle and portable Electron packaging pass. Earlier 0.1.0/0.2.0/0.3.0/0.4.0 portables are retained; `release/Polytope Laboratory 0.5.0.exe` (130,965,382 bytes) adds the complete convex Archimedean/Catalan type lists, explicit chiral mirrors, all four regular 3D stars, ordered-incidence reciprocity, generalized entity extraction and source selection persistence. Its SHA-256 is `A68428ABC5CE7CCDDDD387FD768EF15C3C26F582B3E0CB26666328274487834F`. No clean-machine installation or signing qualification is claimed.
- Release 0.6.0 adds intrinsic entity measurements, source-entity section alignment and authoritative source-measure regeneration. `release/Polytope Laboratory 0.6.0.exe` is 130,978,464 bytes with SHA-256 `C4DC2C14AEF8AD3CA28AA6CC054C8DDBC091AE49E6B3C57E58A34183B59E812B`. Kernel, development, packaged, actual-portable and digital PDF checks pass; evidence is in `artifacts/release-0.6.0.json`. The 0.5.0 milestone and all earlier portables are retained.
- Release 0.7.0 adds full numerical 4D geometric symmetry, verified generating sets, entity orbits/stabilizers, proper and user-generated subgroups, subgroup-constrained finite region searches and a saved inspector. `release/Polytope Laboratory 0.7.0.exe` is 130,981,221 bytes with SHA-256 `C5BC63F2FD4A01751706CCDA0536BE612CA24A95BBD0798CE2CA883E49298AF3`. Kernel, development, packaged, actual-portable and digital PDF checks pass; evidence is in `artifacts/release-0.7.0.json`. Earlier portables are retained.
- Net PDF export produces one page with every source face label present. The edited cube fixture's E0 vector lengths measure 24.99929â€“24.99931 mm for a requested 25 mm; page dimensions have Chromium roundoff below one CSS pixel (0.265 mm). `scripts/verify-net-pdf.py` records this independent digital measurement. Hardware printer calibration remains pending.
- Six read-only local corpus probes preserve the three documented same-skeleton topology pairs: 3-hex/17-tho, 39-rap/40-firp, 890-ope/897-thahp. No source geometry was copied or changed.

## Second milestone

- Facial/arbitrary plane arrangements support up to 32 planes, with numerical bounded/unbounded classification, clipping flags, source face identity and observation-box volume conservation.
- Selected ordinary solid-region unions retain convex pieces and exposed oriented facets; nonconvex sections preserve components and degenerate strata.
- Finite orbit-subset union search records explicit criteria, group/domain restrictions, subset counts and result-limit termination. Octahedral, dodecahedral and icosahedral fixtures pass; no classic stellation-classification parity is claimed.
- Exhaustive Gram-compatible frame search verifies 2D/3D Euclidean metric actions, ordered incidence and group closure independently of coordinate axes. 4D retains signed-axis subgroup support.
- The UI exposes source-linked solid/diagram selection, SVG diagram export, candidate stepping and promotion. Full benchmark conformance remains a release blocker.

## Third milestone

- Convex 3D nets now support explicit hinge forests, cut/join editing, connected-piece dragging/rotation and per-layout undo/redo. Cuts retain positions and source IDs; cycle-closing joins are diagnosed.
- Proper root-pose interpolation and signed dihedral hinge rotations reconstruct all source vertices at a full fold, including separated/moved/rotated pieces. Face rigidity and hinge gaps pass numerical checks at intermediate fractions.
- Renderer motion agrees with the kernel at sampled fractions, and folding playback follows the render clock without per-frame engine requests.
- Face overlaps and tab overlaps are reported separately; matching cut labels, physical-mm SVG/PDF output and native layout persistence are checked. Loaded caches are regenerated from source geometry and layout parameters.
- Python/JavaScript coordinate hash spelling now agrees across JSON, and 4D signed-axis actions verify cyclic faces/cell-face incidence. Full-group claims depend on geometry rather than editable catalog labels.

## Fourth milestone

- Convex 4D whole-cell nets retain every complete 3D boundary cell and source incidence. All six regular convex references pass independent distance/join checks, including the 600-cell.
- Face cuts/joins, descendant reattachment, numeric rigid component placements, matching source faces/vertices, display-only surface shrink, layout undo/redo and native persistence are implemented. Intersections between cells are explicitly retained and not checked.
- Face nets pack intact connected pieces into A4/A3/Letter/Legal/custom paper, with orientation/margins/gaps, optional quarter turns and page-by-page preview. Oversized pieces fail without scaling or splitting. Global one-tab-per-cut ownership and matching labels survive distribution across pages.
- Multipage vector PDF/export and native printing use declared paper size and scale 1. The separate-face dodecahedron fixture exports six A4 pages with every face label once and every cut-edge label twice. A requested 65 mm E0 measures 64.99889-64.99893 mm in PDF vectors; hardware calibration remains pending.
- Native validation regenerates cell layout and packed-page caches from authoritative source/layout parameters. Packaging staging removes its verified exact subtree before copying current assets so old bundles do not accumulate.

## Fifth milestone

- The 45-entry named reference library includes all thirteen Archimedean types and thirteen Catalan dual types, with separate snub mirror forms, all four Kepler-Poinsot stars, the existing Platonic solids and six regular convex 4-polytopes. Alias search includes alternate hexacontahedron spellings and primal names.
- Convex snubs solve equal-edge positive chamber seeds and exhaust proper B3/H3 rotation orbits. Every polygon face is regular and both mirror forms have only proper symmetry actions. An independent tribonacci coordinate spectrum checks the snub cube.
- Catalan entries are named polar duals with all-face congruence and dual-of-dual recovery checked; multiple edge lengths remain explicit. Regular stars retain cyclic winding, crossing-free incidence IDs, actual Euler characteristic/genus and complete numerical icosahedral symmetry.
- A separate 3D incidence-dual operation reciprocates every face plane and follows cyclic source vertex links, preserving star winding and genus. Double reciprocation recovers source coordinates and full cycles. Open/nonmanifold/pinched links, singular centers and coincident reciprocal planes are diagnosed.
- Source face and generalized 4D cell extraction preserve ordered cycles in reversible intrinsic embeddings. Imported generalized boundaries default to an individual source face view. Source selection resets when geometry changes and persists with its own document/history snapshot.
- Desktop tests now synchronize native reopen completion before starting subsequent operations, avoiding an invalid test race. Star OFF/native round trips retain winding and generalized interpretation. Star solid sections/nets/fill semantics and remaining nonconvex catalogs remain pending.

## Sixth milestone

- Source entity/custom-flat measurements return closest-point witnesses, explicit infinite-flat versus finite-segment definitions, and unsigned principal angles. Two 4D planes report both angles. Degenerate/nonplanar input and unsupported bounded faces/cells receive explicit errors.
- Source edges, ordered face cycles and complete convex cells have intrinsic content; common circumradii require all vertices to fit one sphere in their affine hull. Generalized cycle area is algebraic, with no filled-star volume claim.
- Convex 3D/4D interior dihedral measurements identify the adjacent facets and provide whole-model ranges. Analytic tetrahedron, cube, 4-simplex, tesseract, cross-polytope and 24-cell fixtures pass, with scale and rigid-coordinate covariance checks.
- Section alignment uses unique face/cell normals or perpendicular projections of radial/explicit directions. Relative offset zero contains the selected entity. Source geometry stays unchanged; document preferences and section settings persist, and stale asynchronous results are discarded.
- Whole-model convex measures are rebuilt from source coordinates and independently reconstructed incidence, rather than cached scalars. Native validation regenerates every snapshot and removes unsupported generalized caches. Declared region unions recompute sums within their declared disjoint-interior domain; this does not certify arbitrary overlapping unions.
- See [measurement definitions](MEASUREMENTS.md). General bounded-face/cell distance, unit conversion, generalized solid-content/density conventions and full benchmark qualification remain pending.

## Seventh milestone

- Exhaustive intrinsic frame search now supports full-dimensional 2D/3D/4D sources up to 1,000 vertices. All six regular convex 4D groups match independent mathematical orders, including 1,152 for the 24-cell and 14,400 for the 120-/600-cell, with complete cyclic face and cell-face incidence preserved.
- Source incidence verification uses exact batched integer rows. A generator Cayley traversal proves closure and reaches all actions without the previous order-squared multiplication loop. Default larger-group searches took roughly 11-18 seconds in the development benchmark, before desktop protocol overhead.
- Proper rotations, setwise vertex/edge/face/cell stabilizers and user-generated source subgroups have explicit restriction scope. Complete results expose generators, action matrices/permutations, source action IDs, all entity orbits and orbit-stabilizer orders. Nonclosed or incomplete searches cannot acquire group/orbit claims.
- The Evidence inspector exposes these restrictions, orbit highlighting and action inspection. Preferences persist with document snapshots; source changes clear manual generator IDs and obsolete asynchronous responses are discarded.
- Finite region-union searches accept proper rotations and user-generated source subgroups, distinguishing selected-source completeness from the full source group and observation-domain restrictions. Independent octahedral reflection-subgroup fixtures produce 16 qualifying unions instead of the full group's 2.
- Rotated/translated/scaled 4D realizations, unequal-axis orthotopes, asymmetric simplices, same-skeleton cell-face changes, independently checked action products and explicit resource/ambiguity failures extend verification beyond catalog labels. All metric/group results remain numerical, not exact or interval-certified. Larger domains, general combinatorial automorphisms, full subgroup coloring and benchmark option qualification remain pending.
- See [symmetry contracts](SYMMETRY.md). The full baseline remains unfinished and no requirement-wide release gate is marked complete.

## Next priorities

1. Extend whole-cell net interaction and symmetric arrangements, advanced paper/tab policies and physical-output qualification beyond the implemented convex fixtures.
2. Expand domain tests for generalized OFF variants and retain source topology in malformed/degenerate cases. Reconcile local corpus provenance and classification per file.
3. Complete exact/certified arithmetic contracts and authoritative replay; extend measurement domains, unit conversion, entity-aligned views and verified group actions.
4. Extend convex families, nonconvex regular/uniform constructions, generalized sections/duals and fitting with explicit support contracts.
5. Extend the implemented plane arrangements/custom finite stellation criteria toward benchmark semantics and automatic faceting; extend generalized net domains, tab/coincident-edge policies and calibrated physical output.
6. Finish parity visuals, advanced interchange, animation exports, documentation, signed installation/update flows and specialist review.

No overall completion percentage is assigned. `parity-ledger.json` records the full required baseline; partial scenarios are prototypes, and no requirement-wide release gate is marked complete.

## Eighth milestone: recursive local OFF catalogs

- Acquired all 3,064 OFF entries traversed in the user-supplied public Uniforms Drive tree (57 folders, 1,852,330,542 bytes). File IDs, URLs, original bytes and SHA-256 are preserved in resumable local manifests. One non-OFF spreadsheet is recorded separately. The dataset is stored in `data/drive-uniforms`, outside Git and the portable executable.
- Recursive read-only linking exposes source folder categories, dimensions, header counts and supported/unsupported diagnostics. Links restore on launch; removing a link retains source files and opened documents. Loading reconstructs and checks supplied geometry, retaining star cycles and cell incidence. Distinct file paths remain separate even for identical bytes or shared skeletons.
- The normal application profile is configured with both the Drive collection and Miratope `lib`; its 3,366 records comprise 3,064 + 257 external files and 45 independent generated references. The Miratope audit imports 196 of 197 supported files, including all 88 in 4D; the teapot is explicitly diagnosed and 60 other-dimensional files remain unsupported. Discovery files receive inventory only.
- All 3,064 Drive hashes and headers pass inventory; all are 4D and within current importer file/vertex/boundary resource caps. A bounded 24-file geometric sample passes, including regular-star, CatS, prismatic and compound source labels and the largest supplied incidence examples. Source face/cell order, roundtrip coordinates and 720 pentagram boundaries per selected star fixture are independently checked. All-file mathematical validation and the 2,191-baseline classification crosswalk remain pending.
- Wythoff reflection orbits now use a normalized unit seed, nearby spatial buckets, independent parabolic-index cardinality checks, explicit resource prechecks and each-reflection closure checks. Original weight scale is restored with a representability guard. All 81 nonempty masks across supported families pass the additional unequal-weight orbit check.
- Verification: **273 kernel tests passed, one Windows platform skip**; renderer build, the 68-workflow development/packaged baseline suites, 12-workflow linked-library suites, digital PDF checks and the actual 0.8.0 portable launcher with development Python disabled pass. The normal user profile's automatic links were separately checked. The final concurrent-unlink shell fix is covered by the dedicated linked-library suites.
- Portable: `release/Polytope Laboratory 0.8.0.exe`, **130,988,008 bytes**, SHA-256 **25FBD48210DBEE405263DB2FFD8A62D23277F25FF9B1D10A3F48B40113A6F7D0**. Evidence: `artifacts/release-0.8.0.json`; corpus details: [LOCAL_CORPUS.md](LOCAL_CORPUS.md).
- The parity ledger generator is reconciled with current symmetry, entity measurements and external catalog support; all 73 requirements remain blockers. Signing, clean-machine/printer qualification, wider mathematical domains and feature-complete parity remain unfinished.

## October 4: resumable full-corpus importer audit

- Added explicit full-manifest selection, durable per-result checkpoints, bounded new-import batches, source/manifest/validator/dependency checks before resume, atomic inventory/failure reports, and an OS lock for each output. Active workers are tracked for cancellation, killed on timeout and reaped.
- Exhaustive importer coverage of all **3,064** acquired Drive files: **3,048 parsed** (66 convex, 2,982 generalized), **16 diagnosed** (12 edge-count mismatches, two cell-suffix format findings, two compound affine-dimension failures). No timeouts, worker failures or source-hash changes; acquisition manifest and validator stayed unchanged. This is numerical importer compatibility, not mathematical certification or the baseline classification crosswalk.
- Full run after the 16-file checkpoint: **24.76 minutes**, four workers, 90-second per-file limit, **16.35-second** slowest import. Immediate resume reverified source hashes and reused every result with **zero new imports** in **3.43 seconds**; per-file timestamps/counts/fingerprints and checkpoint journal stayed unchanged.
- Verification: full kernel suite **292 passed, one Windows-specific skip** before four further audit checks; final audit module **23 passed**. The initial focused audit/download test run passed 39 tests. Timeout, cancellation, truncated/corrupt journals, changed sources/manifests, deterministic diagnoses, count checks and atomic writes are covered.
- Evidence: `artifacts/drive-corpus-full-audit.json`, `.failures.json`, `.checkpoint.jsonl`, `drive-corpus-full-audit-run-summary.json` and `drive-corpus-resume-verification.json`. See [usage](CORPUS_VALIDATION.md) and [findings](LOCAL_CORPUS.md#full-importer-audit--october-4-2026). No new portable was built; the verified application release remains 0.8.0.


## Eighth milestone: star surfaces, audit evidence and animation

- Generalized source faces now support nonzero and even/odd winding fills with explicit work and triangle limits. Opacity, face/cell/source colors, cell isolation and hidden-cell masks preserve all source incidence IDs. Large full views report suppressed faces; isolating a late cell rebuilds its complete visible subset.
- Generalized sections preserve source-face intersection segments, disconnected boundaries, coplanar faces and reversible source references. These are surface intersections without generalized solid-volume claims. Promoted faces open a supported face view; curve-only promotions show source-plane evidence.
- Linked libraries attach compact provenance-aware audits, distinguish passed/rejected/untested/stale results, retain diagnostic samples/counts, and explicitly hash larger files through Verify. Audit compilation streams journal records rather than loading the full large report body.
- OFF face/cell RGB and RGBA attributes survive import/export and source-color rendering. All twelve historical edge-count mismatches yield fully validated correction copies without touching source files. The two colored sources now import. Exact determinant witnesses show the two remaining compound-cell diagnoses are rank-four incidence mismatches, rather than numerical collapse.
- Saved keyframe tracks animate all six rotation planes and section depth, with playback, scrubbing, exact-time PNG sequences and streamed WebM exports. PNG frame timestamps are deterministic; WebM records in real time. Cancellation, document changes and failed exports remove only owned staging files.
- Native builds include importer provenance source files and NumPy/SciPy metadata for correct audit comparisons. An independently reproduced Windows extended-path race in the public downloader is fixed without relaxing resolved-path containment; focused fixtures and 250 concurrent trials pass.
- New rendering/export checks pass twenty Node fixtures plus analytic face-fill/cap regressions. Existing desktop baseline passes all 68 workflows; the linked-library suite passes. Final packaged and full-corpus evidence is recorded in the session handoff and release artifact.

- Fresh 0.9.0 full audit: 3,050 parsed (66 convex, 2,984 generalized), fourteen deterministic diagnoses, all 3,064 sources unchanged, no timeouts or worker failures. Independent full-tree hashing confirms every source against the compiled 2.7 MB index; the normal profile attaches the new evidence.

- Final release: `release/Polytope Laboratory 0.9.0.exe`, 131,148,143 bytes, SHA-256 `32F9B3F0C0D9C74E76A0D8C1B4BC332587A349A4CC16231B4DC72EB975894854`. Actual self-extracting launcher passes with development Python unavailable, including restored full-corpus audit evidence and all 3,064 hashes verified. Final packaged short offscreen video decodes two visible frames matching intended endpoint PNGs. See `artifacts/release-0.9.0.json` and the current handoff.


## Ninth milestone: professional viewport workspace

Release **0.10.0** removes top branding/tagline, defaults to a large geometry canvas, and collapses Library/Inspector and advanced shelf controls. Independent observer orthographic/perspective cameras, Fit, canonical directions, saved camera/frustum state, matte lighting, Solid/Translucent/Wireframe presets, correct opaque rear-edge occlusion, source-alpha blending, selected-plane/rate automatic rotation, and Shift-drag XW/YW are implemented. Section evaluation invalidates the previous result immediately so Promote cannot use stale depth geometry.

Verification: 28 Node feature tests plus independent fill/cap scripts; 68 development and packaged desktop workflows; packaged workspace7, graphics8, stars15, audit6 and animation9 checks; independent two-frame VP9 endpoint decoding; nine development layout/visual checks. The actual portable launcher runs with development Python disabled and checks all3064 linked source hashes,3050 passed/14 diagnosed sources, plus existing mathematical workflows. See `artifacts/release-0.10.0.json`. The immutable0.9.0 engine/corpus evidence remains applicable to the frozen shipped0.10.0 engine.

The user has explicitly made full feature completeness the active goal. Development0.11.0 now implements nine model memories, expression helpers, DXF import and entity-aligned4D views in parallel. Ordered remaining batches are recorded in `COMPLETENESS_KERNEL_PLAN.md`, `COMPLETENESS_VIEWPORT_PLAN.md`, and `COMPLETENESS_WORKSPACE_PLAN.md`; all73 specification-wide gates remain open.


## 0.11.0 milestone

The stereographic endpoint-chord bug is fixed with spherical edge arcs, curved
face patches, analytic smooth normals and explicit pole clipping. Source
vertices/incidence remain literal. Edge/face/cell picking retains source IDs;
spheres/cylinders and cell shrink have actual GPU evidence. Memories, component
and bounded face editing, First/Last orientation, convex-cell facing, qualified
construction replay, instant tours, DXF import and physical-unit export are
integrated. Attributed built-in source catalogs expand the library to 222
records; source files, adapters, manifests and license notices are bundled.

The release passed 1186 engine tests (one skipped), 179 Node feature tests,
sixteen sequential packaged desktop suites and the actual portable launcher,
with development Python disabled. Fresh corpus audit attempted all 3064 files:
3050 parsed and 14 diagnosed. Actual portable verification hashed all files and
accepted the same evidence without stale entries. Digital PDF reference edges
measure within 0.01 mm at requested 25/65 mm scales; hardware printers remain
unqualified. All 358 bundled catalog assets match source bytes.

Portable: 131449533 bytes; SHA256
`1dfca84b07f2d6c110888bb8f1afa9657c716d4ab0fee21f1d189fe77340f8ce`.
Evidence: [release-0.11.0.json](../artifacts/release-0.11.0.json). This portable is
unsigned. All 73 requirement-wide benchmark gates remain open. Filled
stereographic motion remains CPU limited; non-instant tour transitions and
sequence explosion/fold renderer adapters remain pending. Development continues
with adjustable 4D perspective, subdivision and animation adapters.


## Verified0.12.0 continuation

The0.12.0 portable ships adjustable4D perspective/near clipping, source edge
subdivision with replay/parameter branches, direct cupola construction, literal
signed/unreduced star polygons, and convex3D/4D normal/radial explosion plus rigid3D
face-net animation tracks. Saved explosion poses hydrate on reopening. PNG and
decoded offscreen WebM proof includes actual endpoints, source preservation and
exact complete-view restoration on completion/cancellation.

Validation:1436native tests passed, one Windows-inapplicable POSIXpipe test skipped;
280Node checks passed; all20sequential packaged desktop suites passed. The actual
portable launcher passed with development Python unavailable, including new0.12APIs
and all3064sourcehashes. The retained importer audit has3050passed/14diagnosed;
all3importer sourcefiles/dependency versions remain compatible. All358catalogassets
and seven desktop/distarchivefiles match actual packaged bytes.

Portable131476852bytes, SHA256
`247fbbb4499ff7a1290b8905e55b263fffb228b064aa395055bfbd1cca86a312`.
[Release evidence](../artifacts/release-0.12.0.json),
[packaged qualification](../artifacts/desktop-qualification-QqUSiL/result.json),
[actual portable](../artifacts/portable-0.12.0/portable-smoke.json).
The portable is unsigned. Full73requirement parity remains unfinished. Dense S3
surface rotation remains CPUlimited; parallel0.13preparation targets pixel-based
interaction quality, bounded workers and source-preserving polygon products.


Development 0.13.0 integrates ordered polygon-product Construct controls and polygon-prism IPC/recipes/replay/branches. Native product/history/persistence scope: 162 passed (artifacts/products-native-0.13.0.log). Dimension changes reset obsolete section/net presentations. Pixel-based stereographic quality and typed background worker modules are implemented with bounded queues, source/pose guards and exact capture waits; actual Viewer integration and browser qualification are in progress. PNG/WebM awaits and cancellation checks have 11 new focused tests passing, with 158 targeted animation/worker regressions reported by the parallel agent. No 0.13 package or GUI qualification is claimed. Verified 0.12 portable remains the current user-ready release.


## Verified 0.13.0 after dense-model repair

Portable `release/Polytope Laboratory 0.13.0.exe`: 131498632 bytes, unsigned,
SHA256 f05a7920ba430888b0d62182d7401cdc181066cb42aadc150c07108346b3e4a0.
Evidence: `artifacts/release-0.13.0.json`; 22 packaged suites passed, actual portable
passed with development Python unavailable and all 3064 source hashes checked.
Native shipped scope1534passed1skip and final Node436passed. Eight actual archive
files match desktop/dist source, all358 catalog assets and three importer files
match bundled bytes; 398 engine/catalog source files and 45 native tests stayed
unchanged across frontend repairs.

Ordered polygon products/prisms, dimension-safe history, fine capture waits and
real bounded stereographic worker publication are shipped. Testing discovered
120-cell rotation starvation from complete-only intermediate publication; coherent
explicitly partial interaction frames now publish under source/family/typed-ID
fences. Final six-case packaged dense benchmark has moving angles/pixels and
unchanged source in every case, with real worker timing. It still exposes partial
surfaces and ~0.57-0.80s large-model computation; it does not prove complete or
smooth dense rendering. Native-await history publication also closes an export
microtask race. See `docs/STEREOGRAPHIC_WORKER.md` for the exact limits.

Source freezes and earlier failed dense evidence are retained. Isolated antiprism,
3D-base prism, step-prism, true-component attachment, convex classifier and typed
publication helpers are NEXT-release work. Full original specification parity is
unfinished and all73 requirement-wide release gates remain open.


## Current 0.14 development: specialized constructions and hidden testing

The latest verified user-ready portable remains0.13.0. Development0.14 now mounts
torus, four-mode podium/antipodium, exact rational FCC Waterman and convex
parallel-layer join controls. Full source snapshots/maps, RGBA, units and
replayable layer-join parameters are retained. New native layer workflow35tests
and175 combined segmentotope/history/recipe tests pass. Convex input predicates
remain distinct from stars and crossed definitions; native normal-positive
measures and actual project roundtrips gate accepted joins.

The torus/podia, Waterman and product desktop suites passed20 groups in hidden
mode, with37,154 native HWND checks and armed show/foreground hooks recording
zero owned violations. The fresh layer-join canary also passed with614 checks,
no visible/focused window and no page errors. Its launch required escaping the
TOOL filesystem sandbox's runtime ACL denial; Electron's own sandbox remains
on. Hidden RAF is about1Hz and does not qualify foreground smoothness.

Source-bound whole-edge stereographic interval mathematics has26 focused tests
but is not integrated in the sampled renderer; Float32 endpoint, GPU and triangle
bounds remain open. All73 specification-wide parity gates remain open. No0.14
packaged/portable, signing, clean-machine or full-baseline qualification is claimed.


## Verified 0.14.0

The user-ready portable is `release/Polytope Laboratory 0.14.0.exe`,
131599926 bytes, unsigned, SHA256
`5cfe4c2a84ab9bf0abe55104d98a9395da4caec09f61f06a0791cf96b7f18ed3`.
It is byte-identical to the actual qualified revised-candidate launcher.
Both earlier candidates and the0.13 portable are preserved.

`artifacts/desktop-qualification-v4vfLc/result.json`: all29 actual visible
packaged suites passed in631.603 seconds; executable/archive hashes unchanged.
`artifacts/portable-revised-candidate-0.14.0/portable-smoke.json`: actual launcher
passed in62.256 seconds, development Python disabled,3064 fresh source hashes,
3050 passed importer records/14 diagnosed, and7-Fix120/720/1200/120 incidence.
Native2687 passed/1 platform skip and Node664 passed.479 qualified native input
hashes stayed unchanged;53 PyInstaller module receipts match, actual built/bundled
engine bytes match, all358 catalog assets and3 frozen importer bytes match.
A fresh Vite build from86 saved/current input hashes reproduced all4 actual
packaged frontend files exactly. `artifacts/release-0.14.0.json` retains the chain.

The six-case actual revised viewport benchmark is
`artifacts/stereographic-dense-publication-packaged-hseSua/result.json`.
All cases have distinct published angles/pixels and unchanged source geometry.
Dense worker medians317?456ms; synchronous production message-listener prefixes
27?36ms, roughly20?24% less than the firstcandidate. Timing excludes async/GPU
work; caps still yield partial surfaces. No smooth dense-rendering or whole-curve
error guarantee follows. Tesseract workers40.8?56.1ms/listener4.6?6.1ms.

Face attachment and further worker/camera math were isolated next-batch prototypes
at the time of the 0.14 qualification. The 0.15 development status below supersedes
that development statement; the verified 0.14 executable remains preserved.
All73 original requirement-wide parity gates remain open. Installed Stella5.4
static resources are audited separately and do not qualify the target6.0 baseline.

## 0.15 candidate under qualification

Face attachment is now mounted for independently checked convex 3D sources with
congruent selected faces. It retains the explicit seam incidence and source
attributes. Adjacent cubes produce 12 vertices, 20 edges and 10 faces; the result
does not replace those records with a bounding box hull. The development app
passed undo/redo, Save/Open, replay, an independent colored Memory 9 source, and
a held native completion followed by a user unit edit. The last case refused
publication and retained the user's edit. This bounded attachment workflow does
not complete augmentation, excavation, drilling or the whole CON-07 requirement.

The stereographic worker now uses scalar arithmetic, recursive sample reuse and
a bounded hybrid typed output arena. Independent frozen legacy fixtures agree
byte for byte on the qualified geometry, normals, owners and result statuses.
The original clipping, caps, capture refusals and worker ownership checks remain
in force. The combined registered Node suite passed 753 tests; native qualification
passed 2,829 tests with one platform skip and 483 unchanged input hashes.

Actual development viewport evidence is
`artifacts/stereographic-dense-publication-zYJ8ft/result.json`: six cases moving,
distinct published angles and pixels, source geometry unchanged. Dense worker
medians were 218.5â€“267.7 ms, compared with 317â€“456 ms in the prior packaged build.
These are observations on this machine, not a guaranteed frame rate. Every case
still published partial or capped results. Framing near poles and surface seams
remain visible problems; whole-curve and whole-surface error guarantees are open.

The separate `release/0.15-candidate` has 56 native module receipts, 358 matching
catalog assets and three matching frozen importer files. A fresh Vite build from
88 preserved frontend/desktop inputs reproduced its four dist files exactly.
All 30 packaged UI suites, the actual portable and a packaged viewport benchmark
must pass before this candidate is reported as released. At this entry's creation,
the packaged run is live in `artifacts/desktop-qualification-1FOKlh`.

## Verified 0.15.0

The candidate above has passed and was copied byte for byte to
`release/Polytope Laboratory 0.15.0.exe`. It is unsigned, 131626973 bytes, SHA256
`a0c923000abbb6cb0406841dccae0cf88e7cb66a0e9c2009d59bb0748d590474`.
Previous promoted releases and the complete candidates are preserved.

All 30 packaged suites passed in 662.104 seconds with unchanged runtime hashes.
The actual portable passed in 78.363 seconds with development Python disabled,
3064 fresh source hashes, 3050 parsed records and 14 diagnosed refusals.
Native2829 passed/1 skip and Node753 passed. The native receipt and fresh frontend
reproduction described above passed. `artifacts/release-0.15.0.json` and
`artifacts/promoted-portable-0.15.0.json` retain the release and copy receipts.

`artifacts/stereographic-dense-publication-packaged-Ob0Z2q/result.json` has all six
cases moving, source unchanged and worker/listener timing qualified. Dense worker
medians are 220.1â€“269.9 ms; tesseract medians are 17.7â€“29.7 ms. All six still have
partial/capped surface results. This is a speed improvement, not completion of
dense viewport quality or a whole-curve/surface error guarantee.

`artifacts/stereographic-fit-observation-Wb2IIV/result.json` records actual
packaged Fit behavior: the parallel-camera cloud was cropped before Fit; both
parallel and perspective cameras contain the published Float32 point cloud
after Fit. Source models are unchanged. Omitted patches, between-sample curves,
GPU arithmetic and the actual far plane are outside this framing observation.
Projection-change framing and conforming surface boundaries are next viewport
tasks. All 73 original requirement-wide parity gates remain open.

## Development 0.16.0 (packaged qualification pending)

Triangular geodesic construction subdivides a checked closed convex 3D triangular
boundary and projects the result onto its common source sphere. Literal frequency
1 preserves incidence and colors; higher frequencies share exact subdivision
identities across source edges. Output remains an uncertified generalized boundary,
with no invented regularity or solid measure. Limits include 4,000 output vertices,
12,000 edges and 8,000 triangles; the source-specific budget may refuse a frequency
below the UI maximum of 128.

Convex core (3D) intersects the source face halfspaces containing an explicit
center. It retains literal star cycles and full historical source attributes,
checks boundedness without an artificial clipping box, and maps source supporting
face colors to result faces. Exact binary64-ratio intersection/side witnesses do
not certify approximate planarity, boundedness optimization or classification.
Native measurements appear only when their project gate passes. The domain is
bounded to 32 distinct source planes; 4D core is still unmounted.

Both operations have full-attribute history, replay and original-parent parameter
branches. Source-bound publication rejects changes to geometry, RGBA, units,
notes or source/history ownership while permitting observer motion. The registered
frontend suite passed 798 tests; native qualification passed 3,044 tests with one
existing platform skip and 491 unchanged input hashes. Actual development GUI
checks passed all seven construction groups (source-construction-smoke-ujxjqV),
including independent phi-icosahedron, cube and crossed-pentagram-prism results,
undo/redo/save/open/replay/branches and delayed-result refusals.

Projection changes queue a deferred Fit with camera/source/pose ownership guards.
Current published stereographic geometry is framed after idle publication; source
or camera changes cancel the intent. The held-worker app checks passed both before
and after construction controls were mounted. This is a published point-cloud
framing change, not a continuous-geometry or omitted-patch certificate.

The separate release/0.16-candidate is built. Its native receipts match all 491
qualified inputs, 60 modules, 358 catalog assets and three frozen importers. A
fresh build from 91 preserved frontend/desktop inputs reproduced all four actual
ASAR dist files exactly. The full 32 packaged suites and actual portable remain
pending; 0.15.0 remains the current verified release. All 73 requirement-wide
parity gates remain open.
## Verified 0.16.0

The separate candidate above passed all 32 packaged suites in 696.375 seconds
with unchanged runtime files. The actual portable passed in 81.762 seconds with
development Python unavailable and all 3,064 source hashes verified (3,050 parsed,
14 diagnosed). The release was promoted byte for byte to
release/Polytope Laboratory 0.16.0.exe, unsigned, 131656876 bytes, SHA256
70a3f724b5207133a42763362e85bcdbb7d578cb3006b87d67eaa722556d9184.
Previous releases and candidate evidence remain intact. Release/copy receipts:
artifacts/release-0.16.0.json and artifacts/promoted-portable-0.16.0.json.

Actual packaged automatic-fit observation 7iMA1O contains the initial parallel
published point cloud before pressing Fit, and both tested cameras after manual
Fit. Packaged held-worker vSjIyR rejects camera/source/projection replacements.
These observations exclude omitted patches, continuous curve interiors and GPU
arithmetic. The six-case packaged eorg5H benchmark records real angle/pixel motion
and unchanged source geometry, with qualified worker/main-listener timing. Dense
worker medians were 126.1â€“181.3 ms; tesseract 12.4â€“15.4 ms. Automatic framing alters
the camera and refinement workload, so these numbers do not establish a CPU-only
speedup against the previous release. All six cases still have partial/capped
geometry. Full viewport quality and all 73 requirement-wide parity gates remain
open.

## Verified 0.17 and priority 0.18 shading fix

The exact 0.17 candidate was promoted after 3,324 native tests (one skipped),827
frontend tests, all34 packaged desktop suites and an actual portable run with
development Python unavailable.499 native/catalog/test inputs,64 bundled native
modules,358 catalog assets, three frozen importers and92 frozen frontend inputs
match; a fresh Vite rebuild reproduces all four packaged frontend outputs exactly.
The portable is131,691,271 bytes, unsigned, SHA256
`a10367385e959b5201bc75640c5212ecf4df8277079aac63acd05cdb7ae68ee4`.
[Release evidence](../artifacts/release-0.17.0.json) records the complete chain.

Face placement produces genuine extractable compound copies on1..16 selected
convex3D faces, with scale, signed height, rotation, full source snapshots/RGBA/units
and reversible history. It retains coincident faces, gaps and overlaps.4D convex
core uses literal cell hyperplanes with an explicit four-coordinate center, bounded
exact binary64-ratio witnesses and uncertified numerical realization/measures.
These are bounded implementations; requirement-wide parity remains open.

The user reported creases/artifacts in stereographic faces. Independent planar4D
quad probes confirm nonconforming adaptive subdivision: shared source diagonals
have different breakpoints despite identical analytic normals.0.18 development
prioritizes coordinated curved-surface refinement and actual GPU regressions.
No shading fix is claimed for the promoted0.17 build. New zonohedron, cell-attribute
and animated-tour prototypes remain unmounted pending this fix.

## Verified 0.18 stereographic surface repair

Shared curved-edge refinement removes adaptive T-junction cracks while retaining
analytic smooth normals, source face/cell ownership, star fill rules, RGBA and units.
The actual worker and unavailable-worker fallback use the same prepared computation.
Opaque/translucent GPU tests pass with exact30/30 shared samples and zero normal
disagreement; sampled interior lighting jumps are at most1/.667 luminance units.

863 frontend tests and all35 packaged desktop scenarios pass. Original failure
reports and successful-prefix receipts remain preserved; actual final reruns verify
current8192-input cap refusal and settled layer-workflow opens. No production
workspace-change guard was weakened.499 native input bytes reuse the prior3324PASS/
1skip qualification explicitly, without new pytest execution.64 native modules,
358 catalog assets, three frozen importers and95 frontend inputs match the candidate;
fresh Vite reproduction matches all four actual packaged outputs.

The unsigned portable is131,698,347 bytes, SHA256
`048a57027d5f2c827ffd52edd45c498327d16c7e3a70417c9d2855590bd09c7f`.
Actual standalone qualification passes with development Python unavailable,3064
source hashes/3050 parsed/14 diagnosed. [Release proof](../artifacts/release-0.18.0.json).
The guarded automatic-fit observation8Mk32K passes. Actual six-case motion8STMbh
preserves sources: tested tesseract interaction results are complete, dense cases
remain partial/capped; local worker medians17.5?20.1 and233?277ms respectively.
No identical-camera CPU speedup, whole-patch error or universal GPU guarantee.
All73 specification-wide parity gates remain open; the full-feature goal remains active.
