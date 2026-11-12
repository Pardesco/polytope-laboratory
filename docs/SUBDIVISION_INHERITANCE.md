# Subdivision inheritance — CON-08

Scenario: `con-08-subdivision-inheritance`. This closes a bounded local
inheritance qualification for a literal colored cube with face text. It does
not establish Stella 6.0 option equivalence or qualify the rest of CON-08.

## UI

With Expert mode off: **Construct → Conway / Subdivide → Face subdivision
and Conway operators → Subdivision inheritance**. The existing controls retain
their IDs and immediate-apply handlers.

- `inheritance-kind`: choose settings from face subdivision, Conway notation,
  or the existing **Subdivide edges** panel.
- `preview-subdivision-inheritance`: compute an ownership report without
  replacing the document or its history.
- `subdivision-inheritance-status`: counts, RGBA inheritance, content archive
  counts, and approximate/regularity disclosure.
- `subdivision-inheritance-owners`: expandable result face → source face and
  stored RGB/RGBA owner table, plus detached content owners.
- `adopt-subdivision-inheritance`: recompute using the normal recipe workflow;
  reject geometry, stored color, units, notes or content disagreement before
  publication. Adoption supports ordinary Undo/Redo, saving, reopen and replay.
- `cancel-subdivision-inheritance`: cancel numeric evaluation/native preview.

Face settings are `face-method` / `face-height`; Conway settings are
`conway-notation` / `conway-height`; edge settings are `edge-divisions` /
`subdivision-edge-ids`. Numeric fields use NumericEntry expressions. To obtain
two refinement levels, preview/adopt once, then repeat on the result. A level
is a consecutive native step; the inventory's unspecified “frequency” field
is **not** asserted to mean this in Stella.

## Owner contract

Centroid, midpoint and kis child faces retain their immediate parent face ID
and stored color (including encoding, alpha zero and unassigned/null).
Conway's unseeded kis-only sequences compose these maps and now preserve the
colors computed by their kis steps. Other Conway operators have no proven
original-face color map: their result colors are unassigned and the source
colors remain in source history. An explicit seed starts a new model, not a
copy of the current model's attributes. Coordinate units and the fill rule
survive unseeded refinement. Catalog/classification claims are not copied to
the result's top-level metadata.

The existing native content policy deliberately detaches **all** vertex,
edge, face and cell text/texture entries for these operations, including a
one-segment edge subdivision. Face ancestry alone does not justify copying a
label or a UV image onto every child face. The archive retains complete source
geometry/colors, content/assets, notes and units. Repeating a refinement with
no new active labels retains the original archive without duplication. Undo
restores the original active content. The report distinguishes face ancestry
from active annotation correspondence.

The read-only `subdivision-inheritance-preview` operation runs the same
validated recipe path as adoption. It returns a candidate state and schema-v1
receipt; it is not itself an operation-history node. Geometry and owned data
are compared at adoption, with volatile result IDs and their regenerated
annotation source hash excluded. Native project/content validation remains
responsible for validating those hashes. Source/content/settings/history
changes revoke the preview; observer camera/rotation changes do not.

## Oracles and limits

`tests/fixtures/r8_subdivision_inheritance.json` pins literal unit-cube vertices,
cycles, distinct byte/unit RGBA values, nulls, zero alpha and independent
one/two-step counts:

| Method | First V/E/F | Second V/E/F |
| --- | --- | --- |
| Centroid | 14/36/24 | 38/108/72 |
| Midpoint | 26/48/24 | 98/192/96 |
| Kis; Conway k | 14/36/24 | 38/108/72 |
| Edge divisions 2 | 20/24/6 | 44/48/6 |
| Edge divisions 1 | 8/12/6 | 8/12/6 |

Kis uses 0.01 source-unit height on this fixture; its second face-subdivision
result can be generalized/nonconvex. Conway requires convex intermediates and
uses its bounded automatic height policy for two-level qualification. Fixed
height 0.01 is refused for a second Conway k on the first low pyramid. Tests
also exercise d/a/t/j/e color/content detachment and composed `kk` lineage.

Independent checks cover first-face cycles, centers/midpoints, zero-height
plane and area residuals below 1e-14, closed edge valences and Euler counts.
No coordinates are certified exact; no uniformity/equal-edge claim is made.
Existing face-construction restrictions remain: intrinsic 3D simple convex
planar faces, no compound/cell sources; positive kis needs a verified convex
input. Star faces and 4D face refinement are refused. Edge subdivision keeps
its broader literal incidence domain and resource bounds. Large documents
remain subject to recipe, archive and annotation budgets; previews do not
bypass them. This is a textual ownership preview, not a temporary viewport
geometry display.

## Verification

- `python -m pytest tests/test_subdivision_inheritance.py tests/test_w12_constructions.py tests/test_edge_subdivision.py tests/test_element_content_workflow.py -q -p no:cacheprovider`
- `node --test tests/subdivision-inheritance-controls.test.mjs tests/subdivision-inheritance-mounted.test.mjs tests/subdivision-controls.test.mjs tests/face-conway-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs`
- `npx.cmd vite build --configLoader native`

The mounted test uses Chromium/SwiftShader and the real JSON-lines native
engine; it does not launch Electron or certify packaged/desktop behavior.
It tests all six fixture cases at two levels and rejects tampered adoption
before history replacement. No competitor execution or independent specialist
review is claimed. Both new Node suites are registered in `test:features`.
