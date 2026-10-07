# Spherical stereographic projection

The previous renderer used x/(1.05-w) and joined projected endpoints by straight
segments. That was a perspective-like chord drawing, not the curved spherical
stereographic display implied by the selected mode.

The corrected display first maps source-centered 4D points radially onto the
unit three-sphere, then uses (x,y,z)/(1-w) from the +W pole. The SO(4) entity
frame and six-plane angles are applied once before that map. Edges follow the
radial image of the source segment (a great-circle arc when unambiguous), with
adaptive subdivision of its actual projected curve. Faces use radial source
triangle patches and adaptive curved-surface tessellation; virtual star-face
crossing points follow the same map and retain their source face/cell IDs.
Source coordinates, incidence, measurements and intrinsic exports are unchanged.

A great circle through the pole maps to a straight line. All other great circles
map to circles, so the correct display can contain both curved and straight
edges. See Schleimer and Segerman, [Sculptures in S^3](https://arxiv.org/pdf/1204.4952),
sections1,2 and3.1, for the projection formula and radial polytope construction.

The finite display clips where 1-w <0.02. Segments never bridge a clipped pole
region. An edge through the source center has no unique radial arc; a triangle
containing that center has no defined complete radial patch. These are omitted
with explicit diagnostics. Subdivision has declared resource bounds; unresolved
portions are omitted rather than replaced by misleading flat chords or faces.
Noncospherical sources use radial display projection, not a claim of preserving
intrinsic edge lengths or filled solid volume. Shrink precedes radial projection.

Sixteen pure fixtures independently verify a quarter-circle edge, a fitted
generic circle, pole lines/split branches, unit-sphere surface patches, an
interior pole, undefined center geometry, source immutability and bounded
subdivision. Six renderer fixtures, five analytic-normal fixtures and six desktop workflows pass, including
GPU pixels at the analytic circle midpoint and absent chord midpoint, curved
face interior, once-only rotation, curved cylinders and native restoration.
Curved patches use analytic sphere/plane normals; a 121-pixel lighting row has
maximum adjacent luminance change 0.667, without triangle shading seams.
Evidence: `artifacts/stereographic-smoke-hHRzwD/result.json`. Packaged verification
remains pending. Dense filled-surface motion is still CPU limited; unchanged
frames reuse tessellation, and wireframe avoids surface tessellation.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/stereographic/stereographic-packaged-dxELIY/result.json](../artifacts/desktop-qualification-E5RVgf/stereographic/stereographic-packaged-dxELIY/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
