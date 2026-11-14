export const LIBRARY_EXPERT_PANELS = [
  'library-symmetry-evidence',
  'library-corpus',
  'library-classification',
  'library-u-dual-obstructions',
];

export function organizeLibraryEvidence(document) {
  let after = document.getElementById('catalog');
  if (!after) return;
  for (const id of LIBRARY_EXPERT_PANELS) {
    const panel = document.getElementById(id);
    if (!panel) continue;
    panel.setAttribute('data-expert', '');
    panel.open = false;
    after.after(panel);
    after = panel;
  }
}

export function libraryFamilyLabel(entry) {
  const family = (entry.family || 'Linked OFF').replace(/\s*\(Miratope source\)/gi, '').trim();
  return family ? family[0].toUpperCase() + family.slice(1) : 'Linked OFF';
}

export function libraryProvenance(entry) {
  return [
    ...new Set(
      [
        /\(Miratope source\)/i.test(entry.family ?? '') ? 'Miratope source' : null,
        entry.source,
        entry.provider,
        entry.sourceClassification,
      ].filter(Boolean)
    ),
  ].join(' · ');
}

export function mountLibrarySearch(document) {
  const search = document.getElementById('search'),
    wrap = document.createElement('div');
  wrap.className = 'library-search';
  search.before(wrap);
  wrap.append(search);
  const clear = document.createElement('button');
  clear.id = 'library-search-clear';
  clear.type = 'button';
  clear.textContent = '×';
  clear.title = 'Clear search';
  clear.setAttribute('aria-label', 'Clear library search');
  wrap.append(clear);
  const count = document.getElementById('library-count');
  count.className = 'sr-only';
  count.setAttribute('aria-hidden', 'true');
  const result = document.createElement('output');
  result.id = 'library-result-count';
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');
  wrap.after(result);
  const sync = () => {
    clear.hidden = !search.value;
  };
  search.addEventListener('input', sync);
  clear.onclick = () => {
    search.value = '';
    search.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    search.focus();
  };
  sync();
  return (value) => {
    count.textContent = String(value);
    result.textContent = value.toLocaleString() + (value === 1 ? ' shape' : ' shapes');
    sync();
  };
}

export function symmetryHero(document, button) {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 88 32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const add = (tag, attrs) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.append(node);
  };
  add('path', { d: 'M14 16H74', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 });
  for (const cx of [14, 44, 74]) add('circle', { cx, cy: 16, r: 3, fill: 'currentColor' });
  add('circle', { cx: 14, cy: 16, r: 9, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 });
  const title = document.createElement('strong');
  title.textContent = 'Build from symmetry';
  const subtitle = document.createElement('small');
  subtitle.textContent = 'Uniform polyhedra and polychora from symmetry diagrams';
  button.replaceChildren(svg, title, subtitle);
}
