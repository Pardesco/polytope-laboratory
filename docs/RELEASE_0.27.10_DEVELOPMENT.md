# 0.27.10: dependable model opening and readable desktop labels

**Unqualified intermediate candidate.** The loading-state sync re-enabled
unsupported linked entries. A filtered replay confirms the defect in
`artifacts/candidate-02710-baseline-HtDyFE/artifacts/catalog-workflow-knZQNS/failure.json`.
The binary is preserved unchanged and marked `UNQUALIFIED.txt`; use the qualified
successor when available. See [0.27.11 notes](RELEASE_0.27.11_DEVELOPMENT.md).

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
- 185 focused checks pass: `artifacts/catalog-history-memory-0.27.10.tap`.
  Coverage includes out-of-order results, duplicate requests, cancellation with
  late replies, replacement projects, exports, empty workspaces, document/load
  limits, explicit navigation, history, memories and engine/hidden policies.
- Visible development catalog workflow:
  `artifacts/catalog-workflow-pJ1HaF/result.json`. It checks the reproduced cases,
  duplicate queued clicks, filtering, New, Undo/Redo focus, held animation export,
  real linked OFF loads and retries, preflight cancellation, ID collisions/reuse,
  and actual menu/History/error text.
- The Try current importer route uses a synthetic displayed audit marker over
  an actually authorized OFF file. Native import, geometry, source metadata and
  on-disk bytes remain real. This tests UI routing, not the audit classifier.
- Pending-load screenshots at 1200×760 and 1500×950 are retained beside that
  receipt; no horizontal document overflow occurs. The smaller view was visually
  inspected. The whole source/geometry remains visible while loading.

Packaged workflows, portable and source-pair verification are pending.

## Remaining core work

Continue construction feedback and broader publication/export review. In
particular, audit direct `addDocument` continuations such as Certify current and
global Cancel during a completed-but-delayed construction reply. Reproduce these
with held native results before changing their behavior. Saved-tour actor section
materials still rebuild. Fresh-user observation remains unperformed; staged
integrations remain deferred. Existing section/ownership timing measurements
retain their stated hardware and scope; this release makes no new FPS claim.
