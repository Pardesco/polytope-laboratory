# Proposed architecture section replacements — November 9, 2026

Proposal for the lead: replace the named paragraphs in `docs/ARCHITECTURE.md`
with the blocks below. Other ownership contracts and historical evidence remain
applicable. These are source-code observations, not new release qualification.

Changes: document implemented operation replay and version retention; broaden
the stated incidence-dual and net domains; distinguish generic stellation from
the implemented Miller rules; describe bounded automatic faceting and scoped
rational construction; replace stale blanket qualification statements.

## Replace the `incidence_dual.py` paragraph

`engine/incidence_dual.py` reciprocates validated 3D face planes and traverses
each source vertex's cyclic face link to define dual winding. It rejects
open/nonmanifold/pinched links, center-plane singularities and coincident
reciprocal planes, with a 2,048-face limit. Intrinsic 4D sources route to
`engine/incidence_dual_4d.py`: actual cell planes become vertices, source faces
become edges, cyclic edge links become ordered faces, and source vertices become
dual cells. Generalized and star incidence remains literal. Bounds are 4,000
vertices, 2,048 cells, 32,000 edges/faces and one million counted boundary
incidences. Neither route substitutes a hull, angular sort or coordinate weld.
Coordinates and polarity residuals are float64 approximations; no generalized
filled-solid measure is inferred. Source-entity extraction projects original
cycles into an intrinsic plane/cell basis with reversible embedding references.
Selection belongs to its source snapshot and clears on geometry operations.

## Replace the `nets.py` paragraph

`engine/nets.py` unfolds convex 3D boundaries as rigid-face hinge forests;
`engine/generalized_nets.py` extends the same operations to bounded, closed,
orientable intrinsic 3D shells with simple planar faces, including concave faces,
toroidal topology, disconnected closed components and 3D-in-4D embeddings.
Literal source incidence is retained. Explicit hinges must be acyclic; cuts may
create separate components. Edits preserve root placements and physical-mm rigid
component transforms. Signed hinge rotations generate fold poses, with source
endpoint, face rigidity and hinge-gap residuals. `ui/net-motion.mjs` evaluates
matching kinematics on the rendering clock. Shared cuts retain matching source
edge labels and tab ownership; positive face/tab overlaps are reported.
Self-crossing faces, open/pinched/nonorientable shells and unsupported resource
domains refuse explicitly. Source-face intersections, collision-free folding
and optimal overlap-free packing are not certified. Coincident-edge assembly
and fabrication have separate bounded policies in `engine/coincident_edge_assembly.py` and
`engine/net_fabrication.py`; unsupported policy combinations remain refusals.

## Replace the `cell_nets.py` paragraph

`engine/cell_nets.py` rotates intact convex 4D boundary cells about shared
2-faces into a common 3D chart. Its generalized routers additionally support
qualified nonconvex whole sources and ordinary nonconvex 3D cell shells;
`engine/star_cell_nets.py` handles its qualified regular-star-face domain.
Each route validates actual source cycles, affine ranks and boundary links;
unsupported star/nonplanar/open/pinched or unresolved shells refuse. Connections
form a forest. Cuts retain roots, reattachment moves descendants, and proper
SE(3) component placements persist as quaternion/translation records. Every
cell's metric distances and connected-face endpoints are checked numerically.
`ui/cell-net-editor.js` retains source-bound layout history, matching source
face/vertex selection and display-only shrink. A requested split-view resize
and its automatic camera fit complete before native layout ownership capture;
subsequent source/view/units/notes/history changes still prevent publication.
Cells are never replaced by their hulls. Cell intersections and collision-free
arrangements are not certified. See the individual generalized-cell contracts
for distinct per-route resource limits.

## Replace the `engine/stellation.py` paragraph

`engine/stellation.py` partitions an explicit observation box with supplied
facial/arbitrary planes. Unboxed signed half-space LPs classify boundedness;
partition volume checks and enumeration completeness name the finite domain.
Selected regions retain convex pieces while internal interfaces cancel.
Sections preserve disconnected and degenerate strata. Generic orbit-union
criteria exhaust subsets under named seed/connectivity/subgroup constraints
and report result/work limits; they are not a universal implementation of all
benchmark criteria. Separately, `engine/miller_stellations.py` implements the
documented Miller five-rule domain for a qualified regular icosahedron,
verifying its facial arrangement and source actions before enumerating the
59 named classes. The UI can adopt these through `stellation-make-base`, with
history/replay. Broader arbitrary-source criteria remain separately bounded.

## Insert after the stellation paragraph

`engine/automatic_faceting.py` enumerates exact supplied-coordinate source-plane
cycles and bounded labeled facet subsets for 4–12 intrinsic 3D source vertices.
Candidate completeness, search exhaustion, symmetry scope and work limits are
separate receipts. Exact predicates use integer/binary64-ratio inputs, not
intended algebraic coordinates. `engine/faceting_tidy_dual.py` tests both a tidy
primal and its actual finite polar under declared center/radius conventions;
unsupported or numerically unresolved reciprocal cases remain unknown.
`engine/automatic_faceting_workflow.py` verifies retained search results before
adoption and registers replayable `facet-adopt` recipes. This is bounded
automatic faceting, not unrestricted benchmark parity.

## Replace the `engine/rational.py` paragraph

`engine/rational.py` exhausts supporting planes for up to 32 supplied rational
points and accepts the float adapter only when its extreme vertices and facet
supports agree with exact Fraction predicates. Rational polar construction
revalidates the source and requires a strictly interior center and positive
rational radius. `engine/exact_surface_sections.py` constructs rational
source-face intersections and winding strata without inferring solid fill.
Project validation independently reconstructs certificates and exact-section
receipts. `engine/precision_report.py` reports individual guaranteed properties,
adapter discrepancies and unresolved claims. Display and ordinary measurements
remain float64. Ordinary affine/source-reflection transformations drop active
exact guarantees explicitly. History records rational-dual and exact-surface-
section constructions; the initial certified hull can remain a source snapshot.

## Replace the `ui/app.js` paragraph

`ui/app.js` maintains independent document snapshot histories. Model-changing
constructions use native recipe preparation and final source/history/content
publication checks. `engine/history.py` records bounded immutable operation
graphs with ordered geometry, source hashes, algorithm versions, numeric policy
and retained snapshots. Replay recomputes registered operations and verifies
their results; parameter branches open independent documents through
`ui/history-workflow.mjs`. `engine/history_migrations.py` supports schema 1 and
explicit retained prism/cell versions without rewriting recorded versions.
Valid unknown-operation/version/policy graphs remain snapshot-readable; affected
replay/branches refuse. Unknown schemas and malformed associations reject;
general future-schema migration is not implemented. Saved net settings regenerate
native cached layouts; their local Undo/Redo banks remain source-bound.
Derived request sequences discard obsolete responses. Shape-builder previews
have their own cancellation/selection owner: same-source display/classification
refreshes preserve the open diagram, while navigation/source replacement,
Cancel and export retain their close/invalidation paths.

## Replace the first paragraph under Qualification limits

Windows x64 is the current build target. Existing development and bounded
mathematical tests are distinct from qualification of the current installed
candidate. General exact geometry, exact/certified or unbounded symmetry,
unrestricted generalized-solid interiors, complete benchmark option/domain
coverage and independent specialist sign-off remain unclaimed. Generalized
surface sections, 3D/4D incidence reciprocation, bounded automatic faceting,
Miller's 59 and qualified generalized nets are implemented within their stated
contracts. The corpus crosswalk exists in
`engine/catalog_data/corpus_reconciliation.json`; it records identity/source
gaps separately from mathematical and release qualification. Its existence does
not establish full uniform-4D coverage. Clean-machine offline installation,
upgrade/recovery, actual printer calibration, hardware media coverage and
dependency/license distribution review require their own current evidence.

The old dependency-audit count is a dated observation, not a current audit.
Retain it only with its original evidence/date or replace it after rerunning
the audit on the release candidate; this follow-up did not run an npm audit.

## Source anchors checked

- `engine/incidence_dual.py`, `engine/incidence_dual_4d.py`
- `engine/nets.py`, `engine/generalized_nets.py`, `engine/cell_nets.py`,
  `engine/generalized_cell_nets.py`, `engine/generalized_concave_cell_nets.py`
- `engine/automatic_faceting.py`, `engine/automatic_faceting_workflow.py`
- `engine/history.py`, `engine/history_migrations.py`, `ui/history-workflow.mjs`
- `docs/MILLER_STELLATIONS.md`, `docs/SCOPED_EXACTNESS.md`,
  `docs/HISTORY_SUPPORT.md`, `docs/CORPUS_RECONCILIATION.md`

These replacements describe this worktree baseline plus R6-FOLLOWUPS only.
Reconcile other Round 6 workers' changes before adopting them centrally.
