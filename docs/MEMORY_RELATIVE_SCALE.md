# Relative-scale memory Add / Blend

R6-MEMORIES closes the controlled-sizing slice of DOC-02 and CON-06. The chosen
conformance tranches are `con-06-add-dual-scale` (literal cube/octahedron sizing,
overlay versus merged shell) and `con-06-compound-parts` (stable current leaf IDs,
nested deletion and replay). These are bounded native/renderer checks, not a
Stella 6.0 comparison or a claim that either complete scenario is qualified.

Open **More → Memories** in the bottom workspace dock, with Expert mode off.
Store a Model or Derived snapshot in one of nine slots, choose **Relative scale**
(`memory-scale`, default 1; native expressions such as `1/2`), then **Add**
(`memory-add`) or **Blend (merge)** (`memory-blend`). Existing Store/Open/Swap/Clear
IDs and shortcuts remain. **Blend options** (`memory-blend-options`) is collapsed;
it contains winding (`memory-fill-rule`) and coplanar color
(`memory-color-policy`) policies. `memory-cancel` cancels numeric/native work;
`memory-addition-result` reports the chosen scale and Blend winding residual.

Coordinates of the stored snapshot are first converted from its declared unit
to the selected source unit, then multiplied by the relative scale about the
coordinate origin. This scales translations too; there is no automatic centering,
radius matching, rotation or placement. For example, 2 cm at scale 1/2 added to a
millimeter document becomes 10 mm. The native export unit contract supplies the
rational unit factor; model-unit/physical-unit mixtures are refused. Relative
scale is finite and in [1e-9, 1e9]. Geometry remains binary64 approximate, even for
rational expressions or rational input. Native validation/resource limits apply.

Add preserves disjoint literal incidence in matching intrinsic/embedding
dimensions (2–4), including coincident components and source face/cell colors.
Each result leaf receives an ID deterministic for that source geometry, relative
scale and leaf position, so keep/delete recipes can replay. IDs belong to the
result; source component IDs and source paths remain explicit provenance.
Changing scale can assign new result IDs. No solid-union interior is inferred.

Blend chains the existing `merge-compound` recipe after `compound-add`. It
supports closed oriented intrinsic 3D components, 4–100 aggregate source faces,
at most 1,200 boundary corners, and one connected output shell. Thin, ambiguous,
nonmanifold and disconnected results are refused. Winding classification is
approximate; the result reports its residual and does not retain compound leaf
IDs after the topology-changing merge. Even/odd winding differs from nonzero
winding for nested solids. Existing hole/decomposition rules apply; this adds no
general Boolean kernel or new engine operation.

Both actions prepare an independent document before publication: seed → Add,
or seed → Add → Merge. Undo/Redo visits those states; replay and parameter
branching use the recorded original memory model, declared units and numeric
scale without consulting the live slot. A failed/canceled merge publishes no
intermediate document. Publication rechecks the source, notes, units, content,
options, slot bank, export state and 100-document limit. Source documents and
slots stay unchanged until an explicit Swap/Store/Clear. Swap/Open retain their
existing snapshot semantics; they do not transplant another document's recipe
graph. The sizing field is a session control; the chosen value persists in the
result recipe and `metadata.memoryAddition` receipt.

The result retains the selected source notes, document metadata and unit.
Source annotations use the existing detached-content policy (recoverable from
the source snapshot/history); stored notes/annotations remain in the immutable
slot and are not concatenated or attached to changed result elements. Add keeps
source boundary colors; Blend defaults to refusing conflicting coplanar colors,
with an explicit first-source option. Result component source snapshots describe
the converted/scaled geometry; the recipe keeps the original stored geometry.

Verification:

- Python: `python -m pytest tests/test_memory_addition.py tests/test_model_memories.py tests/test_compounds.py tests/test_recipes.py tests/test_coplanar_regions.py tests/test_history.py tests/test_history_migrations.py -q -p no:cacheprovider`
- Node: new `memory-addition-controls.test.mjs` and
  `memory-addition-mounted.test.mjs` are included in `test:features`; the latter
  drives the real renderer in headless Chromium with the native JSON-lines
  engine through Store → scaled Add → Undo/Redo → replay → Blend → Swap → reopen.
- Existing memory publication, history, numeric, blending, derived-context and
  engine allowlist suites are run alongside the new tests. Vite production build
  uses `npx.cmd vite build --configLoader native`.

Electron, packaged desktop qualification and competitor conformance remain for
the lead's release environment.

Executed November 9, 2026: **160 Python tests and 299 Node tests passed**;
the new suites contribute 20 native tests, 26 control tests and one mounted
workflow. Vite built 359 modules successfully with existing chunk warnings;
`git diff --check` passed. No Electron launch or commit was performed.
