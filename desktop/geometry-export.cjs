const { createTextExport } = require('./text-export.cjs');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const GEOMETRY_EXPORT_FORMATS = Object.freeze(['off', 'json', 'obj', 'stl', 'dxf', 'vrml', 'pov', '3mf', 'glb', 'x3d']);
function createGeometryExport(options) {
  const writer = createTextExport({
      ...options,
      formats: GEOMETRY_EXPORT_FORMATS,
      maxBytes: 128 * 1024 * 1024,
      maxSessions: 1,
    }),
    tickets = new Map(),
    io = options.io ?? fs;
  return {
    async begin(params, scope) {
      const ticket = await writer.begin(params, scope);
      if (ticket) {
        tickets.clear();
        tickets.set(ticket.id, { ...ticket, format: params.format });
      }
      return ticket;
    },
    async write(id, data) {
      const ticket = tickets.get(id);
      tickets.delete(id);
      if (!data || typeof data !== 'object' || ArrayBuffer.isView(data) || data instanceof ArrayBuffer)
        return writer.write(id, data);
      if (
        !ticket ||
        ticket.format !== 'obj' ||
        Object.keys(data).length !== 2 ||
        typeof data.obj !== 'string' ||
        typeof data.mtl !== 'string' ||
        !data.obj.startsWith('# Polytope Laboratory colored boundary geometry\nmtllib __POLYTOPE_MTL__\n') ||
        Buffer.byteLength(data.obj) + Buffer.byteLength(data.mtl) > 128 * 1024 * 1024
      ) {
        writer.abort(id);
        throw Error('Invalid bounded OBJ/MTL export payload.');
      }
      const { obj, mtl } = data;
      // A new exclusive sidecar cannot overwrite another document's materials.
      // The OBJ is the publication point; failed/canceled publication removes it.
      const name = 'polytope-materials-' + randomUUID() + '.mtl',
        materialPath = path.join(path.dirname(ticket.path), name);
      let handle,
        created = false,
        published = false;
      try {
        handle = await io.open(materialPath, 'wx');
        created = true;
        await handle.writeFile(mtl, 'utf8');
        await handle.sync();
        await handle.close();
        handle = null;
        const result = await writer.write(id, obj.replace('mtllib __POLYTOPE_MTL__\n', 'mtllib ' + name + '\n'));
        published = true;
        return { ...result, materialPath };
      } finally {
        if (handle) await handle.close().catch(() => {});
        if (!published) {
          writer.abort(id);
          if (created) await io.unlink(materialPath).catch(() => {});
        }
      }
    },
    abort(id) {
      tickets.delete(id);
      return writer.abort(id);
    },
    dispose() {
      tickets.clear();
      writer.dispose();
    },
  };
}
module.exports = { createGeometryExport, GEOMETRY_EXPORT_FORMATS };
