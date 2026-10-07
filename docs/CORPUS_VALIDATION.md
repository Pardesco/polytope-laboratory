# Resumable Drive corpus validation

The audit checks the current numerical OFF importer against local acquisition
manifest files. It reads source geometry without editing it and retains full
validation warnings. Directory names remain unverified source labels. Successful
import does not certify uniformity, naming, manifoldness or the 2,191-type baseline.

## Run and resume

From the repository in PowerShell:

```powershell
python scripts/audit-drive-corpus.py --all --workers 4
python scripts/audit-drive-corpus.py --all --resume --workers 4
```

`--all` explicitly selects every hash-verified, supported manifest entry. The
default invocation still runs the bounded 24-file sample. Full runs default to
`artifacts/drive-corpus-full-audit.json`, preserving the earlier sample report.
Use `--output` for a separate experiment. Outputs must be outside the source
directory. An OS lock prevents two processes sharing an output/checkpoint.

Each file runs in a separate Python process with a 90-second timeout. `--timeout`
changes that limit and `--workers` accepts 1–4. Native numerical libraries use
one thread per worker. Timed-out workers are killed and reaped; a failed file
does not stop other imports. Ctrl+C stops active workers, retains completed
checkpoints and writes a partial report. Forced termination can leave the summary
stale; the journal retains completed appends. Resume repairs an incomplete final
journal line, but refuses corruption in complete lines.

For short sessions, bound **new** imports per invocation:

```powershell
python scripts/audit-drive-corpus.py --all --resume --limit 100
```

Resume inventories and hashes source files again. Reuse requires matching source
hashes and unchanged-source evidence, plus matching acquisition manifest, validator
Python sources, Python version and NumPy/SciPy versions. Changed context triggers
revalidation of the selection. Acquisition-hash mismatches remain failures; the
tool never repairs sources. Byte-identical entries at different paths stay separate.

Matching timeouts and worker failures are retained unless explicitly retried:

```powershell
python scripts/audit-drive-corpus.py --all --resume --retry-failures --timeout 180
```

A changed timeout automatically retries prior timeouts. `--retry-failures` also
retries worker, validation and count failures. Deterministic `diagnosed` importer
rejections are retained until source or validator context changes. Files changed
during import are always rechecked.

## Evidence files

| Default full-run output | Contents |
| --- | --- |
| `artifacts/drive-corpus-full-audit.json` | Inventory, per-file results, category/status totals, duplicate hashes, provenance and coverage |
| `artifacts/drive-corpus-full-audit.checkpoint.jsonl` | Durable result journal used by `--resume` |
| `artifacts/drive-corpus-full-audit.failures.json` | Compact list of files needing attention, with paths, statuses and errors |
| `artifacts/drive-corpus-full-audit.lock` | OS lock; its presence alone does not mean an audit is running |

Reports are replaced atomically. Each journal result is flushed and synced before
progress is printed. Preserve the journal with its report when moving evidence;
changing the absolute source directory intentionally invalidates reuse.

`progress` separates reused results, newly completed imports, selected pending
files and failures. The inventory always accounts for the entire manifest, even
when a limit or sample leaves some files untested.

| Status | Meaning |
| --- | --- |
| `parsed` | Passing numerical importer validation; declared counts match (zero OFF edge count means unspecified) |
| `diagnosed` | Importer rejected supplied geometry; error and type are preserved |
| `timeout` / `worker-error` | No completed importer diagnosis; retry remains necessary |
| `validation-failed` / `count-mismatch` | Worker evidence did not meet the audit contract |
| `source-changed` | Source hash changed or became unreadable during import |
| `source-hash-mismatch` / `inventory-error` | Acquisition integrity or inventory failed |
| `not-downloaded` / `skipped-unsupported-dimension` | Entry unavailable for importer validation |
| `inventory-only-pending` / `inventory-only-unsampled` | Selected but unfinished, or outside the requested sample |

`allManifestEntriesAttempted` means every entry has an importer result, including
timeouts and worker failures. `completeImporterAudit` requires every entry to be
parsed or deterministically diagnosed, unchanged sources, and an unchanged
manifest and validator during the run. A complete audit can contain rejected
models: this is a coverage claim. Unsupported or unavailable entries prevent full
manifest importer coverage. Warnings remain evidence for parsed files.

Exit status is 0 for a run without reported failures (including an intentionally
limited run), 1 when failures are reported, 2 for invalid arguments or unusable
inputs/checkpoints, and 130 after handled Ctrl+C. Automation must also inspect
coverage and pending counts before claiming completion.

## Verification

```powershell
python -m pytest tests/test_drive_audit.py tests/test_drive_download.py -q
```

Tests cover real partial/full/no-op resume, changed sources, malformed-file
diagnoses, incomplete/corrupt journals, context invalidation, retry policy, real
worker timeout/cancellation, interruption retention, count reconciliation and
atomic-report preservation.

The [October 4 full-run findings](LOCAL_CORPUS.md) record the completed 3,064-file
audit, the 16 importer diagnoses and the verified no-op full-library resume.
Report `seconds` measures the current invocation; the original full-run timings
are retained separately in `artifacts/drive-corpus-full-audit-run-summary.json`.


## Current evidence in the linked library

The fresh 0.9.0 audit has 3,050 passing imports and fourteen deterministic diagnoses across all 3,064 unchanged sources. Its checkpoint is independent of the historical importer audit. To resume or compile this current run:

```powershell
python scripts/audit-drive-corpus.py --all --resume --workers 4 --output artifacts/drive-corpus-0.9.0-audit.json
python scripts/compile-library-audit.py artifacts/drive-corpus-0.9.0-audit.json --output artifacts/drive-corpus-0.9.0-audit.library-index.json
```

Attach the report or compact index with the linked folder's **Audit** button. **Verify** explicitly hashes source files beyond the bounded startup budget. A changed importer requires fresh audit evidence even when source hashes still match. Compilation preserves the original provenance and does not revalidate geometry.
