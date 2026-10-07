# Model memories

The Memories shelf stores nine immutable model snapshots. Choose a slot and Model or Derived, then Store, Open, Swap, Clear or Add. Open recalls the saved geometry in an independent document; Swap recalls that geometry and replaces the selected slot with the current source snapshot after native validation succeeds. Add combines the current selected source with the stored model in an independent compound document while preserving their supplied coordinates and relative sizes. Empty slots and unavailable derived models disable the relevant actions. Animation export disables memory actions.

`ui/model-memories.mjs` implements the versioned data contract; `ui/memory-controls.mjs` supplies the shelf and shortcuts. Project save/load and recall use authoritative native geometry validation. Add is available when the native addition callback is supplied; it receives detached states and leaves the memory bank unchanged. This work does not yet establish DOC-02 parity: blending coplanar faces and optional coincident-face removal remain separate work.

| Shortcut | Action |
| --- | --- |
| Ctrl+Alt+1 through Ctrl+Alt+9 | Store in the numbered slot |
| Alt+1 through Alt+9 | Open the numbered slot |
| Alt+Shift+1 through Alt+Shift+9 | Swap with the numbered slot |

Shortcuts ignore editable controls, open dialogs and animation export. Store and Swap capture the selected Model or Derived source; Open and Clear act on the selected slot regardless of that source choice. A document change during asynchronous capture rejects the action rather than storing stale geometry.

Each slot stores a complete serialized state snapshot, including intrinsic geometry, view, notes, metadata and any other plain state fields supplied by its caller. Ordered face cycles and cell references are retained exactly. Generalized complexes and non-solid surface intersections retain their interpretation; storing does not hull, project, sort, simplify or change the source. Slots may contain intrinsic 2D, 3D or 4D models with source coordinates in an embedding dimension from the intrinsic dimension through 4.

## Persisted record and API

```js
{
  version: 1,
  slots: [ // Exactly nine entries; public slot numbers are 1..9.
    {
      state: {model, view, notes, /* other persisted state fields */},
      source: {documentId, stateId, modelId, derivedMode, /* optional context */}
    },
    null, null, null, null, null, null, null, null
  ]
}
```

`source` is a plain serialized provenance record supplied by the caller. Its fields are optional. Legacy models, documents and states do not need identifiers; the module never invents IDs or attaches current document identity to a retrieved model. Source identity and geometry provenance have different roles: `state.model.provenance` is retained with the geometry, while `source` describes where the stored snapshot came from.

| Function | Result |
| --- | --- |
| `createMemories()` | New frozen empty version 1 bank |
| `normalizeMemories(value)` | Validate and detach a persisted bank; `undefined` produces an empty legacy bank |
| `storeMemory(bank, slot, state, source={})` | New frozen bank containing a detached snapshot in the selected slot |
| `retrieveMemory(bank, slot)` | Detached mutable saved state |
| `retrieveMemoryEntry(bank, slot)` | Detached mutable `{state,source}` entry |
| `swapMemory(bank, slot, currentState, source={})` | `{memories,state,source}`: new bank holds current state; returned state/source belong to the previous slot entry |
| `clearMemory(bank, slot)` | New bank with that slot empty; clearing an already-empty slot is valid |
| `clearMemories(bank)` | New empty bank after validating the original bank |

Slot arguments must be integers 1..9; strings are not coerced. Empty retrieve/swap produces an explicit slot-numbered error. Invalid data throws before a new bank is published. Every operation preserves the original bank. The complete bank is deeply frozen, including nested coordinates, view fields and provenance. Retrieval produces fresh mutable data, so editing a retrieved/current document cannot edit a slot. Immutable slots may be shared internally between trusted frozen banks to avoid cloning every geometry when replacing one slot.

The caller assigns returned banks explicitly; operations never mutate `project`:

```js
project.memories = storeMemory(project.memories, 1, currentState, {
  documentId: currentDocument.id,
  // Legacy currentState.id may be absent; JSON-compatible undefined is omitted.
  stateId: currentState.id
});
const recalledState = retrieveMemory(project.memories, 1);
const swapped = swapMemory(project.memories, 1, currentState, sourceContext);
await restoreState(swapped.state, 'Swap memory 1');
project.memories = swapped.memories; // Publish only after authoritative restore.
```

The workspace must resolve active base/derived view identity before calling store or swap, register returned bank changes with dirty/history controls, and validate recalled geometry through the authoritative engine before committing a document. A derived model needs a suitable view snapshot supplied by the UI; this module cannot infer an observer camera or source-to-derived coordinate adapter.

## Validation and resource contract

Snapshots require plain state, source and view objects, finite JSON numbers and nonempty source coordinates. They reject circular references, functions, BigInts, typed objects, accessors, symbol properties, sparse arrays and custom array properties. Optional undefined object fields are omitted, matching normal project JSON semantics; undefined array entries are rejected. Prototype-looking metadata keys remain harmless own data properties.

Representation validation checks intrinsic/embedding dimensions, rectangular finite coordinates, source index bounds, distinct edge endpoints, duplicate edges, valid ordered face/cell references and the presence of each supplied face-boundary edge. An explicit `model.validation.passed === false` is rejected. Nested `convexPieces`, if present, receive the same representation checks. Missing legacy `embeddingDimension` defaults to the declared dimension for validation and is not inserted into the snapshot; missing `cells` remains optional.

These checks do not independently establish planarity, convexity, closure, rank, manifold status, exact-coordinate certificates or a solid interior. They do not treat a stored validation flag as a newly checked mathematical certificate. Those remain engine validation/recomputation contracts during native save/load and recall. `engine/model_memories.py` validates the persisted envelope and applies the same project geometry validation to each stored snapshot, rebuilding geometry-derived fingerprints, measures and certificates rather than accepting them as authority.

`MEMORY_LIMITS` caps each serialized `{state,source}` slot at 32 MiB and the complete bank at 128 MiB, with 1..20,000 vertices per model, nesting depth 64, two million traversed values per slot and eight million values per bank. UTF-8 JSON bytes include keys, escaping, structure and provenance. Limits are enforced before publication; an oversized replacement leaves the prior bank usable. Expensive caches included in state consume the same budget and should be omitted by the integration only when authoritative parameters remain available for reconstruction. These bank limits do not guarantee that a bank plus document histories fits the native project's separate file-size limit.

## Independent fixtures

```powershell
node --test tests/model-memories.test.mjs
```

Eighteen tests use hand-authored Cartesian cube and central-tesseract-section data, an explicitly listed 4-simplex cell complex, an ordered pentagram with source RGBA and a disconnected surface-section line fixture. They exercise non-aliasing across store/retrieve, double-swap state/source recovery, nine independent slots, immutable clearing, JSON persistence, 4D cell colors/visibility, invalid representation, getter/cycle defenses and serialized resource limits. Controller cases verify rejected restore leaves the bank unchanged, replacement publication follows successful restore, stale derived capture is rejected, and export guards block every action. Addition cases check detached Model/Derived inputs and an unchanged memory bank on native rejection. The fixtures do not call kernel generators or reconstruct expected geometry through the implementation under test.

`scripts/memories-smoke.cjs` drives the real desktop shelf, shortcuts, native save/reopen and derived-section recall in an isolated profile. Set `POLYTOPE_TEST_EXECUTABLE` to validate a packaged executable; that mode deliberately points the development Python override to an unavailable path.

The integrated 0.11.0 development desktop passed nine workflows with no renderer errors in `artifacts/memories-smoke-84zdIB`: native 4D storage, keyboard store, independent-document open, double swap, derived central-section storage/open, clear/save/reopen, editable/dialog shortcut suppression, native Add, and action/shortcut suppression during real PNG export. A unit Cube plus a current Cube scaled by two produced 16 vertices, 24 edges and 12 faces with the exact combined source coordinate multiset; memories and original document geometry stayed unchanged. Cancelled export left the memory bank unchanged and removed unpublished staging files. The earlier saved shelf screenshot was inspected to confirm the compact shelf preserves the geometry viewport. Packaged Memories verification is still pending.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/memories-packaged-smoke-tjMM96/result.json](../artifacts/memories-packaged-smoke-tjMM96/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
