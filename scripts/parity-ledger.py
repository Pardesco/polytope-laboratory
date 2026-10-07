"""Preserve the authoritative ledger against the untouched 73-row specification.

Existing evidence/metadata win over historical bootstrap defaults. Development
overlays can describe bounded progress but cannot close requirement-wide gates.
Only apply-parity-gate.py may publish a newly verified closed gate.
"""
from pathlib import Path
from copy import deepcopy
import argparse
import hashlib
import importlib.util
import math
import os
import re
import json
import tempfile

root=Path(__file__).resolve().parents[1]
SPEC='STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md'
SPEC_SHA256='7dafec36e99c7c883a7222f753f67f1c0818638359419a17f7ecbdf8b875df8d'
partial={
 'LIB-05':'Recursive external OFF catalog browsing with persistent links, distinct path/topology records, categories, header indexing and load-time incidence validation. The user-supplied Drive tree has 3,064 paths across 57 public folders; resumable per-file importer audits retain timeouts, checkpoints and source hashes. Compact attached evidence supports passed/rejected/untested/stale badges, diagnostics and source/importer/dependency provenance invalidation. A historical all-file report is available; freshness is checked separately from acquisition and mathematical classification. Entry-level 2,191-baseline crosswalk and independent classification remain pending.',
 'LIB-01':'Five Platonic, all thirteen Archimedean/Catalan types with separate chiral mirrors, and all four Kepler-Poinsot stars. Independent metrics, winding/genus, reciprocal recovery and source incidence checks pass. Remaining uniform catalog and full benchmark manifest conformance pending.',
 'LIB-04':'Six independently generated regular convex polychora; all sixteen source-labeled Miratope regular4D OFF files pass current incidence import, including ten generalized nonconvex boundaries. Independent nonconvex regular construction/classification and full operation-domain conformance remain pending.',
 'LIB-07':'Convex polygons, prisms, antiprisms, duoprisms; star rational parameters and antiduoprisms pending.',
 'LIB-08':'Search generated/recursive linked records by name, key, family, symbol, counts, aliases, source folder and Coxeter mask; dimension, family/category and importer-evidence status filters. Rejected files expose diagnostics before optional importer retry or validated edge-count copy repair; unsupported formats remain indexed. Complete benchmark crosswalk and geometry-property filters pending.',
 'VIEW-01':'Default single geometry viewport with optional Compare layout for linked section, dual, cell/face, vertex figure and convex face/cell net views. Generalized sources expose winding-filled faces and explicitly named source-surface intersections; promoted curves retain a source evidence view. Broader diagram/compound linkage and complete selection propagation pending.',
 'VIEW-02':'Six-plane 4D rotations and orthographic/perspective/stereographic intrinsic displays are separate from true orthographic/perspective 3D observer cameras. Orbit/zoom, geometry fit, canonical X/Y/Z/isometric directions, orthographic scale and saved camera restoration preserve source geometry. Independent projected-edge pixels confirm equal-depth invariance in orthographic mode and depth-dependent perspective scaling; saved source/camera frustum checks pass. Adjustable 4D perspective strength, camera bookmarks/locks and general GPU/CPU tolerance qualification remain pending.',
 'VIEW-04':'Persistent source cell hiding/isolation retains all source topology and measurements. Shared faces remain visible while any owning cell is visible; isolating late cells recovers face filling after a dense full-view triangle cap. This previously implemented subset is also recorded under VIS-02. Front/back classification, general per-vertex/edge/face hide/show and broader linked-view visibility policies remain pending.',
 'VIEW-05':'Index selection and projected vertex picking with ambiguity cycling; selections persist per source snapshot, clear on geometry changes and reject unavailable entity kinds. Dense edge/face picking pending.',
 'VIEW-06':'All six numeric rotation planes; visible 3D/4D automatic display rotation with selected plane/rate and stopping, plus direct Shift-drag in XW/YW separated from orbiting the 3D observer. Native snapshots verify unchanged source geometry and observer camera for 4D dragging. Intrinsic coordinate reflection and exhaustive numerical full-dimensional 2D/3D/4D orthogonal actions preserve full ordered incidence and verified generator closure. Proper rotations, entity stabilizers and generated subgroups exposed; signed-axis comparison separate. General combinatorial symmetry, inertia/tunnel motion and full benchmark domains pending.',
 'VIEW-07':'Default single geometry viewport and optional two-view Compare layout with collapsible library/inspector and saved layout; native application fullscreen remains available. Stereo modes, configurable one-to-six-view layouts and independently maximized selected views remain pending.',
 'INFO-01':'Calculated counts, polygon types, valences, centroid and provenance. Components/type classifications pending.',
 'INFO-02':'Authoritative intrinsic entity distances/content/common circumradii/principal angles, convex content/boundary measures and convex interior dihedrals. Undefined/noncospherical/generalized results explicitly unavailable. Full generalized density and benchmark measurement domains pending.',
 'INFO-03':'Notes plus model metadata and source records persist. Rich metadata editor pending.',
 'MEAS-01':'Intrinsic supporting affine-flat distance with closest points, principal angles and finite vertex/edge-segment distance; independent 4D analytic fixtures. Bounded face/cell distance and full benchmark domains pending.',
 'MEAS-02':'Intrinsic entity lengths/areas/volumes/common circumradii, unoriented principal angles and convex interior dihedrals; cached measures recomputed from source. Units, generalized content/density and full domain qualification pending.',
 'MEAS-03':'Intrinsic scale is independent of camera zoom; nets use reference-edge mm. Full unit conversion UI pending.',
 'MEAS-04':'Bounded AST parser with rational exact arithmetic, constants, trig, roots, chord helper; benchmark helper audit pending.',
 'CON-01':'Blocks, convex regular pyramids/prisms/antiprisms, point-cloud tetrahedra. Remaining specialized options pending.',
 'CON-02':'Integer squared-radius origin-centered FCC Waterman hull. Other specialized generators pending.',
 'CON-03':'Convex hull in 2/3/4D with explicit degeneracy failure and merged true incidence; exact exhaustive rational support certification for up to 32 supplied points. Interval/algebraic domains and convex core pending.',
 'CON-04':'Convex 2/3/4D polar dual and bounded exact rational polar workflow; separate 3D ordered-incidence reciprocity with UI center/radius, cyclic link checks and singularity diagnostics. Regular stars pass double-dual cycles/metric recovery. Generalized 4D, coincident planes and full domain conformance pending.',
 'CON-05':'Directed-edge hull truncation/rectification in convex domains; finite Coxeter Wythoff construction. Other operations pending.',
 'CON-06':'Intrinsic reflection; compounds and blending pending.',
 'CON-11':'3D-base extrusion to 4D and convex polygon products. Nonconvex/step/antiduoprism families pending.',
 'SEC-01':'Convex 3D-to-2D and 4D-to-3D reconstructed solid boundaries; declared convex-region-union sections retain disconnected and degenerate strata. Generalized sources additionally retain winding-defined source-face intersection curves and coplanar faces, without claiming reconstructed solid or filled source-cell sections. Complete generalized solid boundaries and benchmark-wide topology transition qualification remain pending.',
 'SEC-02':'Arbitrary normalized normal, offset, selected-entity intrinsic alignment, vertex-event stepping and explicit full/empty/degenerate outcomes. Supported generalized surface intersections retain tangencies, coplanar cycles and disconnected intervals with source references. Exact predicates and complete benchmark topology-change domains remain pending.',
 'SEC-03':'Debounced section slider and saved intrinsic section-depth keyframes use the same kernel with source references. Time-based playback awaits current calculations; PNG sequences await each exact requested sample, while slow playback may skip intermediate times. Complete benchmark animation interaction and topology-transition domains remain pending.',
 'SEC-04':'Promote derived sections/figures/cells/duals to independent documents with recorded provenance. Promoted generalized surfaces retain source references, explicit surface-section interpretation, winding rule and supported face/evidence defaults through native persistence. Full editable generalized solid-section conformance remains pending.',
 'SEC-05':'Supported generalized/star 3D and 4D source-face intersections use explicit nonzero or even/odd face winding, retain disconnected intervals, coplanar ordered cycles and boundary tangencies, and never substitute a convex hull. Named Kepler-Poinsot and independent pentagram/concave/4D fixtures pass. Results are source-surface curves/coplanar faces, not inferred filled solid or filled 3-cell sections; repeated projected IDs and resource limits are diagnosed. Complete benchmark-supported solid/density semantics and unrestricted star domains remain pending.',
 'VF-01':'Convex local slicing realizations, isolated using centroid direction; broader admissibility and combinatorial VF pending.',
 'STEL-01':'Numerical 3D facial/arbitrary plane arrangements within a recorded observation box; unboxed LP boundedness, clipping flags and volume conservation. Exact predicates/unrestricted completeness pending.',
 'STEL-02':'Enclosed region checkboxes and incident-region facial diagrams with SVG export and retained solid pieces. Attached/dependency diagrams and inaccessible-cell benchmark semantics pending.',
 'STEL-03':'Finite orbit-subset search under explicit seed-inclusion/full-facet-connectivity criteria, stepping through candidates and precise exhaustion/result-limit records. Benchmark criteria parity pending.',
 'STEL-04':'Verified geometric and signed-axis source actions constrain selected region orbits; domain-preserving subgroup and closure reported. Arbitrary subgroup/reflexibility controls pending.',
 'STEL-05':'Unbounded/clipped/unresolved regions diagnosed and excluded from ordinary solid selection; promotion retains convex pieces and nonconvex section semantics. Inaccessible-cell competitor conformance pending.',
 'FAC-01':'Manual coplanar ordered face cycles preserve original vertices and generalized interpretation; repeated-vertex semantics pending.',
 'NET-01':'Editable convex-3D hinge forests with source identity, connected-piece dragging/rotation, compact layout history and face overlap reporting. Generalized/nonconvex and full benchmark domains pending.',
 'NET-02':'Cut/join editing with acyclic forest contract; matching source IDs, perpendicular trapezoid tabs, face/tab overlap diagnostics and SVG physical scale. Advanced coincident-edge/tab/color policies pending.',
 'NET-03':'Physical-mm SVG/PDF reference-edge scale; intact-piece standard/custom paper packing, multipage preview/export, preserved global tabs/labels and independent vector measurements. Optimal packing and hardware printer calibration pending.',
 'NET-04':'Rigid signed-dihedral folding plus component root-pose interpolation; independently checked lengths/hinges/source endpoints and renderer/kernel agreement. Collisions, generalized domains and benchmark interaction details pending.',
 'NET-06':'Convex whole-cell 4D forest arrangements preserve complete intersecting cells; cut/join/reattachment, rigid SE(3) placements, matching faces/vertices, display-only shrink, layout history and persistence. All six convex regular references tested. Generalized domains/aesthetic layout and full benchmark controls pending.',
 'ANIM-01':'Saved 3D/4D numeric rotation and intrinsic section-depth keyframes, duration/fps/loop settings, scrubbing and cancellable time-based playback; reversible rigid-net folding also remains available. PNG captures evaluate exact frame times and include both endpoints. Streamed WebM waits for encoder startup and a written first chunk before advancing its first pose; a separate capture canvas supports scrolled-offscreen viewports. Video remains real time, so startup can briefly hold the first pose and costly section evaluation can extend duration. Explosion, camera/projection/material tracks and complete benchmark animation domains remain pending.',
 'ANIM-03':'Single-model ordered pose keyframes persist, interpolate numeric rotation angles and section depth, resize with duration, and export reproducible PNG state samples. This supplies a bounded sequence editor; cross-object transitions and polyhedral tours are not implemented, and benchmark-wide deterministic playback/export conformance remains pending.',
 'VIS-01':'GPU source lines/points and matte lit surfaces with Solid/Translucent/Wireframe presets, default points hidden, and opaque solid depth hiding rear edges. Planar concave and star-cycle faces retain explicit nonzero/even-odd winding rules. Virtual crossing points and per-cell face filtering change display buffers only; source coordinates/incidence stay intact. Per-face/model caps and unsupported planarity are diagnosed. Vertex spheres, edge cylinders, Geomag and benchmark-wide presentation parity remain pending.',
 'VIS-02':'Persistent source vertex highlighting, opacity, surface/point visibility, face/cell palettes and OFF RGB/RGBA source colors. Actual source alpha below one retains GPU blending and disables opaque depth writes even at global opacity one. Cell isolation/hiding retains source IDs, shared faces remain while any owner is visible, and isolated late faces recover after a dense full view reaches its triangle cap. General type/subgroup palettes, rich overlap policies and complete linked-view benchmark rules remain pending.',
 'VIS-03':'Matte Phong surface lighting with hemisphere, directional and ambient lights plus Solid/Translucent/Wireframe presentation presets. Independent pixel samples verify distinct cube face shading and opaque rear-edge occlusion; source-alpha transparency remains separate from global opacity. Portable material assets, user-editable lighting/material themes, image/bump maps, reflection/refraction and full benchmark dimension restrictions remain pending.',
 'DOC-01':'Multiple documents, snapshot histories, undo/redo, native save/load and promotion. Fill rule, opacity, source cell visibility, presentation/layout, observer camera projection/pose/zoom/frustum, automatic rotation plane/rate and saved pose keyframes persist independently of geometry; the automatic playing flag is ephemeral. Legacy camera position/target restore without new optional fields. Generalized surface sections retain explicit non-solid interpretation and references after promotion/reload; broad operation and benchmark round trips remain pending.',
 'DOC-03':'Versioned projects, validated atomic save, prior-file backup, 30s recovery snapshots. Migrations/replay pending.',
 'IO-01':'Strict OFF/4OFF retains source coordinates, ordered cycles/cells and numeric interpretation. RGB/RGBA suffixes on faces and cells roundtrip with explicit byte/unit encodings and do not replace incidence; invalid suffixes are rejected. Edge-count correction changes only a separately saved copy after complete incidence revalidation. Affine-dimension errors report the actual source cell rank instead of inventing geometry repairs. Persistent read-only catalog links and provenance-aware importer evidence retain distinct source paths. DXF import, vertex colors, repeated-ID boundary semantics and full benchmark interchange remain pending.',
 'IO-02':'OFF/JSON, 2D/3D OBJ/VRML/DXF edge lines, convex3D STL/POV-Ray. Complete interchange/units parity pending.',
 'IO-03':'PNG still capture plus bounded numbered PNG sequences with an exact sample-time manifest and endpoint inclusion; captures support base geometry or awaited sections. Streamed WebM uses an available browser encoder, explicit startup/first-chunk waiting, ordered final-chunk draining, separate capture-canvas pixels, transactional publication and cancellation cleanup. Native signature validation accepts headers split across chunks without publishing incomplete output. Real-time video duration can grow with encoder startup or expensive evaluations. Transparent output, baseline video format coverage and benchmark-wide frame/material settings remain pending.',
 'IO-04':'Custom and standard-paper multipage vector PDF, page settings/preview and native printing at explicit reference-edge mm scale. Digital PDF vectors/labels independently measured; hardware calibration and full measurement exports pending.',
 'DESK-01':'Native menus/dialogs, shortcuts, high-DPI rendering and embedded guide. Minimal viewport-first workspace defaults to single view and hidden inspector; library/inspector toggles, Compare layout, visible motion/camera controls and collapsed Appearance/Rotation/Animation/History disclosures retain access to mathematical tools. A 1484-by-900 content-area smoke verifies substantial geometry area and no horizontal overflow. Full context help, broader hardware/layout qualification and desktop workflow conformance remain pending.',
 'DESK-02':'Standalone Windows portable build and packaged smoke pass without development Python. Clean-machine/offline and signed installer/update qualification pending.'
}
# Verified development subsets added after the frozen 0.10.0 release.
partial.update({
 'LIB-01':'Independent 45-record construction catalog plus attributed Antiprism U1-U75 supplied realizations, complete ordered source geometry/colors/hashes and independent regular-face/equal-edge checks. Exhausted numerical symmetry/chirality for selected sources. Full uniform classification, variants and installed benchmark conformance remain open.',
 'LIB-02':'Attributed Antiprism J1-J92 supplied realizations; all strict imports, independently checked regular polygon faces/equal edges/manifold incidence, source hash/color preservation and actual J92 desktop loading pass. Complete installed-baseline option and operation qualification remains open.',
 'LIB-04':'Six independently generated regular convex polychora plus ten attributed Miratope source-labeled regular stars available in the built-in catalog. All sixteen source files copied unchanged with license/hash/line-ending provenance; independent necessary metric/incidence checks pass, selected star has exhausted numerical 14400-action symmetry with closure and single rank orbits. Exact regularity/classification and full operation conformance remain open.',
 'VIEW-03':'Native SO(4) First/Last frames for source vertex/edge/face/cell and measured affine items; deterministic radial/span conventions, ambiguity diagnostics, one-time renderer application and saved-frame validation. Actual selected-cell/vertex persistence checks pass. Automatic greatest-symmetry choice and full competitor orientation domains remain open.',
 'VIEW-04':'Source cell hiding/isolation plus verified convex4D source support planes and per-frame front/back/grazing classification under intrinsic projection. Actual orthographic/perspective/First-Last/auto-spin/manual-filter/reopen checks pass without repeated native plane jobs. Generalized-cell oriented surfaces, per-element/type/subgroup filters and linked visibility remain open.',
 'MEAS-03':'Saved explicit coordinate-unit declarations, native reference-edge scaling with replay and intrinsic Base/Derived export conversion between mm/cm/m/in/ft. Independent 25.4mm-to-one-inch geometry and actual desktop exports pass. Complete reference-item/unit/benchmark domains remain open.',
 'MEAS-04':'Bounded non-eval token/AST parser with exact rational arithmetic, golden-ratio aliases tau/g, degree trig, implicit multiplication/root shorthand and literal polygon-ratio faceRad/faceAngle/diag helpers including explicit retrograde conventions. Independent83cases and actualGUIdegree-trig/star-diagonal input pass. All numeric fields and installed equation baseline remain open.',
 'DOC-01':'Native project geometry/cache/certificate/view validation, legacy missing-view migration, saved cameras/orientation, bounded immutable operation graphs and source-state associations. Whitelisted replay verifies each intermediate full coordinate/incidence result; parameter edits create independent branches retaining earlier graphs. Actual desktop replay/reopen/error workflows pass. Unknown algorithms retain readable snapshots but cannot execute; complete operation/version migration coverage remains open.',
 'DOC-02':'Nine bounded model memories with store/retrieve/swap/clear keyboard controls, Base/Derived sources, native validation and saved persistence. Add creates literal dimension-matched compounds retaining distinct source coordinates/components. Nine actual desktop workflows pass. Coincident-pair removal, coplanar blending and complete installed-memory domains remain open.',
 'DOC-03':'Validated fsynced unique staging, atomic backup/publication and serialized same-path saves/autosaves. Nine independent storage fixtures including actual writer termination at three publication stages preserve complete previous/next documents. Power-loss/clean-machine and full command/recovery domains remain open.',
 'IO-01':'Strict OFF/4OFF plus bounded ASCII DXF 3DFACE/polyface/LINE/POINT import with units/layers/source colors/hidden edges, explicit welding and unsupported-entity diagnostics; JSON model import validates full source data/caches/certificates. Native DXF64cases and actual desktop import/rejection pass. Binary DXF, full entity/attribute domains and installed baseline remain open.',
 'IO-02':'Intrinsic Base or Derived export selection, physical coordinate conversions and loss report; complete OFF/JSON, ordered OBJ/VRML, DXF edge/header units, convex3D STL/POV. Native independent format-coordinate checks and seven actual export/unit workflows pass. Projected geometry, rich attributes and generalized solid codec domains remain open.'
})
additional_fixtures={
    'LIB-05':['tests/test_drive_audit.py','tests/test_library_audit.py','scripts/audit-drive-corpus.py','scripts/compile-library-audit.py','scripts/library-audit-smoke.cjs'],
    'LIB-08':['tests/test_library_audit.py','scripts/library-audit-smoke.cjs'],
    'IO-01':['tests/test_off_compatibility.py','tests/test_library_audit.py','scripts/library-audit-smoke.cjs'],
    'VIS-01':['scripts/face-fill-test.mjs','scripts/face-fill-cap-test.mjs','scripts/face-fill-benchmark.mjs','scripts/star-desktop-smoke.cjs','scripts/viewer-graphics-smoke.cjs'],
    'VIS-02':['tests/cell-visibility.test.mjs','scripts/face-fill-cap-test.mjs','scripts/star-desktop-smoke.cjs','scripts/library-audit-smoke.cjs','scripts/viewer-graphics-smoke.cjs'],
    'VIS-03':['scripts/viewer-graphics-smoke.cjs','scripts/library-audit-smoke.cjs'],
    'SEC-01':['tests/test_generalized_sections.py','scripts/star-desktop-smoke.cjs'],
    'SEC-02':['tests/test_measurements.py','tests/test_generalized_sections.py'],
    'SEC-03':['tests/animation.test.mjs','scripts/animation-smoke.cjs','tests/test_generalized_sections.py'],
    'SEC-04':['tests/test_generalized_sections.py','scripts/star-desktop-smoke.cjs'],
    'SEC-05':['tests/test_generalized_sections.py','scripts/star-desktop-smoke.cjs'],
    'ANIM-01':['tests/animation.test.mjs','scripts/animation-smoke.cjs'],
    'ANIM-03':['tests/animation.test.mjs','scripts/animation-smoke.cjs'],
    'IO-03':['tests/animation.test.mjs','scripts/animation-smoke.cjs'],
    'DOC-01':['scripts/star-desktop-smoke.cjs','scripts/animation-smoke.cjs','scripts/workspace-ui-smoke.cjs','scripts/viewer-graphics-smoke.cjs'],
    'VIEW-01':['scripts/star-desktop-smoke.cjs','scripts/workspace-ui-smoke.cjs'],
    'VIEW-02':['tests/view-camera.test.mjs','scripts/workspace-ui-smoke.cjs','scripts/viewer-graphics-smoke.cjs'],
    'VIEW-04':['tests/cell-visibility.test.mjs','scripts/face-fill-cap-test.mjs','scripts/star-desktop-smoke.cjs'],
    'VIEW-06':['scripts/workspace-ui-smoke.cjs'],
    'VIEW-07':['scripts/workspace-ui-smoke.cjs'],
    'DESK-01':['scripts/workspace-ui-smoke.cjs']
}
additional_evidence={
    'LIB-05':'Historical artifacts/drive-corpus-full-audit.json, artifacts/library-audit-smoke.json, artifacts/library-audit-packaged-smoke.json and provenance-aware compact indices; importer/source freshness is distinct from mathematical classification.',
    'LIB-08':'artifacts/library-audit-smoke.json, artifacts/library-audit-packaged-smoke.json and tests/test_library_audit.py.',
    'IO-01':'tests/test_off_compatibility.py, artifacts/library-audit-smoke.json and artifacts/library-audit-packaged-smoke.json; source-copy corrections are revalidated.',
    'VIS-01':'artifacts/viewport-redesign/graphics-desktop-smoke.json verifies lit face pixels and solid/translucent rear-edge contrasts; artifacts/star-desktop-smoke.json, artifacts/star-packaged-smoke.json, artifacts/dense-face-fill-benchmark.json and independent face-fill/cap fixtures cover source surface subsets. Display evidence is not a solid certificate.',
    'VIS-02':'artifacts/star-desktop-smoke.json, artifacts/star-packaged-smoke.json, artifacts/library-audit-smoke.json and source cell visibility fixtures; artifacts/viewport-redesign/library-audit-smoke.json verifies actual four-channel RGBA uploads and source-alpha blending/depth state at global opacity one.',
    'VIS-03':'artifacts/viewport-redesign/graphics-desktop-smoke.json and artifacts/viewport-redesign/library-audit-smoke.json; bounded lighting/preset/alpha evidence does not establish rich material parity.',
    'SEC-01':'tests/test_generalized_sections.py and artifacts/star-desktop-smoke.json; generalized outputs carry source-surface semantics.',
    'SEC-02':'tests/test_measurements.py and tests/test_generalized_sections.py.',
    'SEC-03':'tests/animation.test.mjs and artifacts/animation-smoke-*/result.json; section samples await the engine.',
    'SEC-04':'artifacts/star-desktop-smoke.json, artifacts/star-packaged-smoke.json and native surface-section promotion/reopen checks.',
    'SEC-05':'tests/test_generalized_sections.py, artifacts/star-desktop-smoke.json, artifacts/star-packaged-smoke.json and docs/STAR_SURFACES_AND_SECTIONS.md.',
    'ANIM-01':'tests/animation.test.mjs covers ui/video-recorder.mjs encoder cold starts, final-chunk ordering, cancellation and errors; artifacts/animation-smoke-*/result.json and artifacts/animation-packaged-smoke-*/result.json cover short offscreen video capture; see docs/ANIMATION.md.',
    'ANIM-03':'tests/animation.test.mjs and artifacts/animation-smoke-*/result.json; no tour/transition parity claim.',
    'IO-03':'tests/animation.test.mjs checks ui/video-recorder.mjs startup/draining and desktop/animation-export.cjs split-header validation; scripts/animation-smoke.cjs and artifacts/animation-smoke-*/result.json or artifacts/animation-packaged-smoke-*/result.json check short scrolled-offscreen WebM; exact PNG times and real-time WebM are separate contracts.',
    'DOC-01':'artifacts/star-desktop-smoke.json, artifacts/animation-smoke-*/result.json, artifacts/workspace-ui-smoke.json and artifacts/viewport-redesign/graphics-desktop-smoke.json; native project saves/reopens verify camera/display persistence.',
    'VIEW-01':'artifacts/star-desktop-smoke.json and artifacts/workspace-ui-smoke.json.',
    'VIEW-02':'tests/view-camera.test.mjs, artifacts/workspace-ui-smoke.json independent source/camera frustum checks and artifacts/viewport-redesign/graphics-desktop-smoke.json rendered parallel-edge perspective/orthographic comparisons.',
    'VIEW-04':'tests/cell-visibility.test.mjs, scripts/face-fill-cap-test.mjs and artifacts/star-desktop-smoke.json; cell hide/isolate is an implemented subset, not front/back or general per-element conformance.',
    'VIEW-06':'artifacts/workspace-ui-smoke.json native saved snapshots verify selected-plane spin, stopping and direct XW/YW dragging with unchanged source geometry and observer camera.',
    'VIEW-07':'artifacts/workspace-ui-smoke.json; single/two-view subset only, no stereo or one-to-six-view conformance claim.',
    'DESK-01':'artifacts/workspace-ui-smoke.json and artifacts/workspace-ui-cube.png / artifacts/workspace-ui-tesseract.png; 0.10 development interface proof, broader packaged/hardware qualification remains separate.'
}
# Current verified subsets; requirement-wide benchmark gates remain open.
partial.update({
 'VIEW-02':partial['VIEW-02']+' True spherical stereographic projection now tessellates radial great-circle edges and curved face patches, clips poles without bridges and uses analytical smooth sphere/plane normals. Independent circle/surface references and actual GPU pixels verify curves, source IDs and once-only frames. Dense filled motion remains CPU limited.',
 'VIEW-05':'Source vertex, edge, face and cell picking uses displayed points/spheres, actual straight or curved line/cylinder segments, rendered triangle owners and active-cell visibility. Ambiguous candidates cycle, observer drags never pick, saved selection uses source IDs. Twelve independent picking fixtures and seven desktop scenarios pass. Frustum/display visibility is checked; occlusion certification, hover identification and unrestricted dense-picking conformance remain pending.',
 'VIS-01':partial['VIS-01'].replace('Vertex spheres, edge cylinders, Geomag and benchmark-wide presentation parity remain pending.','Instanced vertex spheres and edge cylinders have explicit normalized-view radii and limits. Independent cell-owned face shrink retains source ownership/colors and unchanged topology. Actual rendering/restoration checks pass. Geomag and benchmark-wide presentation parity remain pending.'),
 'DOC-02':partial['DOC-02'].replace('Coincident-pair removal, coplanar blending and complete installed-memory domains remain open.','Explicit coincident-pair removal, coordinate welding and simple coplanar face blending now retain boundary/source maps and replay. Component extraction/deletion preserves remaining component identities. Desktop fixture groups pass. Holes, generalized union semantics and complete installed-memory domains remain open.'),
 'CON-06':partial.get('CON-06','')+' Literal model compounds retain leaf component IDs, ordered incidence and source snapshots; component extraction/deletion supports history/replay and saved projects. Full pseudo-uniform/dual blending and benchmark domains remain open.',
 'CON-10':'Deterministic coincident face-pair removal and explicitly selected simple coplanar blending preserve source boundary cycles/RGBA/maps with explicit welding and color policy. Independent native fixtures and five actual desktop groups pass, including atomic hole/color rejection, undo/replay and persistence. Hole/star unions and complete competitor domains remain open.',
 'ANIM-03':'Validated instant-transition tours retain independent model/view snapshots with add/replace/delete/reorder/merge/save, deterministic absolute-time seeking, loop/playback and cancellation. Fifteen tour fixtures, thirty-two native validation fixtures and ten desktop workflows pass. Other transition families have pure evaluator tests only; renderer/export adapters and complete tour conformance remain open.'
})
additional_fixtures.update({
 'VIEW-02':additional_fixtures.get('VIEW-02',[])+['tests/stereographic.test.mjs','tests/stereographic-viewer.test.mjs','tests/stereographic-normals.test.mjs','scripts/stereographic-smoke.cjs'],
 'VIEW-05':['tests/entity-picking.test.mjs','scripts/entity-picking-smoke.cjs'],
 'VIS-01':additional_fixtures.get('VIS-01',[])+['tests/entity-presentation.test.mjs','scripts/entity-presentation-smoke.cjs'],
 'CON-10':['tests/test_face_blending.py','scripts/face-editing-smoke.cjs'],
 'DOC-02':['tests/model-memories.test.mjs','tests/test_compounds.py','tests/test_remove_component.py','scripts/memories-smoke.cjs','scripts/face-editing-smoke.cjs'],
 'ANIM-03':additional_fixtures.get('ANIM-03',[])+['tests/tour.test.mjs','tests/test_tours.py','scripts/tours-smoke.cjs']
})
additional_evidence.update({
 'VIEW-02':additional_evidence.get('VIEW-02','')+' Smooth stereographic development proof: artifacts/stereographic-smoke-hHRzwD/result.json.',
 'VIEW-05':'Development proof: artifacts/entity-picking-smoke-hLPMZK/result.json; true projected segments/surfaces, active owners and saved source selection.',
 'CON-10':'Development proof: artifacts/face-editing-smoke-P6EnZx/result.json; explicit simple-boundary domain and diagnosed holes.',
 'DOC-02':'Development proofs: artifacts/memories-smoke-84zdIB/result.json and artifacts/face-editing-smoke-P6EnZx/result.json.',
 'ANIM-03':'Development proof: artifacts/tours-smoke-oSGltq/result.json. Unsupported transition methods remain diagnosed; pure transitions do not establish renderer parity.'
})
# 0.12 development: explicitly bounded construction and presentation subsets.
partial.update({
 'LIB-07':'Convex polygons, prisms, antiprisms and duoprisms; literal regular star polygons now preserve signed unreduced n/d, winding, phase and disconnected component sources. Independent90kernel and16native-generator cases pass. Five actual packaged star-polygon groups pass, including GPU winding fill, signed cycles, component Keep/Delete and persistence. Star products, rational antiprisms/antiduoprisms and installed generator domains remain open.',
 'CON-01':partial.get('CON-01','')+' Direct-incidence cupola construction has independently matched J3/J4/J5 metrics/topology; n>=6 requires explicit positive height and retains unequal rectangles without regular-face claims. Six actual construction/refinement groups pass. Full generator catalog domains remain open.',
 'CON-08':'Source edge subdivision preserves original vertices, ordered incident face insertions, cells, RGBA and source lineage; qualified recipe replay and original-parent parameter branches survive native projects. Selected reversed-edge and complete3D/4D actual desktop cases pass. Compound subdivisions, face/geodesic/zonohedral construction and sphere projection remain open.',
 'VIEW-02':partial['VIEW-02'].replace('Adjustable 4D perspective strength, camera bookmarks/locks and general GPU/CPU tolerance qualification remain pending.','Adjustable4D eye distance/near clipping now preserves source IDs, true clipped segments/triangles, source-plane facing and conservative observer bounds. Seven actual desktop groups include independent Schlegel11:1 projected-edge pixels, frustum and persistence evidence. Camera bookmarks/locks, gestures and general GPU/CPU tolerance qualification remain pending.'),
 'ANIM-01':partial['ANIM-01'].replace('Explosion, camera/projection/material tracks and complete benchmark animation domains remain pending.','V2 normal/radial entity-explosion and rigid3Dface-net tracks have source-bound preflight, actual renderer instances, guarded async publication and full original-view export restoration. Native/project and independent renderer/controller tests pass; Thirteen actual packaged track/export checks pass, including source preservation, saved pose hydration, PNG and decoded offscreen WebM endpoints, and complete-view cancellation restoration. Generalized explosion, camera/projection/material tracks and complete benchmark animation domains remain pending.')
})
additional_fixtures.update({
 'LIB-07':['tests/test_star_polygons.py','tests/test_star_polygon_generator.py','scripts/star-polygon-smoke.cjs'],
 'CON-01':additional_fixtures.get('CON-01',[])+['tests/test_cupola.py','scripts/construction-refinement-smoke.cjs'],
 'CON-08':['tests/test_edge_subdivision.py','tests/test_development_integration.py','scripts/construction-refinement-smoke.cjs'],
 'VIEW-02':additional_fixtures.get('VIEW-02',[])+['tests/perspective4d.test.mjs','tests/viewer-perspective.test.mjs','scripts/perspective4d-smoke.cjs'],
 'ANIM-01':additional_fixtures.get('ANIM-01',[])+['tests/animation-tracks.test.mjs','tests/animation-adapters.test.mjs','tests/animation-track-controls.test.mjs','tests/animation-renderer.test.mjs','tests/explosion-viewer.test.mjs','tests/viewer-explosion.test.mjs','tests/test_animation_state.py','scripts/animation-tracks-smoke.cjs']
})
additional_evidence.update({
 'CON-01':'Development evidence: artifacts/construction-refinement-smoke-8UYCCC/result.json; direct construction is a bounded generator subset.',
 'CON-08':'Development evidence: artifacts/construction-refinement-smoke-8UYCCC/result.json; no face/geodesic or arbitrary compound subdivision claim.',
 'VIEW-02':additional_evidence.get('VIEW-02','')+' Adjustable perspective development evidence: artifacts/perspective4d-smoke-7FgY2p/result.json.',
 'ANIM-01':additional_evidence.get('ANIM-01','')+' V2 native/core/controller/bridge evidence: artifacts/python-full-animation-stars-0.12.0.log and artifacts/node-full-animation-stars-0.12.0.log. Actual v2 packaged evidence: artifacts/release-0.12.0.json and artifacts/desktop-qualification-QqUSiL/result.json.'
})

partial.update({
 'CON-11':'Convex 3D-base extrusion and ordered literal polygon products and polygon-prism recipes now preserve signed/unreduced star cycles, complete factor snapshots, source maps/colors and disconnected incidence partitions. Actual desktop generation, native save/load, undo/redo, replay and height branches pass bounded scenarios. Recoverable generated components, full 3D-source prisms, antiduoprisms and stepped families are not yet exposed in this release; their isolated kernels do not establish parity.',
 'VIEW-02':partial.get('VIEW-02','')+' Pixel-derived sampled stereographic refinement now runs in a real bounded module Worker (one active plus one latest job). Coherent intermediate spin poses, source picks, idle refinement, zoom adaptation and exact capture/cancel recovery have actual browser evidence. No whole-curve error bound or universal dense-motion performance is claimed; finite caps remain explicit.',
 'ANIM-01':partial.get('ANIM-01','')+' PNG/WebM await exact fine geometry before pixel reads, fence cancellation/source/view changes and recover unchanged presentation poses after canceled capture. Required transition families and full mathematical domains remain open.'
})
additional_fixtures.update({
 'CON-11':additional_fixtures.get('CON-11',[])+['tests/test_products.py','tests/test_product_generator.py','tests/test_product_workflow.py','tests/product-controls.test.mjs','tests/construction-workflow.test.mjs','scripts/polygon-product-smoke.cjs'],
 'VIEW-02':additional_fixtures.get('VIEW-02',[])+['tests/stereographic-quality.test.mjs','tests/stereographic-worker-protocol.test.mjs','tests/stereographic-worker-geometry.test.mjs','tests/viewer-stereographic-worker.test.mjs','scripts/stereographic-worker-smoke.cjs','scripts/stereographic-dense-benchmark.cjs'],
 'ANIM-01':additional_fixtures.get('ANIM-01',[])+['tests/animation-export-capture.test.mjs','scripts/stereographic-worker-smoke.cjs']
})

partial['VIEW-02']+=' Dense-model qualification found complete-only intermediate publication starved the 120-cell; validated explicitly partial interaction poses now publish coherently. The input/output caps still prevent complete full filled views in some cases; exact capture remains strict.'
partial['DOC-03']=partial.get('DOC-03','')+' Recipe replacement/replay/branch publication rechecks workspace, history and export ownership after native completion and again synchronously after the caller await; the intervening microtask export race is covered.'
additional_fixtures['DOC-03']=additional_fixtures.get('DOC-03',[])+['tests/history-workflow.test.mjs']
additional_evidence.update({
 'CON-11':'Development bounded workflow evidence: artifacts/products-native-0.13.0.log and artifacts/desktop-qualification-vlvThF/result.json. Requirement-wide conformance remains open.',
 'VIEW-02':additional_evidence.get('VIEW-02','')+' Actual worker development evidence: artifacts/stereographic-worker-smoke-spYBmp/result.json; typed/main-renderer tests in artifacts/node-workers-products-final-0.13.0.log.',
 'ANIM-01':additional_evidence.get('ANIM-01','')+' Actual new capture development evidence: artifacts/desktop-qualification-zplIid/result.json and artifacts/stereographic-worker-smoke-spYBmp/result.json.'
})

for requirement in ('CON-11','VIEW-02','ANIM-01','DOC-03'):
    additional_evidence[requirement]=additional_evidence.get(requirement,'')+' Verified bounded 0.13 release: artifacts/release-0.13.0.json; 22 packaged suites artifacts/desktop-qualification-45ZOZr/result.json; actual portable artifacts/portable-0.13.0/portable-smoke.json. Final Node436 evidence: artifacts/node-dense-history-final-0.13.0.log.'
additional_evidence['VIEW-02']+=' Actual six-case dense packaged evidence: artifacts/stereographic-dense-packaged-bzh5u7/result.json (all moving, some partial, timings qualified; no full viewport performance claim).'

# Required baseline scope remains broader than the shipped subset. Record both
# explicitly rather than treating today's finite implementation as the target.
domains={
 'CON-11':{
     'dimensions':[4],
     'object_classes':['3D-base prisms','duoprisms','antiduoprisms','rational star products','step prisms/gyrochora'],
     'parameter_domain':{'required':'All benchmark-verified parameters and material options; installed baseline audit pending.',
                         'implemented':{'polygon_sources':'disjoint intrinsic 2D cycles, degree two, resolved edges and full rank',
                                        'symbols':'literal signed/unreduced n/d accepted by the regular-star-polygon source generator',
                                        'product_vertices_maximum':4000,'prism_height':'positive finite float64 through 1e100, with rank/payload/resource refusals'},
                         'pending':'Full 3D-source prisms, antiduoprisms and step/gyro families are not exposed in 0.13.'}},
 'VIEW-02':{
     'dimensions':[3,4],
     'object_classes':['convex polyhedra and polychora','ordered generalized complexes','derived/exploded geometry instances'],
     'parameter_domain':{'required':'All verified 4D projection and 3D observer controls with declared CPU/GPU display tolerance.',
                         'implemented':'Six rotation angles; bounded 4D perspective/near clipping; orthographic/perspective observer; adaptive sampled S3 display.',
                         'limits':{'stereographic_input_triangles':2000,'stereographic_output_triangles':100000,
                                   'whole_curve_error_proven':False,'complete_dense_surface_motion':False}}},
 'ANIM-01':{
     'dimensions':[3,4],
     'object_classes':['polyhedra and polychora for rotation/section tracks','qualified convex sources for explosion','convex 3D face nets for folding'],
     'parameter_domain':{'required':'Benchmark-supported rotation, explosion, section-depth and fold methods in their complete verified domains.',
                         'implemented':'Time-based six-plane rotation, intrinsic section depth, convex normal/radial explosion, rigid 3D face-net folds, exact fine capture waits.',
                         'pending':'Generalized explosion directions and partial 4D folding are unavailable; complete benchmark options remain to be audited.'}}
}

class LedgerError(ValueError):
    pass


def require(condition,message):
    if not condition:raise LedgerError(message)


def digest(path):
    value=hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda:stream.read(1024**2),b''):value.update(data)
    return value.hexdigest()


def unique_object(pairs):
    result={}
    for key,value in pairs:
        require(key not in result,'Duplicate ledger JSON key: '+key)
        result[key]=value
    return result


def read_json(path):
    require(path.stat().st_size<=128*1024**2,'Ledger/evidence exceeds 128 MiB')
    def finite(value):
        result=float(value);require(math.isfinite(result),'Nonfinite JSON number');return result
    return json.loads(path.read_text(encoding='utf-8-sig'),object_pairs_hook=unique_object,parse_float=finite,
                      parse_constant=lambda value:(_ for _ in ()).throw(LedgerError('Nonfinite JSON: '+value)))


def inventory(repository=root):
    path=repository/SPEC
    require(digest(path)==SPEC_SHA256,'The original specification bytes must remain unchanged')
    result=[]
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        match=re.match(r'^\| ([A-Z]+-[0-9]{2}) \| (.*?) \| (.*?) \|$',line)
        if match:result.append(dict(zip(('id','coverage','acceptance'),match.groups())))
    require(len(result)==73 and len({r['id'] for r in result})==73,'Expected all 73 original unique requirements')
    return result


def validate_ledger(ledger,expected,repository=root):
    require(type(ledger) is dict and type(ledger.get('schemaVersion')) is int and ledger.get('schemaVersion')==1 and
            type(ledger.get('baselineAuditComplete')) is bool,'Invalid ledger root schema')
    records=ledger.get('requirements');by_id={r['id']:r for r in expected}
    require(type(records) is list and len(records)==73 and all(type(r) is dict for r in records),
            'Ledger must preserve all 73 records')
    require(len({r.get('requirement_id') for r in records})==73 and
            {r.get('requirement_id') for r in records}==set(by_id),'Ledger IDs differ from the original specification')
    for record in records:
        rid=record['requirement_id'];original=by_id[rid]
        require(record.get('competitor_workflow')==original['coverage'] and
                record.get('expected_result')==original['acceptance'] and record.get('manual_source')==SPEC,
                'Original title/acceptance/source mismatch: '+rid)
        require(type(record.get('release_blocker')) is bool and record.get('implementation_status') in
                ('unstarted','research','prototype','implemented','validated','released'),'Invalid gate/status: '+rid)
        closed=record['implementation_status'] in ('validated','released')
        require(closed is (record['release_blocker'] is False),'Gate/status disagreement: '+rid)
        if closed:
            require(rid in ('LIB-04','MEAS-04'),'No reviewed requirement-wide gate adapter for '+rid)
            gate=record.get('requirement_gate')
            require(type(gate) is dict and gate.get('requirement_id')==rid and
                    gate.get('version') and gate.get('status')==record['implementation_status'],
                    'Closed gate lacks its verified receipt association: '+rid)
            relative=gate.get('path')
            require(type(relative) is str and '\\' not in relative and not Path(relative).is_absolute() and
                    '..' not in Path(relative).parts and Path(relative).parts and Path(relative).parts[0]=='artifacts',
                    'Unsafe closed-gate receipt path')
            receipt=(repository/relative).resolve(strict=True)
            require(receipt.is_relative_to(repository.resolve()) and receipt.is_file() and
                    digest(receipt)==gate.get('sha256'),'Closed-gate receipt changed/escaped')
            evidence=read_json(receipt)
            require(evidence.get('format')=='polytope-requirement-gate' and evidence.get('schemaVersion')==1 and
                    evidence.get('requirementId')==rid and evidence.get('passed') is True and
                    evidence.get('status')=='passed' and evidence.get('version')==gate['version'] and
                    evidence.get('acceptance')==original['acceptance'] and
                    evidence.get('specification',{}).get('sha256')==SPEC_SHA256 and
                    evidence.get('specification',{}).get('requirements')==expected,
                    'Closed ledger gate is not associated with the original verified acceptance')
            spec=importlib.util.spec_from_file_location('parity_reference_verifier',repository/'scripts/apply-parity-gate.py')
            application=importlib.util.module_from_spec(spec);spec.loader.exec_module(application)
            # Regeneration rechecks all retained references without launching a
            # process. Applying a NEW closure additionally reruns the collector.
            if record['implementation_status']=='released':
                promoted=application.load_script(repository,'promote-parity-gate.py','parity_release_verifier')
                promoted.verify_release_association(evidence,gate.get('release'),repository)
            elif 'candidate' in gate:
                application.verify_candidate_association(evidence,gate['candidate'],repository)
            else:
                application.verify_receipt_references(evidence,repository)
    return ledger


def bootstrap(expected):
    records=[]
    for original in expected:
        rid=original['id']
        record={'requirement_id':rid,'competitor_version':'Stella4D 6.0 (specification target; installed audit pending)',
                'manual_source':SPEC,'competitor_workflow':original['coverage'],'expected_result':original['acceptance'],
                'dimensions':None,'object_classes':None,'parameter_domain':None,
                'numeric_contract':'float64-approximate geometry; rational-exact expression/predicate subset' if rid in partial else None,
                'implementation_owner':'Polytope Laboratory','implementation_status':'prototype' if rid in partial else 'unstarted',
                'partial_implementation':partial.get(rid),'test_fixture_ids':(['tests/test_kernel.py','tests/test_reference_library.py',
                    'tests/test_nets.py','tests/test_net_editing.py','tests/test_cell_nets.py','tests/test_net_printing.py',
                    'scripts/verify-net-pdf.py','scripts/verify-packed-net-pdf.py','tests/test_wythoff.py','tests/test_stellation.py',
                    'tests/test_symmetry.py','scripts/desktop-smoke.cjs','scripts/portable-smoke.cjs','tests/test_linked_library.py',
                    'tests/test_drive_download.py','scripts/linked-library-smoke.cjs']+additional_fixtures.get(rid,[])) if rid in partial else [],
                'validation_evidence':('See artifacts/desktop-smoke.json and pytest results. '+additional_evidence.get(rid,'')+
                    ' Requirement-wide conformance is NOT established.').strip() if rid in partial else None,
                'known_limits':partial.get(rid,'No implemented scenario.'),'release_blocker':True}
        record.update(deepcopy(domains.get(rid,{})));records.append(record)
    return {'schemaVersion':1,'baselineAuditComplete':False,'requirements':records}


def development_updates(path,expected):
    overlay=read_json(path)
    require(type(overlay) is dict and not set(overlay)-{'scope','version','requirements'},
            'Development overlay cannot alter baseline/root policy')
    updates=overlay.get('requirements')
    require(type(updates) is dict,'Development overlay requirements must be an object')
    editable={'dimensions','object_classes','parameter_domain','numeric_contract','implementation_status',
              'partial_implementation','test_fixture_ids','validation_evidence','known_limits','release_blocker'}
    known={r['id'] for r in expected}
    for rid,update in updates.items():
        require(rid in known and type(update) is dict and not set(update)-editable and
                update.get('release_blocker') is True and update.get('implementation_status') in ('prototype','unstarted'),
                'Development evidence cannot relax/rename a requirement-wide gate: '+rid)
    return updates


def build_ledger(repository=root,overlay_paths=None):
    repository=repository.resolve();expected=inventory(repository);path=repository/'docs/parity-ledger.json'
    require(path.resolve().is_relative_to(repository),'Ledger path escapes repository')
    existing=path.exists()
    ledger=deepcopy(read_json(path)) if existing else bootstrap(expected)
    validate_ledger(ledger,expected,repository)
    overlays=overlay_paths if overlay_paths is not None else [repository/'docs/parity-development-0.14.0.json',
                                                             repository/'docs/parity-development-0.15.0.json']
    for path in overlays:
        if not path.exists():continue
        updates=development_updates(path,expected)
        if not existing:
            indexed={r['requirement_id']:r for r in ledger['requirements']}
            for rid,update in updates.items():indexed[rid].update(deepcopy(update))
        # Existing records are authoritative: older overlays are checked but
        # cannot regress manual 0.16+ evidence, erase metadata, or reopen a gate.
    return validate_ledger(ledger,expected,repository)


def atomic_write_ledger(path,value,expected_sha=None):
    require(path==root/'docs/parity-ledger.json' and path.resolve().is_relative_to(root.resolve()),
            'Only the fixed repository ledger may be published')
    data=(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
    path.parent.mkdir(parents=True,exist_ok=True)
    descriptor,name=tempfile.mkstemp(prefix='.parity-ledger-',suffix='.tmp',dir=path.parent)
    temporary=Path(name)
    try:
        with os.fdopen(descriptor,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
        require((digest(path) if path.exists() else None)==expected_sha,'Ledger changed before atomic publication')
        os.replace(temporary,path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true')
    args=parser.parse_args();path=root/'docs/parity-ledger.json';before=digest(path) if path.exists() else None
    ledger=build_ledger()
    if not args.check:atomic_write_ledger(path,ledger,before)
    closed=sum(r['release_blocker'] is False for r in ledger['requirements'])
    print(f"73 original requirements preserved; {closed} independently closed gates; {73-closed} open gates. "+
          ('Read-only check.' if args.check else 'Existing metadata/evidence preserved.'))


if __name__=='__main__':main()
