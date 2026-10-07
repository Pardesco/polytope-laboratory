# Intrinsic measurements and entity alignment

The Analysis inspector measures source geometry in model units. Display rotation, camera projection and surface shrink do not change these values. The new controls use source vertex/edge/face/cell indices or explicit vertex-ID lists defining a line, plane or hyperplane. Selected source entities can populate A or B. Measurement preferences belong to the document snapshot and survive native save/reopen; obsolete asynchronous responses are discarded.

## Distances and angles

Distance A / B measures the minimum distance between the entities' **infinite affine supporting flats** by default. An edge denotes its entire supporting line; a face denotes its entire supporting plane. The output includes two closest points. Intersecting supporting flats have distance zero even if the bounded source faces do not touch.

The bounded-edge checkbox instead measures finite source segments and vertices. An active-set solution tests interior and endpoint possibilities, including parallel, crossing and skew segments. Bounded face/cell distance is unsupported and diagnosed rather than approximated by a supporting-flat answer.

Principal angles describe unoriented direction spaces, in degrees from 0 to 90. A line and a plane have one principal angle. Two planes in 4D have two angles; both are reported, with no misleading single scalar. A vertex has no direction space, so its angle is undefined. Explicit flat vertices must have the requested affine rank; nonplanar, degenerate and invalid selections fail explicitly.

## Content and radii

A source edge reports length. An ordinary convex face reports intrinsic polygon area. A generalized face reports the absolute algebraic area of its ordered cycle; this is not the filled area of a self-intersecting polygon. A complete convex 4D source cell reports its intrinsic 3-volume. Generalized cell volume remains unavailable without a declared solid interpretation.

The common circumradius is the radius of the unique sphere through all selected vertices **in their affine hull**. A noncospherical vertex set returns unavailable. This is distinct from a minimum enclosing sphere or a radius about the vertex mean. The vertex-mean radius range is reported separately. Length, area and volume carry model-units, model-units^2 and model-units^3 respectively.

Convex interior dihedrals use 180 degrees minus the angle between outward supporting facet normals. The ridge is an edge in 3D and a face in 4D. The output identifies its two adjacent facets; whole-model analysis reports the minimum, maximum and mean. Generalized/nonconvex branch conventions are not inferred.

## Sections through entities

Section through A + offset finds a perpendicular section normal in intrinsic 3D/4D coordinates. At offset zero, the section contains the entire selected entity. A 3D face or 4D cell determines a unique normal, oriented outward from the vertex mean. Lower-dimensional entities use their radial direction projected into the perpendicular space. If this gives no direction, supply one explicitly; its perpendicular projection must be nonzero.

The offset is relative to the selected entity, with positive values following the returned unit normal. The returned section depth is absolute: normal dot entity origin plus relative offset. Alignment changes section settings and the derived view without changing source coordinates. Manual normal/depth changes clear the alignment record.

## Authority, numerics and limits

All these values are approximate float64 results, including measurements of rational-certified models. Calculations normalize source scale before rank/distance calculations and use the kernel's relative tolerance of 1e-8. Independent analytic tests cover scale covariance, rigid coordinate changes, skew lines, unequal 4D principal angles, Platonic/regular 4D dihedrals and aligned section contents. Extreme conditioning is not interval-certified.

Whole-model convex content and boundary measures are rebuilt from source coordinates and independently reconstructed complete incidence. Cached model.measure values are ignored by analysis and regenerated on native save/load for every history snapshot. Unsupported generalized measure caches are removed. A claimed convex boundary that disagrees with the independently reconstructed hull is refused.

Declared convex-region unions recompute measures from their pieces and exposed boundary; planar unions recompute area and external perimeter. Summed content relies on the declared disjoint-interior piece domain, which is not independently certified by this measurement operation. Generalized density, signed solid volume, general bounded-face distance, unit conversion and the full benchmark measurement domain remain pending. These workflows are prototypes, not requirement-wide parity qualification.

Headless operations are entity-measure (flat-distance or flat-angle), entity-info, dihedral and align-section. Each result identifies its source fingerprint, algorithm version and geometric definition. See tests/test_measurements.py and the desktop/portable smoke scripts for executable fixtures.
