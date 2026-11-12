# Via-snub: R5 mathematical contract

Status: **concrete canonical 3D domain for R6; no production method enabled**.
ANIM-02 remains open. No dispatch, UI, timeline, project schema, catalog or
allowlist changes belong to this package. The harness is
`engine/snub_morph_contract.py`; it accepts canonical parameters, not models.

## Baseline evidence, checked 2026-11-09

The [public morph manual](https://www.software3d.com/Manual/Morphing.php?prod=Stella4DPro)
describes base/dual endpoints, ratios and possible endpoint snaps, and illustrates
the existing methods. It does not define a via-snub trajectory. The developer's
[March 8, 2026 reply, available as a search-indexed primary-source excerpt](https://software3d.com/Forums/viewtopic.php?p=2891&sid=b476bacaae0e9cb34b78fbeb82561db2)
says “Via the snub would be cool too” and “Unlikely for next release.” Direct
retrieval of that forum page failed in this audit; treat the indexed excerpt as
limited evidence, not installed-app verification. The
[4D feature manual](https://www.software3d.com/Manual/Features4D.php?prod=Stella4DPro)
names expansion and tilting quads as supported 4D morphs. None of these sources
establishes a benchmark via-snub method, dimension matrix, or parameterization.
Do not remove the requirement on this evidence alone; the lead must reconcile
the frozen benchmark inventory with an installed version.

The local audit is correct: `engine/dual_morph.py::INVENTORY` and
`ui/dual-morph-session.mjs::MORPH_INVENTORY` contain `via-snub`; both supported
lists exclude it. Native preparation refuses it, including cube inputs. R6 is
an explicitly scoped geometric implementation, **not certified Stella parity**.

## Domain and parameter

First source domain: the centered, axis-aligned Euclidean cube with vertices
`(±a,±a,±a)`, `a>0`, full ordinary cube incidence, intrinsic/embedding dimension
3 and convex interpretation. The ordinary Library **Cube** is an example.
Use origin as reciprocation center and positive radius `r`. Its geometric polar
has the six vertices `±(r²/a)e_i`. A cube label alone is never eligibility proof.
Rotated/translated cubes, octahedron-as-source, other regular families,
nonconvex/generalized sources, compounds, off-center polarity, extrapolation
and 4D are outside this first contract.

For source-to-dual ratio `t` define

```
q = 1-t
h(t) = (1-t)a + t(r²/a)
seed(q) = (q²,q,1)
P(t) = h(t) conv{ R seed(q) : R is a proper signed permutation }
```

There are 24 determinant-`+1` signed permutation matrices. Orbit vertex IDs
enumerate lexicographic coordinate permutations, then signs from `(-1,+1)^3`,
retaining determinant `+1`. Form B negates X of every A coordinate and reverses
face winding; it preserves these IDs. A/B are coordinate conventions, never
absolute left/right labels. R6 can initially fix A without adding a hand field
to saved settings; it must not silently borrow another method's hand convention.

This is one connected convex polyhedron at each ratio, with a group-constrained
seed locus `y²=xz` in the positive chamber and fixed proper symmetry. It is not
an opacity crossfade, a compound of independently scaled endpoints, or a chosen
vertex-to-vertex straight interpolation. The support scale `h(t)` is a declared
positive size parameterization. Only its endpoint values are dictated by polarity.
There is no claim that `P(1-t)` is the polar of `P(t)`, or that the speed/trajectory
matches a competitor.

## Uniform snub event and catalog convention

The classic seed is given independently in Coxeter,
[Regular and Semi-Regular Polytopes II, p. 562, §2.1](https://roice3.org/ruen/Regular_and_Semi-Regular_Polytopes_II.pdf).
It is uniform at the unique root of
`f(q)=q³+q²+q-1` in `(0,1)`. The derivative is strictly positive there. The
fixture brackets that root with exact rationals; approximate values are
`q*=0.5436890126920764`, `t*=0.4563109873079236`. **Ratio 0.5 is not uniform.**

Before multiplication by `h`, the squared edge lengths are:

| Adjacent face classes | Number | Squared length |
| --- | ---: | --- |
| square / bridge triangle | 24 | `S=2q²(1+q²)` |
| diagonal triangle / bridge triangle | 24 | `D=2(1-q-q³+q⁴)` |
| bridge triangle / bridge triangle | 12 | `B=4q⁴+2(1-q)²` |

`D-S=-2f(q)` and `B-S=2(q-1)f(q)`, so all edges coincide at the interior root.
The six squares are regular throughout, and the 32 triangles are all equilateral
at that event. Divide by `sqrt(S)` for a unit-edge snub oracle.

Full coordinate-set **and ordered face-cycle** comparisons, with no rotation
fit, establish this crosswalk for the current assets:

| Harness form | Generated reference | Antiprism U12 representation |
| --- | --- | --- |
| A | `snub-cube` | `antiprism-u12-mirror` (reflected) |
| B | `snub-cube-mirror` | `antiprism-u12` (source) |

This is the convention handoff to the catalog owner: retain the catalog's
source-relative names; **do not equate generated A with U12 source**. The fixture
pins U12 source SHA-256
`608fe0a85d05b587213228d67397dae86548a5eb83c2bf689d03df21a84b7531`.
Changing a catalog orientation or asset requires rerunning the crosswalk.

## Topology and endpoints

| Ratio | V/E/F | Boundary and transition |
| --- | --- | --- |
| `0` | 8/12/6 | Literal source cube in production; three orbit vertices coalesce at each cube vertex. |
| `0<t<1` | 24/60/38 | Six squares, eight diagonal triangles, 24 bridge triangles; four triangles and one square at each vertex. |
| `t*` | 24/60/38 | Uniform snub cube; a metric event, no incidence change. |
| `1` | 6/12/8 | Literal geometric polar in production; four orbit vertices coalesce at each octahedron vertex. |

At the cube endpoint, squares survive, diagonal triangles become points, and
bridge triangles become edges. At the octahedron endpoint, diagonal triangles
survive, squares become points, and bridge triangles become edges. Remove
degenerate faces only at the exact endpoints, using the explicit quotient maps;
never weld an interior frame to a different topology.

The 24 interior vertices correspond to the cube's 24 `(vertex, incident face)`
corners: their cube quotient identifies the source vertex and their octahedron
quotient identifies the source face through polarity. These fixture indices are
not source IDs. R6 must remap them to actual supplied incidence, preserve literal
source/dual endpoint snapshots and record corner correspondence. New triangles
need declared ownership/color/content rules; do not pretend they are unchanged
source faces. Source notes, units, annotations and project/history ownership
continue through the existing prepared-source/session workflow.

## Independent oracle and numeric limits

`scripts/snub_morph_oracle.py` imports only the standard library. It exhausts
all rational supporting triples at `q=1/2`, reconstructs face cycles through
support intersections and emits `tests/fixtures/snub_morph_b3.json`. It does not
call the chamber solver, engine topology, NumPy, SciPy or Qhull. Additional exact
rational samples independently recover the same boundary.

The oracle also computes **integer polynomial** plane gaps: 120 on-face
incidences vanish identically, and 792 off-face gaps reduce to 27 distinct
polynomials. Each factors as `q^m(1-q)^n` times a polynomial with strictly
positive rational Bernstein coefficients. Thus all prescribed planes support
strictly throughout `(0,1)`. Oppositely oriented edge pairs, connectedness,
Euler characteristic 2 and one pentagonal link per vertex verify the complete
closed boundary. Together these establish the all-parameter incidence contract,
rather than inferring it from a uniform-looking frame.

That exact symbolic statement concerns this parameterized family only. Catalog
coordinates and harness frames remain binary64 approximations (`certified:false`).
Frames report normalized maximum planarity error, maximum supporting-plane
violation and minimum strict support gap. Overflows, vanished reciprocal support
and unresolved parameters refuse with a diagnostic; no hull repair is performed.

The mathematical interval is `[0,1]`. The current numerical harness accepts only
the two exact endpoint parameters and interiors `[0.001,0.999]`. It refuses the
open collars without snapping. At `t=0.9999`, existing hull reconstruction merges
nearly coplanar supports under its shared tolerance and fails incidence validation;
that was observed during qualification. The conservative collar passes unchanged
shared hull/validation checks. R6 must retain this refusal or independently qualify
a wider range; arbitrary animation/export sample times can land in a collar.

## R6 integration gate and verification

R6 must validate actual source coordinates and complete cube incidence, bind
literal endpoints and corner maps, retain residuals/refusals, and add its factory
through exclusive central dispatch/UI work. Then qualify settings save/reopen,
undo/replay where promotion changes the model, mapped content, stale/cancelled
publication and exact-time ratio animation/export. Until then this is a passing
mathematical scope gate only. No new op or UI control is installed.

Existing click path stays **Workspace → Dual morph**, `dual-morph-settings`,
`dual-morph-method` (via-snub unavailable), `dual-morph-apply`. The R5 harness is
deliberately callable from Python only.

Focused checks:

```
python -m pytest tests/test_snub_morph_contract.py tests/test_dual_morph_integration.py tests/test_reference_library.py -q -p no:cacheprovider
node --test tests/dual-morph-session.test.mjs tests/morph-animation.test.mjs tests/uniform-snub-variants.test.mjs tests/engine-op-allowlist.test.cjs
npx.cmd vite build --configLoader native
```

Verified on 2026-11-09: **96 Python tests and 22 subtests passed** (52 new
contract tests); **31 Node tests passed**; Vite production build passed.
The build retains its existing mixed-import/chunk-size warnings.

To reproduce the fixture without writing engine/catalog data, run
`python scripts/snub_morph_oracle.py` (JSON to stdout). The fixture-regeneration
test requires the complete emitted object to match. No Electron launch or
installed Stella trajectory comparison was attempted.
