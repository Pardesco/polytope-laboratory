# Stephanoids (crown polyhedra)

`stephanoid(n=7, a=1, b=4, mode='uniform-hull', radius=1, height=None)` constructs the literal self-crossing face complex. The Construct panel offers native expression entry, three sizing modes and Previous/Next navigation. Valid positive distinct integer steps satisfy `4 <= n <= 128` and `a + b < n`; radius and optional full height range from 0.0001 to 10000.

## Definition and actual parameter mapping

The [Stella manual](https://www.software3d.com/Manual/Stephanoid.php?prod=Great) names `n,a,b`, bow-tie faces, common-divisor compounds, uniform vertex-hull and geometric self-dual choices. The explicit implementation follows Antiprism's [documented crown constructor](https://www.antiprism.com/programs/polygon.html): `polygon crown n/a -A b`, where `a` is the first polygon step and `b` the integer second step. Ordered cycles are adapted from [`Polygon::make_crown_full`](https://github.com/antiprism/antiprism/blob/7805b34d3f8860857fb9ac10a1917d1bf4c7888d/base/polygon.cc). The adapted algorithm retains its upstream copyright and full MIT permission notice in the source.

The [primary named stephanoid examples](https://www.orchidpalms.com/polyhedra/noble/noble-dih.html) independently ground this mapping: complete source point-distance and actual edge-graph correspondence passes for prismatic `7-1-3`, antiprismatic `7-1-4`, and antiprismatic `4-1-2`, after extracting their original source coordinates and independently resolving ring aspect. This checks the source geometry and edges, not just counts. Local research receipts retain URLs and hashes; upstream VRML is not redistributed. A separate pinned Antiprism 0.32 reference fixture checks every coordinate and ordered bow-tie cycle for those cases and `12,3,6`.

If `a+b` is even, rings align (prismatic); otherwise they rotate relative to each other by pi/n (antiprismatic). Global source IDs are the upper ring first and lower ring second, both in increasing angular index. There are `2n` vertices, `4n` edges, `2n` ordered bow-tie faces and no cells. Crossings are not extra vertices, and a hull never supplies source faces. Each actual edge-connected constituent owns explicit vertex/edge/face maps. `12,3,6` retains three separate `8/16/8` constituents supported by existing Keep/Delete commands.

## Sizing

Uniform-hull sizing makes the *convex hull of the source vertex set* equilateral; it preserves the source bow ties. For ring radius R, ring hull edge L = 2R sin(pi/n). The full height is L for aligned rings, or sqrt(L^2 - (2R sin(pi/(2n)))^2) for antiprismatic rings. The constructor uses these analytic formulas, with independent read-only support-hull checks in tests.

For self-dual sizing, evaluate one source face normal `(u_x,u_y,w)` at R=1 and axial half-height z=1. The required dimensionless half-height is `sqrt(abs(w) / hypot(u_x,u_y))`. This follows from matching the axial/radial aspect of the origin-centered plane reciprocal. The constructor then performs actual native incidence reciprocation and requires a positive similarity plus axial rotation that maps every reciprocal vertex and every ordered face cycle back to the source. The recorded correspondence is float64 evidence, not an exact certificate. For `7,1,4` the full heights at radius 1 are approximately 0.744955 (uniform hull) and 1.498993 (self-dual).

Custom height sets the full positive axial separation directly. All sizing retains full native parameters and generator provenance. Models remain generalized complexes with no filled-solid volume assertion. Maps and evidence are explicitly bound to the generated source fingerprint. Native persistence, future operation history/replay, and constituent extraction preserve the supplied cycles.

## Navigation and limits

Previous/Next use this application's bounded lexicographic ordering of `(n,a,b)` with `a<b`, omitting swapped duplicate labels. Navigation needs literal integer triplets; Generate accepts native expressions. The installed Stella sequence order and its output orientation/unit normalization have not been compared, so identical ordering or packaged Stella parity is not asserted. The mathematical crown family and both sizing constraints are implemented, not a proprietary catalog.
