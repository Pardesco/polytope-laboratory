import { catalogPropertyMatches } from './catalog-query.mjs';

export class LibraryPropertyControls {
  constructor({ document, after, change }) {
    this.document = document;
    this.selects = new Map();
    const root = document.createElement('details');
    root.id = 'library-properties';
    const summary = document.createElement('summary');
    summary.textContent = 'Geometry properties';
    root.append(summary);
    const definitions = [
      ['symmetry', 'Symmetry group', []],
      [
        'shape',
        'Convex / star',
        [
          ['convex', 'Convex'],
          ['star', 'Star / nonconvex'],
        ],
      ],
      [
        'vt',
        'Vertex transitive',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'uniform',
        'Uniform',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'regular',
        'Regular',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'scaliform',
        'Scaliform',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'fissary',
        'Fissary (source classification)',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'nearmiss',
        'Near-miss Johnson solid',
        [
          ['true', 'Yes'],
          ['false', 'No'],
          ['unknown', 'Unknown'],
        ],
      ],
      [
        'chiral',
        'Chirality',
        [
          ['true', 'Chiral'],
          ['false', 'Achiral'],
          ['unknown', 'Unknown'],
        ],
      ],
    ];
    for (const [key, label, options] of definitions) {
      const row = document.createElement('label'),
        select = document.createElement('select');
      select.id = 'library-' + key;
      row.textContent = label + ' ';
      select.setAttribute('aria-label', label);
      row.append(select);
      root.append(row);
      this.options(select, [['all', 'All'], ...options]);
      select.onchange = change;
      this.selects.set(key, select);
    }
    const note = document.createElement('small');
    note.className = 'muted';
    note.textContent = 'Filters use documented properties. Unknown source labels are not inferred.';
    root.append(note);
    after.after(root);
    this.root = root;
    const search = document.getElementById('search');
    search.title =
      'Names, Bowers aliases, U/C/W/O numbers, Wythoff and ring symbols. Combine terms (AND); quote phrases. Counts: faces:12 v<100 e>=30 cells:8 dim:4 components:25. Properties: symmetry:Ih symmetry:[3,3,5] uniform:true regular:false vt:true convex:true shape:star chiral:unknown nearmiss:true scaliform:true fissary:unknown. Unknown properties do not match yes/no filters.';
  }
  options(select, items) {
    select.replaceChildren(
      ...items.map(([value, label]) => {
        const option = this.document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      })
    );
  }
  update(entries) {
    const select = this.selects.get('symmetry'),
      selected = select.value;
    const groups = [
      ...new Set(entries.flatMap((e) => [e.symmetryGroup, ...(e.symmetryGroups ?? [])]).filter(Boolean)),
    ].sort();
    const signature = groups.join('\n');
    if (signature === this.signature) return;
    this.signature = signature;
    this.options(select, [['all', 'All symmetry groups'], ...groups.map((g) => [g, g])]);
    select.value = groups.includes(selected) ? selected : 'all';
  }
  matches(entry) {
    for (const [key, select] of this.selects)
      if (select.value !== 'all' && !catalogPropertyMatches(entry, key, select.value)) return false;
    return true;
  }
}

/** Explicit keys and type names only; counts alone never establish a relative. */
export function relatedEntries(model, entries) {
  if (!model) return [];
  const byKey = new Map(entries.map((e) => [e.key, e])),
    metadata = model.metadata ?? {},
    entry = byKey.get(metadata.key),
    labels = { ...metadata, ...entry };
  const links = [],
    seen = new Set();
  const add = (relation, key, count) => {
    const target = byKey.get(key);
    if (!target || target.catalogStatus === 'unsupported') return;
    const id = relation + ':' + key;
    if (seen.has(id)) return;
    seen.add(id);
    links.push({ relation, entry: target, ...(count === undefined ? {} : { count }) });
  };
  const typeKey = (value) => (typeof value === 'string' ? value.toLowerCase().replaceAll(' ', '-') : undefined);
  add('Dual', labels.dualKey ?? labels.dualOf);
  add('Rectified', labels.rectifiedKey);
  add('Truncated', labels.truncatedKey);
  for (const cell of Array.isArray(labels.cellTypes) ? labels.cellTypes : [])
    if (cell && typeof cell.key === 'string')
      add('Cell type', cell.key, Number.isSafeInteger(cell.count) && cell.count > 0 ? cell.count : undefined);
  if (!labels.cellTypes) add('Cell type', typeKey(labels.cellType));
  add('Vertex figure type', labels.vertexFigureKey ?? typeKey(labels.vertexFigureType));
  add('Vertex frame type', labels.frameKey);
  return links;
}

export class RelatedLibraryControls {
  constructor({ document, after, getModel, getEntries, open, guard, isExporting }) {
    Object.assign(this, { document, getModel, getEntries, open, guard, isExporting });
    this.root = document.createElement('section');
    this.root.id = 'library-related';
    this.root.className = 'inspector-card';
    after.after(this.root);
  }
  sync() {
    const root = this.root,
      doc = this.document;
    root.replaceChildren();
    const heading = doc.createElement('div');
    heading.className = 'panel-title';
    heading.textContent = 'Related';
    root.append(heading);
    const links = relatedEntries(this.getModel(), this.getEntries());
    for (const { relation, entry, count } of links) {
      const button = doc.createElement('button');
      button.className = 'wide';
      button.dataset.relatedKey = entry.key;
      button.textContent = relation + ': ' + entry.name + (count === undefined ? '' : ' × ' + count);
      button.disabled = Boolean(this.isExporting?.());
      button.onclick = this.guard(() => this.open(entry));
      root.append(button);
    }
    const note = doc.createElement('small');
    note.className = 'muted';
    note.textContent = links.length
      ? 'Opens a library document. Cell and vertex figure links identify catalog types; their scale and proportions may differ.'
      : 'No catalogued relatives recorded for this model.';
    root.append(note);
  }
}
