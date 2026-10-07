# Explosion display buffers

`ui/viewer-explosion.mjs` supplies source-referenced presentation buffers for the next renderer integration. It does not change a mathematical model, add incidence vertices, alter certificates or construct a filled solid. No viewport or animation controls are enabled by this isolated module.

```js
const buffers = prepareExplosionDisplay(sourceModel, pose.baseExplosion, {
  fillRule: 'nonzero'
});
```

The automatic wrapper accepts complete intrinsic 3D face or 4D cell payloads from the existing explosion resolver. It preserves that resolver's convex-source restriction and diagnoses generalized or compound direction semantics. `prepareEntityDisplayBuffers(sourceModel, instances, options)` separately accepts explicitly supplied translated entity instances, including a subset or empty list. This generic helper can fill ordered star cycles but does not resolve generalized explosion directions.

## Source coordinates and ownership

`sourceModel` is the original caller's model reference; `source` is a detached immutable identity record containing its model ID, fingerprint and dimensions. All other returned coordinate, color and incidence buffers are detached from the source and supplied presentation records. Neither the model nor caller-owned nested records are frozen. Render integration must continue to guard current source identity and fingerprint before publication using the [animation adapter session](ANIMATION_ADAPTERS.md).

The original vertex-average center and maximum source radius are independently checked. Every translated point uses `(point-originalCenter)/originalRadius`. Instances are never recentered or resized. Zero automatic explosion retains source coordinates exactly, including all duplicated boundary paths.

Entity roles must cover the complete ordered face incidence of their named 3D face or 4D cell. Vertex IDs, local face cycles and source cycle order must agree with the original model. Each entity must be a uniform finite translation of source points; matching metadata alone cannot qualify altered coordinates. Ordered source edges retain their original endpoint orientation. Within a 4D cell an edge is emitted once with its incident source face IDs; the same mathematical edge has a separate instance in each owning displayed cell.

## Returned buffers

| Field | Meaning |
| --- | --- |
| `vertices`, `normalized` | Instance points and normalized intrinsic coordinates; each vertex record includes `sourceVertex`, `sourceFaceIds`, `sourceCell` and `entityId`. |
| `edges`, `edgeIndices` | Owned edge records and global instance-vertex index pairs; records include `sourceEdge`, original endpoint IDs and incident source face IDs. |
| `faces`, `triangles` | Owned ordered face records and source-referenced fill triangles with explicit original `face` and `cell`. |
| `entities` | Instance-index lists for each displayed source face or cell. |
| `vertexInstancesBySource`, `edgeInstancesBySource`, `faceInstancesBySource`, `cellInstancesBySource` | All instance paths for each original source entity, including empty entries for hidden entities. |
| `sourceVertexIds`, `sourceEdgeIds`, `sourceFaceIds`, `sourceCellIds` | Compact original-ID mappings parallel to the respective instance collections. |
| `diagnostics` | Per-source-face fill suppression with the owning entity/cell, while retaining real edges and vertices. |

Convex fill triangles have `vertices` indexing the returned instance-coordinate array and `sourceVertices` indexing the mathematical source. Virtual star crossing triangles have no `vertices` property and use explicit `normalized` points, with `sourceVertices:null`. Virtual crossings never enter vertex or edge picking maps. Every triangle keeps an original face ID and, for 4D cell instances, an explicit original cell ID.

The existing planar winding filler runs on source coordinates before translation. Both `nonzero` and `even-odd` are supported; boundary order is retained without convexification. Nonplanar or unresolved faces produce diagnostics and no filled triangles, while their original translated boundaries remain available.

Original RGB/RGBA records are checked for byte or unit encoding and finite component ranges. Output `rgba` uses unit components with `colorSpace:'srgb'`; the renderer must apply its existing sRGB-to-linear color conversion. Source vertex and edge colors follow those primitives. Source face color takes precedence over owning source cell color; absent colors remain `null` for the renderer's chosen style. Alpha remains intact.

## Projection and picking integration

Apply the saved observation frame and angles after instance normalization. The returned `normalized`, `edgeIndices` and `triangles` can feed the existing perspective/stereographic helpers. Their edge indices identify display instances: map each projected segment's `edge` through `sourceEdgeIds` before source visibility, style lookup or picking. Face IDs remain source IDs, so face visibility arrays remain indexed by the original model.

For vertex and edge picking, enumerate every displayed instance but use its original source ID when building picking candidates. Repeated instances can resolve to one source entity. Face and cell ray picking uses the triangle's original `face` and explicit `cell`; it must not use a global source face's first owner for a displaced cell. Source selections should highlight all current instance paths.

## Bounds and proof

Default hard caps are 10,000 entities, 100,000 duplicated vertices, 200,000 duplicated edges, 100,000 owned faces, 250,000 duplicated fill triangles and 1,000,000 incidence visits. Input ownership cloning also uses the existing 32 MiB finite-JSON, depth-64 and two-million-item snapshot bound. A `limits` option can lower these caps for a caller; it cannot raise them. Exceeding a buffer cap rejects the whole preparation rather than returning a partial primitive style. Individual unsupported face fills remain explicit diagnostics under the winding filler's own limits.

`node --test tests/viewer-explosion.test.mjs` passes 14 tests. Independent Cartesian cube/tesseract fixtures check exact zero poses, analytic normal/radial offsets, scale/translation covariance, all repeated source-owner paths, ordered edges, RGBA, detached buffers, forged incidence/coordinates, bounded failures, star winding and nonplanar diagnostics. Tests also pass the resulting 4D buffers through the actual observation-frame/rotation/perspective/stereographic helpers and original-ID picking core.

The actual renderer is integrated with these buffers; its separate tests cover primitive styles, source visibility, owner picking/highlights, translated plane facing, shrink and projection paths. The [13-check desktop workflow](ANIMATION_TRACK_CONTROLS.md) verifies actual 3D/4D explosion images, simultaneous rigid net folding, PNG and decoded offscreen WebM endpoints, saved-pose hydration and cancellation. These helper tests qualify buffer preparation; the renderer and desktop evidence qualify their respective additional behavior. Packaged qualification is pending.
