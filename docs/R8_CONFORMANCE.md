# R8 conformance reconciliation

The [versioned successor](conformance/r8/inventory.json) adds **54 scenarios**
(23 R6 deltas and 31 library/morph/history/UI/tooling options) alongside the
unchanged **139-scenario R5 inventory**. All **73 broad requirement IDs** resolve
to scenarios or an explicit remaining inventory task; **20 IDs** still require
option-level inventory. Neither parity ledger is edited. No runtime, controls,
dependencies, operation registrations or package scripts change.

Inspected implementation: `c547b8f` (merged R7 desktop/media, H3 morph,
classification, Schwarz/Goursat, Tuta completion, symmetry and batch packages).
The report named `GAP_AUDIT_2026-11-10.md` was pinned before those R7 merges;
its queued work is not treated as evidence that the merged features are absent.
This successor was prepared in the **2026-11-09** session, not a future run.

Full **local implementation-gap** closures are specifically
`stel-01-arbitrary-planes` and `stel-04-editor-subgroups`. The new
`doc-02-r6-controlled-add-blend` scenario also closes its declared controlled
memory workflow. These are not entire requirement, competitor or release closures.
Every legacy link has an explicit disposition; see the [scenario index](conformance/r8/INDEX.md).

Other receipts are bounded tranches: rational pyritohedron instead of regular
dodecahedron; independently oriented star-cell sheets instead of a global solid;
congruent convex face/RGBA surgery; defined Z4/D4 Waterman conventions;
separated convex component fitting; rectangular strips with end setbacks;
memory relative scale; triangle/quad DXF boundary output; portable PNG
environments; and B3/H3 via-snub trajectories. Their remaining domains are
recorded individually. The R7 79/63/40 generation/relationship totals, the
67-fixture symmetry report and the 117-row morph matrix never become identity
or requirement promotions. Matrix/report inspection is distinguished from
fresh numerical execution.

Existing UI entry points are recorded per scenario, including labels/routes and
element IDs. Common examples: Construct > Stellate (`stellation-evaluate-arbitrary`,
`stellation-face-subgroup`); Library > Specialized relationships
(`classification-tranche`, `classification-verify`); Dock > More > Dual morph
(`dual-morph-method`, `dual-morph-apply`); Workspace > History
(`history-check-support`, `history-replay`, `history-branch`). No new control
was added. Fake-DOM controls are labeled UI unit evidence; actual Vite/Chromium
workflows are labeled mounted UI evidence, separately from packaged Electron.

The latest Node selection contains **148 passing and 6 failing leaf checks**;
15 linked scenarios explicitly retain incomplete UI evidence. Failures involve
classification, face surgery, fitting, history, Tuta and the symmetry summary.
Earlier passes and failures remain separate reports. These scenarios are
inventory-only despite their native implementation evidence; no timeout or
application validation was relaxed. The named stellation and controlled-memory
closures do not use these failed checks.

Validate/reproduce offline from the repository root:

```powershell
python -B docs/conformance/verify.py
python -B -m pytest tests/test_conformance_inventory.py -q -p no:cacheprovider
python -B docs/conformance/verify.py --run native
python -B docs/conformance/verify.py --run ui
python -B docs/conformance/verify.py --run build
```

The runner uses focused existing pytest nodes, existing Node suites and
`npx.cmd vite build --configLoader native`. It launches no Electron. The
[verification receipt](conformance/r8/VERIFICATION.md) records actual results;
raw reports and per-selector results are retained with before/after source
hashes. Reproduction updates only R8 receipts/reports, never the frozen R5
files. Inventory validation rejects missing/duplicate IDs, invented selectors,
stale sources, misleading closure claims and inconsistent report results.

Benchmark 6.0 output, shipped desktop/platform, physical DPI/GPU/encoders,
hardware printing, clean-machine install/upgrade, authoritative corpus roster
and specialist/license review remain **unverified**. No suite count satisfies
those obligations. Geometry remains numerical unless a scenario explicitly
names a narrower exact supplied-input predicate or lattice-membership property.
