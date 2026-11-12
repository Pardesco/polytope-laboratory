import { NumericEntry } from './numeric-entry.mjs';
import { capturePrintableDisplay, printableDisplaySignature } from './printable-export.mjs';
import { buildFaceSurfaces } from './face-fill.mjs';

export const DISPLAY_FORMATS = ['glb', 'obj', 'x3d', 'off', 'json', 'stl', 'dxf', 'vrml', 'pov'];
const adapters = new WeakMap(),
  displaySources = new WeakMap(),
  assemblies = new WeakSet();
export const isExportAssembly = (model) => assemblies.has(model);
export function derivedExportGeometry(model, viewer, net, { pending = false, mode = 'net' } = {}) {
  if (pending) return null;
  if (model) return model;
  const source = mode === 'net' ? net : mode === 'cell-net' ? viewer?.cellNet : null;
  if (!source) return null;
  const displayed = viewer?.net === source || viewer?.cellNet === source ? viewer.model : null,
    key = displayed || source;
  if (adapters.has(key)) return adapters.get(key);
  let vertices, faces, edges;
  if (displayed) {
    ({ vertices, faces } = displayed);
    edges = [
      ...new Map(
        displayed.edges.map((e) => [
          e
            .slice()
            .sort((a, b) => a - b)
            .join(','),
          e,
        ])
      ).values(),
    ];
  } else {
    vertices = [];
    faces = [];
    edges = [];
    for (const face of source.faces) {
      const ids = face.points.map((p) => {
        vertices.push([...p, 0]);
        return vertices.length - 1;
      });
      faces.push(ids);
      ids.forEach((v, i) => edges.push([v, ids[(i + 1) % ids.length]]));
    }
  }
  const result = {
    id: (source.sourceId || 'derived') + '-export-layout',
    name: mode === 'net' ? 'Face net layout' : 'Cell net layout',
    dimension: 3,
    embeddingDimension: 3,
    interpretation: 'generalized-complex',
    vertices,
    faces,
    edges,
    cells: [],
    metadata: { exportViewAssembly: true, coordinateUnits: mode === 'net' ? 'mm' : 'model' },
  };
  const records = mode === 'net' ? source.faces : source.cells,
    byCell = new Map(records.map((r) => [r.id, r.component]));
  const faceComponents = faces.map((_, i) =>
    mode === 'net' ? source.faces[i].component : byCell.get(viewer.cellFaceOwners[i].cell)
  );
  const pieces = [...new Set(faceComponents)],
    vertexComponents = new Map();
  faces.forEach((face, i) => face.forEach((v) => vertexComponents.set(v, faceComponents[i])));
  result.components = pieces.map((piece, i) => ({
    id: 'layout-piece-' + i,
    name: 'Net component ' + piece,
    maps: {
      vertices: vertices.flatMap((_, v) => (vertexComponents.get(v) === piece ? [v] : [])),
      edges: edges.flatMap((edge, e) => (vertexComponents.get(edge[0]) === piece ? [e] : [])),
      faces: faceComponents.flatMap((c, f) => (c === piece ? [f] : [])),
      cells: [],
    },
  }));
  adapters.set(key, result);
  assemblies.add(result);
  if (displayed) displaySources.set(result, displayed);
  return result;
}

export function interchangeDisplaySignature(viewer) {
  return JSON.stringify([
    printableDisplaySignature(viewer),
    viewer?.surfaceGeometry?.attributes.color?.version,
    viewer?.surface?.material?.opacity,
    viewer?.lines?.material?.opacity,
    viewer?.points?.material?.opacity,
  ]);
}
const ownerComponents = (model, kind) => {
  const owners = new Map();
  model.components?.forEach((c, i) => c.maps[kind].forEach((id) => owners.set(id, i)));
  return owners;
};
export function captureInterchangeDisplay(viewer, model) {
  if (!viewer?.model || (assemblies.has(model) && !displaySources.has(model))) {
    if (!assemblies.has(model)) throw Error('Wait for the selected geometry to finish displaying.');
    const fill = buildFaceSurfaces(model);
    if (fill.diagnostics.length) throw Error('Resolve net face fill diagnostics before export.');
    const faceOwners = ownerComponents(model, 'faces'),
      edgeOwners = ownerComponents(model, 'edges');
    return {
      nodes: [],
      edges: model.edges.map((e) => e.map((v) => model.vertices[v].slice())),
      triangles: fill.triangles.map((t) => t.points.map((p) => p.slice())),
      colors: fill.triangles.map(() => [0.4, 0.65, 0.6, 1]),
      components: model.components.map((c) => c.name),
      triangles_components: fill.triangles.map((t) => faceOwners.get(t.face)),
      edges_components: model.edges.map((_, i) => edgeOwners.get(i)),
    };
  }
  const snapshot = capturePrintableDisplay(
    viewer,
    displaySources.get(model) || model,
    viewer.view.faces === false ? 'strut' : 'panels'
  );
  if (viewer.view.vertices !== true) snapshot.nodes = [];
  if (viewer.view.edges === false) snapshot.edges = [];
  const published = viewer.publishedPickState || viewer,
    packed = published.packedDisplay,
    owners = published.renderTriangles || published.triangles || [];
  const components = model.components?.map((c) => c.name || 'Component') || ['Model'],
    faceOwners = ownerComponents(model, 'faces'),
    edgeOwners = ownerComponents(model, 'edges');
  const vertexOwners = ownerComponents(model, 'vertices'),
    nodeIds = [];
  if (packed) {
    for (let i = 0; i < packed.vertexVisible.length; i++) if (packed.vertexVisible[i]) nodeIds.push(i);
  } else {
    const points = published.instanceProjected || published.projected || [],
      visibility = published.instanceVisibility || published.visibility;
    points.forEach((p, i) => {
      if (!p.clipped && visibility?.vertices[i] !== false) nodeIds.push(i);
    });
  }
  const colors = viewer.surfaceGeometry.attributes.color,
    material = viewer.surface?.material;
  const colorAt = (i) => {
    const base = i * 3 * (colors?.itemSize || 4),
      c = colors?.array;
    return c
      ? [...Array.from(c.slice(base, base + 3)), (colors.itemSize === 4 ? c[base + 3] : 1) * (material?.opacity ?? 1)]
      : [0.4, 0.5, 0.6, material?.opacity ?? 1];
  };
  const triangles_components = snapshot.triangles.map(
    (_, i) => faceOwners.get(packed ? packed.faceIds[i] : owners[i]?.face) ?? 0
  );
  const edges_components = snapshot.edges.map(
    (_, i) => edgeOwners.get(viewer.lines?.userData?.sourceEdgeIds?.[i]) ?? 0
  );
  const color = (material) => [...(material?.color?.toArray?.() || [0.5, 0.6, 0.7]), material?.opacity ?? 1];
  // Renderer edge buffers contain zero placeholders for hidden/clipped segments.
  const indices = snapshot.edges
    .map((edge, i) => (edge[0].some((x, k) => x !== edge[1][k]) ? i : -1))
    .filter((i) => i >= 0);
  return {
    nodes: snapshot.nodes,
    edges: indices.map((i) => snapshot.edges[i]),
    triangles: snapshot.triangles,
    colors: snapshot.triangles.map((_, i) => colorAt(i)),
    components,
    triangles_components,
    edges_components: indices.map((i) => edges_components[i]),
    nodes_components: snapshot.nodes.map(
      (_, i) => vertexOwners.get(published.explosionDisplay?.vertices[nodeIds[i]]?.sourceVertex ?? nodeIds[i]) ?? 0
    ),
    diagnostics: snapshot.diagnostics,
    edge_color: color(viewer.lines?.material),
    node_color: color(viewer.points?.material),
  };
}

export class InterchangeExportControls {
  constructor(context, host, kind, onChange) {
    this.context = context;
    this.kind = kind;
    kind.append(new Option('Displayed geometry (GLB / colored surfaces)', 'displayed'));
    const panel = document.createElement('div');
    panel.id = 'interchange-settings';
    panel.hidden = true;
    panel.innerHTML =
      '<label>Longest dimension (meters) <input id="interchange-size" value="0.1" maxlength="512"></label><p class="muted">Exports the displayed 3D projection, face colors and visible lines at this physical size. GLB uses meters. Includes net faces; tabs, labels, lighting and primitive thickness are omitted.</p>';
    host.prepend(panel);
    this.panel = panel;
    this.size = panel.querySelector('input');
    kind.addEventListener('change', () => {
      this.sync(false);
      if (this.enabled) context.setFormat('glb');
    });
    this.size.addEventListener('input', onChange);
  }
  get enabled() {
    return this.kind.value === 'displayed';
  }
  selection() {
    return { enabled: this.enabled, size: this.size.value };
  }
  signature() {
    return this.enabled ? interchangeDisplaySignature(this.context.getViewer()) : null;
  }
  async beforeCapture(options) {
    if (!this.enabled) return;
    const viewer = this.context.getViewer(),
      model = this.context.getGeometry();
    if (assemblies.has(model) && !displaySources.has(model)) return;
    const view = JSON.stringify(viewer.view);
    await viewer.prepareGeometryCapture(options);
    if (JSON.stringify(viewer.view) !== view) throw Error('Display pose changed. Review the export again.');
  }
  describe() {
    return { formats: DISPLAY_FORMATS.map((format) => ({ format, available: true })) };
  }
  prepare(model, params, options) {
    const entry = new NumericEntry({ ...this.context, getTarget: () => this.selection() });
    return entry.run(
      { size_m: { text: this.size.value, min: 0.000001, max: 1000 } },
      async (values, verify, { signal }) => {
        verify();
        const signature = this.signature(),
          display = captureInterchangeDisplay(this.context.getViewer(), this.context.getGeometry());
        const result = await this.context.prepareView(model, { ...params, ...values, display }, { signal });
        verify();
        if (this.signature() !== signature) throw Error('Display colors or pose changed. Review the export again.');
        return result;
      },
      { signal: options.signal }
    );
  }
  sync(saving) {
    this.panel.hidden = !this.enabled;
    this.size.disabled = saving;
  }
}
