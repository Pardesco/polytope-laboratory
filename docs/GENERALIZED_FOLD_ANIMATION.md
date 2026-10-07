# Generalized face-net animation

Closed intrinsic 3D shells with supported simple planar faces can now fold
through saved keyframe sequences, animated tours, PNG frames and WebM video.
This includes supported concave polyhedra and toroidal sources.

Generate or edit the source net first. In Animation, use **Add rigid face-net
fold**, record fold poses, and select **Face net** for capture. Existing saved
fold sequences retain their times, rotations and fold fractions. PNG/video
include both endpoints and restore the previous view after export.

Generalized nets are reconstructed from the actual source before animation.
Their native triangulation must cover each complete simple planar face, and the
folded endpoint must reconstruct every ordered source corner at the saved
physical scale. Saved cuts, piece placements, history, tab preferences, source
text and PNG images remain bound to their owners. Changed source content,
geometry or net history cancels pending preparation/publication.

This does not add collision detection, generalized explosion, partially folded
4D cell nets or embedded 3D-in-4D folding. Physical tabs remain in printable
descriptors/SVG; the folding canvas draws faces and content rather than separate
tab surfaces. Those limits do not alter the source geometry.

Saved cameras stay fixed through export. Framing only the flat net can clip a
later pose. Review the sequence and adjust the camera to cover the motion;
automatic fitting of its full movement remains open.

Native L-prism and genus-one torus checks pass rigidity at 0, 0.5 and 1, complete
source endpoints, project/tour Save/Open and source-content/tab persistence.
Six Viewer/animation/tour checks pass. The actual Electron check in
`artifacts/generalized-fold-quick-FEbVM9/result.json` exports three distinct
PNG poses at 0, 0.5 and 1 seconds and WebM with three decoded VP8 frames, then
verifies source geometry, colors, units, history, tabs and content after Save/Open.
