# Offline repeatable experiment (R7-BATCH)

The installed engine now exposes the source CLI through `--cli`. The bounded
`experiment` command generates and analyzes tetrahedron, cube, 5-cell and
tesseract using ordinary JSON-lines `generate`/`analyze` requests. No network,
Electron launch, Node runtime or development Python installation is needed to
run the frozen command. This is deliberately a scripting entry, with no new
inspector controls, element IDs, history records or desktop operations.

From PowerShell, set `$engine` to the installed executable. The install layout
is `<application directory>\resources\engine\polytope-engine.exe`; for a portable
build, use its extracted application directory. Keep the entire engine directory,
including `_internal`, together. Write output to a user-writable location:

```powershell
$engine = 'C:\path\to\Polytope Laboratory\resources\engine\polytope-engine.exe'
& $engine --cli experiment --output "$env:USERPROFILE\Documents\polytope-experiment"
& $engine --cli experiment --output "$env:USERPROFILE\Documents\polytope-experiment" --resume
& $engine --cli --help
& $engine --cli experiment --help
```

The omitted spec uses an embedded sample, so the installed app does not require
files from this repository. An editable copy is [batch-experiment.json](../examples/batch-experiment.json).
Pass a JSON file before `--output` to select different regular-generator keys.
Records require unique `id` and `key` strings; arbitrary operations and paths
are refused by this bounded experiment interface. Existing `request`, `catalog`,
`generate` and `inspect` CLI commands remain available for broader scripting.

Source equivalents, from the repository with its documented dependencies:

```powershell
python -m engine.cli experiment examples/batch-experiment.json --output artifacts/batch/source
python -m engine.cli experiment examples/batch-experiment.json --output artifacts/batch/source --resume
python -m engine.cli generate cube -o artifacts/batch/cube.off
python -m engine.cli inspect artifacts/batch/cube.off
```

For direct JSON-lines, use the installed executable without arguments, or
`python -m engine.server` from source:

```powershell
'{"id":"cube-1","op":"generate","params":{"kind":"regular","key":"cube"}}' | & $engine
```

Each UTF-8 input line receives one JSON response: `{id,ok,result}` on success,
`{id,ok:false,error,type}` on a refused operation. The server remains usable
after a refusal. Send full returned model records in subsequent `analyze`
requests; IDs correlate requests and do not identify stored models. The engine
protocol retains its existing 128 MiB request limit. The experiment applies a
stricter 16 MiB limit in each direction.

## Reports, cancellation and resume

`report.json` retains the spec, source/version/runtime hashes, full native
analysis (including validation, precision scope and numerical diagnostics),
per-model status, failure phase/type/message, latest results and all attempts.
`checkpoint.jsonl` contains a source-bound header and fsynced attempt rows;
its reader/writer are shared with catalog audit. Report publication uses the
existing atomic writer. `complete` means no cancelled items remain, while
`successful` means every item passed. A complete report can contain failures.

Ctrl+C requests cancellation and kills an active engine child. For unattended
PowerShell use `--cancel-file C:\path\cancel.flag`; creating that file cancels
the active job and records remaining items as cancelled. Remove it before
resuming. Exit codes: 0 all passed, 1 model failure/timeout, 2 invalid invocation
or incompatible checkpoint, 130 cancellation. Hard process termination can
leave only the checkpoint; rerun with `--resume` to rebuild the report.

Resume requires the identical spec, timeout, source manifest, executable hash
and dependency versions. Completed passes and failures are retained; cancelled
items retry with incremented attempts, and older cancellation records remain.
To retry a failure, choose a fresh directory. A truncated checkpoint is refused
with a diagnostic; remove only its incomplete final line before resuming.
Use one runner per output directory.

Limits: 1–32 models, 1–120 character IDs/keys, 1 MiB spec, one child at a time,
two requests per model, 30 seconds per request by default, maximum 120 seconds.
Each child is discarded after its model, bounding retained engine state. The
source digest covers all engine Python files and bundled JSON/OFF catalog
assets, using relative names and SHA-256 contents. It excludes the optional
external `data/` library, which this sample does not consume. Frozen builds
carry the build-time manifest; reports also hash the actual executable and
retain Python/NumPy/SciPy versions. Model hashes separately bind geometry
representation and the full generated JSON record. Hashes establish content
identity, not mathematical exactness or independent provenance authentication.
The full-record hash varies with each generated model's random document UUID;
cross-run comparison uses geometry representation hashes and full analysis.
Measurements remain float64; no exact/certified result is inferred from a pass.

## Qualification and scenario IDs

These package-local scenarios close the §12 batch qualification slice; they
are not new baseline parity claims or additions to the option inventory:

| Scenario | Executed acceptance |
| --- | --- |
| BATCH-01 | Source and frozen JSON-lines framing, correlated IDs, refusal then continued success. |
| BATCH-02 | Four-model source/frozen sample; independently expected face vectors, cube volume 8, tesseract hypervolume 16; complete source/frozen analysis and model hashes agree. |
| BATCH-03 | Unsupported key records a generation failure, next cube still passes; bounded timeout/crash/protocol/output failures covered by tests. |
| BATCH-04 | Frozen cancellation produces four records and exit 130; resume retains cancellation attempts and completes all four; active-child cancellation and kill verified in tests. |
| BATCH-05 | Frozen completed resume adds no rows; source-change/truncated-checkpoint refusal tested; reports bind source/version/executable/model hashes. |

Windows x64 candidate qualification was run on 2026-11-09. The complete frozen
directory was relocated to an installed-style `resources/engine` directory;
each process ran from a separate empty temporary working directory with Python
removed from PATH and Python environment overrides removed. All five scenarios
passed. The retained machine-readable [receipt](BATCH_QUALIFICATION.json)
identifies the exact candidate and source comparison. Full reports/checkpoints
are local build artifacts under `artifacts/batch/release-comparison/`.

Reproduce against any installed candidate (Node is needed only for this test
harness, not for the installed experiment command):

```powershell
node scripts/qualify-batch-experiment.cjs --engine "$engine" --output artifacts/batch/installed-check
# Optional: also compare every sample analysis/hash to a source CLI report.
node scripts/qualify-batch-experiment.cjs --engine "$engine" --output artifacts/batch/comparison --source-report artifacts/batch/source/report.json
```

Validation: 70 Python tests passed (24 batch + 46 catalog audit), 18 Node tests
passed (batch, engine allowlist and pool), frozen engine bundling succeeded,
and `npx.cmd vite build --configLoader native` passed with existing chunk-size
and mixed-import warnings. Both existing section/net worker protocol tests also
passed (72 Python passes total). No Electron launch was attempted.

R7-RELEASE integration: retain the additive manifest preparation command and
`--add-data "experiment-runtime.json;."` in `engine:bundle`; the existing
`engine/server.py` packaging entry and `extraResources` layout are unchanged.
Rebuild after merge and rerun the harness against the final installed engine.
This receipt qualifies the relocated frozen engine component. Installer
execution, clean-machine installation and desktop UI qualification remain
release checks; none are claimed by this package.
