import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
export const cellRebuildSignature = (m) =>
  canonical({
    name: m?.name,
    geometry: Object.fromEntries(
      ['dimension', 'embeddingDimension', 'interpretation', 'vertices', 'edges', 'faces', 'cells'].map((k) => [
        k,
        m?.[k],
      ])
    ),
    metadata: m?.metadata,
    numeric: m?.numeric,
    provenance: m?.provenance,
  });
export function cellRebuildParams(raw) {
  const parts = raw.ids.trim().split(/[\s,;]+/);
  if (parts.length !== 2 || parts.some((p) => !/^\d+$/.test(p)))
    throw Error('Enter exactly two literal cell IDs, separated by a comma.');
  const ids = parts.map(Number).sort((a, b) => a - b);
  if (ids.some((i) => !Number.isSafeInteger(i)) || ids[0] === ids[1])
    throw Error('Choose two distinct literal cell IDs.');
  if (!['require-equal', 'first-source'].includes(raw.color)) throw Error('Choose a supported cell color policy.');
  return { cell_ids: ids, color_policy: raw.color };
}
export function checkCellRebuildPreview(packet, params) {
  const m = packet?.model,
    c = packet?.construction;
  if (
    !m?.validation?.passed ||
    m.dimension !== 4 ||
    m.embeddingDimension !== 4 ||
    m.numeric?.certified !== false ||
    !c ||
    canonical(c) !== canonical(m.metadata?.cellRebuild) ||
    c.scenarioId !== 'con-10-4d-cell-rebuild' ||
    canonical(c.selectedCellIds) !== canonical(params.cell_ids) ||
    c.colorPolicy !== params.color_policy ||
    m.provenance?.operation !== 'rebuild-coplanar-cells' ||
    canonical(m.provenance.parameters) !== canonical(params) ||
    c.faceSources?.length !== m.faces.length ||
    c.cellSources?.length !== m.cells.length ||
    c.cellColorSources?.length !== m.cells.length ||
    !(c.joinedCellContent > 0) ||
    !Number.isFinite(c.contentResidual) ||
    c.contentResidual < 0 ||
    !Number.isFinite(c.hyperplaneResidual) ||
    c.hyperplaneResidual < 0 ||
    !Number.isFinite(c.relativeSupportResidual) ||
    c.relativeSupportResidual > c.relativeTolerance ||
    c.certified !== false
  )
    throw Error('Native cell reconstruction preview or owner receipt is malformed.');
  return packet;
}

export class CellRebuildControls {
  constructor(context) {
    this.context = context;
    this.busy = false;
    this.preview = null;
    this.panel = document.createElement('details');
    this.panel.id = 'cell-rebuild-settings';
    this.panel.innerHTML =
      '<summary>Coplanar cells · join a split 4D cell</summary><label>Cells to join <input id="cell-rebuild-ids" placeholder="6, 8"></label><details><summary>Cell color policy</summary><label>Joined cell color <select id="cell-rebuild-color"><option value="require-equal">Require equal stored colors</option><option value="first-source">Use lower source cell ID color</option></select></label></details><div class="button-row"><button id="cell-rebuild-preview">Preview cell join</button><button id="cell-rebuild-adopt">Adopt cell join</button></div><button id="cell-rebuild-cancel" hidden>Cancel cell join</button><p class="muted">Two convex cells in one 3D hyperplane sharing one complete face. Exterior face cycles and colors stay with their source owners. After joining, use Blend coplanar faces to remove exterior subdivisions. No coordinate welding. Float64 approximate; nonconvex joins are refused. Unchanged exterior elements retain annotations; annotations on the joined cells and removed face stay in the source archive.</p><output id="cell-rebuild-result" class="muted" aria-live="polite"></output><details><summary>Element, color and content owners</summary><pre id="cell-rebuild-owners" class="code-box"></pre></details>';
    document.getElementById('face-editing-settings').after(this.panel);
    this.node('cell-rebuild-preview').onclick = context.guard(() => this.apply(false));
    this.node('cell-rebuild-adopt').onclick = context.guard(() => this.apply(true));
    this.node('cell-rebuild-cancel').onclick = () => this.cancel();
    for (const event of ['input', 'change']) this.panel.addEventListener(event, () => this.invalidate());
    this.sync();
  }
  node(id) {
    return this.panel.querySelector('#' + id);
  }
  raw() {
    return { ids: this.node('cell-rebuild-ids').value, color: this.node('cell-rebuild-color').value };
  }
  history() {
    return canonical(this.context.getDocument()?.operationHistory ?? null);
  }
  content() {
    const view = this.context.getState()?.view;
    return canonical(
      Object.fromEntries(
        ['elementAnnotations', 'elementContentDetached', 'elementContentTransfer', 'documentMetadata'].map((k) => [
          k,
          view?.[k],
        ])
      )
    );
  }
  invalidate(message = 'Compute a cell join preview.') {
    this.preview = null;
    this.node('cell-rebuild-result').textContent = message;
    this.node('cell-rebuild-owners').textContent = '';
    this.node('cell-rebuild-adopt').disabled = true;
  }
  verify(preview) {
    verifyNativeSource(this.context, preview.owner);
    if (
      canonical(this.raw()) !== preview.raw ||
      this.history() !== preview.history ||
      this.content() !== preview.content
    )
      throw Error('Cell join inputs, content or operation history changed. Compute a new preview.');
  }
  cancel() {
    this.job?.abort();
    this.invalidate('Cell join canceled.');
  }
  async apply(adopt = false) {
    if (this.busy || this.context.isExporting())
      throw Error('Finish the current computation or export before joining cells.');
    const raw = this.raw(),
      params = cellRebuildParams(raw),
      cached = this.preview;
    if (adopt) {
      if (!cached) throw Error('Compute a cell join preview first.');
      try {
        this.verify(cached);
      } catch (error) {
        this.invalidate(error.message);
        throw error;
      }
    }
    const owner = captureNativeSource(this.context),
      history = this.history(),
      controller = new AbortController();
    const preparation = { owner, history, content: this.content(), raw: canonical(raw), params };
    this.job = controller;
    const verify = () => {
      if (controller.signal.aborted) throw Object.assign(Error('Cell join canceled.'), { name: 'AbortError' });
      this.verify(preparation);
    };
    this.busy = true;
    if (!adopt) this.invalidate('Computing cell join preview…');
    this.sync();
    try {
      verify();
      if (adopt) {
        return await this.context.commit('rebuild-coplanar-cells', params, 'Join coplanar cells', {
          signal: controller.signal,
          verifyPublication: verify,
          verifyResult: (document) => {
            const actual = document?.states?.[document.cursor]?.model;
            if (cellRebuildSignature(actual) !== cached.signature)
              throw Error('Native cell join result differs from the preview. Compute a new preview.');
          },
        });
      }
      const packet = await this.context.run(
        'rebuild-coplanar-cells-preview',
        params,
        JSON.parse(owner.modelSignature),
        'Preview cell join',
        { signal: controller.signal }
      );
      verify();
      checkCellRebuildPreview(packet, params);
      const c = packet.construction,
        m = packet.model;
      this.preview = { ...preparation, signature: cellRebuildSignature(m) };
      this.node('cell-rebuild-result').textContent =
        `Cells ${c.selectedCellIds.join(', ')} → cell ${c.mergedCellId}. Removed shared face ${c.removedFaceIds.join(', ')}. ${m.cells.length} cells, ${m.faces.length} faces. Intrinsic 3D content ${c.joinedCellContent.toPrecision(8)} source units³; content residual ${c.contentResidual.toExponential(3)}; hyperplane residual ${c.hyperplaneResidual.toExponential(3)} source units. Float64 approximate.`;
      this.node('cell-rebuild-owners').textContent = c.faceSources
        .map((f, i) => `Face ${i}: source face ${f}; cycle and color unchanged.`)
        .concat(
          c.cellSources.map(
            (ids, i) => `Cell ${i}: source cells ${ids.join(', ')}; color source cell ${c.cellColorSources[i]}.`
          ),
          `Joined content: sum of source cells ${c.selectedCellIds.join(', ')} (${c.sourceCellContents.join(' + ')}).`,
          'Vertices and edges: identity source maps. No global 4D content asserted.'
        )
        .join('\n');
      return packet;
    } catch (error) {
      this.invalidate(error.message);
      throw error;
    } finally {
      this.busy = false;
      if (this.job === controller) this.job = null;
      this.sync();
    }
  }
  sync() {
    if (this.preview)
      try {
        this.verify(this.preview);
      } catch {
        this.invalidate('Source or settings changed; compute a new cell join preview.');
      }
    const m = this.context.getState()?.model,
      blocked = this.busy || this.context.isExporting();
    for (const n of this.panel.querySelectorAll('button,input,select')) n.disabled = blocked;
    this.node('cell-rebuild-preview').disabled = blocked || m?.dimension !== 4 || m?.cells?.length < 2;
    this.node('cell-rebuild-adopt').disabled = blocked || !this.preview;
    this.node('cell-rebuild-cancel').hidden = !this.busy;
    this.node('cell-rebuild-cancel').disabled = false;
  }
}
