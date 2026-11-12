# Portable grayscale PNG bump maps (R8-OUTPUT-OPTIONS)

Qualifies the grayscale `bump-image` subcase of `vis-03-imported-assets`
(VIS-03), extending `vis-03-bump` beyond its existing procedural modes.
This is a bounded local contract, not full closure of imported material options
or a Stella 6.0 comparison. The frozen conformance inventory is unchanged.

## UI

Open a 3D model, then **Appearance → Bump and environment**
(`surface-settings`, `material-effects-settings`). **Height map · grayscale PNG**
(`effects-bump-image-file`) and **Import bump PNG** (`effects-bump-image-import`)
embed the asset and select **Imported grayscale PNG - object XY** in
`effects-bump`. `effects-bump-image-status` reports dimensions.
**Remove bump PNG** (`effects-bump-image-remove`) removes the asset;
**Turn off** (`effects-reset`) resets all material effects and embedded assets.
All these actions work with Expert mode off.

**More effect options** (`appearance-effects-options`) contains **Bump height ·
normalized display units** (`effects-bumpStrength`, 0–0.1) and **Repeats per
normalized display unit** (`effects-bumpFrequency`, 1–32). These existing
NumericEntry fields accept expressions; use **Apply effects** (`effects-apply`).
**Cancel edit** (`effects-cancel`) and the main Cancel cancel an import as well.

## Definition and portability

Read-only native op `material-bump` accepts only `params.pngBase64`, using the
existing bounded PNG validator: chunk structure, CRC, full decode, one frame,
resource limits, metadata stripping, and canonical RGBA normalization. Input
must have 8-bit samples, width and height each 2–512, at most 4 MiB of PNG
file bytes, and equal decoded RGB channels. Color normal maps and 16-bit PNGs
are refused explicitly. Palette and grayscale PNGs are accepted when their
decoded samples meet this contract. Alpha is retained but ignored by shading.
The normalized PNG is independently redecoded and revalidated on project load,
including assets retained while bump is off. Nothing stores a file path or URL.

`view.materialEffects.bumpAsset` contains `{mime,width,height,base64}`;
`bump:'image'` enables it. Existing sparse version-1 effect records remain valid.
View edits use the existing dirty/snapshot policy and do not add a geometry
operation. Source coordinates, incidence, colors, notes, units and camera are
untouched. Projects reopen without access to the original file.

The scalar height is decoded red / 255, **without sRGB/gamma conversion**.
The texture repeats in displayed, normalized object XY at
`uv = position.xy * bumpFrequency`; image top faces +Y and image right faces +X.
There is no Z dependence or face-local UV unwrap. Coordinates are the current
display geometry, after geometric view rotations; the map is not anchored to
source vertices. Observer camera movement does not change these coordinates.
Nearest sampling, repeat wrapping,
no mipmaps and unpremultiplied alpha define the sample policy. Both UV partials
use a central difference one texel to either side, multiplied by frequency.
The existing surface-gradient shader projects that object gradient onto the
surface tangent plane and perturbs the lighting normal by `bumpStrength`.
This is an approximate shading normal, not displacement, exact geometry or a
physical height in source mm. Nonperiodic input creates repeat seams; 8-bit
quantization and high-frequency aliasing are visible limits.

## Ownership, output and limits

Import publication verifies document/state/source, current settings, selected
file, cancellation and export ownership after every asynchronous boundary.
The Viewer owns a bounded PNG texture and checks decoded dimensions. Capture
waits for both bump and environment assets, refusing failure, stale source,
changed settings and cancellation. Removed/replaced/failed textures are disposed;
late decode callbacks cannot restore them. Decode has a 10-second timeout.

Imported bump is active only on intrinsic/embedded 3D source surfaces. UI import
and apply refuse other sources. A saved asset transferred through normal view
workflows stays retained but inactive on 4D and net views, with visible diagnostic
and capture receipt. Existing procedural bump behavior is preserved.

PNG output, including transparent 2× output, uses the prepared shader. Geometry
exports and paper-net SVGs do not bake this shading; source geometry and printable
face colors remain unchanged. Tangent-space normal maps, other codecs, UV editing,
triplanar mapping, 4D bump physics and hardware GPU qualification are separate.

## Verification

`tests/fixtures/material-bump.json` is original synthetic art: 16×8 RGBA,
`R=G=B=12*x+8*y`, alpha 255. Python checks every decoded sample, derivative
values, canonical bytes, metadata removal, transparency without premultiplication,
native refusal, actual file save/reopen and unchanged physical net pages.
Node checks independent texture ownership, waiting/failure/cancellation/disposal,
inactive domains, simultaneous environment preparation, and guarded import/edit.
The mounted Chromium/SwiftShader app imports natively with Expert off, validates
and reopens its project, compares exported decoded pixel hashes, checks transparent
2× output, and verifies removal changes pixels. A separate white-plane render
matches an independently derived normal/light oracle within two 8-bit levels;
its known interior height gradient is `(192/255,-64/255,0)`.

Tests: `tests/test_material_bump.py`, `tests/material-bump.test.mjs`,
`tests/material-bump-mounted.test.mjs`. New Node suites are registered in
`test:features`. Electron, packaged/offline installation, physical GPUs and a
competitor were not run here.

Verification receipt (2026-11-09): **81 Python passed**, **129 Node passed**
(including mounted bump/environment and common workflows), and
`npx.cmd vite build --configLoader native` passed (379 modules).
Existing mixed-import, bundle-size and Node module-type warnings remain.
`git diff --check` passed. Python selection:
`test_material_bump`, `test_material_environment`, `test_material_styles`,
`test_display_state`, `test_net_printing`, `test_project_geometry_reuse`, all
under `tests/`, using `python -m pytest ... -q -p no:cacheprovider`.
Node selection, using `node --test --test-concurrency 1`: `material-bump`,
`material-bump-mounted`, `material-environment`, `material-environment-mounted`,
`material-styles`, `section-viewer`, `engine-op-allowlist`, `engine-pool`,
`png-capture-options`, `image-capture-session`, `target-render`,
`appearance-sheet`, `common-workflows-mounted`, `renderer-contract`, `viewer-ux`
(their `tests/*.test.mjs` / `.test.cjs` files).
