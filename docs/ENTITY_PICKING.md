# Direct source entity picking

The viewport toolbar selects vertex, edge, face or cell picking. Selecting a mode enables the corresponding displayed primitive: vertices for vertex picks, edges for edge picks, and surfaces for face/cell picks. The Inspector kind selector stays synchronized. Pick mode and the last identified source entity are saved with the view.

Vertices use a 14 CSS-pixel neighborhood around the visible projected source point. Source edges use an 8 CSS-pixel distance to the actual drawn segment path. In stereographic mode this is the bounded curved polyline, including cylinder segments; an absent straight endpoint chord is not a candidate. Virtual crossing points and subdivision samples never acquire vertex or edge source IDs. Projected zero-length edges and clipped source vertices are excluded.

Faces use a ray through the actual rendered surface triangles. Spherical or winding-generated patches map back to their original source face. Cells use those same surface hits: independently shrunk patches have one source cell owner, while an unshrunk shared source face can offer every active owning cell. Manual hide/isolate and observer-facing masks restrict those owners. Cell-net face and Shift-vertex source correspondence callbacks retain their existing behavior.

Vertex and edge candidates sort by pixel distance, then source ID; face/cell candidates sort by nearest ray depth, then source ID. Each source ID appears once even when several curve or surface samples are hit. Repeating a click within five CSS pixels with the same ordered candidates cycles them. Changing kind, moving farther, changing candidates or clicking empty space resets that cycle. Floating-point camera poses can distinguish nearly coincident projected distances; only exact ties use the ID ordering. Any observer drag exceeding five pixels suppresses picking, including a drag that returns to its starting point.

The visibility contract is **active source masks, explicit primitive visibility and the observer camera frustum**. Transparent/overlapping geometry permits candidate cycling. This implementation does not claim an occlusion-aware pixel-depth picking qualification. Hover identification remains separate work.

Picking clips edge endpoints in homogeneous camera coordinates before screen-distance tests, including perspective edges with an endpoint behind the camera. Traversal is bounded at 100,000 displayed primitives or source-owner visits; exceeding the bound yields an explicit diagnostic and no partial guessed pick.

`tests/entity-picking.test.mjs` verifies twelve independent pure/actual-buffer scenarios, including curved paths versus chords, virtual face identity, shared/shrunk owners, hidden/clipped sources, stable exact ties, reset/cycling, camera clipping and cell-net callbacks. The combined geometry/presentation/frame/facing/picking run passed 66 tests.

The actual development 0.11.0 UI passed seven scenario groups with zero page errors. Evidence: `artifacts/entity-picking-smoke-hLPMZK/result.json` and four screenshots. Actual clicks identified visible points/spheres, curved source lines/cylinders and spherical face interiors; coincident vertex and shared-cell cycling excluded clipped/hidden owners. Drag suppression, shrunk-cell isolation, source coordinates/incidence and native selection/mode restoration passed. The native parser rejected an invented virtual-patch pick mode. `scripts/entity-picking-smoke.cjs` supports isolated packaged runs through `POLYTOPE_TEST_EXECUTABLE`; no packaged result is claimed yet.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/desktop-qualification-E5RVgf/picking/entity-picking-packaged-v6NHnP/result.json](../artifacts/desktop-qualification-E5RVgf/picking/entity-picking-packaged-v6NHnP/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
