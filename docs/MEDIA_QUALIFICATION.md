# R7 media qualification

This package supplies a lead-run Windows desktop qualification harness, an
independent verifier, and small checked-in codec fixtures. Encoder, renderer,
timeline, tour and native export implementations are frozen and unchanged.
**No Electron or RTX 5070 Ti qualification was executed in the worker sandbox.**
Fixture decoding and native project validation are separate evidence levels.

## Run on the candidate

Build the candidate from the same source first. Use its **unpacked executable**
with adjacent `resources/app.asar`; portable outer wrappers are refused by the
existing hidden-runtime guard. Obtain a passing matching canary with the
existing `scripts/hidden-desktop-smoke.cjs`. Then, in PowerShell:

```powershell
$env:POLYTOPE_TEST_EXECUTABLE = 'C:\absolute\candidate\Polytope Laboratory.exe'
$env:POLYTOPE_TEST_MODE = 'hidden-no-focus'
$env:POLYTOPE_HIDDEN_CANARY = 'C:\absolute\artifacts\hidden-desktop-canary-ID\result.json'
# Optional, when not on PATH:
$env:POLYTOPE_FFMPEG = 'C:\ffmpeg\bin\ffmpeg.exe'
$env:POLYTOPE_FFPROBE = 'C:\ffmpeg\bin\ffprobe.exe'
node scripts/media-qualification.cjs
```

The runner arms its own native HWND visibility/foreground watcher before
launch, checks initial/final hidden/nonfocusable windows, uses a fresh profile
with empty linked libraries, substitutes native test dialogs, and never calls
show/focus. Packaged runs deliberately disable development Python. The source
run can diagnose behavior, but cannot produce a shipped-runtime PASS.

Artifacts go to `artifacts/media-qualification-*` (or beneath
`POLYTOPE_TEST_ARTIFACTS`). `result.json` includes the per-case/format `matrix`,
failures, decoder availability, GPU adapters/feature status, Electron/Chromium
versions, OS, executable/archive hashes, source module hashes and built-renderer
hashes. Bundled desktop exporter and every local `dist` file must match the
archive. The lead must build before packaging; source hashes alone cannot
establish that a stale bundle was rebuilt. Source exporter hashes are rechecked
at the end. Saved input/before/after projects, outputs, a workspace screenshot
and watcher evidence remain inspectable. Receipts are checkpointed between cases.

Exit 0 requires an unpacked candidate, all forty decoded format/case results,
restored source/history/view, negative checks, and clean hidden-window evidence.
Unavailable codecs are recorded as unavailable, cause an incomplete result,
and never trigger a realtime recorder fallback. Setup failures also write a
failed report. No release support claim follows from merely running the script.

Reverify existing outputs without launching an app:

```powershell
node scripts/media-verifier.cjs artifacts/media-qualification-ID
```

This writes `independent-verification.json`, preserving the original runtime
receipt. Its `qualified` flag concerns decoded artifacts only; it does not
repeat source restoration, cancellation, runtime or window checks.

## Scenarios and UI

The harness authors these deterministic saved projects, reopens them through
the native validator, then invokes the existing export controls. All animation
cases use 0.26 s at 8 fps; the intentionally short last sample interval exposes
container timing differences. Export size is 480 by 320; the tour source area
is 960 by 640. PNG stills additionally cover transparency on/off, scales 1/2/4,
and requested supersampling 2, checking actual source pixel dimensions at the
machine's DPI. GPU supersampling reduction remains a runtime diagnostic.

| Case | Mathematical/view domain | Existing entry points |
| --- | --- | --- |
| `rotation3`, `rotation4` | Cube SO(3), tesseract SO(4) source rotations | Animation `animation-settings`, `animation-rotation` |
| `section4` | Oblique tesseract section depth sweep, awaited native sections | `animation-section`, `section-normal`, target Section |
| `fold3` | Rigid cube face-net, fraction 0 through 1 | `animation-fold`, target Face net |
| `morph-snub3` | Supported cube via-snub ratio 0 through 1 | `dual-morph-method` = via-snub, `dual-morph-apply`, `animation-morph` |
| `camera-v4` | Nonperiodic observer orbit | `animation-add-camera` |
| `projection-v4` | 4D perspective eye distance 2.5 through 5 | `animation-add-projection` |
| `opacity-v4` | Face opacity 0.15 through 0.85 | `animation-add-opacity` |
| `sectionNormal-v4` | Nonantipodal unit-normal section rotation | `animation-add-sectionNormal` |
| `tour` | Two animated events plus sideways transition | Tours `tour-settings`, `tour-format`, `tour-export` |

Animation export uses `animation-format`, `animation-size`, `animation-framing`,
`animation-target`, `animation-export`, `animation-progress` and
`animation-cancel`. Stills use PNG options `png-settings`, `png-transparent`,
`png-scale`, `png-supersample`, and **Save image** (`image`). Existing
`reveal()`/`autoReveal()` retain hidden-test compatibility. This script does not
qualify novice discoverability; it may reveal Expert controls.

The authoring/verification gap is covered for conformance scenario IDs
`io-03-png-alpha-size`, `io-03-png-sequence`, `io-03-webm`, `io-03-mp4`, and
`io-03-gif`, scoped to the cases above (IO-03, ANIM-01/03). Their **shipped
qualification remains open until the lead records actual results**. No scenario
or ledger status was promoted. `io-03-legacy-containers` and
`io-03-combined-motion-scope` remain open: AVI, morph sections and combined
morph/fold/explosion are outside this script's supported domain.

## Timing and alpha matrix

For source times `[0, .125, .25, .26]` at 8 fps:

| Format | Presentation times (seconds) | Alpha / qualification mechanism |
| --- | --- | --- |
| PNG sequence | Manifest keeps `[0, .125, .25, .26]` | Independently decode actual RGB/RGBA, dimensions, CRC and all PNG filters |
| VP8 WebM | `[0, .125, .25, .26]` (microsecond timestamps) | Opaque yuv420p; FFprobe count/timestamps, FFmpeg pixels |
| H.264 MP4 | `[0, .125, .25, .375]` (frame index / fps) | Opaque yuv420p; even dimensions, FFprobe/FFmpeg required |
| GIF | `[0, .13, .26, .27]` | Opaque indexed colors; delays `[13,13,1,13]` centiseconds |

The last GIF image holds for another 13 centiseconds; MP4 holds each image for
1/fps. Those durations include a final image hold beyond the last mathematical
sample. GIF rounds **each interval independently**, minimum 1 centisecond;
it does not round absolute source timestamps. FFmpeg/FFprobe are invoked with
GIF `-min_delay 0` so their default short-delay clamping cannot falsify this test.
Tour samples are `[0,.125,.25,.375,.5,.625,.75]`.

Every video must decode the expected number of frames at the PNG dimensions.
Both decoded endpoints must uniquely match their corresponding PNG pose among
all reference poses; choosing an earlier pose or tying references fails. Mean
RGB error limits are <5/255 for video and <12/255 for GIF quantization. These
are declared rendering tolerances, not mathematical exactness. PNG references
are rendered through the same application pose pipeline; this checks encoder
pose ownership, not an independent proof of section/fold/morph mathematics.

The matrix is specific to the recorded Windows x64 candidate, adapter/driver
and codec negotiation. H.264 availability varies by Chromium build. Neither
capability probing nor FFmpeg fixture encoding proves the app can encode on
that hardware. No Linux/macOS, 1080p/4K video, dense models, material/environment
variants, anaglyph, generalized fold, or arbitrary morph domain is qualified.

## Independent fallback and limits

Without both FFmpeg and FFprobe, the verifier fully decodes noninterlaced 8-bit
RGB/RGBA PNGs in Node. GIF fallback reads image rectangles/count, centisecond
delays, transparency flag, loop extension, palettes/subblock bounds and trailer;
it does **not** decode LZW pixels. WebM fallback walks EBML, reads VP8 track
dimensions and unlaced SimpleBlock timestamps/count; it does **not** decode VP8.
MP4 fallback recognizes its header only. Structure-only video results are
unqualified and fail the overall gate. No additional dependencies are installed.

The verifier is bounded to 64 frames, 128 MiB reference/decode RGB bytes,
8192-pixel dimensions, 32 megapixels, 512 MiB files and 30-second tool calls.
It supports the shipped writer's structure, not arbitrary EBML/lacing/APNG,
interlaced/indexed PNG or multi-track media. Decoder errors remain failures.

Runtime negative cases remove VideoEncoder for WebM/MP4 and require an explicit
refusal with no output; cancel in-progress PNG/WebM/MP4/GIF; reject >18,001
frames, >300 s, >32 MiB chunks and >8192-pixel PNG input; verify no partial
publication/staging leak and unchanged projects after cancellation. An unavailable
codec leaves its cancellation check unexecuted. Full 512 MiB disk exhaustion,
crash/power loss, codec startup hangs and tour cancellation need separate runs.

## Tests

`tests/fixtures/media/` contains four literal RGBA PNG poses, a partial-alpha
PNG, a manually assembled GIF with a 1-centisecond interval, and FFmpeg VP8/H.264
files. `provenance.json` records hashes and the generating FFmpeg version.
Regenerate with `node scripts/media-qualification-fixtures.cjs`; no application
encoder is used. Version-dependent video bytes may differ after regeneration.

```powershell
node scripts/media-qualification.cjs --self-test
node --test tests/media-verifier.test.cjs tests/media-qualification.test.cjs
node --test tests/media-export.test.mjs tests/media-export-controls.test.mjs tests/video-recorder.test.mjs tests/vp8-webm.test.mjs tests/animation-export-capture.test.mjs tests/animated-tour-export.test.mjs tests/animation-v4.test.mjs tests/png-capture-options.test.mjs
python -m pytest tests/test_animation_4d.py -q -p no:cacheprovider
npx.cmd vite build --configLoader native
```

New tests are registered in `test:features`; `test:media-qualification` invokes
the lead-run desktop harness. New tests validate all ten projects with the real
native JSON-lines server, test malformed fixtures/filter reconstruction/timing,
exercise missing-decoder reporting and reject reversed endpoint references.
External fixture-decode tests explicitly skip when FFmpeg is unavailable.

Worker verification (9 November 2026): **103 Node tests passed, 22 Python tests
passed**, qualification-plan self-test passed, and Vite production build passed.
The three external fixture decodes ran with FFmpeg 8.0; none were skipped.
Existing module-type and Vite chunk-size/dynamic-import warnings remain.
