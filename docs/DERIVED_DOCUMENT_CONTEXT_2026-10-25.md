# October 25 continuation: document context through promotion and export

Follows [cancel/content ownership](CANCEL_CONTENT_2026-10-25.md). Development
remains 0.27.21; published/qualified 0.27.20 is preserved. The high-impact goal
continues with broad release qualification deferred.

## Implemented

Ordinary derived promotion and derived memory snapshots now use the same
initialDocumentState helper. They preserve the source document's coordinate unit,
notes, document metadata, fill rule and surface color policy. The geometry stays
detached. Missing source units fall back to supported source model metadata;
unsupported legacy unit hints normalize to model units. Explicitly cleared
document fields take precedence over stale imported hints on derived geometry.

The helper retains existing dimension-specific defaults, including section-evidence
presentation for surface intersection curves. It does not copy source-bound
cameras, entity selections, orientation frames or labels/images to new geometry.
Those remain with the unchanged original source; no correspondence is invented.
Ordinary-cell section promotion retains its existing protected native history path.
Ordinary imports and catalog additions keep their existing metadata/default behavior.

The shared addDocument boundary now refuses a 101st document before navigation or
dirty-state changes. This covers imports as well as promotion, preventing a
workspace larger than the native project format permits.

Geometry export now always supplies explicit current document notes and metadata,
including empty text and an empty metadata object. Previously, an imported model
could retain documentNotes/documentMetadata in its source metadata after the user
cleared the document fields. Omitting empty export parameters caused native JSON
export to restore that old content. The change uses the captured document context
and preserves existing source/options/unit/metadata publication checks. Standalone
native export defaults and source geometry metadata remain unchanged.

## Focused evidence

Final current receipt:
`artifacts/document-export-checks-20261025-145229/result.json`.

- **173 Node tests**, eleven files, zero failures/skips.
- **169-module production build**; existing large-chunk warning remains.
- Selected source/test hashes match before and after execution.

The preceding promotion-only receipt
`artifacts/derived-context-checks-20261025-144718/result.json` passed 171 tests
and the build. It is historical after the export/session test changes.

Tests execute actual app document/promotion functions, MemoryControls and
GeometryExportSession. Native Python generates dual/section/surface-section
fixtures and performs Save/Open and export preparation. The physical-scale check
confirms centimeter coordinates export to millimeters at 10 times the source
coordinates while notes/metadata and derived memories survive Save/Open.

The cleared-fields regression was reproduced before the export fix: native JSON
output contained "Old imported notes" after the saved document notes were cleared.
The passing case now checks both base and derived exports after native Save/Open,
then reimports the resulting JSON through the actual document initialization
helper. No old notes or title returns and the geometry source remains unchanged.

Related suites exercise stale derived availability, memory/tour publication,
ordinary-cell section promotion, catalog loading, geometry export ownership,
project workflows, navigation and empty-workspace availability.

No Python/native implementation changed in these passes. Earlier native rebuild
and consolidated review obligations remain. No Electron launch, packaged test,
visible performance claim, full feature-suite run or fresh-user qualification is
claimed. Before release, refresh review/source proofs, rebuild the changed native
engine from earlier passes and perform the deferred broad checks.

## Continue

Prioritize coherent browse, construct/section, net, Save/Open and export workflows.
Inspect remaining handoffs for document attributes and physical scale, especially
net exports and transformations. Keep source-bound annotation ownership intact.
The broader Stella4D conformance ledger remains mostly prototype; this focused
receipt does not establish broad equivalence or release qualification.
