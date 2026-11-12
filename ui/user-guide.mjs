// SPDX-License-Identifier: GPL-3.0-only
// Bundled offline help. Opening help never changes the mathematical document.
import { GUIDE_REFERENCES } from './guide-reference-index.mjs';
import { GUIDE_GOALS, refreshGuideTopics, NEW_GROUP_GUIDE_TOPICS } from './guide-refresh.mjs';
import { shortcutTable } from './shortcut-bindings.mjs';
import { FEATURE_ACTION_INDEX } from './guide-action-index.mjs';
import { GUIDE_CONTROLS } from './guide-control-index.mjs';
import { revealCommand } from './command-index.mjs';
const topic = (id, title, where, keywords, paragraphs) => ({ id, title, where, keywords, paragraphs });
export const GUIDE_TOPICS = refreshGuideTopics([
  topic(
    'discover',
    'Finding tools and shortcuts',
    'Header → Search commands',
    'command palette ctrl k ctrl shift p fuzzy help shortcuts',
    [
      'Press Ctrl+K or Ctrl+Shift+P to search actions, inspector fields, view choices, every indexed Library model and Guide topics. The palette searches tool names and their location paths. Arrow keys choose a result; Enter runs a button or focuses an editable field. Escape closes the palette.',
      'Choosing an inspector result opens Inspector, selects its tab, expands its containing groups and highlights the control. Disabled results show the available explanation. File actions use their usual dialogs and confirmations.',
      'Press ? outside a text field to see the shortcut sheet. Press F1 on a focused control, or the ? button in a group heading, to open its offline help.',
    ]
  ),
  topic(
    'metadata',
    'Model information',
    'Advanced → Model information; Analysis → Model information',
    'title author description notes references urls tags license source metadata',
    [
      'Edit the title, author, description, references/URLs, comma-separated tags, license and source under Advanced, then Save model information. Analysis shows the saved information read-only. The separate Notes field remains a document-state note.',
      'Information belongs to the current document history state. Save updates that state and marks the project dirty; it does not create a geometry history step. Subsequent constructions and promoted documents inherit the information. Native projects and JSON retain it.',
      'OFF/4OFF exports carry a bounded JSON comment for model information and document notes. Polytope Laboratory restores this comment on import; other OFF readers may discard comments. URLs and license text are stored as plain text and never opened automatically. Additional fields accepts a JSON object; unknown imported fields are retained.',
    ]
  ),
  topic('start', 'Getting started', 'Library, Inspector, and the two viewports', 'new open save guide quick start', [
    'Help → Welcome (also in Search commands) opens the featured gallery, six Show me how walkthroughs and three bundled sample projects. Gallery models and samples open as additional documents. Walkthroughs reveal real controls; use Next, Skip step or Exit tour at any time. Don’t show again is a local preference; Welcome can always be reopened.',
    'Choose a model from the Library, or open your own OFF, JSON or native project. The base view shows your source model. The derived view shows a section, dual, net or another analysis of that source.',
    'Open Inspector for Analysis, Construct, Nets and Advanced. Construct shows a searchable task gallery: Change this shape, Make it regular, Stars & facets, Combine and Create a new shape. Expert contains specialist tools. Analysis shows common measurements first, with more information available on request. A disabled action explains its required source dimension or geometry domain.',
    'Use native projects to retain documents, notes, history, annotations and display settings. A geometry export carries fewer kinds of information; the export dialog reports losses.',
    'Before a model is open, model tools, Save and Export wait for a source. Use New, Open or the Library to begin. Guide and Full screen remain available in the header. The native menu follows the same availability; Undo and Redo become available when the selected history allows them.',
    'Press F1 while a control has focus to open its topic. Search this guide using words such as sphere, face texture, net, expression or morph.',
  ]),
  topic(
    'library',
    'Library and catalog search',
    'Left Library panel',
    'catalog family counts stewart uniform regular johnson miratope',
    [
      'Search names, aliases, symbols and counts together. For example, dim:4 v>=24 c:8 finds 4D entries with at least 24 vertices and eight cells. Quote a phrase to search it together. Use the dimension buttons and family selector to narrow the list.',
      'Only the first 250 matches are displayed; refining your search still searches every indexed entry. Unknown count properties do not match numeric filters.',
      'Opening models are marked in the Library. Repeated clicks on the same pending model open one document; different selections can open separate tabs. The newest selection keeps focus unless you choose a tab or change the active history step while waiting.',
      'Cancel stops pending model loads, including linked OFF files. Opening or recovering a project cancels those loads so a late model cannot enter the replacement project. Animation export also cancels pending loads; new opens wait until the export finishes or is canceled.',
      'Opening or recovering a project during startup takes priority over the default Tesseract. If you cancel the file choice before any model is open, choose a Library model or New to begin.',
      'If startup Library loading is canceled or fails, use Load Library or Retry Library in the left panel. Reloading the catalog restores its choices without opening a default model or replacing your project.',
      'Link a local OFF folder to browse your own files without copying or altering them. Unsupported files keep their diagnostic. Discovery entries retain their source classification status; a catalog listing alone does not establish uniformity.',
      'Stewart toroids include five named excavations and two explicitly original variants. Their source parts, ordinary faces and actual genera are checked on load.',
      'Search U40 reflected for a supplied mirror form, or search a Wythoff symbol. The selected reflected sources distinguish chiral and achiral numerical symmetry. Skilling is a separate exceptional entry; its four-face edges do not define an ordinary solid shell.',
      'The Exact regular source family offers integer-coordinate tetrahedron, cube and octahedron choices for exact symmetry faceting. Their full/proper groups are 24/12, 48/24 and 48/24. They are alternate realizations; existing regular generators retain their own coordinates.',
    ]
  ),
  topic(
    'projects',
    'Projects, history and recovery',
    'File → Recover autosave; viewport shelf → History',
    'save open undo redo replay branch metadata notes recover autosave migration version snapshot',
    [
      'A native project contains multiple documents. Each document has its own source, history and view. Undo and Redo move through that document; editing an earlier step can create a new branch.',
      'Open History and select a state. Replay verifies its recorded source and construction parameters, then opens an independent document. Parameters opens the selected supported operation’s saved inputs; Create branch constructs an independent document. Undo/Redo and the original document remain available.',
      'Projects currently use format version 1. Valid older snapshot-only documents can be inspected and saved, but have no recorded operations to replay or branch. A recorded operation with an unavailable algorithm version or numeric policy keeps its readable snapshot; replay refuses with a diagnostic. An unsupported project format/version is rejected without changing the original file. There is no general automatic migration of future formats or algorithms.',
      'Save writes the native project and retains a prior-file backup. Recovery offers autosaved work after an interrupted session. Advanced → Model information stores title, author, references, tags, license, source and additional fields; Analysis shows the saved information. Notes are saved per state.',
    ]
  ),
  topic(
    'unsupported-domains',
    'Source domains — understand an unavailable action',
    'Disabled control explanation; Advanced → Checks',
    'unsupported unavailable source dimension convex generalized star nonconvex nonmanifold singular tidy-dual migration encoder',
    [
      'Read the disabled control’s explanation or the error Details. A dimension requirement and a boundary requirement are separate: a 3D source can still be outside a convex-only operation’s domain. An unavailable result is not proof that the source is mathematically invalid.',
      'Convex means the boundary encloses a convex region. Generalized incidence retains supplied ordered faces and cells, including stars and intersections; it does not automatically define a filled solid. Nets need their stated ordinary boundary domain. Visible surface (paper model) can construct a checked exterior for supported stars and compounds.',
      'Polar reciprocation can fail when a source plane meets the chosen center, or when distinct source owners would collapse to coincident dual vertices. Tidy-dual search reports an unknown verdict for unsupported or unresolved reciprocal geometry; that is not a proven failed tidiness check.',
      'Choose a supported source or interpretation, adjust only the named parameters, or try another operation. Convex hull creates a different boundary and must be an explicit construction. Reducing a resource limit does not make a partial search complete.',
      'For replay, retain readable snapshots when an algorithm cannot run. For video without an available encoder, choose PNG sequence or GIF. Help → Guide and Ctrl+K remain available to find alternatives.',
    ]
  ),
  topic(
    'expressions',
    'Expressions and physical units',
    'Numeric fields and Analysis → Units',
    'sqrt phi tau trig angles cosd sind diag rational polygon equation',
    [
      'Numeric fields accept arithmetic, parentheses, roots, constants and supported functions. Try sqrt(5)/2, cosd(60), phi or diag(5/2). Use commas between coordinates in a vector.',
      'Polygon fields interpret n/d as a regular polygon symbol. In an ordinary scalar field, / is division. Product and division have equal precedence; group a denominator with parentheses when necessary.',
      'Changing coordinate units changes their interpretation, not the vertex coordinates. Net paper size and export scale use physical millimeters. The selected model units and edge scale determine those dimensions.',
    ]
  ),
  topic(
    'views',
    'Cameras, projection and multiple views',
    'Viewport controls and Multiple views',
    'rotate 4d orthographic perspective stereographic fit stereo camera anaglyph',
    [
      'Orbit the 3D camera separately from the six 4D rotation planes. Orthographic, perspective and stereographic projection are display choices; they do not change intrinsic coordinates, lengths or incidence.',
      'Entity-first orientation aligns the selected vertex, edge, face or cell. Visibility controls can then hide or show entities independently of that orientation.',
      'Multiple views provides one to six independent cameras with linked source selection and a grid PNG export. Stereo offers anaglyph, parallel and cross-eyed views for perspective cameras. Reset camera returns to a fitted view.',
    ]
  ),
  topic(
    'selection',
    'Selection and measurements',
    'Inspector → Analysis',
    'pick identify vertex edge face cell distance angle dihedral circumradius',
    [
      'For vertex distance or a three-vertex angle, choose the kind and enter source indices, then press Measure. Editing either field clears the prior result and cancels its pending check. A fresh click measures the current inputs; changing models discards old feedback.',
      'Element types lists symmetry orbits for vertices, edges, faces and cells. Choose a type button to select the full set. Face type and Cell type coloring use these numerical orbits; polygon side counts do not assert regularity.',
      'Click an entity in the viewport, or choose its kind and source index in Analysis. Repeated net copies share the same source ID. Ambiguous projected selections can be cycled rather than merged.',
      'Measurements use intrinsic geometry rather than projected pixel distances. Affine-flat distance treats the selected objects as infinite flats; bounded distance instead uses vertices, finite edges, simple planar 3D face regions including concave faces, and qualified convex 4D cells.',
      'Bounded face and cell measurements report closest points and numerical distance bounds. Star/self-crossing faces, inferred holes and unsupported generalized cell interiors receive a diagnostic. Export construction measurements as CSV or JSON with their units.',
    ]
  ),
  topic(
    'appearance',
    'Appearance and materials',
    'Appearance controls',
    'color alpha tint theme phong lights bump reflection refraction surface',
    [
      'Material presets, highlights, lights and viewport themes affect display. Tint multiplies source face colors; source opacity remains meaningful. Vertex spheres, edge cylinders and Geomag presentation use the source geometry.',
      'Procedural bump and studio reflection/refraction can be enabled separately. Refraction samples the studio environment using a refractive index from 1 to 3; it does not model ray paths through object thickness.',
      'Image capture waits for owned material and content assets. Keep the source and view unchanged while capture is prepared.',
    ]
  ),
  topic(
    'sections',
    'Sections and vertex figures',
    'Derived view and exact surface-section controls',
    'slice plane normal offset rational winding tangent convex section',
    [
      'Set a section plane normal and offset to slice intrinsic geometry. Event stepping moves through vertex levels. Empty and tangent intersections are valid results, with their type reported.',
      'Evaluate applies the entered normal and depth together; the normal is normalized before interpreting depth. The slider moves the last evaluated plane. Next vertex wraps from the last source level to the first. Camera and display rotation do not move this intrinsic plane.',
      'Cell, face and vertex-figure views show the kind and range of their source indices. Indices must be literal whole numbers. Invalid entries keep the previous applied selection. Derived controls wait while animation or tour export owns the view; a pending plane update cannot promote an older result.',
      'While Evaluate or Next vertex is running, promotion, derived export and derived memory capture wait for its result. Failed input leaves the previous applied plane available. Unapplied normal/depth expressions return after animation export when the same source, applied plane and units remain active.',
      'Exact rational 3D surface sections retain rational edge intersections and ordered concave/star winding evidence. Their display coordinates remain approximate. Coplanar source faces are handled explicitly.',
      'For intrinsic 4D sources, choose Ordinary cell section to fill each qualified cell intersection, including concave regions, disconnected pieces and holes. Surface section curves are a separate mode. Promote explicitly to create a new 3D document while retaining the original source.',
      'A local vertex figure describes the incident neighborhood. The 4D construction matcher checks it against finite supported candidates and reports ambiguous matches; it is not a universal completion solver.',
    ]
  ),
  topic(
    'construction',
    'Constructions and source domains',
    'Inspector → Construct',
    'hull dual reciprocal truncate rectify mirror scale transform coxeter wythoff',
    [
      'Construct is a task gallery. Start with Dual or Truncate / Rectify under Change this shape, Fit faces under Make it regular, or Compound with dual under Combine. Each card opens the existing controls; All tools returns to the gallery. Specialist options start collapsed.',
      'Face subdivision and Conway operators offers centroid, midpoint and kis refinement and d/a/k/t/j/e notation, applied right to left. A bounded numerical match uses a familiar convex uniform catalog name; other results retain notation applied to the source name. Add Dual keeps primal and polar as separate components.',
      'Choose a construction appropriate to the source dimension and interpretation. A convex hull intentionally changes the boundary. Other source-preserving operations retain literal incidence and refuse domains they cannot handle.',
      'Cancel discards pending computation replies immediately, including a result that has finished in the engine but has not reached the workspace. You can retry without waiting for that reply. Certify current belongs to the selected source, units and notes; changing them or opening a replacement project discards its pending result.',
      'Convex polar duals and 3D/4D source-incidence duals have different domains. Reciprocal constructions require a center and radius; planes through the center can make a finite reciprocal impossible.',
      'Open Create a new shape for generators, including Coxeter / Wythoff, prisms, antiprisms, polygon products, Waterman hull and specialized families. Their parameter limits and refusal messages are part of the operation.',
    ]
  ),
  topic(
    'regiment',
    '4D arrangements and regiments',
    'Inspector → Construct → Expert → Coincidic regiments',
    'coincidic skeleton vertices edges cell correspondence compound',
    [
      'Open both 4D models, choose the other source and compare. Current XYZW placement and coordinate units must agree; record any alignment as a separate operation.',
      'The saved report distinguishes common vertices, edges, cyclic faces and complete cell boundaries. Choose a literal source ID to navigate its counterparts. Corealmic shared-cell witnesses are distinct from a common vertex arrangement.',
      'Construct literal compound keeps independent incidence and both sources’ text/PNG, RGBA, notes and units. Coincident vertices remain separate. The report does not establish uniformity or a filled union.',
    ]
  ),
  topic(
    'density',
    'Generalized density and algebraic measures',
    'Inspector → Analysis → Generalized 3D density / algebraic measures',
    'winding star volume area point signed multiplicity csv',
    [
      'Declare a source-coordinate point and choose coherent source anchors or positive algebraic volume per component. Compute reports signed winding and magnitude, algebraic volume and absolute algebraic face-area sum.',
      'These measures count signed face-cycle multiplicity. Filled/union bulk measures and 4D density are unavailable. Density on a surface is undefined; zero volume cannot choose the positive-volume orientation.',
      'Save evidence retains the source-bound query in the native project. Restore reconstructs it. Export full-source JSON or measurement CSV with the declared units and mathematical definitions.',
    ]
  ),
  topic(
    'projective-dual',
    'Projective and infinite duals',
    'Inspector → Construct → Expert → Projective dual',
    'reciprocal ideal hemi infinity clip cutoff wire',
    [
      'Choose center, radius and clipping half-width in source units. Save reciprocal view recipe opens the separate wire view; Show saved reciprocal restores it. Fit clip box and orbit affect its independent camera.',
      'The element selector maps dual vertices to original faces, dual edges to original edges and dual face cycles to original vertices. Ideal vertices retain their true projective identities. Change clipping distance to alter the finite display and save PNG to share it.',
      'The original finite source, notes and annotations stay in the document. Infinite faces have no assigned fill, solid measure, net or morph. A recipe whose source has changed must be rebuilt.',
    ]
  ),
  topic(
    'coincident-assembly',
    'Four-face coincident-edge assembly',
    'Inspector → Nets → Four-face coincident edge assembly',
    'assembly join tongue groove support coincident inside outside genus',
    [
      'This workflow qualifies separate ordinary pieces touching along literal shared edges. Convex, concave and toroidal pieces are supported within the reported limits. It retains the separate pieces and their source face IDs.',
      'Select the outside pair and choose tongue-in-groove, internal support, no internal support or disconnected policy. Preview shows the pairing, cuts and physical tabs. Edit the detached layout, then Save edits; Restore saved reopens it.',
      'Export SVG or packed PDF at the chosen millimeter scale. Source face text and eligible PNG follow their original owners. Select larger paper or smaller E0 when an intact part cannot fit. Ambiguous contacts and star or immersed pieces receive a diagnostic.',
    ]
  ),
  topic(
    'sphere',
    'Project onto a sphere',
    'Inspector → Construct → Make it regular → Spherical projection',
    'sphere project radial radius center xyz xyzw',
    [
      'Enter a center in XYZ or XYZW coordinates and a positive radius, or leave either field empty. The default center is the mean source vertex position; the default radius is the mean source distance from that center.',
      'Vertices move along their existing rays to the sphere. Source edges, ordered faces, cells, colors, units and element content stay associated with the same owners.',
      'A vertex at the center, collapsed geometry, or a newly nonplanar face/cell prevents adoption. Explicitly subdivide a face before projecting if necessary. Projection does not establish regularity; convex results receive separate supporting-facet checks.',
    ]
  ),
  topic(
    'truncation',
    'Incidence truncation and quasitruncation',
    'Inspector → Construct → Change this shape → Star truncation',
    'truncate quasi midpoint rectify cut amount regular star',
    [
      'Source-incidence cuts use a closed intrinsic 3D boundary and its ordered vertex links. Choose a manual amount, regular-face normal cut, quasitruncation or midpoint rectification. Preview first, then Adopt.',
      'Quasitruncation retains the resulting star face cycles. A closed incidence result does not by itself establish a filled-solid volume.',
      'The source maps, chosen cut and color policy are recorded in history. Planar caps and a valid source neighborhood are required.',
    ]
  ),
  topic(
    'expansion',
    'Expansion and geometric fitting',
    'Inspector → Construct',
    'runcination expand regular face equal edge area near miss fit solver',
    [
      'Expansion/runcination is available for supported closed convex 3D and 4D sources. Ratio and radius determine the expanded incidence; the operation retains a reproducible recipe.',
      'Fit geometric conditions can target regular faces, equal edges or equal face areas. Inspect convergence and residuals before adopting. A valid geometry with unmet targets is explicitly a near miss.',
      'Fitting preserves the source incidence. Nonplanarity, collapsed rank, unsupported geometry or failed supporting facets prevent adoption. Equalities within numerical tolerance are not exact regularity certificates.',
    ]
  ),
  topic(
    'augmentation',
    'Augmentation, excavation and placement',
    'Inspector → Construct → Change this shape → Augment / Excavate',
    'attach drill pyramid cupola face matching memory addition compound',
    [
      'Construct → Change this shape → Augment / Excavate applies a generated piece, library model or memory to a picked face. Excavate reverses the piece inward; Drill opposite faces (prism) creates a supported straight tunnel. A picked vertex supports separate model copies. Results enter construction history.',
      'Augmentation attaches a chosen model at matching ordered source faces. Orientation, scale, face choice and coincidence policy determine the seam; Preview shows the proposed result before adoption.',
      'Excavation removes matched face pairs and retains the remaining source boundary within supported domains. Drilling follows supported additional coincidences. These operations do not provide arbitrary solid Boolean subtraction.',
      'Placing models on faces or vertices creates positioned instances. Those instances need not share edges with the base. Source owners, components and color policies remain explicit.',
    ]
  ),
  topic(
    'specialized',
    'Specialized generators',
    'Inspector → Construct',
    'tetrahedron triangular prism grid stephanoid noble torus segmentotope spring zonohedron geodesic',
    [
      'Create an edge-defined tetrahedron from six lengths, an irregular triangular prism from three base lengths, height and shear, or a triangular grid from a frequency and edge length.',
      'Other controls create cupolae, noble candidates, grounded stephanoids, tori, segmentotopes, zonohedra, subdivisions and geodesic geometry. Rational polygon symbols retain their winding interpretation.',
      'Spring relaxation reports constraints, convergence and residuals. Unsupported or invalid realizations are refused. A generated model is not automatically classified as uniform or scaliform.',
    ]
  ),
  topic(
    'faceting',
    'Stellation and automatic faceting',
    'Stellation, cell diagrams and Automatic facets',
    'tidy spiky plane diagram enumerate facet symmetry cell fill cavity',
    [
      'Stellation uses source facial planes and selectable regions. Cell diagrams show actual shared-facet relationships, support/layer selection and conservative cavity filling. Uncertain regions remain explicit.',
      'Faceting retains source vertices while selecting different ordered face cycles. Automatic search includes closed, isohedral, tidy, spiky, tidy-spiky and tidy-dual criteria, plus type and per-plane limits. Tidy-dual checks both the selected faceting and its finite incidence polar. Exact supplied-coordinate predicates have a bounded policy domain; native polar geometry also requires numerical qualification. Unsupported, resource-limited and canceled checks do not count as completed rejections.',
      'Editable faceting diagrams retain source ownership and can be converted into model incidence. A bounded search does not prove that every possible faceting or stellation has been enumerated.',
    ]
  ),
  topic(
    'nets',
    'Face nets, folding and paper models',
    'Inspector → Nets',
    'tab cut join move rotate pack pages print svg pdf fold paper color rgba batch',
    [
      'Start with Edge 0 length and glue tabs, then Generate/reset net. Page and paper options contains page size, packing and SVG/PDF. Cuts and piece placement, Glue tab placement and Fold preview open their own controls. Numerical checks and source domain retains detailed evidence; overlap warnings stay in the summary and beside paper export.',
      'Cut or join source edges and move connected pieces. The same source face and edge IDs are used by the net, folded preview and printable assembly. Net edits have their own Undo/Redo; Save keeps the source, layout and print settings.',
      'Generate/reset creates a fresh joined layout. Start with separate faces creates one piece per face. Both actions add a net history step, so Undo restores the previous connections and placements. Net editing and view controls wait while animation export owns the view.',
      'Closed orientable nonconvex/toroidal 3D shells with simple planar concave faces are supported. Their nets also fold through saved animation keyframes, tours and PNG/WebM export. Crossing, nonplanar and unsupported nonmanifold face domains are refused. Folding preserves the source face geometry.',
      'Choose physical edge scale, tabs and page settings before packing. Tabs can be absent, single or double, with per-edge side choices and a width in millimeters. SVG/PDF export and printing retain the requested scale, subject to small Chromium page-size rounding. Review overlap and clipping reports; layouts are not guaranteed collision-free.',
      'Color printing can mix source colors or put one source color on each net/page. Select all paper colors or one source-face batch, and disable color fill when printing on colored paper. Separate mode cuts cross-color hinges in a detached print layout; the editable net keeps its connections. Face text and PNG images still print.',
    ]
  ),
  topic(
    'cell-nets',
    'Whole-cell nets of 4D models',
    'Inspector → Nets on a 4D source',
    'cell net nonconvex complete separate reattach shrink matching face vertex',
    [
      'A 4D net arranges complete 3D source cells in one 3D view. Generate a joined arrangement, then open Connections and piece placement to cut/join at a source face, move a connected piece or reattach a cell with its descendants. Starting cell and separate pieces offers a different root or separate cells; source indices must be literal whole numbers.',
      'Generate/reset cell net creates a fresh joined arrangement; Start with separate cells creates one piece per cell. Both actions support Undo/Redo. Opening a saved project restores its saved arrangement and history.',
      'Globally nonconvex closed orientable 4D shells can include complete ordinary convex or concave 3D cell boundaries and simple planar concave faces. Coplanar shared-face hinges are supported. Source cycles and distances remain intact.',
      'Highlight matching source faces or every copy of a vertex. Surface shrink is a display choice; it does not resize mathematical cells. Save retains layout and edit history. Intersections between arranged cells are ignored.',
    ]
  ),
  topic(
    'content',
    'Element text, labels and face images',
    'Inspector → Element content',
    'annotation png texture markup source id length automatic text label',
    [
      'Attach formatted text to a vertex, edge, face or cell, or a literal PNG image to an eligible face. Placement and source ownership are saved in the native project.',
      'Automatic labels can show source IDs, coordinates, lengths or incidence. Existing manual labels and PNG content are preserved by default. Repeated net/explosion instances use the same source owner.',
      'Physical net labels and face images use the net scale. Unsupported transfers or poses are refused rather than guessing a new owner. Wait for image decoding before capturing a view.',
    ]
  ),
  topic(
    'animation',
    'Animation, dual morphs and tours',
    'Animation and Dual morph controls',
    'keyframe time video png capture rotation explosion fold snub sizing tilt',
    [
      'Animate rotations, supported explosions, ordinary-cell or surface section depth and folding using time-based tracks. Keyframes and tours retain reproducible camera/view states.',
      'Eight scoped 3D dual-morph methods include sizing, truncation, augmentation, expansion and four tilting methods. Sizing and expansion also support finite closed ordinary star/nonconvex 3D boundaries, including the four regular stars. Generalized 4D expansion retains actual source/polar product cells and finite star winding. Each method reports its own source domain and transitions.',
      'Open viewport shelf → More → Dual morph, choose a method and Apply. Leave reciprocal radius empty to match the source size. Drag the ratio slider to pause and inspect a pose. Replay starts again from the beginning; Play resumes a paused pose. Reset returns to the source. Saved projects retain the resolved radius and pose.',
      'Sizing displays two separate layers: the source shrinks while its dual grows. Automatic radius matches their endpoint sizes; the middle pose can be smaller. The camera and source normalization stay fixed during playback. Use Fit export frames when an animation needs a single camera covering every sampled pose.',
      'Dual-morph ratio keyframes combine with rotation and carry source-owned text/PNG into PNG and WebM frames. Choose Fit export frames to sample every export time and save one camera containing their displayed geometry; your original pose is restored. The fit covers sampled geometry, not every intervening playback instant or label extent.',
      'PNG/video export prepares the required assets and supports cancellation. Unsupported combinations receive a diagnostic. A smooth display animation does not establish continuous mathematical equivalence outside its declared domain.',
    ]
  ),
  topic(
    'exports',
    'Exporting and sharing',
    'File → Export, Capture image and Print',
    'off 4off obj stl pov vrml dxf json csv pdf svg png',
    [
      'Export type → Printable model exports struts or thickened panels from displayed geometry, including 4D projections, or the checked outer solid of a supported complete 3D source. Set physical size in millimeters. STL defaults to binary; the ASCII STL checkbox switches its encoding. Strut/panel shells may overlap and need slicer review; Solid has its own exterior and hollowing checks.',
      'Use native projects for editable work. OFF/4OFF and JSON carry geometry; format-specific exports such as OBJ, STL, VRML, DXF or POV-Ray have dimension and interpretation limits.',
      'Choose Model or Derived result, a file format and output units. The dialog disables unavailable formats and explains data losses before you choose a file. Declare physical Coordinate units under Construct, Scale, reflect and extrude before converting millimeters, inches or other physical units. Physical VRML uses meters.',
      'Escape or Close cancels the pending export. A late destination choice cannot write after its export dialog has closed. Opening the dialog again starts a fresh review; an older completion cannot close or replace that review. The same rule applies to net SVG/PDF exported from this dialog.',
      'JSON retains project metadata and notes. OFF/4OFF carries them in a Polytope Laboratory JSON comment; other readers may discard comments. OFF needs intrinsic 3D/4D boundary geometry; use JSON or DXF for loose edges. Intrinsic STL and POV-Ray use their convex 3D boundary domain. Displayed triangle surfaces and Printable model have separate export domains. Intrinsic export uses source coordinates; choose Displayed geometry for the prepared projection, or PNG for a raster image.',
      'PNG capture renders the current prepared view. Packed nets export physical SVG/PDF pages. Attach the native project and a reproducible description when reporting a bug.',
    ]
  ),
  topic(
    'numeric',
    'Numerical evidence and unsupported domains',
    'Inspector → Advanced',
    'exact rational float tolerance certified validation generalized manifold',
    [
      'Open Symmetry checks in Advanced with Expert tools enabled to compute numerical source symmetries, inspect element orbits and stabilizers, or compare a restricted subgroup. A complete full-group result requires an exhausted search and verified closure; resource-limited and subgroup results retain their restricted scope. Coordinates and predicates remain approximate.',
      'Verify regular 4D identity shows current progress and checks the selected source. A new check clears its prior receipt; changing models discards pending feedback. Notes, unit-display declarations and view rotation do not change this intrinsic check.',
      'Analysis and incidence validation show a loading message while checking the selected source. A report from another model or an earlier check cannot replace the current result. View rotation, notes and coordinate-unit display changes do not change intrinsic incidence checks.',
      'Ordinary coordinates and measurements use approximate float64 predicates. Validation means the reported checks passed for the supplied interpretation; it does not certify every mathematical property.',
      'Exact rational hull/dual and surface-section workflows carry evidence about supplied rational coordinates. The viewport still uses approximate display values; decimal input does not recover intended radicals.',
      'Generalized objects retain their literal ordered incidence. They need not satisfy convex topology. A refusal identifies a limit of the selected operation; constructing a hull is an explicit change of geometry.',
    ]
  ),
]);

const CONTEXT = [
  ['coincidic-', 'regiment'],
  ['density-', 'density'],
  ['generalized-density', 'density'],
  ['projective-dual', 'projective-dual'],
  ['assembly-', 'coincident-assembly'],
  ['source-reflection', 'construction'],
  ['reflect-literal', 'construction'],
  ['sphere-project', 'sphere'],
  ['incidence-dual', 'construction'],
  ['make-incidence-dual', 'construction'],
  ['incidence-', 'truncation'],
  ['cell-net', 'cell-nets'],
  ['net-', 'nets'],
  ['reinforcement', 'nets'],
  ['element-', 'content'],
  ['source-label', 'content'],
  ['dual-morph', 'animation'],
  ['tour', 'animation'],
  ['animation', 'animation'],
  ['material-', 'appearance'],
  ['surface-', 'appearance'],
  ['appearance', 'appearance'],
  ['multiple-views', 'views'],
  ['perspective', 'views'],
  ['stereo', 'views'],
  ['library', 'library'],
  ['search', 'library'],
  ['catalog', 'library'],
  ['measurement', 'selection'],
  ['selection', 'selection'],
  ['units', 'expressions'],
  ['expression', 'expressions'],
  ['exact-section', 'sections'],
  ['section', 'sections'],
  ['vertex-figure', 'sections'],
  ['expand', 'expansion'],
  ['fitting', 'expansion'],
  ['augmentation', 'augmentation'],
  ['face-placement', 'augmentation'],
  ['automatic-facet', 'faceting'],
  ['faceting', 'faceting'],
  ['stellation', 'faceting'],
  ['basic-solid', 'specialized'],
  ['stephanoid', 'specialized'],
  ['project-metadata', 'projects'],
  ['rational', 'numeric'],
];
export const GROUP_GUIDE_TOPICS = {
  'fit-refine-controls': 'expansion',
  'facet-stellate-controls': 'faceting',
  'face-conway-settings': 'construction',
  'face-surgery-settings': 'augmentation',
  'element-types': 'selection',
  'add-dual-controls': 'construction',
  'printable-settings': 'exports',
  'transform-model-settings': 'construction',
  'dual-options-settings': 'construction',
  'create-model-settings': 'specialized',
  'advanced-construction-settings': 'construction',
  'wythoff-model-settings': 'construction',
  'hull-model-settings': 'construction',
  'selection-details': 'selection',
  'entity-orientation-settings': 'selection',
  'entity-measurement-settings': 'selection',
  'analysis-details': 'selection',
  'validation-details': 'numeric',
  'project-metadata-settings': 'metadata',
  'model-information-summary': 'metadata',
  'expression-settings': 'expressions',
  'info-panel': 'selection',
  'construct-panel': 'construction',
  'evidence-panel': 'numeric',
  'net-panel': 'nets',
  ...NEW_GROUP_GUIDE_TOPICS,
};
export function guideContext(element) {
  if (/^(?:history-|recover$)/.test(element?.id ?? '')) return 'projects';
  if (
    /^(?:animation|tour)-(?:format|size|framing|margin|supersample|bitrate|palette|dither|loop-count|export|png|webm)$/.test(
      element?.id ?? ''
    )
  )
    return 'media-export';
  if (element?.closest?.('#star-uniform4-cell-types')) return 'star-polychora';
  if (element?.closest?.('#element-types')) return 'selection';
  const recent = [
    ['stellation-arbitrary-', 'stellation-diagrams'],
    ['stellation-face-', 'stellation-diagrams'],
    ['waterman4-', 'generator-options'],
    ['fabrication-', 'paper-assembly'],
    ['hinge-strip-', 'paper-assembly'],
    ['goursat-wythoff-', 'wythoff-generation'],
    ['classification-', 'classification-evidence'],
    ['symmetry-evidence-', 'symmetry-evidence'],
    ['vertex-figure-', 'vertex-figure-completion'],
    ['corpus-symmetry-', 'symmetry-evidence'],
    ['corpus-', 'corpus-evidence'],
  ].find(([prefix]) => (element?.id ?? '').startsWith(prefix));
  if (recent && !GROUP_GUIDE_TOPICS[element.id]) return recent[1];
  const focused = [
    ['section-density', 'density-sections'],
    ['information-', 'information'],
    ['symmetry-direction', 'symmetry-orientation'],
    ['conway-', 'conway'],
    ['zone-', 'zones'],
    ['surgery-', 'augmentation'],
    ['printable-', 'printing'],
    ['png-', 'images'],
  ].find(([prefix]) => (element?.id ?? '').startsWith(prefix));
  if (focused && !GROUP_GUIDE_TOPICS[element.id]) return focused[1];
  for (let node = element; node; node = node.parentElement) {
    const id = node.id || '';
    if (node.dataset?.guideTopic) return node.dataset.guideTopic;
    if (GROUP_GUIDE_TOPICS[id]) return GROUP_GUIDE_TOPICS[id];
    const found = CONTEXT.find(([prefix]) => id.startsWith(prefix));
    if (found) return found[1];
  }
  return 'start';
}
export function searchGuide(query, topics = GUIDE_TOPICS) {
  const words = String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return topics.filter((t) => {
    const text = [
      t.title,
      t.goal,
      t.where,
      t.keywords,
      ...t.paragraphs,
      ...(t.steps ?? []),
      t.tips,
      ...(t.links ?? []).map(([, label]) => label),
    ]
      .join(' ')
      .normalize('NFKC')
      .toLocaleLowerCase();
    return words.every((w) => text.includes(w));
  });
}
export class UserGuide {
  constructor(dialog) {
    this.dialog = dialog;
    this.current = 'start';
    this.previousFocus = null;
    const create = (tag, text, cls) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    this.create = create;
    const heading = dialog.querySelector('.dialog-heading');
    dialog.replaceChildren(heading);
    const label = create('label', 'Search the offline guide', 'guide-search-label');
    this.search = create('input');
    this.search.id = 'help-search';
    this.search.type = 'search';
    this.search.maxLength = 256;
    this.search.placeholder = 'Sphere, net, expressions…';
    label.append(this.search);
    this.count = create('p', null, 'muted');
    this.count.id = 'help-result-count';
    this.count.setAttribute('aria-live', 'polite');
    const body = create('div', null, 'guide-layout');
    this.list = create('nav');
    this.list.setAttribute('aria-label', 'Guide topics');
    this.article = create('article');
    this.article.id = 'help-topic';
    body.append(this.list, this.article);
    dialog.append(label, this.count, body);
    this.search.oninput = () => this.render();
    dialog.addEventListener('close', () => {
      if (this.previousFocus?.isConnected) this.previousFocus.focus();
    });
    // Also handle renderer-delivered F1 (including embedded/automated windows).
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F1' && !event.repeat) {
        event.preventDefault();
        this.show();
      }
    });
    this.render();
  }
  show(topic) {
    if (this.dialog.open) {
      if (topic) {
        this.current = topic;
        this.search.value = '';
        this.render();
      }
      this.search.focus();
      return;
    }
    this.previousFocus = document.activeElement;
    this.current = topic || guideContext(this.previousFocus);
    this.search.value = '';
    this.render();
    this.dialog.showModal();
    this.search.focus();
  }
  topicLink(id, label) {
    const link = this.create('a', label ?? GUIDE_TOPICS.find((t) => t.id === id)?.title ?? id);
    link.href = '#guide-' + id;
    link.dataset.guideTopic = id;
    link.onclick = (event) => {
      event.preventDefault();
      this.current = id;
      this.search.value = '';
      this.render();
      this.article.setAttribute('tabindex', '-1');
      this.article.focus();
    };
    return link;
  }
  controlLink(id, label) {
    const button = this.create('button', label);
    button.type = 'button';
    button.dataset.guideControl = id;
    button.onclick = () => {
      const doc = this.dialog.ownerDocument,
        target = doc.getElementById(id);
      if (!target) return;
      const focus =
        target.tagName === 'DETAILS'
          ? target.querySelector(':scope > summary')
          : target.matches(':disabled')
            ? (target.closest('details')?.querySelector(':scope > summary') ?? target.closest('#timeline-panel'))
            : target;
      this.previousFocus = focus ?? target;
      this.dialog.close();
      revealCommand(target, {
        showRegion: (region) => {
          if (doc.body.classList.contains(region + '-hidden')) doc.getElementById('toggle-' + region)?.click();
        },
        activatePanel: (id) => doc.querySelector(`[data-panel="${id}"]`)?.click(),
      });
      this.previousFocus.focus?.({ preventScroll: true });
      setTimeout(() => target.classList.remove('command-highlight'), 1800);
    };
    return button;
  }
  render() {
    const matches = searchGuide(this.search.value);
    this.count.textContent = matches.length + ' matching topics';
    this.list.replaceChildren();
    if (!matches.some((t) => t.id === this.current)) this.current = matches[0]?.id ?? null;
    for (const goal of [null, ...GUIDE_GOALS]) {
      const topics = matches.filter((t) => (t.goal ?? null) === goal);
      if (!topics.length) continue;
      if (goal) this.list.append(this.create('h4', goal));
      for (const t of topics) {
        const button = this.create('button', t.title);
        button.type = 'button';
        button.dataset.topic = t.id;
        button.setAttribute('aria-current', String(t.id === this.current));
        button.onclick = () => {
          this.current = t.id;
          this.render();
          this.list.querySelector(`[data-topic="${t.id}"]`)?.focus();
        };
        this.list.append(button);
      }
    }
    this.article.replaceChildren();
    const t = matches.find((t) => t.id === this.current);
    if (!t) {
      this.article.append(this.create('p', 'No topics match. Try a shorter phrase or clear the search.'));
      return;
    }
    this.article.append(
      this.create('h3', t.title),
      this.create('p', t.where, 'guide-location'),
      ...t.paragraphs.map((p) => this.create('p', p))
    );
    const controls = GUIDE_CONTROLS[t.id];
    if (controls?.length) {
      const links = this.create('nav');
      links.setAttribute('aria-label', 'Show controls');
      for (const [id, label] of controls) links.append(this.controlLink(id, label));
      this.article.append(
        this.create('h4', 'Show controls'),
        this.create(
          'p',
          'Reveal and focus a control without running it. Availability still follows the current source and workspace.'
        ),
        links
      );
    }
    if (t.steps) {
      const steps = this.create('ol');
      for (const step of t.steps) steps.append(this.create('li', step));
      this.article.append(this.create('h4', 'Try it'), steps);
    }
    if (t.tips) this.article.append(this.create('h4', 'Tips and limits'), this.create('p', t.tips));
    if (t.links) {
      const links = this.create('ul');
      for (const [id, label] of t.links) {
        const row = this.create('li');
        row.append(this.topicLink(id, label));
        links.append(row);
      }
      this.article.append(links);
    }
    if (t.shortcuts) {
      const table = this.create('dl');
      for (const row of shortcutTable())
        table.append(this.create('dt', row.keys), this.create('dd', row.label + ' · ' + row.scope));
      this.article.append(table, this.create('h4', 'Find new actions with Ctrl+K'));
      const list = this.create('ul');
      for (const item of FEATURE_ACTION_INDEX) {
        const row = this.create('li');
        row.append(this.topicLink(item.topic, item.label), this.create('span', ' — search “' + item.query + '”'));
        list.append(row);
      }
      this.article.append(list);
    }
    if (t.related?.length) {
      const related = this.create('nav');
      related.setAttribute('aria-label', 'Related Guide topics');
      for (const id of t.related) related.append(this.topicLink(id), this.create('br'));
      this.article.append(this.create('h4', 'Related topics'), related);
    }
    const references = GUIDE_REFERENCES[t.id] ?? [];
    if (references.length) {
      const notes = this.create('nav');
      notes.setAttribute('aria-label', 'Offline feature notes');
      for (const name of references) {
        const link = this.create('a', name.replace(/\.md$/, '').replaceAll('_', ' '));
        link.href = '#guide-note-' + name;
        link.onclick = async (event) => {
          event.preventDefault();
          const owner = this.current;
          const { loadGuideDocument } = await import('./guide-documents.mjs');
          const content = await loadGuideDocument(name);
          if (this.current !== owner || !this.dialog.open) return;
          const body = this.create('pre', content, 'guide-note');
          this.article.replaceChildren(this.create('h3', link.textContent), body);
        };
        notes.append(link, this.create('br'));
      }
      this.article.append(this.create('h4', 'Offline feature notes'), notes);
    }
  }
}
