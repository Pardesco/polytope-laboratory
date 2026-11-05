# W35 information measurements and stereo

Analysis → **Measurements by element type** (`information-panel`) is collapsed
by default. Opening it computes the read-only native `information-panel` report;
`information-refresh` repeats it. `information-measurements` lists model radii,
content, density, Euler characteristic/genus and source edge/face/cell types.
`information-copy` copies tab-separated text through the browser clipboard;
`information-csv` uses the existing reviewed native text-export session. CSV uses
quoted fields, doubled quotes and CRLF records. Clipboard-unavailable environments
can use CSV. Changing source/history invalidates the report; export rechecks the
complete source after destination review. No geometry/history operation is made.

Types are existing full Euclidean symmetry orbits, including reflections, never
shape-only buckets. Length and dihedral ranges cover every source member; polygon
lengths/angles and cell measures use the named representative. Adjacent face types
(3D edges) or cell types (4D ridges) are explicit. Squares, pentagram cycles and
regular tetrahedral/cubic/octahedral/dodecahedral/icosahedral cells are recognized
only after metric checks; cell names also require their full boundary to match an
independently reconstructed convex hull. Other shapes retain incidence inventories.

All measures use unprojected source coordinates, float64, and declared coordinate
units without implicit conversion. Radius fits use absolute tolerance
`8e-8 × maximum source coordinate span`; residuals and tolerance are displayed.
Circumradius fits one common vertex sphere. **Midradius means a concentric sphere
about that circumcenter tangent to every edge segment**; it is unavailable without
a circumsphere, equal edge distances or segment-interior contacts. Inradius solves
an independent positive sphere tangent to every convex supporting facet. Generalized
sources have no inferred convex inradius. Failed fits display **not defined**.

Dihedrals are unsigned convex interior angles, `180° − angle(outward normals)`;
generalized branch angles are unavailable. Face angles are `180° − signed turn`
of the ordered intrinsic cycle, including reflex corners and 36° pentagram tips.
Zero/unresolved algebraic orientation has no assigned interior-angle branch.
Generalized areas are absolute algebraic cycle areas, explicitly labeled; signed
algebraic contents count multiplicity and are not ordinary union volumes.
Cell ordinary volumes require complete source-boundary agreement with a convex hull;
other generalized cell algebraic volumes use the existing coherent signed chain.

3D density reuses `generalized_density.density_info` at the vertex mean, with
positive algebraic-volume orientation per component: small stellated dodecahedron
3, great stellated dodecahedron 7. Generalized 4D density reuses the existing
`filled_sections` coherent cell-chain / two-independent-ray classifier, including
its integer residual and 5,000,000 signed-fan-visit bound. Its limits are 600 cells
and 2,000 faces; absent/open/nonorientable cells, ambiguous component orientation,
degenerate rays or a mean on a cell hyperplane return explicit unavailable status.
Grand hexacosichoron reports 191 at its center. Convex 4D multiplicity is one.
Genus is `(2 × components − (V − E + F))/2`, summed over closed orientable abstract
3D surface components. Edge ownership, coherent orientation and single-cycle vertex
links are checked; open/pinched/nonorientable boundaries have no genus claim.
Self-intersections do not change this abstract combinatorial topology.

Information report limits: 10,000 vertices and 20,000 boundary entities. Existing
type classification limits remain 256 vertices, 8,192 entities, 32,768 incidence
references and 20,000 candidate frames. Unavailable classification preserves model
measurements and reports the reason without merging unverified types. Reports use
the existing bounded four-entry complete-source analysis cache.

Viewport toolbar **Stereoscopic display** (`stereo-mode`) already offered parallel,
cross-eyed and red/cyan modes; W35 audits and retains the physical-eye swap. The
workspace shelf now contains collapsed **Stereo settings** (`stereo-settings`):
`stereo-eye-separation` defaults to 0.064, range [0,1]; `stereo-convergence` defaults
to 5, range [0.01,1000]. Both accept native numeric expressions together through
NumericEntry. Units are normalized display coordinates **after** 3D/4D projection;
convergence is the positive camera-forward zero-disparity distance. Zero separation
removes binocular depth. These are persisted/validated `view.stereoEyeSeparation`
and `view.stereoConvergence` fields, independent of source geometry. Pair rendering,
pair picking, red/cyan full-width eye targets and PNG captures use the same settings.
The red/cyan compositor retains the existing Dubois color matrices and Three.js
output color/tone mapping. Existing scaled/transparent anaglyph PNG refusal remains;
parallel/cross-eyed pairs support native/scaled/transparent PNG.

Tests: `tests/test_information_panel.py` covers cube, icosahedron, cuboctahedron,
tesseract, 600-cell, Johnson J3 without an insphere, noncospherical geometry, the
two star densities, generalized 4D density, concave angles/topology, covariance,
detached caching and saved stereo validation. `tests/information-panel.test.mjs`
covers mounted controls, real native report formatting, source/cancel/export fences,
CSV escaping and atomic numeric stereo edits. `tests/stereo-information.test.mjs`
covers eye order/picking, convergence/separation, anaglyph settings and pair PNG
settings. Both new Node files are in `test:features`. Electron/GPU click-through
and hardware stereo comfort remain for the lead; Electron was not launched here.

Verification: 60 passed with `python -m pytest tests/test_information_panel.py
tests/test_measurements.py tests/test_element_types.py tests/test_display_state.py
-q -p no:cacheprovider`; 148 passed across the two new Node files and existing
stereo, PNG, viewport numeric, viewer UX, element types, engine pool, renderer,
model report, native job, image capture and project workflow tests. Production
`npx.cmd vite build --configLoader native` passed (existing chunk-size warning).
