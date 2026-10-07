# Literal rational antiprisms and closed-shell prisms

These kernels and the dedicated source controller are ready for a future
application release. They have not been qualified in the frozen 0.13 desktop
build. Native dispatch, generator integration, history versions and packaged
GUI checks are separate integration work.

## Antiprism kernel

```python
from engine.antiprisms import rational_antiprism

ordinary = rational_antiprism(symbol='5/2', radius=1)
crossed = rational_antiprism(symbol='5/3', base_edge=1)
custom = rational_antiprism(6, -2, radius=1, height=2)
```

Provide a literal polygon `symbol`, or integer `n` and optional `d`; mixing
them is rejected. Counts and raw signed steps follow the existing regular
star-polygon API: `3 <= n <= 1024`, `0 < abs(d) < n`, with half-turn digons
excluded. Common factors are retained. Negative steps are this application's
explicit orientation convention, rather than a claim about Stella's parser.

The [official antiprism manual](https://software3d.com/Manual/Antiprism.php)
supports independent base edge/radius and height/side-edge sizing. The
[official 4D menu](https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro)
identifies retrograde `5/3` for crossed antiprisms and defines an antiduoprism
as a 4D prism over a 3D antiprism. Our direct coordinate contract is:

```text
L_i = [r cos(2pi*i/n), r sin(2pi*i/n), -h/2]
U_i = [r cos(2pi*i/n + theta), r sin(2pi*i/n + theta), +h/2]
theta = pi*d/n, using the original signed d
triangles = [L_i,L_(i+d),U_i], [U_i,L_(i+d),U_(i+d)]
```

Indices in the triangles wrap modulo `n`; the half-step angle is never replaced
with a principal or reduced step. Lower caps reverse the literal source cycles;
upper caps retain them. Replacing `5/3` by principal `-2` before computing the
angle would erase its crossed attachment. At unit radius, equal-triangle `5/2`
has height `5^(1/4)`, while `5/3` has height `1`. Signed counterparts reflect
the corresponding geometry while preserving their original symbols.

Choose `radius` or `base_edge`, with a default unit radius. Choose `height` or
`side_edge`. If both elevation arguments are omitted, the kernel requests
equilateral connecting triangles. With `q` the horizontal side chord:

```text
base edge = 2r abs(sin(pi*d/n))
q = 2r abs(sin(pi*d/(2n)))
side edge = hypot(q,h)
h from side edge L = L sqrt((1-q/L)(1+q/L))
```

The equal-triangle default exists only when `3*abs(d) < 2*n`. The exact integer
inequality rejects flat or imaginary defaults; an explicit positive height or
feasible side edge can still produce a generalized nonuniform model. Side-edge
feasibility requires `L-q > 4*max(ulp(L),ulp(q))`, avoiding a fabricated height
from rounded `sin(pi/6)`. Relative rank, face planarity and edge metrics are
then checked at the existing float64 tolerance. Positive scalar inputs and
computed radius/height are bounded to `1e100`; unresolved scales are diagnosed.
Huge integer inputs raise `GeometryError`, rather than leaking overflow errors.

There are `2n` vertices, `4n` edges and `2n+2g` faces, where
`g = gcd(n,abs(d))`. `6/2` therefore retains two separate octahedral boundaries,
with totals `12/24/16`. Crossings and coordinate coincidences do not weld IDs.

Optional `cap_colors` supplies one OFF RGB/RGBA record or null per source cycle.
Both caps retain that record and all channels; connecting triangles are
explicitly uncolored. Full literal source geometry, cycles, maps, source IDs,
geometry fingerprints and complete snapshot hashes are preserved. Output
partitions cover every current incidence once, but remain metadata-only:
existing compound Keep/Delete does not accept their partition IDs. Equality
evidence for triangle edges does not assert global uniformity, convexity,
exact coordinates or a filled star volume.

## Closed 3D shell times interval

```python
from engine.prisms import polyhedron_prism

antiduoprism = polyhedron_prism(rational_antiprism(symbol='5/3'), height=1)
```

`polyhedron_prism(source, height=1)` requires intrinsic 3D boundary geometry
embedded in three coordinates, without existing 3D cells. Every edge has two
face incidences and every vertex has one connected closed link. Legitimate
edge-subdivision vertices are retained, including their two-edge links.
Disconnected shells must have disjoint source incidence. Open boundaries,
wire/point leftovers, disconnected vertex fans, zero-length edges and unresolved
rank are rejected.

Vertices are copied into two endpoint layers with interval coordinates
`-height/2` and `+height/2`. Edges and face cycles are copied literally; one
interval edge joins each vertex, and each source edge makes a quadrilateral
wall. Every connected source shell supplies two complete cap cells. Each
source face supplies a side cell containing its endpoint faces and every
boundary-edge wall. For `g` closed shells, counts are:

```text
2V vertices, 2E+V edges, 2F+E faces, F+2g cells
```

Cube times interval has the full tesseract incidence `16/32/24/8`. A triangular
antiprism times interval has `12/30/28/10`; literal `6/2` antiprism times interval
has two octahedral-prism partitions with `24/60/56/20`. Every output ridge has
two cells, and every cell edge has two faces. Source RGBA follows both copies
of its face; wall faces and cells are uncolored. The complete source, caches
included as historical attributes, remains immutable. Output caches do not
inherit measures, convex support planes or exact certificates.

Closed higher-genus and star boundaries are formal generalized cap cells.
Their whole ordered source boundary is retained, with explicit Euler warnings
when it is not a convex ball boundary. No solid or union volume is inferred.
The source and output incidence maps and snapshots survive native project
validation. Current partitions are metadata-only, as in the antiprism kernel.

The prism limit is 4,000 output vertices, 100,000 entries per incidence array,
1,000,000 coordinate/incidence references, 2,048 vertices per face, 1,024 shells
and a 64 MiB payload including preserved source and maps. Antiprism construction
uses the same resource classes and the regular polygon numerator bound.

## Future controller integration

`AntiprismControls(context)` inserts a closed Construct disclosure after
`#product-settings`. It preserves the literal symbol string, evaluates numeric
expressions separately and only exposes an elevation value for Height or Side
edge length. Equilateral triangles omits both numeric elevation fields.

The context supplies `guard`, `number`, `getState`, optional `isExporting`,
`generate(kind,params)` and `commit(op,params,label)`. Generator kinds are
`rational-antiprism` and `antiduoprism`; the latter includes `interval_height`.
The current-source action commits `polyhedron-prism` with `{height}` and is
enabled only for a 3D model embedded in three coordinates. Native boundary
checks remain authoritative. Export guards run before and after every numeric
evaluation; busy, cancellation and changed active source/state prevent stale
construction callbacks.

The native kernel tests use independent octahedron Gram/face fixtures, complete
axis-derived tesseract incidence, signed/raw phases, literal disconnected
boundaries, colors, source maps, refined edge incidence, maximum-size cases,
strict refusals and native project roundtrips. The controller tests exercise
actual action methods with isolated context stubs. These tests do not establish
desktop integration or full Stella construction parity.
