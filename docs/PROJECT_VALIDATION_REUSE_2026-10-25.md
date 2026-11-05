# October 25 continuation: repeated project geometry

Follows [Library/file loading](LIBRARY_FILE_WORKFLOW_2026-10-25.md). Development
remains 0.27.21; qualified/published 0.27.20 remains preserved. The active goal
prioritizes important core performance/reliability work, using focused checks
and deferring noncritical broad testing until final release preparation.

## Implemented

**Reuse independently computed geometry within one multi-state project check.**
`engine/formats.py::validate_project` now uses the existing bounded literal-input
AnalysisCache for its direct geometry validation and intrinsic measures. The
first distinct complete model still runs the original functions. A later exact
canonical JSON match may reuse that native result; supplied IDs, fingerprints,
validation records and measure scalars cannot authorize it. Callable identity
separates validation and measurement entries. A failed project check aborts the
request; it cannot authorize a subsequent project.

The cache belongs only to that validate_project invocation. It is discarded
between separate Save/Open/validate-project requests. Single-state projects with
no auxiliary states bypass cache construction and keying. Multi-state requests
retain at most eight entries, with the existing 2 MiB key, 1 MiB result, 8 MiB
total serialized-data and 65,536-node key-policy bounds. These are serialized
data bounds, not a total Python process-memory claim. Ineligible/oversized inputs
compute normally without reuse. Cached outputs are detached, so editing one
state's computed measure cannot poison another state's result.

Identity is still recomputed for every model. Every state still runs its view
validation, face/cell net and paper reconstruction, and exact certificate
reconstruction. Each real document's operation history remains independently
checked. The top-level file, structural/depth and document/state limits remain.
Malformed incidence, stale supporting planes and forged scalars still refuse or
are recomputed through the original authority. No mathematical algorithm,
parser, writer, atomic publication or backup behavior was changed.

**Retire file reads as soon as they become ineligible.** ProjectOpening now owns
an abort signal and observes workspace project/revision and export state. Edits,
navigation/playback revisions, project replacement and export transitions abort
an obsolete Open/Recover job, releasing its native worker through the preceding
file-read cancellation path. Previously the same source fence rejected adoption
only after the long native read finished. A provider ignoring abort still cannot
publish even if the original workspace values later return. Publication itself
is explicitly scoped so adopting a completed project does not cancel its own
revision change.

NativeJobs exposes an optional status-token observer. File invalidation uses
the existing status ownership rule to report cancellation only if that opening
operation still owns the message; a newer action's status remains intact.
Existing explicit Cancel, request IDs, native chooser restrictions and the final
atomic publication fence remain active.

## Evidence and measured scope

The preserved pre-change formats source is
`artifacts/project-validation-baseline-7iswa3xg/formats.py`, SHA-256
`fdc634c8a992e2b6a33ea69ae68f3fbd5d021949123efd584744d8a0a76c8d23`.
Its cProfile of a generated six-pose 600-cell history showed six independent
intrinsic/hull calculations and twelve geometry validations (including the
validations inside those hull calculations). These are generated representative
history states from a real native model, not a fresh-user observation.

`scripts/profile-project-validation.py` performs five alternating-order samples
per mode after warm-up for five workloads. It compares full resulting projects,
not just count/identity/scalar fields. Final receipt and complete inputs/expected
projects/raw samples are in `artifacts/project-validation-profile-g6l8p8s7/`.

| Validation workload | Before median (IQR), seconds | After median (IQR), seconds |
| --- | --- | --- |
| One 600-cell state | 0.3389 (0.0040) | 0.3418 (0.0136) |
| Six unchanged 600-cell states | 2.0459 (0.0240) | 0.4864 (0.0116) |
| Six unchanged cube states | 0.01954 (0.00054) | 0.00606 (0.00047) |
| Six alternating original/scaled 600-cell states | 2.0510 (0.0466) | 0.8234 (0.0253) |
| Six 600-cell states with forged supplied scalars | 2.0456 (0.0039) | 0.4810 (0.0190) |

For six unchanged states, direct project validation and intrinsic-measure calls
each drop from six to one. The one-state path does not construct or key a cache;
the table does not claim it is faster. All compared complete outputs are equal.

One source-level local file round-trip pair also passed:

- Save: 2.077 to 0.516 seconds; Open: 2.246 to 0.629 seconds.
- Saved JSON bytes are exactly equal, SHA-256
  `9b0e8e0f196ca262963ad1cb3fea055db0113186e32a4373b6767c0c10605973`.

The file times are single observations, not median distributions. They include
local source-level validation/serialization/IO (and Save input cloning), not
Electron IPC, process startup, OS dialogs, renderer work or packaged latency.
Validation distributions exclude input cloning and use Python 3.10.11 on
Windows 10.0.26200 with one BLAS/OMP thread. There is no general loading/FPS claim.

The first one-shot timing was not used as final evidence. An intermediate full
comparison, `artifacts/project-validation-profile-9ca8cw8w`, still constructed a
cache for one state and had noisy single-state timings. Its bytes are preserved;
the final direct one-state path and final comparison above supersede it.

## Focused verification

`artifacts/project-workflow-native-20261025-124730/result.json` records **227
passing native tests across seven files**, **140 passing Node tests across eight
suites**, and the successful **169-module production build**. Raw output is in
`native.log`, `frontend.tap` and `build.log`. Selected input hashes match before
and after execution. This is focused source validation, not full regression or
installed-dependency/packaged qualification.

Coverage includes complete literal/type changes under unchanged claimed IDs,
forged reports/scalars, invalid later states, per-request scope, detached output,
eviction/size fallback, direct single-state behavior, per-state views and
history, actual face/cell net and paper reconstruction, exact certificate
reconstruction, memory/tour/history round-trips and refusal to replace a saved
file with a project containing invalid later geometry. Renderer checks cover
automatic read invalidation, late ignored providers, successful adoption,
scoped cancellation and preservation of newer status messages.

The benchmark also compares the parsed formats module outside validate_project
against the preserved starting source; all other function/import logic matches.
**The formats.py file hash has changed**, so older whole-file importer/source
receipts do not bind this revision. Parser logic and the original geometry
helpers remain unchanged. Refresh native source qualification and rebuild the
bundled engine before final packaged checks; do not claim whole-engine byte reuse.
The prior review diff also needs updating.

No Electron launch, ACL workaround, native bundle/package, freeze/seal, commit or
online publication ran. Earlier archives and receipts remain intact.

## Remaining priority

Continue the active high-impact goal. Profile remaining rendering/navigation
work, including hidden derived requests and repeated full-source key encoding,
before selecting another optimization. Preserve complete source ownership and
resource bounds; avoid speculative caches or deferred feature expansion.

At final normal-session qualification, open/save representative multi-state
projects with memories, tours, exact sources and edited nets, confirm original
files/geometry/notes/history remain intact, and exercise editing/navigation/export
while slow Open/Recover jobs are pending. Collect actual packaged end-to-end
timings. Broad source, portable, visible and fresh-user checks remain deferred.
