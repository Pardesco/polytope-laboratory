const { randomUUID } = require('node:crypto');
const { createTextExport } = require('./text-export.cjs');
const IMAGE_EXPORT_LIMITS = Object.freeze({ dataUrl: 32 * 1024 * 1024, bytes: 24 * 1024 * 1024 });
function decodeImage(data) {
  if (
    typeof data !== 'string' ||
    data.length > IMAGE_EXPORT_LIMITS.dataUrl ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(data)
  )
    throw Error('Invalid PNG image.');
  const encoded = data.slice(22),
    bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length < 33 ||
    bytes.toString('base64') !== encoded ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20)
  )
    throw Error('Invalid PNG image header.');
  return bytes;
}
function createImageExport(options) {
  const exports = createTextExport({
    ...options,
    formats: ['png'],
    maxBytes: IMAGE_EXPORT_LIMITS.bytes,
    maxSessions: 1,
  });
  return {
    begin: (id, params) => exports.begin(params, { id }),
    write: (id, data) => exports.write(id, decodeImage(data)),
    abort: (id) => exports.abort(id),
    dispose: () => exports.dispose(),
    async save(data) {
      const bytes = decodeImage(data),
        id = randomUUID();
      try {
        const ticket = await exports.begin({ format: 'png', defaultName: 'Polytope.png' }, { id });
        return ticket ? await exports.write(id, bytes) : null;
      } finally {
        exports.abort(id);
      }
    },
  };
}
module.exports = { createImageExport, decodeImage, IMAGE_EXPORT_LIMITS };
