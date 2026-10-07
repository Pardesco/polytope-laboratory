# Project vertices onto a sphere

Open Inspector → Construct → Project vertices onto sphere. This works on
intrinsic XYZ 3D and XYZW 4D models. Center and radius accept expressions.
An empty center uses the mean of the source vertices; an empty radius uses
the mean distance of the source vertices from that center.

Each vertex moves along its original ray from the center to the requested
radius. Edges, ordered face cycles, cells, source IDs, units, face colors and
element content remain associated with their original owners. The operation
is recorded in document history and can be replayed or edited.

A vertex at the center, collapsed geometry, newly nonplanar faces or newly
nonplanar cells prevents adoption. Explicitly subdivide a face before projecting
when its new corners would otherwise be nonplanar. The operation performs no
implicit triangulation or hull replacement. Numerical planarity uses a relative
float64 tolerance of 1e-8. Projection does not establish regularity.

An originally convex model retains its convex declaration only after independent
supporting-facet and complete-cell checks. Other accepted results are generalized
complexes without a filled-solid volume claim. Source snapshots, resolved center
and radius, radius residuals and qualification results are retained in metadata.
Native persistence is normalized before content binds to the output model.

The work domain is bounded to 4,096 vertices, 8,192 faces, 4,096 cells, 256 vertices
per face/cell, and 16 MiB of source JSON. An explicit radius must be between
1e-8 and 1e100; literal coordinates and explicit centers are bounded by 1e100.

Focused native checks cover tesseract incidence and hypervolume, default radius,
nonplanarity and invalid-input refusal, source immutability, content ownership,
units, notes, native Save/Open and replay. The actual app check covers XYZW
expression input and the all-empty default controls.
