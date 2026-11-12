import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
import { checkedFabricationPages } from './net-fabrication-controls.mjs';
const stable = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]])
        )
      : v
  );
const aborted = () => Object.assign(Error('Hinge strip export canceled.'), { name: 'AbortError' });

export function checkedHingeStrips(result, source, net, paper, values) {
  checkedFabricationPages(result, net, paper);
  if (
    result.policy !== 'symmetric-end-setback-v1' ||
    !Array.isArray(result.parts) ||
    result.parts.length !== source.edges.length ||
    typeof result.csv !== 'string' ||
    !result.csv.startsWith('policy,source_hash,part_id,match_id,') ||
    !Number.isFinite(result.maxAttachmentResidualMm) ||
    result.maxAttachmentResidualMm < 0 ||
    result.maxAttachmentResidualMm > 1e-7 * Math.max(1, net.edge_length_mm)
  )
    throw Error('Native hinge strips require complete source matching IDs and a bounded attachment residual.');
  const seen = new Set(),
    points = source.vertices,
    dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const [a, b] = source.edges[0],
    scale = net.edge_length_mm / dist(points[a], points[b]);
  for (const part of result.parts) {
    const edge = source.edges[part.sourceEdgeId];
    if (
      !edge ||
      seen.has(part.sourceEdgeId) ||
      part.id !== `H-E${part.sourceEdgeId}` ||
      part.matchId !== `E${part.sourceEdgeId}` ||
      stable(part.sourceVertexIds) !== stable(edge)
    )
      throw Error('Native hinge strip source-edge matching IDs changed.');
    seen.add(part.sourceEdgeId);
    const length = dist(points[edge[0]], points[edge[1]]) * scale;
    if (
      part.endSetbackMm !== values.setback ||
      part.widthMm !== values.width ||
      !(part.cutLengthMm > 0) ||
      !Number.isFinite(part.cutLengthMm) ||
      Math.abs(part.cutLengthMm - (length - 2 * values.setback)) > 1e-7 * Math.max(1, length)
    )
      throw Error('Native hinge strip cut length or physical allowance changed.');
  }
  return result;
}

export class HingeStripSession {
  constructor(context) {
    this.context = context;
    this.busy = false;
  }
  cancel() {
    this.entry?.cancel();
  }
  async execute(action, form) {
    const c = this.context;
    if (this.busy || c.isExporting()) throw Error('Finish or cancel the current hinge strip operation first.');
    if (!['preview', 'csv', 'svg', 'pdf'].includes(action)) throw Error('Unsupported hinge strip action.');
    const net = structuredClone(c.getNetParameters()),
      paper = structuredClone(c.getPaperParameters?.() ?? {});
    const signature = () =>
        stable({ form, live: c.formSignature?.(), net: c.getNetParameters(), paper: c.getPaperParameters?.() ?? {} }),
      captured = signature();
    const entry = new NumericEntry(c);
    this.entry = entry;
    this.busy = true;
    try {
      return await entry.run(
        { setback: { text: form.setback, min: 0, max: 100 }, width: { text: form.width, min: 1, max: 100 } },
        async (values, verifyNumeric, { source, signal }) => {
          const verifyPublication = () => {
            verifyNumeric();
            if (signature() !== captured)
              throw Error('Hinge strip fields, net placement or paper changed. Repeat the operation.');
          };
          const options = {
            signal,
            sourceSnapshot: source,
            verifyPublication,
            defaultName: 'End-relieved hinge strips',
          };
          verifyPublication();
          const result = await c.read(
            'net-hinge-strip-allowance',
            { netParameters: net, paper, options: { end_setback_mm: values.setback, strip_width_mm: values.width } },
            source,
            options
          );
          verifyPublication();
          checkedHingeStrips(result, source, net, paper, values);
          if (action === 'preview') {
            await c.previewPages(result, options);
            verifyPublication();
            return result;
          }
          const exported =
            action === 'pdf'
              ? await c.exportPdf(
                  result.pages.map((p) => p.svg),
                  options
                )
              : await c.export(action, result[action], options);
          verifyPublication();
          if (exported === null || exported === false) throw aborted();
          return result;
        }
      );
    } finally {
      if (this.entry === entry) this.entry = null;
      this.busy = false;
    }
  }
}

export class HingeStripControls {
  constructor(context) {
    this.context = context;
    this.session = new HingeStripSession({
      ...context,
      formSignature: () => this.form(),
      previewPages: (r, o) => this.preview(r, o),
    });
    const panel = document.createElement('details');
    panel.id = 'hinge-strip-settings';
    this.panel = panel;
    panel.innerHTML =
      '<summary>Dihedral hinge strips — corner clearance</summary><p class="muted">One rectangular strip per source edge. Match E labels, score the center, and glue the labeled halves inside adjacent faces. Cut length = edge length minus twice the end setback.</p><label>End setback (mm) <input id="hinge-strip-setback" value="2" inputmode="decimal"></label><label>Strip width (mm) <input id="hinge-strip-width" value="10" inputmode="decimal"></label><p class="muted" id="hinge-strip-scale"></p><button id="hinge-strip-preview" class="wide">Preview end-relieved strips</button><div class="button-row"><button id="hinge-strip-csv">Strip cut list CSV</button><button id="hinge-strip-pdf">Strip PDF sheets</button><button id="hinge-strip-svg">Strip SVG sheets</button></div><div id="hinge-strip-pages" hidden><div class="button-row"><button id="hinge-strip-prev">Previous sheet</button><button id="hinge-strip-next">Next sheet</button></div><p id="hinge-strip-page-status" aria-live="polite"></p><img id="hinge-strip-image" alt="End-relieved hinge strips preview" style="display:block;width:100%;height:auto;background:white"></div><p class="muted">Closed convex 3D shells only. Approximate geometry; end setback is corner clearance, with no thickness, kerf or strength compensation. Print at 100% and measure on paper before assembly.</p><button id="hinge-strip-cancel">Cancel strip output</button><output id="hinge-strip-status" aria-live="polite"></output>';
    context.mount.after(panel);
    for (const action of ['preview', 'csv', 'pdf', 'svg'])
      this.node(action).onclick = context.guard(() => this.apply(action));
    for (const key of ['setback', 'width']) {
      const change = () => {
        this.clearPreview();
        this.sync();
      };
      this.node(key).oninput = change;
      this.node(key).onchange = change;
    }
    this.node('prev').onclick = context.guard(() => this.showPage(this.page - 1));
    this.node('next').onclick = context.guard(() => this.showPage(this.page + 1));
    this.node('cancel').onclick = () => this.cancel();
    this.sync();
  }
  node(key) {
    return this.panel.querySelector('#hinge-strip-' + key);
  }
  form() {
    return { setback: this.node('setback').value, width: this.node('width').value };
  }
  signature() {
    return stable({
      form: this.form(),
      net: this.context.getNetParameters(),
      paper: this.context.getPaperParameters?.() ?? {},
    });
  }
  clearPreview() {
    if (this.pages)
      this.node('status').textContent =
        'Preview cleared. Generate the strips again for the current source, net and paper.';
    this.pages = null;
    this.owner = null;
    this.node('pages').hidden = true;
    this.node('image').removeAttribute('src');
  }
  verifyPreview() {
    verifyNativeSource(this.context, this.owner);
    if (this.signature() !== this.previewSignature)
      throw Error('Hinge strip preview fields, net or paper changed. Preview again.');
  }
  preview(result, options) {
    options.verifyPublication();
    this.owner = captureNativeSource(this.context);
    this.previewSignature = this.signature();
    this.pages = result.pages;
    this.showPage(0);
    options.verifyPublication();
  }
  showPage(index) {
    this.verifyPreview();
    this.page = Math.max(0, Math.min(this.pages.length - 1, index));
    const svg = this.pages[this.page].svg;
    this.node('image').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    this.node('pages').hidden = false;
    this.node('page-status').textContent =
      `Sheet ${this.page + 1} of ${this.pages.length}; physical mm, print at 100%. Screen preview fitted to panel.`;
    this.node('prev').disabled = this.page === 0;
    this.node('next').disabled = this.page === this.pages.length - 1;
  }
  async apply(action) {
    const job = this.session.execute(action, this.form());
    this.sync();
    try {
      const r = await job;
      this.node('status').textContent =
        `${r.parts.length} strips ${action === 'preview' ? 'previewed' : 'exported'}; total cut perimeter ${r.totalCutLengthMm.toFixed(3)} mm, score ${r.totalScoreLengthMm.toFixed(3)} mm. Attachment residual ${r.maxAttachmentResidualMm.toExponential(2)} mm.`;
      return r;
    } catch (error) {
      this.clearPreview();
      this.node('status').textContent = error.message;
      throw error;
    } finally {
      this.sync();
    }
  }
  cancel() {
    this.session.cancel();
    this.clearPreview();
  }
  sync() {
    const model = this.context.getState()?.model,
      eligible =
        model?.dimension === 3 && (model.embeddingDimension ?? 3) === 3 && model.interpretation === 'convex-polytope';
    if (this.pages) {
      try {
        this.verifyPreview();
      } catch {
        this.clearPreview();
      }
    }
    const disabled = !eligible || this.session.busy || this.context.isExporting();
    for (const node of this.panel.querySelectorAll('button,input')) node.disabled = disabled;
    this.node('cancel').disabled = !this.session.busy;
    this.node('prev').disabled = disabled || !this.pages || this.page === 0;
    this.node('next').disabled = disabled || !this.pages || this.page === this.pages.length - 1;
    this.node('scale').textContent = eligible
      ? `Source edge E0 = ${this.context.getNetParameters().edge_length_mm} mm. Setback and width stay in mm when E0 changes.`
      : 'Choose a closed convex 3D shell; coincident-edge assemblies are unsupported.';
  }
}
