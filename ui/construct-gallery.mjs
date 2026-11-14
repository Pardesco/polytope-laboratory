import { guideContext } from './user-guide.mjs';
import { createToolIcon } from './tool-icons.mjs';

const categories = [
  'Change this shape',
  'Make it regular',
  'Stars & facets',
  'Combine',
  'Create a new shape',
  'Expert',
];
export const COMMON_CONSTRUCT_TOOLS = new Set([
  'gallery-dual',
  'gallery-truncate',
  'expansion-settings',
  'transform-model-settings',
  'add-dual-controls',
  'hull-model-settings',
  'gallery-generator',
  'antiprism-settings',
  'product-settings',
  'shape-builder',
]);
export const commonConstructTool = (tool) => tool.common === true || COMMON_CONSTRUCT_TOOLS.has(tool.id);
const tool = (id, name, description, category, keywords = '', primary = '', dimensions = null) => ({
  id,
  name,
  description,
  category,
  keywords,
  primary,
  dimensions,
});
export const CONSTRUCT_TOOLS = [
  tool(
    'gallery-dual',
    'Dual',
    'Swap faces and corners: construct the polar dual.',
    0,
    'dual polar reciprocal incidence',
    'make-dual',
    [2, 3, 4]
  ),
  tool(
    'gallery-truncate',
    'Truncate / Rectify',
    'Cut corners, or cut all the way to edge midpoints.',
    0,
    'truncate truncation rectify rectification bevel',
    'truncate',
    [2, 3, 4]
  ),
  tool(
    'incidence-truncation-settings',
    'Star truncation',
    'Cut corners of star and compound shapes, keeping the ordered face connections.',
    0,
    'incidence truncate rectify truncation rectification quasitruncation',
    'preview-incidence-cut',
    [3, 4]
  ),
  tool(
    'expansion-settings',
    'Expand / Runcinate',
    'Separate faces and fill the gaps with new faces.',
    0,
    'expand runcinate runcination cantellate',
    'make-expansion',
    [3, 4]
  ),
  tool(
    'face-conway-settings',
    'Conway / Subdivide',
    'Use Conway operations and add directional zones.',
    0,
    'kis subdivide conway zonohedron',
    'conway-apply',
    [3]
  ),
  tool(
    'augmentation-settings',
    'Augment (attach faces)',
    'Join two matching faces to add a new piece.',
    0,
    'augment augmentation attach glue',
    'attach-faces',
    [3]
  ),
  tool(
    'face-placement-settings',
    'Augment (face placement)',
    'Align another shape with a chosen face.',
    0,
    'excavate augmentation attach placement',
    'place-at-faces',
    [3]
  ),
  tool(
    'face-surgery-settings',
    'Augment / Excavate',
    'Add or remove pyramids, cupolas and other pieces.',
    0,
    'augmentation excavation surgery diminish',
    'apply-face-surgery',
    [3]
  ),
  tool(
    'face-editing-settings',
    'Weld / Blend faces',
    'Inspect overlapping faces, remove pairs or blend them.',
    0,
    'coincidence weld blend union holes',
    'coincidence-analyze'
  ),
  tool(
    'cell-rebuild-settings',
    'Coplanar cells',
    'Join two convex cells across their shared face in 4D.',
    0,
    '4d cell reconstruction merge split join',
    'cell-rebuild-ids'
  ),
  tool(
    'transform-model-settings',
    'Scale / Reflect / Extrude',
    'Change size, make a mirror image or add a dimension.',
    0,
    'scale mirror extrusion prism transform',
    'scale'
  ),
  tool(
    'subdivision-settings',
    'Subdivide edges',
    'Add smaller segments to the existing edges.',
    0,
    'subdivision subdivide',
    'subdivide-edges',
    [3]
  ),
  tool(
    'geodesic-settings',
    'Geodesic subdivision',
    'Divide triangular faces and project onto a sphere.',
    0,
    'triangular geodesic subdivide sphere',
    'make-geodesic',
    [3]
  ),
  tool(
    'fitting-settings',
    'Fit faces',
    'Fit geometric targets and inspect the remaining error.',
    1,
    'fitting fit equal edges planar equal areas solver',
    'make-faces-regular',
    [3, 4]
  ),
  tool(
    'spring-settings',
    'Spring relaxation',
    'Adjust vertices toward chosen lengths and constraints.',
    1,
    'spring relaxation optimize fit',
    'preview-spring',
    [3]
  ),
  tool(
    'sphere-projection-settings',
    'Spherical projection',
    'Project onto a common sphere with a chosen center.',
    1,
    'sphere spherical projection',
    'sphere-project-apply',
    [3, 4]
  ),
  tool(
    'faceting-diagram-settings',
    'Facet (diagram)',
    'Build faces from a faceting diagram.',
    2,
    'faceting diagram star polygon',
    'faceting-diagram-build',
    [3]
  ),
  tool(
    'automatic-faceting-settings',
    'Facet (search)',
    'Search a bounded set of faces on the existing vertices.',
    2,
    'automatic faceting facets tidy spiky',
    'faceting-candidates',
    [3]
  ),
  tool(
    'stellation-plane-settings',
    'Stellate',
    'Explore regions made by the extended face planes.',
    2,
    'stellate stellation planes regions diagram miller',
    'stellation-evaluate',
    [3]
  ),
  tool(
    'stellation-cell-settings',
    'Stellate (regions)',
    'Select stellation cells and build their boundary.',
    2,
    'stellation cells miller stars',
    '',
    [3]
  ),
  tool(
    'gallery-facets',
    'Facet (manual)',
    'Define ordered face cycles on the current vertices.',
    2,
    'manual faceting facets cycles star',
    'facet',
    [3]
  ),
  tool(
    'add-dual-controls',
    'Compound with dual',
    'Keep this shape and add its dual as a second component.',
    3,
    'compound reciprocation polar',
    'add-dual',
    [3, 4]
  ),
  tool(
    'blending-controls',
    'Merge / Blend components',
    'Combine component interiors or try an equal-edge variant.',
    3,
    'merge compound blending union pseudo uniform',
    'merge-compound',
    [3]
  ),
  tool(
    'compound-controls',
    'Compound components',
    'Keep or delete a part of a compound.',
    3,
    'compound extract drop component',
    'compound-extract'
  ),
  tool(
    'uniform-compound-settings',
    'Uniform compound',
    'Arrange repeated copies using supported symmetry families.',
    3,
    'uniform compound copies symmetry'
  ),
  tool(
    'gallery-generator',
    'Prism / Polygon / Block',
    'Create a basic shape in a new document.',
    4,
    'generator duoprism pyramid waterman cube',
    'generate'
  ),
  tool(
    'basic-solid-settings',
    'Cuboid / Tetrahedron / Prism',
    'Create a block, tetrahedron, triangular prism or grid.',
    4,
    'cuboid edges grid irregular',
    'basic-generate'
  ),
  tool(
    'wythoff-model-settings',
    'Coxeter / Wythoff',
    'Choose a Coxeter family and generate a reflection orbit.',
    4,
    'wythoff coxeter rings symmetry uniform',
    'wythoff'
  ),
  tool(
    'hull-model-settings',
    'Convex hull',
    'Build the convex hull of supplied coordinates.',
    4,
    'point cloud hull convex',
    'build-hull'
  ),
  tool(
    'cupola-settings',
    'Cupola / Rotunda',
    'Build domes, belts and related polygonal solids.',
    4,
    'cupola rotunda bicupola'
  ),
  tool(
    'star-polygon-settings',
    'Star polygon',
    'Choose the number of corners and the step between them.',
    4,
    'star polygon schlafli winding'
  ),
  tool(
    'product-settings',
    'Product / Duoprism',
    'Build polygon products or a prism from a polygon.',
    4,
    'product duoprism cartesian prism'
  ),
  tool(
    'antiprism-settings',
    'Antiprism / Antiduoprism',
    'Join offset polygons or construct an antiduoprism.',
    4,
    'antiprism antiduoprism'
  ),
  tool('step-prism-settings', 'Step prism', 'Create step-connected polygon layers.', 4, 'step prism'),
  tool('torus-settings', 'Torus', 'Create a ring-shaped surface from polygon cycles.', 4, 'torus toroid ring'),
  tool('waterman-settings', 'Waterman hull', 'Build a Waterman shape from lattice points.', 4, 'waterman fcc lattice'),
  tool(
    'uniform-family-settings',
    'Uniform prism / Antiprism',
    'Create equal-edge prism and antiprism families.',
    4,
    'uniform prism duoprism antiprism'
  ),
  tool(
    'goursat-wythoff-settings',
    'Goursat / Wythoff stars',
    'Generate checked star polychora and Schwarz polyhedra.',
    4,
    'star polychoron polyhedron schwarz schlafli hess goursat wythoff rational',
    'generate-goursat-wythoff'
  ),
  tool('podia-settings', 'Podia / Antipodia', 'Create podia and antipodia from repeated layers.', 4, 'podia antipodia'),
  tool(
    'layer-join-settings',
    'Layer join',
    'Connect layers into a new shape.',
    4,
    'layer join blend',
    'make-layer-join',
    [3]
  ),
  tool(
    'crossed-segmentotope-settings',
    'Crossed segmentotope',
    'Build a segmentotope from crossed polygon layers.',
    4,
    'crossed segmentotope zonotope'
  ),
  tool(
    'noble-settings',
    'Noble polyhedra',
    'Build supported shapes with equivalent faces and corners.',
    4,
    'noble isohedral isogonal'
  ),
  tool(
    'stephanoid-settings',
    'Stephanoid',
    'Create a stephanoid from a repeating polygon belt.',
    4,
    'stephanoid crown'
  ),
  tool(
    'vertex-figure-construction-settings',
    'Vertex-figure construction',
    'Construct supported shapes from a vertex figure.',
    4,
    'vertex figure uniform scaliform',
    'vertex-figure-search',
    [3]
  ),
  tool(
    'shape-builder',
    'Coxeter / Wythoff / Snub',
    'Explore a symmetry diagram; choose snub variants in octahedral or icosahedral symmetry.',
    4,
    'coxeter wythoff diagram builder snub twist symmetry schlafli schl?fli'
  ),
  tool(
    'projective-dual-settings',
    'Projective dual',
    'Inspect a clipped reciprocal view with points at infinity.',
    5,
    'projective infinite dual',
    'projective-dual-apply',
    [3]
  ),
  tool(
    'coincidic-regiment-settings',
    'Coincidic regiments',
    'Compare supported literal cell arrangements.',
    5,
    'coincidic regiment comparison',
    '',
    [4]
  ),
  tool(
    'convex-core-settings',
    'Convex core',
    'Intersect supporting half-spaces around a chosen center.',
    0,
    'convex core',
    'make-convex-core',
    [3, 4]
  ),
  tool(
    'source-zonohedron-settings',
    'Zonohedron',
    'Construct a zonohedron using selected source directions.',
    0,
    'source zonohedron zonotope',
    'make-source-zonohedron',
    [3]
  ),
  tool(
    'exact-section-settings',
    'Rational section',
    'Compute a certified section in the supported rational domain.',
    5,
    'exact rational surface section',
    '',
    [3]
  ),
  tool(
    'expression-settings',
    'Expression calculator',
    'Evaluate a numeric expression without changing the shape.',
    5,
    'expression calculator rational',
    'evaluate'
  ),
];
const normalize = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function matchesConstructTool(tool, query) {
  const text = normalize(
    [tool.name, tool.description, tool.keywords, tool.technical, categories[tool.category]].join(' ')
  );
  return normalize(query)
    .split(/\s+/)
    .every((word) => text.includes(word));
}
export function recentConstructTools(previous, id, allowed) {
  return [id, ...previous.filter((item) => item !== id)].filter((item) => allowed.has(item)).slice(0, 4);
}
export function readConstructRecent(storage, allowed) {
  try {
    const value = JSON.parse(storage?.getItem('polytope.construct.recent') ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, 4)
      : [];
  } catch {
    return [];
  }
}
export function constructToolReason(tool, model, action) {
  if (tool.dimensions && !tool.dimensions.includes(model?.dimension))
    return model ? `Choose a ${tool.dimensions.join('D or ')}D model for this tool.` : 'Open a model first.';
  if (action?.disabled || action?.matches?.(':disabled'))
    return (
      action.dataset?.disabledReason ||
      action.getAttribute?.('aria-description') ||
      action.title ||
      'Unavailable for the current model or workspace state.'
    );
  return '';
}
export function constructToolDescription(tool, model) {
  if (tool.id === 'gallery-dual')
    return model?.dimension === 4
      ? 'Swap cells and vertices: construct the polar dual in 4D.'
      : model?.dimension === 2
        ? 'Swap edges and corners: construct the polar dual polygon.'
        : tool.description;
  return tool.description;
}
export function constructToolGroup(tool, model, action) {
  const reason = constructToolReason(tool, model, action);
  if (!reason) return null;
  const dimension = tool.dimensions && !tool.dimensions.includes(model?.dimension);
  return {
    key: dimension ? 'dimension-' + tool.dimensions.join('-') : reason,
    label: dimension
      ? model
        ? `Needs a ${tool.dimensions.join('D or ')}D model`
        : 'Open a model first'
      : reason.replace(/\.$/, ''),
  };
}
const shells = new Set([
  'create-model-settings',
  'advanced-construction-settings',
  'fit-refine-controls',
  'facet-stellate-controls',
]);
const ownSummary = (node) => Array.from(node.children).find((child) => child.tagName === 'SUMMARY');
const heading = (node) => node.classList.contains('panel-title') || node.classList.contains('rule');
export class ConstructGallery {
  constructor(doc, { getModel = () => null, guide, window: win = doc.defaultView, storage } = {}) {
    this.doc = doc;
    this.win = win;
    this.getModel = getModel;
    this.guide = guide;
    this.panel = doc.getElementById('construct-panel');
    this.tools = [];
    this.active = null;
    try {
      this.storage = storage ?? win?.localStorage;
    } catch {}
    const create = (this.create = (tag, text, cls) => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    });
    this.panel.classList.add('construct-gallery');
    this.sources = create('div', null, 'construct-tool-host');
    this.sources.append(...Array.from(this.panel.children));
    this.panel.append(this.sources);
    const legacyBuilder = doc.getElementById('open-coxeter-builder'),
      wythoffSettings = doc.getElementById('wythoff-model-settings');
    if (legacyBuilder && wythoffSettings) wythoffSettings.append(legacyBuilder);
    this.wrapLegacy('gallery-dual', ['make-dual', 'dual-options-settings']);
    const cut = doc.getElementById('truncation');
    this.wrapLegacy('gallery-truncate', [cut?.closest('label'), doc.getElementById('truncate')]);
    const createRoot = doc.getElementById('create-model-settings');
    if (createRoot) {
      const loose = Array.from(createRoot.children).filter(
        (node) => node.tagName !== 'SUMMARY' && node.tagName !== 'DETAILS' && !heading(node)
      );
      this.wrapLegacy('gallery-generator', loose);
    }
    const facets = doc.getElementById('facet-cycles');
    if (facets) {
      const nodes = [];
      for (let node = facets; node && !node.id?.endsWith('-settings'); node = node.nextElementSibling) nodes.push(node);
      this.wrapLegacy('gallery-facets', nodes);
    }
    this.overview = create('div');
    this.overview.id = 'construct-gallery-home';
    const intro = create('p', 'What would you like to make?', 'construct-gallery-intro'),
      label = create('label', 'Find a tool', 'sr-only');
    label.htmlFor = 'construct-tool-search';
    this.search = create('input');
    this.search.id = 'construct-tool-search';
    this.search.type = 'search';
    this.search.placeholder = 'Find a tool…';
    this.search.setAttribute('aria-controls', 'construct-tool-categories');
    this.search.autocomplete = 'off';
    this.recentRoot = create('section', null, 'construct-recent');
    this.recentRoot.id = 'construct-recent';
    this.recentRoot.setAttribute('aria-label', 'Recent tools');
    this.categoryRoot = create('div');
    this.categoryRoot.id = 'construct-tool-categories';
    const makeCategories = (host) =>
      categories.map((name) => {
        const root = create('section', null, 'construct-category');
        root.setAttribute('aria-label', name);
        const title = create('h3', name),
          grid = create('div', null, 'construct-card-grid');
        root.append(title, grid);
        host.append(root);
        return { root, grid };
      });
    this.categoryNodes = makeCategories(this.categoryRoot);
    this.moreTools = create('details', null, 'construct-more-tools');
    this.moreTools.id = 'construct-more-tools';
    this.moreTools.dataset.guideTopic = 'construction';
    this.moreTools.open = false;
    this.moreTools.append(create('summary', 'More tools'));
    this.specialistCategories = create('div');
    this.specialistNodes = makeCategories(this.specialistCategories);
    this.specialistUnavailable = create('div');
    this.moreTools.append(this.specialistCategories, this.specialistUnavailable);
    this.empty = create('p', 'No tools match. Try “corners”, “dual” or “prism”.', 'muted');
    this.empty.hidden = true;
    this.empty.setAttribute('role', 'status');
    this.count = create('p', null, 'sr-only');
    this.count.setAttribute('aria-live', 'polite');
    this.unavailableRoot = create('div', null, 'construct-unavailable');
    this.unavailableRoot.id = 'construct-unavailable';
    this.unavailableGroups = new Map();
    this.overview.append(
      intro,
      label,
      this.search,
      this.recentRoot,
      this.categoryRoot,
      this.unavailableRoot,
      this.moreTools,
      this.empty,
      this.count
    );
    this.scan(this.sources);
    const builder = { ...CONSTRUCT_TOOLS.find((t) => t.id === 'shape-builder'), external: true };
    this.addTool(builder);
    this.allowed = new Set(this.tools.map((t) => t.id));
    this.recent = readConstructRecent(this.storage, this.allowed);
    this.panel.append(this.overview, this.sources);
    this.search.addEventListener('input', () => this.sync());
    this.search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.search.value = '';
        this.sync();
      }
      if (event.key === 'ArrowDown') {
        const card = this.tools.find(
          (t) =>
            !t.card.hidden &&
            !t.card.disabled &&
            !t.external &&
            (!t.card.closest('#construct-more-tools') || this.moreTools.open)
        );
        if (card) {
          event.preventDefault();
          card.card.focus();
        }
      }
    });
    this.panel.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 'ArrowLeft' && this.active) {
        event.preventDefault();
        this.back();
      }
    });
    doc.querySelector('[data-panel="construct"]')?.addEventListener('click', () => this.sync());
    if (win) {
      win.openConstructTool = (target, options) => this.open(target, options);
      win.addEventListener?.('construct-tools-changed', () => this.sync());
    }
    const Observer = win?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.sync());
      this.observer.observe(this.sources, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'title', 'data-disabled-reason'],
      });
    }
    this.sync();
  }
  wrapLegacy(id, ids) {
    const nodes = ids.map((item) => (typeof item === 'string' ? this.doc.getElementById(item) : item)).filter(Boolean);
    if (!nodes.length) return;
    const root = this.create('section');
    root.id = id;
    nodes[0].before(root);
    root.append(...nodes);
  }
  scan(container) {
    let previous = null;
    for (const node of Array.from(container.children)) {
      if (heading(node) || node.tagName === 'SUMMARY') {
        node.classList.add('construct-source-heading');
        continue;
      }
      if (shells.has(node.id) || (node.classList.contains('inspector-card') && !node.id)) {
        node.classList.add('construct-source-shell');
        if (node.tagName === 'DETAILS') node.open = true;
        this.scan(node);
        continue;
      }
      if (!node.querySelector('button,input,select,textarea')) {
        if (previous) (previous.more ?? previous.root).append(node);
        continue;
      }
      const summary = ownSummary(node),
        technical = (
          summary?.textContent ||
          node.querySelector('.panel-title')?.textContent ||
          node.id.replace(/-(settings|controls)$/, '').replaceAll('-', ' ')
        ).trim();
      const known = CONSTRUCT_TOOLS.find((tool) => tool.id === node.id),
        meta =
          known ??
          tool(
            node.id || 'gallery-tool-' + this.tools.length,
            technical,
            'Explore the existing ' + technical.toLocaleLowerCase() + ' controls.',
            5,
            technical
          );
      this.addTool({ ...meta, technical, root: node });
      previous = this.tools.at(-1);
    }
  }
  addTool(meta) {
    const c = this.create,
      t = { ...meta };
    this.tools.push(t);
    t.card = c('button', null, 'construct-tool-card');
    t.card.id = 'construct-card-' + t.id;
    t.card.type = 'button';
    t.card.setAttribute('aria-label', t.name);
    t.card.dataset.constructTarget = t.id;
    const svg = createToolIcon(this.doc, t);
    const copy = c('span', null, 'construct-card-copy');
    t.reason = c('small', null, 'construct-card-reason');
    t.subtitle = c('span', t.description);
    copy.append(c('strong', t.name), t.subtitle, t.reason);
    t.card.append(svg, copy);
    t.card.onclick = () => this.open(t.id);
    this.categoryNodes[t.category].grid.append(t.card);
    if (!t.root) return;
    t.pane = c('section', null, 'construct-tool-pane');
    t.pane.dataset.constructTool = t.id;
    t.pane.dataset.constructName = t.name;
    t.pane.dataset.constructKeywords = t.keywords;
    t.pane.id = 'construct-pane-' + t.id;
    t.pane.hidden = true;
    t.pane.setAttribute('aria-labelledby', 'construct-title-' + t.id);
    const header = c('div', null, 'construct-pane-header'),
      back = c('button', '← All tools', 'construct-back');
    back.type = 'button';
    back.id = 'construct-back-' + t.id;
    back.onclick = () => this.back();
    t.title = c('h3', t.name);
    t.title.id = 'construct-title-' + t.id;
    t.title.tabIndex = -1;
    const help = c('button', '?', 'group-help construct-pane-help');
    help.type = 'button';
    help.setAttribute('aria-label', 'Help for ' + t.name);
    help.title = 'Guide: ' + t.technical;
    help.onclick = () => this.guide?.show(guideContext(t.root));
    header.append(back, help, t.title);
    t.paneDescription = c('p', t.description, 'construct-pane-description');
    t.pane.append(header, t.paneDescription);
    t.root.before(t.pane);
    t.pane.append(t.root);
    const summary = ownSummary(t.root);
    if (summary) {
      summary.classList.add('construct-tool-summary');
      t.root.open = true;
    }
    t.root.classList.add('construct-tool-controls');
    for (const node of Array.from(t.root.children)) if (heading(node)) node.classList.add('construct-source-heading');
    t.action = (t.primary && this.doc.getElementById(t.primary)) || t.root.querySelector('button:not(.group-help)');
    t.action?.classList.add('construct-primary');
    const options = Array.from(t.root.children).filter((node) => node.tagName === 'DETAILS');
    if (options.length === 1) {
      t.more = options[0];
      t.more.classList.add('construct-more-options');
      const summary = ownSummary(t.more);
      if (summary) {
        summary.title = summary.textContent;
        summary.textContent = 'More options';
      }
    } else if (options.length) {
      const more = c('details', null, 'construct-more-options'),
        summary = c('summary', 'More options');
      more.append(summary);
      options[0].before(more);
      more.append(...options);
      t.more = more;
    }
  }
  find(target) {
    if (!target) return null;
    const node = typeof target === 'string' ? this.doc.getElementById(target) : target;
    return (
      this.tools.find(
        (t) => t.id === target || t.root === node || t.root?.contains(node) || t.pane === node || t.card === node
      ) || this.tools.find((t) => node?.contains(t.pane))
    );
  }
  open(target, { focus = true } = {}) {
    const t = this.find(target);
    if (!t) return false;
    if (t.external) {
      if (typeof this.win?.openCoxeterBuilder !== 'function') return false;
      this.remember(t.id);
      this.win.openCoxeterBuilder();
      return true;
    }
    this.active = t;
    this.overview.hidden = true;
    for (const item of this.tools) if (item.pane) item.pane.hidden = item !== t;
    for (let node = t.root; node && node !== this.panel; node = node.parentElement)
      if (node.tagName === 'DETAILS') node.open = true;
    const element = typeof target === 'string' ? this.doc.getElementById(target) : target;
    if (t.root.contains(element))
      for (let node = element; node && node !== t.root; node = node.parentElement)
        if (node.tagName === 'DETAILS') node.open = true;
    this.doc.querySelector('[data-panel="construct"]')?.click();
    if (this.doc.body.classList.contains('inspector-hidden')) this.doc.getElementById('toggle-inspector')?.click();
    this.remember(t.id);
    if (focus) t.title.focus({ preventScroll: true });
    return true;
  }
  remember(id) {
    this.recent = recentConstructTools(this.recent, id, this.allowed);
    try {
      this.storage?.setItem('polytope.construct.recent', JSON.stringify(this.recent));
    } catch {}
    this.syncRecent();
  }
  back() {
    const previous = this.active;
    this.active = null;
    for (const t of this.tools) if (t.pane) t.pane.hidden = true;
    this.overview.hidden = false;
    this.sync();
    if (previous && !previous.card.hidden && !previous.card.disabled) {
      if (previous.card.closest('#construct-more-tools')) this.moreTools.open = true;
      previous.card.focus({ preventScroll: true });
    } else this.search.focus({ preventScroll: true });
  }
  syncRecent() {
    this.recentRoot.replaceChildren();
    const ids = this.recent.filter((id) => {
      const t = this.tools.find((t) => t.id === id);
      return (
        t &&
        !t.card.hidden &&
        !t.card.disabled &&
        (this.doc.body.classList.contains('expert-mode') || commonConstructTool(t))
      );
    });
    this.recentRoot.hidden = !ids.length || !!this.search.value;
    if (!ids.length) return;
    this.recentRoot.append(this.create('h3', 'Recent'));
    const row = this.create('div', null, 'construct-recent-row');
    for (const id of ids) {
      const t = this.tools.find((t) => t.id === id),
        button = this.create('button', t.name);
      button.type = 'button';
      button.disabled = t.card.disabled;
      button.title = t.card.title;
      button.onclick = () => this.open(id);
      row.append(button);
    }
    this.recentRoot.append(row);
  }
  sync() {
    const model = this.getModel(),
      groups = new Map(),
      searching = !!this.search.value.trim(),
      expert = this.doc.body.classList.contains('expert-mode');
    let count = 0;
    for (const t of this.tools) {
      const absent = t.external && typeof this.win?.openCoxeterBuilder !== 'function',
        hide = absent || !matchesConstructTool(t, this.search.value),
        reason = constructToolReason(t, model, t.action),
        group = constructToolGroup(t, model, t.action),
        description = constructToolDescription(t, model);
      t.card.hidden = hide;
      t.card.disabled = !!reason;
      t.card.title = reason || description;
      t.reason.textContent = reason;
      t.reason.hidden = true;
      if (t.subtitle.textContent !== description) t.subtitle.textContent = description;
      if (t.paneDescription && t.paneDescription.textContent !== description)
        t.paneDescription.textContent = description;
      const specialist = !expert && !searching && !commonConstructTool(t);
      let host = (specialist ? this.specialistNodes : this.categoryNodes)[t.category].grid;
      if (group && !hide) {
        const key = (specialist ? 'more-' : '') + group.key;
        let entry = this.unavailableGroups.get(key);
        if (!entry) {
          const root = this.create('details', null, 'construct-unavailable-group'),
            summary = this.create('summary'),
            label = this.create('span'),
            grid = this.create('div', null, 'construct-card-grid');
          root.id = 'construct-unavailable-' + this.unavailableGroups.size;
          root.dataset.guideTopic = 'construction';
          root.open = false;
          summary.append(label);
          root.append(summary, grid);
          (specialist ? this.specialistUnavailable : this.unavailableRoot).append(root);
          entry = { root, summary, label, grid };
          this.unavailableGroups.set(key, entry);
        }
        host = entry.grid;
        if (searching) entry.root.open = true;
        const n = (groups.get(key) ?? 0) + 1;
        groups.set(key, n);
        entry.label.textContent = `${group.label} (${n})`;
      }
      if (t.card.parentElement !== host) host.append(t.card);
      if (!hide) count++;
    }
    for (const [key, entry] of this.unavailableGroups) entry.root.hidden = !groups.has(key);
    this.unavailableRoot.hidden = ![...groups.keys()].some((key) => !key.startsWith('more-'));
    this.moreTools.hidden = expert || searching || !this.tools.some((t) => !t.card.hidden && !commonConstructTool(t));
    for (const { root, grid } of [...this.categoryNodes, ...this.specialistNodes]) {
      const hide = !Array.from(grid.children).some((card) => !card.hidden);
      if (root.hidden !== hide) root.hidden = hide;
    }
    this.empty.hidden = count !== 0;
    this.count.textContent = `${count} tools found`;
    this.syncRecent();
  }
}
export function mountConstructGallery(doc, context) {
  if (doc.getElementById('construct-gallery-home')) return null;
  return new ConstructGallery(doc, context);
}
