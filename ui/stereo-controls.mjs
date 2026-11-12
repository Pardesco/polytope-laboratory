import { NumericEntry } from './numeric-entry.mjs';
import { stereoSettings } from './viewer-stereo.mjs';
import { explainAvailability } from './availability-copy.mjs';
export class StereoControls {
  constructor(context, mount) {
    this.context = context;
    const panel = document.createElement('details');
    panel.id = 'stereo-settings';
    panel.className = 'workspace-disclosure';
    panel.innerHTML =
      '<summary>Stereo settings</summary><div class="settings-body"><label>Eye separation <input id="stereo-eye-separation" type="text" maxlength="512"></label><label>Convergence distance <input id="stereo-convergence" type="text" maxlength="512"></label><p class="muted">Normalized display units, after 4D projection. Default separation 0.064; zero-disparity distance 5. Smaller separation gives gentler depth.</p></div>';
    mount.append(panel);
    this.panel = panel;
    for (const input of this.inputs()) input.onchange = context.guard(() => this.apply());
  }
  inputs() {
    return [...this.panel.querySelectorAll('input')];
  }
  cancel() {
    this.entry?.cancel();
  }
  sync() {
    const s = this.context.getState(),
      settings = stereoSettings(s?.view);
    let i = 0;
    for (const input of this.inputs()) {
      if (!this.entry?.busy && document.activeElement !== input)
        input.value = String(i ? settings.convergence : settings.eyeSeparation);
      input.disabled = !s || this.context.isExporting();
      i++;
    }
    explainAvailability(
      this.panel,
      s ? 'Finish or cancel export before editing stereo settings.' : 'Choose a model before editing stereo settings.'
    );
  }
  async apply() {
    if (this.entry?.busy) throw Error('Finish or cancel the current stereo edit first.');
    const [separation, convergence] = this.inputs(),
      entry = new NumericEntry({
        ...this.context,
        getTarget: () => ({
          separation: separation.value,
          convergence: convergence.value,
          applied: stereoSettings(this.context.getState()?.view),
        }),
      });
    this.entry = entry;
    try {
      return await entry.run(
        {
          separation: { text: separation.value, min: 0, max: 1 },
          convergence: { text: convergence.value, min: 0.01, max: 1000 },
        },
        (values, verify) => {
          verify();
          Object.assign(this.context.getState().view, {
            stereoEyeSeparation: values.separation,
            stereoConvergence: values.convergence,
          });
          this.context.display();
          this.context.markDirty();
        }
      );
    } finally {
      if (this.entry === entry) this.entry = null;
      this.sync();
    }
  }
}
