# Whole-edge stereographic bounds

`ui/stereographic-arc-bound.mjs` supplies an isolated conservative interval bound
for the existing raw normalized edge path. It is not yet the renderer's quality
criterion. The viewer/worker still use sampled subdivision, including caps and
explicitly partial results. No whole-triangle, GPU or raster error is certified.

For prepared binary64 endpoints a,b, the path is
p(t)=(1-t)a+t*b and f(t)=p.xyz/(||p||-p.w). Endpoints must already include the
existing SO(4) orientation and rotation once. This preserves the actual radial
source-edge path; it does not substitute a parametrized great-circle arc.

`boundStereographicArc({a,b,t0,t1,poleEpsilon,camera})` takes an orthographic or
perspective observer. Camera rows map world XYZ to camera x,y and positive depth
(the negative of Three's camera z); CSS scales are viewport width/height times
the corresponding projection-matrix diagonals divided by two. Constant principal
point offsets cancel from endpoint interpolation error. Actual camera extraction,
aspect and zoom are covered by headless Three camera fixtures.

Outward binary64 intervals enclose norm minima, normalized-W stationary extrema,
pole clearance, depth and second derivatives. For each pixel component the
linear endpoint interpolation error is at most
(t1-t0)^2 * sup(abs(second derivative))/8. Combining component upper bounds gives
a conservative whole-interval chord error. Analytic extrema cover pole excursions
between the old midpoint/quarter samples. Unresolved stationary coefficients fall
back to a whole-interval W/norm enclosure. Exact binary exponent scaling handles
normal and subnormal inputs; a coordinate lost during power-of-two normalization
is diagnosed instead of silently changed. Square-root enclosures are verified
by outward squares rather than assumed library accuracy.

The returned frozen detached evidence sets wholeEdgeIntervalBound only for a
bounded interval. Pole/depth intersections require subdivision or omission;
source-center edges and unresolved arithmetic receive no bound. It never claims
a successful tolerance check for an unresolved fragment.

The bound covers the mathematical path through supplied prepared binary64
coordinates. Packing endpoints to Float32 can add nonzero screen error even
when the exact chord bound is zero, and can move a safe endpoint through the
near plane. Targeted tests exhibit both failures. Endpoint quantization, GPU
matrix arithmetic, line rasterization and triangle patch error remain excluded.

26 focused tests and83 combined source/frame/quality/worker regressions passed.
Independent circle-sagitta, oblique/perspective dense samples, off-sample pole,
stationary uncertainty, extreme scale, camera matrix and Float32 examples are
included. These bounded fixtures do not qualify complete VIEW-02, large-model
performance or an installed Stella baseline. Integration needs explicit endpoint
and GPU error accounting, bounded work, retained source/pose ownership and
separate triangle-fill guarantees before changing the renderer's claims.
