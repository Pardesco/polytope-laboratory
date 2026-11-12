// SPDX-License-Identifier: GPL-3.0-only
import { METADATA_FIELDS, metadataFromFields } from './document-metadata.mjs';
export class ProjectMetadataControls {
  constructor(context) {
    this.context = context;
    const panel = document.createElement('details');
    panel.id = 'project-metadata-settings';
    panel.innerHTML =
      '<summary>Model information</summary>' +
      Object.entries(METADATA_FIELDS)
        .map(
          ([key, [label, max]]) =>
            `<label>${label}${['description', 'reference'].includes(key) ? `<textarea id="metadata-${key}" rows="3" maxlength="${max}"></textarea>` : `<input id="metadata-${key}" maxlength="${max}">`}</label>`
        )
        .join('') +
      '<label>Tags (comma separated) <input id="metadata-tags" maxlength="16512"></label><details><summary>Additional fields and source metadata</summary><label>Additional fields (JSON) <textarea id="metadata-custom" rows="4" spellcheck="false"></textarea></label><pre id="metadata-source-record"></pre></details><button id="metadata-save">Save model information</button><output id="metadata-status" aria-live="polite"></output>';
    document.getElementById('evidence-panel').append(panel);
    this.panel = panel;
    this.summary = document.createElement('details');
    this.summary.id = 'model-information-summary';
    this.summary.innerHTML =
      '<summary>Model information</summary><dl></dl><button id="metadata-edit">Edit model information</button>';
    document.getElementById('notes').after(this.summary);
    this.summary.querySelector('button').onclick = () => {
      document.querySelector('[data-panel="evidence"]').click();
      panel.open = true;
      panel.scrollIntoView({ block: 'center' });
      this.node('title').focus();
    };
    this.node('save').onclick = context.guard(() => this.save());
  }
  node(key) {
    return this.panel.querySelector('#metadata-' + key);
  }
  save() {
    const c = this.context;
    if (c.isExporting()) throw Error('Finish export before editing metadata.');
    const state = c.getState();
    if (!state || state !== this.owner)
      throw Error('The document changed. Review its model information before saving.');
    const fields = Object.fromEntries([...Object.keys(METADATA_FIELDS), 'tags'].map((k) => [k, this.node(k).value]));
    const metadata = metadataFromFields(state.view.documentMetadata ?? {}, fields, this.node('custom').value);
    if (JSON.stringify(metadata) === JSON.stringify(state.view.documentMetadata)) return;
    state.view.documentMetadata = metadata;
    c.markDirty();
    c.refresh();
    this.sync();
    this.node('status').textContent = 'Model information saved in this document state.';
  }
  sync() {
    const state = this.context.getState();
    if (!state) return;
    const metadata = state.view.documentMetadata ?? {};
    const saved = JSON.stringify(metadata);
    if (state !== this.owner || saved !== this.saved) {
      for (const key of Object.keys(METADATA_FIELDS))
        this.node(key).value = typeof metadata[key] === 'string' ? metadata[key] : '';
      this.node('tags').value = Array.isArray(metadata.tags) ? metadata.tags.join(', ') : '';
      this.node('custom').value = JSON.stringify(metadata.custom ?? {}, null, 2);
      this.node('status').textContent = '';
      this.owner = state;
      this.saved = saved;
    }
    this.node('source-record').textContent = JSON.stringify(state.model.metadata ?? {}, null, 2);
    const list = this.summary.querySelector('dl');
    list.replaceChildren();
    for (const [key, name] of [
      ...Object.entries(METADATA_FIELDS).map(([key, [name]]) => [key, name]),
      ['tags', 'Tags'],
    ]) {
      const term = document.createElement('dt'),
        value = document.createElement('dd');
      term.textContent = name;
      value.textContent =
        (key === 'tags' && Array.isArray(metadata.tags) ? metadata.tags.join(', ') : metadata[key]) || '—';
      list.append(term, value);
    }
    for (const node of this.panel.querySelectorAll('input,textarea,button')) node.disabled = this.context.isExporting();
  }
}
