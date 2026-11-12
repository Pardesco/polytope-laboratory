export const DISCOVERY_CANDIDATE_LABEL = 'Discovery candidates (unverified)';
export const DISCOVERY_CANDIDATE_NOTE = 'Computer-found shapes, not checked against published lists.';

export function isDiscoveryCandidate(entry) {
  return (
    entry?.family === '4D discovery candidates' || entry?.sourceClassification === 'Unclassified discovery candidate'
  );
}
/** Presentation policy only: keep the full catalog available to direct opens. */
export function catalogBrowseEntries(entries, { includeDiscoveryCandidates = false } = {}) {
  return entries.filter((entry) => includeDiscoveryCandidates || !isDiscoveryCandidate(entry));
}

export class CatalogDefaults {
  constructor({ document, after, change, model = () => null }) {
    this.model = model;
    const root = document.createElement('section');
    root.id = 'library-discovery-filter';
    const label = document.createElement('label'),
      input = document.createElement('input');
    input.id = 'library-discovery-candidates';
    input.type = 'checkbox';
    input.checked = false;
    input.onchange = change;
    input.setAttribute('aria-describedby', 'library-discovery-note');
    const text = document.createElement('span');
    text.textContent = DISCOVERY_CANDIDATE_LABEL;
    label.append(input, text);
    const note = document.createElement('small');
    note.id = 'library-discovery-note';
    note.className = 'muted';
    note.textContent = DISCOVERY_CANDIDATE_NOTE;
    root.append(label, note);
    after.after(root);
    this.input = input;
    const badge = document.createElement('span');
    badge.id = 'catalog-classification-badge';
    badge.className = 'badge';
    badge.textContent = 'Unverified';
    badge.title = DISCOVERY_CANDIDATE_NOTE;
    badge.hidden = true;
    badge.setAttribute('role', 'status');
    document.getElementById('model-name').after(badge);
    this.badge = badge;
  }
  get includeDiscoveryCandidates() {
    return this.input.checked;
  }
  reset() {
    this.input.checked = false;
  }
  sync() {
    const hidden = !isDiscoveryCandidate(this.model()?.metadata);
    if (this.badge.hidden !== hidden) this.badge.hidden = hidden;
  }
}
