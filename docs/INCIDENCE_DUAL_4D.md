# Literal 4D incidence reciprocation

Construct incidence dual now accepts intrinsic 3D or 4D sources. Enter the center
with three or four coordinate expressions and a positive radius. The derived
incidence-dual view uses the same operation. Existing 3D behavior is retained.

For 4D, every actual source cell plane owns one polar vertex, each source face
owns an edge between its two incident cells, each source edge owns an ordered
dual face from its cyclic cell link, and each source vertex owns a complete dual
cell. Thus ranks reverse without replacing literal source incidence.

Source and result must span four dimensions, with finite distinct cell-plane
reciprocals, planar cells and closed ordinary boundary links. Star cycles and
non-spherical generalized cell incidence remain literal. Planes through/near the
center, open/nonmanifold/disconnected links, nonplanarity, coincident reciprocal
owners and unresolved geometry are refused. No hull, angular sort, coordinate
weld or filled-solid volume/density interpretation is used.

Coordinates remain approximate float64; plane/polarity residuals are recorded.
Source snapshot hashes and explicit reverse-rank maps are retained, along with
raw rank-reversed RGBA encodings and effective units. Construction history keeps
prior source states and notes. Enabled morph settings reset for the new geometry.
Rank-changing annotations stay in the existing detached source archive rather
than receiving a guessed owner in the result.

Work limits are 4,000 vertices, 2,048 cells, 32,000 edges/faces and one million
counted source/dual cell-boundary incidences. Three native groups compare 5-cell
and tesseract polarity to independent convex construction, check an independently
supplied concave product and one attributed grand 600-cell with literal pentagram
winding, plus dual-dual coordinates, RGBA, Save/Open and history. Two numerical
workflow/Viewer groups check full-cell display, source guards and capture readiness.
