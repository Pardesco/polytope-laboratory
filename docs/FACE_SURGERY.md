# Face excavation, prism tunnels and vertex copies (W6)

Construct → **Modify this model → Augment / excavate** (`face-surgery-settings`).
The previous strict **Attach faces (3D)** and **Place at faces (3D)** workflows remain available.

Pick a source face with viewport picking, or set Selection kind **Face** and its index.
Choose **Pyramid**, **Cupola (lower ring)**, **Prism**, **Antiprism**, a **Built-in library model** key, or **Model memory 1–9** (`surgery-piece`).
Use `surgery-excavate` for inward attachment and `surgery-all` for all congruent faces.
`apply-face-surgery` commits a single native `face-surgery` history operation. Undo/Redo,
save/open, replay and parameter branching use the existing document/history APIs.
`cancel-face-surgery` cancels expression evaluation or the native job without publication.

## Click-through examples

- Unit cube, face 0, Pyramid, height/edge `1/4`, Excavate checked → **Apply to selection**:
  V/E/F = 9/16/9, Euler 2, approximate enclosed volume 11/12.
  All-of-type at height/edge `1/10` gives six cavities, V/E/F = 14/36/24, volume 4/5.
- Cube, any face, Prism, clear All-of-type, tunnel radius/face radius `1/2` →
  **Drill opposite faces (Prism)** (`drill-face-surgery`): V/E/F = 16/32/16,
  Euler 0, genus 1, volume 3/4 of the cube. Genus and **Enclosed boundary volume (approx.)**
  appear in Analysis → More model information. Volume evidence is bound to the result fingerprint.
- Hexagonal prism, select a hexagonal end, Cupola, All-of-type → cap both ends.
- Cube, Selection kind Vertex, choose library key `tetrahedron`, scale `1/10`,
  All-of-type → eight independent tetrahedra plus the original cube. Components remain extractable.
  For a different library model or rotunda, load it and store it in a model memory first.

## Definitions and checks

Sources must be independently verified closed convex 3D boundaries embedded in XYZ
(4–256 vertices, at most 128 faces). No hull replaces supplied source geometry.
Generated pieces use ordinary polygon rings; the complete chosen face must match after
scale and a discrete cyclic twist (`surgery-twist`, 0 through n−1). Congruence uses
ordered polygon distances and includes size. It is not merely equal side count or a
claim about a symmetry orbit. Cupolas attach by their even lower ring, at least six sides.
Height is generated-piece height divided by the first selected face edge length;
stored/library pieces retain their own shape. Sources with different coordinate-unit
metadata or memory display units are refused; no unit conversion is implied.

Excavation removes both seam faces, welds paired seam vertices and reverses the cavity
faces. Nonseam cavity vertices must lie strictly inside all other base supporting planes.
The whole batch uses the original source faces, then checks every resulting convex face
pair using the existing Stewart plane-line/clipping predicates. This catches crossing
or coincident cavities, including batches whose individual pieces fit inside the base.
Equal-color, adjacent coplanar polygons optionally use the existing no-hole native
face blender; outward winding is restored. Overlapping coincident cavity surfaces are
refused rather than silently converted into a general Boolean union.

Drill finds a unique translated, parallel, congruent opposite face. Homothetic inset
rings leave a polygonal rim at both ends, joined by reversed prism walls. It checks
the connected orientable vertex-manifold boundary, edge winding, Euler characteristic,
and expected genus. Volume/area are approximate oriented boundary integrals, separate
from native generalized filled-solid measurement authority. Input/output residuals,
topology, intersection scope and placements are in `metadata.faceSurgery`.

Vertex copies align the addition's selected-face inward normal to the vector from the
base vertex mean to the chosen vertex, anchoring that face's vertex mean at the vertex
plus the entered offset. All-of-type uses the vertex orbit from a **complete verified
metric symmetry search**. At most 64 copies / 4096 output vertices are allowed.
Copies form a literal compound: intersections, touching and coincident faces remain;
no merged solid or union volume is asserted. Model memories, geometry, attributes,
selection, units and history ownership are fenced through expression and native awaits.

## Limits and Stewart evidence

- Float64 relative matching/intersection tolerance is 1e-8 of base span; no exact claim.
- At most 64 faces per batch and 256 output faces; ordinary convex pieces only.
- Built-in generated rings must match the target. Pentagonal pyramids cannot attach
  to triangular icosahedron faces. Tests instead excavate all triangular icosahedron
  faces and all pentagonal dodecahedron faces with their matching pyramids.
- Through excavation, touching other base faces, arbitrary intersecting cavities,
  nonconvex bases, arbitrary Boolean cuts and hole-containing single-cycle faces are refused.
- Drill supports straight prism tunnels only. Antiprism/cupola through tunnels,
  multiple sequential tunnels on nonconvex results, interactive previews and installed
  Stella comparison remain follow-ups. These generic polygon-rim tunnels are not
  asserted to satisfy Stewart's regular-face R/A/Q/T/D conditions.
- Independent checks of all seven supplied `stewart` / `stewart_families` OFF surfaces
  pass R/A/Q/T/D and their declared genera. This Windows worktree has CRLF-converted
  OFF assets: the existing catalog loaders reject their byte hashes (LF normalization
  matches the manifest). Integrity checks were left intact. Restore manifest-matching
  asset bytes before the lead's catalog/installed-app qualification.

## Verification

`python -m pytest tests/test_face_surgery.py -q -p no:cacheprovider` — 35 tests:
counts, volume, orientation, all-of-type, cupolas, all twists, colors, intersection
refusal, genus-one cube/hexagonal tunnels, vertex orbits/components, save/replay/branch,
attributed Stewart geometry and actual JSON-lines protocol requests.

`node --test tests/face-surgery-controls.test.mjs` — 13 tests, including mounting,
NumericEntry, selected-entity/history parameters, cancellation and stale publication.
The existing augmentation/placement/history/recipe Python regression selection passed
335 additional tests; the combined Node regression selection passed 425 tests.
`npx.cmd vite build --configLoader native` passed (existing large-chunk warning).
Electron was not launched in the sandbox.
