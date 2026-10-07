import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const id=/^facet-[0-9a-f]{64}$/;

// Native SVG is checked before insertion: diagrams never need scripts, external
// references, arbitrary styles or foreign content. Picking retains native IDs.
export function checkedDiagramSVG(svg){
  if(typeof svg!=='string'||new TextEncoder().encode(svg).length>32*1024*1024)throw Error('Diagram SVG exceeds its bound.');
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
  const root=parsed.documentElement,allowed=new Set(['svg','g','line','circle','path','text','metadata','title']);
  if(root.localName!=='svg'||parsed.querySelector('parsererror'))throw Error('Malformed native diagram SVG.');
  const nodes=[root,...root.querySelectorAll('*')];if(nodes.length>100000)throw Error('Diagram SVG exceeds its element limit.');
  for(const node of nodes){
    if(node.namespaceURI!=='http://www.w3.org/2000/svg'||!allowed.has(node.localName))throw Error('Unsupported native diagram SVG content.');
    for(const attr of node.attributes){
      if(/^on/i.test(attr.name)||['href','xlink:href','style'].includes(attr.name)||/url\s*\(/i.test(attr.value))
        throw Error('Diagram SVG cannot contain executable or external references.');
    }
  }
  return root;
}

export class FacetingDiagramControls{
  constructor(context){
    this.context=context;this.busy=false;this.reply=null;
    const panel=document.createElement('details');panel.id='faceting-diagram-settings';
    panel.innerHTML='<summary>Faceting diagram (3D)</summary><label>Main vertex <select id="faceting-diagram-vertex"></select></label><label>Candidate cycles <textarea id="faceting-diagram-seeds" rows="2" spellcheck="false" placeholder="Literal facet IDs; blank is a draft"></textarea></label><label><input id="faceting-diagram-reflections" type="checkbox" checked> Include verified reflections</label><label><input id="faceting-diagram-link" type="checkbox"> Link selected search result</label><div class="button-row"><label><input id="faceting-diagram-hide-lines" type="checkbox"> Hide unselected lines</label><label><input id="faceting-diagram-hide-vertices" type="checkbox"> Hide vertex points when facets exist</label></div><div class="button-row"><button id="faceting-diagram-build">Draw</button><button id="faceting-diagram-restore">Restore saved diagram</button><button id="faceting-diagram-cancel">Cancel</button></div><output id="faceting-diagram-status" aria-live="polite"></output><div id="faceting-diagram-chart" hidden style="overflow:auto;max-height:300px"></div><output id="faceting-diagram-pick"></output><div class="button-row"><button id="faceting-diagram-save">Save diagram parameters</button><button id="faceting-diagram-adopt">Adopt linked result</button></div>';
    document.getElementById('automatic-faceting-settings').after(panel);this.panel=panel;
    const choices=document.createElement('div');choices.innerHTML='<label>Picked plane cycle <select id="faceting-diagram-cycle"></select></label><div class="button-row"><button id="faceting-diagram-add-cycle">Add cycle to draft</button><button id="faceting-diagram-remove-cycle">Remove cycle from draft</button></div>';
    this.node('pick').after(choices);this.choices=choices;
    for(const action of ['build','restore','save','adopt'])this.node(action).onclick=context.guard(()=>this.apply(action));
    this.node('cancel').onclick=()=>this.cancel();
    this.node('add-cycle').onclick=context.guard(()=>this.editPicked(false));
    this.node('remove-cycle').onclick=context.guard(()=>this.editPicked(true));
    this.node('chart').onclick=context.guard(event=>this.pick(event));this.sync();
  }
  node(key){return this.panel.querySelector('#faceting-diagram-'+key)??this.choices?.querySelector('#faceting-diagram-'+key);}
  read(){return {vertex:this.node('vertex').value,seeds:this.node('seeds').value,
    reflections:this.node('reflections').checked,link:this.node('link').checked,
    hideLines:this.node('hide-lines').checked,hideVertices:this.node('hide-vertices').checked};}
  signature(){return JSON.stringify(this.read());}
  searchSignature(){return this.context.searchSignature();}
  seeds(text){
    if(typeof text!=='string'||text.length>20000)throw Error('Diagram facet IDs exceed their bound.');
    const values=text.trim()?text.trim().split(/[\s,;]+/):[];
    if(values.length>128||new Set(values).size!==values.length||values.some(v=>!id.test(v)))throw Error('Use distinct source candidate IDs, at most128.');
    return values;
  }
  verifyReply(){
    if(!this.reply)throw Error('Draw or restore a complete diagram first.');
    verifyNativeSource(this.context,this.owner);
    if(this.signature()!==this.form||this.searchSignature()!==this.searchForm)throw Error('Diagram source, fields or search changed. Draw again.');
    if(this.reply.diagram.status!=='complete')throw Error('Incomplete diagrams cannot save or adopt.');
  }
  async apply(action){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current action first.');
    if(!['build','restore','save','adopt'].includes(action))throw Error('Choose a supported diagram action.');
    const model=this.context.getState()?.model;
    if(model?.dimension!==3||(model.embeddingDimension??3)!==3)throw Error('Faceting diagrams require intrinsic3D source coordinates.');
    if(!Array.isArray(model.vertices)||model.vertices.length<4||model.vertices.length>12)throw Error('The current bounded diagram domain supports4–12 source vertices.');
    const input=this.read(),form=this.signature(),searchForm=this.searchSignature();let params;
    if(action==='build'){
      if(!/^(0|[1-9]\d*)$/.test(input.vertex)||!Number.isSafeInteger(Number(input.vertex))||Number(input.vertex)>=model.vertices.length)
        throw Error('Choose a literal source vertex ID.');
      const parameters={vertex_id:Number(input.vertex),reflections:input.reflections,
        hide_diagram_when_selected:input.hideLines,hide_vertices_when_selected:input.hideVertices};
      if(input.link)Object.assign(parameters,clone(this.context.selectedResult()));
      else parameters.seed_ids=this.seeds(input.seeds);
      params={catalogue:clone(this.context.catalogue()),parameters};
    }else if(action==='restore'){
      const saved=this.context.getState().view.facetingDiagram;
      if(!saved)throw Error('This source has no saved diagram parameters.');params={state:clone(saved)};
    }else{
      this.verifyReply();
      if(action==='adopt'&&!this.reply.adoptionParameters)throw Error('Draft diagrams need a verified retained search result before adoption.');
    }
    const entry=new NumericEntry(this.context);this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run({confirm:{text:'0',min:0,max:0}},async(_,numericVerify,{source,signal})=>{
      const verify=()=>{numericVerify();if(this.signature()!==form||this.searchSignature()!==searchForm)
          throw Error('Diagram target or search fields changed. Repeat the action.');};
      const options={signal,sourceSnapshot:source,verifyPublication:verify};verify();
      if(action==='save'){
        await this.context.save(clone(this.reply.state),options);return;
      }
      if(action==='adopt'){
        this.publishing=true;
        try{await this.context.commit('facet-adopt',clone(this.reply.adoptionParameters),'Adopt diagram-linked faceting',options);}
        finally{this.publishing=false;}
        this.invalidate({cancelActive:false});return;
      }
      const reply=await this.context.read('facet-diagram',clone(params),source,options);verify();
      if(reply.diagram.status!=='complete'){
        this.clear();this.node('status').textContent=`${reply.diagram.status}: ${reply.diagram.diagnostics.join('; ')}`;
        this.node('status').dataset.status=reply.diagram.status;return reply;
      }
      // Parse/validate before a native-linked preview can become visible.
      const svgRoot=checkedDiagramSVG(reply.svg);verify();
      if(reply.adoptionParameters&&this.context.preview){await this.context.preview(reply.diagram.adoption.model,options);verify();this.previewVisible=true;}
      this.install(reply,options,svgRoot);verify();this.reply=clone(reply);
      if(action==='restore'){
        const p=reply.diagram.parameters;this.node('vertex').value=String(p.vertex_id);
        this.node('seeds').value=(p.seed_ids??[]).join('\n');this.node('reflections').checked=p.reflections;
        this.node('link').checked=Boolean(p.search);this.node('hide-lines').checked=p.hide_diagram_when_selected;
        this.node('hide-vertices').checked=p.hide_vertices_when_selected;
      }
      this.owner=captureNativeSource(this.context);this.form=this.signature();this.searchForm=this.searchSignature();
      this.node('status').textContent=`${reply.diagram.vertices.length} projected source vertices; ${reply.diagram.lines.length} planes. `+
        (reply.adoptionParameters?'Linked native result verified.':'Draft cycles; no search-validity claim.')+
        (!reply.diagram.presentationComplete?' Exact finite paint omissions recorded.':'');
      this.node('status').dataset.status='complete';return reply;
    });}catch(error){this.clear();this.node('status').textContent=error.message;
      this.node('status').dataset.status=error.name==='AbortError'?'user-cancelled':'refused';throw error;}
    finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  install(reply,options,parsed){
    options.verifyPublication();const root=parsed??checkedDiagramSVG(reply.svg);options.verifyPublication();
    this.node('chart').replaceChildren(document.importNode(root,true));this.node('chart').hidden=false;
  }
  pick(event){
    if(this.busy||this.context.isExporting())throw Error('Finish the current action before diagram picks.');this.verifyReply();
    const node=event.target?.closest?.('[data-source-vertex-id],[data-candidate-id],[data-plane-id]');if(!node)return;
    const diagram=this.reply.diagram,vertex=node.getAttribute('data-source-vertex-id'),candidate=node.getAttribute('data-candidate-id'),plane=node.getAttribute('data-plane-id');
    if(vertex!==null){
      if(!/^(0|[1-9]\d*)$/.test(vertex)||!diagram.vertices.some(row=>row.sourceVertexId===Number(vertex)))throw Error('Diagram pick has no native vertex owner.');
      this.node('vertex').value=vertex;this.clear();this.node('pick').textContent=`Selected source vertex ${vertex}; Draw to use its chart.`;this.sync();return;
    }
    const line=plane!==null?diagram.lines.find(row=>row.planeId===plane):
      diagram.lines.find(row=>row.candidateIds.includes(candidate));
    if(!line||candidate!==null&&!line.candidateIds.includes(candidate))throw Error('Diagram pick is not owned by its source plane.');
    if(candidate!==null&&!line.selectedCandidateIds.includes(candidate))throw Error('Choose a retained selected facet.');
    this.picked=line.candidateIds.slice();this.node('cycle').replaceChildren();
    for(const value of this.picked){const choice=document.createElement('option');choice.value=value;
      const row=diagram.catalogue.candidates.find(row=>row.id===value);choice.textContent=`${row.cycle.join(' → ')}${row.sourceFaceIds.length?' · source face':''}`;
      this.node('cycle').append(choice);}
    this.node('cycle').value=candidate??this.picked[0]??'';
    this.sync();
    if(candidate!==null){
      this.node('pick').textContent=`Selected candidate ${candidate}; source plane ${line.planeId}.`;return;
    }
    this.node('pick').textContent=`Plane ${line.planeId}: ${line.candidateIds.length} source cycles; choose an explicit candidate.`;
  }
  editPicked(remove){
    if(this.busy||this.context.isExporting())throw Error('Finish the current action before editing draft cycles.');this.verifyReply();
    const chosen=this.node('cycle').value;if(!this.picked?.includes(chosen))throw Error('Pick a source plane and one of its explicit cycles first.');
    const selected=this.reply.diagram.selection.seedCandidateIds.slice();
    const catalogue=this.reply.diagram.catalogue,selectedIndex=catalogue.candidates.findIndex(row=>row.id===chosen);
    const updated=remove?selected.filter(value=>{
      const seedIndex=catalogue.candidates.findIndex(row=>row.id===value);
      return !this.reply.diagram.selection.actionIndices.some(g=>catalogue.symmetry.candidateActionIndices[g][seedIndex]===selectedIndex);
    }):[...new Set([...selected,chosen])];
    if(updated.length>128)throw Error('Draft seed selection exceeds128 cycles.');
    this.node('seeds').value=updated.join('\n');this.node('link').checked=false;
    this.clear();this.node('status').textContent='Draft selection changed. Draw to verify subgroup replication.';this.sync();
  }
  clear(){this.reply=null;this.picked=null;this.node('cycle').replaceChildren();this.node('chart').replaceChildren();this.node('chart').hidden=true;
    if(this.previewVisible){this.context.clearPreview?.();this.previewVisible=false;}}
  cancel(){this.entry?.cancel();}
  invalidate({cancelActive=true}={}){if(cancelActive&&!this.publishing)this.cancel();this.clear();this.vertexModel=null;this.sync();}
  sync(){
    const model=this.context.getState()?.model,eligible=model?.dimension===3&&(model.embeddingDimension??3)===3&&model.vertices?.length>=4&&model.vertices.length<=12;
    if(model!==this.vertexModel){
      this.vertexModel=model;this.node('vertex').replaceChildren();
      if(eligible)model.vertices.forEach((_,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`V${i}`;this.node('vertex').append(option);});
      if(eligible)this.node('vertex').value='0';
    }
    let stale=false;if(this.reply){try{this.verifyReply();}catch{stale=true;}}
    if(stale){this.clear();if(!this.busy){this.node('status').textContent='stale: source, fields or search changed. Draw or restore explicitly.';this.node('status').dataset.status='stale';}}
    const disabled=this.busy||this.context.isExporting()||!eligible;
    for(const node of this.panel.querySelectorAll('button,input,select,textarea'))node.disabled=disabled;
    for(const node of this.choices.querySelectorAll('button,select'))node.disabled=disabled||!this.reply||!this.picked?.length;
    this.node('cancel').disabled=!this.busy;
    this.node('restore').disabled=disabled||!this.context.getState()?.view.facetingDiagram;
    this.node('save').disabled=disabled||!this.reply;
    this.node('adopt').disabled=disabled||!this.reply?.adoptionParameters;
  }
}
