# Adjustable 4D perspective core

The 0.12 development renderer integrates adjustable 4D eye distance and near-plane clipping, with native saved-view validation and Rotation controls. The verified 0.11 release snapshot remains unchanged. This feature has independent mathematical tests and an actual 0.12 Electron UI regression; it does not by itself establish full VIEW-02 conformance or installed Stella equivalence. Mouse field-of-view gestures and compensated observer-camera navigation remain separate work.

## Primary reference and application convention

The official [Stella 4D projection manual](https://www.software3d.com/Manual/Proj4D.php) describes adjusting perspective while moving the 4D observer to approximately compensate apparent size, from a nearly orthogonal view to a Schlegel view. It also distinguishes rotating the final 3D observation from rotating the model before its 4D projection. That document does not specify a numerical eye-distance range, clipping distance or projection formula. Those choices below are this application's explicit convention, derived by intersecting an eye-to-point line with the image hyperplane.

The official [Schlegel diagram glossary entry](https://www.software3d.com/Glossary.php) describes projection from a point just beyond a selected facet, with an analogous 3D diagram for a 4D polytope. Merely choosing a small eye distance does not prove that an arbitrary source/view is a valid Schlegel diagram.

## Coordinates, eye and scale

The caller centers source vertices at their arithmetic mean and divides by the maximum vertex radius, using the current renderer convention. It applies a validated source-bound SO(4) frame and the six incremental display rotations **once**, in that order, to source vertices and any virtual face/shrink points. The new core accepts the resulting four-component display point. It performs no second normalization, radial sphere projection, frame rotation, source mutation or observer-camera movement.

For display point `q=(x,y,z,w)`, eye `e=(0,0,0,d)` and image hyperplane `W=0`, the line

```
e + t * (q-e),  t = d / (d-w)
```

meets that hyperplane at `d*(x,y,z)/(d-w)`. This is the default `equatorial` scale convention. Every point at `w=0` keeps its XYZ coordinates for every supported distance, so changing distance controls relative depth distortion without changing the equatorial scale. It is not a promise that the entire bounding model stays the same screen size.

The optional `unit-plane` convention returns `(x,y,z)/(d-w)`, using an image hyperplane one normalized unit in front of the eye, `W=d-1`. At a fixed distance it differs from equatorial presentation by one uniform scale factor. It is explicit mathematical API behavior; no UI selector is currently claimed.

As distance grows, equatorial perspective approaches dropping W. The maximum allowed distance is 100; this finite value is still perspective, not exact orthographic projection. An aligned normalized tesseract has supporting facets at `w=±0.5`. Eye `d=0.6` is outside its positive-W facet and projects its front/back cubes with a size ratio of 11, a Schlegel configuration up to a uniform image scale. Consequently the core permits distances below one. Restricting distance to values above the circumsphere radius would exclude this useful case.

## API and bounds

```js
import {
  perspective4DSettings,
  perspectivePoint4D,
  perspectiveSegment4D,
  perspectiveTriangle4D,
} from '../ui/perspective4d.mjs';

const options = {distance: 0.6, near: 0.08, scale: 'equatorial'};
const point = perspectivePoint4D(displayPoint4D, options);
const edge = perspectiveSegment4D(displayA4D, displayB4D, options);
const surface = perspectiveTriangle4D(displayTriangle4D, options);
```

Defaults are **distance 3, near distance 0.08, equatorial scale**, preserving the existing point projection formula and its clipping threshold. Distance must be finite and in `(0,100]`; near distance must be finite and in `(0,distance)`. Points require exactly four finite coordinates. Invalid settings or malformed points throw explicit errors; no expression/code evaluation occurs.

The near distance measures `depth=d-w`, in normalized 4D display coordinates, not projected 3D or screen units. Points with `depth<near` are clipped. The near boundary is `w=d-near`; finite boundary intersections are retained. For a normalized source contained in the unit ball, `d>=1+near` ensures no source point is behind the near plane under any proper 4D rotation. Closer distances require actual clipping checks; they are supported without an automatic convexity or interior claim.

Each projected XYZ component also has an absolute finite bound of 1,000,000. A caller may lower `maxCoordinate`, but cannot raise it beyond that ceiling. Unsafe arithmetic or coordinate bounds omit the affected point/complete projected primitive with a diagnostic. The core does not clamp coordinates into a false drawable shape or fabricate an unresolved edge crossing. Per-call work is constant: one point, at most one segment, or at most two surface triangles. The viewport adapter additionally caps visible edge traversal/output at 100,000 each, source triangle traversal at 125,000, and clipped surface output at 250,000 triangles. When a source patch would exceed the remaining output budget, that complete patch and subsequent patches are omitted with an explicit diagnostic. Earlier source face-fill and presentation budgets also apply; these limits are responsiveness bounds, not a complete-model guarantee.

## Near-plane source clipping

Source segments are clipped in 4D before projection. A crossing retains the original source-edge parameters `t0/t1`, finite projected endpoints, corresponding fresh four-component points, and boundary flags. Entirely omitted segments return no projected bridge. Partial omission is explicit in `clipped` and `diagnostics`.

Filled source triangles are clipped against that same 4D halfspace, yielding zero to four polygon vertices and at most two projected triangles. Each triangle carries fresh projected `points`, `points4`, original-triangle `barycentrics`, and `nearBoundary` flags. The caller retains the source face/cell ID on both resulting triangles. New clipping points are virtual rendering points, not additional source vertices, edges, cycles or cells.

Boundary intersections use scaled signed-distance ratios to avoid overflow. An intersection whose original parameter cannot resolve the near plane within `1e-12 * max(1, abs(nearPlaneW))` is explicitly omitted. Consecutive boundary references equal within `1e-14` barycentric coordinates are deduplicated. A source triangle reduced to only a tangent point or edge is not returned as a filled face patch. These are float64 numerical conventions, not exact arithmetic guarantees.

The renderer uses the same actual eye `[0,0,0,d]` for observer-facing classification. Cached supporting planes remain source-bound, while changing distance recomputes their signed distances without another native plane job. Source manual cell masks and independent cell shrink retain their existing semantics. Stereo retains its separate S3 pole observer at W=1.

`ui/viewer-perspective.mjs` applies the saved frame and six angles once, clips normalized source edges and virtual or indexed face triangles, and carries source edge/face/cell IDs into the displayed pieces. Source-point arrays retain their original length and IDs; virtual near intersections produce no source spheres. Cylinders and line picks use actual finite retained segments. Face/cell ray picks and RGBA use actual clipped patches and original source references. Switching to ordinary orthographic or stereographic projection restores those modes' independent geometry paths. The optional third argument to `project(point, mode, options)` passes perspective settings; the old two-argument calls preserve their exact default results.

Fit includes retained projected edge and surface points that may extend far beyond all visible original vertices. The later 3D observer camera keeps its existing near depth 0.01. Its far plane is at least 1,000 and grows conservatively from the visible geometry's cached bounding center/radius and current observer position. Orbit updates require constant work from that cache. No additional far-plane field is serialized; restoring the saved camera recomputes it from current displayed geometry. Hidden/clipped source point and highlight positions use a finite Float32 sentinel outside this cloud. Large finite float geometry and an expanded depth range remain numerical display conventions, not exact depth precision guarantees.

## Verification and current limits

`tests/perspective4d.test.mjs` has thirteen independent fixtures: exact existing-default compatibility, equatorial invariance and alternative scale, literal eye-line intersection, depth size ratios and the distant-eye limit, a normalized tesseract Schlegel configuration and compatible source-plane facing, frame/angle ordering with virtual points, source segment parameters, absent near-plane bridges, clipped triangle area and barycentric reconstruction, tangencies, boundary roundoff, malformed settings/code strings, and finite-precision/coordinate-bound omission.

All thirteen core fixtures passed. `tests/viewer-perspective.test.mjs` adds nine actual renderer cases: exact legacy call compatibility, retained edge references and cylinder matrices, clipped-quad barycentrics/source RGBA/picking, frame-and-angle application to virtual points, actual-eye facing/manual masks/shrink, geometry cache and projection switching, whole-source-patch omission under resource caps, fit beyond original vertices, and extreme close-eye fit/restore/orbit with finite output bounded at 1,000,000. The relevant combined Node run passed 97 tests; the subsequent cached orbit-bound change passed its focused 29 renderer/camera/picking regressions, and the root feature suite passed after integration.

`scripts/perspective4d-smoke.cjs` supports an isolated development profile and `POLYTOPE_TEST_EXECUTABLE` for a packaged executable. The actual 0.12 development run passed seven UI groups with zero page errors: legacy tesseract coordinates, the independent Schlegel size ratio 11 and dynamic facing from one native job, clipped edge/quad pixels and source picks, three GPU cylinders/seven source spheres, changed near-plane endpoint and absent former segment picks, native save/reopen with unchanged source geometry, and rejected distance/near bounds. Evidence is `artifacts/perspective4d-smoke-7FgY2p/result.json` with three screenshots. Front/back Schlegel edge samples had luminance approximately 172; retained edge/quad samples approximately 119.67 and the absent origin approximately 25.67. No packaged 0.12 run or external installed baseline is claimed by this evidence.
