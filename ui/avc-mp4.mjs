const require = (ok, message) => {
  if (!ok) throw Error(message);
};
const u16 = (n) => Uint8Array.of((n >>> 8) & 255, n & 255),
  u32 = (n) => Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255),
  zeros = (n) => new Uint8Array(n),
  str = (s) => new TextEncoder().encode(s);
function join(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
const box = (type, ...parts) => {
  const data = join(...parts);
  return join(u32(data.length + 8), str(type), data);
};
const full = (type, version, flags, ...parts) =>
  box(type, Uint8Array.of(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts);
const matrix = join(u32(65536), u32(0), u32(0), u32(0), u32(65536), u32(0), u32(0), u32(0), u32(0x40000000));
export class AVCMp4Writer {
  constructor({ width, height, fps, timestamps, maximumBytes = 512 * 1024 * 1024 }) {
    require(Number.isInteger(width) &&
      width >= 2 &&
      width <= 8192 &&
      width % 2 === 0 &&
      Number.isInteger(height) &&
      height >= 2 &&
      height <= 8192 &&
      height % 2 === 0 &&
      Number.isInteger(fps) &&
      fps >= 1 &&
      fps <= 60, 'MP4 requires even dimensions and 1–60 fps.');
    require(Array.isArray(timestamps) &&
      timestamps.length > 0 &&
      timestamps.length <= 18001 &&
      timestamps.every((t, i) => t === Math.round((i * 1e6) / fps)), 'MP4 requires constant frame rate timestamps.');
    Object.assign(this, { width, height, fps, timestamps: timestamps.slice(), maximumBytes });
    this.total = 0;
    this.samples = [];
    this.description = null;
  }
  account(bytes) {
    require(bytes.length <= 32 * 1024 * 1024 &&
      this.total + bytes.length <= this.maximumBytes, 'MP4 exceeds export byte budget.');
    this.total += bytes.length;
    return bytes;
  }
  begin() {
    require(!this.started, 'MP4 already started.');
    this.started = true;
    return this.account(box('ftyp', str('isom'), u32(512), str('isomiso2avc1mp41')));
  }
  frame({ timestamp, type, data, description }) {
    require(this.started &&
      !this.finished &&
      timestamp === this.timestamps[this.samples.length], 'MP4 received an unrelated or reordered frame.');
    require((type === 'key' || type === 'delta') &&
      (this.samples.length > 0 || type === 'key'), 'MP4 requires an initial keyframe.');
    require(data instanceof Uint8Array &&
      data.length > 0 &&
      data.length <= 32 * 1024 * 1024 - 1024, 'Invalid MP4 sample.');
    if (description) {
      const d = new Uint8Array(description.buffer || description, description.byteOffset || 0, description.byteLength);
      require(d.length >= 7 &&
        d.length <= 65536 &&
        d[0] === 1 &&
        d[1] === 66 &&
        (d[4] & 3) === 3, 'MP4 requires baseline 4:2:0 AVC with four-byte NAL lengths.');
      if (this.description)
        require(d.length === this.description.length &&
          d.every((v, i) => v === this.description[i]), 'AVC configuration changed during export.');
      else this.description = d.slice();
    }
    require(this.description, 'H.264 encoder did not supply an AVC decoder configuration.');
    let at = 0;
    while (at < data.length) {
      require(at + 4 <= data.length, 'Truncated AVC NAL length.');
      const n = new DataView(data.buffer, data.byteOffset + at, 4).getUint32(0);
      require(n > 0 && at + 4 + n <= data.length, 'Invalid length-prefixed AVC sample.');
      at += 4 + n;
    }
    this.samples.push({ size: data.length, offset: this.total + 8, key: type === 'key' });
    return this.account(box('mdat', data));
  }
  finish() {
    require(this.started &&
      !this.finished &&
      this.samples.length === this.timestamps.length &&
      this.description, 'MP4 is incomplete.');
    const n = this.samples.length,
      duration = n,
      scale = this.fps;
    const mvhd = full(
      'mvhd',
      0,
      0,
      u32(0),
      u32(0),
      u32(scale),
      u32(duration),
      u32(65536),
      u16(256),
      zeros(10),
      matrix,
      zeros(24),
      u32(2)
    );
    const tkhd = full(
      'tkhd',
      0,
      7,
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(duration),
      zeros(8),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      matrix,
      u32(this.width * 65536),
      u32(this.height * 65536)
    );
    const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(scale), u32(duration), u16(0x55c4), u16(0));
    const hdlr = full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('Polytope video\0'));
    const avc1 = box(
      'avc1',
      zeros(6),
      u16(1),
      zeros(16),
      u16(this.width),
      u16(this.height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      zeros(32),
      u16(24),
      u16(65535),
      box('avcC', this.description),
      box('pasp', u32(1), u32(1))
    );
    const stsd = full('stsd', 0, 0, u32(1), avc1),
      stts = full('stts', 0, 0, u32(1), u32(n), u32(1)),
      stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
    const stsz = full('stsz', 0, 0, u32(0), u32(n), ...this.samples.map((s) => u32(s.size))),
      stco = full('stco', 0, 0, u32(n), ...this.samples.map((s) => u32(s.offset)));
    const keys = this.samples.flatMap((s, i) => (s.key ? [u32(i + 1)] : [])),
      stss = full('stss', 0, 0, u32(keys.length), ...keys);
    const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
      minf = box('minf', full('vmhd', 0, 1, zeros(8)), dinf, box('stbl', stsd, stts, stsc, stsz, stco, stss));
    const result = box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlr, minf)));
    this.finished = true;
    return this.account(result);
  }
}
