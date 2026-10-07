# Versioned cell extraction with source attributes

The versioned implementation is mounted in `engine/cell_attributes.py`, with
strict native dispatch and recipe/history hooks. The frozen `cell/0.1.0`
implementation remains available explicitly. This is numerical source ownership
and attribute preservation, not installed Stella output equivalence or completion
of the original 73 requirements. No GUI qualification is claimed by this document.

The observed native loss is concrete: `engine/nets.py:extract_entity` stores a
source embedding and vertex/face IDs but does not inherit coordinate units or
face/cell RGBA. Its convex branch also rebuilds the selected cell with a Hull;
its generalized branch retains source face cycles. Those legacy results remain
the definition of recorded `cell/0.1.0` operations.

## Public native APIs

```python
VERSION = '0.2.0'
LEGACY_VERSION = '0.1.0'
extract_cell(source, index=0) -> Model
dispatch_cell(request, dispatcher=native_dispatch) -> Model
verify_cell_evidence(model) -> {passed, algorithmVersion, resultModelId, certified}
run_cell(document, params, label='Extract source cell',
         version=None, dispatcher=native_dispatch) -> document
replay_cell_history(history, dispatcher=native_dispatch, target=None) -> states
replay_cell_document(document, target=None, dispatcher=native_dispatch) -> document
branch_cell(document, params, target=None, dispatcher=native_dispatch) -> document
```

The strict request is:

```json
{
  "op": "cell",
  "algorithmVersion": "0.2.0",
  "model": "<complete source Model object>",
  "params": {"kind": "cell", "index": 0}
}
```

`kind` and `index` default to `cell` and `0`. The new version accepts literal
integer indices only and refuses face extraction, unknown parameters and unknown
versions. Optional native `id` is a bounded string or safe nonnegative integer.
Native dispatch defaults to `0.2.0` for cells and `0.1.0` for faces.
Explicit versions are authoritative: `0.2.0` refuses face extraction, while
`0.1.0` calls the unchanged legacy kernel directly without adapter recursion.
`select_cell_version(params, version=None)` provides the same selection to recipes.

## Geometry and ownership

The source must be a validated intrinsic 4D Model. A selected cell must resolve
affine rank three, be planar at relative float64 tolerance `1e-8`, and have
exactly two face incidences on each boundary edge. No closing face, welding,
coincident-face removal, reordering of a face cycle, or convex Hull substitution
is performed. Nonconvex and crossed ordered cell cycles can be extracted; they
retain generalized interpretation and receive no filled measure.

Vertices follow sorted original vertex IDs. Faces follow the selected source
cell's face-ID list in its original order. Edges follow original source edge-ID
order, including their endpoint order, restricted to the selected face boundary.
Wire edges that merely have endpoints inside the selected vertex set are not
invented as cell-owned edges. Original source records remain in the snapshot.

A deterministic frame uses the selected vertices' centroid as origin and the first
three independent displacements from the first source vertex in ID order. Two-pass ordered
Gram–Schmidt constructs a 4-by-3 orthonormal basis. Its cofactor normal completes
a proper 4D ambient frame with determinant +1. This is a new versioned frame;
it preserves the legacy centered-cell convention without reproducing its SVD axes.
Normalized offsets are averaged before conversion back to source units. This keeps
zero-centered core and common-sphere operations away from the first source corner.
Reconstruction evidence
checks every selected source point in normalized coordinates. Physical lengths
are unchanged, and coordinates reconstruct through `origin + basis @ point`.

`metadata.cellExtraction` contains:

- The full original source snapshot, original model ID and current geometry
  fingerprint, plus a hash of native-equivalent complete source JSON.
- Result-to-source vertex, edge and face maps; `maps.cells=[index]` identifies
  the **parent cell**, not a nonexistent cell of the 3D result.
- Frame anchors, basis, normal, scale and residual evidence.
- Selected parent cell RGBA and the explicit face/cell color policy.
- Current result ID/fingerprint/interpretation and bounded numerical
  classification/native project evidence.

The deterministic result ID hashes the full semantic source, selected cell and
version. Fingerprints alone do not bind colors, unit labels, provenance or maps;
the fresh verifier reconstructs and compares the complete result. The hash is
binding evidence, not authorship authentication or an exact certificate.

## Color and unit semantics

Each result face receives the **literal RGBA of that source face**, including
`null`. Byte and unit encoding, three/four channel arity and alpha are preserved.
The result's `metadata.offColors.cells` is empty because it is a 3D Model with
an empty cell table. The selected 4D cell color is retained separately as
`metadata.cellExtraction.selectedCellColor`. It does not silently override
face colors or become an invented 3D face fallback. A future renderer may offer
an explicit cell-owned color presentation; this operation does not add one.

The model inherits an existing `metadata.coordinateUnits` label (`model`, `mm`,
`cm`, `m`, `in`, `ft`) without rescaling. Absent units remain absent. Other unit
labels are currently diagnosed as unsupported, not guessed or converted.
Document view units persist independently. Arbitrary original metadata,
component records, factor symbols, source face/cell colors and exact source
certificates remain historical in the full source snapshot. They are not copied
as false current component maps, rational certificates or source Hull caches.

## Convex interpretation and native gates

An imported/generalized source is not promoted by this extraction operation,
even when the extracted cell matches a convex boundary. Classification evidence
may report that agreement while the current Model remains generalized.

A predeclared convex source retains a convex cell declaration only after the
independent classifier verifies every retained vertex, ordered face cycle and
edge against the complete reference boundary. The reference Hull is used for
verification only. Mapped facet vertices/support equations are published for
native downstream operations. Native filled content and boundary measure must
be finite and at least the smallest normal float; otherwise the literal result
falls back to generalized with an unsupported-measure diagnostic. A detached
native JSON project validation must preserve the complete result. Failure is
atomic and never discards the original source or changes its attributes.

All evidence is numerical and uncertified. In particular this is not a uniform,
exact topology, boolean solid, arbitrary nonmanifold-cell or installed-baseline
certificate. Source duplicate/collinear refinements outside the classifier's
domain remain literal generalized incidence, not simplified geometry.

## Native version and replay ownership

Current cell recipes record `0.2.0`; face recipes record `0.1.0`. Explicit
legacy operations retain their original SVD/Hull-or-ordered-cycle geometry,
missing colour/unit behaviour, and version. Parameter branches preserve the
selected node's recorded version; upgrading is a separately requested operation
from a verified parent, never a replay side effect. Legacy native replay may
reissue its result UUID as before; `0.2.0` IDs are deterministic.

Required ancestry containing `cell/0.2.0` routes through full-attribute replay
before older custom workflow routers. The source-zonohedron router has higher
priority and delegates recorded cells through verified source-only temporary
graphs. All cell dispatches forward their recorded version. Selected cell
branches inside zonohedron histories delegate `branch_cell`, preserving legacy
versions rather than upgrading them through an ordinary current recipe.

The traversal reconstructs each required `0.2.0` result, delegates registered
ancestors/descendants to actual native source-only temporary graphs, and checks
full model attributes afterward. Changed source colours, unit labels or metadata
reroot the complete historical source before a new operation is appended. Forged
face colours, units, maps or historical cell RGBA fail replay even when the
geometry-only fingerprint remains valid. Unknown future versions remain readable
as retained snapshots but cannot silently replay as legacy.

Existing native IPC operations `cell`, `recipe-run`, `recipe-replay` and
`recipe-branch` expose this behaviour; no importer or desktop allowlist changes
were needed. The direct strict request is processed before generic parameter
coercion. Original source models and documents remain immutable.

## Bounds and verification

Source bounds: 1024 vertices, 8192 edges, 4096 faces, 1024 cells, 65536 aggregate
coordinate/incidence entries, 16 MiB JSON. Selected cell: 256 vertices/512 faces.
Result payload: 32 MiB. Native history/project structural limits also apply.
Coordinates follow the existing source bound `1e100`; resource/UTF-8/JSON gates
run before copying or numeric work. Float/bool IDs, unsafe decimal integer
spellings, cyclic/deep metadata, unpaired surrogates, malformed RGBA, stale
source fingerprints, nonplanar/open cells and unresolvable frames are refused
as `GeometryError`. Scientific floats such as `1e99` remain portable attributes.

The kernel suite has 88 passing tests, with full ordered topology, null/unit/byte
RGBA, extreme-scale gates, literal star cycles, source components, malformed
transport and attribute-forgery checks. The actual mounted workflow suite covers
current and legacy dispatch, versioned recipe branches, save/reopen, source-only
replay, custom ancestors/descendants, zonohedron/transform histories, and native
JSON-lines continuation after refusal. Actual registered 120-cell and 600-cell
tests select their last cells (IDs 119 and 599), retaining the full source snapshot,
all source face colour mappings, units and parent-cell colour. Their results have
20/30/12/0 and 4/6/4/0 vertex/edge/face/cell counts respectively.

Run the owned headless suites:

```powershell
python -B -m pytest -q -p no:cacheprovider tests/test_cell_attributes.py tests/test_cell_attributes_workflow.py
```

The independent fixtures cover all eight literal tesseract cells, translated
oblique/reflected embeddings, signed star-prism cap cycles, offset component
source IDs, absent/null colors, preserved alpha, orphan wires and unit ownership.
Convex cube measures are checked analytically; tiny underflow retains a native
valid generalized result. Tests include real Node serialization/native JSON
Save/Open, actual transform ancestry/descendants, original-parent branches,
changed-attribute rerooting, source-only targets, full-attribute tamper refusal,
legacy face/cell replay and cold native JSON-lines error continuation. Current
production registration remains `cell/0.1.0` throughout these tests.

The final owned suite passed **88 tests in 12.58 seconds**. It also exercises
actual mounted `convex-core-4d → development cell/0.2.0 → convex-core` ancestry,
unknown history versions/policies/dependencies/source hashes, and raw float
parameter/incidence refusal before JSON normalization. No production inputs,
registered tests or frontend files were changed, and no GUI was launched.
