// Organize existing controls by task without changing their handlers or IDs.
function disclosure(doc,id,label,nodes){
  const root=doc.createElement('details');root.id=id;root.className='inspector-group';
  const summary=doc.createElement('summary');summary.textContent=label;
  root.append(summary,...nodes);return root;
}
const GENERATORS=new Set(['basic-solid-settings','cupola-settings','star-polygon-settings','product-settings','antiprism-settings','step-prism-settings','torus-settings','podia-settings','layer-join-settings','crossed-segmentotope-settings','waterman-settings','noble-settings','stephanoid-settings','vertex-figure-construction-settings']);
export function organizeInspector(doc){
  const panel=doc.getElementById('construct-panel'),nodes=Array.from(panel.children);
  const heading=text=>nodes.findIndex(n=>n.classList.contains('panel-title')&&n.textContent.trim()===text);
  const operations=heading('Operations'),generators=heading('Generators'),wythoff=heading('Coxeter / Wythoff'),facets=heading('3D facet cycles'),hull=heading('Point-cloud hull'),expression=heading('Expression');
  if([operations,generators,wythoff,facets,hull,expression].some(i=>i<0))throw Error('Inspector task sections are missing.');
  const clean=range=>range.filter(n=>!n.classList.contains('rule'));
  const core=clean(nodes.slice(operations,generators));core[0].textContent='Modify this model';
  const other=core.filter(n=>n.id==='coincidic-regiment-settings');
  const coreCard=doc.createElement('section');coreCard.className='inspector-card';coreCard.append(...core.filter(n=>!other.includes(n)));
  const dual=coreCard.querySelector('#make-dual'),dualOptions=dual.nextElementSibling;
  if(dualOptions?.tagName==='DIV')dual.after(disclosure(doc,'dual-options-settings','Dual center and radius',[dualOptions]));
  const extrude=coreCard.querySelector('#extrude'),scale=coreCard.querySelector('#scale'),mirror=coreCard.querySelector('#mirror');
  const transforms=[extrude.previousElementSibling,extrude,scale.previousElementSibling,scale];
  if(scale.nextElementSibling?.tagName==='DIV')transforms.push(scale.nextElementSibling);
  transforms.push(mirror,coreCard.querySelector('#source-reflection-settings'));
  coreCard.append(disclosure(doc,'transform-model-settings','Scale, reflect and extrude',transforms.filter(Boolean)));
  const create=clean(nodes.slice(generators,wythoff));create[0].remove();create.shift();
  const reflection=clean(nodes.slice(wythoff,facets));reflection[0].remove();reflection.shift();
  create.push(disclosure(doc,'wythoff-model-settings','Reflection orbits (Wythoff)',reflection));
  const faceNodes=clean(nodes.slice(facets,hull));
  const specialized=faceNodes.filter(n=>GENERATORS.has(n.id));
  const advanced=faceNodes.filter(n=>!GENERATORS.has(n.id));
  specialized.push(...nodes.slice(expression+1).filter(n=>GENERATORS.has(n.id)));
  const fromPoints=clean(nodes.slice(hull,expression));fromPoints[0].remove();fromPoints.shift();
  create.push(disclosure(doc,'hull-model-settings','Convex hull from points',fromPoints));
  create.push(...specialized);
  const expressionNodes=clean(nodes.slice(expression)).filter(n=>!GENERATORS.has(n.id));expressionNodes[0].remove();expressionNodes.shift();
  advanced.unshift(...other,...clean(nodes.slice(0,operations)));
  advanced.push(disclosure(doc,'expression-settings','Expression calculator',expressionNodes));
  panel.replaceChildren(coreCard,disclosure(doc,'create-model-settings','Create a model',create),disclosure(doc,'advanced-construction-settings','Advanced constructions',advanced));
  for(const [id,wrapper,label] of [['selection-info','selection-details','Selection details'],['entity-orientation-controls','entity-orientation-settings','Orient to selection'],['entity-measure-controls','entity-measurement-settings','More measurements']]){
    const node=doc.getElementById(id);if(node){const group=disclosure(doc,wrapper,label,[]);node.before(group);group.append(node);}
  }
  const tabs=doc.querySelector('.inspector-tabs'),evidence=tabs.querySelector('[data-panel="evidence"]');
  evidence.textContent='Advanced';tabs.append(evidence);evidence.title='Geometry checks, symmetry and exact calculations';
  for(const button of tabs.querySelectorAll('[data-panel]'))button.setAttribute('aria-pressed',String(button.classList.contains('active')));
  for(const group of doc.querySelectorAll('.inspector-group')){
    // Focus can open a task section even when reached through help or scripts.
    group.addEventListener('focusin',event=>{if(event.target.tagName!=='SUMMARY')group.open=true;});
  }
}
export function simplifyAnalysis(doc,{open=false}={}){
  const root=doc.getElementById('analysis'),rows=Array.from(root.children);
  const common=new Set(['Symbol','Edge length range','Face side counts','Volume']);
  const detailed=rows.filter(row=>!common.has(row.firstElementChild?.textContent));
  const details=disclosure(doc,'analysis-details','More model information',detailed);details.open=open;root.append(details);
}
export function renderValidation(doc,model,validation,options={}){
  const root=doc.getElementById('evidence'),open=options.open??doc.getElementById('validation-details')?.open??false;
  const title=doc.createElement('p');title.className='validation-status';
  title.textContent=validation.passed?'Structural checks passed':'Geometry checks failed';
  const note=doc.createElement('p');note.className='muted';note.textContent=model.numeric?.certified?'This model includes an exact certificate. Display and measurements are numerical.':'Geometry and measurements use numerical calculations.';
  const raw=doc.createElement('pre');raw.className='code-box';raw.textContent=JSON.stringify({numeric:model.numeric,certificate:model.certificate,provenance:model.provenance,validation},null,2);
  const details=disclosure(doc,'validation-details','Checks, calculation method and source',[raw]);details.open=open;
  const warnings=(validation.warnings??[]).filter(w=>w!=='Geometry is approximate. Structural checks are evidence, not an exact certificate.').map(w=>{const p=doc.createElement('p');p.className='validation-warning';p.textContent=w;return p;});
  root.replaceChildren(title,note,...warnings,details);
}
