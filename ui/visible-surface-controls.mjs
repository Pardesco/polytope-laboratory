import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';

export function visibleSurfaceSummary(surface) {
  return `${surface.faces} simple faces (${surface.triangles} triangles) · ${surface.shells} closed shell${surface.shells === 1 ? '' : 's'} · genus ${surface.totalGenus}. Assembled from the outer surface. Winding residual ${surface.maxWindingResidual.toExponential(1)}.`;
}
export class VisibleSurfaceControls {
  constructor(context, root) {
    this.context = context;
    this.busy = false;
    const panel = document.createElement('section');
    panel.id = 'net-visible-surface-settings';
    panel.className = 'inspector-card';
    panel.innerHTML =
      '<button id="net-visible-surface" class="wide accent">Visible surface (paper model)</button><p class="muted">Split intersecting stars and compounds into the outer paper surface. This creates an undoable model; source face colors are retained.</p><details><summary>Interior interpretation</summary><label>Component fill <select id="net-visible-fill"><option value="nonzero">Nonzero winding</option><option value="even-odd">Even / odd winding</option></select></label><p class="muted">Closed, orientable components are filled independently, then unioned. Open, nonplanar and ambiguous assemblies are refused.</p></details><p id="net-visible-summary" class="muted" role="status"></p>';
    root.prepend(panel);
    this.panel = panel;
    this.button = panel.querySelector('#net-visible-surface');
    this.fill = panel.querySelector('#net-visible-fill');
    this.summary = panel.querySelector('#net-visible-summary');
    this.button.onclick = context.guard(() => this.build());
    this.sync();
  }
  async build() {
    if (this.busy) throw Error('Finish the current visible surface first.');
    const owner = captureNativeSource(this.context),
      fill_rule = this.fill.value;
    if (!['nonzero', 'even-odd'].includes(fill_rule)) throw Error('Choose nonzero or even / odd winding.');
    if (owner.state.model.dimension !== 3) throw Error('Choose a closed 3D shell.');
    const controller = (this.controller = new AbortController());
    const verify = () => {
      if (controller.signal.aborted) throw Object.assign(Error('Visible surface canceled.'), { name: 'AbortError' });
      verifyNativeSource(this.context, owner);
      if (this.fill.value !== fill_rule) throw Error('Interior interpretation changed. Repeat the construction.');
    };
    this.busy = true;
    this.sync();
    try {
      return await this.context.commit('visible-surface', { fill_rule }, 'Visible surface (paper model)', {
        signal: controller.signal,
        verifyPublication: verify,
      });
    } finally {
      if (this.controller === controller) this.controller = null;
      this.busy = false;
      this.sync();
    }
  }
  cancel() {
    this.controller?.abort();
  }
  sync() {
    if (!this.button || !this.summary || !this.fill) return;
    const model = this.context.getState()?.model,
      surface = model?.metadata?.visibleSurface,
      blocked = this.busy || Boolean(model && this.context.isExporting?.());
    this.panel.hidden = model?.dimension !== 3 || model.interpretation === 'convex-polytope';
    this.button.disabled = blocked || !model || Boolean(surface);
    this.fill.disabled = blocked || Boolean(surface);
    if (!this.busy && this.source !== model) {
      this.source = model;
      this.fill.value = surface?.fillRule ?? this.context.getState()?.view.fillRule ?? 'nonzero';
    }
    this.summary.textContent = this.busy
      ? 'Computing the exterior and checking closure…'
      : surface
        ? visibleSurfaceSummary(surface)
        : 'Choose an interior interpretation, then construct the paper surface.';
    this.flow?.sync();
  }
}
