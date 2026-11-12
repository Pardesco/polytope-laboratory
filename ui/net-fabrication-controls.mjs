import { NumericEntry } from './numeric-entry.mjs';
import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
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
const aborted = () => Object.assign(Error('Fabrication export canceled.'), { name: 'AbortError' });

export const FABRICATION_PRESETS = Object.freeze({
  hinges: Object.freeze({ braces: false, hinges: true, hubs: false, margin: '2', width: '10', radius: '12' }),
  braces: Object.freeze({ braces: true, hinges: false, hubs: false, margin: '2', width: '10', radius: '12' }),
  rosettes: Object.freeze({ braces: false, hinges: false, hubs: true, margin: '2', width: '10', radius: '12' }),
});
export function checkedFabricationPages(result, net, paper) {
  if (
    result?.units !== 'mm' ||
    result.contentScale !== 1 ||
    result.referenceEdgeLengthMm !== net.edge_length_mm ||
    !Number.isFinite(result.maxEdgeFlatteningResidualMm) ||
    result.maxEdgeFlatteningResidualMm < 0
  )
    throw Error(
      'Native reinforcement preview requires physical mm at the current edge length, scale 1 and a numerical residual.'
    );
  if (!Array.isArray(result.pages) || !result.pages.length || result.pages.length > 250)
    throw Error('Native fabrication pages are outside their bound.');
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const page of result.pages) {
    if (typeof page.svg !== 'string') throw Error('Native reinforcement page is missing its SVG.');
    bytes += encoder.encode(page.svg).length;
    const root = page.svg.match(/^<svg\s[^>]*>/)?.[0] ?? '',
      dimension = (key) => Number(root.match(new RegExp(`\\b${key}="([\\d.e+-]+)mm"`))?.[1]);
    if (
      bytes > 32 * 1024 * 1024 ||
      Math.abs(dimension('width') - (paper.width_mm ?? 210)) > 1e-7 ||
      Math.abs(dimension('height') - (paper.height_mm ?? 297)) > 1e-7 ||
      !Number.isFinite(dimension('width')) ||
      !Number.isFinite(dimension('height'))
    )
      throw Error('Native reinforcement pages must match the selected paper in mm without scaling.');
  }
  return result.pages;
}

export class FabricationSession {
  constructor(context) {
    this.context = context;
    this.busy = false;
  }
  cancel() {
    this.entry?.cancel();
  }
  async execute(action, form) {
    const c = this.context;
    if (this.busy || c.isExporting()) throw Error('Finish or cancel the current export first.');
    if (!['parts-preview', 'parts-svg', 'parts-pdf', 'measure-csv', 'measure-pdf', 'measure-dxf'].includes(action))
      throw Error('Unsupported fabrication export.');
    const parts = action.startsWith('parts-'),
      format = action.split('-')[1],
      net = structuredClone(c.getNetParameters()),
      paper = structuredClone(c.getPaperParameters?.() ?? {});
    const signature = () =>
        stable({ form, live: c.formSignature?.(), net: c.getNetParameters(), paper: c.getPaperParameters?.() ?? {} }),
      captured = signature();
    const entry = new NumericEntry(c);
    this.entry = entry;
    this.busy = true;
    try {
      return await entry.run(
        parts
          ? {
              margin: { text: form.braces ? form.margin : '2', min: 0.01, max: 100 },
              width: { text: form.hinges ? form.width : '10', min: 1, max: 100 },
              radius: { text: form.hubs ? form.radius : '12', min: 3, max: 100 },
            }
          : { confirm: { text: '0', min: 0, max: 0 } },
        async (values, verifyNumeric, { source, signal }) => {
          const verifyPublication = () => {
            verifyNumeric();
            if (signature() !== captured)
              throw Error('Fabrication fields, paper or net layout changed. Repeat the export.');
          };
          const options = {
            signal,
            sourceSnapshot: source,
            verifyPublication,
            defaultName: parts ? 'Reinforcement parts' : 'Builder measurements',
          };
          const params = {
            netParameters: net,
            paper,
            ...(parts
              ? {
                  options: {
                    braces: form.braces,
                    hinges: form.hinges,
                    hubs: form.hubs,
                    margin_mm: values.margin,
                    strip_width_mm: values.width,
                    hub_radius_mm: values.radius,
                  },
                  include_net: form.includeNet,
                }
              : {}),
          };
          verifyPublication();
          const result = await c.read(
            parts ? 'net-reinforcement-parts' : 'net-measurement-export',
            params,
            source,
            options
          );
          verifyPublication();
          if (action === 'parts-preview') {
            checkedFabricationPages(result, net, paper);
            await c.previewPages(result, options);
            verifyPublication();
            return result;
          }
          let exported;
          if (format === 'pdf') {
            if (!Array.isArray(result.pages) || !result.pages.length || result.pages.length > 250)
              throw Error('Native fabrication pages are outside their bound.');
            exported = await c.exportPdf(
              result.pages.map((p) => p.svg),
              options
            );
          } else exported = await c.export(format, result[format], options);
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

export class FabricationControls {
  constructor(context) {
    this.context = context;
    this.session = new FabricationSession({
      ...context,
      formSignature: () => this.form(),
      previewPages: (result, options) => this.preview(result, options),
    });
    const panel = document.createElement('section');
    panel.id = 'net-fabrication-settings';
    this.panel = panel;
    panel.innerHTML =
      '<h3>Measurements and reinforcement</h3><p id="fabrication-scale" class="muted"></p><div class="button-row"><button id="fabrication-measure-csv">Cut list CSV</button><button id="fabrication-measure-pdf">Measurements PDF</button></div><details id="fabrication-measure-options"><summary>Other measurement formats</summary><button id="fabrication-measure-dxf">Flat faces DXF</button></details><details id="fabrication-presets"><summary>Reinforcement — paper templates</summary><label>Reinforcement preset <select id="fabrication-preset"><option value="hinges">Dihedral hinge strips</option><option value="braces">Inset face braces</option><option value="rosettes">Vertex direction rosettes</option><option value="custom">Custom families and dimensions</option></select></label><p id="fabrication-preset-note" class="muted"></p><p class="muted">To change paper size or margins, choose Page and paper options, then Pack and preview.</p><details id="fabrication-custom"><summary>Custom families and dimensions (mm)</summary><label><input id="fabrication-braces" type="checkbox"> Inner face braces</label><label><input id="fabrication-hinges" type="checkbox" checked> Dihedral hinge strips</label><label><input id="fabrication-hubs" type="checkbox"> Vertex direction rosettes</label><label>Brace margin (mm) <input id="fabrication-margin" value="2" inputmode="decimal"></label><label>Strip width (mm) <input id="fabrication-width" value="10" inputmode="decimal"></label><label>Rosette radius (mm) <input id="fabrication-radius" value="12" inputmode="decimal"></label></details><label><input id="fabrication-include-net" type="checkbox" checked> Prepend packed net sheets</label><button id="fabrication-parts-preview" class="wide">Preview reinforcement pages</button><div id="fabrication-preview" hidden><div class="button-row"><button id="fabrication-page-prev">Previous sheet</button><button id="fabrication-page-next">Next sheet</button></div><p id="fabrication-page-status" aria-live="polite"></p><img id="fabrication-page-image" alt="Reinforcement sheet preview" style="display:block;width:100%;height:auto;background:white"></div><div class="button-row"><button id="fabrication-parts-svg">Parts SVG sheets</button><button id="fabrication-parts-pdf">Parts PDF sheets</button></div></details><p class="muted">Approximate measurements in mm and degrees. Print at 100% and measure a known edge before assembly. No thickness, kerf, strength or mechanical fit allowance; screen previews do not calibrate a printer.</p><button id="fabrication-cancel">Cancel fabrication export</button><output id="fabrication-status" aria-live="polite"></output>';
    context.mount.after(panel);
    this.node('preset').value = 'hinges';
    for (const action of ['parts-preview', 'parts-svg', 'parts-pdf', 'measure-csv', 'measure-pdf', 'measure-dxf'])
      this.node(action).onclick = context.guard(() => this.apply(action));
    this.node('preset').onchange = () => this.setPreset(this.node('preset').value);
    for (const key of ['braces', 'hinges', 'hubs', 'margin', 'width', 'radius', 'include-net']) {
      const change = () => {
        if (key !== 'include-net') this.node('preset').value = 'custom';
        this.clearPreview();
        this.sync();
      };
      this.node(key).oninput = change;
      this.node(key).onchange = change;
    }
    this.node('page-prev').onclick = context.guard(() => this.showPage(this.page - 1));
    this.node('page-next').onclick = context.guard(() => this.showPage(this.page + 1));
    this.node('cancel').onclick = () => this.cancel();
    this.sync();
  }
  node(id) {
    return this.panel.querySelector('#fabrication-' + id);
  }
  form() {
    return {
      braces: this.node('braces').checked,
      hinges: this.node('hinges').checked,
      hubs: this.node('hubs').checked,
      margin: this.node('margin').value,
      width: this.node('width').value,
      radius: this.node('radius').value,
      includeNet: this.node('include-net').checked,
    };
  }
  signature() {
    return stable({
      form: this.form(),
      net: this.context.getNetParameters(),
      paper: this.context.getPaperParameters?.() ?? {},
    });
  }
  setPreset(key) {
    const preset = FABRICATION_PRESETS[key];
    if (!preset && key !== 'custom') throw Error('Choose a listed reinforcement preset.');
    if (preset)
      for (const [field, value] of Object.entries(preset)) {
        const node = this.node(field);
        if (typeof value === 'boolean') node.checked = value;
        else node.value = value;
      }
    this.node('preset').value = key;
    this.node('custom').open = key === 'custom';
    this.clearPreview();
    this.sync();
  }
  clearPreview() {
    if (this.pages)
      this.node('status').textContent = 'Preview cleared. Generate a new preview before reviewing these sheets.';
    this.pages = null;
    this.previewOwner = null;
    this.node('preview').hidden = true;
    this.node('page-image').removeAttribute?.('src');
  }
  verifyPreview() {
    verifyNativeSource(this.context, this.previewOwner);
    if (this.signature() !== this.previewSignature)
      throw Error('Reinforcement source, fields, paper or net layout changed. Preview again.');
  }
  preview(result, options) {
    options.verifyPublication();
    this.previewOwner = captureNativeSource(this.context);
    this.previewSignature = this.signature();
    this.pages = result.pages;
    this.page = 0;
    this.showPage(0);
    options.verifyPublication();
  }
  showPage(index) {
    this.verifyPreview();
    this.page = Math.max(0, Math.min(this.pages.length - 1, index));
    const page = this.pages[this.page],
      paper = this.context.getPaperParameters?.() ?? {};
    this.node('page-image').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(page.svg);
    this.node('page-image').alt =
      `${page.kind === 'net' ? 'Net' : 'Reinforcement'} sheet ${this.page + 1} of ${this.pages.length}`;
    this.node('page-status').textContent =
      `Sheet ${this.page + 1} of ${this.pages.length} · ${paper.width_mm ?? 210} × ${paper.height_mm ?? 297} mm · print at 100%. Screen preview fitted to panel.`;
    this.node('preview').hidden = false;
    this.node('page-prev').disabled = this.page === 0;
    this.node('page-next').disabled = this.page === this.pages.length - 1;
  }
  async apply(action) {
    const job = this.session.execute(action, this.form());
    this.sync();
    try {
      const result = await job;
      this.node('status').textContent = action.startsWith('parts-')
        ? `${result.braces.length} braces, ${result.hinges.length} hinge strips, ${result.hubs.length} rosettes ${action === 'parts-preview' ? 'previewed' : 'exported'} (${result.pages.length} sheets). Maximum edge-flattening residual: ${result.maxEdgeFlatteningResidualMm.toExponential(2)} mm.${result.sourceNetOverlap || result.sourceNetTabOverlap ? ' Source net has overlaps; review before assembly.' : ''}`
        : `${result.edges.length} edges and ${result.faces.length} faces exported in mm; approximate angles in degrees.`;
      return result;
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
    this.allowance?.cancel();
  }
  sync() {
    const m = this.context.getState()?.model,
      disabled =
        this.session.busy ||
        this.context.isExporting() ||
        m?.dimension !== 3 ||
        !['convex-polytope', 'generalized-complex'].includes(m?.interpretation);
    if (this.pages) {
      try {
        this.verifyPreview();
      } catch {
        this.clearPreview();
      }
    }
    for (const node of this.panel.querySelectorAll('button,input,select')) node.disabled = disabled;
    this.node('cancel').disabled = !this.session.busy;
    const length = m?.dimension === 3 ? this.context.getNetParameters().edge_length_mm : null;
    this.node('scale').textContent =
      m?.dimension === 3
        ? `Physical scale: source edge E0 = ${length} mm. Other lengths scale proportionally; coordinate units and camera zoom do not change this scale.`
        : 'Choose a 3D face model for physical measurements and reinforcement.';
    this.node('preset-note').textContent = {
      hinges: '10 mm wide strips. Score the center, set the printed interior angle, then glue inside adjacent faces.',
      braces:
        '2 mm inset panels. Small, collapsed or split offsets are refused; reduce the margin in Custom dimensions.',
      rosettes:
        '12 mm radius projected direction guides. Use the printed elevations and true 3D angles; these are not developed sockets.',
      custom: 'Choose at least one family. Dimensions accept numeric expressions in mm.',
    }[this.node('preset').value];
    for (const [field, family] of [
      ['margin', 'braces'],
      ['width', 'hinges'],
      ['radius', 'hubs'],
    ])
      this.node(field).disabled = disabled || !this.node(family).checked;
    this.node('page-prev').disabled = disabled || !this.pages || this.page === 0;
    this.node('page-next').disabled = disabled || !this.pages || this.page === this.pages.length - 1;
    this.allowance?.sync();
    this.flow?.sync();
  }
}
