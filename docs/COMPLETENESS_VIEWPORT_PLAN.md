# VIEW / VIS / MEAS completeness plan

Audited October 4, 2026 against the source preparing release 0.10.0, the build
specification, the current parity ledger, and official Stella documentation.
This is a read-only implementation audit and a proposed engineering sequence.
It does not change production code, freeze the final competitor option domains,
or establish installed-application conformance. No Electron tests were run for
this audit. Earlier 0.10.0 evidence is cited as existing evidence only.

The immediate order is entity orientation, 4D cell visibility, direct source
selection and measurement overlays, then saved cameras and multiple views.
The later batches cover remaining presentation and measurement obligations;
finishing the immediate list alone will not satisfy all fifteen requirements.

## Requirement inventory and source evidence

All seven VIEW, four VIS, and four MEAS requirements remain release blockers.
The specification's completion standard requires the verified competitor
domains, independent expected results, shipped-interface scenarios, persistence,
and documentation. Existing prototypes and smoke tests establish subsets.

| ID | Implemented source subset | Remaining scenarios |
| --- | --- | --- |
| VIEW-01 | `ui/app.js` creates base and derived viewers; section, dual, extracted entity, vertex figure, nets and stellation diagrams have supported paths. Sections retain source references. | General base+dual/compound views; consistent selection, visibility and measurement propagation across all views; complete diagrams and source correspondence after promotion. Base entity selection currently highlights source vertices without automatically selecting the corresponding derived entity. |
| VIEW-02 | `ui/projection.js` rotates six planes and maps 4D coordinates; `ui/viewer.js` has orthographic/perspective observer cameras, fit, axes, saved zoom/frustum. | Adjustable 4D perspective and declared clipping/pole behavior; explicit CPU/GPU tolerance across domains; bookmarks and camera locks. Observer orthographic projection is separate from 4D-to-3D projection. |
| VIEW-03 | Axis/isometric observer directions exist. `engine/measurements.py:align_section` aligns an intrinsic slicing plane. | Vertex/edge/face/cell first and last **4D display orientations**, measured-item directions, automatic symmetry choice, persistent orientation intent. Section alignment and observer axis views do not satisfy this requirement. |
| VIEW-04 | `ui/cell-visibility.mjs` implements cell hide/isolate; shared faces survive while an owner is active; source incidence stays intact. | Front/back/grazing 4D cell classification; individual vertex/edge/face visibility; type/color/subgroup/neighborhood/compound filters; linked visibility policies. Opaque 3D depth testing is not 4D cell culling. |
| VIEW-05 | Source index selection for all available entity kinds; projected vertex hit cycling; cell-net ray selection returns face/cell owners. | Base-view edge, face and cell picking, hover identification, reliable dense/coincident hit ordering, virtual/source distinctions, reusable source selection events. Hidden point display does not currently disable vertex candidate selection. |
| VIEW-06 | Six-plane spin and Shift-drag XW/YW; intrinsic reflection; numerical metric symmetry, proper actions, stabilizers and generated subgroups; orbit vertex highlights. | View-dependent tumble/tunnel and inertia; visual axes/planes for verified symmetry actions; clear display-transform versus source-transform state; automatic symmetry orientations. |
| VIEW-07 | Single/Compare layouts and app-window fullscreen. | Configurable one-to-six views, independent active-view maximization, stereo variants and hardware qualification. |
| VIS-01 | Lit winding-filled surfaces, lines and screen-size points; Solid/Translucent/Wireframe; source face IDs and caps. | Vertex spheres, edge cylinders, meaningful radius/width units, ordinary base-view cell shrink, Geomag eligibility/rendering/print behavior. Cell-net-only shrink does not cover the base projected polychoron. |
| VIS-02 | Source RGBA, face/cell palettes, global opacity, vertex highlights, cell filters, star fill rules. | Element overrides and type/subgroup palettes, compound and front/back colors, selection-specific edge/face/cell emphasis, coplanar overlap rules and linked inheritance. A source face is currently drawn once even when owned by multiple cells; first-active-owner color is not an independently styled cell instance. |
| VIS-03 | Fixed matte Phong lighting and three presets, with alpha-aware opaque depth behavior. | Editable lights/materials/themes; portable images, bump/normal maps, environment reflection/refraction, applicable dimension restrictions and export behavior. |
| VIS-04 | Notes are document text, not formatted element annotations. | Text anchored to source faces/edges/vertices, formatting and layout; face imagery/text carried into physical nets and exports. |
| MEAS-01 | Source point/line/plane/hyperplane affine distances and witness points; bounded vertices/segments. | Click-driven item construction, model-center item, supported bounded polygon/cell distances, complete numerical/domain qualification and overlays. |
| MEAS-02 | Principal angles, convex interior dihedrals, lengths, algebraic face areas, convex content, common circumradii. | Explicit inradius/other verified radius definitions; generalized filled areas/content/density; supported signed angle branches; further competitor measurement scenarios. |
| MEAS-03 | Intrinsic scaling, observer zoom and net millimeter scaling are separate. | Persisted model unit metadata/conversion, reference-measurement scale workflow, export unit contracts and UI. |
| MEAS-04 | Bounded AST arithmetic, rational literals, pi/e/phi, radian trig, `deg`, roots and `chord`. | Official aliases, degree-trig functions, implicit multiplication/root syntax, polygon-ratio helpers, and consistent equation support in all applicable numeric fields. |

Relevant existing tests include `tests/test_measurements.py`,
`tests/cell-visibility.test.mjs`, `tests/view-camera.test.mjs`,
`tests/viewer-geometry.test.mjs`, `scripts/face-fill-test.mjs`, and
`scripts/face-fill-cap-test.mjs`. Existing actual-renderer evidence is
`artifacts/viewport-redesign/graphics-desktop-smoke.json` (eight grouped checks)
and `artifacts/viewport-redesign/star-desktop-smoke.json` (fifteen grouped checks).
These reports are not the missing competitor baseline evidence.

## Documented comparison and limits of attribution

The official 4D menu lists selected vertex/edge/face/cell and measured-item
first/last directions, automatic symmetry-oriented direction, and front/back
cell hiding. It describes front-cell removal as useful for a Schlegel view.
[4D menu](https://www.software3d.com/Manual/Menu4D.php)

The 4D projection documentation separately describes tumble/tunnel gestures,
rotating through an entity, adjustable perspective, inertia, and cell-surface
shrink with full-size source edges.
[4D projection](https://www.software3d.com/Manual/Proj4D.php)

General visibility includes individual entities and sets defined by type,
color, plane, neighborhood or compound, with corresponding dual visibility.
[Element visibility](https://www.software3d.com/Manual/HideFaces.php?prod=Small)
Measurement mode supports clicked points/lines/planes, extension/replacement of
items, a model-center item, and visible construction lines and values.
[Measurement mode](https://www.software3d.com/Manual/MeasureMode.php?prod=Great)

Layouts can contain one to six independently chosen view types and persist
with the document. Active-view fullscreen and red/blue, red/green, red/cyan and
both side-by-side stereo orders are documented.
[Layouts](https://www.software3d.com/Manual/Views.php?prod=Small),
[Fullscreen and stereo](https://software3d.com/Manual/FullScreen.php)

Point/line and sphere/cylinder presentations are distinct options.
Geomag includes physical eligibility diagnostics and kit-dependent polygon
subdivision; it is more than a rods-and-balls appearance.
[Vertex/edge display](https://www.software3d.com/Manual/Visuals.php?prod=Small),
[Geomag](https://software3d.com/Manual/Geomag.php?prod=Small)
Color policies include face type, chiral/coplanar grouping and compound
components. Rich material editing is documented as unavailable in 4D.
[Colors](https://www.software3d.com/Manual/Colors.php),
[Materials](https://www.software3d.com/Manual/Materials.php?prod=Stella4DPro)
Element text and its appearance in printed nets are shown by the publisher.
[Official screenshots](https://www.software3d.com/ScreenShots.php)

The official equation entry accepts golden-ratio aliases `tau`/`g`,
`sind`/`cosd`/`tand`, implicit multiplication, root shorthand, and `faceRad`,
`faceAngle`, `diag` whose `n/d` argument denotes a polygon rather than arithmetic
division. None of these alternatives is implemented by the current AST parser.
[Equations](https://mail.software3d.com/Manual/Equations.php)

Some retrieved pages identify Small/Great Stella, rather than the Pro edition.
They establish publisher-documented common behavior; they do not independently
prove every Pro option or 4D extension. Exact gestures, defaults, available
domains, saved fields and option interactions need installed 6.0 verification.
Camera bookmarks are a proposed research-workspace improvement, not a claim
that Stella's model memory slots are camera bookmarks.

## Ordered implementation batches

The mathematics below is our proposed implementation contract. The manual does
not specify these algorithms or resolve their conventions.

### 1. Entity-first/last display frames — VIEW-03, VIEW-02, VIEW-06

Add pure `ui/entity-orientation.mjs` and an engine-owned entity-frame adapter.
Reuse validated entity affine spans, but do not substitute `align_section` for
display orientation. For a convex 4D cell use its outward supporting normal.
For a lower-dimensional entity use the source vertex-mean-to-entity direction
projected onto the orthogonal complement of its affine span. A zero radial
projection is ambiguous and requires an explicit direction or a documented
fallback; it must not silently imply a unique geometric answer.

Map the selected direction to positive W for First and negative W for Last
with an SO(4) matrix. Complete the frame deterministically while keeping the
unconstrained orientation close to the current pose. Persist the entity ID,
direction policy, reference frame and source fingerprint. The selected entity
must survive save/reload and reorientation. A face/cell's affine span must have
no W component after alignment. Resolve the remaining roll with a canonical
or user-selected frame, and document its effect on the 3D observer view.

Introduce a versioned display matrix as primary orientation state; retain the
six sliders through a tested ordered-Givens conversion rather than accumulating
unbounded, inconsistent Euler representations. Continue to rotate display
coordinates around the same source center without editing source geometry.
Automatic orientation should compare verified stabilizers under a stated
criterion, with deterministic ties; do not claim the competitor's exact
greatest-symmetry algorithm before observing it.

Owners: math owner for entity frames/normal conventions; renderer owner for the
pure matrix module; UI coordinator for `ui/viewport-controls.mjs`, `ui/app.js`
and numeric-plane state. Proposed fixture `ORI-01`: literal tesseract
coordinates `(±1,±1,±1,±1)`, selected W=+1 cell; First sends its normal to +W,
Last to -W, eight selected vertices share one W coordinate. `ORI-02`: literal
simplex, translated/asymmetrically rotated blocks, every entity rank, centered
ambiguous plane and explicit direction. Independently verify `RᵀR=I`, det=+1,
all pair distances, affine-rank preservation, gauge continuity and persistence.

### 2. 4D observer and cell culling — VIEW-04, VIEW-02

Add `ui/cell-culling.mjs` with source-cell outward normals computed from their
complete source incidence, checking that every cell is a supporting hyperplane
of a declared convex 4-polytope. Cache by source fingerprint. Rotating a normal
uses the same SO(4) matrix as the vertices. Orthographic classification uses
the normal's W component. Perspective classification uses `n · (eye - c)` in
the same normalized rotated 4D frame, where `c` is a point on the cell.
Positive/negative values are front/back; a scale-aware band is explicitly
grazing. Orbiting the 3D observer must not change 4D classification.

Compose orientation culling with manual hidden/isolated sets, using a stated
precedence. Preserve shared faces when any surviving owner remains active.
Generalized cells lacking verified outward normals remain unclassified with a
clear option diagnostic; extending this domain is a separate obligation after
the actual competitor behavior is recorded. Do not infer normals from 3D
triangle winding after projection.

Make the 4D eye distance/field of view explicit in `ui/projection.js`. Qualify
near-plane/pole clipping of partial source edges and virtual surface triangles;
currently a clipped endpoint suppresses the whole edge. Report discarded
geometry and preserve source references for display-only intersection points.

Owners: math owner for normal adapter; renderer owner for culling/projection;
UI coordinator for visibility controls/state. `CUL-01`: unrotated tesseract
viewed along +W has one front cell, one back cell and six grazing cells under
orthographic projection. With perspective eye W=3, one front and seven back
cells are expected. `CUL-02`: translated block, generic SO(4) rotation,
eye crossing a supporting plane, grazing sweep, shared face owners, manual
isolation and generalized unsupported cell. Independently check halfspace signs
and normal covariance; invariants and saved incidence remain unchanged.

### 3. Source selection and element visibility — VIEW-05, VIEW-04, VIS-02

Add `ui/source-picking.mjs`, `ui/selection-state.mjs`, and generalized element
visibility composition. A selection event should return `{kind,index}` and
source/derived references, not only a projected vertex index. Vertex and edge
hit tolerances use CSS pixels; segment distance works after near-plane clipping.
Triangle ray hits map through `triangle.face` to the source cycle. Cell hits
map to all active owning cells, deduplicating repeated triangulation hits.
If cells become independent shrunk instances, carry both source face and cell
IDs on each instance. Choosing a cell means choosing source boundary incidence,
not asserting a solid interpretation for a generalized cell.

Expose select kind, front-visible versus through-selection policy, hover IDs,
and explicit hit cycling. Stable ordering uses pixel distance/depth/source ID;
invalidate a cycle when the camera, source or visibility changes. Virtual star
crossings must not become source vertices. Use a screen-space index/BVH and
bounded asynchronous construction for dense models with reported limits.

Add per-kind hide/show/invert/isolate, adjacent-entity and type/color/orbit
filters, keeping all source arrays immutable. Specify whether hidden faces
also hide orphan edges/vertices. Preserve loose source edges deliberately rather
than accidentally deleting them through face-only visibility reconstruction.

Owner: renderer/interaction owner for the pure modules and `ui/viewer.js`;
UI coordinator for event wiring and inspector/context actions. `PICK-01`:
parallel depth-separated edges with a known midpoint hit, overlapping faces
and coincident vertices, unique expected IDs and deterministic cycling.
`PICK-02`: pentagram center triangle hits map to one source face; the even/odd
center hole has no face hit; virtual crossings do not yield vertex hits.
`PICK-03`: shared tesseract face has two candidate cell owners, reduced by
culling/isolation; late face IDs beyond the full-view fill cap remain pickable
after isolation. Include disconnected loose edges, nonmanifold owner counts,
viewport resize/DPI, solid occlusion and translucent through-selection.

### 4. Linked highlights and measurement constructions — VIEW-01, MEAS-01/02

Add `ui/measurement-overlay.mjs` and source-reference propagation. Separate
durable source selection from per-view highlight geometry. Edge selections
highlight a segment, faces their winding-defined surface/boundary, and cells
their complete boundaries. Source/dual mapping and derived section references
must be explicit; do not assume derived index equality. Section vertices can
have multiple source-edge references, which should be inspectable or cycled.

Store measurement descriptors and computed results with source fingerprint and
algorithm version. Render the intrinsic witness segment through the current
display transform, label its intrinsic value and units, and handle clipped
witnesses. An angle arc in the projected image must not masquerade as an
intrinsic 4D principal angle. Show both principal-angle values when applicable.
Support point/edge/face clicks, extending and replacing items, three-point
angles, and an explicitly defined model-center item; keep typed IDs available.

Owners: measurement owner for descriptors and kernel API; renderer owner for
overlay projection; UI coordinator for linkage and inspector tools.
`OVR-01`: skew segments distance 2 with independently specified witness points;
vary every display rotation/projection/camera and retain the value. `OVR-02`:
4D planes with principal angles 25°/60°, selected source edges reflected in a
section and corresponding dual incidence, center item with no source vertex,
stale-result rejection after geometry change, reload and derived promotion.

### 5. Bookmarks, camera locks and configurable views — VIEW-01/02/07

Add `ui/view-layout.mjs` and `ui/camera-bookmarks.mjs`. Replace the fixed base/
derived pair with one to six stable view records containing source binding,
view type, observer camera, 4D display frame, projection parameters, visibility
and optional linked-selection policy. Cache expensive derived calculations by
source/parameters and share immutable source buffers where appropriate.

Persist named bookmarks as camera/display states, not copied model memories.
Provide active-view focus/maximize and observer-only or frame-link controls.
Camera locks suppress user orbit/pan/zoom while respecting explicit restore and
export operations. Restore older position/target cameras, single/Compare
layouts and existing projects through versioned migration. A minimized or
destroyed view must dispose controls, observers, listeners and GPU resources.

Owners: UI coordinator for layout/app integration; document owner for migration;
renderer owner for lifecycle and lock API. `LAY-01`: six mixed model/section/
dual/net views, independent camera A/B, linked source selection, maximized
active view restored to prior layout. `LAY-02`: bookmark clone/rename/delete,
native reload and legacy fixture, locked controls, aspect changes, stale async
derived result and source switch. Independent resource counts must return to
baseline after repeatedly adding/removing views.

### 6. Display instances, palettes and geometric primitives — VIS-01/02

Add `ui/cell-surface-instances.mjs` and `ui/element-style.mjs`. Base-view cell
shrink uses one display instance per source cell, source cell centroids and
independently styled owned faces; source edges retain full coordinates.
Preserve source face/cell IDs and winding rules. Caps count generated instances,
not only unique source faces, and omitted elements remain explicitly reported.

Add instanced spheres/cylinders with declared source/display/screen sizing;
qualify how 4D perspective scales their radii. Support overrides, validated
type and verified subgroup palettes, compound grouping and front/back colors.
Define coplanar blending versus overlay priority. Ordinary transparent-mesh
drawing order is not proof of correct intersecting/coplanar overlap semantics.
Implement Geomag only after its kit sizes, eligibility and subdivision baseline
are recorded; reuse a separate display mesh without changing mathematical IDs.

Owners: renderer owner for instances/primitives; classification owner for types/
orbits; printing owner for Geomag output. `VIS-PRIM-01`: translated/scaled cube,
two adjacent tesseract cells and isolated late cell; every source edge length
and incidence remains unchanged across shrink/radius/style. `VIS-COLOR-01`:
known subgroup partition, chiral face pair, coplanar differently colored faces,
source RGBA alpha zero/partial/one, overlapping cells and saved overrides.

### 7. Rich 3D materials, annotations and printable assets — VIS-03/04

Add `ui/material-state.mjs`, `ui/element-annotations.mjs`, and a document-owned
portable asset manifest. Implement editable lights, front/back materials,
specular/emissive properties, opacity, themes and 3D images/normal maps and
environment maps. Audit texture placement/repeat/clamp and reflection/refraction
options against the installed baseline before freezing their domains.

Anchor formatted text to source IDs with explicit face-plane coordinates and
layout. Preserve text/images through split nets, rotations, tabs, SVG/PDF and
physical scaling. The same content/style and asset reference must serve the
viewport and printable net. Dimensional restrictions are visible and enforced.
Do not enable unrestricted 4D texture/material options merely because Three.js
can shade the resulting projected triangles.

Owners: renderer/material owner; document/asset owner; printing owner; UI
coordinator integrates editors. `ASSET-01`: independent checkerboard/color
patch, labeled cube face and numbered edge/vertex, user light rotation, texture
seam and missing asset; export/reload after moving the project. `ASSET-02`:
reflected/rotated net piece with measured millimeter label placement, normal
map with known tangent direction, environment cube faces with known colors,
and documented 4D restrictions.

### 8. Stereo and extended navigation — VIEW-06/07

Add a stereo rendering/capture adapter with explicit eye order, separation,
convergence and anaglyph mixing; include active-view fullscreen without app
chrome. Add bounded inertia, observer-aware 4D tumble/tunnel and selected-entity
rotation as distinct modes, respecting camera locks and animation export.

Owner: renderer/navigation owner; platform QA owns hardware/DPI qualification.
`STEREO-01`: known near/far points and zero-parallax convergence plane,
reversed eye order, anaglyph channel masks, asymmetric view aspect and image
capture. `MOTION-01`: deterministic gesture timestamps, expected SO(4) path,
stop/Escape/lock behavior and source preservation. Hardware perceptual checks
and the verified supported stereo modes remain separate release evidence.

### 9. Measurement domains, units and equation compatibility — MEAS-01–04

Add bounded convex face/cell distance with closest witnesses and a precise
definition; arbitrary nonconvex boundaries need an explicit filled domain.
Expand radius, signed-angle and density conventions only from documented and
observed mathematical definitions. Winding-filled face area must name its rule;
the current algebraic cycle area must remain independently available. No source
surface-section or generalized cell is assigned a solid volume by its picture.

Add versioned unit metadata/conversions and separate model rescaling from unit
display conversion, observer zoom, net scale and export units. Scaling a chosen
measurement to a physical target should have a reproducible operation record.

Replace tokenization before the bounded AST with a safe explicit equation
grammar. Parse polygon arguments as integer pairs before arithmetic evaluation;
`faceRad(5/2)` must not turn into a regular 2.5-gon. Include aliases, degree trig,
implicit multiplication, root shorthand and regular/star polygon helpers with
bounded resources and clear retrograde/degenerate conventions. Use this parser
in every supported real-valued field; integer IDs/rational-star symbols retain
their own grammars.

Owners: measurement/kernel owner (`engine/measurements.py`,
`engine/expressions.py`); units/document owner; UI coordinator
(`ui/measurement-controls.js`). `MEAS-BOUND-01`: disjoint rectangles whose
supporting planes intersect but finite regions have nonzero distance, segment
endpoint minimizers, intersecting cells and affine transforms at extreme
scales. `UNIT-01`: scale by 2 multiplies lengths/areas/volumes/4D content by
2/4/8/16; changing observer zoom never changes these values; independent SVG/
PDF dimensions and exported coordinates confirm unit policy. `EXPR-01`:
`tau=g=phi`, `cosd(60)=1/2`, `(2-1)(3+1)=4`, `1+3r2=1+3√2`,
`faceRad(4)=1/√2`, `faceAngle(3)=60`, `diag(4)=√2`, and star formulas derived
from an independent unit-edge pentagram. Include injection attempts,
resource exhaustion, malformed ratios and unsupported polygon diagnostics.

## Ownership and safe parallel execution

Math orientation/normal adapters and safe expression grammar can be developed
in parallel in new modules. Renderer picking and culling can proceed in
separate pure modules once their descriptor contracts are agreed. Only one
integration owner edits `ui/viewer.js`; only the UI coordinator edits
`ui/app.js`, `ui/index.html`, shared styles and `ui/viewport-controls.mjs`.
Engine dispatch and native document migrations similarly need one owner.
Printing/asset integration follows the agreed annotation and unit contracts.
Tests/fixtures should be owned separately from the implementation they certify.

Preserve the current 0.10.0 package/regression freeze. Integrate each batch in an
isolated branch/worktree or after the release freeze ends. Each batch needs
independent analytic tests plus real shipped-interface scenarios, save/reload,
selection and source-incidence checks; passing a helper-only unit test cannot
close its requirement. Record caps, unsupported domains and hardware in the
scenario evidence rather than reducing the full spec silently.

## Missing external baseline evidence

Capture a licensed installed Stella4D/Pro 6.0 version/platform record and freeze
an option-by-option scenario inventory. Record source files/hashes, IDs,
settings, expected numeric values/visibility sets, native save fields,
screenshots and reproducible interaction steps. This audit has no such run.

Prioritize First/Last roll and center policies for every entity rank;
automatic symmetry tie behavior; generalized/compound cell culling and grazing
defaults; front/through selection with coincident objects; type/color/orbit
visibility semantics and dual correspondence; measurement-center, signed angle,
radius/content definitions; exact star-helper/retrograde grammar. Then record
all view layouts/stereo modes, dimensional material restrictions, alpha/
coplanar blend policies, primitive sizing, physical kit eligibility, formatted
text layout and printable asset transformations.

The baseline must determine the supported domains, not a convenient selection
of models our implementation already handles. For every unsupported behavior
within that verified domain, retain its release blocker and an executable
expected-result fixture. Keep camera-bookmark enhancements distinct from
baseline workflows and do not reinterpret them as evidence of model memories.

After each batch, map the scenario IDs to `docs/parity-ledger.json` through its
generator, attach the relevant specific tests (including measurement tests
currently missing from their broad fixture lists), and update status only when
the required domains and shipped-interface evidence justify it. This plan
changes no ledger status or release blocker.
