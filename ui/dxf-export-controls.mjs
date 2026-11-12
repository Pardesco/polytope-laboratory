export class DxfExportControls {
  constructor(host, onChange) {
    this.panel = document.createElement('div');
    this.panel.id = 'dxf-export-settings';
    this.panel.hidden = true;
    this.panel.innerHTML =
      '<label>DXF geometry <select id="dxf-export-profile"><option value="wire">Wireframe · source edges</option><option value="boundary">Face boundary · triangles and quadrilaterals</option></select></label><p class="muted">Face boundary retains face RGB, loose lines and isolated points. Components become numbered layers. Alpha and original DXF styles are omitted; larger polygons require Wireframe, OFF or OBJ.</p>';
    host.prepend(this.panel);
    this.profile = this.panel.querySelector('select');
    this.profile.addEventListener('change', onChange);
  }
  selection(enabled = true) {
    return enabled ? { profile: this.profile.value } : null;
  }
  sync({ format, displayed, printable, saving }) {
    this.panel.hidden = format !== 'dxf' || displayed || printable;
    this.profile.disabled = saving;
  }
}

export function prependDxfSummary(host, report) {
  if (!report.dxf) return;
  const r = report.dxf,
    p = document.createElement('p');
  p.id = 'dxf-export-summary';
  p.textContent = `${r.faceCount} faces · ${r.lineCount} loose lines · ${r.pointCount} isolated points · ${r.componentCount} part layers · ${r.coloredFaceCount} colored faces. ${r.coordinateEncoding}. Maximum RGB channel residual ${r.maxRGBChannelResidual.toExponential(2)}.`;
  host.prepend(p);
}
