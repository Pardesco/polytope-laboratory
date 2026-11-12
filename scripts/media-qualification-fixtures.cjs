// Literal codec fixtures, independent of the application writers. No GUI.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  { deflateSync } = require('node:zlib'),
  { spawnSync } = require('node:child_process');
const { crc32 } = require('./media-verifier.cjs');
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
function literalPng(width, height, color) {
  const chunk = (name, bytes) => {
    const value = Buffer.concat([Buffer.from(name), bytes]);
    return Buffer.concat([u32(bytes.length), value, u32(crc32(value))]);
  };
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) Buffer.from(color).copy(raw, y * (width * 4 + 1) + 1 + x * 4);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function literalGif() {
  const pieces = [Buffer.from('47494638396110000c00810000ff000000ff000000ffffff00', 'hex')];
  for (let frame = 0; frame < 4; frame++) {
    pieces.push(Buffer.from([0x21, 0xf9, 4, 4, [13, 13, 1, 13][frame], 0, 0, 0, 0x2c, 0, 0, 0, 0, 16, 0, 12, 0, 0, 2]));
    const codes = [];
    for (let i = 0; i < 16 * 12; i++) codes.push(4, frame);
    codes.push(5);
    const packed = Buffer.alloc(Math.ceil((codes.length * 3) / 8));
    codes.forEach((code, i) => {
      for (let bit = 0; bit < 3; bit++) packed[(i * 3 + bit) >> 3] |= ((code >> bit) & 1) << ((i * 3 + bit) & 7);
    });
    for (let at = 0; at < packed.length; at += 255) {
      const part = packed.subarray(at, at + 255);
      pieces.push(Buffer.from([part.length]), part);
    }
    pieces.push(Buffer.from([0]));
  }
  return Buffer.concat([...pieces, Buffer.from([0x3b])]);
}
async function main() {
  const folder = path.resolve(__dirname, '../tests/fixtures/media'),
    reference = path.join(folder, 'reference');
  await fs.mkdir(reference, { recursive: true });
  for (const [i, color] of [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
  ].entries())
    await fs.writeFile(path.join(reference, `frame-${String(i).padStart(6, '0')}.png`), literalPng(16, 12, color));
  await fs.writeFile(path.join(folder, 'alpha.png'), literalPng(2, 1, [70, 100, 130, 64]));
  await fs.writeFile(path.join(folder, 'timing.gif'), literalGif());
  for (const format of ['webm', 'mp4']) {
    const r = spawnSync(
      process.env.POLYTOPE_FFMPEG || 'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-framerate',
        '8',
        '-i',
        path.join(reference, 'frame-%06d.png'),
        '-frames:v',
        '4',
        '-an',
        '-c:v',
        format === 'webm' ? 'libvpx' : 'libx264',
        '-pix_fmt',
        'yuv420p',
        ...(format === 'mp4' ? ['-profile:v', 'baseline', '-bf', '0'] : []),
        path.join(folder, 'cadence.' + format),
      ],
      { windowsHide: true, timeout: 30000 }
    );
    if (r.error) throw r.error;
    if (r.status !== 0) throw Error(r.stderr.toString());
  }
  await fs.writeFile(
    path.join(reference, 'sequence.json'),
    JSON.stringify(
      { version: 1, fps: 8, frameCount: 4, endpointIncluded: true, frameTimes: [0, 0.125, 0.25, 0.375] },
      null,
      2
    ) + '\n'
  );
  const version = spawnSync(process.env.POLYTOPE_FFMPEG || 'ffmpeg', ['-version'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000,
    })
      .stdout.split('\n')[0]
      .trim(),
    files = {};
  for (const name of [
    'alpha.png',
    'timing.gif',
    'cadence.mp4',
    'cadence.webm',
    ...Array.from({ length: 4 }, (_, i) => `reference/frame-${String(i).padStart(6, '0')}.png`),
    'reference/sequence.json',
  ])
    files[name] = require('node:crypto')
      .createHash('sha256')
      .update(await fs.readFile(path.join(folder, name)))
      .digest('hex');
  await fs.writeFile(
    path.join(folder, 'provenance.json'),
    JSON.stringify(
      {
        generator: 'scripts/media-qualification-fixtures.cjs',
        appEncodersUsed: false,
        ffmpeg: version,
        dimensions: [16, 12],
        cfrTimes: [0, 0.125, 0.25, 0.375],
        gifMathTimes: [0, 0.125, 0.25, 0.26],
        gifDelaysCentiseconds: [13, 13, 1, 13],
        files,
      },
      null,
      2
    ) + '\n'
  );
  console.log('Independent literal PNG/GIF and FFmpeg VP8/H.264 fixtures written.');
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { literalPng, literalGif };
