# Coplanar regions, compound merging and pseudo-uniform variants (W48)

Construct → Modify contains **Merge compound** (`merge-compound`), with collapsed
**Merge options** (`merge-compound-options`), and **Pseudo-uniform transformations**
(`pseudo-uniform-settings`). Construct → Modify → **Face editing** contains
**Union selected faces (holes / stars)** (`blend-regions`). It uses **Faces to
blend** (`blend-face-ids`), the existing tolerance/weld/color controls, and
**Union winding rule** (`blend-region-rule`). The previous stricter **Blend
coplanar faces** action is retained unchanged.

## Planar union

`engine.planar_union.blend_regions(source, face_ids, tolerance=0, weld=False,
color_policy='require-equal', fill_rule='nonzero')` resolves each selected ordered
cycle independently with nonzero winding or even/odd parity, then unions the
filled sets. Opposite windings of separate source faces do not cancel each other.
Overlaps, containment, T junctions, self-crossing stars and disconnected regions
are supported. All selected faces must occupy one numerical plane. Embedded
planes in 2D/3D/4D are supported; contributing 4D faces must have identical cell
membership. Cell reconstruction across different memberships is refused.

The kernel refines a bounded convex observation polygon by every input edge
line, classifies the resulting convex cells, and cancels internal boundaries.
The observation polygon is only the arrangement domain: its exterior cells are
discarded, so the result is a region union, not a convex hull of the inputs.

**Representation choice:** ordinary simple faces. When holes occur, the retained
arrangement pieces remain separate, conforming source faces. This is a planar
decomposition of a logical holed region, rather than a new face schema or a
retraced slit. The current renderer rejects repeated face vertex IDs, and the
net kernel rejects retraced boundaries, so a zero-width slit would not work
through this app. Decomposition introduces visible subdivision edges and paper
seams; it preserves the actual opening. Hole-free regions coalesce to simple
boundary cycles. There is no claim that a holed region becomes one native face.

`metadata.faceEditing` retains the full source snapshot, face contributors and
source maps. Removed interior vertices and subdivided/removed source edges map
to null; faces map to all their resulting pieces. Evidence contains signed outer
and hole boundary cycles in a normalized plane chart, `planeOrigin`, `planeBasis`,
`areaCoordinateScale`, area agreement, winding rule, work counts and tolerance.
Reconstruct a chart point `q` with `planeOrigin + q @ planeBasis * areaCoordinateScale`.
The union explicitly resolves coincident coordinates and conforms boundary edges;
this differs from the old strict blend's shared-source-ID requirement. Optional
positive-tolerance source welding still requires the existing Weld checkbox.

Common literal RGBA colors survive. Require-equal rejects incompatible colors
when contributors coalesce; first-source chooses the lowest source face ID.
Holed-region pieces retain their actual contributors and colors individually.
Source coordinate units survive. Layer/material/image tables stay historical in
the source snapshot; they are not reassigned to fabricated element identities.

## Merge compound

`engine.compound_blending.merge_compound` uses the existing visible-surface
arrangement and solid-angle side classification to union the interiors of closed,
orientable edge-connected components. It then unions coplanar output regions,
conforms intersections, removes redundant degree-two collinear vertices, and
rechecks the closed shell and circular vertex links. It requires one connected
outer shell; disconnected or pinched results are refused. No convex-hull
substitution occurs. The same action can remove internal interfaces in an
augmentation. Holes in a visible face use simple pieces as above.

`metadata.compoundMerge` records the original source snapshot, final-to-original
face contributors, initial visible-surface diagnostics, winding residual and final
Euler characteristic. Source component ownership is explicitly replaced by one
shell. Coplanar overlapping source sheets retain visible-surface's deterministic
first-source ownership; this is recorded in its evidence. Color policy applies
to the subsequent coplanar blending.

Independent fixtures give stella octangula **14 vertices / 36 edges / 24 faces**,
and the automatic edge-contact cube/octahedron compound **26 / 72 / 48**. Two
face-adjacent cubes merge to **8 / 12 / 6**. This is the outer union surface,
including the concavities between spikes.

## Pseudo-uniform variants

The manual groups truncation, expansion and attempts to satisfy conditions under
[Mirroring and Pseudo Uniforms](https://www.software3d.com/Manual/Mirror.php?prod=Small).
It describes moving vertices to seek equal edges separately from regular faces.
W48 implements a bounded composition of those documented operations; it does not
claim a complete competitor classification or a separate exact pseudo-uniform
operator. See also [Expansion](https://www.software3d.com/Manual/Expand.php).

`engine.pseudo_uniform.pseudo_uniform` first performs literal incidence truncation
or the existing primal/reciprocal incidence-product expansion. It then calls
`condition_fitting.fit_conditions` for equal edges, retaining face planarity,
construction incidence, centroid and mean edge scale. Keeping the construction's
Euclidean symmetry is on by default and may be disabled. **Try equal-edge variant**
(`pseudo-uniform`) uses NumericEntry for seed amount, evaluations and tolerance.
The supported seed interval is strictly 0 < amount < 1/2 for both constructions.
Only validated convex intrinsic XYZ 3D sources with at most 64 constructed
vertices are supported. Stars, quasi-truncation and general nonconvex fitting are
refused. Failed or geometrically invalid fits do not publish a model.
Expansion uses the existing default reciprocal radius 1 at the source vertex
mean. Fitting preserves the constructed seed's mean edge length.

The output is **approximate**, and `metadata.pseudoUniform` reports maximum
relative edge deviation from the mean and normalized plane residual. Full solver
evidence is retained in `metadata.geometryFitting`. Equal edges do not establish
regular faces, vertex transitivity or uniformity. No exactness, global feasibility
or uniformity certificate is claimed.

## Persistence, nets, export and limits

All three actions use native recipe commits, with Undo/Redo snapshots, replay,
parameter branches and native project validation. Notes survive; stale net/morph/
animation configuration is cleared. Pending expressions and native publication
bind source attributes, notes, units, workspace, controls and cancellation. These
are construction jobs, not read-only warm-worker queries.

Rendering consumes ordinary simple faces without special handling. Closed 3D
outputs use the existing rigid face-net kernel, including fold reconstruction.
An isolated open planar annulus is renderable/exportable, but is not a closed
3D shell and correctly refuses a shell net. OFF reimport and OBJ retain the
simple pieces and opening. Existing STL/POV export still requires convex solid
boundaries and refuses these generalized surfaces; no unsupported solid claim is
introduced. Native project snapshots preserve all provenance.

Planar union: 2–64 selected faces, 128 selected corners, 6,000 arrangement cells,
2,000,000 vertex-resolution comparisons and boundary-conformance visits, and
2,048 corners per output face, plus existing compound source/payload bounds.
Normalized plane tolerance is 1e-10; arrangement/welding tolerance is 2e-8.
These are float predicates and are not scale-independent exact certificates.
Very thin or numerically unresolved boundaries can be refused.
Merge additionally inherits the visible-surface 100-face/1,200-corner source,
30,000 arrangement-piece and 250-face closed-net limits, and the planar bounds
on each blended plane. Paper overlap/collision freedom is not guaranteed.

## Verification

`tests/test_coplanar_regions.py` covers analytic hole area, simple-face
triangulation, an extruded square-hole shell net/fold and OFF roundtrip, triangle
star union, both pentagram winding rules, RGBA, embedded plane charts, T joins,
containment, refusals, compound counts, equal-edge residuals, replay and project
validation. `tests/blending-controls.test.mjs` covers mounted buttons, guarded
history parameters, expression/source/export/cancel fences and real renderer
tessellation of native hole output. It is included in `test:features`.

Qualification is native Python + Node + Vite. Electron was not launched in this
sandbox; the lead should click the listed controls in the desktop build.

Final focused/regression run: **188 Python tests passed** (20 in the new file),
**437 Node tests passed** (9 in the new file), and
`npx.cmd vite build --configLoader native` passed with the existing chunk-size
warning. An additional run including `tests/add-dual-controls.test.mjs` passed
412/413: its unchanged catalog-family assertion expects all 36 entries to be
`Compounds`, while the baseline catalog contains 33 `Compounds` and 3
`4D compounds`. No catalog or assertion was changed for this package.
