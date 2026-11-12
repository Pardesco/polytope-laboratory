# R8 successor inventory

Start at [inventory.json](inventory.json). [R5](../inventory.json) and its
original [index](../INDEX.md)/[verification](../VERIFICATION.md) remain historical
evidence with byte hashes in `supersedes.sha256`; their old unsupported/access
labels are not assertions about the merged R7 code. New stable scenario IDs
link back through `closure.legacy_case_ids`, without mutating old records.

| File | Contract |
| --- | --- |
| `scenarios-r6.json` | 23 source/option-bounded R6 deltas, including cube via-snub |
| `scenarios-options.json` | 31 library, R7 morph, history, common UI and qualification-tooling options |
| `inventory.json` | Commit/version, frozen predecessor hashes, all 73 requirement indexes and remaining inventory tasks |
| `receipts.json` | Actual run commands/environment, source pins, per-selector results and raw-report hashes |
| `native.xml`, `ui.xml`, `build.txt` | Raw native/Node JUnit and Vite output; not competitor or packaged-app receipts |
| `*-initial.xml`, `ui-retry.xml` | Preserved failed attempts; source hashes were not committed by the interrupted/old runner |
| [../verify.py](../verify.py) | Offline validator and focused receipt reproduction CLI |

Every scenario states a literal source or named fixture, descriptive parameters,
dimensions/object class, numerical contract, caps/domain restrictions, refusals,
checks, exact fixture selectors, source files, UI route/IDs and remaining work.
`parameters_are_executable:false` prevents interpreting descriptive tables as an
engine request. Executable setup belongs to the selected fixture. Run IDs resolve
into the receipt; parameterized pytest selectors expand to their actual JUnit
nodes. Node names are checked against source literals or explicit template bindings
and against executed report names. Null/whole-suite selectors are not allowed
in the successor. Extra executed suite tests stay unassigned to scenarios.
JUnit parent suites resolve through all their child outcomes; they do not add
extra passes to the leaf-test totals.

Evidence roles are `direct` or `related-not-oracle`; direct means only the
assertions in that named test. Neither role implies every descriptive parameter
combination was executed. In particular, the nine `anim-02-r8-method-*` cases
retain the existing 13-source sampled/refused matrix per method. Their test
checks that recorded inventory, rather than rerunning all 117 trajectories;
their shared via-snub UI pointer is explicitly related evidence. Actual B3/H3
trajectory tests have separate scenarios and source/domain limits.

Evidence levels remain separate: `native` (pytest), `ui-unit` (including fake DOM
and native-backed controls), `ui-mounted` (real Vite/Chromium/native workflows),
and `tooling-unit` (plans/CLI fixture tooling). Windows source-test execution is
not shipped-platform execution. Source snapshots bind application code, native
catalog JSON/OFF assets, fixture bytes and named contract/test/tooling files;
source changes revoke current receipts. They are local integrity records, not
signatures, independent specialist review or proof of adversarial tamper resistance.

`closure.kind` distinguishes `scenario-closed`, `local-tranche` and
`inventory-only`. Each legacy link separately says `implementation-gap-closed`,
`local-tranche-only`, `strengthened-existing-coverage` or `still-open`.
`scenario-closed` closes only the specifically stated local implementation/UI gap.
All benchmark/competitor statuses remain unverified/not-run, and all packaged
platform statuses remain not-run. The 73-row map inventories evidence and tasks;
it does not copy or promote canonical/proposed ledger statuses.

Nonpassing observations remain explicit. A fixture may record
`observed_status:failed` only on an `inventory-only` scenario with
`evidence_status:incomplete` and a stated remaining investigation. A raw failed
run can still supply independent passing selectors for other scenarios; it is
never called a green suite. Failed assertions cannot support local closure.
The mounted symmetry panel summary timed out on repeated baseline runs and its
new scenario therefore remains inventory-only, with the UI gap recorded.
The latest selection also encountered startup/navigation timeouts in
classification, face surgery, fitting, history and Tuta. All 15 linked scenarios
are inventory-only with explicit failed observations; earlier passing attempts
do not replace those observations. The three named local scenario closures use
other passing selectors.

Raw Node failure messages can contain ANSI color controls. The parser removes
only terminal color/control sequences for XML interpretation, retaining the raw
bytes and hash; other malformed XML is rejected. The latest UI receipt was
recovered after this parser failure: the original runner had already checked
before/after source equality. Its re-materialized hashes match both the
independently persisted native starting snapshot and build snapshot. Exact UI
start/end timestamps were lost by concurrent pending-receipt writes and are
explicitly null. Reproduce the receipt commands sequentially.

Full R5 implementation-gap closures:

- `stel-01-arbitrary-planes` → `stel-01-r6-arbitrary-plane-editor`: bounded
  common expression editor, source binding, saved inputs and promotion/replay.
- `stel-04-editor-subgroups` → `stel-04-r6-reflection-editor`: mounted generator
  subgroup editor with independent octahedron reflection permutation/unions.
  Its additional `stel-04-group-scope` link remains a local tranche.

`doc-02-r6-controlled-add-blend` closes its newly specified controlled memory
scenario. Original `fac-02-dodecahedron-frontier` explicitly stays **open**;
integer pyritohedron evidence cannot qualify the regular golden-ratio source.
Generalized fitting, global star interiors, other reinforcement/material/codec
options and authoritative benchmark identities retain their stated gaps.

## Scenario directory

The JSON files are the authoritative option/selector/UI tables. R6 families:
`stel-01/04/05-r6-*`, `fac-02/03/04-r6-*`, `sec-05-r6-*`, `con-07-r6-*`,
`con-02-r6-waterman-z4-d4`, `con-09-r6-*`, `net-05-r6-*`,
`io-04-r6-strip-digital-export`, `con-06-r6-scaled-memory-add`,
`doc-02-r6-controlled-add-blend`, `io-01/02-r6-dxf-*`,
`vis-03-r6-png-environment`, `anim-02-r6-via-snub-b3`.

Previously delegated options: `lib-01` through `lib-08` named generation,
relationship, family and identity-navigation cases; `con-13-r7-tuta-vf-completion`;
`view-06-r7-source-symmetry-evidence`; two `anim-02-r7-via-snub-h3-*` directions;
nine `anim-02-r8-method-*` rows; `doc-01-r8-legacy-branch-document` and three
`doc-03-r8-*` version/schema cases; `view-04-r8-common-cell-visibility`;
`desk-01-r8-common-expert-off`; and `desk-01/io-03/desk-02-r7-*` runner/source
fixture cases. Runner self-tests never count as executed desktop/media scenarios.

## Remaining inventory

Twenty requirements currently resolve to actionable inventory tasks instead of
invented scenarios: VIEW-01/02/03/05/07, INFO-01/02/03, MEAS-01/02/03/04,
CON-01, SEC-03/04, VF-01, ANIM-01/03 and VIS-01/04. Each task names an owner,
next action and existing candidate fixture paths. These are inventory gaps,
not declarations that their runtime features are absent. Existing R5 cases
still carry their historical follow-ups; the successor only changes explicitly
linked cases within their declared new domains.
