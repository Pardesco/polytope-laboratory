# Finite-view stereographic clipping: declared-domain plan

Status: development reference only. The current runtime and frozen viewport integration candidate are unchanged. Current exact capture must continue refusing unresolved/pole-omitted jobs. There is no browser, GPU, FPS, whole-surface pixel-error, or complete dense capture claim here.

## Current pipeline and exact pullback

The renderer centers and normalizes the source, applies the saved SO(4) display frame and six-angle rotations once, and supplies posed raw four-vectors. A source fill triangle is an affine parameter domain:

`p(u,v) = (1-u-v)*a + u*b + v*c`, with `u,v >= 0`, `u+v <= 1`.

Writing `rho = ||p||`, `x = p.xyz`, `w = p.w`, radial normalization followed by north-pole stereographic projection gives

`r = x/(rho-w)`.

The origin and positive W ray are singular. For every other source parameter point, `D = rho-w > 0`. The source triangle's spherical image is the radially normalized affine patch, rather than a planar triangle joining its projected corners.

Every actual 3D observer frustum boundary is a plane `n·r+c >= 0`. Its exact pullback, for `D>0`, is

`F(p) = n·x + c*(rho-w) >= 0`.

This test includes near and far as well as all four side planes. It does not require division by a small denominator or a fixed stereographic pole radius. A whole affine patch may be excluded only when one plane's upper bound is strictly negative, or a separately verified combined-frustum exclusion proves the entire valid patch outside.

For camera eye E and orthonormal right R, up U, forward V, depth is `d = V·(r-E)`. Near/far require `near <= d <= far`. Orthographic bounds are `|R·(r-E)| <= halfHeight*aspect/zoom`, `|U·(r-E)| <= halfHeight/zoom`. Perspective bounds are `|R·(r-E)| <= d*tan(fovY/2)*aspect/zoom`, `|U·(r-E)| <= d*tan(fovY/2)/zoom`. The current Viewer uses 38-degree perspective field of view, near 0.01, dynamically enlarged finite far, and an adjustable orthographic half-height/zoom. A captured job must bind the actual matrices/extents/near/far, not assumed defaults.

The prototype constructs the six declared binary64 planes from these values. Its certificate is for those exact declared numerical halfspaces. Matching Three.js's actual projection/view matrix and its Float32 shader evaluation requires a separate matrix-derived plane adapter and raster-boundary error allowance; the prototype does not claim those are already identical.

## Why the existing pole cutoff cannot establish visible coverage

The current `1-w/rho < 0.02` exclusion corresponds to projected radius above `sqrt(99)`, approximately 9.95. That radius is unrelated to the actual camera frustum. A pole-adjacent raw vector `(0,0,0.01,1)` projects close to `(0,0,200)`. An orthographic observer at `(0,0,250)` looking toward negative Z sees it at the image center, within a finite near/far range. Nearby triangle points also remain visible. A perspective observer can likewise see this centered region. The reference tests certify such a whole patch inside the declared frustum; excluding it by radius would create a visible hole.

A finite frustum does have a finite enclosing ball. In an exact orthonormal camera frame, conservative radii about the world origin are `||E|| + sqrt(hx^2+hy^2+far^2)` for orthographic and `||E|| + far*sqrt(1+tx^2+ty^2)` for perspective. A *verified* such radius R can safely exclude `|r| > R`; equivalently it can exclude a much smaller north cap with `s.w > (R^2-1)/(R^2+1)`. This is a useful future optimization, not the existing fixed radius cutoff. Actual rounded matrix/plane conditioning and outward numerical bounds must be verified before mounting that shortcut.

## Implemented bounded reference

`development/finite-view-stereographic-clipping.mjs` exports:

- `declareFiniteFrustum(camera)`: immutable declaration of six observer halfspaces.
- `classifyFinitePatch(rawTriangle, frustum, optionalVertexBounds)`: `inside`, `outside`, or `unresolved`, with whole-domain interval bounds and the excluding plane.
- `classifyFiniteSourceGrid(triangles, frustum, options)`: a uniform dyadic classification reference retaining explicit presentation corner identities, source triangle/face/cell owners, full source parameter area, and unresolved cells.
- `projectWithoutPoleCutoff(p)`: a diagnostic regular-point projection without the runtime epsilon cutoff; positive-W denominator cancellation is avoided using the equivalent transverse-squared expression.

For each whole patch, affine linear extrema are enclosed at its vertices. Norm lower bounds use the raw coordinate-box distance from the origin, and norm upper bounds use convexity and vertex norm maxima. Interval addition and multiplication round outward using adjacent binary64 values. Square-root endpoints are checked by exact BigInt comparisons of binary64 dyadic squares, so a presumed libm error bound is not the proof. Subdivision carries outward raw-coordinate intervals: rounded midpoint samples alone would not enclose the exact original affine subdomain.

The proof relies on JavaScript's binary64 basic arithmetic semantics and exact BigInt operations. It refuses overflow or an unusable square-root seed. It is a conservative analytic interval exclusion, not an empirical midpoint visibility test. Dense barycentric test sampling is an independent regression witness in addition to the interval derivation.

Origin/pole validity is deliberately conservative: a definite-sign transverse coordinate, or a wholly negative W range with positive radius lower bound, proves every point regular. If that proof fails, the patch stays unresolved. It does not infer absence of a singular point from only corners or midpoint samples. Strictly negative plane upper bounds are required for exclusion; tangent/uncertain boundaries stay unresolved.

The uniform grid uses shared midpoint identity on explicit source/presentation edges, including reversed winding. Coincident independent instances retain distinct namespaced corner IDs. No coordinates are welded. Input limits are 4,320 full source triangles, depth at most 8, at most 65,536 leaf cells and 393,216 plane checks. Full-source preflight refuses a request exceeding its caller leaf/check budget; no source prefix is returned. A 384-byte-per-leaf logical payload estimate is capped at 32 MiB; this is **not** a measurement or bound on JavaScript object heap overhead. Cancellation/staleness is checked at entry, periodically during synchronous traversal, and before returning. There is no event-loop yielding or cross-realm publication bridge.

Each leaf has exact dyadic parameter area `4^-depth`, with per-source inside/outside/unresolved sum one. This is source parameter area, not projected pixel area. `completeClassification` means no uncertain classification cells; `completeVisibleCapture` is always false because the reference does not construct or qualify a rendered clipped surface.

## Independent evidence

Run headlessly:

```powershell
node --test development/test-finite-view-stereographic-clipping.mjs
```

Ten tests passed on Windows x64 Node 22.21.0. They cover independently computed orthographic/perspective inequalities; visible centered huge-radius north-adjacent patches; whole side-frustum exclusion; pole/origin/tangent refusal; more than 150 whole-patch certificates checked against dense independent barycentric samples; reversed shared-edge leaf intervals; coincident instance separation and inconsistent alias refusal; full-source caps/cancel; rotated observer coordinates; and extreme source scales. The literal source and frustum inputs remain unchanged.

## Production integration batches and remaining blockers

1. **Bind actual view domain.** Read actual observer view/projection matrices after fit/orbit/resize; derive normalized six planes with outward Float32/raster margin. Bind camera matrices, far, viewport, source/pose recipe, and clipping policy in frame/job identity. Observer changes must invalidate finite-view preparation even when the 4D pose is unchanged. Fixed full-source capture and explicit finite-view capture need distinct declared semantics.

2. **Verified early exclusions.** Mount whole-patch interval tests and, if useful, an independently verified frustum-enclosing-ball bound. Excluded patches must carry source-owner counts and numerical certificates. Definite full-frustum exclusions can reduce near-pole work; uncertain or singular patches must continue to refine or refuse. Existing quality/depth/cap failures cannot be relabeled clipping.

3. **Shared curved cut construction.** In triangle barycentric coordinates, each boundary is `L(u,v)+c*sqrt(Q(u,v))=0`. Squaring gives the conic `L^2-c^2*Q=0`, but the original unsquared sign condition is essential: squaring introduces false branches. Shared source-edge intersections are quadratic-root isolation problems; roots need deterministic namespace/edge/plane IDs, verified intervals, multiplicity/tangent handling, and canonical reversed-edge parameters. Source face/cell ownership must persist through every new cut vertex. A straight raw cut segment is generally not the exact curved conic boundary.

4. **Conforming retained-domain mesh.** Clip a common source-parameter refinement using those certified boundaries, or retain conservative whole leaves with explicit unresolved bands until the requested criterion is met. Every neighbour must use identical boundary samples; no T-junctions, bridge across the pole, coordinate welding, or component-wide discard. Analytic stereographic normals remain `normalize(n.xyz+n.w*r)` for the source patch span normal, with existing winding orientation; cuts do not smooth unrelated source faces. RGBA must remain face/cell-instance owned.

5. **Coverage and capture qualification.** Independently prove that every regular source parameter point projecting into the declared finite frustum is represented by retained geometry or a rigorously bounded raster approximation. The present sampled tessellation error is not such a whole-surface proof. Tangencies, arbitrarily narrow visible intersections, origin-containing triangles, overlapping fragments, depth/transparency, shader clipping margins, and cap-exhausted uncertainty must remain explicit. Only then can a declared finite-view result be complete; full-source unbounded-image capture must retain its original refusal semantics.

6. **Runtime ownership and evidence.** Preserve typed provenance, all per-source resolution slots, cancel/source/frame/generation fences, exact capture awaiting, and stale held-worker rejection. Add independent actual tesseract/600/120 poses, shrink/explosion/virtual fill namespaces, full face RGBA, seam/normal pixel tests, observer changes, edge/sphere/cylinder frustum clipping, and packaged capture evidence. No implementation should promise dense browser frame rate from this classification reference.

The main mathematical blocker is not whether a finite camera can clip infinity: it can. It is constructing and numerically validating the complete *curved visible source domain*, with shared boundaries and a declared approximation guarantee, without silently omitting uncertain visible bands. The current prototype establishes conservative whole-patch exclusion and a shared reference partition toward that work; it does not close that blocker.
