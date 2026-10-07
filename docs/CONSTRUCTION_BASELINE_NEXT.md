# Remaining construction baseline: CON-02 and CON-12

Research date: 2026-10-04. This is an implementation plan, not a parity qualification. The original requirements remain **open**: CON-02 includes podia, antipodia, stephanoids, torus constructions and Waterman objects with verified options and sequences; CON-12 includes convex and benchmark crossed segmentotopes with verified orientation and parameter domains. A bounded first implementation does not replace those requirements.

The official [version history](https://software3d.com/History.php?prod=Great) identifies the expanded construction menu in Stella 6. The links below distinguish **published baseline**, **derived implementation proposal**, and **unknown requiring an installed baseline**. No installed Stella session was performed for this review. Several standalone manual URLs did not fetch; the torus text was verified in the official [combined manual, §8.12](https://www.software3d.com/Manual/Glimpse4D.php?prod=Great), rather than inferred from the name.

## Current local coverage

This inventory describes source present during the 0.14 integration; it does not claim packaged qualification.

| Local source | Actual coverage relevant to these requirements | Remaining gap |
|---|---|---|
| `engine/generators.py`, `waterman` branch | Convex hull of origin-centered integer FCC points with even coordinate sum and integer `radiusSquared` in 2–400 | Other origins, sequence identity/navigation, alternative methods and 4D; author root is not the current parameter |
| `engine/star_polygons.py` | Literal unreduced signed symbols, angular vertices, ordered cycles and disconnected components | An input factor, not any specialized solid below |
| `engine/products.py` | Polygon × interval and polygon × polygon, literal incidence and full factor snapshots | Unequal ring sizes, toroidal embedding and arbitrary two-layer joins |
| `engine/antiprisms.py` | Equal-radius rational antiprisms with raw signed half-step phase and explicit height/side-edge sizing | Unequal-radius antipodia |
| `engine/prisms.py` | Closed 3D shell × interval with direct 4D faces/cells | A same-source, aligned subset of two-layer constructions; no arbitrary segmentotope or crossed join |
| `engine/step_prisms.py` | Explicit correlated polygon point construction whose boundary is defined by a hull | Unrelated to a crossed segmentotope incidence rule |
| `engine/construction_finalization.py` and component adapters | Genuine leaf ownership, exact boundary comparison before approximate convex promotion, finite native project gate | New generator schemas must be reviewed and registered explicitly; arbitrary sources are not promoted |
| `engine/expressions.py` | `faceRad`, `faceAngle`, `diag` parse literal positive polygon symbols separately from arithmetic | Signed generator symbols and positive-only helper domains differ; do not pass symbols through generic division |

No production podium, antipodium, stephanoid, torus or arbitrary segmentotope generator was found. Toroidal models in prism/component tests are fixtures, not a torus construction workflow. The `waterman` branch does not expose a retained lattice-point-to-hull-source map or a sequence contract. Existing catalog files and Hull generators are useful references; they do not supply these missing APIs.

## Published baseline and unresolved details

### Podia and antipodia

The [podium manual, §8.9](https://www.software3d.com/Manual/Podium.php?prod=Stella4DPro) accepts three sizing values and an optional regular polygon symbol `n/d`, defaulting to a triangle. The four geometric modes combine base/top **edge lengths or radii** with **side-edge length or height**. A fifth mode interprets three face symbols as shallow-diagonal lengths for a 4D vertex figure. The [antipodium manual, §8.10](https://software3d.com/Manual/Antipodium.php) documents the corresponding five choices.

Unknown: exact ring alignment and raw retrograde convention, acceptance of zero top radius, negative sizes, degenerate height, disconnected symbols, output orientation and unit normalization. The manuals show star symbols but do not give ordered face tables. Equal-radius prism/antiprism agreement is necessary evidence, not proof of all modes. The [equation manual](https://mail.software3d.com/Manual/Equations.php) explicitly distinguishes a polygon symbol from arithmetic division; preserve that distinction in both dialog parsing and recipe parameters.

### Stephanoids

The [official stephanoid chapter, §8.11](https://www.software3d.com/Manual/Stephanoid.php?prod=Great) specifies positive integers `n,a,b`, with `n>3`, `a!=b`, `a+b<n`. A common divisor gives a compound. Faces are bow ties. Options produce either a uniform-edge **convex hull** or a geometrically self-dual stephanoid; all are topologically self-dual. Arrow navigation traverses a sequence. The [author's 7,1,4 model](https://www.software3d.com/Stephanoid7-1-4.php) confirms that these options select different heights.

Connor Hill's primary [2026 preprint, §4.1](https://arxiv.org/html/2607.28711v1#S4.SS1), restating earlier mathematical definitions, supplies a constructive ordered face orbit. For the prismatic family `PC(n,p,q)`, the representative cycle is `(a1,b(1+q),a(1+p),b(1+p−q))`, with `2p−n<2q<p<n`. For the antiprismatic family `AC(n,p,q)`, it is `(a1,a(1+q),a(1+2p),a(1+2p−q))`, with odd `q` and `2p−n<q<p<n`; the prescribed symmetry group generates the other faces. Cyclic labels wrap in their respective rings. Axial scaling leaves a family of noble realizations.

Unknown: conversion between Stella's `n,a,b` and these `PC/AC` parameters, the two height formulas, compound identity ordering and sequence traversal. Implementing the paper's explicitly named family is defensible; calling its arguments Stella-compatible without that crosswalk is not. The uniform-hull option is a condition on a separate hull, not permission to replace the bow-tie source faces with that hull.

### Polyhedral torus

The [official combined manual, §8.12](https://www.software3d.com/Manual/Glimpse4D.php?prod=Great) documents a polygonal approximation with three inputs: segments around the ring, segments around the arm, and arm radius relative to ring radius. Its example is `10,8,0.5`.

Unknown: minimum/maximum segment counts, scale, angular phase, quads versus triangles, vertex order, and whether horn/spindle ratios are accepted. Neither a twist parameter nor star-step options are documented there. Those would be separate extensions requiring independent definitions, not presumed baseline options.

### Waterman objects

The [Stella Create chapter, §8.1](https://software3d.com/Manual/Create.php?prod=Stella4DPro) documents a dialog with different construction types, sequence arrows and a 4D option. It does not identify the dialog's lattice, origins, threshold conventions or sequence rules in text.

Steve Waterman's [original definition](https://watermanpolyhedron.com/watermanpolyhedra1.html) constructs the convex hull of cubic-close-packed sphere centers inside a closed ball. Paul Bourke's [coordinate implementation](https://paulbourke.net/geometry/waterman/) uses integer coordinates with even `x+y+z`; standard root `N` corresponds to `radiusSquared=2N`. Thus the present default `radiusSquared=10` is standard root 5, not root 10.

Mark Newbold's [primary implementation notes](https://dogfeathers.com/java/ccppoly.html) document seven origin choices, rational-origin algorithms, and a distinction between sequence index and root; unchanged threshold steps can be skipped. Roger Kaufman and Adrian Rossiter's [Antiprism generator](https://www.antiprism.com/programs/waterman.html) additionally documents FCC/BCC/SC choices and efficient algorithms. These are independent mathematical/reference implementations, not evidence that Stella uses their exact menus or algorithms.

Unknown: Stella's complete list of methods/origins, ordering and skipped roots, meaning of its 4D lattice, centering, boundary inclusion and coloring. Do not identify a proposed 4D D4 lattice with Stella's 4D option without baseline evidence.

### Segmentotopes and crossed variants

Klitzing's primary [Convex Segmentochora, pp.1–6](https://www.orchidpalms.com/polyhedra/segmentochora/artConvSeg_7.pdf) defines the strict family by two parallel hyperplanes, a common hypersphere and equal edges. It provides facet tables, prism/pyramid constructions, circumradius relations including lower-dimensional shear, and a numbered catalog. It describes its catalog as believed complete without a firm proof; do not upgrade that to a completeness theorem.

The [Stella segmentotope chapter, §15.10](https://www.software3d.com/Manual/Segmentotopes.php) also permits a broader unequal-edge/no-common-sphere two-layer join. The base is polyhedral; top choices include point, edge, polygon, memory, built-in/dual and file. Presets and arrows enumerate strict examples. Options match edge lengths or retain sizes, customize lateral cell color/alpha, and adjust orientation with `gyro`, `gyro2`, `flip`. The author explicitly says these qualifiers differ from Klitzing's. Crossed mode connects lateral cells to opposite sides and produces nonconvex geometry.

Unknown: preset list/order, actual orientation matrices, automatic alignment/height solving, edge matching for irregular models, and the crossed cell gluing rule. The word “opposite” does not determine a permutation for a general nonsymmetric source. No verified crossed fixture was obtained here. A convex join can be generated independently; a crossed join needs its actual ordered face/cell incidences before implementation or qualification.

## Proposed next implementation batches

These are derived engineering contracts, not additional claims about undocumented Stella behavior. Start with **A**, which has the shortest route to a meaningful independent topology proof; **B** reuses more existing literal star infrastructure. Baseline capture can proceed separately for every batch.

### A. Literal untwisted torus kernel

Proposed `polyhedral_torus(ring_segments, arm_segments, arm_ratio, ring_radius=1)` in a new module. Initially accept integer counts at least 3 and `0<arm_ratio<1`, explicitly diagnosing horn/spindle cases as unimplemented. For `u=2πi/n`, `v=2πj/m`, `R>r>0`, use

```text
P(i,j) = ((R+r cos v) cos u, (R+r cos v) sin u, r sin v)
face(i,j) = (P(i,j), P(i+1,j), P(i+1,j+1), P(i,j+1))
```

Both indices wrap. Build the two periodic edge families directly. Each quad joins parallel ring chords, so its four vertices are coplanar; verify numerically anyway. Preserve all `nm` vertices and cell-free ordered incidence. Counts are `V=nm`, `E=2nm`, `F=nm`, Euler characteristic zero. Retain genus-one generalized interpretation; do not infer convex content or collapse the hole with a hull.

Independent fixtures: hand-authored `3×3` seam adjacency; manual's `10×8,0.5` with `80/160/80`; sampled meridian/ring radii, planar faces, each edge in two faces, circular vertex links, outward local orientation and exact periodic source IDs. Verify colors/project roundtrip, finite extremes, wrong types, huge integers, count-product caps and atomic rejection at ratio boundaries. An unrelated parametric sampler and independently enumerated periodic graph should provide the references, rather than calling the production constructor to generate expectations.

### B. Literal unequal-radius podia and antipodia

Proposed two APIs sharing explicit sizing: literal `symbol`, either base/top radii or base/top edge lengths, and exactly one of height or side-edge length. Positive radii and height initially; zero-radius apex is a separately diagnosed domain. Let `θ=πd/n`, `g=gcd(n,d)` and `e=2R|sin θ|`. Preserve unreduced signed symbols and source cycles.

For an aligned podium, corresponding vertices have horizontal separation `|Rb−Rt|`; side length `L` implies `h²=L²−(Rb−Rt)²`. Side quads follow each ordered base edge and its top copy. Counts: `2n / 3n / (n+2g)` for vertices/edges/faces.

For an antipodium proposal, rotate the top by raw `θ`, and retain the existing antiprism's triangle adjacency. The horizontal side distance satisfies `q²=Rb²+Rt²−2RbRt cos θ`; then `h²=L²−q²`. Counts: `2n / 4n / (2n+2g)`. A nonpositive or numerically unresolved radicand is a structured refusal, never clamped into a flat solid. Use scaled `hypot`/difference formulas and a documented resolution check near equality.

Independent fixtures: equal-radius square podium equals cube boundary; triangular equal-radius/equal-edge antipodium equals octahedron; unequal radii verify every edge and planar trapezoid analytically; symbols `5/2`, `5/3`, `5/-3`, `6/2` preserve cycles and genuine disconnected leaves. Compare native Keep/Delete maps to independent original ring indices, not adapter output. Store each factor snapshot, mappings, sizing mode and resolved dimensions. The vertex-figure mode should call literal `diag` helpers explicitly and retain those face symbols in provenance; no decimal quotient conversion. Qualify its scale convention against the installed baseline before claiming that mode matches.

### C. Waterman provenance and sequence kernel

Proposed bounded `waterman_fcc(center, radius_squared)` plus a distinct `standard_root(N)` convenience mapping to `2N`. Support exact rational thresholds/origins so membership in the closed ball is an integer/rational comparison. Store all selected lattice coordinates or a bounded reproducible manifest, extreme-point indices, nonextreme omissions and output support-facet maps. A hull is appropriate here because it is the defining operation, not a substituted star boundary.

Independent fixtures: radius squared 2 at origin gives cuboctahedron `12/24/14`, radius squared 4 gives octahedron `6/12/8`; verify coordinate sets directly. Center `(1,0,0)`, threshold 1 gives the six-neighbor octahedron; center `(1/2,1/2,1/2)`, threshold `3/4` gives tetrahedron; center `(0,0,1/2)`, threshold `5/4` gives square pyramid. Derive these small finite sets with exact arithmetic and independent support-plane enumeration. Distinguish candidate-point count from hull vertex count and repeated geometric boundaries from requested root identity.

Do not change existing `radiusSquared` semantics silently. Introduce an explicit sequence schema only after defining whether steps enumerate threshold shells, roots or distinct hulls. Extend to the documented Stella methods and 4D after baseline capture. Alternative packings are optional mathematically named generators, not assumed Stella compatibility.

### D. Convex two-layer join and strict qualification

Proposed `convex_layer_join(base, top, height, top_transform, sizing='keep')`, with explicit intrinsic dimensions/coordinate frames, transformed copies and full unchanged source snapshots. Initial domain: verified convex intrinsic-3D base, convex top of dimension 0–3, positive separation, no implicit recenter/rotate/scale. Define the output as the convex hull of `(base,-h/2)` and `(transformed_top,+h/2)`. Record every hull vertex's layer/source ID and whether any supplied source point is nonextreme; never silently present a discarded source vertex as retained geometry. Top/base cap roles and lateral cell provenance must be explicit, with ordered faces and complete cell membership.

A separate read-only strict classifier should check common sphere, every actual output edge length, regular ordered faces and the selected normalized tolerance; it must return approximate evidence, not an exact or uniform certificate. Automatic edge matching needs a well-defined source edge class. Models with several edge lengths should refuse an ambiguous scalar match. Explicit transforms are not aliases for undocumented `gyro` checkboxes.

Independent fixtures: aligned cube atop cube gives tesseract `16/32/24/8`; tetrahedron atop point gives 4-simplex `5/10/10/5`; cube atop point gives 4D pyramid `9/20/18/7`. Verify literal independent coordinates, complete cycle/cell sets, all supporting planes and ridge degree, not only counts. Include unequal-size non-strict joins, lower-dimensional top, color/alpha maps, rank failures, nonconvex-input refusal and nonextreme-point handling. Klitzing's numbered examples provide an additional independently transcribed fixture once their coordinates and orientations are verified. Existing shell × interval remains the direct-incidence path for literal nonconvex prisms, not input to this convex-only operation.

For independent unit-edge pyramid references, a unit cube at fourth coordinate zero has radius `sqrt(3)/2`; its apex at `(0,0,0,1/2)` is one unit from every cube vertex. A unit regular tetrahedron has radius `sqrt(6)/4`; the analogous apex separation is `sqrt(5/8)`. These are derived fixture dimensions, not a claim about Stella's automatic placement convention.

### E. Stephanoid orbit kernel and crossed segmentotope baseline

First implement an explicitly named `PC/AC` orbit constructor from the paper, with arbitrary positive safe axial scale and cyclic face orbits preserved up to rotation/reversal. Validate planar bow ties and link topology; intersections are not new vertices. Build edges from ordered cycles and preserve disconnected leaf IDs. A separate aspect solver may impose uniform hull or geometric self-duality once an independently derived residual equation, uniqueness/domain checks and fixture establish the intended solution. Check dual incidence plus a rigid similarity correspondence; matching only dual counts does not prove geometric self-duality.

Independent fixtures should transcribe one prismatic and one antiprismatic orbit without using the production orbit builder, then cover the manual's `7,1,4` and compound `12,3,6` after parameter mapping. Preserve both orientations of crossed face cycles and front/back material semantics. Record the exact source of the Stella-to-paper crosswalk and both height references. Sequence iteration remains a separate verified contract.

Crossed segmentotopes require a baseline package containing at least one named preset, top/base coordinates, final ordered edges/faces/cells, transforms, height and option state. Establish an author-derived lateral-cell permutation, then independently check each ridge's two-cell incidence, cell-shell links, rank and literal layer ownership. Never obtain this mode by a convex hull, by relabeling a convex join, or by arbitrary matching of equal-distance vertices. A mathematically explicit limited crossed family is useful, but cannot close CON-12 until the benchmark variants and orientation modes are covered.

## Shared resource, provenance and integration contract

Proposed initial ceilings: 4,000 output vertices for direct 3D construction; torus `nm<=4,000`; one million total incidence references; 100,000 edges/faces/cells; 2,048 vertices per face; 1,024 genuine components. Bound candidate lattice enumeration separately (for example one million inspected sites and 100,000 selected sites), before allocating a coordinate array. Convex 4D joins should initially cap total input vertices at the existing classifier's 64-vertex verification limit; larger support reconstruction needs a separately qualified work budget. These are initial engineering domains, not the competitor's documented limits.

All numeric inputs must reject booleans, huge integer conversion overflow, NaN/Infinity, nonpositive sizes and rank collapse as `GeometryError`. Require bounded finite coordinates and JSON payload/depth using the existing native project limits, including full historical snapshots and current leaf snapshots. Count and provenance budgets are checked before and after generation. New generators should be cancellable worker jobs, with no blocking enumeration on the GUI thread.

Use versioned generator parameters, original literal symbols, source snapshots/fingerprints, all current incidence source maps, and explicit color ownership. Historical snapshots are immutable; generated leaf snapshots must reconstruct the actual current coordinates and ordered boundaries. Attach components before finalization, preserve all leaves on generalized fallback, and refresh binding after native validation/canonicalization. Current `construction_finalization.py` admits only its listed schemas: a new schema needs its own attachment/convex/measure/project gates rather than pretending to be an existing product. No source geometry is changed merely to obtain a promotion.

For each integrated operation, qualify native save/reopen, history undo/replay/parameter branch, atomic failure, component extraction/deletion, project RGBA and source nonmutation. Approximate support verification never becomes exact certification. Torus, bow ties and star sources need literal incidence and an honest generalized interpretation, even if their vertex sets have simple convex hulls.

## Installed-baseline evidence still required

Capture the precise product/version, full dialog fields/defaults, accepted/refused edge cases, numeric results and exported source incidence for every compared case. Store small lawful fixtures with provenance rather than redistributing a competitor catalog without license. Include adjacent sequence steps and identify whether duplicates are skipped.

| Baseline gate | Minimum evidence |
|---|---|
| Podium/antipodium | Each sizing mode, unequal radii, `5/2` versus `5/3`, vertex-figure symbol mode, phase/height/degenerate rules |
| Torus | `10,8,0.5`, smallest accepted counts, ring scale/phase, quads/triangles, ratio 1 and greater than 1 |
| Stephanoid | Parameter crosswalk for one PC and one AC, `7,1,4` both options, `12,3,6` components, preceding/following sequence states |
| Waterman | All method/origin choices, root versus sequence fields, same-root repeated outputs, threshold equality, first 4D cases and actual lattice |
| Segmentotope | Preset inventory/order, every qualifier's matrix, unequal-size mode, lower-dimensional tops, edge matching, lateral RGBA, at least one full crossed benchmark |

Read-only research checks independently enumerated the three rational-origin FCC fixtures above with exact fractions (6, 4 and 5 selected sites). A separate periodic mesh calculation verified torus `3×3` counts `9/18/9` and `10×8` counts `80/160/80`, degree two at every edge and planar-face determinant residual below `1.2e-16` at unit ring radius. These check the proposed references; no production torus or Waterman extension was implemented or qualified by this review.

The smallest actionable next module is the untwisted ring torus. Podia/antipodia follow closely with a larger but explicit star and component contract. The remaining capture gates stay visible while mathematical kernels advance; none of these proposed subsets closes the original 73-feature goal.
