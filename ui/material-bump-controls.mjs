// SPDX-License-Identifier: GPL-3.0-only
import { NumericEntry } from './numeric-entry.mjs';
import { readElementPNG } from './element-content-controls.mjs';
import { effectsOptions } from './effects-config.mjs';
import { imageBumpSupported } from './material-bump.mjs';
export class MaterialBumpControls {
  constructor(parent) {
    this.parent = parent;
    this.context = parent.context;
    const row = document.createElement('div');
    row.id = 'effects-bump-image-controls';
    row.dataset.guideTopic = 'appearance';
    row.innerHTML =
      '<label>Height map · grayscale PNG <input id="effects-bump-image-file" type="file" accept="image/png"></label><div class="button-row"><button id="effects-bump-image-import">Import bump PNG</button><button id="effects-bump-image-remove">Remove bump PNG</button></div><output id="effects-bump-image-status" aria-live="polite"></output><small>3D surfaces: repeats in displayed object XY, with image top toward +Y. Linear grayscale height; alpha ignored. 2–512 pixels per side, up to 4 MiB, embedded in the project. Shading only; geometry and paper nets are unchanged. Adjust height and repeats in More effect options.</small>';
    row.querySelector('small').style.fontSize = 'var(--font-secondary)';
    parent.node('bump').closest('label').after(row);
    this.panel = row;
    this.node('import').onclick = this.context.guard(() => this.import());
    this.node('remove').onclick = this.context.guard(() => this.remove());
  }
  node(key) {
    return this.panel.querySelector('#effects-bump-image-' + key);
  }
  async import() {
    const p = this.parent;
    p.requireEditable();
    if (!imageBumpSupported({ model: this.context.getState().model }))
      throw Error('Imported bump sampling requires a 3D model embedded in 3D.');
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
              throw Error('Bump input or settings changed. Repeat the import.');
          };
          const pngBase64 = await readElementPNG(file, verify, signal);
          verify();
          const asset = await this.context.run('material-bump', { pngBase64 }, source, 'Import bump PNG', { signal });
          verify();
          const settings = effectsOptions({
            ...effectsOptions(this.context.getState().view.materialEffects),
            bump: 'image',
            bumpAsset: asset,
          });
          this.context.getState().view.materialEffects = settings;
          this.context.display();
          this.context.markDirty();
          p.node('status').textContent = 'Imported grayscale bump. Captures wait for decoding. Geometry is unchanged.';
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
      bumpAsset: null,
      bump: settings.bump === 'image' ? 'none' : settings.bump,
    });
    this.context.display();
    this.context.markDirty();
    this.parent.sync();
  }
  sync() {
    const settings = effectsOptions(this.context.getState().view.materialEffects),
      disabled = this.parent.busy || this.context.isExporting();
    this.node('file').disabled = this.node('import').disabled =
      disabled || !imageBumpSupported({ model: this.context.getState().model });
    this.node('remove').disabled = disabled || !settings.bumpAsset;
    this.node('status').textContent = settings.bumpAsset
      ? `Embedded bump PNG: ${settings.bumpAsset.width} × ${settings.bumpAsset.height}.`
      : 'No imported bump.';
  }
}
