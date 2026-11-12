# R9 vertex-figure search fix

The first search in `vertex-figure-scaliform-mounted.test.mjs` exceeded its
unchanged 20-second state wait. The native search eagerly built and sliced all
37 candidates, including expensive F4/H4 hulls, before checking figure counts.
The loop predates R7 (baseline `2d18847`); `a75b3f6` (r7-vf, Codex worker)
introduced the mounted test and made this 37-candidate domain the UI default.

Search now rejects incompatible vertex counts before geometry construction.
A local convex vertex figure has one vertex per incident source edge. Regular
and Tuta degrees are fixed; chain Wythoff degrees sum the unringed stabilizer
orbits of ringed-mirror edges. The orbit sizes use the existing finite parabolic
group orders. Tests compare this filter with all 37 independently constructed
edge degrees and sliced figures. The five-vertex search builds four candidates
instead of 37 (a cold direct search measured 0.57 seconds).

UI: **Construct > 4D from vertex figure** (`vertex-figure-construction-settings`),
**Find matching constructions** (`vertex-figure-search`), domain
`vertex-figure-domain`, candidate `vertex-figure-candidate`, and **Construct 4D
polychoron** (`construct-from-vertex-figure`). Tuta promotion, numerical edge
length expressions, Undo/Redo, native save/reopen, replay and branching all
remain covered by the original mounted test without test edits or larger waits.

The full 37-item domain remains in the evidence. Counts reject only; surviving
candidates still require the complete similarity, metric and incidence checks.
Float64 residuals, tolerance `8e-8`, ambiguity and finite-domain limitations are
unchanged. This filter covers only the registered regular/Tuta and chain
A4/B4/F4/H4 candidates; new domains need their own validated degree rule.

Verification:

```
node --test tests/vertex-figure-scaliform-mounted.test.mjs
node --test tests/vertex-figure-construction-controls.test.mjs tests/vertex-figure-scaliform-mounted.test.mjs
python -m pytest tests/test_vertex_figure_construction.py tests/test_vertex_figure_scaliform.py -q -p no:cacheprovider
python -m pytest tests/test_conformance_inventory.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```

The conformance scenario uses the new focused `ui-r9-vf` receipt and raw report;
the failed R8 suite and its source bindings remain historical records. Other R8
receipts require full refresh after integration. Electron was not launched.

Results: isolated mounted test **1 passed**, controls **6 passed**, native
vertex-figure selection **53 passed plus 10 subtests**, conformance inventory
**306 passed**, Vite build passed with existing warnings. One combined Node
repeat timed out at the later tetrahedral search; its raw failure is preserved
in `ui-r9-vf-initial.xml`. A subsequent instrumented mounted run passed in
19 seconds (that native search took 2.9 seconds), and the unchanged isolated
test passed again in 73 seconds. Host/browser scheduling remains variable;
these results do not claim a green full concurrent suite.
