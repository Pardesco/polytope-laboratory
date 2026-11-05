# October 25 continuation: Library and file loading

Follows [export/Save reliability](EXPORT_SAVE_RELIABILITY_2026-10-25.md).
Development remains 0.27.21, with qualified/published 0.27.20 preserved. The
active goal prioritizes important core performance/reliability work and defers
noncritical broad testing until final release preparation.

## Implemented

**Prepare each Library search once.** `compileCatalogQuery` parses tokens and
numeric operators once per search. Numeric-only and empty queries avoid building
unused text metadata; mixed queries build it lazily once per matching entry.
Quoted text, aliases, symbols, numeric field aliases, missing-field behavior,
operator semantics and result ordering are retained. The legacy single-entry
`catalogMatches` API remains available. No catalog-record identity cache is
introduced: changed literal aliases/counts/audit metadata are read on subsequent
matches.

**Keep Library rows during model navigation.** `renderWorkspace` updates the
active catalog row and synchronizes pending-load state instead of refiltering
the entire registry, rebuilding family options and replacing up to 250 buttons.
Search/filter/catalog/link changes still perform a full render. Existing row
callbacks and pending/disabled state remain in place. The actual navigation
synchronization block is tested with DOM rebuilds configured to fail.

**Make Open and Recover cancellable jobs.** Both now use NativeJobs with explicit
request IDs forwarded by the real preload. The new main-process
`desktop/workspace-reads.cjs` owns the chooser-to-worker gap and native read.
Cancel marks that ownership and retires an active engine worker or removes a
queued job through the existing cancellation path. A late chooser selection or
late native reply cannot start/publish an obsolete read. The renderer settles
promptly even if a provider ignores cancellation. Missing recovery files still
return null; other native errors still propagate. The OS chooser itself is not
programmatically closed by Cancel; Escape/Cancel within the chooser retains its
ordinary behavior.

File IDs are bounded, reserved across engine/library/file channels, and released
on completion/error. The main service caps outstanding requests and rejects new
work after shutdown. Renderer-supplied paths are not added: Open still uses the
native chooser and Recover still uses the main-process recovery path. Existing
trusted-main-frame checks, hidden dialog restrictions, isolated file workers and
file validation remain unchanged. Calls omitting an ID remain supported.

**Prevent overlapping Open/Recover dialogs and reads.** ProjectOpening shares
one renderer lock across both actions and releases it on cancellation/error.
The existing project/revision/export publication fence remains authoritative:
an edited or replaced workspace cannot be overwritten by a late file result.
The module is included automatically by the existing recursive desktop staging
and archive-verification workflows; no package was built in this pass.

## Search measurements

`scripts/profile-catalog-query.mjs` compares the preserved pre-change matcher
with prepared queries. The original source is retained at
`artifacts/catalog-query-baseline-ildarcql/catalog-query.mjs`, SHA-256
`be9dc2da12e87fcc2c883cc5806a6bdb7180772863cc1442520e0c4df26ca757`.
Seven alternating-order samples per mode follow a warm-up pair for each case.

| Dataset / query | Before median (IQR), ms | Prepared median (IQR), ms |
| --- | --- | --- |
| Actual 1,305-entry built-in registry, empty | 0.742 (0.223) | 0.042 (0.041) |
| Actual registry, `dim:4 v>=24` | 1.112 (0.120) | 0.074 (0.031) |
| Synthetic 10,000-entry linked metadata, empty | 2.994 (0.251) | 0.073 (0.025) |
| Synthetic linked metadata, `dim:4 v>=24` | 6.414 (0.231) | 0.332 (0.009) |

All ordered matched-key lists are equal across all six tested queries on both
datasets. Raw samples, complete metadata/query inputs, expected matched keys and
selected source/input hashes are preserved in
`artifacts/catalog-query-profile-FfLDv8/`. Platform: Windows 10.0.26200, Node
v24.22.1, Intel Core i7-14700K. Synthetic metadata is explicitly generated search
data, not evidence about imported geometry or an actual linked corpus.

These timings cover metadata filtering only. They exclude DOM/layout work,
native generation/file parsing, Electron IPC, GPU rendering and visible task
latency. The removed navigation DOM work has source-level behavioral coverage,
not a measured desktop timing or FPS result.

## Focused verification

`artifacts/library-file-workflow-20261025-121616/result.json` records **93 passing
tests across eight relevant suites**, zero failures/skips, the successful
**169-module production build**, and successful Node syntax checks for main,
preload and workspace-reads. `focused.tap` and `build.log` retain raw output.
Selected runtime/script/test inputs are unchanged before/after execution.

The real main and preload execute in a mocked Electron harness. It verifies ID
forwarding, chooser cancellation, cross-channel reservations, actual EnginePool
retirement with simulated child processes, late replies and same-ID retry after
cleanup. Renderer tests combine ProjectOpening, NativeJobs and WorkspaceReads
against ignored late native providers. Catalog load ordering, cancellation,
snub/source-name search and source ownership retain focused coverage. Existing
atomic publication/interrupted-writer cases also pass.

This does not qualify real OS dialogs, live Electron input/focus, Python file
parsing performance, packaged file loading or the portable executable. Earlier
192-/115-/127-test receipts bind prior source snapshots and remain preserved.
No Electron launch, ACL workaround, native algorithm/importer change, package,
freeze/seal, commit or online publication ran.

## Remaining priority

Continue high-impact core work. Investigate repeated native geometry work when
opening/saving multi-state projects and consider retiring pending file reads
automatically once a workspace edit makes their eventual adoption ineligible.
Any reuse must be keyed by complete literal input and preserve validation,
independent recomputation, mutable-output isolation and resource bounds.

At final normal-session qualification, verify real Open/Recover cancellation
during slow parsing and queue waits, chooser Escape/cancellation, retry, startup
and shutdown, linked-file collision handling, and navigation/search interaction
with pending loads. Include the new desktop module in the refreshed review diff
and final archive proof. Broad source/package/portable checks and visible/fresh-
user measurements remain deferred; the development goal remains active.
