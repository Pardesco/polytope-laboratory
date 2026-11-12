# Measurements and reinforcement presets (R5-NETS)

Nets → **3 Print or export → Measurements and reinforcement** is available
with Expert tools off. Choose a 3D model, set **Edge length** in mm, and
**Generate face net**. **Cut list CSV** (`fabrication-measure-csv`) and
**Measurements PDF** (`fabrication-measure-pdf`) are directly visible.
**Other measurement formats** retains **Flat faces DXF**
(`fabrication-measure-dxf`); the existing top-level DXF shortcut remains.

Expand **Reinforcement — paper templates** (`fabrication-presets`).
`fabrication-preset` offers:

- **Dihedral hinge strips** (default): 10 mm wide, one per source edge.
  Score, set the printed interior angle, then glue inside adjoining faces.
- **Inset face braces**: one panel per face with a 2 mm perpendicular inward
  miter margin. Collapsed, crossing or split offsets refuse explicitly.
- **Vertex direction rosettes**: 12 mm radius projected strut-direction guides.
  Printed elevations and true 3D angles are required; these are not developed
  sockets or certified symmetry classes.

**Custom families and dimensions (mm)** (`fabrication-custom`) starts collapsed.
It preserves all previous family/size IDs, supports NumericEntry expressions,
and allows combinations. Editing a family or dimension selects Custom.
Unused dimensions are disabled and do not block another family's computation.
Custom source-vertex support cycles (`net-reinforcement-settings`) and
coincident-edge assembly policy controls remain collapsed Expert tools.

**Preview reinforcement pages** (`fabrication-parts-preview`) computes the
existing native `net-reinforcement-parts` result without opening a save dialog.
`fabrication-page-prev` / `fabrication-page-next` page through complete sheets;
`fabrication-page-image` displays an inert SVG image with a fitted screen size.
The caption reports physical paper dimensions and instructs 100% printing.
The preview requires native mm, content scale 1, matching E0/paper dimensions,
bounded pages and a finite nonnegative edge-flattening residual. The residual
and source-net overlap warnings appear in `fabrication-status`.
Existing Parts SVG/PDF buttons retain their bounded native output sessions.

To change paper, choose **Page and paper options**, then **Pack and preview**
to apply the paper size/margins before preparing reinforcement pages.
**Prepend packed net sheets** retains the existing basic native packing route;
it is independent of the net editor's color-separated/textured output route.
Use the ordinary net output controls for those specialized print policies.

Physical lengths use source edge E0 in mm, independently of coordinate-unit
hints and camera zoom. CSV headers declare mm and degrees; records preserve
source E/P/F labels. Results are approximate float64, not exact certificates.
Native unsupported-shell, orientation, inset and paper-fit refusals remain.
No automatic resizing/splitting, material thickness, kerf, strength, mechanical
fit or hardware printer calibration is claimed.

Source, notes, units, net parameters, paper and fabrication fields fence
asynchronous results. Completed previews clear on source/settings changes or
Cancel. Export and preset forms stay session-local; source geometry and history
are unchanged. Existing saved net settings and project history remain authoritative.
No new native operation, dependency, dispatch/allowlist or history schema was needed.

## Verification

- `python -B -m pytest tests/test_net_fabrication.py tests/test_net_reinforcement.py tests/test_net_printing.py -q -p no:cacheprovider`
- `node --test --test-concurrency 1 tests/net-fabrication-controls.test.mjs tests/net-fabrication-presets.test.mjs tests/nets-flow.test.mjs tests/reinforcement-controls.test.mjs tests/engine-op-allowlist.test.cjs tests/net-tab-controls.test.mjs tests/net-assembly.test.mjs tests/net-export-session.test.mjs tests/bounded-export.test.mjs`
- `npx.cmd vite build --configLoader native`
- `node scripts/net-fabrication-browser-smoke.mjs` (after build)
- `node scripts/net-fabrication-browser-smoke.mjs --hidden`

Focused results: **70 Python tests passed**, **88 Node tests passed** (including
19 new preset/preview tests); Vite production build passed. The new browser
smoke passed **32 assertions per mode** (64 total), with normal Expert-off
startup and the existing hidden-mode Expert default. It requests reduced motion;
the hidden run prepares the split viewport before starting the face net so the
viewport transition does not change its captured expression owner.

The browser smoke uses the built renderer, real JSON-lines Python engine and
mock file destinations. It checks normal Expert-off startup, 4D refusal,
cube selection/net generation, parsed 25.4 mm CSV edge lengths, all three
presets, decoded SVG pages, physical paper dimensions, paging and invalidation.
Screenshot: `build/r5-net-fabrication-preview.png`. Electron is never launched;
actual printer and installed desktop qualification remain follow-ups.

Additional broad-smoke finding: `scripts/nets-flow-browser-smoke.mjs` repeatedly
timed out at line 50 waiting for the 4D whole-cell result. A diagnostic copy
showed “The source attributes, view, units, or notes changed while evaluating
expressions. Repeat the edit.” and no cell-net publication. That whole-cell
workflow is outside this package; its checks are not counted as passing.
A comparison Vite build loading the four changed Nets UI/CSS modules from
`git show HEAD:<path>` reproduces the identical refusal and timeout. This
baseline source/view ownership issue remains for the lead; no validation was
weakened to bypass it.
