# Generalized density and algebraic measures

Open Inspector, Analysis, then Generalized 3D density / algebraic measures. Declare a point in source coordinates and choose coherent source face anchors or positive algebraic volume per component. Compute evaluates the supplied ordered surface; Save evidence retains a source-bound report in the native project. Restore saved reconstructs the report. JSON includes the complete original source, notes, units, annotations and evidence; CSV exports the declared point and measured quantities.

Point density is the signed integer winding degree of a qualified closed orientable planar-faced 3D chain at the declared point. Its magnitude is reported separately. The surface integration follows original face cycles, including star winding. Density on the surface is undefined. A zero or unresolved algebraic volume cannot select a positive-volume orientation; choose explicit source anchors instead.

Volume is oriented algebraic volume and counts signed multiplicity. Surface measure is the sum of magnitudes of each face cycle's algebraic area vector. These values are distinct from unsigned filled area, union area and bulk volume. Coordinates retain their declared source units with area and volume powers; selecting units does not silently rescale geometry.

The four regular star fixtures yield center densities 3, 3, 7 and 7, checked against independent Cayley relations. Reflections reverse source-anchored signs; positive-volume orientation explicitly normalizes them. Source cycles, raw RGBA, notes, text/PNG and history remain unchanged by measurement.

Work is bounded and uses normalized float64 predicates. Open/nonorientable chains, ambiguous boundary points, nonplanar faces and unresolved integer winding receive diagnostics. Four-dimensional density and arrangement-resolved union/bulk volume remain unavailable.
