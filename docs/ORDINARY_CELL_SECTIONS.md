# Complete ordinary 4D cell sections

Choose **Ordinary 4D cell section** in the derived-view selector, set the normal
and depth, and click Evaluate. Unlike source-face intersection curves, this
mode intersects each qualified source 3-cell with the section plane and retains
its complete filled regions. **Surface / convex section** remains available.

Convex and concave ordinary cells can produce one region, disconnected regions
or regions with holes. Hole triangulation uses original cut-boundary vertices
and independently checks area, incidence, overlap and hole exclusion. Output
geometry preserves literal source vertex/edge identity, embedding references,
cell-to-face maps and source-cell RGBA. Coincident coordinates do not merge IDs.

Whole coplanar cells, empty intersections and isolated tangent results have
explicit outcomes. Self-intersecting, star or nonordinary cell boundaries and
unresolved branching geometry refuse filled semantics. This does not assign a
solid interior to arbitrary generalized incidence.

Promote creates a separate 3D document through reproducible construction history.
The source document remains unchanged; notes and coordinate units persist.
Existing source annotations are archived with their original ownership rather
than assigned to invented section entities. Save/Open and replay preserve the
result. Section-depth animation and saved tour layers retain this explicit mode.

Three native groups verify independent concave L, dented tetrahedron, generalized
tesseract, disconnected U and toroidal ring product fixtures, plus ownership,
colors, tangency, coplanarity, refusals and history. Two native-backed Node groups
verify production Viewer fill/alpha, promotion and saved-tour routing. Actual
desktop evaluation, concave promotion/Save/Open and open ring-cap rendering pass
in `artifacts/feature-0.26-quick-254ZbX/result.json`. This evidence covers the
declared ordinary-cell domain, not all generalized Stella4D sections.
