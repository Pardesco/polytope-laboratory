# Bounded distances on simple concave source faces

Stella's primary [Measurement Mode](https://software3d.com/Manual/MeasureMode.php?prod=Stella4D) measures supporting points, lines and planes and retains original source selection. The application keeps that infinite-flat behavior as the default. Its explicit **Bounded** option now also measures literal simple planar concave face regions in 3D.

Choose source vertices, edge segments or faces A/B and enable **Bounded vertices / edges / simple 3D faces / convex 4D cells** in Entity Measurements. The result gives actual closest points, original entity IDs, original triangle corner IDs and barycentric weights. A point over a concave notch measures to the real notch boundary, never the convex hull or the infinite supporting plane.

The native kernel verifies planarity, simple noncrossing boundary incidence, source-corner ear triangulation and area coverage. It computes every relevant point/segment/triangle pair using all feasible active simplex supports, then takes the minimum over the union. Each simplex's convex optimality gap bounds its numerical squared distance; the minimum lower and upper bounds cover the complete pair union. This is float64 evidence, not an exact arithmetic certificate. Original face cycles and all metadata remain untouched; triangles are temporary measurement regions, not replacement source faces.

The bounded source domain has one literal face cycle, so it does not represent polygon holes. Holes, star/self-crossing/retracing faces, nonplanar faces, unrestricted nonconvex 4D cells and source repairs remain unavailable. Selected entities have at most 64 original corners; the union has at most 4096 simplex pairs. Existing convex 4D face/cell measurements retain their prior route.

Async results bind the complete source attributes, notes, coordinate units, annotation document, workspace/document/state ownership and selected measurement targets. Cancellation and superseded requests cannot publish. Observer camera/rotation changes remain independent. Native Save/Open retains original source data and the selected bounded workflow.
