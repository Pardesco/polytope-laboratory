export function groupConstructControls(doc,panel,modify){
  const section=(id,label)=>{
    const root=doc.createElement('section');root.id=id;root.className='inspector-card';
    const heading=doc.createElement('h3');heading.className='panel-title';heading.textContent=label;root.append(heading);return root;
  };
  const move=(root,ids)=>{for(const id of ids){const node=doc.getElementById(id);if(node)root.append(node);}};
  const fit=section('fit-refine-controls','Fit & refine');
  move(fit,['fitting-settings','face-conway-settings','subdivision-settings','geodesic-settings','sphere-projection-settings','spring-settings','expansion-settings']);
  modify.after(fit);
  const facet=section('facet-stellate-controls','Facet & stellate');
  move(facet,['faceting-diagram-settings','automatic-faceting-settings']);
  const planes=doc.getElementById('stellation-controls');
  if(planes){const details=doc.createElement('details'),summary=doc.createElement('summary');details.id='stellation-plane-settings';details.className='inspector-group';summary.textContent='Stellation plane regions';details.append(summary,planes);facet.append(details);}
  move(facet,['stellation-cell-settings']);
  fit.after(facet);
  for(const id of ['face-editing-settings','augmentation-settings','face-placement-settings','face-surgery-settings','compound-controls']){
    const node=doc.getElementById(id);if(node)modify.append(node);
  }
  const create=doc.getElementById('create-model-settings');
  if(create){const heading=doc.createElement('h3');heading.className='panel-title';heading.textContent='Create';create.before(heading);}
}
