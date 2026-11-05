import {StellationCellControls,selectStellationCells} from './stellation-cell-controls.mjs';
const ns='http://www.w3.org/2000/svg';
const el=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const ids=c=>(c.selectedRegions??[]).slice().sort((a,b)=>a-b);

export function diagramRegions(graph,arrangement,diagram,selection,{side='below',attachedOnly=false,mode='full'}={}){
  const selected=new Set(selection),orbits=graph.symmetry.orbits[mode];
  return diagram.polygons.map(p=>{
    const target=p.regionIds.find(i=>arrangement.regions[i].signs[diagram.plane]===(side==='below'?1:-1));
    const orbit=orbits.find(row=>row.includes(target))??[],chosen=p.regionIds.filter(i=>selected.has(i)).length;
    const attached=selected.has(target)||(graph.adjacency[target]??[]).some(i=>selected.has(i));
    return {...p,target,orbit,orbitIndex:orbits.indexOf(orbit),selected:chosen>0,exposed:chosen===1,attached,selectable:Boolean(graph.nodes[target]?.selectable)};
  }).filter(p=>!attachedOnly||p.attached);
}

export function selectionReflexibility(symmetry,selection){
  if(!symmetry.preservesFullGroup)return 'unknown (observation domain restricts source symmetries)';
  const selected=new Set(selection),improper=symmetry.actions.filter(a=>a.orientation===-1);
  if(!improper.length)return 'source has no orientation-reversing symmetry';
  const invariant=action=>symmetry.regionIds.every((id,i)=>selected.has(id)===selected.has(action.regionIds[i]));
  return improper.some(invariant)?'reflexible within source group':'chiral within source group';
}

export function orbitSelection(graph,selection,action,regionId,mode='full',fill=false){
  if(mode!=='individual'&&!graph.symmetry.preservesFullGroup)throw Error('The box restricts source symmetry. Enlarge observation scale or choose Individual cells.');
  let next=selection.slice();const orbit=graph.symmetry.orbits[mode].find(row=>row.includes(regionId));
  if(action==='toggle'){
    if(!orbit)throw Error('Choose an enclosed cell.');const set=new Set(next),remove=orbit.every(i=>set.has(i));for(const i of orbit)remove?set.delete(i):set.add(i);next=[...set];
  }else{
    const targets=action==='supports'?orbit??[regionId]:[regionId];for(const i of targets)next=selectStellationCells(graph,next,action,i);
  }
  if(fill)next=selectStellationCells(graph,next,'fill');return next.sort((a,b)=>a-b);
}

export class StellationDiagramControls extends StellationCellControls{
  constructor(context){
    super({...context,run:(op,...args)=>context.run(op==='stellation-cell-graph'?'stellation-diagram-data':op,...args)});
    this.panel.querySelector('summary').textContent='Interactive stellation diagrams';this.node('evaluate').textContent='Build interactive diagrams';this.node('mode').options[0].textContent='Toggle cell orbit';
    const settings=document.createElement('div');settings.innerHTML=`
      <label>Diagram plane <select id="stellation-face-plane"></select></label>
      <label>Replicate edits <select id="stellation-face-symmetry"><option value="full">Full source group</option><option value="proper">Rotations (allow chiral cells)</option><option value="individual">Individual cells</option></select></label>
      <label>Click cell <select id="stellation-face-side"><option value="below">Below facial plane</option><option value="above">Above facial plane</option></select></label>
      <label><input type="checkbox" id="stellation-face-attached"> Attached only</label>
      <label><input type="checkbox" id="stellation-face-fill"> Include inaccessible cells after edits</label>
      <button id="stellation-face-base">Make base model</button><button id="stellation-face-export">Export facial diagram SVG</button>
      <output id="stellation-face-status" aria-live="polite"></output>
      <div id="stellation-face-diagram" style="max-height:420px;overflow:auto"></div>
      <p class="muted">Color identifies a cell orbit; white outline marks the exposed selected solid in this plane. Edits update the 3D solid. Attached means the target cell is selected or shares a full facet with the current selection. Uncheck cavity inclusion to preserve future cavities; existing cells are retained.</p>`;
    this.node('diagram').before(settings);this.faceSettings=settings;
    const dependency=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Cell dependency graph';dependency.append(summary);this.node('diagram').before(dependency);dependency.append(this.node('diagram'));
    const guard=fn=>context.guard?context.guard(fn):fn;
    for(const key of ['plane','symmetry','side','attached','fill'])this.face(key).onchange=guard(()=>{
      this.verify();const c=context.getConfig();c.diagramPlane=Number(this.face('plane').value);c.diagramSymmetry=this.face('symmetry').value;c.diagramSide=this.face('side').value;c.diagramAttached=this.face('attached').checked;c.diagramFill=this.face('fill').checked;
      if(key==='fill'&&c.diagramFill)this.apply('fill');else{context.markDirty();this.render();}
    });
    this.face('base').onclick=guard(()=>this.makeBase());this.face('export').onclick=guard(()=>{this.verify();if(!this.faceSvg)throw Error('Build a facial diagram.');return context.saveSvg(new XMLSerializer().serializeToString(this.faceSvg),'Facial stellation diagram.svg');});this.sync();
  }
  face(key){return this.panel.querySelector('#stellation-face-'+key);}
  apply(action,regionId=null){
    this.verify();const c=this.context.getConfig(),next=orbitSelection(this.receipt.graph,ids(c),action,regionId,c.diagramSymmetry??'full',c.diagramFill??false);
    return this.replaceSelection(next,action,regionId);
  }
  async makeBase(){
    this.verify();if(this.busy)throw Error('Finish the current diagram job.');const receipt=this.receipt,c=this.context.getConfig(),selection=ids(c),signature=JSON.stringify(selection);if(!selection.length)throw Error('Select at least one enclosed cell.');
    const params={box_scale:receipt.arrangement.parameters.box_scale,plane_ids:receipt.arrangement.source.faceIds,bounds:receipt.arrangement.bounds,region_signs:selection.map(i=>receipt.arrangement.regions[i].signs)};
    const controller=new AbortController();this.baseController=controller;this.busy=true;this.sync();
    const verifyPublication=()=>{if(controller.signal.aborted)throw Error('Stellation construction canceled.');this.verify(receipt);if(signature!==JSON.stringify(ids(this.context.getConfig())))throw Error('Diagram selection changed during construction.');};
    try{return await this.context.commit('stellation-make-base',structuredClone(params),'Make stellation base model',{signal:controller.signal,verifyPublication});}
    finally{if(this.baseController===controller){this.baseController=null;this.busy=false;}this.sync();}
  }
  render(){
    super.render();if(!this.faceSettings||!this.receipt?.graph.symmetry)return;
    const {graph,arrangement}=this.receipt,c=this.context.getConfig(),plane=Number.isSafeInteger(c.diagramPlane)&&c.diagramPlane>=0&&c.diagramPlane<graph.diagrams.length?c.diagramPlane:0,diagram=graph.diagrams[plane],selection=ids(c);
    const select=this.face('plane');select.replaceChildren();for(const d of graph.diagrams){const option=document.createElement('option');option.value=d.plane;option.textContent=`${d.plane}: source face ${d.sourceFace}`;select.append(option);}select.value=plane;
    this.face('symmetry').value=c.diagramSymmetry??'full';this.face('side').value=c.diagramSide??'below';this.face('attached').checked=Boolean(c.diagramAttached);this.face('fill').checked=Boolean(c.diagramFill);
    const polygons=diagramRegions(graph,arrangement,diagram,selection,{side:c.diagramSide,attachedOnly:c.diagramAttached,mode:c.diagramSymmetry??'full'}),points=diagram.polygons.flatMap(p=>p.points);
    const low=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),high=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),span=Math.max(...high.map((x,i)=>x-low[i])),margin=span*.035;
    const svg=el('svg',{xmlns:ns,viewBox:`${low[0]-margin} ${low[1]-margin} ${high[0]-low[0]+2*margin} ${high[1]-low[1]+2*margin}`,role:'group','aria-label':'Interactive facial-plane stellation arrangement',width:'100%'});svg.style.background='#11202d';
    const meta=el('metadata');meta.textContent=JSON.stringify({sourceFingerprint:graph.sourceFingerprint,arrangementSha256:graph.arrangementSha256,plane,selectedRegionIds:selection,symmetry:c.diagramSymmetry??'full',attachedOnly:Boolean(c.diagramAttached),numericMode:graph.numericMode,certified:false});svg.append(meta);
    const edges=new Map(),key=p=>p.map(x=>Math.round(x/span*1e7)).join(',');
    for(const p of polygons){
      const polygon=el('polygon',{points:p.points.map(v=>v.join(',')).join(' '),fill:p.selectable?`hsl(${(p.orbitIndex*67+155)%360} 45% ${p.selected?52:25}%)`:'#172c3b',stroke:'#6f93a7','stroke-width':span*.0015,role:'button',tabindex:p.selectable?0:-1,'aria-disabled':!p.selectable,'aria-pressed':p.orbit.length>0&&p.orbit.every(i=>selection.includes(i)),'aria-label':`Cell ${p.target}, orbit ${p.orbitIndex}, ${p.orbit.length} regions`});
      polygon.dataset.target=p.target;polygon.dataset.orbitSize=p.orbit.length;polygon.dataset.attached=p.attached;polygon.style.cursor=p.selectable?'pointer':'default';const title=el('title');title.textContent=`R${p.target}; orbit ${p.orbitIndex}: ${p.orbit.join(', ')}; outside-plane layer ${graph.nodes[p.target]?.outsidePlaneCount??'?'}${p.selectable?'':' (unbounded or clipped)'}`;polygon.append(title);
      const click=event=>{event.preventDefault();if(!this.busy&&p.selectable)this.apply(event.ctrlKey?'supports':event.shiftKey?'layer':this.node('mode').value,p.target);};polygon.onclick=this.context.guard?this.context.guard(click):click;polygon.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')polygon.onclick(event);};svg.append(polygon);
      if(p.exposed)for(let i=0;i<p.points.length;i++){const a=p.points[i],b=p.points[(i+1)%p.points.length],k=[key(a),key(b)].sort().join('|');if(edges.has(k))edges.delete(k);else edges.set(k,[a,b]);}
    }
    const outline=el('path',{d:[...edges.values()].map(([a,b])=>`M${a.join(' ')}L${b.join(' ')}`).join(' '),fill:'none',stroke:'#fff','stroke-width':span*.005,'pointer-events':'none','aria-label':'Current solid outline'});svg.append(outline);
    const filled=selectStellationCells(graph,selection,'fill').length-selection.length;
    this.face('status').textContent=`${selection.length} selected; ${filled} inaccessible unselected cells; ${selectionReflexibility(graph.symmetry,selection)}. ${graph.symmetry.clippedBoundedRegionIds.length} bounded cells clipped by the box. Group ${graph.symmetry.actingOrder}/${graph.symmetry.sourceOrder}; max vertex residual ${graph.symmetry.maxVertexResidual.toExponential(2)} (float64).`;
    this.faceSvg=svg;this.face('diagram').replaceChildren(svg);this.receipt.faceConfig=JSON.stringify([c.diagramPlane,c.diagramSymmetry,c.diagramSide,c.diagramAttached,c.diagramFill]);
  }
  cancel(){super.cancel();this.baseController?.abort();}
  sync(){
    super.sync();if(!this.faceSettings)return;
    if(!this.receipt){this.faceSvg=null;this.face('diagram').replaceChildren();this.face('status').textContent='Build interactive diagrams to select symmetry-related cells.';}
    else{const c=this.context.getConfig();if(this.receipt.faceConfig!==JSON.stringify([c.diagramPlane,c.diagramSymmetry,c.diagramSide,c.diagramAttached,c.diagramFill]))this.render();}
    for(const n of this.faceSettings.querySelectorAll('button,select,input'))n.disabled=Boolean(this.busy||this.context.isExporting?.()||!this.receipt);
  }
}
