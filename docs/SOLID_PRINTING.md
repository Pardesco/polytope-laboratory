# Outer surface solid printing (W32)

File toolbar **Export** → **Export type: Printable model** (`export-kind`) →
**Construction: Solid · outer surface solid** (`printable-mode`). Set the longest
dimension with `printable-size`, then review `export-preview`: triangle count,
closed material components, material volume in mm³, bounding box, size residual,
and warnings. Choose STL, 3MF, OBJ or GLB in `export-format`, then
**Choose file & export** (`confirm-export`). No separate construction is needed.

Collapsed **Solid interior and hollow shell** (`printable-solid-settings`) offers
`printable-fill` (nonzero or even/odd winding), `printable-hollow` and
`printable-wall` (minimum wall thickness in mm, expressions supported). Export
settings are transient, like existing format/size choices. The source and its
history stay intact. The existing native read-only warm-worker operation,
NumericEntry, source/display ownership checks, cancellation and reviewed atomic
publication are reused; colored OBJ uses the existing exclusive MTL publisher.

## Geometry and output

Stars and compounds reuse `visible_surface`: each closed orientable component's
winding fill is unioned, intersecting faces split, and internal faces removed.
Separate nested components are filled by this union policy. No convex hull
replaces a nonconvex exterior. Extractor provenance supplies source colors per
output triangle. Existing disjoint-cell stellation unions use their exposed
boundary and additionally verify triangle side samples against the actual convex
cells. Simple connected embedded generalized boundaries above the extractor's
100-face limit are accepted only after an independent manifold/intersection
check. This also handles larger already-extracted surfaces and surgery results.

Planar polygon ear clipping retains collinear boundary vertices so neighboring
faces remain conforming. Checks require exactly two oppositely directed uses
per triangle edge, circular vertex links, no degenerate triangles, no detected
triangle intersections, and positive material volume per component. Disconnected
components become separate nonoverlapping closed shells. The complete source
display must differ only by rigid rotation and uniform scale; projected 4D,
exploded, morphed and incomplete displays are refused.

`report.volumeMM3` is signed material volume, `outerVolumeMM3` includes cavities,
`cavityVolumeMM3` is removed material, `shellCount` counts material components,
and `boundaryShellCount` includes cavity boundaries. Bounds include the exterior.
Reports include display-fit and size residuals and, when an arrangement was used,
its winding/planarity diagnostics. Float32 STL and GLB coordinates are requalified;
the GLB size residual uses the actual float32 meter coordinates.

STL has no colors. 3MF uses the standard material-extension `colorgroup` and
per-triangle `pid/p1/p2/p3` references with source RGBA (8-bit channels). OBJ/MTL
retains RGB/alpha per triangle; GLB uses flat linear RGBA vertex colors. Printable
review and STL/OBJ/3MF coordinates use mm. GLB serializes meters (glTF convention).

Hollowing currently requires convex exterior components. Angle-weighted vertex
normals define inward offset directions; distances ensure at least the requested
clearance from every incident outer face plane. Checks require a strictly nested,
convex, positive-volume inner boundary without reversed/collapsed triangles.
Cavity triangles point into the void, giving positive net material volume.
Thickness varies near corners. Unsafe thicknesses and nonconvex offsets refuse.
Closed cavities have no drain holes; no base/supports are generated.

## Limits and evidence

This is approximate float64 geometry, not exact algebra or certified manufacture.
The existing intersecting-source extractor retains its limits: 100 source faces,
1,200 boundary vertices, 30,000 arrangement pieces, 250 simple output faces, and
normalized side-sampling clearance. Hole-bearing faces, open/nonorientable,
pinched/touching, thin/unresolved assemblies refuse. Larger embedded connected
boundaries and exposed region unions bypass the paper limits, with a maximum of
20,000 outer triangles (hollowing doubles this), two million intersection candidate
pairs and 64 MiB combined output. Region unions with unsupported enclosed cavities
or inconsistent exposed boundaries refuse. Not all 59 Miller stellations or all
library compounds are qualified. Nonconvex hollow offsets and drain holes remain
follow-ups; Electron, physical slicers and printer hardware are not tested here.

`tests/test_solid_printing.py` checks both stellated dodecahedra, stella octangula,
both five-tetrahedra compounds, Miller C/G/H/f1, near misses, excavation, large
embedded surfaces, disconnection/nesting, guarded hollowing, encodings and refusals.
Five-tetrahedra volume is independently checked by inclusion/exclusion of convex
halfspace intersections. Stella octangula volume is cube/2: two tetrahedra of
cube/3 each minus their central octahedron of cube/6.

The small stellated volume check uses the
[augmented-core formula](https://mathworld.wolfram.com/SmallStellatedDodecahedron.html),
`V = (5/4)(7+3√5)a³`, where **a is the core dodecahedron edge**, equal to the
source pentagram edge times `√5−2`. The great stellated check independently sums
an icosahedral core and its twenty triangular pyramids, using the
[augmentation construction](https://mathworld.wolfram.com/GreatStellatedDodecahedron.html).

`tests/solid-printing.test.mjs` tests NumericEntry, stale hollow/fill options,
binary/material publication and a mounted Export dialog backed by native Python
for all four formats plus hollow-cube success/star refusal. It is included in
`test:features`. Run focused pytest (`-q -p no:cacheprovider`), affected Node
exporter tests, and `npx.cmd vite build --configLoader native`.

This note supersedes the convex-only Solid and GLB follow-up statements in the
earlier `PRINTABLE_EXPORT.md`; Strut and Panels retain their overlapping-shell
behavior.
