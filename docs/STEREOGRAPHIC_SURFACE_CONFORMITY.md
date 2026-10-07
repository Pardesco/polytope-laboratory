# Stereographic shared surface boundaries

The 0.17 worker independently subdivided each original face-fill triangle.
Adjacent triangles could consequently use different dyadic samples along the
same curved edge. Their chord approximations left T-junction cracks even when
their analytic normals agreed. The independent rotated quad regression found
14 versus 12 diagonal segments; exploded instances had 48 unpaired interior
leaf edges. The new conforming path pairs those boundaries without smoothing
normals across different mathematical source faces.

## Mounted contract

`prepareStereographicWorkerGeometry({...options, conformingSurfaces:true})`
adds two owned optional `Uint32Array` inputs of length three times the source
triangle count: `triangleCornerIds` and `triangleSourceVertexIds`.

- Indexed triangles use explicit presentation vertex identities and cell
  domains. Explosion instances remain separate, including coincident instances.
- Shrunk triangles use their explicit `(source cell, source vertex)` lineage.
  Faces belonging to the same shrunk cell share corners; different cells do not.
- Coordinates are never used to discover identity or weld components.
- Virtual paint triangles use the fill producer's declared local
  `presentationCornerIds`, scoped by source face and presentation cell. These
  are display-only identities, never native vertex or incidence claims. Their
  source vertex ID is the `0xffffffff` sentinel. The real signed pentagram fills,
  both winding rules, shrink and translated entities are independently tested.
  A virtual triangle lacking declared lineage is omitted with a diagnostic and
  prohibits complete capture.

The protocol snapshots and transfers these inputs, checks consistent posed
coordinates, source identity and cell domain for every repeated corner, and
checks native source-face/cell membership before worker dispatch. Declared
virtual corners additionally require the same owning face; they skip native
vertex membership only, and still retain source-face/cell ownership. Normal source,
pose, generation, family, cancellation and capture fences remain in force.
Legacy preparations and descriptors lacking the optional fields retain the
previous numeric output. The actual Viewer explicitly enables the new path.

The surface worker uses shared red/green midpoint closure. It classifies safe
leaves with the existing adaptive sampled-error criterion and the conservative
floating-point pole cone guard. A refinement round is committed only when all
shared closure dependencies fit the budgets. On a stop, qualified leaves from
the last conforming mesh remain; unresolved leaves become explicit holes.
This retains neighbouring edge partitions, original winding, face/cell IDs,
analytic normals, picking ownership and colour precedence. Source vertices and
full-size curved source-edge projection retain their previous numeric pipeline.
The source span also supplies a conservative whole-sphere pole exclusion test.
Where it passes, repeated per-leaf cone/Gram solves are unnecessary. Shared
corner projections are cached, and the original chord/interior sampled criterion
is calculated directly. The numerical source-center refusal is preserved once
per original triangle, including adversarial unequal corner scales.

Conforming input defaults to 8,192 original triangles, with 100,000 mesh leaves,
one million classification visits, 500,000 cached samples, depth eight and 64
closure rounds. Caller reductions of `limits.inputTriangles` and the existing
triangle cap are honoured. An initial mesh exceeding its cap is refused as a
whole rather than silently truncating a source prefix. Fully registered 120-cell
shrink inputs contain 4,320 original triangles and fit the input bound.

These bounds govern a sampled approximation and a conservative excluded pole
region. They do not certify maximum whole-surface pixel error. Pole leaves and
unresolved/capped surface pieces prohibit a complete capture in this path.

## Evidence and limits

The new 14 worker tests, five criterion/equivalence tests, four independent indexed
surface-conformity tests and eight independent virtual tests pass. The focused
total is 138 tests including the existing geometry, normals, protocol, async
bridge, typed display and capture regressions. The independent
tests check complete shared interval partitions and every interior leaf edge,
rather than comparing vertex sets or the implementation to itself.
The criterion tests also compare entire actual tesseract fine and 600/120-cell
interaction results with the unchanged frozen selective prototype. An actual
capture coordinator test rejects a forged `complete:true` on an otherwise valid
conforming fully clipped response, while legacy diagnosed clipping remains
compatible.

`artifacts/conforming-production-headless-1791209142636.json` records one cold
Node computation per actual native fixture and tolerance. These timings include
input validation, edge projection, shared closure, typed packing and output
decode, and are neither browser timings nor FPS measurements.

| Source | Tolerance | Retained patches | Complete | Cold compute |
| --- | --- | ---: | --- | ---: |
| Tesseract | .032 | 2,685 | yes | 47 ms |
| Tesseract | .004 | 16,464 | yes | 197 ms |
| 600-cell | .032 | 28,110 | no | 483 ms |
| 600-cell | .004 | 65,860 | no | 637 ms |
| 120-cell | .032 | 16,938 | yes | 174 ms |
| 120-cell | .004 | 55,090 | no | 577 ms |

This observation follows pole/criterion caching and precedes the final
source-origin guard addition; it is not a controlled timing comparison with the
earlier cold profile. Geometry counts remain identical.

The numerical crack repair and actual development/packaged GPU regression now
pass; see [the 0.18 repair review](STEREOGRAPHIC_SURFACE_FIX_0.18.md). Continuous
dense-motion evidence must still be collected separately. Dense fine closure
remains expensive, and the existing partial publication/capture refusal is
essential. The synchronous Viewer fallback must use this same prepared worker
math and packed output rather than the legacy independent-triangle helper.
