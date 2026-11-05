import {guideContext} from './user-guide.mjs';

const categories=['Change this shape','Make it regular','Stars & facets','Combine','Create a new shape','Expert'];
const tool=(id,name,description,category,keywords='',primary='',dimensions=null)=>({id,name,description,category,keywords,primary,dimensions});
export const CONSTRUCT_TOOLS=[
  tool('gallery-dual','Swap faces and corners','Construct a polar dual of this shape.',0,'dual polar reciprocal incidence','make-dual',[2,3,4]),
  tool('gallery-truncate','Cut corners','Cut along edges, or meet at their midpoints.',0,'truncate truncation rectify rectification bevel','truncate',[2,3,4]),
  tool('incidence-truncation-settings','Cut star corners','Preview cuts that preserve the ordered face connections.',0,'incidence truncate rectify truncation rectification quasitruncation','preview-incidence-cut',[3,4]),
  tool('expansion-settings','Expand the shape','Separate faces and fill the gaps with new faces.',0,'expand runcinate runcination cantellate','make-expansion',[3,4]),
  tool('face-conway-settings','Reshape faces','Use Conway operations and add directional zones.',0,'kis subdivide conway zonohedron','conway-apply',[3]),
  tool('augmentation-settings','Attach a shape','Join two matching faces to add a new piece.',0,'augment augmentation attach glue','attach-faces',[3]),
  tool('face-placement-settings','Place a shape on a face','Align another shape with a chosen face.',0,'excavate augmentation attach placement','place-at-faces',[3]),
  tool('face-surgery-settings','Build on faces','Add or remove pyramids, cupolas and other pieces.',0,'augmentation excavation surgery diminish','apply-face-surgery',[3]),
  tool('face-editing-settings','Edit faces','Inspect overlapping faces, remove pairs or blend them.',0,'coincidence weld blend union holes','coincidence-analyze'),
  tool('transform-model-settings','Resize, reflect or extrude','Change size, make a mirror image or add a dimension.',0,'scale mirror extrusion prism transform','scale'),
  tool('subdivision-settings','Divide edges','Add smaller segments to the existing edges.',0,'subdivision subdivide','subdivide-edges',[3]),
  tool('geodesic-settings','Make a geodesic','Divide triangular faces and project onto a sphere.',0,'triangular geodesic subdivide sphere','make-geodesic',[3]),
  tool('fitting-settings','Make faces regular','Fit geometric targets and inspect the remaining error.',1,'fitting fit equal edges planar equal areas solver','make-faces-regular',[3,4]),
  tool('spring-settings','Relax with springs','Adjust vertices toward chosen lengths and constraints.',1,'spring relaxation optimize fit','preview-spring',[3]),
  tool('sphere-projection-settings','Move vertices to a sphere','Project onto a common sphere with a chosen center.',1,'sphere spherical projection','sphere-project-apply',[3,4]),
  tool('faceting-diagram-settings','Draw new faces','Build faces from a faceting diagram.',2,'faceting diagram star polygon','faceting-diagram-build',[3]),
  tool('automatic-faceting-settings','Find new faces','Search a bounded set of faces on the existing vertices.',2,'automatic faceting facets tidy spiky','faceting-candidates',[3]),
  tool('stellation-plane-settings','Extend face planes','Explore regions made by the extended face planes.',2,'stellate stellation planes regions diagram miller','stellation-evaluate',[3]),
  tool('stellation-cell-settings','Choose star regions','Select stellation cells and build their boundary.',2,'stellation cells miller stars','',[3]),
  tool('gallery-facets','Enter face boundaries','Define ordered face cycles on the current vertices.',2,'manual faceting facets cycles star','facet',[3]),
  tool('add-dual-controls','Add the dual','Keep this shape and add its dual as a second component.',3,'compound reciprocation polar','add-dual',[3,4]),
  tool('blending-controls','Merge components','Combine component interiors or try an equal-edge variant.',3,'merge compound blending union pseudo uniform','merge-compound',[3]),
  tool('compound-controls','Choose a component','Keep or delete a part of a compound.',3,'compound extract drop component','compound-extract'),
  tool('uniform-compound-settings','Make a uniform compound','Arrange repeated copies using supported symmetry families.',3,'uniform compound copies symmetry'),
  tool('gallery-generator','Prisms, polygons & blocks','Create a basic shape in a new document.',4,'generator duoprism pyramid waterman cube','generate'),
  tool('basic-solid-settings','Build a basic solid','Create a block, tetrahedron, triangular prism or grid.',4,'cuboid edges grid irregular','basic-generate'),
  tool('wythoff-model-settings','Build with reflections','Choose a Coxeter family and generate a reflection orbit.',4,'wythoff coxeter rings symmetry uniform','wythoff'),
  tool('hull-model-settings','Wrap a set of points','Build the convex hull of supplied coordinates.',4,'point cloud hull convex','build-hull'),
  tool('cupola-settings','Cupolas & rotundas','Build domes, belts and related polygonal solids.',4,'cupola rotunda bicupola'),
  tool('star-polygon-settings','Draw a star polygon','Choose the number of corners and the step between them.',4,'star polygon schlafli winding'),
  tool('product-settings','Combine two polygons','Build polygon products or a prism from a polygon.',4,'product duoprism cartesian prism'),
  tool('antiprism-settings','Make an antiprism','Join offset polygons or construct an antiduoprism.',4,'antiprism antiduoprism'),
  tool('step-prism-settings','Make a stepped prism','Create step-connected polygon layers.',4,'step prism'),
  tool('torus-settings','Build a torus','Create a ring-shaped surface from polygon cycles.',4,'torus toroid ring'),
  tool('waterman-settings','Grow a lattice hull','Build a Waterman shape from lattice points.',4,'waterman fcc lattice'),
  tool('uniform-family-settings','Uniform prisms','Create equal-edge prism and antiprism families.',4,'uniform prism duoprism antiprism'),
  tool('podia-settings','Build polygon layers','Create podia and antipodia from repeated layers.',4,'podia antipodia'),
  tool('layer-join-settings','Join polygon layers','Connect layers into a new shape.',4,'layer join blend','make-layer-join',[3]),
  tool('crossed-segmentotope-settings','Cross segment layers','Build a segmentotope from crossed polygon layers.',4,'crossed segmentotope zonotope'),
  tool('noble-settings','Noble shapes','Build supported shapes with equivalent faces and corners.',4,'noble isohedral isogonal'),
  tool('stephanoid-settings','Build a crown','Create a stephanoid from a repeating polygon belt.',4,'stephanoid crown'),
  tool('vertex-figure-construction-settings','Build from a corner shape','Construct supported shapes from a vertex figure.',4,'vertex figure uniform scaliform','vertex-figure-search',[3]),
  tool('shape-builder','Shape builder','Explore shapes through a visual Coxeter diagram.',4,'coxeter wythoff diagram builder'),
  tool('projective-dual-settings','View an infinite dual','Inspect a clipped reciprocal view with points at infinity.',5,'projective infinite dual','projective-dual-apply',[3]),
  tool('coincidic-regiment-settings','Compare 4D arrangements','Compare supported literal cell arrangements.',5,'coincidic regiment comparison','',[4]),
  tool('convex-core-settings','Find the inner core','Intersect supporting half-spaces around a chosen center.',5,'convex core','make-convex-core',[3,4]),
  tool('source-zonohedron-settings','Build from directions','Construct a zonohedron using selected source directions.',5,'source zonohedron zonotope','make-source-zonohedron',[3]),
  tool('exact-section-settings','Cut with rational coordinates','Compute a certified section in the supported rational domain.',5,'exact rational surface section','',[3]),
  tool('expression-settings','Calculate an expression','Evaluate a numeric expression without changing the shape.',5,'expression calculator rational','evaluate'),
];
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function matchesConstructTool(tool,query){const text=normalize([tool.name,tool.description,tool.keywords,tool.technical,categories[tool.category]].join(' '));return normalize(query).split(/\s+/).every(word=>text.includes(word));}
export function recentConstructTools(previous,id,allowed){return [id,...previous.filter(item=>item!==id)].filter(item=>allowed.has(item)).slice(0,4);}
export function readConstructRecent(storage,allowed){try{const value=JSON.parse(storage?.getItem('polytope.construct.recent')??'[]');return Array.isArray(value)?[...new Set(value.filter(id=>typeof id==='string'&&allowed.has(id)))].slice(0,4):[];}catch{return [];}}
export function constructToolReason(tool,model,action){
  if(tool.dimensions&&!tool.dimensions.includes(model?.dimension))return model?`Choose a ${tool.dimensions.join('D or ')}D model for this tool.`:'Open a model first.';
  if(action?.disabled||action?.matches?.(':disabled'))return action.dataset?.disabledReason||action.getAttribute?.('aria-description')||action.title||'Unavailable for the current model or workspace state.';
  return '';
}
const glyphs=[
  'M4 8 12 3 20 8 20 17 12 22 4 17ZM4 8 12 13 20 8M12 13V22',
  'M5 18 8 6 16 6 19 18ZM8 6 12 2 16 6M5 18H19',
  'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  'M3 7h11v11H3ZM10 3h11v11h-7M10 3v4',
  'M4 18 12 3 20 18ZM4 18H20M12 3v15',
  'M4 5h16M4 12h16M4 19h16M9 3v4M15 10v4M9 17v4',
];
const shells=new Set(['create-model-settings','advanced-construction-settings','fit-refine-controls','facet-stellate-controls']);
const ownSummary=node=>Array.from(node.children).find(child=>child.tagName==='SUMMARY');
const heading=node=>node.classList.contains('panel-title')||node.classList.contains('rule');
export class ConstructGallery{
  constructor(doc,{getModel=()=>null,guide,window:win=doc.defaultView,storage}={}){
    this.doc=doc;this.win=win;this.getModel=getModel;this.guide=guide;this.panel=doc.getElementById('construct-panel');this.tools=[];this.active=null;
    try{this.storage=storage??win?.localStorage;}catch{}
    const create=this.create=(tag,text,cls)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
    this.panel.classList.add('construct-gallery');
    this.sources=create('div',null,'construct-tool-host');this.sources.append(...Array.from(this.panel.children));this.panel.append(this.sources);
    this.wrapLegacy('gallery-dual',['make-dual','dual-options-settings']);
    const cut=doc.getElementById('truncation');this.wrapLegacy('gallery-truncate',[cut?.closest('label'),doc.getElementById('truncate')]);
    const createRoot=doc.getElementById('create-model-settings');
    if(createRoot){const loose=Array.from(createRoot.children).filter(node=>node.tagName!=='SUMMARY'&&node.tagName!=='DETAILS'&&!heading(node));this.wrapLegacy('gallery-generator',loose);}
    const facets=doc.getElementById('facet-cycles');
    if(facets){const nodes=[];for(let node=facets;node&&!node.id?.endsWith('-settings');node=node.nextElementSibling)nodes.push(node);this.wrapLegacy('gallery-facets',nodes);}
    this.overview=create('div');this.overview.id='construct-gallery-home';
    const intro=create('p','What would you like to make?','construct-gallery-intro'),label=create('label','Find a tool','sr-only');label.htmlFor='construct-tool-search';
    this.search=create('input');this.search.id='construct-tool-search';this.search.type='search';this.search.placeholder='Find a tool…';this.search.setAttribute('aria-controls','construct-tool-categories');this.search.autocomplete='off';
    this.recentRoot=create('section',null,'construct-recent');this.recentRoot.id='construct-recent';this.recentRoot.setAttribute('aria-label','Recent tools');
    this.categoryRoot=create('div');this.categoryRoot.id='construct-tool-categories';this.categoryNodes=categories.map((name,i)=>{const root=create('section',null,'construct-category');root.setAttribute('aria-label',name);if(i===5)root.setAttribute('data-expert','');const title=create('h3',name),grid=create('div',null,'construct-card-grid');root.append(title,grid);this.categoryRoot.append(root);return {root,grid};});
    this.empty=create('p','No tools match. Try “corners”, “dual” or “prism”.','muted');this.empty.hidden=true;this.empty.setAttribute('role','status');
    this.count=create('p',null,'sr-only');this.count.setAttribute('aria-live','polite');
    this.overview.append(intro,label,this.search,this.recentRoot,this.categoryRoot,this.empty,this.count);
    this.scan(this.sources);
    const builder={...CONSTRUCT_TOOLS.find(t=>t.id==='shape-builder'),external:true};this.addTool(builder);
    this.allowed=new Set(this.tools.map(t=>t.id));this.recent=readConstructRecent(this.storage,this.allowed);
    this.panel.append(this.overview,this.sources);this.search.addEventListener('input',()=>this.sync());
    this.search.addEventListener('keydown',event=>{if(event.key==='Escape'){this.search.value='';this.sync();}if(event.key==='ArrowDown'){const card=this.tools.find(t=>!t.card.hidden&&!t.card.disabled&&!t.external);if(card){event.preventDefault();card.card.focus();}}});
    this.panel.addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft'&&this.active){event.preventDefault();this.back();}});
    doc.querySelector('[data-panel="construct"]')?.addEventListener('click',()=>this.sync());
    if(win){win.openConstructTool=(target,options)=>this.open(target,options);win.addEventListener?.('construct-tools-changed',()=>this.sync());}
    const Observer=win?.MutationObserver;
    if(Observer){this.observer=new Observer(()=>this.sync());this.observer.observe(this.sources,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','title','data-disabled-reason']});}
    this.sync();
  }
  wrapLegacy(id,ids){const nodes=ids.map(item=>typeof item==='string'?this.doc.getElementById(item):item).filter(Boolean);if(!nodes.length)return;const root=this.create('section');root.id=id;nodes[0].before(root);root.append(...nodes);}
  scan(container){
    let previous=null;
    for(const node of Array.from(container.children)){
      if(heading(node)||node.tagName==='SUMMARY'){node.classList.add('construct-source-heading');continue;}
      if(shells.has(node.id)||node.classList.contains('inspector-card')&&!node.id){node.classList.add('construct-source-shell');if(node.tagName==='DETAILS')node.open=true;this.scan(node);continue;}
      if(!node.querySelector('button,input,select,textarea')){if(previous)(previous.more??previous.root).append(node);continue;}
      const summary=ownSummary(node),technical=(summary?.textContent||node.querySelector('.panel-title')?.textContent||node.id.replace(/-(settings|controls)$/,'').replaceAll('-',' ')).trim();
      const known=CONSTRUCT_TOOLS.find(tool=>tool.id===node.id),meta=known??tool(node.id||'gallery-tool-'+this.tools.length,technical,'Explore the existing '+technical.toLocaleLowerCase()+' controls.',5,technical);
      this.addTool({...meta,technical,root:node});
      previous=this.tools.at(-1);
    }
  }
  addTool(meta){
    const c=this.create,t={...meta};this.tools.push(t);
    t.card=c('button',null,'construct-tool-card');t.card.id='construct-card-'+t.id;t.card.type='button';t.card.setAttribute('aria-label',t.name);t.card.dataset.constructTarget=t.id;if(t.category===5)t.card.setAttribute('data-expert','');
    const svg=this.doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=this.doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',glyphs[t.category]);svg.append(path);
    const copy=c('span',null,'construct-card-copy');t.reason=c('small',null,'construct-card-reason');copy.append(c('strong',t.name),c('span',t.description),t.reason);t.card.append(svg,copy);t.card.onclick=()=>this.open(t.id);this.categoryNodes[t.category].grid.append(t.card);
    if(!t.root)return;
    t.pane=c('section',null,'construct-tool-pane');t.pane.dataset.constructTool=t.id;t.pane.dataset.constructName=t.name;t.pane.dataset.constructKeywords=t.keywords;t.pane.id='construct-pane-'+t.id;t.pane.hidden=true;t.pane.setAttribute('aria-labelledby','construct-title-'+t.id);
    const header=c('div',null,'construct-pane-header'),back=c('button','← All tools','construct-back');back.type='button';back.id='construct-back-'+t.id;back.onclick=()=>this.back();
    t.title=c('h3',t.name);t.title.id='construct-title-'+t.id;t.title.tabIndex=-1;
    const help=c('button','?','group-help construct-pane-help');help.type='button';help.setAttribute('aria-label','Help for '+t.name);help.title='Guide: '+t.technical;help.onclick=()=>this.guide?.show(guideContext(t.root));
    header.append(back,help,t.title);t.pane.append(header,c('p',t.description,'construct-pane-description'));
    t.root.before(t.pane);t.pane.append(t.root);const summary=ownSummary(t.root);if(summary){summary.classList.add('construct-tool-summary');t.root.open=true;}
    t.root.classList.add('construct-tool-controls');
    for(const node of Array.from(t.root.children))if(heading(node))node.classList.add('construct-source-heading');
    t.action=(t.primary&&this.doc.getElementById(t.primary))||t.root.querySelector('button:not(.group-help)');t.action?.classList.add('construct-primary');
    const options=Array.from(t.root.children).filter(node=>node.tagName==='DETAILS');
    if(options.length===1){t.more=options[0];t.more.classList.add('construct-more-options');const summary=ownSummary(t.more);if(summary){summary.title=summary.textContent;summary.textContent='More options';}}
    else if(options.length){const more=c('details',null,'construct-more-options'),summary=c('summary','More options');more.append(summary);options[0].before(more);more.append(...options);t.more=more;}
  }
  find(target){if(!target)return null;const node=typeof target==='string'?this.doc.getElementById(target):target;return this.tools.find(t=>t.id===target||t.root===node||t.root?.contains(node)||t.pane===node||t.card===node)||this.tools.find(t=>node?.contains(t.pane));}
  open(target,{focus=true}={}){
    const t=this.find(target);if(!t)return false;
    if(t.external){if(typeof this.win?.openCoxeterBuilder!=='function')return false;this.remember(t.id);this.win.openCoxeterBuilder();return true;}
    this.active=t;this.overview.hidden=true;for(const item of this.tools)if(item.pane)item.pane.hidden=item!==t;
    for(let node=t.root;node&&node!==this.panel;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    const element=typeof target==='string'?this.doc.getElementById(target):target;
    if(t.root.contains(element))for(let node=element;node&&node!==t.root;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    this.doc.querySelector('[data-panel="construct"]')?.click();
    if(this.doc.body.classList.contains('inspector-hidden'))this.doc.getElementById('toggle-inspector')?.click();
    this.remember(t.id);if(focus)t.title.focus({preventScroll:true});return true;
  }
  remember(id){this.recent=recentConstructTools(this.recent,id,this.allowed);try{this.storage?.setItem('polytope.construct.recent',JSON.stringify(this.recent));}catch{}this.syncRecent();}
  back(){const previous=this.active;this.active=null;for(const t of this.tools)if(t.pane)t.pane.hidden=true;this.overview.hidden=false;this.sync();if(previous&&!previous.card.hidden&&!previous.card.disabled&&previous.category!==5)previous.card.focus({preventScroll:true});else this.search.focus({preventScroll:true});}
  syncRecent(){
    this.recentRoot.replaceChildren();const ids=this.recent.filter(id=>{const t=this.tools.find(t=>t.id===id);return t&&!t.card.hidden;});this.recentRoot.hidden=!ids.length||!!this.search.value;
    if(!ids.length)return;this.recentRoot.append(this.create('h3','Recent'));const row=this.create('div',null,'construct-recent-row');
    for(const id of ids){const t=this.tools.find(t=>t.id===id),button=this.create('button',t.name);button.type='button';button.disabled=t.card.disabled;button.title=t.card.title;if(t.category===5)button.setAttribute('data-expert','');button.onclick=()=>this.open(id);row.append(button);}this.recentRoot.append(row);
  }
  sync(){
    let count=0;for(const t of this.tools){const absent=t.external&&typeof this.win?.openCoxeterBuilder!=='function';const hide=absent||!matchesConstructTool(t,this.search.value);if(t.card.hidden!==hide)t.card.hidden=hide;const reason=constructToolReason(t,this.getModel(),t.action),title=reason||t.description;if(t.card.disabled!==!!reason)t.card.disabled=!!reason;if(t.card.title!==title)t.card.title=title;if(t.reason.textContent!==reason)t.reason.textContent=reason;if(t.reason.hidden!==!reason)t.reason.hidden=!reason;if(!t.card.hidden)count++;}
    for(const {root,grid} of this.categoryNodes){const hide=!Array.from(grid.children).some(card=>!card.hidden);if(root.hidden!==hide)root.hidden=hide;}
    this.empty.hidden=count!==0;this.count.textContent=`${count} tools found`;this.syncRecent();
  }
}
export function mountConstructGallery(doc,context){if(doc.getElementById('construct-gallery-home'))return null;return new ConstructGallery(doc,context);}
