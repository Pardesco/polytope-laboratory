# Portable 3D PNG environments (R6-MATERIALS)

This tranche extends scenario `vis-03-reflection-refraction` (VIS-03) with an
imported equirectangular PNG environment. It retains the existing studio and
procedural bump options; `vis-03-bump` remains a separate scenario. This is a
local implementation contract, not an executed Stella 6.0 comparison.

Open a 3D model, then **Appearance → Bump and environment**
(`surface-settings`, `material-effects-settings`). Choose a PNG with
**Equirectangular environment · 2:1 PNG** (`effects-image-file`) and click
**Import PNG environment** (`effects-image-import`). The Environment selector
(`effects-reflection`) changes to **Imported PNG - 3D surface sampling**.
**Environment mode** (`effects-environmentMode`) chooses Reflection or
Environment-only refraction. **More effect options** exposes the existing
blend and refractive index fields. Click **Apply effects** (`effects-apply`)
after editing these fields. The controls are available without Expert mode.
`effects-image-status` reports embedded dimensions; `effects-image-remove`
removes the PNG. **Turn off** resets all effects, including the embedded asset.

## Definition and persistence

The PNG is a latitude/longitude panorama covering the sphere in 2:1 aspect.
Three.js converts its sRGB RGB image to an environment cube and samples it
using reflected/refracted surface directions. The image's top is +Y, the
horizontal seam is along -X, and the center direction is +X; this follows
Three.js's equirectangular mapping. Alpha does not affect sampling. Refraction
uses the existing ratio `1 / refractiveIndex`. These are Phong environment
samples, without object thickness, multiple interfaces, traced rays or a
claim of physical glass. Background settings remain independent.

Native read-only operation `material-environment` accepts bounded PNG bytes
and returns a normalized embedded `{mime,width,height,base64}` record. It
uses the existing native PNG validator (chunk structure, CRC, complete decode,
single frame, resource bounds), strips metadata and converts to RGBA. Accepted
panoramas have height 2–512, width exactly twice height, and at most 4 MiB of
input/normalized bytes. The shared decoder additionally limits dimensions to
4096 and decoded pixels to 8 Mi before the panorama domain check. No URL or
local path is stored or fetched. Project validation independently decodes the
asset and checks its dimensions and canonical bytes.

The asset and settings live in `view.materialEffects.environmentAsset` and
are embedded in project JSON; reopening requires no source image. Import and
settings changes follow the existing view-edit/dirty policy, without adding
geometry operation history. Source geometry and observer camera are unchanged.
Import publication is fenced by source/document ownership, settings, file
identity, export state and cancellation.

## Output and limits

PNG preparation waits for the owned texture to decode, checks decoded
dimensions, and refuses failed, stale or canceled preparation. Replacement and
removal dispose the prior texture. Export uses the same prepared surface map.
Paper-net printing remains the source face color/annotation workflow: it does
not bake observer-dependent environment shading into net SVGs. Physical
printer qualification and Electron execution were not performed here.

Import/apply refuses sources outside intrinsic/embedded 3D. Existing saved
settings can transfer to other views through normal app workflows; their asset
is retained but inactive on 4D and net views, with an explicit diagnostic and
capture receipt. The existing 12,000-source-face environment limit still
applies. HDR/JPEG environments, custom cube faces, imported bump/normal maps
and 4D optical physics are outside this tranche.

## Verification

`tests/fixtures/material-environment.json` is an original synthetic RGB
panorama. `tests/test_material_environment.py` checks native normalization and
pixel preservation, invalid records/CRC/domain/size refusal, actual project
save/load in both optical modes, and unchanged printable net pages.
`tests/material-environment.test.mjs` checks decode ownership, mapping,
capture waits/failure/cancellation, disposal, inactive domains, atomic import
and numeric editing with large embedded assets.
`tests/material-environment-mounted.test.mjs` runs the mounted app with the
real JSON-lines engine in Chromium/SwiftShader, Expert off: native import,
validated project reopen, literal asset/source equality, exact exported pixel
hash equality before/after reopening for each mode, distinct reflection versus
refraction pixels, transparent PNG at double resolution, and changed pixels
after removal. This qualifies the tested
browser renderer, not a shipped GPU or competitor.

Commands and results:

```text
python -m pytest tests/test_material_environment.py tests/test_material_styles.py tests/test_display_state.py tests/test_net_printing.py tests/test_project_geometry_reuse.py -q -p no:cacheprovider
67 passed

node --test tests/material-environment.test.mjs tests/material-environment-mounted.test.mjs tests/material-styles.test.mjs tests/section-viewer.test.mjs tests/engine-op-allowlist.test.cjs tests/engine-pool.test.cjs tests/png-capture-options.test.mjs tests/image-capture-session.test.mjs tests/target-render.test.mjs tests/appearance-sheet.test.mjs tests/common-workflows-mounted.test.mjs tests/renderer-contract.test.mjs tests/viewer-ux.test.mjs
116 passed

node --test tests/material-environment-mounted.test.mjs
1 passed (rerun including transparent double-resolution output).

npx.cmd vite build --configLoader native
Passed; existing bundle-size/dynamic-import warnings remain.
```
