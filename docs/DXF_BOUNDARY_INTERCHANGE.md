# DXF boundary interchange (R6-INTERCHANGE)

Chosen R5 scenario tranche: `io-02-codec-dxf`, with the central-section subset
of `io-02-selected-derived`, `io-01-dxf-face-polyface` true-color handoff, and
`io-02-atomic-publication` cancellation/publication checks. This is local native
and headless-browser evidence, not an executed Stella or shipped Electron comparison.

## User workflow

Open Export → All formats (`export-all-formats`), choose Model or Derived result (`export-source`), choose DXF
(`export-format`), then **DXF geometry → Face boundary · triangles and
quadrilaterals** (`dxf-export-profile`, in `dxf-export-settings`). Choose Output
units (`export-units`), read counts/residuals (`dxf-export-summary`) and losses
(`export-preview`), then **Choose file & export** (`confirm-export`). Expert mode
is unnecessary. Wireframe remains the default and keeps its existing behavior.
The profile persists while this export dialog controller is alive; it is not a
project preference or a model-changing operation, so it creates no history entry.

The boundary profile emits ASCII DXF 3DFACE records with the supplied ordered
triangle/quad cycles (a triangle repeats its third corner in DXF slot four),
LINE records for edges outside face boundaries, and POINT records for isolated
vertices. Each incidence component gets a separate numbered `part_N` layer,
including components with coincident coordinates. No solid or hull is inferred.
The review report retains the layer-to-component ID/name map, but the DXF file
uses numbered names. Reopening preserves the partition, not original component IDs.

Face RGB is emitted as group 420 true color. Imported direct or resolved-by-layer
true color now also enters the app's source face palette (`offColors.faces`),
including explicit polyface face-record colors. Existing diagnostic source styles
remain untouched. Common `$INSUNITS` codes (unitless/mm/cm/m/in/ft) also populate
`metadata.coordinateUnits`; the app's existing document-unit selection remains
in place. Other physical unit codes remain unscaled and produce a diagnostic
requiring explicit document-unit declaration. DXF transparency stays diagnostic
metadata and produces an opaque-palette warning.

## Native contract and losses

Use the existing warm-worker `prepare-export` operation with `format:'dxf'`,
`dxf_profile:'boundary'`, `include_text:true`, and explicit `source_unit` /
`target_unit`. Its reviewed `text` is the publication payload. The ordinary
`export` operation / `formats.export_model` remain the legacy wire codec; no
`formats.py`, desktop export manager, allowlist or new operation was needed.
This avoids the shared codec/desktop exclusive slot entirely.

Coordinates use 17 significant decimal digits, round-tripping the computed
binary64 values. Unit conversion still uses floating arithmetic; this does not
recover exact mathematical coordinates. The mm→in fixtures compare literal
bounds within 1e-14 output units and encoded values to the computed binary64
coordinates without tolerance. RGB unit channels round to the nearest 8-bit
channel; `report.dxf.maxRGBChannelResidual` reports the maximum normalized-channel
error (at most 0.5/255 for supported colors). Byte RGB has zero channel residual.

The preview explicitly reports omitted alpha, original handles/layer names,
ACI/by-layer style definitions, visibility/hidden-edge flags, notes and structured
metadata as applicable. Use JSON/native projects to retain those source records.
Cells are not emitted. Arbitrary polygon triangulation, binary DXF, ACIS, curves,
textures and full ACI palette conversion are outside this tranche. Larger faces,
distinct coincident vertices within one component, repeated edges, cross-component
incidence, unsupported dimensions and importer resource-limit violations refuse
before any destination chooser. Displayed/net assembly DXF retains the existing
wire export; this new profile applies to intrinsic base/derived geometry.

## Verification

`tests/fixtures/dxf-boundary/attributed-mm.dxf` is a literal plate, loose guide
line and isolated marker on three layers. The test-only independent group-pair
reader imports no production DXF parser/helpers. It verifies units, coordinates,
ordered cycles, 8 cube vertices / 12 edges / 6 faces, true color and source
immutability for a 25.4-mm cube and central tesseract section in mm/in. Native
round trips separately verify imported palettes, layer separation, triangle
slots, project persistence, refusal/limits and unchanged legacy wire output.

`tests/dxf-boundary.test.mjs` mounts the actual export controls in headless
Chromium, invokes native Python dispatch, and checks labels, units, losses and
reviewed payload publication. Filesystem tests of the desktop publisher check atomic DXF
replacement/reopen and that profile changes, source changes, cancellation and
chooser cancellation preserve an existing destination. Cancellation during DXF
file fsync removes the private temporary and preserves the destination. No Electron is launched.

Executed native regression command (**187 passed**, including 25 new cases):

```powershell
python -m pytest tests/test_dxf_boundary.py tests/test_dxf.py tests/test_interchange.py tests/test_model_interchange.py tests/test_export_context.py tests/test_export_options.py tests/test_export_metadata.py tests/test_precision_exports.py -q -p no:cacheprovider
```

Node regression (**73 passed**, including 7 new cases) and Vite build (**passed**):

```powershell
node --test --test-concurrency 1 tests/dxf-boundary.test.mjs tests/interchange-controls.test.mjs tests/interchange-mounted.test.mjs tests/interchange-atomic.test.cjs tests/geometry-export-session.test.mjs tests/geometry-export.test.cjs tests/export-dialog-ownership.test.mjs tests/engine-op-allowlist.test.cjs tests/export-goals.test.mjs tests/precision-wording.test.mjs
npx.cmd vite build --configLoader native
```

The build retains existing large-chunk/static-dynamic-import warnings. The
initial six Node cases also passed alone. `package.json` registers the new suite
in `test:features`. Shipped native chooser/desktop qualification remains for the
lead; no competitor-equivalence or broad IO-01/02 completion claim is made.
