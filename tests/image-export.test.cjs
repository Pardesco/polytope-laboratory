const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createImageExport, decodeImage } = require('../desktop/image-export.cjs');
const { createTextExport } = require('../desktop/text-export.cjs');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'polytope-image-export-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^polytope-image-export-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'image.png');
  await fs.writeFile(file, 'Prior complete image');
  return { root, file };
}
test('PNG export publishes exact bytes atomically and consumes its literal destination ticket once', async (t) => {
  const { root, file } = await fixture(t),
    events = [];
  const io = {
    ...fs,
    open: async (...args) => {
      events.push('open');
      const handle = await fs.open(...args);
      return {
        writeFile: async (data) => {
          events.push('write');
          assert.equal(await fs.readFile(file, 'utf8'), 'Prior complete image');
          await handle.writeFile(data);
        },
        sync: async () => {
          events.push('sync');
          await handle.sync();
        },
        close: async () => {
          events.push('close');
          await handle.close();
        },
      };
    },
    rename: async (...args) => {
      events.push('rename');
      await fs.rename(...args);
    },
  };
  const exporter = createImageExport({ selectPath: async () => file, io });
  const ticket = await exporter.begin('image-1', { format: 'png', defaultName: 'Polytope.png' });
  assert.equal(ticket.id, 'image-1');
  const result = await exporter.write(ticket.id, png);
  assert.equal(result.format, 'png');
  assert.deepEqual(await fs.readFile(file), decodeImage(png));
  assert.deepEqual(events, ['open', 'write', 'sync', 'close', 'rename']);
  assert.deepEqual(await fs.readdir(root), ['image.png']);
  await assert.rejects(exporter.write(ticket.id, png), /unavailable/);
});
for (const phase of ['write', 'sync', 'rename'])
  test(`failed PNG ${phase} preserves the selected prior file and removes its sibling temporary`, async (t) => {
    const { root, file } = await fixture(t),
      io = { ...fs };
    if (phase === 'rename')
      io.rename = async () => {
        throw Error('Injected rename failure');
      };
    else
      io.open = async (...args) => {
        const handle = await fs.open(...args);
        return {
          writeFile: async (data) => {
            await handle.writeFile(data.subarray(0, 12));
            if (phase === 'write') throw Error('Injected write failure');
            await handle.writeFile(data.subarray(12));
          },
          sync: async () => {
            throw Error('Injected sync failure');
          },
          close: () => handle.close(),
        };
      };
    const exporter = createImageExport({ selectPath: async () => file, io });
    await assert.rejects(exporter.save(png), /Injected/);
    assert.equal(await fs.readFile(file, 'utf8'), 'Prior complete image');
    assert.deepEqual(await fs.readdir(root), ['image.png']);
  });
test('canceling a known request ID interrupts the held chooser before a late selection can write', async (t) => {
  const { root, file } = await fixture(t);
  let resolve;
  const exporter = createImageExport({ selectPath: () => new Promise((done) => (resolve = done)) });
  const pending = exporter.begin('held-image', { format: 'png', defaultName: 'Polytope.png' });
  await tick();
  assert.equal(exporter.abort('held-image'), true);
  await assert.rejects(pending, { name: 'AbortError' });
  resolve(file);
  await tick();
  assert.equal(await fs.readFile(file, 'utf8'), 'Prior complete image');
  assert.deepEqual(await fs.readdir(root), ['image.png']);
});
test('legacy saveImage is atomic, uses one pending chooser, and canceled destinations preserve existing bytes', async (t) => {
  const { file } = await fixture(t);
  let resolve;
  const exporter = createImageExport({ selectPath: () => new Promise((done) => (resolve = done)) }),
    pending = exporter.save(png);
  await tick();
  await assert.rejects(exporter.save(png), /pending text exports/);
  resolve({ canceled: true });
  assert.equal(await pending, null);
  assert.equal(await fs.readFile(file, 'utf8'), 'Prior complete image');
});
test('invalid PNG input and unrelated formats never reach legacy destination selection', async () => {
  let dialogs = 0;
  const exporter = createImageExport({
    selectPath: async () => {
      dialogs++;
      return null;
    },
  });
  for (const data of ['', png + '!', png.replace('iVBOR', 'aVBOR'), 'data:image/png;base64,AA=='])
    await assert.rejects(exporter.save(data), /PNG/);
  await assert.rejects(exporter.begin('other', { format: 'pdf', defaultName: 'Other.pdf' }), /unsupported/);
  assert.equal(dialogs, 0);
  const support = createTextExport({ selectPath: async () => null });
  await assert.rejects(support.begin({ format: 'png', defaultName: 'Image.png' }), /unsupported/);
});
test('requested IDs are bounded, cannot collide, and dispose cancels an incomplete PNG chooser', async () => {
  let resolve;
  const exporter = createImageExport({ selectPath: () => new Promise((done) => (resolve = done)) });
  await assert.rejects(exporter.begin('bad/id', { format: 'png', defaultName: 'Image.png' }), /invalid/);
  const pending = exporter.begin('one', { format: 'png', defaultName: 'Image.png' });
  await tick();
  await assert.rejects(exporter.begin('one', { format: 'png', defaultName: 'Image.png' }));
  exporter.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
  resolve(null);
});

test('requested ticket collisions cannot replace another ready owner when spare session slots exist', async (t) => {
  const { file } = await fixture(t),
    exporter = createTextExport({ selectPath: async () => file });
  const params = { format: 'json', defaultName: 'Image.json' },
    ticket = await exporter.begin(params, { id: 'literal-owner' });
  await assert.rejects(exporter.begin(params, { id: 'literal-owner' }), /collision/);
  assert.equal(exporter.abort(ticket.id), true);
});

test('canceling an in-progress PNG sync prevents rename and removes the partial sibling', async (t) => {
  const { root, file } = await fixture(t);
  let entered, release;
  const reached = new Promise((resolve) => (entered = resolve)),
    held = new Promise((resolve) => (release = resolve));
  const exporter = createImageExport({
    selectPath: async () => file,
    io: {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          writeFile: (data) => handle.writeFile(data),
          sync: async () => {
            entered();
            await held;
            await handle.sync();
          },
          close: () => handle.close(),
        };
      },
    },
  });
  await exporter.begin('held-write', { format: 'png', defaultName: 'Image.png' });
  const pending = exporter.write('held-write', png);
  await reached;
  exporter.abort('held-write');
  release();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(await fs.readFile(file, 'utf8'), 'Prior complete image');
  assert.deepEqual(await fs.readdir(root), ['image.png']);
});
