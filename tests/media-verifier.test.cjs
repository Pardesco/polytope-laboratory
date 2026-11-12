const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const {
  inspectBuffer,
  verifySequence,
  verifyMedia,
  timing,
  assertTimes,
  toolsAvailable,
} = require('../scripts/media-verifier.cjs');
const { literalPng, literalGif } = require('../scripts/media-qualification-fixtures.cjs');
const { crc32 } = require('../scripts/media-verifier.cjs'),
  { deflateSync } = require('node:zlib');
const folder = path.join(__dirname, 'fixtures/media'),
  times = [0, 0.125, 0.25, 0.375];
test('independent PNG reader reconstructs RGB and actual partial alpha', async () => {
  const p = inspectBuffer(await fs.readFile(path.join(folder, 'alpha.png')), 'png');
  assert.deepEqual([p.width, p.height, p.frameCount], [2, 1, 1]);
  assert.deepEqual(p.alpha, { channel: true, min: 64, max: 64 });
  assert.deepEqual([...p.pixels], [70, 100, 130, 64, 70, 100, 130, 64]);
});
test('PNG CRC, truncation, scanline and dimension corruption are rejected', () => {
  const png = literalPng(3, 2, [1, 2, 3, 255]);
  for (const n of [0, 8, 30, png.length - 1]) assert.throws(() => inspectBuffer(png.subarray(0, n), 'png'));
  const altered = Buffer.from(png);
  altered[45] ^= 1;
  assert.throws(() => inspectBuffer(altered, 'png'), /CRC/);
  assert.throws(() => inspectBuffer(Buffer.from('nonsense'), 'png'));
});
test('PNG RGB reader independently reconstructs all five scanline filters', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const u32 = (n) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(n);
      return b;
    },
    chunk = (type, b) => {
      const data = Buffer.concat([Buffer.from(type), b]);
      return Buffer.concat([u32(b.length), data, u32(crc32(data))]);
    };
  const encoded = [
    [15, 25, 35, 45, 55, 65],
    [15, 25, 35, 30, 30, 30],
    [5, 5, 5, 5, 5, 5],
    [10, 15, 20, 18, 18, 18],
    [5, 5, 5, 5, 5, 5],
  ];
  for (let filter = 0; filter < 5; filter++) {
    const bytes = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', Buffer.concat([u32(2), u32(2), Buffer.from([8, 2, 0, 0, 0])])),
      chunk('IDAT', deflateSync(Buffer.from([0, 10, 20, 30, 40, 50, 60, filter, ...encoded[filter]]))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const p = inspectBuffer(bytes, 'png');
    assert.deepEqual([...p.pixels], [10, 20, 30, 255, 40, 50, 60, 255, 15, 25, 35, 255, 45, 55, 65, 255]);
    assert.deepEqual(p.alpha, { channel: false, min: 255, max: 255 });
  }
});
test('literal GIF reads centisecond delays, opaque policy and exactly four images', async () => {
  const result = inspectBuffer(await fs.readFile(path.join(folder, 'timing.gif')), 'gif');
  assert.deepEqual([result.width, result.height, result.frameCount], [16, 12, 4]);
  assert.deepEqual(result.delays, [0.13, 0.13, 0.01, 0.13]);
  assertTimes(result.times, [0, 0.13, 0.26, 0.27]);
  assert.equal(result.alpha.channel, false);
  assert.equal(result.structureOnly, true);
});
test('GIF missing terminator, impossible rectangles and truncated subblocks fail', () => {
  const bytes = literalGif();
  assert.throws(() => inspectBuffer(bytes.subarray(0, -1), 'gif'));
  assert.throws(() => inspectBuffer(bytes.subarray(0, 60), 'gif'));
  const bad = Buffer.from(bytes);
  bad.writeUInt16LE(17, 38);
  assert.throws(() => inspectBuffer(bad, 'gif'));
});
test('independent WebM walker reads VP8 dimensions, frame count and times', async () => {
  const bytes = await fs.readFile(path.join(folder, 'cadence.webm')),
    result = inspectBuffer(bytes, 'webm');
  assert.equal(result.codec, 'vp8');
  assert.deepEqual([result.width, result.height, result.frameCount], [16, 12, 4]);
  assertTimes(result.times, times);
  assert.throws(() => inspectBuffer(bytes.subarray(0, bytes.length - 200), 'webm'));
});
test('PNG references verify decoded endpoints, count and manifest', async () => {
  const { report, references } = await verifySequence(path.join(folder, 'reference'), { times });
  assert.equal(report.level, 'decoded');
  assert.equal(references.length, 4);
  assert.equal(references[0].length, 16 * 12 * 3);
  assert.notEqual(report.endpointHashes[0], report.endpointHashes[1]);
  await assert.rejects(() => verifySequence(path.join(folder, 'reference'), { times: [0, 0.1, 0.2] }));
});
test('math samples, MP4 cadence and GIF presentation are explicitly different', () => {
  const t = [0, 0.125, 0.25, 0.26];
  assert.deepEqual(timing(t, 8, 'webm').presentationTimes, t);
  assert.deepEqual(timing(t, 8, 'mp4').presentationTimes, [0, 0.125, 0.25, 0.375]);
  assertTimes(timing(t, 8, 'gif').presentationTimes, [0, 0.13, 0.26, 0.27]);
  assert.deepEqual(timing(t, 8, 'gif').delays, [0.13, 0.13, 0.01, 0.13]);
  assert.throws(() => timing([0, 0], 8, 'webm'));
  assert.throws(() => assertTimes([0, 0.1], [0, 0.2]));
});
test('missing external decoder yields a visible structure-only result', async () => {
  const { references, report } = await verifySequence(path.join(folder, 'reference'));
  const result = await verifyMedia(path.join(folder, 'cadence.webm'), {
    times,
    fps: 8,
    references,
    ...report,
    tools: { available: false },
  });
  assert.equal(result.qualified, false);
  assert.equal(result.level, 'structure-only');
  assert.match(result.diagnostic, /unavailable/);
});
for (const format of ['webm', 'mp4', 'gif'])
  test(
    `FFmpeg independently decodes fixture ${format} and uniquely matches both endpoint poses`,
    { skip: !toolsAvailable().available },
    async () => {
      const { references, report } = await verifySequence(path.join(folder, 'reference')),
        sourceTimes = format === 'gif' ? [0, 0.125, 0.25, 0.26] : times;
      const result = await verifyMedia(path.join(folder, format === 'gif' ? 'timing.gif' : 'cadence.' + format), {
        times: sourceTimes,
        fps: 8,
        references,
        width: report.width,
        height: report.height,
      });
      assert.equal(result.qualified, true);
      assert.equal(result.poseEndpoints.first.closestReference, 0);
      assert.equal(result.poseEndpoints.last.closestReference, 3);
      await assert.rejects(
        () =>
          verifyMedia(path.join(folder, format === 'gif' ? 'timing.gif' : 'cadence.' + format), {
            times: sourceTimes,
            fps: 8,
            references: [...references].reverse(),
            width: 16,
            height: 12,
          }),
        /different PNG pose/
      );
    }
  );
