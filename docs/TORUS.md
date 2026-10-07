# Literal polyhedral ring torus

`engine.torus.polyhedral_torus` constructs an untwisted periodic quad surface directly. The current native generator exposes it as strict `kind='torus'`. The headless workflow tests exercise that dispatch, native save/load and the existing polyhedron-prism recipe; they do not qualify a desktop dialog or claim complete Stella compatibility.

```python
from engine.torus import polyhedral_torus

model = polyhedral_torus(
    ring_segments=10,
    arm_segments=8,
    arm_ratio=0.5,
    ring_radius=1.0,
    face_colors=None,
)
```

The first three inputs correspond to the parameters documented in the official [Stella manual, §8.12](https://www.software3d.com/Manual/Glimpse4D.php?prod=Great): subdivisions around the ring, subdivisions around the arm and the arm/ring radius ratio. The explicit `ring_radius` controls our source scale. Matching Stella's default scale, angular phase, incidence order, accepted segment limits and horn/spindle behavior still requires installed-baseline evidence. This kernel alone does not complete CON-02.

## Coordinates and incidence

For major radius `R`, minor radius `r=R*arm_ratio`, angles `u=2πi/n`, `v=2πj/m`, the source point is

```text
((R+r cos(v)) cos(u), (R+r cos(v)) sin(u), r sin(v))
```

Vertex ID is `i*m+j`. Increasing ring angle starts on +X and turns toward +Y; the arm starts radially outward at z=0 and initially rises toward +Z. Ring-directed edges come first in vertex order, followed by arm-directed edges in vertex order. Face ID has the same grid order as vertices, with outward cycle `(i,j), (i+1,j), (i+1,j+1), (i,j+1)`. Both indices wrap; seams share source IDs rather than duplicating or welding vertices.

Counts are `V=nm`, `E=2nm`, `F=nm`, with no 4D cells. Every edge has two oppositely directed face incidences; each vertex has a simple four-edge link. The connected orientable surface has Euler characteristic zero and genus one. Metadata records grid-to-vertex/edge/face maps, algorithm version, parameters and numerical evidence bound to the generated model ID and geometry fingerprint. The repository fingerprint binds coordinates and incidence; it does not hash color attributes. These maps describe the generated source and become historical evidence when geometry changes.

Top-level `metadata.family='Torus'` and `metadata.topologicalGenus=1` expose this source family and surface genus to Analyze. Genus here describes the 3D boundary surface; it is not a convex or filled-volume declaration.

Quads are planar because the two ring chords in each face are parallel. Source faces retain all four vertices even when a renderer triangulates them. The returned interpretation is `generalized-complex`, with approximate float64 evidence and `certified=False`. The constructor never calls a hull, supplies supporting convex facets or attaches a solid content measure. A torus is not promoted by the existing construction finalizer.

## Bounds and numeric domain

Both segment counts must be actual integers at least 3; booleans and numeric strings are rejected. Their product is at most 4,000. Other ceilings are 100,000 elements per kind, one million total coordinate/incidence references and 64 MiB of bounded JSON including parameters/colors/maps. Structural JSON depth/value limits also apply through the native bounded serializer. Counts are checked before coordinate allocation.

Radius must be finite, positive and at most `1e100`; every resulting coordinate must also stay within `1e100`. Thus a radius at the upper bound can be rejected because the outer surface extends beyond it. Ratios must satisfy `0<ratio<1`: the initial domain is a ring torus, and horn/spindle constructions remain unsupported.

Numerical predicates operate in ring-radius units, then divide by the sampled coordinate span. Analytic arm/hole clearance, actual edge lengths and each face's second singular value must exceed four times the repository tolerance `1e-8`; a face's third singular value must be at most that tolerance. The source must have resolved 3D rank. Scaled coordinates must remain distinct and reconstruct their unit-radius values within tolerance. Native source validation must also pass. Very thin arms, nearly closed holes, badly resolved aspect ratios and coordinate underflow are refused explicitly rather than repaired. No exactness claim follows from these tests.

## Color and persistence

Optional `face_colors` is a list with exactly `nm` entries in literal face order. Each entry is `None` or an existing OFF color record: byte RGB/RGBA integers in 0–255, or unit RGB/RGBA numbers in 0–1. Inputs are bounded and detached; model colors and provenance colors are independent copies. Alpha remains an actual fourth channel.

Native project save/reopen preserves source cycles, maps, evidence and attributes. The generalized model receives no convex measure during native validation. OFF export/reimport retains coordinates, quads, undirected boundary edges and colors; OFF does not retain generator provenance or the constructor's directed edge ordering. The importer may independently inspect a hull for convex recognition, but the torus source boundary remains generalized and unchanged.

## Independent validation

`tests/test_torus.py` includes a hand-authored 4×4 cardinal/diamond coordinate fixture with every edge and face, the manual example's `80/160/80` counts, periodic seam/link/orientation checks, maximum-size cases, analytic meridian radii and edge lengths, and native save/reopen with actual RGBA. Signed tetrahedral integration is checked against a separately derived polygonal sweep formula to verify orientation; this testing calculation is not a model solid-volume declaration.

Malformed counts, huge integers, nonfinite values, horn/spindle ratios, unresolved clearances, coordinate underflow/overflow, color errors and payload limits fail atomically. Generation and native project roundtrip are tested with hull calls forbidden. No GUI or browser windows are required for any of these checks.

`tests/test_torus_workflow.py` verifies actual server generation, Analyze without convex content, project save/load, strict parameter refusal and JSON-lines error recovery in a hidden Python process. A 4×4 torus shell lifted through `polyhedron-prism` has `32/80/64/18` incidence, including two complete formal genus-one cap cells. It retains a generalized interpretation, its full torus source snapshot and RGBA. These formal cells do not acquire a filled-ball claim. Tests cover native recipe replay, height branching, undo snapshots and the genuine single-component extraction/last-component refusal.
