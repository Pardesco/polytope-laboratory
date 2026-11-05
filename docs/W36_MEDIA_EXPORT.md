# W36: animated GIF and H.264 MP4 export

Open **Animation** or **Tours** in the workspace shelf. Choose **Export format**
(`animation-format`, `tour-format`), **Export size** (`animation-size`,
`tour-size`), then **Export selected format** (`animation-export`, `tour-export`).
WebM, MP4, GIF and PNG sequence share the existing exact-time offline capture,
progress and Cancel controls (`animation-cancel`, `tour-cancel-export`). The old
PNG/WebM shortcut buttons remain available and use the chosen size/options.

**Export options** is initially collapsed. Its controls use the corresponding
`animation-` or `tour-` prefix:

- `framing`: black letterbox or centered crop; aspect ratio is preserved.
- `bitrate`: 3, 6 or 12 Mbps for video.
- `palette`: GIF per-frame palette, or global palette with two rendering passes.
- `dither`: optional deterministic 4×4 Bayer ordered dithering for GIF.
- `loop-count`: GIF repeat count, zero for infinite repetition.

Sizes include viewport, 480/720/1080 pixels wide preserving viewport aspect,
1080×1080, 1080×1920 and 1920×1080. These scale prepared viewport pixels; they
do not increase geometry tessellation or render resolution. A source canvas
resize during capture refuses publication. Export preferences are transient,
like the existing capture target; saved sequence/history geometry is unchanged.

## Encoding contracts

GIF89a uses opaque complete frames, disposal method 1, NETSCAPE2.0 looping,
weighted median-cut quantization over a 5-bit RGB histogram, at most 256 colors,
and a plain-JS GIF LZW encoder with 12-bit dictionary resets. Palette analysis
samples at most 65,536 evenly spaced pixels per frame. Global mode aggregates
only that bounded histogram and rerenders every exact source time; it retains
no frame cache. Compression and sampling are lossy. Delays round each exact
source interval to the nearest centisecond, minimum one centisecond. The last
frame holds for rounded `100/fps` centiseconds. For example, 24 fps normally
becomes 4 cs per frame (25 fps); browser GIF players can additionally clamp
short delays. Fractional endpoint intervals also round independently.

MP4 negotiates baseline AVC profiles `avc1.420028`, `avc1.420033`, then
`avc1.420034` using `VideoEncoder.isConfigSupported`. Unsupported H.264 reports
alternate formats explicitly; it does not silently change the chosen format.
Even output dimensions, baseline 8-bit 4:2:0, opaque frames and square pixels
are required. Each immutable VideoFrame is drained and checked before advancing;
missing/reordered timestamps, changing decoder configuration, missing avcC and
Annex-B payloads are refused. No external encoder or npm dependency is required.

The append-only ISO-BMFF writer emits `ftyp`, one `mdat` per sample, and final
`moov/trak/mdia/minf/stbl`, including `avcC`, `pasp`, `stsd`, `stts`, `stsc`,
`stsz`, `stco`, and `stss`. It has one video track, no audio, no B-frame
reordering, and no fast-start relocation. Constant frame rate uses one tick per
sample at timescale fps. Source poses still use the exact PNG/WebM sampling grid,
including a fractional final endpoint; MP4 places that endpoint at the next
uniform output-frame time and holds it for one period. Thus a fractional final
source interval can expand by less than one frame period. Existing WebM retains
its exact microsecond source intervals.

Native `animationBegin/Write/Finish/Abort` owns dialog paths and bounded sibling
staging directories for all formats. New formats require their stream signature,
expected header/frame/footer chunk count, and terminal GIF trailer or MP4 moov
before publication. Files are fsynced before atomic rename. Cancellation/failure
drains writes and removes staging, preserving an existing destination. As with
the existing exporter, cancellation after native Finish has committed cannot
promise rollback. Limits remain 300 seconds, 60 fps, 18,001 frames, 32 MiB/chunk
and 512 MiB/export. GIF has no transparency; video has no audio. GPU pixels and
hardware codec bytes are not promised identical across machines.

## Verification

New `tests/media-export.test.mjs` (12 tests) covers an independent GIF/LZW
decoder, code-width growth and resets, palette bounds/dither/global passes,
MP4 hierarchy/sample offsets/timing/keyframes, synthetic WebCodecs negotiation,
size/framing validation, native atomic save and cancellation. New
`tests/media-export-controls.test.mjs` (6 tests) runs the actual Animation/Tour
export methods through native staging with controlled fine-pose canvases/codecs,
including endpoint ownership, source restoration and cancellation during writes.
Both are registered in `test:features`. Existing unsupported-format assertions
now use AVI instead of the newly supported MP4/GIF.

Focused Node suites passed **412 distinct tests** across 31 files, including a
final **69/69** regression rerun after preserving the original morph guard order.
Coverage includes both new files, recorder/WebM, animation controls/capture/
framing/tracks/numeric entry, animated tours/W29, morph eligibility, desktop
dialogs/files, capture/printing ownership and renderer/discoverability contracts.
`python -m pytest tests/test_animation_4d.py -q -p no:cacheprovider`
passed **22/22**. `npx.cmd vite build --configLoader native` passed with the
existing bundle-size warning.

Optional independent verification: `node scripts/verify-media-export.mjs` uses
installed FFmpeg/FFprobe only as development tools. It supplies real baseline
H.264 packets to this muxer and decodes both outputs, asserting three 64×48
frames each and H.264 yuv420p at 12 fps. Evidence is written under
`artifacts/w36-media-verification/verification.json`. This passed locally.
Electron was not launched. Real Electron WebCodecs capability, GPU captures,
native dialog click-through and social-player compatibility remain desktop
qualification checks; the synthetic codec tests and FFmpeg packet test do not
claim those have passed.
