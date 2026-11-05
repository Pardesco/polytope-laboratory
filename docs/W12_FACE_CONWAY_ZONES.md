# Face subdivision, reference spheres, Conway operators and zones

In **Construct → Modify this model**, open **Face subdivision and Conway
operators** (`face-conway-settings`). The adjacent **Project vertices onto
sphere** panel (`sphere-projection-settings`) supplies projection controls.
The nested **Symmetry-axis zones and zone addition** disclosure is advanced and
closed initially. All model changes use native recipes: Undo/Redo, saved
projects, parameter branches and replay retain their existing workflow.

## Face subdivision

`face-method`, `face-height`, **Subdivide faces** (`subdivide-faces`):

- Centroid: fan each ordered polygon into triangles about its vertex mean.
- Kis: move that center outward by a nonnegative distance in source coordinate
  units, then build the same fan. Positive height requires a verified convex
  source. A high pyramid can produce a generalized nonconvex surface; the
  subdivision action retains that honest declaration. Conway kis refuses it.
- Midpoint: triangles become four triangles; other convex n-gons become n
  quads. Shared source edges own exactly one midpoint each.

No hull, weld or implicit star filling is used. Source vertices retain their
IDs; output faces record their source face IDs. Face RGB/RGBA is inherited by
each child, including alpha. Coordinate units survive; other metadata remains
historical. Edge/face annotations use the existing topology-change detachment
policy. New subdivisions support a single intrinsic 3D source with simple
convex planar faces (including open generalized surfaces at zero height).
Concave, star/self-crossing, nonplanar faces, compounds and cells are refused.
Input bounds: 2,048 vertices, 4,096 faces, 128 vertices per face, 16 MiB JSON.
Output preflight: 4,096 vertices and 16,384 source face corners. Calculations
use float64 and relative planarity/convexity predicates, not exact geometry.

## Reference spheres

`sphere-project-sphere` chooses an explicit/mean radius, circumsphere,
midsphere or insphere. Existing explicit center/radius expressions remain
available. A circumsphere requires a common vertex radius about a solved
center. Midsphere/insphere choices require equal distances from the vertex
mean to every edge line / face plane; this slice does not solve arbitrary
off-center edge-/face-tangent spheres. Edge tangency must lie on its segment.
Relative radius residual must be at most 1e-7. Unsupported choices refuse.

Subdivision retains checked pre-subdivision reference spheres, bound to its
result geometry fingerprint. This makes **icosahedron → Midpoint →
Circumsphere → Project onto sphere** work despite the refined vertices not yet
being cospherical. A later unrelated geometry edit invalidates that inherited
reference. Sphere projection still refuses newly nonplanar faces/cells and
preserves literal incidence; it does not implicitly triangulate quads.

`sphere-project-status` reports edge max/min and relative standard deviation.
Metadata also records minimum, maximum, mean, coefficient of variation and
radius residual. The frequency-2 icosahedral result has 42 vertices, 120 edges,
80 faces, edge max/min ≈ 1.13082636064, and coefficient of variation ≈ 0.061397.
It remains a generalized surface when starting from a generalized subdivision;
no filled-volume or uniformity claim is added.

## Conway

Buttons `conway-d/a/k/t/j/e` apply **Dual / Ambo / Kis / Truncate / Join /
Expand** to the current convex 3D polyhedron. The notation field
`conway-notation` and **Apply notation** (`conway-apply`) accept up to eight
operators and an optional Platonic seed `T`, `C`, `O`, `D`, `I`. For example,
`tI` constructs a truncated icosahedron, and `atI` then rectifies it. Without a
seed, operators use the current model. Operators run right to left.

Definitions: `d` is the existing polar dual; `a` is edge rectification; `t`
cuts directed edges at 1/3; `k` uses centroid pyramids; `j = dad`; `e = aa`.
Automatic kis starts at one quarter of the mean edge length and halves it until
the result is convex (at most 12 attempts); resolved heights and attempts are
recorded. A positive expression in `conway-height` instead uses that exact
requested distance and refuses a nonconvex result. Every intermediate must remain convex and
within construction bounds. These are geometric realizations of Conway
topology, not automatic uniform/canonical solutions. Gyro, snub, parameterized
notation and automatic canonicalization are unsupported. Existing regular-face
and equal-edge fitting controls remain separate explicit operations.

## Zones

`zone-fold` selects **2-/3-/5-fold** axes. **Inspect all axes of type**
(`zone-inspect-axes`) lists deterministic source-local IDs/directions and a
numerical rotation-axis residual. Enumeration requires the existing symmetry
kernel to exhaust the complete proper Euclidean symmetry group of a verified
convex source (at most 256 vertices). Axis type means the *maximal* proper
rotation order about that axis: the cube's 4-fold axes are excluded from its
2-fold type. Antipodal directions identify one axis. Empty `zone-axis-ids`
selects **all of type**; otherwise IDs select an explicit ordered subset.
**Construct from axes** (`zone-from-axes`) creates an equal-edge centered
zonohedron using `zone-length`. Select 3..32 axes spanning 3D.

The existing exact-raw-direction support kernel is used first. Float-derived
axes can contain near-coplanar dependencies that it cannot reconcile with its
numeric hull. In that case an incremental numerical Minkowski hull realizes
the same supplied segments; metadata names that method explicitly. Native
support distances and equal-edge lengths are independently checked to 1e-6
relative to segment length and their residuals are retained. No algebraic
symmetry or exact combinatorial certificate is claimed.

**Add zones to current zonohedron** (`zone-add`) reads 1..16 expression triples,
one per line in `zone-directions`. Every source face must be convex and
centrally symmetric (relative tolerance 1e-7); source incidence must match a
complete convex boundary. The result is the Minkowski sum of the source with
centered segments of length `zone-length`, so source position and existing
zone lengths are retained. Parallel additions lengthen an existing zone.
Unequal old/new zone lengths are supported. New incidence has no invented
colors; original attributes remain in history. Each hull stage is bounded to
4,096 input points. Zero directions, unsupported bodies or unresolved numeric
geometry refuse without changing the document.

## Verification

`tests/test_w12_constructions.py` covers requested model counts, midpoint
sharing, reference radii and frequency-2 edge dispersion, existing geodesic
equivalence, all axis types, numerical support fallback, zone addition,
source/color/unit preservation, refusals, native Save/Open, replay and branches.
`tests/face-conway-controls.test.mjs` covers expression evaluation, action
dispatch, axis IDs, diagnostics, cancellation, stale-source/input/export fences
and app/IPC integration. It is included in `test:features`. Existing history,
subdivision, sphere, geodesic and zonohedron regressions are also run. Vite
production bundling is checked; Electron launch is left to the lead engineer.
