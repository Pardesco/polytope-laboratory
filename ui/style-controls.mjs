// SPDX-License-Identifier: GPL-3.0-only
import { STYLE_LABELS, stylePreset } from './style-presets.mjs';
import { appearanceOptions } from './appearance-config.mjs';
export function mountStyleControls(context) {
  const panel = document.createElement('section');
  panel.id = 'style-settings';
  panel.innerHTML =
    '<label>Style <select id="presentation-style">' +
    Object.entries(STYLE_LABELS)
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join('') +
    '</select></label><button id="style-reset">Reset to preset</button><p>Prism pairs parallel faces or opposite cells for extra color when there are few types. Large models use lighter edges. Style edits are saved with the document.</p><output id="prism-density-note" data-expert></output>';
  document.querySelector('#surface-settings .settings-body').prepend(panel);
  const picker = panel.querySelector('select'),
    reset = panel.querySelector('button');
  const apply = context.guard(() => {
    if (context.isExporting()) throw Error('Finish export before changing style.');
    const state = context.getState();
    state.view = stylePreset(picker.value, state.view, state.model?.dimension);
    context.display();
    context.markDirty();
    context.sync?.();
    const view = state.view;
    for (const [id, field] of [
      ['faces-visible', 'faces'],
      ['vertices-visible', 'vertices'],
    ])
      document.getElementById(id).checked = view[field];
    const colors = document.getElementById('surface-colors');
    if (colors) colors.value = view.surfaceColors || 'source';
    document.getElementById('surface-opacity').value = view.surfaceOpacity;
    document.getElementById('render-style').value =
      view.faces === false ? 'wireframe' : view.surfaceOpacity < 1 ? 'translucent' : 'solid';
  });
  picker.onchange = apply;
  reset.onclick = apply;
  return {
    sync() {
      const state = context.getState();
      if (state) picker.value = appearanceOptions(state.view.appearance).style;
      picker.disabled = reset.disabled = !state || context.isExporting();
    },
  };
}
