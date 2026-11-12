// SPDX-License-Identifier: GPL-3.0-only
import { NumericEntry } from './numeric-entry.mjs';
import { readElementPNG } from './element-content-controls.mjs';
import { effectsOptions } from './effects-config.mjs';
import { imageEnvironmentSupported } from './material-environment.mjs';
export class MaterialEnvironmentControls {
  constructor(parent) {
    this.parent = parent;
    this.context = parent.context;
    const row = document.createElement('div');
    row.id = 'effects-image-controls';
    row.innerHTML =
      '<label>Equirectangular environment · 2:1 PNG <input id="effects-image-file" type="file" accept="image/png"></label><div class="button-row"><button id="effects-image-import">Import PNG environment</button><button id="effects-image-remove">Remove PNG</button></div><output id="effects-image-status" aria-live="polite"></output><small>3D source surfaces only. A panorama up to 1024 × 512 and 4 MiB is embedded in the project. RGB is sampled; alpha is ignored. This changes surface reflections/refraction, not the background or paper-net colors.</small>';
    row.querySelector('small').style.fontSize = 'var(--font-secondary)';
    parent.node('reflection').closest('label').after(row);
    this.panel = row;
    this.node('import').onclick = this.context.guard(() => this.import());
    this.node('remove').onclick = this.context.guard(() => this.remove());
  }
  node(key) {
    return this.panel.querySelector('#effects-image-' + key);
  }
  async import() {
    const p = this.parent;
    p.requireEditable();
    if (!imageEnvironmentSupported({ model: this.context.getState().model }))
      throw Error('Imported environment sampling requires a 3D model embedded in 3D.');
    const file = this.node('file').files?.[0],
      before = JSON.stringify(this.context.getState().view.materialEffects ?? null);
    const entry = new NumericEntry(this.context);
    p.entry = entry;
    p.busy = true;
    p.sync();
    try {
      return await entry.run(
        { confirm: { text: '0', min: 0, max: 0 } },
        async (_values, numericVerify, { source, signal }) => {
          const verify = () => {
            numericVerify();
            if (
              this.node('file').files?.[0] !== file ||
              JSON.stringify(this.context.getState().view.materialEffects ?? null) !== before
            )
              throw Error('Environment input or settings changed. Repeat the import.');
          };
          const pngBase64 = await readElementPNG(file, verify, signal);
          verify();
          const asset = await this.context.run(
            'material-environment',
            { pngBase64 },
            source,
            'Import environment PNG',
            { signal }
          );
          verify();
          const settings = effectsOptions({
            ...effectsOptions(this.context.getState().view.materialEffects),
            reflection: 'image',
            environmentAsset: asset,
          });
          this.context.getState().view.materialEffects = settings;
          this.context.display();
          this.context.markDirty();
          p.node('status').textContent =
            'Imported environment. Captures wait for image decoding; sampling does not trace rays through the object.';
        }
      );
    } finally {
      if (p.entry === entry) p.entry = null;
      p.busy = false;
      p.sync();
    }
  }
  remove() {
    this.parent.requireEditable();
    const settings = effectsOptions(this.context.getState().view.materialEffects);
    this.context.getState().view.materialEffects = effectsOptions({
      ...settings,
      environmentAsset: null,
      reflection: settings.reflection === 'image' ? 'none' : settings.reflection,
    });
    this.context.display();
    this.context.markDirty();
    this.parent.sync();
  }
  sync() {
    const settings = effectsOptions(this.context.getState().view.materialEffects),
      disabled = this.parent.busy || this.context.isExporting();
    this.node('file').disabled = this.node('import').disabled =
      disabled || !imageEnvironmentSupported({ model: this.context.getState().model });
    this.node('remove').disabled = disabled || !settings.environmentAsset;
    this.node('status').textContent = settings.environmentAsset
      ? `Embedded PNG: ${settings.environmentAsset.width} × ${settings.environmentAsset.height}.`
      : 'No imported environment.';
  }
}
