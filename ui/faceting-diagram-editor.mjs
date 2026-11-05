const clone=value=>JSON.parse(JSON.stringify(value));
export function cycleKey(cycle){
  const rows=[];
  for(const direction of [cycle,[...cycle].reverse()])for(let i=0;i<cycle.length;i++)rows.push([...direction.slice(i),...direction.slice(0,i)].join(','));
  return rows.sort()[0];
}
export function pickedFacet(diagram,cycle){
  if(cycle.length<3||cycle.length>8||new Set(cycle).size!==cycle.length||cycle[0]!==diagram.mainVertexId)
    throw Error('Pick 2 to 7 distinct other vertices in boundary order; the main vertex starts and closes the polygon.');
  const row=diagram.catalogue.candidates.find(row=>cycleKey(row.cycle)===cycleKey(cycle));
  if(row)return row.id;
  const planar=diagram.catalogue.planes.some(row=>cycle.every(v=>row.sourceVertexIds.includes(v)));
  throw Error(planar?'This ordered cycle is absent from the bounded candidate pool. Increase the candidate/per-plane bounds and rebuild.':
    'This cycle has no noncollinear exact source plane in the retained pool. It may be nonplanar or the pool may be limited; no vertices were moved.');
}

export class DiagramEditHistory{
  constructor(){this.reset();}
  reset(value){this.states=value?[clone(value)]:[];this.cursor=this.states.length-1;}
  push(value){
    if(JSON.stringify(this.states[this.cursor])===JSON.stringify(value))return;
    this.states=this.states.slice(0,this.cursor+1);this.states.push(clone(value));
    while(this.states.length>1&&(this.states.length>100||JSON.stringify(this.states).length>4*1024*1024))this.states.shift();
    this.cursor=this.states.length-1;
  }
  target(delta){return this.states[this.cursor+delta]?clone(this.states[this.cursor+delta]):null;}
}

export class FacetingDiagramEditor{
  constructor(controls){
    this.controls=controls;this.history=new DiagramEditHistory();this.pending=null;
    const panel=document.createElement('div');panel.id='faceting-diagram-editor';
    panel.innerHTML='<p class="muted">Choose a main vertex, Draw, then Draw polygon and click labelled vertices in boundary order. The main vertex starts and closes each facet. Facets replicate in the verified source subgroup.</p><div class="button-row"><button id="faceting-editor-prepare">New symmetric diagram</button><button id="faceting-editor-start">Draw polygon</button><button id="faceting-editor-finish">Finish polygon</button><button id="faceting-editor-abandon">Cancel polygon</button></div><output id="faceting-editor-path" aria-live="polite"></output><label>Chosen seed facets <select id="faceting-editor-facets" size="4"></select></label><div class="button-row"><button id="faceting-editor-remove">Remove chosen facet</button><button id="faceting-editor-undo">Undo diagram edit</button><button id="faceting-editor-redo">Redo diagram edit</button><button id="faceting-editor-base">Make base model</button></div>';
    const preview=document.createElement('div');preview.id='faceting-diagram-preview';preview.hidden=true;preview.className='faceting-diagram-preview';
    controls.node('chart').after(panel);panel.append(preview);this.panel=panel;
    const guard=controls.context.guard;
    this.node('prepare').onclick=guard(()=>this.prepare());
    this.node('start').onclick=guard(()=>{controls.verifyReply();this.pending=[controls.reply.diagram.mainVertexId];this.sync();});
    this.node('finish').onclick=guard(()=>this.finish());
    this.node('abandon').onclick=()=>{this.pending=null;this.sync();};
    this.node('remove').onclick=guard(()=>this.remove());
    this.node('undo').onclick=guard(()=>this.travel(-1));this.node('redo').onclick=guard(()=>this.travel(1));
    this.node('base').onclick=guard(()=>controls.apply('make-base'));
  }
  node(key){return this.panel.querySelector('#faceting-editor-'+key);}
  reset(){this.pending=null;this.history.reset();this.historyBase=null;this.sync();}
  record(reply){this.history.push({parameters:reply.state.parameters});}
  installed(reply){
    this.pending=null;
    if(this.historyBase&&JSON.stringify([this.historyBase.source,this.historyBase.catalogue])!==JSON.stringify([reply.state.source,reply.state.catalogue]))this.history.reset();
    this.historyBase=reply.state;
    if(!this.history.states.length)this.history.reset({parameters:reply.state.parameters});
    this.sync();
  }
  async prepare(){
    if(this.controls.busy||this.controls.context.isExporting())throw Error('Finish the current action first.');
    if(!this.controls.context.prepareCatalogue)throw Error('Build a source-symmetry candidate pool first.');
    this.preparing=true;this.controls.sync();
    try{
      await this.controls.context.prepareCatalogue();
      this.controls.node('seeds').value='';this.controls.node('link').checked=false;
      await this.controls.apply('build');await this.controls.apply('save');
      this.history.reset({parameters:this.controls.reply.state.parameters});
    }finally{this.preparing=false;this.controls.sync();}
  }
  pickVertex(vertex){
    if(!this.pending)return false;
    if(this.pending.includes(vertex))throw Error('Each source vertex can occur only once in this polygon. Use Finish polygon to close it.');
    if(this.pending.length>=8)throw Error('At most 8 corners are supported per facet.');
    this.pending.push(vertex);this.sync();return true;
  }
  async finish(){
    this.controls.verifyReply();
    if(!this.pending)throw Error('Choose Draw polygon first.');
    const seed=pickedFacet(this.controls.reply.diagram,this.pending);
    await this.edit([...new Set([...this.controls.reply.diagram.selection.seedCandidateIds,seed])]);
  }
  async remove(){
    this.controls.verifyReply();const seed=this.node('facets').value;
    if(!this.controls.reply.diagram.selection.seedCandidateIds.includes(seed))throw Error('Choose a seed facet to remove.');
    await this.edit(this.controls.reply.diagram.selection.seedCandidateIds.filter(id=>id!==seed));
  }
  async edit(seeds){
    this.controls.verifyReply();
    const before=clone(this.controls.reply.state);this.history.push({parameters:before.parameters});
    this.controls.node('seeds').value=seeds.join('\n');this.controls.node('link').checked=false;
    try{
      await this.controls.apply('build');
      if(!this.controls.reply)throw Error('Diagram edit could not be verified.');
      await this.controls.apply('save');this.record(this.controls.reply);
    }catch(error){this.controls.setFields(before.parameters);throw error;}
    finally{this.sync();}
  }
  async travel(delta){
    const target=this.history.target(delta);if(!target)throw Error('No diagram edit in that direction.');
    const state={...this.historyBase,parameters:target.parameters};
    await this.controls.apply('restore',state);
    if(!this.controls.reply)throw Error('Diagram history could not be restored.');
    await this.controls.apply('save');this.history.cursor+=delta;this.pending=null;this.sync();
  }
  sync(){
    const c=this.controls,reply=c.reply,model=c.context.getState()?.model;
    const eligible=model?.dimension===3&&(model.embeddingDimension??3)===3&&model.vertices?.length>=4&&model.vertices.length<=12;
    const disabled=c.busy||this.preparing||c.context.isExporting()||!eligible;
    for(const node of this.panel.querySelectorAll('button,select'))node.disabled=disabled||!reply;
    this.node('prepare').disabled=disabled||!c.context.prepareCatalogue;
    this.node('finish').disabled=disabled||!this.pending||this.pending.length<3;
    this.node('abandon').disabled=disabled||!this.pending;
    this.node('undo').disabled=disabled||!this.history.target(-1);
    this.node('redo').disabled=disabled||!this.history.target(1);
    this.node('base').disabled=disabled||!reply?.previewModel;
    const select=this.node('facets'),previous=select.value;select.replaceChildren();
    for(const id of reply?.diagram.selection.seedCandidateIds??[]){
      const row=reply.diagram.catalogue.candidates.find(row=>row.id===id),option=document.createElement('option');
      option.value=id;option.textContent=row.cycle.map(v=>'V'+v).join(' → ');select.append(option);
    }
    select.value=(reply?.diagram.selection.seedCandidateIds??[]).includes(previous)?previous:reply?.diagram.selection.seedCandidateIds[0]??'';
    this.node('remove').disabled=disabled||!select.value;
    this.node('path').textContent=this.pending?'Polygon: '+this.pending.map(v=>'V'+v).join(' → '):
      reply?`${reply.diagram.selection.seedCandidateIds.length} seeds → ${reply.diagram.selection.expandedCycles.length} replicated facets; subgroup order ${reply.diagram.selection.actionIndices.length}. Edits save with this source view.`:'';
    for(const node of c.node('chart').querySelectorAll('circle[data-source-vertex-id]'))
      node.setAttribute('fill',this.pending?.includes(Number(node.getAttribute('data-source-vertex-id')))?'#f59e0b':'#fff');
  }
}
