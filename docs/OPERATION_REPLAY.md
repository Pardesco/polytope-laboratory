# Operation replay

The History shelf can Replay a recorded construction or edit its Parameters in an independent document. Replay verifies every dependency against its retained source geometry. Parameter editing replays the selected operation's original parent before applying the new values, so changing a scale from three to four produces four times the source rather than twelve times. Older snapshot-only documents remain readable and acquire source associations when their first recipe operation is committed.

`engine/history.py` implements the version 1, append-only graph. `engine/recipes.py`, native project validation and the desktop History controls integrate recording, replay and parameter branches. This does not establish replay for every existing operation or full specification completeness.

An `OperationHistory` owns immutable serialized bytes. `to_dict()` returns detached JSON data suitable for persistence; changing it cannot edit the graph. Recording returns a new history and preserves the previous history. Source edits use a new source node, optionally parented to the old source for lineage. Parameter edits use a new operation node with the original parent, creating a branch rather than replacing an earlier record.

## Record contract

```json
{
  "version": 1,
  "nodes": [{
    "id": "scale-two",
    "parent": "source-cube",
    "inputs": ["source-cube"],
    "op": "transform",
    "params": {"scale": 2},
    "numericPolicy": {"mode": "float64-approximate", "tolerance": 1e-8},
    "algorithmVersion": "0.1.0",
    "sourceSnapshotHash": "<SHA-256 of the root source snapshot>",
    "resultFingerprint": "<engine representation fingerprint>",
    "snapshot": {"model": {}, "view": {}, "notes": "retained state"}
  }]
}
```

The example omits the required earlier source node and its actual geometry for brevity. A source node uses `op: "source"`, empty inputs and parameters, and its own snapshot hash. Operation inputs name earlier node IDs; the first input must be the parent. IDs are unique, nonempty strings of at most 128 characters. Nodes are stored in dependency order, so self-reference, cycles and forward dependencies are rejected. A source node's parent records lineage and does not require executing the old source to read the edited snapshot.

Snapshots retain complete serialized state, including geometry, view and metadata. The source hash covers the complete source snapshot with sorted JSON keys and equivalent integer/float and negative-zero number spellings normalized. Operation descendants inherit that source hash. Every snapshot receives native geometry validation, and its declared result fingerprint must agree with its supplied source geometry. Hashes detect inconsistent records; they do not prove that an arbitrary stored operation actually generated a result.

## API and replay scope

| Function | Result |
| --- | --- |
| `create_history()` | Empty immutable version 1 history |
| `validate_history(graph)` | Bounded, validated immutable history from plain JSON or another history |
| `record_source(history, id, state, parent=None)` | New history with detached source snapshot |
| `record_operation(history, id, parent, op, params, state, ...)` | New history with detached parameters, inputs, policy and result snapshot |
| `append_operation(history_or_None, sourceNodeId, sourceState, operation, params, resultState, newId)` | Atomically seed a missing source and record a new operation |
| `validate_document_history(document)` | Validate document/state associations; return immutable graph or `None` for legacy documents |
| `replay_history(history, dispatcher, target=None)` | Detached states indexed by node ID, after replay verification |
| `canonical_model(model)` | Complete ordered coordinate/incidence representation for direct comparison |

The caller injects `engine.server.dispatch`; the history module does not import the server. Reflection is a transform matrix. The supported unary dispatch contracts are:

| Operation | Parameters | Algorithm version |
| --- | --- | --- |
| `transform` | `matrix`, `translation`, `scale` | `0.1.0` |
| `section` | `normal`, `offset`, `fill_rule` | `0.1.0` |
| `dual` | `center`, `radius` | `0.1.0` |
| `incidence-dual` | `center`, `radius` | `0.5.0` |
| `truncate` | `amount` | `0.1.0` |
| `extrude` | `height` | `0.1.0` |
| `cell` | `kind`, `index` (`kind: "face"` also extracts faces) | `0.1.0` |
| `facet` | `faces`, `name` | `0.1.0` |

All use the recorded float64 numeric policy. Recording infers the audited algorithm version for each operation unless explicitly supplied. Unknown operations, algorithms and numeric policies remain readable as retained snapshots, but replay fails explicitly at that node. Empty or tangent sections do not produce a model snapshot and are not replayable under this contract. Native recipes may record `rational-dual`, but its replay remains explicitly unsupported until an exact-policy contract is qualified.

Replay checks every intermediate before executing its descendants. It compares intrinsic and embedding dimensions, interpretation, ordered vertices, every ordered edge/face/cell reference, rational coordinates and complete convex-piece representations directly, then also checks the result fingerprint. No hull conversion, face sorting or cyclic face normalization can hide a changed source representation. Volatile generated UUIDs, names, view fields and computed caches are excluded from geometry equality; the retained state remains available with those fields. A dispatcher receives a detached request so it cannot mutate an earlier replay result.

With `target`, only that node and its input dependencies are replayed. Other branches can retain unsupported operations without preventing replay of a supported branch. Without a target, every recorded node is checked. A mismatch or dispatch failure produces an explicit node-specific error; it never publishes a partial new history or rewrites the saved snapshot.

Recorded algorithm versions identify the audited operation implementation, not a complete NumPy/SciPy/platform environment. Float64 replay requires exact equivalent supplied coordinate values under the current implementation; another environment can fail verification while the retained snapshot remains readable. The desktop supports JSON parameter editing for the eight qualified operations. There is no claim of exact replay arithmetic, cross-platform bitwise reproducibility, compound replay or replay of all construction families.

## Document association contract

Persist the graph as `document.operationHistory` and associate each saved state using `state.operationNode`. For a graph-bearing document, every state must name an existing node and supply geometry equal to that node's retained snapshot under the complete canonical comparison. Current camera/display fields, notes and other state context may change without rewriting the geometry record. Associations and graph snapshots are checked independently; a valid fingerprint alone cannot authorize association with another geometry. Legacy documents with neither field remain readable. A state association without a graph, a missing association in a graph-bearing document, or a forged geometry/reference fails explicitly. The validator returns the immutable graph and never mutates the document.

`append_operation` accepts an existing source node or an earlier operation result as the parent. If the requested source ID is missing, it records a new source first and returns both records in one new history. If that ID already exists, the current source geometry must match its retained snapshot; current display edits are allowed. Changed geometry requires a new source node ID, so old branches remain intact. Failure in either record leaves the original immutable history unchanged. Native recipes seed associations for prior legacy states before attaching the first operation graph. Project validation checks all associations. Creating an operation after Undo may replace the redo portion of linear history, while the discarded result remains retained in the append-only graph.

## Bounds and independent verification

Graphs allow at most 1,024 nodes, 16 input references per node, 32 MiB per serialized node and 128 MiB per graph. Traversal is capped at depth 64 and eight million values; finite plain UTF-8 JSON is required. Cyclic Python containers, nonfinite numbers and non-JSON values are rejected before publication.

```powershell
python -m pytest tests/test_history.py -q
```

Twenty-seven cases pass. The hand-authored Cartesian cube lists its coordinates and incidence without calling a generator. Its scale/reflection/central-section chain is checked against analytic coordinates, preserved/reversed face order, square edge lengths and independent vertex/edge/face counts. Construction fixtures check the six-vertex octahedral polar dual, cube rectification (12/24/14), quarter-cut branching (24/36/14), square-to-3D and cube-to-4D extrusion layers, a literal pentagram's ordered manual facets and face extraction, and double incidence dual recovery of a literal great icosahedron. The named-star fixture lists analytic golden-ratio vertices and all 20 triangular cycles; it calls no runtime generator or face enumerator.

Additional cases cover detached ownership, atomic source seeding, document associations with edited display state, forged associations, parameter/source branches, unknown semantics with readable snapshots, explicitly unsupported rational duals, native/JavaScript number spellings, forged hashes, altered valid intermediate geometry, an intentional fingerprint collision, repeated IDs, cycles, dependency order, resource limits, unavailable targets and contextual dispatch errors.

`scripts/recipes-smoke.cjs` drives the real desktop in an isolated profile and supports `POLYTOPE_TEST_EXECUTABLE` for packaged verification. Packaged mode deliberately makes the development Python override unavailable. The integrated 0.11.0 development desktop passed all 11 workflows with no renderer errors in `artifacts/recipes-smoke-BWOgF9`. These cover legacy disabled controls, full scale-two source geometry and incidence, independent replay, retained Undo branches, scale-four parameters from the original parent, graph save/reopen, malformed JSON/native parameter rejection without publication, and an unsupported nested export record retained readably while no file is written. The same test loads attributed J92, U75 and a regular 4D star through actual library search. The final workspace screenshot was inspected. Packaged recipe verification remains pending.


## Packaged 0.11.0 verification

The shipped 0.11.0 desktop passed this workflow with development Python disabled.
Evidence: [artifacts/recipes-packaged-smoke-LxjF54/result.json](../artifacts/recipes-packaged-smoke-LxjF54/result.json). This supersedes earlier
packaged-verification-pending notes for the tested subset. It does not establish
requirement-wide competitor conformance. The actual portable launcher and all
3,064 linked-source hashes also passed; see [release evidence](../artifacts/release-0.11.0.json).
