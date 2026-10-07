# Step-prism construction

This future generator selects the ordered vertices `(i, step*i mod n)` from two ordinary equal-radius `n`-gons in orthogonal coordinate planes, then takes their convex hull. It follows the [Stella author's step-prism definition](https://www.software3d.com/Forums/viewtopic.php?p=1676); see also the [4D construction menu](https://www.software3d.com/Manual/Menu4D.php?prod=Stella4DPro).

For each original ID `i = 0, …, n−1`, the intrinsic source point is

```
radius * [cos(2πi/n), sin(2πi/n),
          cos(2π(step*i mod n)/n), sin(2π(step*i mod n)/n)]
```

The signed step is retained literally. A common factor with `n` does not remove source vertices: `6, 2` still has six vertices and a full-dimensional 4D hull. Changing the sign reflects the second coordinate plane. Rank-deficient choices such as step `1`, step `n−1`, or an even order's half-turn fail explicitly. The supported numeric domain is integer order `5…128`, integer step with `0 < abs(step) < n`, and finite radius `1e−70…1e70`.

`StepPrismControls` provides an isolated compact disclosure. Order and signed step use literal integer syntax; radius uses the existing equation evaluator. It calls `context.generate('step-prism', {n, step, radius})`. It preserves noncoprime and negative steps, disables inputs during expression/native work, checks export ownership around radius evaluation and immediately before generator invocation, and releases its busy state after refusal or cancellation. The generating context must also guard workspace/export ownership after its native await before adding the new document.

The module is not mounted in the 0.13 app, and the planned `generate(kind='step-prism', …)` dispatch is not registered there. Next-release integration should add the strict native generator branch, route the control callback through the guarded construction workflow, instantiate after available construction disclosures, and include its focused tests. The existing native kernel is `engine/step_prisms.py`; it keeps selected factor IDs, complete source coordinates, geometry fingerprint, original model ID and definition provenance.

Independent acceptance fixtures include the `5, 2` regular 4-simplex, `8, 3` regular cross-polytope, the `13, 2` / `13, 6` reflected factor-swap equivalence, and noncoprime `6, 2`, `8, 2`, `9, 3`, `12, 4`. The latter two retain larger nonsimplicial supporting cells. Project reopening must preserve all ordered source IDs and provenance; signed steps, rank refusal, both scale endpoints and cancellation must survive the native boundary.

All supporting predicates and topology are floating-point approximations. Rational polygon symbols, unequal factor radii, exact certificates and comparison against an installed competitor remain outside this qualified subset. Literal polygon products have separate source-incidence semantics and their own component ownership.
