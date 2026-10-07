# Ordered polygon products

Verified release 0.13 adds **Construct → Polygon products**. Enter each literal polygon
symbol (`n`, `n/d`, including signed and unreduced denominators) and a positive
radius expression. **Generate 4D product** creates a separate document. For a
current intrinsic 2D polygon embedded in two coordinates, enter a positive prism
height expression and choose **Prism from current polygon**.

The kernel concatenates coordinates and constructs incidence directly. A prism
uses two copies of each source cycle and one quadrilateral per source edge. A
4D product contains polygon × vertex faces, edge × edge quadrilaterals, and
polygon × edge cells. It never substitutes a convex hull for a star boundary.
For example, `5/2 × 3` has 15 vertices, 30 edges, 23 faces and 8 cells;
`6/2 × 3` retains both triangular cycles and has 18/36/30/12 elements.

All results currently retain the generalized-complex interpretation, including
ordinary square × square. Full factor snapshots, geometry fingerprints, complete
attribute hashes, factor-to-result incidence maps and literal symbols remain
inspectable in native files. Source polygon colors are copied to corresponding
caps; connecting quadrilaterals and cells have no inferred color. Disconnected
components have complete incidence partitions; these partition IDs currently
do not implement compound Keep/Delete.

Prisms record the `polygon-prism` operation with algorithm version 0.1.0. Native
save/load, undo snapshots, replay and height parameter branches preserve ordered
geometry. Dimension-changing recipes reset section directions and obsolete net,
camera and animation presentations in the new state. Original source states
remain intact; units and appearance settings are preserved.

The supported source domain is disjoint polygon cycles with degree two at every
vertex, full intrinsic rank and resolved nonzero edges. Sizes must be finite and
positive; at most 4,000 product vertices are allowed, together with existing
aggregate incidence, component and payload limits. Numeric degeneracies and
unsupported inputs fail atomically. Float64 construction and incidence checks
do not certify convexity, filled-region volume or exact arithmetic.

Native integration evidence: `artifacts/products-native-0.13.0.log` contains
162 passing product, recipe, history and persistence checks, including the new
`tests/test_product_workflow.py`. `scripts/polygon-product-smoke.cjs` exercises
actual desktop controls and native snapshots, with an independent Cartesian
tesseract incidence check. All four packaged desktop groups pass in
`artifacts/desktop-qualification-45ZOZr/result.json`; the actual portable also
checks signed factor snapshots, direct prism incidence, replay and unit/dimension
reset in `artifacts/portable-0.13.0/portable-smoke.json`. Full release evidence is
`artifacts/release-0.13.0.json`. Complete generator parity remains open.
