# History compatibility and recovery

Workspace → History (`history-settings`) contains the existing snapshot list,
Replay (`history-replay`) and Parameters (`history-branch`). Check replay support
(`history-check-support`) reports availability in `history-support-status`.
These controls work with Expert mode off. Parameters opens
`history-parameters-dialog`; Create branch is `history-parameters-apply`.

Checking support validates the graph and checks the selected node's dependency
versions and numeric policy. It does **not** execute operations or certify a
successful replay: the native report always has `verified: false`. Unsupported
records disable replay/branch after checking, with a readable-snapshot message.
Selecting another history state checks a different dependency path; an unrelated
unsupported branch does not prevent replay of a supported ancestor.

## Supported files and version policy

| Record | Supported behavior |
| --- | --- |
| Native project schema 1, history schema 1 | Validate and open; save with the same schema. |
| Schema-1 documents predating operation graphs | Open all retained state snapshots; undo/redo remains available. Replay/parameter branch is unavailable. A new construction seeds source snapshots and records only the new operation. No missing recipe is invented. |
| Current registered operation versions | Available for replay, subject to actual execution, geometry and feature-specific content verification. |
| `polygon-prism/0.1.0` | Retain the legacy ordered-incidence implementation and generalized interpretation. Current `0.2.0` additionally finalizes construction ownership/convex classification. Replay and parameter branches explicitly request the recorded version. |
| `cell/0.1.0` | Retain the existing extraction kernel. `cell/0.2.0` is the source-owned 4D-cell adapter. Existing cell branches preserve their selected version. |
| Unknown operation, algorithm version or numeric policy in a valid graph | Open/save the validated snapshots and original graph unchanged. Replay and parameter branch of affected dependencies fail explicitly before executing operations. Ordinary editing from a snapshot remains possible; it does not make the unknown ancestor replayable. |
| Unknown project/history schema, invalid geometry, forged hashes or malformed associations | Reject. Do not guess a migration or write to the original file. |

`engine/history_migrations.py` is the explicit compatibility policy and retained
version registry. There are no automatic schema or algorithm upgrades. New
constructions use the current registered version; branching a retained prism or
cell keeps its version. A future migration needs its own named input/output
contract, immutable source graph and qualification fixtures before registration.
This package uses immutable-version retention instead of claiming that changed
algorithms are interchangeable. The schema gate in `engine/formats.py` is
unchanged; no validation hook or certificate behavior changed here.

Replay checks complete ordered coordinates/incidence and fingerprints. Existing
operation-specific adapters also verify their evidence/content contracts.
Annotation transfers require proven element correspondence; other content stays
in source-owned detached archives. A support report is not a promise that every
operation will succeed on every source domain or that all arbitrary model
metadata is compared. Float64 operations remain approximate, even when repeated
coordinates compare identically. This is not an exact mathematical certificate.

Graphs, versions, source hashes and source-bound annotation owners remain
literal. Legacy display defaults are added only to the independent renderer
document opened by replay/branch, as when opening a project; graph snapshots are
not rewritten. Replay/branch publication retains the existing source/content/
export guards and creates a new document, leaving the original graph intact.

## Backup and recovery

Save validates all states before staging a complete fsynced temporary file.
Desktop publication serializes writes to each destination, preserves the prior
complete file in `.bak`, and atomically replaces the destination. Failed native
validation changes neither the destination nor its backup.

File → Recover autosave uses the latest recovery project, falling back to the
previous recovery snapshot when configured and the latest is unreadable. The
warning explicitly says newer changes may be missing. Save the recovered project
to retain it. Recovery validates the same schemas, geometry and graph as Open;
it does not bypass compatibility checks or turn snapshots into replay success.

## Evidence and limits

`tests/fixtures/history/polygon-prism-0.1.polyproj` is a complete native project
produced by executing the retained `0.1.0` kernel, not a current result with its
version string edited. It contains a hand-specified Cartesian square, an actual
height-2 prism, source cap RGBA, units, notes and both graph/state associations.
Its vertices are analytically `(±1, ±1, ±1)` with 8 vertices, 12 edges and 6 faces.
It is a reconstructed legacy-kernel fixture generated on 2026-11-09, not an
archived user file or evidence of a historical installed build. Its generator is
alongside it; from the repository root run:

```powershell
$env:PYTHONPATH='.'
python tests/fixtures/history/generate_legacy_fixture.py
```

Focused native tests: `test_history_migrations.py`, `test_history.py`,
`test_recipes.py`, `test_element_content_workflow.py`, `test_cell_attributes.py`,
`test_basic_solids.py`, `test_products.py`. New cases check immutable old/current
branches, round-trip/replay, unsupported versions before specialized dispatch,
schema rejection without writes, and annotation owner preservation/refusal.

Node tests: `history-support.test.mjs`, `history-support-mounted.test.mjs`,
`history-recovery.test.cjs`, existing `history-workflow.test.mjs`,
`project-workflow.test.mjs`, `project-storage.test.cjs`,
`element-content-history.test.mjs`, `engine-op-allowlist.test.cjs`,
`engine-pool.test.cjs`. The mounted test runs Vite/Chromium with the real Python
JSON-lines engine, including partial legacy views and Expert mode off. Recovery
uses real native save/load and both replay branches; existing storage tests kill
writers at staging, backup and publication boundaries.

Vite builds are checked with `npx.cmd vite build --configLoader native`.
Electron is not launched in this sandbox. Real power-loss behavior, prior
installer upgrades and clean-machine/offline Windows qualification remain
R7-RELEASE work. This package does not claim a universal historical importer or
future schema migration support. The architecture's old statement that replay
is still missing should be refreshed by the lead/help owner.
