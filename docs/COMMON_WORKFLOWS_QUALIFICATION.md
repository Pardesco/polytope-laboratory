# R7 desktop common-workflow qualification

`scripts/common-workflows-qualification.cjs` qualifies an explicitly pinned,
unpacked Windows packaged candidate through its real renderer, native engine,
project storage and exporters. Default execution is **hidden-no-focus**. Optional
`--mode visible` exercises ordinary startup; `--mode both` runs both modes
sequentially. Each mode starts fresh profiles at device scale factors **1, 1.5,
2**, resizes the BrowserWindow to its declared minimum (currently **1050 × 720
outer DIP**), and checks actual window size, content size and devicePixelRatio.
These Chromium scale-factor passes do not substitute for physical monitor/OS
DPI changes or manual usability review.

## Run on the lead's frozen candidate

Build/package first, then freeze renderer, desktop, engine and candidate files
for the entire run. Close other instances of the same candidate (the application
uses a single-instance lock). Use the unpacked executable with adjacent
`resources/app.asar`; portable outer wrappers and development Electron are refused.
The existing `hiddenRuntime()` preflight also requires the current main-process
source and package version to match the archive.

```powershell
# Inspection only: no Electron import or launch, no output files.
node scripts/common-workflows-qualification.cjs --plan --mode both

$candidate = 'C:\qualification\win-unpacked\Polytope Laboratory.exe'
$exePin = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
$archive = Join-Path (Split-Path $candidate) 'resources\app.asar'
$archivePin = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash

# Keep these recorded pins when repeating qualification of this candidate.
node scripts/common-workflows-qualification.cjs `
  --candidate $candidate --exe-sha256 $exePin --archive-sha256 $archivePin `
  --mode both --output artifacts/common-workflows-candidate-01
```

Output must be an empty directory. Omit `--mode` for the three hidden passes;
`--scales 1.5,2` selects only those scales for a diagnostic rerun. Such a subset
does not establish the complete six-run visible/hidden matrix. Each run checks
the same 26 cases; failures continue to independent cases/scales. Failed startup
blocks the remaining cases in that run and is never counted as a pass.

## UI paths and scenario IDs

All IDs below are prefixed **`r7-desktop-`** in receipts. These are new desktop
qualification scenarios, with bounded cases drawn from the R5 inventory and
Round 6 docs. They are not replacements for every mathematical option/domain in
those inventories.

| Scenario suffix | User path / retained element IDs |
| --- | --- |
| `startup` | Welcome → `welcome-close`; Inspector → `toggle-inspector`; minimum window |
| `dual` | Library Cube → Construct / Dual → `make-dual` |
| `truncate` | Construct / Truncate → `truncation`, `truncate` |
| `live-slider` | Truncate preview → `live-truncation-stop-1`, `live-truncation-cancel`, `live-truncation-stop-2`, `live-truncation-apply` |
| `measure` | Analysis / Measurements → `measurement-kind`, `measurement-ids`, `measure` |
| `surface-section` | Cube → manual facet cycles (`copy-facets`, `facet`) → split view / `section-density-mode=surface`, `apply-section` |
| `filled-section` | Tesseract → split view / convex section → `promote` |
| `density-section` | Generalized Cube → `section-density-mode=density` (Filled) → `promote`; independent cross-section area |
| `net` | Cube → Nets / `net-rebuild`, `net-export-svg`; reopen retained layout |
| `export-print` | Export / `export-goal-print` (3D print it) → `confirm-export`; binary STL |
| `export-paper` | `export-goal-paper` → `export-goal-action` (Continue to Nets) → unfold / SVG |
| `export-picture` | `export-goal-picture` → `export-goal-action` (Save PNG) |
| `export-video` | Short rotation / `animation-rotation` → `export-goal-video` → WebM |
| `export-software` | `export-goal-software` → GLB / `confirm-export` |
| `export-geometry` | `export-goal-geometry` → cancel/retry native chooser → OFF and JSON |
| `goursat` | Construct / Goursat stars → `goursat-wythoff-choice=goursat-wythoff-gax`, `generate-goursat-wythoff` |
| `waterman4` | Construct / Waterman → `waterman4-lattice=Z4`, `waterman4-radius=1`, `generate-waterman4` |
| `via-snub` | Dock / More / Dual morph → `dual-morph-method=via-snub`, `dual-morph-ratio`, Apply, Replay, Pause, Reset |
| `faceting` | Construct / Facet (search) → `faceting-candidates`, `faceting-source-faces`, `faceting-search`, Preview, Adopt |
| `stellation-planes` | Construct / Stellate → `stellation-arbitrary-planes`, explicit bounds, `stellation-evaluate-arbitrary`, `stellation-face-base` |
| `memory-add` | Dock / More / Memories → `memory-store`, `memory-scale=1/2`, `memory-add` |
| `memory-blend` | Same path → `memory-blend` |
| `dxf-boundary` | Export / All formats → `export-kind=intrinsic`, `export-format=dxf`, `dxf-export-profile=boundary` |
| `png-environment` | Appearance / Material effects → `effects-image-file`, `effects-image-import`; native project reopen and pixel comparison |
| `legacy-ids` | Every ID in the runner's exported `LEGACY_IDS` list retains one original node and reveals with Expert off |
| `dialogs` | Native Save/Open cancellation, successful reopen, Escape from Export review and successful retry |

Construct/tool disclosures and popovers are opened with the application's reveal
event and original ancestors, following the smoke helpers' discovery mechanism.
The runner has its own **strict reveal**: it refuses `[data-expert]` targets before
dispatch, never adds `expert-mode`, and records transient class changes. No force
clicks, replacement controls, geometry IPC shortcuts or renderer state injection
are used. Target rectangles must fit inside the minimum window after scrolling.
The hidden native HWND watcher starts before launch and checks show/focus events.

**Known baseline blocker:** `ui/app-chrome.mjs` currently returns `true` from
`readExpertTools(...,{hidden:true})`. Thus hidden startup is expected to fail the
strict Expert-off criterion on this baseline. The runner deliberately records
that failure; it does not switch Expert off or weaken hidden compatibility tests.
App fixes belong to a separate package. `legacy-ids` covers the listed common
controls, not every intentionally Expert-only control in the application.

## Receipts and checks

The top-level `result.json` identifies pins, scope, matrix, failures and final
freeze status. `frozen-candidate.json` hashes every resource (including bundled
engine files); `frozen-sources.json` hashes UI, desktop, engine, dist and the
qualification dependencies. Changes before/after any run invalidate the matrix.
An existing archive alone does not establish source-to-bundle UI equivalence;
receipts qualify the pinned packaged bytes and retain the separate source hashes.

Each run contains case JSON, numbered **per-step JSON plus PNG**, saved `.polyproj`
files and actual export outputs. Step receipts record selectors, bounding boxes,
viewport/DPI, status/toast, errors, output sizes/hashes and `[nativeStart,nativeEnd)`
indices into `native-receipts.json`. Native engine calls execute their original
handler; instrumentation records op/parameters, result counts, numerical metadata
and diagnostics. Native dialog options/results are recorded and only chooser
choices/message responses are stubbed. Screenshots and exported/project bytes
are rehashed before a run can pass. `native-watch.json` contains independent HWND
evidence for hidden runs. Missing screenshots, page errors, altered artifacts,
unsupported operations or Expert requirements fail qualification.

Model-changing cases check ordered coordinates/incidence and interpretation
through **Undo, Redo, native save/reopen and UI history Replay** into an independent
document. Reopen compares the complete saved model. Generated roots are saved and
reopened, then scaled to exercise their ordinary history chain; creation of a new
document is not a geometry Undo step. Via-snub is a source-preserving view: the
case persists ratio/method, reopens, invokes endpoint Replay and Reset, and checks
that source geometry is retained. Memories additionally verify the stored slot
and literal half-scale added coordinates.

Independent bounded output checks read OFF coordinates/ordered faces, JSON source
geometry, binary STL triangle count/byte length, GLB header/scene geometry, six DXF
`3DFACE` records, SVG drawing elements and PNG dimensions. Gax expects
120/720/1200/600 entities; radius-one Z4 expects 8/24/32/16. Six arbitrary axial
planes have 27 observed box regions and promoted volume 8; unrestricted enumeration
must remain false. Distance and density-section area use independent source-coordinate
oracles with reported/resolved numerical tolerances. PNG environment captures
compare decoded bitmap pixels across native reopen at each requested scale.

## Limits and verification status

**No Electron launch was attempted in the authoring sandbox. No desktop scenario
ID is closed as executed/qualified by this delivery.** The 26 IDs above close the
script-coverage task only; passing lead-generated receipts are required for each
desktop claim. No parity ledger or shared app behavior is changed.

The video goal checks a real export's EBML header and nonempty output; codec,
frame count/timestamps and pose decoding belong to R7-MEDIA. SVG/net checks do not
qualify physical printing, paper calibration or the complete fabrication domain.
DXF entity counts are not full CAD round-trip qualification. Automated dialog
choices do not qualify native chooser ergonomics. Numerical geometry remains
approximate; no exact algebraic or competitor-equivalence claim is made. OS DPI,
GPU/driver coverage, installer/offline/upgrade checks and specialist mathematical
review remain separate qualification work.

Executed without Electron:

```powershell
node --check scripts/common-workflows-qualification.cjs
node --test tests/common-workflows-qualification.test.cjs tests/qualification-launch-mode.test.cjs tests/hidden-runtime.test.cjs tests/hidden-qualification.test.cjs
npx.cmd vite build --configLoader native
```

**52 Node tests passed (8 new, 44 existing)**. The new reveal test uses headless
Chromium with a small DOM fixture, not Electron. It checks disclosure/identity
preservation, hidden/duplicate/missing targets, Expert refusal and transient Expert
evidence. Other new tests exercise pins, matrix/plan coverage, artifact hashes,
freeze invalidation and corrupt output rejection. Vite production build passed
with the existing mixed-import and large-chunk warnings. No native-engine code
changed, so no new Python suite is needed.
