# R8 verification receipt

Inspected HEAD: `c547b8f` (full commit in `inventory.json`). Work began in the
2026-11-09 local session; the final native run ended **2026-11-10 00:43 UTC**,
still November 9 in America/New_York. The date in the preceding November 10
gap-audit filename is not an executed future-release claim.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Inventory validator pytest | **306 passed**, 3.75 s | Original 223 R5 checks plus 83 additive R8 checks; frozen bytes, all 73 IDs, selectors, source/report integrity, incomplete observations and negative mutations |
| Offline validator CLI | **Passed** | 139 historical + 54 successor scenarios; 73 requirements; three execution receipts |
| Focused existing native selection | **585 passed**, 2,915.60 s | Actual parameterized pytest nodes in `native.xml`; exact 114-argument command and before/after source pins in `receipts.json` |
| Existing Node selection | **148 passed, 6 failed, 0 skipped leaf checks** | `ui.xml`; 154 JUnit leaf records; two passing parent suites excluded from leaf counts |
| Vite production build | **Passed**, 376 modules, 16.87 s | `npx.cmd vite build --configLoader native`; raw output in `build.txt` |
| Whitespace / ownership | **Passed** | Tracked diff check; only the existing inventory test is modified, with new documentation/validator/receipts; runtime and both ledgers untouched |

The Node selection is **not green**. Exact failing selectors and messages are
retained in the raw report. The failures concern:

- Classification Library workflow: navigation exceeded 30 seconds.
- Face-surgery workflow: a 20-second state wait expired.
- Component-fitting workflow: a 20-second state wait expired.
- Legacy History workflow: navigation exceeded 15 seconds.
- Symmetry evidence summary: a 20-second state wait expired, also observed on
  both earlier attempts.
- Tuta completion workflow: a 20-second state wait expired.

All **15** successor scenarios linked to these failures are explicitly
`inventory-only`, `evidence_status:incomplete`, with each failing fixture's
`observed_status:failed`. Their native passes do not substitute for mounted UI
success. No application fix, test deletion, softened assertion or increased
timeout was made. Passing selectors elsewhere in this failed suite remain
separate bounded observations. The two R5 implementation-gap closures,
`stel-01-arbitrary-planes` and `stel-04-editor-subgroups`, and the new controlled
memory scenario use passing native and mounted UI selectors.

## Preserved earlier attempts

| Raw report | Actual leaf outcomes | Scope |
| --- | --- | --- |
| `native-initial.xml` | 584 passed, 1 failed | Batch CLI resume exceeded its existing 20-second subprocess timeout; the complete subsequent native rerun passed |
| `ui-initial.xml` | 154 passed, 3 failed | Faceting cancellation proof, H3 dodecahedron startup and symmetry summary timeouts |
| `ui-retry.xml` | 156 passed, 1 failed | Cancellation and H3 passed; symmetry summary still timed out |

These failed-attempt records retain report hashes and explicit
`not-retained-for-failed-attempt` source-binding status. The old runner exited
before committing their source hashes. An interrupted native attempt produced
no completed report and contributes no claimed result. Earlier UI passes do
not erase the later failures.

## Source binding and recovery

The current native and build receipts record start/end times, commands, actual
results and source equality before/after execution. All three receipts bind
**2,228** files: application code, native catalog JSON/OFF assets, fixture bytes
and named test/contract/tooling files. Python reported **3.10.11**, Node
**v24.22.1**, and platform **Windows-10-10.0.26200-SP0**. These are source-test
environment strings, not installed-product or supported-hardware qualification.

The latest UI runner passed its before/after source-equality assertion, then
failed parsing Node's ANSI-colored JUnit failure text. The parser now strips
only terminal control sequences for XML interpretation; raw report bytes and
their hash remain unchanged. Tests verify both retained failures/raw bytes and
rejection of other malformed XML. The recovered UI source hashes match the
independently persisted native starting snapshot and build snapshot exactly.
Its exact start/end timestamps were lost by concurrent pending-receipt writes;
they remain **null**, with recovery time and explanation recorded. Its
environment was captured at recovery. No precise execution time was invented.
Reproduce receipt commands **sequentially**.

The validator checks actual selectors against source and raw results, including
pytest parameter expansions and Node parent suites. A failed child cannot
inherit a passing parent label. Failed fixtures cannot support scenario closure.
Source changes revoke current receipts; report/count mismatches are rejected.
These local integrity records are not signatures or independent human review.

## Reproduction

From the repository root, offline, without Electron:

```powershell
python -B docs/conformance/verify.py
python -B -m pytest tests/test_conformance_inventory.py -q -p no:cacheprovider
python -B docs/conformance/verify.py --run native
python -B docs/conformance/verify.py --run ui
python -B docs/conformance/verify.py --run build
```

`receipts.json` retains the complete native selection and Node file list. The
runner saves a pending source snapshot before execution. A failing test command
returns nonzero while retaining its report/result receipt; changed outcomes
require explicit scenario reconciliation, never automatic promotion.

The 67-fixture symmetry report and 117-row/nine-method morph matrix have their
own recorded-source semantics. Inventory/selected-fixture checks here do not
reexecute those entire qualification runners. No Stella operation comparison,
packaged Electron, installed frozen engine, clean VM/install/upgrade, physical
DPI/GPU/encoder, hardware printer or specialist/license review was performed.
Every benchmark status remains unverified and every packaged-platform status
not-run. Twenty broad IDs still have explicit remaining option-inventory tasks.

Vite retains the existing mixed static/dynamic Viewer import and large-chunk
warnings. There is no new Node test file or `test:features` registration, no
dependency/version bump, and no commit.
