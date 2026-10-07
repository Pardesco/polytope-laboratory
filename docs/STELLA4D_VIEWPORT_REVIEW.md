# Stella4D viewport and interaction review

Reviewed October 4, 2026 against the local build specification, parity ledger,
0.10.0 UI/renderer source, development smoke evidence, and the official Stella
documentation. These findings
describe implemented subsets and remaining gaps; they are not a hands-on
conformance audit of a licensed Stella installation.

The official history identifies Stella 6.0, released August 11, 2026, as the
current published baseline. It includes clearer text, scalable toolbars,
selectable UI themes, and expanded catalog coverage.
[Official release history](https://www.software3d.com/History.php)

## Existing strengths

Polytope Laboratory already has all six 4D rotation planes: XY, XZ, XW, YZ,
YW and ZW. Automatic rotation was already present in 0.9.0. The 0.10.0 toolbar
makes it accessible for both 3D and 4D objects, with selected plane/rate controls
and stopping. Shift-drag rotates the 4D display in XW/YW while ordinary dragging
orbits the projected 3D observer. Saved animation sequences support plane selection,
duration, turns, section-depth tracks and reproducible PNG samples. Automatic
rotation and numeric plane angles are display transformations; source coordinates
and incidence remain unchanged.

Other implemented workflows include orbit cameras, 4D orthographic/perspective/
stereographic projection, linked derived views, intrinsic section alignment,
vertex picking with ambiguous-hit cycling, winding-defined star face filling,
source RGBA colors, transparency, cell hiding/isolation, intrinsic measurements,
convex face/cell nets, saved projects and provenance-aware library audit evidence.
The new workspace defaults to one large geometry view with optional Compare,
collapsible side panels and Appearance/Rotation/Animation/History disclosures.
Observer cameras now support true orthographic and perspective projection,
geometry fit, X/Y/Z/isometric orientations and saved zoom/frustum state. Matte
lit surfaces offer Solid/Translucent/Wireframe presets; Solid hides rear edges
with depth testing, while source RGBA alpha still retains transparency at global
opacity one. Points are hidden by default. These are bounded implementations,
not proof of complete Stella parity.

## October 4 follow-up

The 0.11.0 implementation adds selected vertex/edge/face/cell First/Last
orientations, verified convex-cell front/back visibility, source edge/face/cell
picking with candidate cycling, sphere/cylinder presentation and independent
cell shrink. Stereographic projection now maps radial spherical edges and faces
to curves and curved patches, with analytic smooth normals and explicit pole
clipping. Independent numerical references and actual viewport pixels pass;
source geometry stays unchanged. See [stereographic details](STEREOGRAPHIC_PROJECTION.md),
[picking](ENTITY_PICKING.md), [orientation](ENTITY_ORIENTATION.md),
[cell facing](CELL_FACING.md) and [presentation](ENTITY_PRESENTATION.md).

Instant-transition tours, memories and construction replay also have desktop
workflows. Rich tour transitions and explosion/fold sequence tracks still need
renderer adapters. Dense filled stereographic animation remains CPU limited.
The table below preserves the earlier prioritization; its orientation, picking
and sphere/cylinder entries now have these implemented subsets. Automatic
symmetry orientation, hover/occlusion qualification, adjustable 4D perspective,
camera bookmarks, six-view layouts and stereo remain open.

## Prioritized improvements

| Priority | Implemented 0.10.0 subset | Remaining improvement and official comparison |
| --- | --- | --- |
| 1. Geometry workspace | Large default single view, optional two-view Compare, collapsed advanced controls, hidden inspector and collapsible library. Fullscreen expands the application window. | Add independently maximized selected views and configurable saved layouts when needed. Stella supports one-to-six-view layouts, saved view types and fullscreen of the selected view. [Layouts](https://mail.software3d.com/Manual/Views.php?prod=Stella4DPro), [Fullscreen](https://software3d.com/Manual/FullScreen.php) |
| 2. Geometric orientation | Manual six-plane rotations, section alignment and canonical observer X/Y/Z/isometric directions exist. | Add selected cell/face/edge/vertex first/last orientations, automatic symmetry-oriented views, and front/back cell visibility. These expose useful structure without requiring slider experimentation. Canonical observer directions do not satisfy selected-entity 4D orientation. [4D menu](https://www.software3d.com/Manual/Menu4D.php) |
| 3. Precise camera navigation | True observer orthographic/perspective projection, fit, orbit/zoom and saved camera/frustum state are separate from the 4D projection. | Add adjustable 4D perspective strength, camera bookmarks and optional locked or synchronized cameras. [Navigation](https://software3d.com/Manual/Mouse.php?prod=Small) |
| 4. Direct mathematical selection | Base-view vertex picking and entity indices exist; cell-net surfaces have face picking. | Add ordinary base-view edge/face/cell picking, hover previews, selected IDs and measurement overlays. Offer hide/isolate from selection and type/color/orbit filters. [4D interaction](https://www.software3d.com/Manual/Proj4D.php), [Element visibility](https://mail.software3d.com/Manual/HideFaces.php) |
| 5. Intuitive 4D motion | Visible rotation toggle with selectable plane/rate, precise advanced angles and direct Shift-drag in XW/YW. | Add rotation around selected entities, tunnel gestures and optional inertia. Keep intrinsic 4D display rotation distinct from observer orbit and source-modifying operations. [4D projection](https://www.software3d.com/Manual/Proj4D.php) |
| 6. Scientific presentation | Matte lit Solid/Translucent/Wireframe presets, opaque rear-edge suppression, filled star faces, source RGBA, opacity and cell filtering. | Add richer selected-element emphasis, subgroup palettes and sphere/cylinder or stereo modes. Material themes, user lighting controls, portable images/bump maps and reflection/refraction remain separate gaps. [Official comparison](https://www.software3d.com/Compare.php) |

For the minimal professional UI, prioritize model identity, geometry, projection,
selection and motion. Place surface settings, six-plane controls, animation
editing and history in intentional disclosures or inspector panels. Keep
mathematical guarantees precise and available in Evidence. This recommendation
does not require copying Stella's toolbar arrangement.

## Material mathematical gaps beyond the UI

- Catalog reconciliation remains necessary: 3,064 linked paths and 3,050 importer
  passes do not prove coverage of Stella's named 2,191 uniform polychora or its
  broader 3D families. Build an entry-level crosswalk with independent
  classification. [Published catalog](https://www.software3d.com/Compare.php)
- Manual face-cycle faceting exists; automatic enumeration, faceting criteria
  and diagrams remain missing. [Automatic faceting](https://mail.software3d.com/Manual/AutoFacet.php?prod=Stella4DPro)
- Augmentation/excavation, expansion/runcination, rational-star product families,
  dual morph methods and cross-object tours remain separate construction and
  animation obligations. Existing rotation and section-depth tracks should not
  be described as complete coverage of these workflows.
  [Published tool comparison](https://www.software3d.com/Compare.php)
- Generalized section curves preserve source boundaries but do not reconstruct
  every star object's filled solid or filled 3-cell section. Surface evidence
  must remain distinct from supported solid-section semantics.

## Ledger discrepancy

The previous ledger marked `VIEW-04` as `unstarted`, although source cell hiding
and isolation were already implemented and tested under `VIS-02`. The 0.10.0
ledger now records that subset as `prototype`, while retaining front/back cell
classification and broader per-element/type visibility as gaps. `VIS-03` also
records its bounded lighting/preset subset. All 73 requirements remain release
blockers, and the installed competitor baseline audit remains incomplete.

## Verification approach for the viewport revision

`scripts/workspace-ui-smoke.cjs` exercises the actual Electron interface with an
isolated profile and native project saves. It checks usable geometry area at a
1484-by-900 content viewport, single/comparison layouts, collapsible panels,
accessible 3D/4D automatic rotation and stopping, preserved source incidence,
camera controls/fit, and saved state restoration. Screenshots and a small
machine-readable report support visual and behavioral review. Packaged runs
use a deliberately unavailable development Python executable for the app.

The 0.10.0 development build passed all seven grouped checks in 7.06 seconds,
with no renderer page errors. Its default geometry canvas measured 1,240 by
689 pixels inside the 1,484-by-900 content area (64% of the total area), with no
horizontal overflow. Native saved snapshots confirmed selected-plane spin,
stopping, Shift-drag rotation in XW/YW, unchanged source incidence and observer
camera during the 4D gesture, and camera/layout/style restoration. Independent
frustum checks contained every displayed cube vertex in both orthographic and
perspective cameras, and every projected tesseract vertex in the default
orthographic display. Evidence: `artifacts/workspace-ui-smoke.json`,
`artifacts/workspace-ui-cube.png`, and `artifacts/workspace-ui-tesseract.png`.

Eight additional GPU graphics checks passed in
`artifacts/viewport-redesign/graphics-desktop-smoke.json`: projected equal edges
retain equal pixel lengths under orthographic observation and differ with depth
under perspective; all canonical directions and orthographic zoom restore;
legacy camera fields remain supported; lit cube faces have distinct shading;
opaque rear edges disappear while translucent rear edges remain; and wireframe
retains source topology. `artifacts/viewport-redesign/library-audit-smoke.json`
also passed six audit checks, including an actual RGBA upload with alpha 128/255
and triangle draw calls using blending with depth writes disabled at global
opacity one. This verifies the source-alpha exception to opaque rendering.

This revision addresses the immediate layout, camera projection, fit,
axis/isometric orientation, adjustable automatic motion, and direct 4D dragging
recommendations. Entity-first/last and symmetry orientations, selectable-cell
ray picking, camera bookmarks/locks, adjustable 4D perspective strength,
inertia and broader material/display families remain separate gaps. The smoke
result verifies this interface subset rather than full Stella conformance.
