export function appendStarCellInventory(panel,inventory,{make,select,evidence}){
  if(!Array.isArray(inventory)||!inventory.length)return;
  const root=make('div','');root.id='star-uniform4-cell-types';
  root.append(make('p','Native Wythoffian cell types · published incidence inventory'));
  inventory.forEach((cell,i)=>{
    const button=make('button',`${cell.count} × ${cell.name} (${cell.bowers})`);button.type='button';button.id=`star-uniform4-cell-type-${i}`;
    button.onclick=()=>select(cell.ids,cell.name);root.append(button);
    const polygons=Object.entries(cell.facePolygons).map(([symbol,count])=>`${count} {${symbol}}`).join(', ');
    root.append(make('small',` V/E/F ${cell.counts.join('/')} · ${polygons}`));
  });
  root.append(make('p','Labels require the complete current geometry to match the native construction. This inventory does not assert a full symmetry search.'));
  if(evidence){
    const details=make('details','');details.id='star-uniform4-evidence';details.append(make('summary','Construction evidence'));
    const v=evidence.verification;
    details.append(make('p',`Float64, approximate. Relative edge spread ${v.edgeRelativeSpread.toExponential(2)}; face radial spread ${v.maxFaceRadialRelativeSpread.toExponential(2)}; face angular residual ${v.maxFaceAngularResidual.toExponential(2)} rad; unit-sphere orbit closure residual ${evidence.orbitClosureResidual.toExponential(2)}. Each face has two cells; abstract boundary orientations agree.`));
    details.append(make('p',evidence.referenceUrls.join('\n')));root.append(details);
  }
  panel.append(root);
}
