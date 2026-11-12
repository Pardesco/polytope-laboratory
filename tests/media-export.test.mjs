import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GifWriter, gifHistogram, gifPalette, gifIndices, gifLzw, recordRenderedGif } from '../ui/gif-encoder.mjs';
import { AVCMp4Writer } from '../ui/avc-mp4.mjs';
import { recordRenderedVideo } from '../ui/video-recorder.mjs';
import { mediaExportOptions, mediaDimensions, createMediaSurface, mediaControls } from '../ui/media-export-options.mjs';
const require = createRequire(import.meta.url),
  { createAnimationExportManager, validateExportOptions } = require('../desktop/animation-export.cjs');
const join = (parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));
const rgba = (w, h) =>
  Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37 + (i >> 4) * 13) % 256));

// Independent GIF decoder: dictionary entries are complete byte sequences.
function decodeLzw(bytes, min, expected) {
  const clear = 1 << min,
    end = clear + 1;
  let table,
    size,
    next,
    previous = null,
    bit = 0;
  const out = [];
  const reset = () => {
    table = Array.from({ length: clear }, (_, i) => [i]);
    size = min + 1;
    next = end + 1;
    previous = null;
  };
  reset();
  while (bit + size <= bytes.length * 8) {
    let code = 0;
    for (let b = 0; b < size; b++, bit++) code |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << b;
    if (code === clear) {
      reset();
      continue;
    }
    if (code === end) {
      assert.equal(out.length, expected);
      return Uint8Array.from(out);
    }
    const entry = table[code] || (code === next && previous ? [...previous, previous[0]] : null);
    assert.ok(entry, 'valid LZW code ' + code);
    out.push(...entry);
    if (previous) {
      table[next++] = [...previous, entry[0]];
      if (next === 1 << size && size < 12) size++;
    }
    previous = entry;
  }
  assert.fail('Missing GIF end code');
}
function parseGif(data) {
  assert.equal(data.toString('ascii', 0, 6), 'GIF89a');
  const w = data.readUInt16LE(6),
    h = data.readUInt16LE(8),
    packed = data[10];
  let at = 13,
    global = null,
    loop = null,
    delay = null;
  const frames = [];
  const table = (n) => {
    const v = data.subarray(at, at + n * 3);
    at += n * 3;
    return v;
  };
  if (packed & 128) global = table(2 ** ((packed & 7) + 1));
  const blocks = () => {
    const parts = [];
    while (data[at]) {
      const n = data[at++];
      parts.push(data.subarray(at, at + n));
      at += n;
    }
    at++;
    return join(parts);
  };
  while (at < data.length) {
    const marker = data[at++];
    if (marker === 0x3b) {
      assert.equal(at, data.length);
      return { w, h, global, loop, frames };
    }
    if (marker === 0x21) {
      const label = data[at++];
      if (label === 0xff) {
        const n = data[at++],
          name = data.toString('ascii', at, at + n);
        at += n;
        const b = blocks();
        if (name === 'NETSCAPE2.0') loop = b.readUInt16LE(1);
      } else if (label === 0xf9) {
        assert.equal(data[at++], 4);
        const flags = data[at++];
        assert.equal(flags & 1, 0, 'no transparency');
        delay = data.readUInt16LE(at);
        at += 4;
      } else blocks();
      continue;
    }
    assert.equal(marker, 0x2c);
    const left = data.readUInt16LE(at),
      top = data.readUInt16LE(at + 2),
      fw = data.readUInt16LE(at + 4),
      fh = data.readUInt16LE(at + 6),
      flags = data[at + 8];
    at += 9;
    assert.equal(left + top, 0);
    assert.equal(fw, w);
    assert.equal(fh, h);
    const colors = flags & 128 ? table(2 ** ((flags & 7) + 1)) : global;
    assert.ok(colors);
    const min = data[at++],
      decoded = decodeLzw(blocks(), min, w * h);
    assert.ok(decoded.every((v) => v < colors.length / 3));
    frames.push({ delay, decoded, colors });
  }
  assert.fail('GIF trailer missing');
}
test('GIF structure and independently decoded LZW round-trip local and global palettes', () => {
  for (const global of [false, true]) {
    const pixels = rgba(89, 67),
      palette = gifPalette(gifHistogram(pixels)),
      writer = new GifWriter({ width: 89, height: 67, loopCount: 3, palette: global ? palette : null });
    const bytes = join([
        writer.begin(),
        writer.frame(pixels, 4, { palette }),
        writer.frame(pixels, 5, { palette, dither: true }),
        writer.finish(),
      ]),
      gif = parseGif(bytes);
    assert.equal(gif.w, 89);
    assert.equal(gif.h, 67);
    assert.equal(gif.loop, 3);
    assert.equal(Boolean(gif.global), global);
    assert.equal(gif.frames.length, 2);
    assert.deepEqual(
      gif.frames.map((f) => f.delay),
      [4, 5]
    );
    assert.deepEqual(gif.frames[0].decoded, gifIndices(pixels, 89, palette));
    assert.deepEqual(gif.frames[1].decoded, gifIndices(pixels, 89, palette, true));
  }
});
test('LZW independently decodes code-width growth, dictionary resets, repeated and single pixels', () => {
  for (const min of [2, 3, 8])
    for (const n of [1, 2, 20, 20000, 90000]) {
      let seed = 123;
      const input = Uint8Array.from({ length: n }, () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return (seed >>> 16) & ((1 << min) - 1);
        }),
        encoded = gifLzw(input, min);
      let at = 1;
      const pieces = [];
      while (encoded[at]) {
        const size = encoded[at++];
        pieces.push(encoded.slice(at, at + size));
        at += size;
      }
      assert.deepEqual(decodeLzw(join(pieces), min, n), input);
    }
  const input = new Uint8Array(10000).fill(7),
    encoded = gifLzw(input, 3),
    pieces = [];
  let at = 1;
  while (encoded[at]) {
    const size = encoded[at++];
    pieces.push(encoded.slice(at, at + size));
    at += size;
  }
  assert.deepEqual(decodeLzw(join(pieces), 3, input.length), input);
});
test('median cut palette and indices remain bounded, deterministic, opaque and reject invalid budgets', () => {
  const pixels = rgba(91, 73),
    hist = gifHistogram(pixels);
  for (const count of [2, 16, 256]) {
    const palette = gifPalette(hist, count);
    assert.ok(palette.length <= count);
    assert.deepEqual(palette, gifPalette(hist, count));
    assert.ok(palette.flat().every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    assert.ok(gifIndices(pixels, 91, palette, true).every((v) => v < palette.length));
  }
  assert.throws(() => gifPalette(hist, 257));
  assert.throws(() => new GifWriter({ width: 0, height: 1 }));
  assert.throws(() => new GifWriter({ width: 1, height: 1, loopCount: -1 }));
  assert.throws(() => gifHistogram(Uint8Array.of(1)));
});
test('offline GIF renders exact times and global two-pass quantization holds no frame cache', async () => {
  for (const palette of ['frame', 'global']) {
    const poses = [],
      writes = [];
    let current = 0;
    const times = [0, 0.04, 0.051],
      canvas = {
        width: 4,
        height: 4,
        getContext: () => ({ getImageData: () => ({ data: rgba(4, 4).fill(current) }) }),
      };
    const result = await recordRenderedGif({
      canvas,
      fps: 24,
      frameCount: 3,
      frameTimes: times,
      palette,
      renderFrame: async (i) => {
        current = i;
        poses.push(times[i]);
      },
      writeChunk: async (i, b) => {
        assert.equal(i, writes.length);
        writes.push(b);
      },
    });
    assert.deepEqual(poses, palette === 'global' ? [...times, ...times] : times);
    assert.deepEqual(
      parseGif(join(writes)).frames.map((f) => f.delay),
      [4, 1, 4]
    );
    assert.equal(result.encodedFrames, 3);
  }
});
test('GIF cancel at palette and encoding phases stops writes and releases recorder', async () => {
  for (const palette of ['global', 'frame']) {
    let control,
      writes = 0;
    const canvas = { width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: rgba(2, 2) }) }) };
    await assert.rejects(
      recordRenderedGif({
        canvas,
        fps: 1,
        frameCount: 2,
        palette,
        renderFrame: async () => control.stop(),
        writeChunk: async () => writes++,
        onRecorder: (r) => {
          control = r;
        },
      }),
      /cancelled/
    );
    assert.equal(control, null);
    assert.equal(writes, palette === 'global' ? 0 : 1);
  }
});
function boxes(data, start = 0, end = data.length) {
  const out = [];
  while (start < end) {
    const size = data.readUInt32BE(start),
      type = data.toString('ascii', start + 4, start + 8);
    assert.ok(size >= 8 && start + size <= end, 'valid ' + type);
    out.push({ type, start, size, end: start + size });
    start += size;
  }
  assert.equal(start, end);
  return out;
}
const child = (data, b, type) => boxes(data, b.start + 8, b.end).find((v) => v.type === type);
const description = Uint8Array.of(1, 66, 0, 40, 255, 225, 0, 1, 103, 1, 0, 1, 104),
  sample = (n) => Uint8Array.of(0, 0, 0, 2, n ? 0x41 : 0x65, n);
function mp4() {
  const writer = new AVCMp4Writer({ width: 1080, height: 1920, fps: 24, timestamps: [0, 41667, 83333] });
  return {
    writer,
    parts: [
      writer.begin(),
      ...Array.from({ length: 3 }, (_, i) =>
        writer.frame({
          timestamp: Math.round((i * 1e6) / 24),
          type: i ? 'delta' : 'key',
          data: sample(i),
          description: i ? undefined : description,
        })
      ),
      writer.finish(),
    ],
  };
}
test('MP4 box hierarchy, CFR timing, square pixels and sample tables address exact synthetic samples', () => {
  const { parts } = mp4(),
    data = join(parts),
    top = boxes(data);
  assert.deepEqual(
    top.map((b) => b.type),
    ['ftyp', 'mdat', 'mdat', 'mdat', 'moov']
  );
  const moov = top.at(-1),
    trak = child(data, moov, 'trak'),
    mdia = child(data, trak, 'mdia'),
    mdhd = child(data, mdia, 'mdhd'),
    minf = child(data, mdia, 'minf'),
    stbl = child(data, minf, 'stbl');
  assert.equal(data.readUInt32BE(mdhd.start + 20), 24);
  assert.equal(data.readUInt32BE(mdhd.start + 24), 3);
  const stts = child(data, stbl, 'stts');
  assert.equal(data.readUInt32BE(stts.start + 12), 1);
  assert.equal(data.readUInt32BE(stts.start + 16), 3);
  assert.equal(data.readUInt32BE(stts.start + 20), 1);
  const stsz = child(data, stbl, 'stsz'),
    stco = child(data, stbl, 'stco'),
    stsc = child(data, stbl, 'stsc'),
    stss = child(data, stbl, 'stss');
  assert.equal(data.readUInt32BE(stsz.start + 16), 3);
  assert.equal(data.readUInt32BE(stco.start + 12), 3);
  assert.deepEqual(
    [16, 20, 24].map((n) => data.readUInt32BE(stsc.start + n)),
    [1, 1, 1]
  );
  assert.equal(data.readUInt32BE(stss.start + 12), 1);
  assert.equal(data.readUInt32BE(stss.start + 16), 1);
  for (let i = 0; i < 3; i++) {
    const size = data.readUInt32BE(stsz.start + 20 + i * 4),
      offset = data.readUInt32BE(stco.start + 16 + i * 4);
    assert.equal(offset, top[i + 1].start + 8);
    assert.deepEqual(data.subarray(offset, offset + size), Buffer.from(sample(i)));
  }
  const stsd = child(data, stbl, 'stsd'),
    avc1 = boxes(data, stsd.start + 16, stsd.end)[0];
  assert.equal(avc1.type, 'avc1');
  assert.equal(data.readUInt16BE(avc1.start + 32), 1080);
  assert.equal(data.readUInt16BE(avc1.start + 34), 1920);
  const config = boxes(data, avc1.start + 86, avc1.end);
  assert.deepEqual(
    config.map((b) => b.type),
    ['avcC', 'pasp']
  );
  assert.deepEqual(data.subarray(config[0].start + 8, config[0].end), Buffer.from(description));
  assert.equal(data.readUInt32BE(config[1].start + 8), 1);
  assert.equal(data.readUInt32BE(config[1].start + 12), 1);
});
test('MP4 refuses odd sizes, non-CFR timestamps, missing AVC config, Annex B, reordered frames and incomplete streams', () => {
  assert.throws(() => new AVCMp4Writer({ width: 3, height: 2, fps: 24, timestamps: [0] }), /even/);
  assert.throws(() => new AVCMp4Writer({ width: 2, height: 2, fps: 24, timestamps: [0, 200] }), /constant/);
  const w = new AVCMp4Writer({ width: 2, height: 2, fps: 1, timestamps: [0, 1000000] });
  w.begin();
  assert.throws(() => w.finish(), /incomplete/);
  assert.throws(() => w.frame({ timestamp: 0, type: 'key', data: sample(0) }), /configuration/);
  assert.throws(
    () => w.frame({ timestamp: 0, type: 'key', data: Uint8Array.of(0, 0, 0, 1, 0x65, 6), description }),
    /NAL/
  );
  assert.throws(() => w.frame({ timestamp: 100, type: 'key', data: sample(0), description }), /reordered/);
});
test('format, size and framing controls validate presets and enforce even MP4 dimensions', () => {
  for (const format of ['webm', 'gif', 'mp4', 'png']) assert.equal(mediaExportOptions({ format }).format, format);
  for (const value of [
    { format: 'avi' },
    { size: '8k' },
    { framing: 'stretch' },
    { palette: 'random' },
    { bitrate: 0 },
    { loopCount: 65536 },
    { dither: 1 },
  ])
    assert.throws(() => mediaExportOptions(value));
  for (const [size, expected] of [
    ['square', [1080, 1080]],
    ['vertical', [1080, 1920]],
    ['landscape', [1920, 1080]],
    ['w480', [480, 360]],
    ['w720', [720, 540]],
    ['w1080', [1080, 810]],
  ])
    assert.deepEqual(Object.values(mediaDimensions(800, 600, { size, format: 'mp4' })), expected);
  assert.deepEqual(mediaDimensions(321, 241, { format: 'mp4' }), { width: 322, height: 242 });
  assert.throws(() => mediaDimensions(0, 1));
  assert.throws(() => mediaDimensions(1, 8192, { size: 'w1080' }));
  assert.match(mediaControls('animation'), /animation-format/);
  assert.match(mediaControls('tour'), /tour-size/);
});
test('framing letterboxes or crops without stretching source aspect', () => {
  for (const framing of ['letterbox', 'crop']) {
    let draw;
    const canvas = {
      getContext: () => ({
        fillRect() {},
        drawImage: (...args) => {
          draw = args;
        },
      }),
    };
    const surface = createMediaSurface({ width: 200, height: 100 }, { size: 'square', framing }, () => canvas);
    surface.copy();
    assert.deepEqual(draw.slice(1), framing === 'letterbox' ? [0, 270, 1080, 540] : [-540, 0, 2160, 1080]);
  }
});
test('new native formats publish atomically and cancellation preserves existing files and removes staging', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'polytope-media-')),
    manager = createAnimationExportManager();
  try {
    for (const format of ['mp4', 'gif']) {
      const dest = path.join(folder, 'movie.' + format);
      await writeFile(dest, 'previous');
      const options = { format, fps: 24, frameCount: 3 },
        s = await manager.begin(options, dest);
      validateExportOptions(options);
      const parts =
        format === 'mp4'
          ? mp4().parts
          : (() => {
              const w = new GifWriter({ width: 2, height: 2 });
              return [w.begin(), w.frame(rgba(2, 2), 4), w.frame(rgba(2, 2), 4), w.frame(rgba(2, 2), 4), w.finish()];
            })();
      await manager.write(s.id, 0, parts[0]);
      await assert.rejects(manager.finish(s.id), /incomplete/);
      assert.equal(await readFile(dest, 'utf8'), 'previous');
      await manager.abort(s.id);
      assert.equal(await readFile(dest, 'utf8'), 'previous');
      assert.ok(!(await readdir(folder)).some((p) => p.startsWith('.polytope')));
      const t = await manager.begin(options, dest);
      for (let i = 0; i < parts.length; i++) await manager.write(t.id, i, parts[i]);
      assert.equal(await readFile(dest, 'utf8'), 'previous');
      await manager.finish(t.id);
      assert.deepEqual(await readFile(dest), join(parts));
    }
  } finally {
    await manager.abortAll();
    await rm(folder, { recursive: true, force: true });
  }
});
test('WebCodecs MP4 capability negotiation, immutable CFR frames and decoder config reach muxer', async () => {
  const frames = [],
    configs = [],
    writes = [];
  let codec;
  class Frame {
    constructor(canvas, o) {
      Object.assign(this, o);
      frames.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  class Encoder {
    static async isConfigSupported(c) {
      configs.push(c);
      return { supported: c.codec === 'avc1.420033' };
    }
    constructor(c) {
      this.output = c.output;
    }
    configure(c) {
      codec = c.codec;
    }
    encode(frame) {
      this.frame = frame;
    }
    async flush() {
      const i = frames.length - 1,
        data = sample(i);
      this.output(
        {
          timestamp: this.frame.timestamp,
          type: i ? 'delta' : 'key',
          byteLength: data.length,
          copyTo: (b) => b.set(data),
        },
        { decoderConfig: { codec, description } }
      );
    }
    close() {}
  }
  const result = await recordRenderedVideo({
    canvas: { width: 1080, height: 1920 },
    fps: 24,
    frameCount: 3,
    frameTimes: [0, 1 / 24, 0.05],
    format: 'mp4',
    bitrate: 'high',
    Encoder,
    Frame,
    renderFrame: async () => {},
    writeChunk: async (i, b) => writes.push(b),
  });
  assert.deepEqual(
    configs.map((c) => c.codec),
    ['avc1.420028', 'avc1.420033']
  );
  assert.equal(configs[0].avc.format, 'avc');
  assert.equal(configs[0].bitrate, 12000000);
  assert.deepEqual(
    frames.map((f) => f.timestamp),
    [0, 41667, 83333]
  );
  assert.ok(frames.every((f) => f.closed));
  assert.equal(result.encodedFrames, 3);
  assert.equal(boxes(join(writes)).at(-1).type, 'moov');
});
test('unsupported H.264 gives actionable alternate formats before any writes', async () => {
  let writes = 0;
  class Encoder {
    static async isConfigSupported() {
      return { supported: false };
    }
  }
  class Frame {}
  await assert.rejects(
    recordRenderedVideo({
      canvas: { width: 2, height: 2 },
      fps: 1,
      frameCount: 2,
      format: 'mp4',
      Encoder,
      Frame,
      renderFrame: async () => {},
      writeChunk: async () => writes++,
    }),
    /H.264.*WebM, GIF or PNG/
  );
  assert.equal(writes, 0);
});
