# R9 source-test formatting audit

Date: 2026-11-10. Scope: R9-TESTS; no product code or identifiers changed.

## Approach

- Keep behavior tests executing original source. Replace character offsets and line extraction with Rollup AST ranges for complete functions, assignments, callbacks and statements. Extraction refuses missing or ambiguous declarations and reversed ranges.
- Inspect actual syntax for desktop operation allowlists, literal renderer operation calls and renderer method coverage. Require nonempty discovery so formatting cannot silently remove coverage.
- Use the shared ESM helper tests/helpers/source-match.mjs (with its CommonJS implementation) for wiring checks. Rollup protects string, template and regex ranges; compact tokens retain names, values, operators and order. Only formatting trivia, optional single-argument arrow parentheses, trailing commas and optional terminal semicolons are normalized. CSS uses the existing esbuild whitespace printer. No dependency was added.
- Inspect decoded string/template values for embedded UI markup. Extract whole named, paired HTML fixture elements instead of assuming one line. These helpers are test utilities, not a general-purpose JS printer or HTML parser.
- Read collection representatives through the real exported LIBRARY_COLLECTIONS in the Python test instead of a source regex. All 12 representatives must still generate the expected native geometry.
- Existing runtime assertions, fixtures, mathematical tolerances and test timeouts remain intact. Ordering checks still compare positions in the same normalized source. The three reserved mounted test areas were not edited.

## Verification

- Formatted scratch source-code suite: **839 passed, 0 failed** across 67 Node files.
- Original and formatted disclosure discovery: **123 IDs each**, with no missing original IDs.
- Focused Python source-reader/behavior suites: **334 passed** in the worktree and **334 passed** after Ruff formatting.
- Production build: **passed** (390 modules; existing chunk-size and static/dynamic Viewer import warnings).
- Full npm feature suite: **3,623 passed, 0 failed, 0 skipped**, exit 0; both face-fill preflight scripts also passed.

Scratch: %TEMP%/polytope-r9-tests-dmEp9O. Source, tests, assets and docs were copied; node_modules and optional data were linked to their existing locations. Product formatting was performed only in scratch.

Logs retained in scratch: `npm-features-final.log`, `source-proof-complete.log`, `python-proof-final.log`, and `format-direct.log`. The full Node run completed in 1,507.9 seconds.

Commands:

~~~text
npm.cmd run test:features:run
node --test --test-reporter tap --test-concurrency 1 <67 source-code proof paths listed below>
npx.cmd vite build --configLoader native
npx.cmd prettier@3 --write "ui/**/*.{js,mjs,css}" "desktop/**/*.cjs" "scripts/**/*.{cjs,mjs}"
python -m ruff format engine scripts
python -m pytest tests/test_library_visual.py tests/test_welcome.py tests/test_conformance_inventory.py -q -p no:cacheprovider
~~~

The network npm launcher did not complete and its offline invocation returned ENOTCACHED. The already cached Prettier 3.8.1 CLI was then invoked directly with the same globs: 503 files formatted successfully. Ruff 0.14.10 initially rejected valid Python statements containing a semicolon followed by assignment to the soft keyword match in engine/vertex_figure_construction.py. Splitting those statements onto separate lines **only in scratch** allowed Ruff to format all 308 Python files. The worktree's reserved product module was untouched.

## Inventory of converted assertions and literal checks

171 source-pattern/literal/HTML call sites and 59 structural/extraction sites are listed below. Line numbers refer to this branch before the separate formatting worker runs. Loop expressions retain the same full set of per-item checks.


### tests/analysis-overview.test.mjs

- L110: ``matchSource(app,/new AnalysisOverview/)``
- L110: ``matchSource(app,/async function refreshAnalysis\(\)\{\s+analysisOverview.sync\(\)/)``
- L111: ``matchSource(app,/onTypes:\(model,result\)=>analysisOverview.sync\(model,result\)/)``
- L111: ``matchSource(app,/refresh:\(\)=>\{analysisOverview.sync\(\);renderTabs/)``

### tests/app-chrome.test.mjs

- L190: ``matchSource(css,/body:not\(\.expert-mode\) \[data-expert\]\s*\{\s*display:none !important/)``
- L191: ``matchSource(css,/workspace-shelf[^}]*flex-wrap:nowrap/)``
- L191: ``matchSource(css,/chrome-menu-panel[^}]*overflow:auto/)``
- L192: ``matchSource(css,/chrome-drawer > \.settings-body[^}]*max-height:min/)``

### tests/automatic-faceting-controls.test.mjs

- L213: ``matchSource(app,/new AutomaticFacetingControls/)``
- L213: ``matchSource(app,/new Viewer\(container\)/)``
- L214: ``matchSource(app,/automaticFaceting\.invalidate\(\)/)``
- L217: ``includesSource(desktop,"'facet-candidates','facet-search','facet-adopt'")``
- L218: ``matchSource(app,/facetingPreview\.draw\(\)/)``
- L279: ``matchSource(source,/Candidate pools support 4 to 20/)``
- L279: ``matchSource(source,/Tidy-dual remains limited to 4 to 12/)``

### tests/blending-controls.test.mjs

- L125: ``matchSource(compound,/new BlendingControls\(context\)/)``
- L126: ``matchSource(compound,/this.blending.sync\(\)/)``
- L126: ``matchSource(compound,/this.blending\?\.cancel\(\)/)``
- L128: ``includesSource(desktop,`'${op}'`)``
- L128: ``includesSource(history,`'${op}'`)``

### tests/canvas-overlays.test.mjs

- L107: ``matchSource(app,/if\(activate&&catalog\)viewportControls\?\.opened\(m\)/)``

### tests/catalog-discovery.test.mjs

- L45: ``includesSource(workspace.slice(n.start,n.end),'stellation.sync()')``
- L46: ``includesSource(workspace.slice(n.start,n.end),'refreshDerived()')``
- L51: ``matchAllSource(line,/\b(\w+)(?:\?\.|\.)sync\(\)/g)``

### tests/classification-qualification-controls.test.mjs

- L106: ``matchSource(app,/new ClassificationQualificationControls\(\{document,before:\$\('catalog'\),run,guard,open:entry=>catalogLoader.open\(entry\)\}\)/)``
- L107: ``matchSource(app,/classificationQualification.cancel\(\)/)``

### tests/corpus-receipt-controls.test.mjs

- L35: ``matchSource(app,/corpusReconciliation\.receipts\.api=api/)``
- L35: ``matchSource(app,/import '\.\/corpus-receipts.css'/)``
- L44: ``doesNotMatchSource(source,/commitOperation|markDirty|MutationObserver|localStorage/)``

### tests/corpus-reconciliation-controls.test.mjs

- L107: ``matchSource(app,/new CorpusReconciliationControls\(\{document,before:\$\('catalog'\),run,guard,open:entry=>catalogLoader.open\(entry\)\}\)/)``
- L108: ``doesNotMatchSource(source,/commitOperation|markDirty|MutationObserver/)``

### tests/coxeter-builder.test.mjs

- L101: ``matchSource(app,/window.openCoxeterBuilder=guard/)``
- L101: ``matchSource(app,/actions\['Shape builder'\]/)``
- L101: ``matchSource(app,/commitOperation\('generate',\{kind:'coxeter-builder',\.\.\.params\}/)``
- L101: ``matchSource(app,/\$\('wythoff'\).onclick/)``
- L101: ``matchSource(app,/prepend\(openCoxeterBuilderButton\)/)``
- L102: ``matchSource(pool,/REUSABLE_OPERATIONS.add\('coxeter-build'\)/)``

### tests/default-look.test.mjs

- L40: ``matchSource(app,/s\.view=\{\.\.\.legacyDocumentView\(s\.model\.dimension\),\.\.\.s\.view\}/)``
- L41: ``matchAllSource(app,/restored\.view=\{\.\.\.legacyDocumentView/g)``

### tests/derived-document-context.test.mjs

- L58: ``matchSource(app,/getDerivedState:derivedStateSnapshot/)``
- L58: ``matchSource(app,/promote:promoteDerivedView/)``

### tests/derived-publication.test.mjs

- L177: ``matchSource(app,/export:openGeometryExport/)``

### tests/design-tokens.test.mjs

- L17: ``doesNotMatchSource(style,/--(?:muted|panel2?|text|bg|accent)\s*:/,'theme.css owns the palette')``

### tests/desktop-files.test.mjs

- L42: ``matchSource(app,/const desktopFiles=new DesktopFiles\(/)``
- L42: ``matchSource(app,/await desktopFiles.start\(\);await catalogDiscovery.load\(\)/)``
- L43: ``matchSource(app,/requestId\?api.openRequested\(requestId,id\):api.open\(id\)/)``
- L43: ``matchSource(app,/dirty,\(\)=>api.confirmProjectOpen\(\)/)``

### tests/direct-4d.test.mjs

- L159: ``matchSource(source,/if\(this.direct4D\)return this.direct4D.begin\(event,canvas\)/)``
- L159: ``matchSource(source,/if\(this.direct4D\)return this.direct4D.move\(event\)/)``
- L160: ``matchSource(source,/if\(this.direct4D\?\.tick\(dt\)\)return true/)``
- L160: ``matchSource(app,/import '\.\/direct-4d.css'/)``
- L160: ``matchSource(app,/viewportControls.direct4D\?\.active/)``
- L161: ``matchSource(viewer,/this.pickDragged\|\|Math.hypot/)``

### tests/document-field-edits.test.mjs

- L27: ``matchSource(app,/\$\('notes'\)\.oninput=editNotes/)``
- L55: ``matchSource(app,/markPoseDirty:markViewDirty/)``

### tests/element-types.test.mjs

- L27: ``matchSource(main,/allowed.add\('element-types'\)/)``

### tests/export-goals.test.mjs

- L117: ``matchSource(read('ui/app.js'),/new ExportGoals/)``
- L117: ``includesSource(read('ui/app.js'),label)``
- L118: ``matchSource(read('ui/export-controls.mjs'),/this.goals\?\.open/)``
- L118: ``matchSource(read('ui/export-controls.mjs'),/this.goals\?\.sync/)``
- L119: ``matchSource(read('ui/export-goals.css'),/focus-visible/)``
- L119: ``matchSource(read('scripts/export-workflow-smoke.cjs'),/reveal\(page,'#export-format'\)/)``
- L126: ``htmlElement(html,'export-dialog')``
- L126: ``htmlElement(html,'png-settings')``

### tests/face-conway-controls.test.mjs

- L102: ``matchSource(app,/new FaceConwayControls/)``
- L102: ``matchSource(app,/faceConwayControls\?\.sync\(\)/)``
- L103: ``matchSource(app,/for\(const control of \[faceConwayControls,/)``
- L104: ``matchSource(controls,/getElementById\('truncate'\)\.after\(panel\)/)``
- L105: ``includesSource(main,"'"+op+"'")``
- L106: ``matchSource(pool,/REUSABLE_OPERATIONS.add\('symmetry-axes'\)/)``

### tests/faceting-source-arithmetic.test.mjs

- L32: ``includesSource(main,"allowed.add('facet-source-arithmetic')")``

### tests/goursat-wythoff-controls.test.mjs

- L24: ``matchSource(app,/new GoursatWythoffControls/)``
- L24: ``matchSource(app,/goursatWythoffControls\?\.sync\(\)/)``
- L24: ``matchSource(app,/goursatWythoffControls.cancel\(\)/)``
- L25: ``matchSource(layout,/GENERATORS.add\('goursat-wythoff-settings'\)/)``

### tests/hidden-qualification.test.cjs

- L123: ``findSource(source,/new BrowserWindow\(/g)``
- L123: ``findSource(source,/createAppWindow\(\{/g)``

### tests/hinge-strip-controls.test.mjs

- L95: ``matchSource(read('ui/app.js'),/reinforcement\.fabrication\.allowance=new HingeStripControls/)``
- L95: ``matchSource(read('ui/app.js'),/fabrication\.node\('presets'\)\.append\(panel\)/)``
- L96: ``matchSource(read('ui/net-fabrication-controls.mjs'),/this\.allowance\?\.cancel\(\)/)``
- L96: ``matchSource(read('ui/net-fabrication-controls.mjs'),/this\.allowance\?\.sync\(\)/)``
- L97: ``matchSource(read('desktop/main.cjs'),/allowed\.add\('net-hinge-strip-allowance'\)/)``
- L97: ``matchSource(read('desktop/engine-pool.cjs'),/REUSABLE_OPERATIONS\.add\('net-hinge-strip-allowance'\)/)``

### tests/image-capture-session.test.mjs

- L90: ``matchSource(app,/image:\(\)=>imageCapture.run\(\)/)``
- L90: ``matchSource(app,/imageCapture\?\.cancel\(\)/)``

### tests/information-panel.test.mjs

- L29: ``matchSource(app,/new InformationPanel\(\{\.\.\.numericContext,run,api\}\)/)``
- L29: ``matchSource(app,/informationPanel\?\.invalidate\(\)/)``
- L30: ``matchSource(main,/allowed.add\('information-panel'\)/)``

### tests/input-recovery.test.cjs

- L63: ``matchSource(main,/handle\('autosave',project=>projectStorage\.publish\(recoveryPath\(\),project\)\)/)``
- L64: ``matchSource(app,/setStatus\(\(result\.recoveryWarning\?/)``

### tests/interchange-controls.test.mjs

- L122: ``matchSource(read('ui/export-controls.mjs'),/new InterchangeExportControls/)``
- L122: ``matchSource(read('ui/app.js'),/prepareView:.*prepare-view-export/)``
- L123: ``matchSource(read('ui/app.js'),/getDerived:\(\)=>derivedExportGeometry/)``
- L123: ``matchSource(read('desktop/engine-pool.cjs'),/add\('prepare-view-export'\)/)``
- L124: ``matchSource(read('desktop/geometry-export.cjs'),/'glb','x3d'/)``

### tests/learn-4d.test.mjs

- L124: ``includesSource(app,phrase)``
- L124: ``includesSource(viewport,phrase)``
- L125: ``matchSource(main,/label:'Learn 4D',click:\(\)=>action\('learn4d'\)/)``
- L127: ``includesSource(viewport,method)``

### tests/library-rail.test.mjs

- L82: ``matchSource(source,/libraryFamilyLabel\(entry\)/)``
- L82: ``matchSource(source,/stat\(\$\('analysis'\),'Source provenance',source\)/)``
- L82: ``matchSource(source,/libraryVisual.mountOverflow\(\)/)``

### tests/library-visual.test.mjs

- L136: ``matchSource(source,/button.dataset.key=entry.key/)``
- L136: ``matchSource(source,/libraryVisual.decorate\(button,entry\)/)``
- L137: ``matchSource(source,/background\?libraryPreviewJobs:nativeJobs/)``
- L137: ``matchSource(source,/libraryThumbnails.configure\(\{hidden:startup.hidden===true\}\)/)``

### tests/miller-stellation-controls.test.mjs

- L108: ``matchSource(readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8'),/allowed\.add\('stellation-miller-enumerate'\)/)``

### tests/near-miss-catalog.test.mjs

- L66: ``indexOfSource(analysis,'if(!analysisCurrent)return')``
- L66: ``indexOfSource(analysis,"appendNearMissReport(document,$('analysis'),m)")``
- L67: ``includesSource(analysis,"appendNearMissReport(document,$('analysis'),m)")``

### tests/net-fabrication-controls.test.mjs

- L64: ``matchSource(layout,/node\('net-fabrication-settings'\)/)``
- L65: ``matchSource(app,/reinforcement.fabrication=new FabricationControls\(reinforcement.context\)/)``
- L69: ``matchSource(pool,/'net-reinforcement-parts','net-measurement-export'/)``
- L70: ``matchSource(main,/formats:\['csv','json','svg','pdf','dxf'\]/)``

### tests/net-print-session.test.mjs

- L15: ``indexOfSource(main,closeCode)``
- L15: ``indexOfSource(main,'  window=createAppWindow(')``
- L44: ``matchSource(app,/print:printNet/)``

### tests/nets-flow.test.mjs

- L119: ``indexOfSource(app,'organizeNetInspector(document);')``
- L119: ``indexOfSource(app,'new NetsFlow(document,')``
- L120: ``matchSource(app,/import '\.\/nets-flow.css'/)``

### tests/polychoron-relationships.test.mjs

- L85: ``matchSource(app,/new PolychoronRelationshipControls\(/)``
- L85: ``matchSource(app,/polychoronRelationships\?\.sync\(\)/)``
- L86: ``matchSource(app,/polychoronRelationships\?\.cancel\(\)/)``
- L87: ``matchSource(main,/allowed.add\('polychoron-relationships'\)/)``
- L87: ``matchSource(pool,/REUSABLE_OPERATIONS.add\('polychoron-relationships'\)/)``
- L88: ``assert.match(server,/if\s+op\s*==\s*['"]polychoron-relationships['"]/)``

### tests/pose-element-content.test.mjs

- L63: ``matchAllSource(code,/\b(\w+)(?:\?\.|\.)sync\(\)/g)``
- L87: ``matchAllSource(code,/\b(\w+)(?:\?\.|\.)sync\(\)/g)``
- L297: ``includesSource(text,"input.id='plane-'+i")``

### tests/precision-chain.test.mjs

- L36: ``htmlElement(html,'evidence-panel')``

### tests/precision-wording.test.mjs

- L45: ``htmlElement(html,'evidence-panel')``

### tests/presentation-window.test.cjs

- L29: ``matchSource(main,/label:'Presentation',accelerator:commandBindings.presentation.keys\[0\]/)``
- L29: ``matchSource(app,/presentation:\(\)=>showcase.enter\(\)/)``

### tests/printable-export.test.mjs

- L116: ``matchSource(read('ui/export-controls.mjs'),/new PrintableExportControls/)``
- L117: ``sourceStrings(read('ui/printable-export.mjs'))``
- L118: ``matchSource(read('ui/app.js'),/preparePrintable:.*run\('prepare-printable-export'/)``
- L119: ``matchSource(read('desktop/main.cjs'),/allowed.add\('prepare-printable-export'\)/)``
- L120: ``matchSource(read('desktop/engine-pool.cjs'),/REUSABLE_OPERATIONS.add\('prepare-printable-export'\)/)``

### tests/prism-color-classes.test.mjs

- L81: ``sourceStrings(controls)``

### tests/product-polish.test.mjs

- L33: ``includesSource(source,name.replace('.md',''))``

### tests/project-workflow.test.mjs

- L80: ``matchAllSource(code,/\b(\w+)(?:\?\.|\.)\w+\(/g)``

### tests/rational-filter.test.mjs

- L26: ``htmlElement(html,'evidence-panel')``

### tests/star-uniform4.test.mjs

- L73: ``matchSource(app,/api\.engine\(\{op:'generate',params:\{kind:'regular',key:entry\.key\}/)``
- L74: ``matchSource(app,/publish:\(m,entry,\{activate\}\)=>addDocument\(m,/)``

### tests/startup-performance.test.mjs

- L74: ``includesSource(app,'beforeAnalysis:afterModelPaint')``
- L75: ``indexOfSource(app,"reportMessage('analysis'")``
- L75: ``indexOfSource(app,'await afterModelPaint()')``
- L76: ``includesSource(app,"base.draw();if(!startupModelRendered&&base.model)")``
- L77: ``includesSource(source,"from './deferred-media.mjs'")``
- L77: ``includesSource(source,"from './video-recorder.mjs'")``

### tests/symmetry-evidence-controls.test.mjs

- L93: ``matchSource(app,/new SymmetryEvidenceControls/)``
- L93: ``matchSource(app,/symmetryEvidence.sync\(\)/)``
- L94: ``doesNotMatchSource(source,/commitOperation|markDirty|MutationObserver/)``

### tests/u-dual-obstructions-controls.test.mjs

- L101: ``matchSource(app,/new UDualObstructionsControls\(\{document,before:\$\('catalog'\),run,guard,open:entry=>catalogLoader.open\(entry\)\}\)/)``
- L102: ``matchSource(app,/uDualObstructions.cancel\(\)/)``

### tests/uniform-compound-controls.test.mjs

- L93: ``matchSource(app,/getEntries:\(\)=>catalog,generate:.*constructDocument\(kind,params,'Uniform compound',options\)/)``
- L94: ``matchSource(layout,/GENERATORS.add\('uniform-compound-settings'\)/)``
- L95: ``matchSource(compound,/new UniformCompoundControls\(context\)/)``
- L95: ``matchSource(compound,/this.uniforms\?\.cancel\(\)/)``
- L100: ``matchSource(main,/allowed.add\('uniform-compound'\)/)``
- L100: ``matchSource(pool,/REUSABLE_OPERATIONS.add\('uniform-compound'\)/)``

### tests/user-guide.test.mjs

- L27: ``sourceStrings(raw)``

### tests/viewer-ux.test.mjs

- L102: ``matchSource(app,/doc\(\)\.states\.length===1&&doc\(\)\.cursor===0&&!state\(\)\.view\.entitySelection\)\{Object\.assign\(state\(\)\.view,startupView\(state\(\)\.view\)\)/)``
- L104: ``doesNotMatchSource(app,/state\(\)\.view=startupView/)``
- L104: ``doesNotMatchSource(sourceFunction(app,'adopt'),/startupView/)``
- L119: ``findSource(app,/new (?:Cell)?NetEditor\(\{[^\n]*?isBusy:netEditBusy/g)``

### tests/viewport-numeric-controls.test.mjs

- L63: ``includesSource(text,prefix)``

### tests/welcome.test.mjs

- L48: ``matchSource(source,/dataset\.featuredKey=entry\.key/)``
- L48: ``matchSource(source,/card\.dataset\.featuredKey/)``
- L48: ``doesNotMatchSource(source,/dataset\.key\b/)``
- L48: ``doesNotMatchSource(source,/data-key/)``

## Structural discovery and executable extraction sites


### tests/automatic-faceting-controls.test.mjs

- L215: ``sourceNodes(sourceAssignment(app,"$('cancel').onclick"),n=>n.type==='ForOfStatement'&&n.left.declarations?.[0]?.id.name==='control')``
- L215: ``sourceAssignment(app,"$('cancel').onclick")``

### tests/catalog-discovery.test.mjs

- L43: ``sourceFunction(source,'syncCatalogSelection')``
- L44: ``sourceFunction(source,'renderWorkspace')``
- L44: ``sourceNodes(workspace,n=>n.type==='FunctionDeclaration'&&n.id.name==='renderWorkspace')``

### tests/coxeter-builder.test.mjs

- L107: ``sourceProperty(sourceAssignment(app,'coxeterBuilder'),'preview')``
- L107: ``sourceAssignment(app,'coxeterBuilder')``

### tests/derived-document-context.test.mjs

- L24: ``sourceRange(app,'defaults','project')``
- L25: ``sourceRange(app,'initialDocumentState','commitOperation')``
- L26: ``sourceRange(app,'availableDerivedModel','syncCancelAvailability')``

### tests/derived-publication.test.mjs

- L30: ``sourceRange(app,'availableDerivedModel','memories')``
- L31: ``sourceRange(app,'refreshDerived','selectEntity')``
- L169: ``sourceRange(app,'openGeometryExport','showcase')``
- L186: ``sourceRange(app,'openGeometryExport','showcase')``
- L237: ``sourceAssignment(app,"$('cancel').onclick")``

### tests/document-field-edits.test.mjs

- L11: ``sourceAssignment(app,target)``
- L12: ``sourceRange(app,'markPlaybackDirty','error')``
- L13: ``sourceFunction(app,'serialize')``

### tests/engine-op-allowlist.test.cjs

- L8: ``sourceNodes(main,n=>n.type==='VariableDeclarator'&&n.id.name==='allowed')``
- L11: ``sourceNodes(main,n=>n.type==='CallExpression'&&n.callee.object?.name==='allowed'&&n.callee.property?.name==='add')``
- L14: ``sourceNodes(main,n=>n.type==='ForOfStatement'&&n.left.declarations?.[0]?.id.name==='op')``
- L16: ``sourceNodes(body,n=>n.type==='CallExpression'&&n.callee.object?.name==='allowed'&&n.callee.property?.name==='add'&&n.arguments[0]?.name==='op')``
- L23: ``sourceNodes(source,n=>n.type==='CallExpression'&&n.callee.name==='run'&&typeof n.arguments[0]?.value==='string')``

### tests/image-capture-session.test.mjs

- L32: ``sourceStatement(main,n=>n.type==='ExpressionStatement'&&n.expression.callee?.name==='handle'&&n.expression.arguments[0]?.value===op)``
- L88: ``sourceAssignment(app,'imageCapture')``

### tests/memory-tour-publication.test.mjs

- L14: ``sourceRange(app,'restoreMemoryState','createTourRenderer')``
- L15: ``sourceRange(app,'addMemoryStates','orientSelection')``

### tests/near-miss-catalog.test.mjs

- L65: ``sourceRange(app,'refreshAnalysis','refreshDerived')``

### tests/net-print-session.test.mjs

- L11: ``sourceFunction(main,'printDocument')``
- L12: ``sourceFunction(main,'packedPrintDocument')``
- L17: ``sourceNodes(main,n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.name==='netPrinting')``
- L17: ``sourceNodes(main,n=>n.type==='ExpressionStatement'&&n.expression.callee?.name==='handle'&&n.expression.arguments[0]?.value==='save-packed-net-pdf')``
- L35: ``sourceFunction(app,'printNet')``
- L120: ``sourceFunction(app,'syncCancelAvailability')``

### tests/pose-element-content.test.mjs

- L61: ``sourceRange(source,'displayBase','displayDiagnostic')``
- L62: ``sourceRange(source,'syncDerivedSelection','selectionSummary')``
- L82: ``sourceRange(source,'displayBase','displayDiagnostic')``
- L83: ``sourceRange(source,'syncDerivedSelection','selectionSummary')``
- L297: ``sourceStatement(source,(n,text)=>n.type==='ExpressionStatement'&&n.expression.callee?.object?.name==='PLANES'&&includesSource(text,"input.id='plane-'+i"))``
- L325: ``sourceNodes(source,n=>n.type==='CallExpression'&&n.callee.object?.name==='canvas'&&n.callee.property?.name==='addEventListener'&&n.arguments[0]?.value==='pointermove')``

### tests/prism-color-classes.test.mjs

- L76: ``sourceRange(app,'displayDiagnostic','renderWorkspace')``

### tests/project-workflow.test.mjs

- L74: ``sourceFunction(source,'markDirty')``
- L75: ``sourceFunction(source,'markPlaybackDirty')``
- L76: ``sourceProperty(sourceInitializer(source,'animation'),'onExportStateChange')``
- L76: ``sourceInitializer(source,'animation')``

### tests/renderer-contract.test.mjs

- L10: ``sourceNodes(source,n=>{ const member=n.type==='CallExpression'&&n.callee,owner=member?.object; return member?.type==='MemberExpression'&&!member.computed&&owner?.type==='MemberExpression'&&!owner.computed&&owner.property.name==='renderer'&&(owner.object.type==='ThisExpression'||owner.object.name==='viewer'); })``

### tests/startup-performance.test.mjs

- L82: ``sourceFunction(app,'refreshAnalysis')``
- L82: ``sourceNodes(fn,n=>n.type==='FunctionDeclaration'&&n.id.name==='refreshAnalysis')``

### tests/user-guide.test.mjs

- L34: ``sourceNodes(raw,n=>n.type==='ForOfStatement'&&n.left.declarations?.[0]?.id.type==='ArrayPattern'&&n.left.declarations[0].id.elements.map(e=>e.name).join(',')==='id,wrapper,label')``

### tests/ux-integration.test.mjs

- L39: ``sourceRange(source,'panels','canvas')``

### tests/viewer-ux.test.mjs

- L104: ``sourceFunction(app,'adopt')``
- L118: ``sourceInitializer(app,'netEditBusy')``

### tests/viewport-numeric-controls.test.mjs

- L63: ``sourceStatement(source,(n,text)=>n.type==='ExpressionStatement'&&includesSource(text,prefix))``
- L94: ``sourceRange(source,'selectEntity','serialize')``
- L103: ``sourceAssignment(source,target)``
- L127: ``sourceNodes(source,n=>n.type==='CallExpression'&&n.callee.object?.name==='canvas'&&n.callee.property?.name==='addEventListener'&&n.arguments[0]?.value==='pointermove')``

### tests/helpers/navigation-display.mjs

- L15: ``sourceRange(source,'displayBase','reportMessage')``
- L16: ``sourceRange(source,'selectEntity','serialize')``
- L37: ``matchAllSource(code,/\b(\w+)(?:\?\.|\.)sync\(\)/g)``

## Already formatting-safe source readers

| Test | Retained contract |
| --- | --- |
| batch-experiment.test.cjs | Python CLI import statement; Ruff preserves the module and imported names. |
| help-scope.test.mjs | HTML help prose, independent of JS/Python formatting. |
| hidden-runtime.test.cjs | Runtime archives are generated from the current source, then compared by bytes/hashes; no fixed source spelling. |
| element-visibility.test.mjs, linked-selection.test.mjs, navigation-display.test.mjs, symmetry-orientation.test.mjs | Execute real app functions through the converted shared navigation-display AST harness. |
| precision-chain.test.mjs, precision-wording.test.mjs, rational-filter.test.mjs, export-goals.test.mjs | HTML fixture extraction now handles whole nested elements and wrapped attributes; behavior checks remain mounted in Chromium. |
| test_conformance_inventory.py | Python ast.parse extracts test selectors. Source digest changes are deliberately checked as evidence changes, not code formatting expectations. |
| test_welcome.py | Raw-import asset name substrings are independent of quote style and wrapping. |

All other readFile/read_text hits were reviewed as data/fixture reads, OFF import tests, generated export bytes, manifest/receipt checks, or execution of whole modules. They do not compare code spelling. Fixture/data readers such as dual-morph-sparse4d.test.mjs are excluded from the source-code proof list; their tests remain in the full feature suite.

## Complete source-code proof list

The following 66 existing Node files plus the helper regression file are run after formatting. Python source readers above are covered by the focused pytest command.

- tests/analysis-overview.test.mjs
- tests/app-chrome.test.mjs
- tests/automatic-faceting-controls.test.mjs
- tests/batch-experiment.test.cjs
- tests/blending-controls.test.mjs
- tests/canvas-overlays.test.mjs
- tests/catalog-discovery.test.mjs
- tests/classification-qualification-controls.test.mjs
- tests/corpus-receipt-controls.test.mjs
- tests/corpus-reconciliation-controls.test.mjs
- tests/coxeter-builder.test.mjs
- tests/default-look.test.mjs
- tests/derived-document-context.test.mjs
- tests/derived-publication.test.mjs
- tests/design-tokens.test.mjs
- tests/desktop-files.test.mjs
- tests/direct-4d.test.mjs
- tests/document-field-edits.test.mjs
- tests/element-types.test.mjs
- tests/element-visibility.test.mjs
- tests/engine-op-allowlist.test.cjs
- tests/export-goals.test.mjs
- tests/face-conway-controls.test.mjs
- tests/faceting-source-arithmetic.test.mjs
- tests/goursat-wythoff-controls.test.mjs
- tests/help-scope.test.mjs
- tests/hidden-qualification.test.cjs
- tests/hidden-runtime.test.cjs
- tests/hinge-strip-controls.test.mjs
- tests/image-capture-session.test.mjs
- tests/information-panel.test.mjs
- tests/input-recovery.test.cjs
- tests/interchange-controls.test.mjs
- tests/learn-4d.test.mjs
- tests/library-rail.test.mjs
- tests/library-visual.test.mjs
- tests/linked-selection.test.mjs
- tests/memory-tour-publication.test.mjs
- tests/miller-stellation-controls.test.mjs
- tests/navigation-display.test.mjs
- tests/near-miss-catalog.test.mjs
- tests/net-fabrication-controls.test.mjs
- tests/net-print-session.test.mjs
- tests/nets-flow.test.mjs
- tests/polychoron-relationships.test.mjs
- tests/pose-element-content.test.mjs
- tests/precision-chain.test.mjs
- tests/precision-wording.test.mjs
- tests/presentation-window.test.cjs
- tests/printable-export.test.mjs
- tests/prism-color-classes.test.mjs
- tests/product-polish.test.mjs
- tests/project-workflow.test.mjs
- tests/rational-filter.test.mjs
- tests/renderer-contract.test.mjs
- tests/source-match.test.mjs
- tests/star-uniform4.test.mjs
- tests/startup-performance.test.mjs
- tests/symmetry-evidence-controls.test.mjs
- tests/symmetry-orientation.test.mjs
- tests/u-dual-obstructions-controls.test.mjs
- tests/uniform-compound-controls.test.mjs
- tests/user-guide.test.mjs
- tests/ux-integration.test.mjs
- tests/viewer-ux.test.mjs
- tests/viewport-numeric-controls.test.mjs
- tests/welcome.test.mjs
