import { catalogThumbnailVersion } from './library-thumbnails.mjs';
import { libraryProvenance, mountLibrarySearch, symmetryHero } from './library-visual.mjs';
import { catalogBrowseEntries, DISCOVERY_CANDIDATE_LABEL, DISCOVERY_CANDIDATE_NOTE } from './catalog-defaults.mjs';

const family =
  (...names) =>
  (entry) =>
    names.includes(entry.family);
export const LIBRARY_COLLECTIONS = [
  {
    id: 'platonic',
    label: 'Platonic solids',
    hint: 'The five classic solids',
    representative: 'dodecahedron',
    matches: family('Platonic'),
  },
  {
    id: 'archimedean',
    label: 'Archimedean',
    hint: 'Regular faces, mixed together',
    representative: 'cuboctahedron',
    matches: family('Archimedean'),
  },
  {
    id: 'catalan',
    label: 'Catalan',
    hint: 'Duals of Archimedean solids',
    representative: 'rhombic-dodecahedron',
    matches: family('Catalan'),
  },
  {
    id: 'kepler-poinsot',
    label: 'Kepler–Poinsot stars',
    hint: 'Four regular star solids',
    representative: 'small-stellated-dodecahedron',
    matches: family('Kepler-Poinsot'),
  },
  {
    id: 'johnson',
    label: 'Johnson solids',
    hint: '92 convex regular-faced solids',
    representative: 'antiprism-j1',
    matches: family('Johnson'),
  },
  {
    id: 'regular4',
    label: 'Regular 4D polychora',
    hint: 'The six regular convex 4D shapes',
    representative: 'tesseract',
    matches: family('Regular convex'),
  },
  {
    id: 'star4',
    label: 'Star polychora',
    hint: 'Regular and uniform 4D stars',
    representative: 'miratope-grand-hexacosichoron',
    matches: family('Regular star', 'Star uniform polychora (Wythoffian)', 'nonconvex uniform (Miratope source)'),
  },
  {
    id: 'uniform4',
    label: 'Uniform polychora',
    hint: 'Documented uniform 4D families',
    representative: 'uniform4-rit',
    matches: family(
      'Convex uniform 4D',
      'convex uniform (Miratope source)',
      'Star uniform polychora (Wythoffian)',
      'nonconvex uniform (Miratope source)',
      'Convex uniform polyhedral prisms'
    ),
  },
  {
    id: 'compounds',
    label: 'Compounds',
    hint: 'Solids woven together',
    representative: 'compound-five-tetrahedra-a',
    matches: (entry) => entry.dimension === 3 && family('Compounds', 'Compound')(entry),
  },
  {
    id: 'compounds4',
    label: '4D compounds',
    hint: 'Four-dimensional combinations',
    representative: 'compound-two-24-cells',
    matches: family('4D compounds'),
  },
  {
    id: 'prisms',
    label: 'Prisms & antiprisms',
    hint: 'Polygons and solids extended',
    representative: 'uniform-antiprism-5',
    matches: family('Uniform polygonal prisms', 'Uniform polygonal antiprisms', 'Convex uniform polyhedral prisms'),
  },
  {
    id: 'near-miss',
    label: 'Near-miss Johnson',
    hint: 'Almost regular faces; approximate',
    representative: 'near-miss-chamfered-cube',
    matches: family('Near-miss Johnson solids'),
  },
  {
    id: 'discovery4',
    label: DISCOVERY_CANDIDATE_LABEL,
    hint: DISCOVERY_CANDIDATE_NOTE,
    matches: family('4D discovery candidates'),
  },
  {
    id: 'more',
    label: 'More shapes',
    hint: 'Toroids, other families & linked files',
    matches: (entry) => !LIBRARY_COLLECTIONS.slice(0, -1).some((item) => item.matches(entry)),
  },
];
export function collectionSummaries(entries, options) {
  entries = catalogBrowseEntries(entries, options);
  return LIBRARY_COLLECTIONS.map((collection) => {
    const models = entries.filter(collection.matches),
      representative =
        models.find((entry) => entry.key === collection.representative) ??
        models.find((entry) => entry.supported !== false && entry.catalogStatus !== 'unsupported');
    return { ...collection, count: models.length, entry: representative };
  }).filter((item) => item.count);
}
export function libraryCounts(entry) {
  if (!Array.isArray(entry.counts)) return 'Counts unavailable until opened';
  return entry.counts
    .slice(0, entry.dimension === 4 ? 4 : 3)
    .map((count, i) =>
      Number.isFinite(count) ? count.toLocaleString() + ' ' + ['vertices', 'edges', 'faces', 'cells'][i] : null
    )
    .filter(Boolean)
    .join(' · ');
}

export class LibraryCollections {
  constructor({
    document,
    thumbnails,
    change,
    guard = (fn) => fn,
    resetFilters = () => {},
    getBuilder = () => globalThis.window?.openCoxeterBuilder,
  }) {
    Object.assign(this, { document, thumbnails, change, resetFilters, getBuilder });
    this.collection = null;
    this.showAll = false;
    this.view = 'list';
    const make = (tag, id, text) => {
      const node = document.createElement(tag);
      if (id) node.id = id;
      if (text) node.textContent = text;
      return node;
    };
    this.make = make;
    const actions = make('div', 'library-visual-actions');
    actions.className = 'library-visual-actions';
    this.home = make('button', 'library-home', 'Collections');
    this.home.onclick = () => this.goHome();
    this.list = make('button', 'library-view-list', 'List');
    this.grid = make('button', 'library-view-grid', 'Grid');
    for (const [button, view] of [
      [this.list, 'list'],
      [this.grid, 'grid'],
    ]) {
      button.setAttribute(
        'aria-label',
        view === 'list' ? 'Show library as a list' : 'Show library as a thumbnail grid'
      );
      button.onclick = () => {
        this.view = view;
        change();
      };
    }
    actions.append(this.home, this.list, this.grid);
    document.getElementById('library-family').before(actions);
    this.builder = make('button', 'library-build-symmetry', 'Build from symmetry');
    this.builder.className = 'wide';
    this.builder.hidden = typeof getBuilder() !== 'function';
    this.builder.onclick = guard(() => {
      const build = getBuilder();
      this.builder.hidden = typeof build !== 'function';
      if (typeof build === 'function') return build();
    });
    symmetryHero(document, this.builder);
    document.getElementById('search')?.before(this.builder);
    this.updateCount = document.getElementById('search') ? mountLibrarySearch(document) : () => {};
    const more = make('details', 'library-more-filters'),
      summary = make('summary', null, 'More filters');
    more.setAttribute('data-expert', '');
    more.append(summary);
    document.getElementById('library-family').after(more);
    more.append(document.getElementById('library-audit-filter'), document.getElementById('library-properties'));
    this.breadcrumb = make('div', 'library-breadcrumb');
    this.breadcrumb.setAttribute('role', 'status');
    more.after(this.breadcrumb);
    this.tooltip = make('div', 'library-item-preview');
    this.tooltip.className = 'library-item-preview';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.hidden = true;
    document.body.append(this.tooltip);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hidePreview();
    });
    document.getElementById('catalog').addEventListener('scroll', () => this.hidePreview());
    document.getElementById('library-region')?.addEventListener('scroll', () => this.hidePreview());
    globalThis.window?.addEventListener('resize', () => this.hidePreview());
  }
  mountOverflow() {
    const button = this.document.getElementById('link-library'),
      menu = this.document.getElementById('app-options'),
      panel = this.document.getElementById('app-options-panel');
    if (!button || !panel) return;
    button.textContent = '+ Link local OFF catalog';
    panel.append(button);
    button.addEventListener('click', () => {
      menu.open = false;
    });
  }
  goHome() {
    this.collection = null;
    this.showAll = false;
    this.resetFilters();
    this.change();
    this.home.focus();
  }
  matches(entry) {
    return !this.collection || LIBRARY_COLLECTIONS.find((item) => item.id === this.collection)?.matches(entry);
  }
  prepare(
    entries,
    {
      query = '',
      includeDiscoveryCandidates = false,
      filtered = catalogBrowseEntries(entries, { includeDiscoveryCandidates }),
      filtersActive = false,
    } = {}
  ) {
    this.hidePreview();
    this.thumbnails.reset();
    if (this.entries !== entries) {
      const version = catalogThumbnailVersion(entries);
      this.thumbnails.setVersion(version);
      this.entries = entries;
    }
    this.builder.hidden = typeof this.getBuilder() !== 'function';
    this.list.setAttribute('aria-pressed', String(this.view === 'list'));
    this.grid.setAttribute('aria-pressed', String(this.view === 'grid'));
    const catalog = this.document.getElementById('catalog');
    catalog.classList.toggle('library-grid', this.view === 'grid');
    this.breadcrumb.replaceChildren();
    if (this.collection || this.showAll) {
      const back = this.make('button', 'library-back', '← Collections');
      back.onclick = () => this.goHome();
      this.breadcrumb.append(
        back,
        this.make(
          'span',
          null,
          this.collection ? LIBRARY_COLLECTIONS.find((item) => item.id === this.collection).label : 'All models'
        )
      );
    }
    this.breadcrumb.hidden = !this.collection && !this.showAll;
    if (query || filtersActive || this.collection || this.showAll || !entries.length) return;
    const section = this.make('details', 'library-collections');
    section.open = true;
    section.append(this.make('summary', null, 'Collections'));
    const cards = this.make('div', 'library-collection-cards');
    cards.className = 'library-collection-cards';
    for (const collection of collectionSummaries(filtered, { includeDiscoveryCandidates })) {
      const button = this.make('button', 'library-collection-' + collection.id);
      button.className = 'library-collection-card';
      button.dataset.collection = collection.id;
      button.title = collection.hint;
      const slot = this.make('span');
      if (collection.entry) this.thumbnails.watch(slot, collection.entry);
      button.append(
        slot,
        this.make('strong', null, collection.label),
        this.make('small', null, collection.count.toLocaleString() + ' models')
      );
      button.onclick = () => {
        this.collection = collection.id;
        this.showAll = false;
        this.change();
        this.document.getElementById('library-back')?.focus();
      };
      cards.append(button);
    }
    const all = this.make('button', 'library-show-all', 'Show all models');
    all.className = 'wide';
    all.onclick = () => {
      this.showAll = true;
      this.change();
    };
    section.append(all, cards);
    const link = this.make('button', 'library-link-local', '+ Link local OFF catalog');
    link.className = 'library-text-link';
    link.onclick = () => this.document.getElementById('link-library')?.click();
    section.append(link);
    catalog.append(section);
  }
  decorate(button, entry) {
    if (this.view === 'grid') {
      const slot = this.make('span');
      button.prepend(slot);
      this.thumbnails.watch(slot, entry);
    }
    button.addEventListener('pointerenter', () => {
      clearTimeout(this.previewTimer);
      this.previewTimer = setTimeout(() => this.showPreview(button, entry), 300);
    });
    button.addEventListener('pointerleave', () => this.hidePreview());
    button.addEventListener('focus', () => this.showPreview(button, entry));
    button.addEventListener('blur', () => this.hidePreview());
    button.addEventListener('click', () => this.hidePreview());
  }
  hidePreview() {
    clearTimeout(this.previewTimer);
    if (this.previewSlot) this.thumbnails.unwatch(this.previewSlot);
    this.previewSlot = null;
    if (this.previewButton) {
      if (this.previousDescription === null) this.previewButton.removeAttribute('aria-describedby');
      else this.previewButton.setAttribute('aria-describedby', this.previousDescription);
    }
    this.previewButton = null;
    this.tooltip.hidden = true;
  }
  showPreview(button, entry) {
    this.hidePreview();
    if (!button.isConnected) return;
    const tooltip = this.tooltip,
      slot = this.make('span');
    this.previewSlot = slot;
    tooltip.replaceChildren(
      slot,
      this.make('strong', null, entry.name),
      this.make('small', null, libraryCounts(entry))
    );
    const provenance = libraryProvenance(entry);
    if (provenance) tooltip.append(this.make('small', null, provenance));
    if (entry.catalogStatus) tooltip.append(this.make('small', null, entry.catalogStatus));
    this.thumbnails.watch(slot, entry, { immediate: true });
    tooltip.hidden = false;
    this.previewButton = button;
    this.previousDescription = button.getAttribute('aria-describedby');
    button.setAttribute('aria-describedby', [this.previousDescription, tooltip.id].filter(Boolean).join(' '));
    const rect = button.getBoundingClientRect(),
      width = globalThis.window?.innerWidth ?? 1280,
      height = globalThis.window?.innerHeight ?? 800;
    tooltip.style.left = Math.max(8, Math.min(rect.right + 8, width - 248)) + 'px';
    tooltip.style.top = Math.max(8, Math.min(rect.top, height - tooltip.offsetHeight - 8)) + 'px';
  }
}
