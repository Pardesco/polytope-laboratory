# Filled density sections (W28)

In the derived viewport, choose **Section mode → Filled (density)**
(`section-density-mode`). Set **Normal** (`section-normal`) and **Depth**
(`section-depth`), then **Evaluate** (`apply-section`). The mode opens the
split viewport. The Analysis inspector has a collapsed **Filled section
settings** group (`density-section-settings`):

- **Density fill** (`section-density-rule`): nonzero, even/odd, or signed density ≥ k.
- **Threshold k** (`section-density-threshold`): integer expression, 1–100.
- **Apply density settings** (`apply-density-section`).

The derived viewport shows the signed-density color legend and integer residual
(`section-density-legend`). Excluded densities remain named in the legend.
Fills are opaque, use density colors, and show the selected region boundary;
coplanar subdivision edges are hidden. Source face-fill/color settings are
independent. Choose Surface / convex to restore the previous section domain.

**Promote** (`promote`) opens an independent document containing the selected
filled region boundary, through the normal native section recipe/history path.
The chosen threshold/rule, original source snapshot, numeric status and plane
remain reproducible. Undo/Redo, replay, project Save/Open, notes and units follow
the existing document workflow. Original annotations are archived by the existing
geometry ownership policy; live source text/PNG correspondence is not supplied
for this new arrangement domain. Saved section-depth animation and independent
tour layers retain the density settings.

## Meaning and computation

Native entry point: existing `section` operation with
`section_domain: "density"`, `normal`, `offset`, `fill_rule` and
`density_threshold`. Normal length is ignored; depth is distance along the unit
normal, in intrinsic source coordinates, as in the existing section tool.

For intrinsic 3D closed orientable surface chains, the density is the signed
degree of the source surface. Coherent face signs and the per-component positive
algebraic-volume convention reuse `generalized_density.py`. Ordered star face
cycles contribute signed triangle fans with multiplicity. Supporting face planes
cut the section plane into convex arrangement patches; each patch's interior
witness receives its solid-angle winding number. This overpartitions the actual
segment arrangement without adding a density discontinuity. Selected patches
produce filled polygons and closed oriented boundary loops, including holes and
separate loops that touch at arrangement vertices. Source geometry is never
replaced by its hull.

For intrinsic 4D sources, every source 3-cell must itself have one closed
orientable planar-faced 3D boundary. Its intrinsic signed degree uses the same
surface machinery, including star cells. Shared source-face boundary signs
orient the complete 4D cell chain; each connected component is flipped to
positive algebraic 4-volume. Active cell supporting hyperplanes restrict to
planes in the section's 3D frame. A bounded convex arrangement is classified
by oriented ray crossings of source cells, weighted by their intrinsic signed
degrees. Two distinct deterministic ray directions must agree. Shared selected
facets cancel, leaving an oriented closed solid boundary. Each exposed facet is
colored by its incident selected region's density. Internal density interfaces
are recorded by region witnesses/measures and the legend, rather than rendered
as overlapping internal surfaces.

Nonzero selects w ≠ 0; even/odd selects odd w; threshold selects signed w ≥ k.
These are explicit selected-region semantics, not an assertion of an ordinary
interior for the unchanged source. Multiplicity is not material density.
Promotion retains exactly the chosen fill, including parity holes; threshold 1
retains the positive-density boundary. Convex sources use the established convex
section kernel, preserving its coordinates and incidence.

Output `metadata.densitySection` includes face densities, boundary edges/loops,
region witnesses and areas/volumes, legend, fill rule, threshold and diagnostics.
The embedding reverses section coordinates to source coordinates. Reported
areas/volumes are sums of disjoint arrangement regions for each density, not
the source's algebraic volume or a claim of an exact measure.

## Bounds and refusals

All predicates and results are **float64 approximate**, with no exact certificate.
Diagnostics report integer residual (limit 1e-6), partition conservation residual
(limit 1e-6), and for 3D outputs selected-region/boundary volume residual (1e-5).
Closed orientation and two incident boundary faces per output edge are checked
for 3D fills.

Generalized planes within 16e-9 source spans of any original vertex explicitly
refuse, covering vertex/edge contacts and coplanar source faces. No hidden plane
perturbation is performed. **Next vertex** deliberately reaches such a contact;
move the depth away or choose surface curves. Convex sources retain their
existing tangency/coplanarity behavior.

Limits: 10,000 source vertices, 2,000 source faces, 600 source cells, 50,000
face/cell incidences, 64 active supporting planes, 4,096 arrangement regions,
100,000 split visits, five million density-triangle visits, 30,000 output vertices,
and ten million output conformity visits. Deep star-polychoron sections can
exceed these limits. Open/nonorientable chains, missing 4D cells, disconnected
cell shells, ambiguous zero algebraic volume, unresolved ray contacts and
nonmanifold selected 3D boundaries refuse with diagnostics. Failed or incomplete
work publishes no filled result. Generalized metadata is evidence, not a trusted
certificate; the source-bound recipe recomputes on replay.

## Verification and remaining qualification

`tests/test_filled_sections.py` checks:

- Stella octangula at depths t = 0.125, 0.25, 0.6: density-2 area
  2(1−t)² and density-1 area 8t(1−t), independently from tetrahedron inequalities.
- All four Kepler–Poinsot stars at three generic depths, with independent
  signed ray/triangle checks of every selected region witness.
- Eleven regular convex 3D/4D sources against the existing kernel's literal
  coordinates/incidence; six generalized convex boundaries against independent
  convex sections; overlapping 4D tesseracts with density-2 volume 6 and
  density-1 volume 4.
- All ten registered regular star polychora, including grand 600-cell, at shallow
  generic cuts: nonempty closed oriented boundaries and consistent densities.
  These smoke cuts use n proportional to (0.173, 0.239, 0.317, 1) and depth
  0.99 times the highest vertex level plus 0.01 times the second highest.
- Refusals, coordinate covariance, native JSON-lines continuation, promotion,
  Undo/Redo snapshots, Save/Open and deterministic replay.

Node tests exercise production Viewer color/fill/boundary buffers, mounted
controls and numeric expressions, promotion, cancellation, export ownership,
stale source/plane/policy/result rejection, and saved tour/depth routing.
Existing section/publication tests remain in place. The new test file is included
in `test:features`.

No published numerical reference-section comparison, general deep-section
qualification, performance guarantee, or Electron desktop click-through is
claimed. Electron cannot be launched in the worker sandbox. The all-ten smoke
evidence does not imply all depths/orientations or all parity selections work.
