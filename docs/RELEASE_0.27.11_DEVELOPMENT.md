# 0.27.11: dependable model opening and readable desktop labels

**Unqualified intermediate candidate.** Final export QA found a dialog-close
race that overwrote the fixture's old OBJ after its parent closed. The binary
is retained unchanged with `UNQUALIFIED.txt`. See
`artifacts/candidate-review-0.27.11.json` and the 0.27.12 correction.

Local development preview, October 22, 2026. Feature expansion remains paused.
Previous qualified portable/source pairs are preserved. Public production remains
0.26.0; nothing from this continuation was published online.

## Changes a user can see

The Library marks models while they open and shows a pending-load notice that
survives search/filter changes. Repeated clicks on the same pending entry open
one document. Different selections still open separate tabs; a delayed earlier
selection cannot take focus from the newest one. Choosing a tab, a history step,
Undo or Redo while waiting preserves that explicit navigation, even if Undo/Redo
eventually returns to the original step.

Cancel discards late replies as well as requesting native cancellation. Open and
Recover cancel pending model opens before showing their native dialog, so those
loads cannot dirty or enter a replacement project. Animation/tour export cancels
pending opens and disables new model opens until it finishes or is canceled.
New document and the initial default model use the same loading owner. A first
result can fill an empty workspace while a newer request is still pending.

Linked OFF files follow the same rules. The explicit Try current importer action
closes its file-information dialog and shows progress in the Library, keeping
Cancel reachable. It retains the original file bytes and native source metadata.
The offline guide describes these behaviors.

The native File menu now displays ordinary ellipses, History parameters uses a
readable close symbol, and the packed-page size diagnostic reads 20–2,000 mm.
Their actions, keyboard shortcuts and mathematical limits are unchanged.

## Reproduced baseline

The real packaged 0.27.9 app, with native generation completed and its IPC reply
held in an isolated qualification process, demonstrated all three publication
bugs: a late model entered a replacement project, appeared after Cancel, and
took focus from a newer catalog selection. It had no pending-entry marker.
Actual native menu/History labels also contained malformed text.

Receipt: `artifacts/catalog-workflow-XZ3BGa/result.json`. This is a behavior
baseline, not a release qualification receipt.

Unsupported and malformed entries remain disabled during pending-state, export
and cancellation updates.

## Ownership and resource details

`CatalogLoading` owns up to eight pending requests and respects the 100-document
limit for catalog opens. It captures the requesting project, focus state and
explicit navigation generation. Cancellation resolves promptly even when an old
IPC promise has not settled. A late resolve/reject cannot clear a newer same-key
request or publish into another project. Observer edits remain independent.

Linked-file IPC accepts an optional bounded job ID, preserving existing callers
that omit it. IDs are reserved before asynchronous path verification; duplicate
library/engine IDs are refused. Cancel is honored before submitting geometry as
well as through the existing active/queued engine cancellation. Preflight IDs
are released in finally; the native registry is bounded at 40 requests. Existing
linked-root authorization and real-path checks remain enforced. Window shutdown
marks preflight requests canceled. All native engine files, including the three
protected importer/geometry files, are unchanged.

## Verification

- Production UI build: 161 modules.
- 185 focused checks pass: `artifacts/catalog-history-memory-0.27.11.tap`.
  Coverage includes out-of-order results, duplicate requests, cancellation with
  late replies, replacement projects, exports, empty workspaces, document/load
  limits, explicit navigation, history, memories and engine/hidden policies.
- Visible development catalog workflow:
  `artifacts/catalog-workflow-of846P/result.json`. It checks the reproduced cases,
  duplicate queued clicks, filtering, New, Undo/Redo focus, held animation export,
  real linked OFF loads and retries, preflight cancellation, ID collisions/reuse,
  and actual menu/History/error text.
- The Try current importer route uses a synthetic displayed audit marker over
  an actually authorized OFF file. Native import, geometry, source metadata and
  on-disk bytes remain real. This tests UI routing, not the audit classifier.
- Pending-load screenshots at 1200×760 and 1500×950 are retained beside that
  receipt; no horizontal document overflow occurs. The smaller view was visually
  inspected. The whole source/geometry remains visible while loading.

The visible development core workflow also passes with one-second playback:
`artifacts/core-experience-V9JQdu/result.json`. The intermediate 0.27.10 binary
is unqualified: its pending-state sync re-enabled unsupported entries. The
filtered preserved-binary replay and corrected test scope are recorded in
`artifacts/candidate-review-0.27.10-followup.json`. The legacy linked-library gate
now selects its linked rows before counting disabled entries, accounting for the
250-match window; its disabled-row assertion is retained.

The one-second hidden core check collected insufficient moving poses:
`artifacts/core-experience-JQxpbm/failure.json`. The core harness now records its
mode and duration: visible playback remains one second; hidden functional
sampling uses four seconds while keeping the intermediate-pose requirement.
Both modes must publish intermediate poses; visible playback retains the
one-second check. Player runtime source is unchanged. Future failures also retain
the sampled playback data. These functional samples do not establish FPS.

The legacy development linked-library workflow passes all 11 checks:
`artifacts/linked-compat-1af233b7a09a41a6a596ebf8d67799ca/linked-desktop-smoke.json`.
All 1,667 engine files match 0.27.9:
`artifacts/engine-source-comparison-0.27.11.json`.

- Packaged catalog/linked/importer workflow with development Python unavailable:
  `artifacts/catalog-workflow-F7sGRU/result.json`, including disabled unsupported
  rows, two window sizes, held native replies, project replacement, Cancel,
  explicit navigation, New and animation export.
- Packaged legacy linked-library compatibility, all 11 checks:
  `artifacts/linked-compat-43ca8c65572249de9f25a366fc546c18/linked-packaged-smoke.json`.
  Development Python is unavailable; optional-ID callers, root overlap, in-flight
  unlink, missing files, restart/restoration and capability revocation pass.
- Packaged visible core workflow: `artifacts/core-experience-qh8nDR/result.json`.
  One-second sizing playback published 57 observed poses. This is a functional
  observation, not a rendered FPS measurement. Native automatic radius and equal
  source/reciprocal endpoint bounds remain verified.
- Packaged hidden core workflow: `artifacts/core-experience-R6v5Me/result.json`.
  Four-second functional playback published five observed poses, including three
  intermediate poses. All original construction/history/Save/Open checks pass.
- Packaged hidden-window/focus canary:
  `artifacts/hidden-desktop-canary-RrN9St/result.json`.

Section/net/export, portable and source-pair verification are pending.

## Local package

Portable: `release/preview-0.27.11/Polytope Laboratory 0.27.11 preview.exe`,
143,236,973 bytes, SHA256
`60c3227a68c5ca90c93a3ff28f65f62e2a3cfd727cd316bf0401adc2d9c731b7`.
Matching source: `release/Polytope Laboratory 0.27.11 source.zip`.
Package/current receipt: `release/preview-0.27.11/verification.json`;
source-pair receipt: `artifacts/source-pair-0.27.11.json`.
There are 1,871 frozen runtime/build inputs.

## Remaining core work

Continue construction feedback and broader publication/export review. In
particular, audit direct `addDocument` continuations such as Certify current and
global Cancel during a completed-but-delayed construction reply. Reproduce these
with held native results before changing their behavior. Saved-tour actor section
materials still rebuild. Fresh-user observation remains unperformed; staged
integrations remain deferred. Existing section/ownership timing measurements
retain their stated hardware and scope; this release makes no new FPS claim.
