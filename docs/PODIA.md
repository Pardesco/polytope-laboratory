# Literal podium and antipodium kernels

`engine/podia.py` provides `rational_podium` and `rational_antipodium` as independent native kernels. Every direct kernel result is an approximate, uncertified `generalized-complex` boundary. No hull, vertex weld, filled star interior, volume or automatic convex promotion is performed by those raw kernels.

Current 0.14 development registers `rational-podium` and `rational-antipodium` and mounts their four sizing modes in the compact construction disclosure. Generator results pass through genuine component ownership and independent boundary/native-persistence/finite-measure finalization. Safe ordinary sources can gain an approximate convex declaration; stars, disconnected boundaries and unsafe measure cases retain generalized semantics. Full source coordinates, ordered incidence, raw parameters, both polygon snapshots and RGBA are preserved. This is development integration, not a qualified portable release or full Stella parity.

The four sizing combinations correspond to the published [podium manual, §8.9](https://www.software3d.com/Manual/Podium.php?prod=Stella4DPro) and [antipodium manual, §8.10](https://software3d.com/Manual/Antipodium.php), checked on 2026-10-04. Those pages also describe a fifth mode interpreting polygon symbols as vertex-figure edge lengths. That fifth mode is **not implemented**. Ring phase, sign, normalization and exceptional domains below are explicit local mathematical definitions; an installed Stella baseline has not qualified them.

## Parameters and sizing

Both functions accept integer `n,d`, or literal `symbol='n/d'`, plus exactly one complete pair `base_radius,top_radius` or `base_edge,top_edge`, and exactly one `height` or `side_edge`. An omitted polygon means `3/1`; `d` defaults to 1. Optional `cap_colors` is a list of one existing OFF RGB/RGBA record or null per disjoint source cycle; both caps copy those records independently and lateral faces are uncolored. Inputs are never mutated.

```python
from engine.podia import rational_podium, rational_antipodium

aligned = rational_podium(symbol='5/2', base_radius=2, top_radius=1, height=3)
crossed = rational_antipodium(symbol='5/-3', base_edge=4, top_edge=2, side_edge=5)
```

Retain `n,d` unchanged: `3 <= n <= 1024`, signed integer `0 < abs(d) < n`, excluding half-turn digon cycles. A common divisor gives `g=gcd(n,abs(d))` separate incidence components; crossings create no additional vertices. Sizes and resolved lengths/radii must be finite, positive and at most `1e100`. Zero top radius, apex collapse, nonpositive height, mixed or incomplete sizing pairs, and boolean/string/nonfinite numeric values are refused as `GeometryError`. Very small sizes or extreme aspect ratios can also be refused when relative geometry is unresolved; the upper numeric bound alone does not guarantee acceptance.

Let `theta=pi*d/n`, base/top radii `Rb,Rt`, separation `h`, and connecting edge `L`. Each ring's boundary edge is `2R*abs(sin(theta))`.

| Kernel | Top ring phase | Horizontal connecting separation `q` | Side incidence |
|---|---|---|---|
| Podium | 0, matching angular IDs | `abs(Rb-Rt)` | One planar quad per ordered source edge |
| Antipodium | Raw signed `theta` | `sqrt(Rb²+Rt²-2RbRt*cos(theta))` | Two triangles per angular step |

Height mode resolves `L=hypot(q,h)`. Side mode requires `L-q > 4*max(ulp(L),ulp(q))` and resolves `h=L*sqrt((1-q/L)*(1+q/L))`. It never clamps an imaginary/uncertain height to zero. Antipodium `q` uses scaled `hypot`, normalized radii and separate square roots to avoid forming `Rb*Rt`, large squared radii or cancelling nearly equal squared quantities. Coordinates put the unrotated base at `z=-h/2` and the top at `z=h/2`; source snapshots are the original intrinsic 2D rings, accompanied by explicit `sourceEmbedding` transforms.

`5/3` keeps a different antipodium phase from `5/-2`, although their 2D ordered step cycles coincide. Negating `d` produces a reflection under the angular ID permutation `i -> (-i) mod n`; it does not silently convert to a principal step.

## Incidence and provenance

Original angular IDs occupy lower vertices `0..n-1` and upper vertices `n..2n-1`. Lower cap cycles reverse their source order; upper caps retain it with an `n` offset. Ring edges remain in the source's sorted undirected edge order, first lower then upper.

Podium connecting edges `[i,i+n]` follow angular IDs. Walls follow source cycle traversal and are `[a,b,b+n,a+n]`. Counts are `2n` vertices, `3n` edges and `n+2g` faces.

Antipodium uses `j=(i+d) mod n`. Connecting edges are `[i,i+n]` and `[j,i+n]`; triangles are `[i,j,i+n]` and `[i+n,j,j+n]`, in angular `i` order. Counts are `2n` vertices, `4n` edges and `2n+2g` faces. Both kernels have no 4D cells. Equal-radius results reproduce existing explicit-height polygon-prism / rational-antiprism coordinates and ordered incidence exactly.

Metadata keys are `rationalPodium` and `rationalAntipodium`, schema 1, algorithm `0.1.0`. Each contains two complete independent `sourceModels`, original UUID/fingerprint/full snapshot SHA evidence in `inputs`, literal `orderedSourceCycles`, per-output `maps`, ring/cap reverse `sourceMaps`, sizing inputs/resolved metrics, original-space embedding transforms, and complete `componentPartitions`. `resultSourceModelId` and `resultSourceFingerprint` bind generated evidence to unchanged current geometry. Reverse maps describe direct ring/cap copies; connecting entities have explicit source references in per-output maps.

For `6/2`, vertex partitions are `[0,2,4,6,8,10]` and `[1,3,5,7,9,11]`; output IDs stay interleaved. Each partition owns exactly one full closed 3D leaf boundary. They are **metadata partitions, not compound Keep/Delete IDs** (`recoverableCompoundComponents=False`). Integration must reconstruct genuine full 3D leaf snapshots from these current coordinates and cycles, preserve both original factors, attach the existing binary `sourceModel/sourcePath` component schema, remap all historical/current maps to original output IDs, and bind the proof after canonicalization. The shared antiprism component adapter was intentionally not changed. Ordinary results need an explicit safe finalization gate before any convex/measure claim.

## Validation and limits

Checks include relative full 3D rank, every normalized face's rank-two planarity, ordered cycle/index validity, every edge appearing in exactly two faces, exact disjoint ownership of all incidence, each partition's Euler characteristic two, and every actual ring/connecting edge agreeing with its own resolved length within `1e-8` relative tolerance. Source coordinates and incidence remain unchanged by validation. The tests additionally verify circular vertex links independently.

Ceilings are 4,000 output vertices, 100,000 edges/faces, one million aggregate coordinate/incidence references, 2,048 vertices per face, 1,024 partitions and a 64 MiB complete final payload including both historical factor snapshots. Counts are checked before source allocation. Optional attributes undergo bounded native JSON traversal before copying, rejecting cyclic, excessively deep, non-JSON and invalid UTF-8 values. Final payload checks also include attributes and maps. These are local engineering limits, not competitor limits.

`tests/test_podia.py` checks all four unequal-radius modes, full cube/octahedron Gram matrices and incidence, independent trapezoid/isosceles-triangle areas, signed retrograde reflection, `6/2` original-ID partitions and RGB/RGBA nonmutation, both full source snapshots, legacy direct-kernel agreement, native project roundtrip, normalized `1e-100` and `1e99` scales, near-flat ulp refusal, malicious/overflow values and resource guards. Generator dispatch, recipes/history versioning, genuine component operations, UI and the installed competitor baseline still need separate integration qualification. CON-02 remains open.

## Genuine component attachment

`engine/podia_components.py` now provides `attach_podia_components(model)` plus family-specific `attach_podium_components` / `attach_antipodium_components` convenience functions. It accepts only unchanged raw generalized output from the versioned podium kernels with valid generated UUID/fingerprint binding, both full source snapshots, matching original sizing parameters and complete ordered maps. It independently regenerates the mathematical kernel, validates actual factor-history UUID references and maps, and checks the entire generated factor evidence while allowing fresh generated UUIDs. Integer incidence/symbol IDs remain strict; native JSON can normalize continuous integral floats to integers. Existing ownership, changed geometry/cycles, forged sizing/source evidence, unsupported measure/support/certificate caches and altered raw numeric authority are rejected atomically.

Valid current face RGB/RGBA and unrelated current metadata can be independently edited and are preserved exactly. Each partition becomes a **full 3D leaf** using actual current coordinates and ordered boundaries, retaining both original 2D factors solely as provenance. The balanced binary compound tree has genuine source UUIDs, `sourcePath` references and remapped root current/historical input maps; nested historical snapshots keep their local IDs. Component/leaf IDs are deterministic for unchanged geometry, independent of new generator UUIDs. A one-partition model has a single `sourcePath=[]` component and a stored complete `directLeafSource`, without a fake sibling or downgraded 2D extracted geometry.

Attachment records use `metadata.podiaComponents`; full historical leaves contain `metadata.podiaLeaf` with both original factor models/inputs, source embedding, original global source maps, source partition, construction maps/provenance and current source attributes. Root `sourceModels`, `inputs`, coordinates, edges, face cycles, source UUID, colors and all current IDs remain unchanged. `recoverableCompoundComponents` becomes true. Existing native `compound-component` and `compound-drop` operations, project save/reopen and compound recipe undo/replay now work on independently attached fixtures. Deleting a leaf leaves original generator evidence historical/stale, as declared by its unchanged result fingerprint; remaining components retain their valid binary paths and IDs.

Additional attachment budgets are 16 MiB aggregate full leaf snapshots, 128 MiB cumulative historical tree work, and 64 MiB final native JSON payload; duplicated two-factor provenance is bounded before tree allocation. Attachment can therefore refuse a raw kernel model that meets kernel-only limits. No shared component adapter, construction finalizer, generator dispatch, UI or package was changed by this isolated implementation; root integration and convex qualification remain separate.
