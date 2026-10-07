# Ordered source-edge subdivision

`engine.edge_subdivision.subdivide_edges(source, divisions=2, edge_ids=None)`
refines source edges directly in dimensions 2, 3 and 4, including compatible
higher-dimensional embeddings. It returns a new validated generalized Model and
does not change the source. `edge_ids=None` selects every edge; an explicit list
selects distinct source edge IDs. An empty list or `divisions=1` records a valid
operation without changing the geometry.

The official manual distinguishes subdivision of every edge or a selected edge
type from subdivision of faces into triangles. This module implements the edge
operation and explicit edge-ID selection. Automatic type classification, face
triangulation, image inheritance and geodesic/sphere workflows remain separate.
[Official subdivision manual](https://software3d.com/Manual/Subdivide.php).

## Mathematical and source contract

Original vertices retain their coordinates and IDs. For each selected edge in
ascending source order, `divisions-1` vertices are appended at parameters
`i/divisions`. The implementation evaluates linear interpolation on the supplied
coordinates in float64; exact reduced rational parameters are recorded as
numerator/denominator pairs. This is parameter evidence, not an exact coordinate
certificate for arbitrary decimal/algebraic sources.

Every edge becomes its ordered segment chain. All incident source face cycles
receive the same inserted vertex IDs in their own traversal direction, even when
a source edge is stored in the opposite direction. Removing the new IDs from a
refined face cycle recovers the original cycle exactly. Star-face winding and
abstract source adjacency are retained; geometric crossings are not inserted as
new shared source vertices. Coordinates coinciding across independently indexed
edges remain independently indexed. No automatic weld or hull is applied.

Faces and cells keep their original IDs; cells retain their original face
incidence. Isolated vertices and wire edges are supported. OFF RGB/RGBA face and
cell records retain their encoding and alpha because those entity IDs do not
change. Coordinate units and fill rule survive directly. Other source metadata
and attributes remain in the full historical snapshot rather than being promoted
as unchanged classification or edge-index tables. The result does not claim
regularity, convexity or an inferred volume.

## Evidence schema

`metadata.edgeSubdivision` has schema version 1 and contains the full independent
`sourceModel`, selected IDs/division count, `edgeChains`, `vertexSources`,
`edgeSources` and `sourceMaps`:

- Original vertices map to unchanged output IDs; each new vertex names its
  source edge and exact rational parameter.
- Each source edge maps to the ordered list of new output segment IDs; inverse
  records give the source edge and rational parameter interval for every segment.
- Face and cell maps are identity lists because those source entities survive.

Provenance names `subdivide-edges`, version `0.1.0`, source ID, recomputed geometry
fingerprint and normalized explicit edge selection/division parameters. Native
history/UI integration can use this deterministic contract without changing the
frozen importer modules.

Native project validation may recompute derived support certificates,
representation fingerprints and measure caches where those fields apply to a
saved source. Such validation does not authorize restoring a copied convex
support table or volume to the new generalized refinement. Original source
certificates remain historical; direct subdivision preserves current coordinates
and incidence as its authority. Existing valid derived caches and their rebuild
rules should remain part of integration tests rather than being stripped merely
to simplify a save/load path.

## Bounded domain

Divisions must be an integer in 1–128. Source and output obey the current bounded
Model contracts: 20,000 vertices, 100,000 edges/faces/cells, 1,000,000 total
coordinate/incidence entries, 2,048 corners per face, finite source coordinates
bounded to `1e100`, and 64 MiB JSON including retained source history. Counts and
face-size budgets are checked before building the refinement. Degenerate
geometric edges or inserted points unresolved at float64 precision are rejected.
Fresh source and output incidence checks remain mandatory.

Top-level compound components are currently diagnosed: their historical
one-to-one edge maps require a separate hierarchical one-to-many refinement
contract before subdivision can preserve all existing component APIs. Extracting
a current component first gives an independently supported source. This explicit
limit avoids silently leaving stale maps in a previously validated compound.

Run `python -m pytest tests/test_edge_subdivision.py -q`. Independent literal
fixtures verify cube midpoint counts 20/24/6, tesseract counts 48/64/24/8,
coordinates, shared-edge orientation in opposite face traversals, partial
selection, reduced rational parameters, ordered pentagram boundaries, duplicate
geometric midpoints with distinct source identities, wire/point strata, RGBA and
units, JSON persistence, source immutability, invalid parameters and caps.

This bounded kernel subset begins `CON-08`. It does not complete that requirement.

## Construct workflow

Open Inspector, choose Construct, and expand Edge subdivision. Choose the
segments per source edge, then leave source edge IDs blank for all edges or
enter a list of selected integer IDs. The operation commits an undoable source
state with its original geometry retained in the construction graph. Replay
verifies that graph, and Parameters can create a different division count from
the original parent in a separate document. Animation export disables changes.

`scripts/construction-refinement-smoke.cjs` checks actual native saves, source
incidence, selected-edge orientation, cube/tesseract counts, undo, replay,
parameter branches and persistence alongside cupola construction. It requires
the matching built UI. Packaged checks use `POLYTOPE_TEST_EXECUTABLE`; private
artifact parents use `POLYTOPE_TEST_ARTIFACTS`. A desktop or packaged pass is
reported separately after actual execution.

Actual 0.12.0 development desktop qualification passed all six combined
construction/refinement groups in 31.528 seconds with zero page errors:
[run report](../artifacts/construction-refinement-smoke-8UYCCC/result.json).
The isolated run produced 27 native project snapshots and three screenshots.
Checks confirm cube midpoint counts 20/24/6, three-segment branching to 32/36/6
from the original parent, reversed selected-edge insertion and source RGBA,
and tesseract counts 48/64/24/8 with every midpoint and original cell incidence.
Undo, redo, graph replay, native save/reopen and retained 4D perspective are
verified from actual saved projects. The source fixture hash is unchanged.
Packaged qualification has not been claimed from this development run.
