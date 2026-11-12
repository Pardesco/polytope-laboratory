# Verification receipt — 2026-11-09

Inspected worktree HEAD: `582c0015f4baa5a8a567a06523c8a664061825f2`.
The earlier gap audit used `01c5d22e104a0f2c89ea42ce1241427f883a0a2d`;
the inventory records both instead of attributing current code to the older audit.

## Executed checks

The final focused Python selection passed **340 tests**: **223 inventory
validation checks** and **117 existing native checks**. Fixture selectors were
also checked against Python syntax trees, including `Class::method` selectors.

```powershell
python -m pytest tests/test_conformance_inventory.py tests/test_rational.py tests/test_condition_fitting.py tests/test_stellation.py tests/test_step_prisms.py tests/test_off_compatibility.py tests/test_export_context.py tests/test_net_tabs.py tests/test_nets.py tests/test_incidence_truncation.py tests/test_kernel.py::test_analytic_contents tests/test_kernel.py::test_section_events tests/test_cell_nets.py::test_cell_cut_retains_placement_and_rigid_component_move_rejoins tests/test_automatic_faceting.py::test_tetrahedral_candidates_and_exhausted_unrestricted_search_are_independent tests/test_automatic_faceting.py::test_cube_candidate_count_includes_diagonal_planes_and_crossed_square_cycles -q -p no:cacheprovider
```

Existing Node suites passed **21 tests**. The mounted interchange suite used
its ordinary browser test infrastructure; Electron was not launched.

```powershell
node --test tests/engine-op-allowlist.test.cjs tests/material-styles.test.mjs tests/interchange-mounted.test.mjs tests/net-tab-controls.test.mjs
```

Production renderer build passed (**351 modules**). Existing mixed static/dynamic
Viewer import and large-chunk warnings remain. Node emitted its existing
typeless ES-module warnings. No dependencies or package scripts were changed.

```powershell
npx.cmd vite build --configLoader native
```

The installed 5.4 manual's SHA256 was independently recomputed as
`9cda8b03212946417655ce2d95a5ffece4904b83e4c9f8b936434dbf0050e49c`, matching
the existing static report. Relevant named anchors were inspected read-only.
The executable's version/hash comes from that prior report; no new executable
inspection or operation run is implied. Public-source availability and version
caveats are recorded in `sources.json` and `INDEX.md`.

## Evidence limits

These checks establish inventory consistency and the bounded behavior exercised
by the listed suites. They do not execute all 139 scenario parameter combinations
or turn related fixtures into independent oracles. Every benchmark result remains
unverified; no Stella operation comparison, shipped Electron qualification,
GPU/material equivalence, printer calibration or full option cross-product was
performed. Native residuals/qualification limits remain the mathematical contract.

New files are documentation plus one Python inventory-validation test. No app,
engine, IPC, history, UI, timeline/tour/animation, package version, shared script
or canonical ledger file was changed. No commit was made.
