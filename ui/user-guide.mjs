// SPDX-License-Identifier: GPL-3.0-only
// Bundled offline help. Opening help never changes the mathematical document.
const topic=(id,title,where,keywords,paragraphs)=>({id,title,where,keywords,paragraphs});
export const GUIDE_TOPICS=[
  topic('start','Getting started','Library, Inspector, and the two viewports','new open save guide quick start',[
    'Choose a model from the Library, or open your own OFF, JSON or native project. The base view shows your source model. The derived view shows a section, dual, net or another analysis of that source.',
    'Open Inspector to find Analysis, Construct and Evidence. Additional tabs appear for supported operations. A disabled action usually requires a different source dimension or a supported geometry domain.',
    'Use native projects to retain documents, notes, history, annotations and display settings. A geometry export carries fewer kinds of information; the export dialog reports losses.',
    'Press F1 while a control has focus to open its topic. Search this guide using words such as sphere, face texture, net, expression or morph.'
  ]),
  topic('library','Library and catalog search','Left Library panel','catalog family counts stewart uniform regular johnson miratope',[
    'Search names, aliases, symbols and counts together. For example, dim:4 v>=24 c:8 finds 4D entries with at least 24 vertices and eight cells. Quote a phrase to search it together. Use the dimension buttons and family selector to narrow the list.',
    'Only the first 250 matches are displayed; refining your search still searches every indexed entry. Unknown count properties do not match numeric filters.',
    'Link a local OFF folder to browse your own files without copying or altering them. Unsupported files keep their diagnostic. Discovery entries retain their source classification status; a catalog listing alone does not establish uniformity.',
    'Stewart toroids include five named excavations and two explicitly original variants. Their source parts, ordinary faces and actual genera are checked on load.',
    'The Exact regular source family offers integer-coordinate tetrahedron, cube and octahedron choices for exact symmetry faceting. Their full/proper groups are 24/12, 48/24 and 48/24. They are alternate realizations; existing regular generators retain their own coordinates.'
  ]),
  topic('projects','Projects, history and recovery','File menu and document tabs','save open undo redo replay branch metadata notes recover autosave',[
    'A native project contains multiple documents. Each document has its own source, history and view. Undo and Redo move through that document; editing an earlier step can create a new branch.',
    'Replay repeats recorded constructions from their saved parameters. Preview results are adopted explicitly. Cancel stops pending work; a late result must not replace a changed source.',
    'Save writes the native project and retains a prior-file backup. Recovery offers autosaved work after an interrupted session. Project metadata stores title, author, references and additional fields; notes are saved per state.'
  ]),
  topic('expressions','Expressions and physical units','Numeric fields and Analysis → Units','sqrt phi tau trig angles cosd sind diag rational polygon equation',[
    'Numeric fields accept arithmetic, parentheses, roots, constants and supported functions. Try sqrt(5)/2, cosd(60), phi or diag(5/2). Use commas between coordinates in a vector.',
    'Polygon fields interpret n/d as a regular polygon symbol. In an ordinary scalar field, / is division. Product and division have equal precedence; group a denominator with parentheses when necessary.',
    'Changing coordinate units changes their interpretation, not the vertex coordinates. Net paper size and export scale use physical millimeters. The selected model units and edge scale determine those dimensions.'
  ]),
  topic('views','Cameras, projection and multiple views','Viewport controls and Multiple views','rotate 4d orthographic perspective stereographic fit stereo camera anaglyph',[
    'Orbit the 3D camera separately from the six 4D rotation planes. Orthographic, perspective and stereographic projection are display choices; they do not change intrinsic coordinates, lengths or incidence.',
    'Entity-first orientation aligns the selected vertex, edge, face or cell. Visibility controls can then hide or show entities independently of that orientation.',
    'Multiple views provides one to six independent cameras with linked source selection and a grid PNG export. Stereo offers anaglyph, parallel and cross-eyed views for perspective cameras. Reset camera returns to a fitted view.'
  ]),
  topic('selection','Selection and measurements','Inspector → Analysis','pick identify vertex edge face cell distance angle dihedral circumradius',[
    'Click an entity in the viewport, or choose its kind and source index in Analysis. Repeated net copies share the same source ID. Ambiguous projected selections can be cycled rather than merged.',
    'Measurements use intrinsic geometry rather than projected pixel distances. Affine-flat distance treats the selected objects as infinite flats; bounded distance instead uses vertices, finite edges and qualified convex face or cell regions.',
    'Bounded face and cell measurements report closest points and numerical distance bounds. Concave or star filled regions and unsupported generalized cell interiors receive a diagnostic. Export construction measurements as CSV or JSON with their units.'
  ]),
  topic('appearance','Appearance and materials','Appearance controls','color alpha tint theme phong lights bump reflection refraction surface',[
    'Material presets, highlights, lights and viewport themes affect display. Tint multiplies source face colors; source opacity remains meaningful. Vertex spheres, edge cylinders and Geomag presentation use the source geometry.',
    'Procedural bump and studio reflection/refraction can be enabled separately. Refraction samples the studio environment using a refractive index from 1 to 3; it does not model ray paths through object thickness.',
    'Image capture waits for owned material and content assets. Keep the source and view unchanged while capture is prepared.'
  ]),
  topic('sections','Sections and vertex figures','Derived view and exact surface-section controls','slice plane normal offset rational winding tangent convex section',[
    'Set a section plane normal and offset to slice intrinsic geometry. Event stepping moves through vertex levels. Empty and tangent intersections are valid results, with their type reported.',
    'Exact rational 3D surface sections retain rational edge intersections and ordered concave/star winding evidence. Their display coordinates remain approximate. Coplanar source faces are handled explicitly.',
    'A local vertex figure describes the incident neighborhood. The 4D construction matcher checks it against finite supported candidates and reports ambiguous matches; it is not a universal completion solver.'
  ]),
  topic('construction','Constructions and source domains','Inspector → Construct','hull dual reciprocal truncate rectify mirror scale transform coxeter wythoff',[
    'Choose a construction appropriate to the source dimension and interpretation. A convex hull intentionally changes the boundary. Other source-preserving operations retain literal incidence and refuse domains they cannot handle.',
    'Convex polar duals and 3D/4D source-incidence duals have different domains. Reciprocal constructions require a center and radius; planes through the center can make a finite reciprocal impossible.',
    'Generators include regular/Wythoff models, prisms, antiprisms, polygon products, Waterman models and specialized families. Their parameter limits and refusal messages are part of the operation.'
  ]),
  topic('sphere','Project onto a sphere','Inspector → Construct → Project vertices onto sphere','sphere project radial radius center xyz xyzw',[
    'Enter a center in XYZ or XYZW coordinates and a positive radius, or leave either field empty. The default center is the mean source vertex position; the default radius is the mean source distance from that center.',
    'Vertices move along their existing rays to the sphere. Source edges, ordered faces, cells, colors, units and element content stay associated with the same owners.',
    'A vertex at the center, collapsed geometry, or a newly nonplanar face/cell prevents adoption. Explicitly subdivide a face before projecting if necessary. Projection does not establish regularity; convex results receive separate supporting-facet checks.'
  ]),
  topic('truncation','Incidence truncation and quasitruncation','Inspector → Construct → Source-incidence cuts','truncate quasi midpoint rectify cut amount regular star',[
    'Source-incidence cuts use a closed intrinsic 3D boundary and its ordered vertex links. Choose a manual amount, regular-face normal cut, quasitruncation or midpoint rectification. Preview first, then Adopt.',
    'Quasitruncation retains the resulting star face cycles. A closed incidence result does not by itself establish a filled-solid volume.',
    'The source maps, chosen cut and color policy are recorded in history. Planar caps and a valid source neighborhood are required.'
  ]),
  topic('expansion','Expansion and geometric fitting','Inspector → Construct','runcination expand regular face equal edge area near miss fit solver',[
    'Expansion/runcination is available for supported closed convex 3D and 4D sources. Ratio and radius determine the expanded incidence; the operation retains a reproducible recipe.',
    'Fit geometric conditions can target regular faces, equal edges or equal face areas. Inspect convergence and residuals before adopting. A valid geometry with unmet targets is explicitly a near miss.',
    'Fitting preserves the source incidence. Nonplanarity, collapsed rank, unsupported geometry or failed supporting facets prevent adoption. Equalities within numerical tolerance are not exact regularity certificates.'
  ]),
  topic('augmentation','Augmentation, excavation and placement','Inspector → Construct → Attachment or placement','attach drill pyramid cupola face matching memory addition compound',[
    'Augmentation attaches a chosen model at matching ordered source faces. Orientation, scale, face choice and coincidence policy determine the seam; Preview shows the proposed result before adoption.',
    'Excavation removes matched face pairs and retains the remaining source boundary within supported domains. Drilling follows supported additional coincidences. These operations do not provide arbitrary solid Boolean subtraction.',
    'Placing models on faces or vertices creates positioned instances. Those instances need not share edges with the base. Source owners, components and color policies remain explicit.'
  ]),
  topic('specialized','Specialized generators','Inspector → Construct','tetrahedron triangular prism grid stephanoid noble torus segmentotope spring zonohedron geodesic',[
    'Create an edge-defined tetrahedron from six lengths, an irregular triangular prism from three base lengths, height and shear, or a triangular grid from a frequency and edge length.',
    'Other controls create cupolae, noble candidates, grounded stephanoids, tori, segmentotopes, zonohedra, subdivisions and geodesic geometry. Rational polygon symbols retain their winding interpretation.',
    'Spring relaxation reports constraints, convergence and residuals. Unsupported or invalid realizations are refused. A generated model is not automatically classified as uniform or scaliform.'
  ]),
  topic('faceting','Stellation and automatic faceting','Stellation, cell diagrams and Automatic facets','tidy spiky plane diagram enumerate facet symmetry cell fill cavity',[
    'Stellation uses source facial planes and selectable regions. Cell diagrams show actual shared-facet relationships, support/layer selection and conservative cavity filling. Uncertain regions remain explicit.',
    'Faceting retains source vertices while selecting different ordered face cycles. Automatic search accepts criteria and limits, including supported tidy/spiky, type and per-plane filters. Completion receipts distinguish an exhausted search from a limit or cancellation.',
    'Editable faceting diagrams retain source ownership and can be converted into model incidence. A bounded search does not prove that every possible faceting or stellation has been enumerated.'
  ]),
  topic('nets','Face nets, folding and paper models','Inspector → Nets','tab cut join move rotate pack pages print svg pdf fold paper color rgba batch',[
    'Generate a 2D face net, then cut or join source edges and move connected pieces. The same source face and edge IDs are used by the net, folded preview and printable assembly.',
    'Closed orientable nonconvex/toroidal 3D shells with simple planar concave faces are supported. Their nets also fold through saved animation keyframes, tours and PNG/WebM export. Crossing, nonplanar and unsupported nonmanifold face domains are refused. Folding preserves the source face geometry.',
    'Choose physical edge scale, tabs, numbering and page settings before packing. Tabs can be absent, single or double, with per-edge side choices and a width in millimeters. SVG/PDF export and printing retain the requested dimensions. Review overlap and clipping reports; layouts are not guaranteed collision-free.',
    'Color printing can mix source colors or put one source color on each net/page. Select all paper colors or one source-face batch, and disable color fill when printing on colored paper. Separate mode cuts cross-color hinges in a detached print layout; the editable net keeps its connections. Face text and PNG images still print.'
  ]),
  topic('cell-nets','Whole-cell nets of 4D models','Inspector → Nets on a 4D source','cell net nonconvex complete separate reattach shrink matching face vertex',[
    'A 4D net arranges complete 3D source cells in one 3D view. Generate a joined arrangement or start with separate cells, then cut/join at a source face and move or reattach a cell with its descendants.',
    'Globally nonconvex closed orientable 4D shells can include complete ordinary convex or concave 3D cell boundaries and simple planar concave faces. Coplanar shared-face hinges are supported. Source cycles and distances remain intact.',
    'Highlight matching source faces or every copy of a vertex. Surface shrink is a display choice; it does not resize mathematical cells. Save retains layout and edit history. Intersections between arranged cells are ignored.'
  ]),
  topic('content','Element text, labels and face images','Inspector → Element content','annotation png texture markup source id length automatic text label',[
    'Attach formatted text to a vertex, edge, face or cell, or a literal PNG image to an eligible face. Placement and source ownership are saved in the native project.',
    'Automatic labels can show source IDs, coordinates, lengths or incidence. Existing manual labels and PNG content are preserved by default. Repeated net/explosion instances use the same source owner.',
    'Physical net labels and face images use the net scale. Unsupported transfers or poses are refused rather than guessing a new owner. Wait for image decoding before capturing a view.'
  ]),
  topic('animation','Animation, dual morphs and tours','Animation and Dual morph controls','keyframe time video png capture rotation explosion fold snub sizing tilt',[
    'Animate rotations, supported explosions, section depth and folding using time-based tracks. Keyframes and tours retain reproducible camera/view states.',
    'Eight scoped 3D dual-morph methods include sizing, truncation, augmentation, expansion and four tilting methods. Sizing and expansion also support finite closed ordinary star/nonconvex 3D boundaries, including the four regular stars. Generalized 4D expansion retains actual source/polar product cells and finite star winding. Each method reports its own source domain and transitions.',
    'PNG/video export prepares the required assets and supports cancellation. Unsupported combinations receive a diagnostic. A smooth display animation does not establish continuous mathematical equivalence outside its declared domain.'
  ]),
  topic('exports','Exporting and sharing','File → Export, Capture image and Print','off 4off obj stl pov vrml dxf json csv pdf svg png',[
    'Use native projects for editable work. OFF/4OFF and JSON carry geometry; format-specific exports such as OBJ, STL, VRML, DXF or POV-Ray have dimension and interpretation limits.',
    'The export dialog reports information a format cannot carry. JSON retains project metadata and notes. Exporting a visual projection is different from exporting intrinsic 4D geometry.',
    'PNG capture renders the current prepared view. Packed nets export physical SVG/PDF pages. Attach the native project and a reproducible description when reporting a bug.'
  ]),
  topic('numeric','Numerical evidence and unsupported domains','Inspector → Evidence','exact rational float tolerance certified validation generalized manifold',[
    'Ordinary coordinates and measurements use approximate float64 predicates. Validation means the reported checks passed for the supplied interpretation; it does not certify every mathematical property.',
    'Exact rational hull/dual and surface-section workflows carry evidence about supplied rational coordinates. The viewport still uses approximate display values; decimal input does not recover intended radicals.',
    'Generalized objects retain their literal ordered incidence. They need not satisfy convex topology. A refusal identifies a limit of the selected operation; constructing a hull is an explicit change of geometry.'
  ])
];

const CONTEXT=[['sphere-project','sphere'],['incidence-dual','construction'],['make-incidence-dual','construction'],['incidence-','truncation'],['cell-net','cell-nets'],['net-','nets'],['reinforcement','nets'],['element-','content'],['source-label','content'],['dual-morph','animation'],['tour','animation'],['animation','animation'],['material-','appearance'],['surface-','appearance'],['appearance','appearance'],['multiple-views','views'],['perspective','views'],['stereo','views'],['library','library'],['search','library'],['catalog','library'],['measurement','selection'],['selection','selection'],['units','expressions'],['expression','expressions'],['exact-section','sections'],['section','sections'],['vertex-figure','sections'],['expand','expansion'],['fitting','expansion'],['augmentation','augmentation'],['face-placement','augmentation'],['automatic-facet','faceting'],['faceting','faceting'],['stellation','faceting'],['basic-solid','specialized'],['stephanoid','specialized'],['project-metadata','projects'],['rational','numeric']];
export function guideContext(element){
  for(let node=element;node;node=node.parentElement){const id=node.id||'';const found=CONTEXT.find(([prefix])=>id.startsWith(prefix));if(found)return found[1];}
  return 'start';
}
export function searchGuide(query,topics=GUIDE_TOPICS){
  const words=String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return topics.filter(t=>{const text=[t.title,t.where,t.keywords,...t.paragraphs].join(' ').normalize('NFKC').toLocaleLowerCase();return words.every(w=>text.includes(w));});
}
export class UserGuide{
  constructor(dialog){
    this.dialog=dialog;this.current='start';this.previousFocus=null;
    const create=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};this.create=create;
    const heading=dialog.querySelector('.dialog-heading');dialog.replaceChildren(heading);
    const label=create('label','Search the offline guide');this.search=create('input');this.search.id='help-search';this.search.type='search';this.search.maxLength=256;this.search.placeholder='Sphere, net, expressions…';label.append(this.search);
    this.count=create('p',null,'muted');this.count.id='help-result-count';this.count.setAttribute('aria-live','polite');
    const body=create('div',null,'guide-layout');this.list=create('nav');this.list.setAttribute('aria-label','Guide topics');this.article=create('article');this.article.id='help-topic';
    body.append(this.list,this.article);dialog.append(label,this.count,body);this.search.oninput=()=>this.render();
    dialog.addEventListener('close',()=>{if(this.previousFocus?.isConnected)this.previousFocus.focus();});
    // Also handle renderer-delivered F1 (including embedded/automated windows).
    document.addEventListener('keydown',event=>{if(event.key==='F1'&&!event.repeat){event.preventDefault();this.show();}});this.render();
  }
  show(){if(this.dialog.open){this.search.focus();return;}this.previousFocus=document.activeElement;this.current=guideContext(this.previousFocus);this.search.value='';this.render();this.dialog.showModal();this.search.focus();}
  render(){
    const matches=searchGuide(this.search.value);this.count.textContent=matches.length+' matching topics';this.list.replaceChildren();
    if(!matches.some(t=>t.id===this.current))this.current=matches[0]?.id??null;
    for(const t of matches){const button=this.create('button',t.title);button.type='button';button.dataset.topic=t.id;button.setAttribute('aria-current',String(t.id===this.current));button.onclick=()=>{this.current=t.id;this.render();this.list.querySelector(`[data-topic="${t.id}"]`)?.focus();};this.list.append(button);}
    this.article.replaceChildren();const t=matches.find(t=>t.id===this.current);
    if(!t){this.article.append(this.create('p','No topics match. Try a shorter phrase or clear the search.'));return;}
    this.article.append(this.create('h3',t.title),this.create('p',t.where,'guide-location'),...t.paragraphs.map(p=>this.create('p',p)));
  }
}
