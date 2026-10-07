import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const limits={max_face_vertices:[3,8],max_candidates:[1,4096],max_cycles_per_plane:[1,4096],
  node_limit:[1,200000],result_limit:[1,128],min_face_types:[1,4096],max_face_types:[0,4096],max_faces_per_plane:[0,4096]};
const generation=['max_face_vertices','max_candidates','max_cycles_per_plane'];
const statusText=receipt=>`${receipt.status}: ${receipt.results?.length??receipt.candidates?.length??0} ${receipt.results?'results':'candidates'}. `+
  (receipt.countMeaning??'Candidate domain only.')+(receipt.limitReasons?.length?` ${receipt.limitReasons.join('; ')}.`:'');

export class AutomaticFacetingControls{
  constructor(context){
    this.context=context;this.busy=false;this.catalogue=null;this.search=null;
    const panel=document.createElement('details');panel.id='automatic-faceting-settings';
    panel.innerHTML='<summary>Automatic facets (3D)</summary><label>Criterion <select id="faceting-criterion"><option value="closed">Closed incidence</option><option value="isohedral">Isohedral in selected subgroup</option><option value="tidy-dual">Tidy faceting and finite polar dual</option><option value="tidy">Tidy · closed single-link domain</option><option value="spiky">Spiky · no hull-boundary edges</option><option value="tidy-spiky">Tidy and spiky</option></select></label><label>Dual center · blank source vertex mean <input id="faceting-dual-center" value="" placeholder="x; y; z" maxlength="512"></label><label>Dual sphere radius <input id="faceting-dual-radius" value="1" maxlength="512"></label><p class="muted">Polar duals use source face and vertex incidence. Near-singular numerical domains stop with a diagnostic. Search remains bounded to closed single-link facetings on 4–12 source vertices.</p><div class="button-row"><label>Min types <input id="faceting-min_face_types" value="1"></label><label>Max types · 0 unlimited <input id="faceting-max_face_types" value="0"></label></div><label><input id="faceting-partial" type="checkbox"> Allow unused source vertices</label><label><input id="faceting-coplanar" type="checkbox"> Allow coplanar faces sharing vertices</label><label><input id="faceting-invariant" type="checkbox"> Keep selected subgroup symmetry</label><label>Source symmetry <select id="faceting-symmetry-mode"><option value="declared">Declared subgroup · blank identity</option><option value="all">Discover full source group</option><option value="proper">Discover rotations only</option></select></label><p class="muted">Automatic discovery preserves exact source distances and ordered incidence. Rounded coordinates may have less exact symmetry than a nominal regular solid.</p><label>Result equivalence <select id="faceting-equivalence"><option value="labeled">Labeled cycles</option><option value="subgroup">Verified subgroup</option></select></label><details><summary>Bounds and source actions</summary><label>Face corners <input id="faceting-max_face_vertices" value="8"></label><label>Candidate cap <input id="faceting-max_candidates" value="4096"></label><label>Candidate cap per plane <input id="faceting-max_cycles_per_plane" value="4096"></label><label>Search nodes <input id="faceting-node_limit" value="200000"></label><label>Stored results <input id="faceting-result_limit" value="128"></label><label>Source symmetry work cap <input id="faceting-symmetry-work" value="500000"></label><label>Subgroup elements · blank identity <textarea id="faceting-actions" rows="3" spellcheck="false" placeholder="Complete vertex-permutation list"></textarea></label><label>Result faces per plane · 0 unlimited <input id="faceting-max_faces_per_plane" value="0"></label><label>Exact result plane counts <textarea id="faceting-plane-counts" rows="2" spellcheck="false" placeholder="{&quot;plane-…&quot;: 1}"></textarea></label></details><button id="faceting-candidates">Build candidate pool</button><output id="faceting-candidate-summary"></output><label>Candidate IDs · blank all <textarea id="faceting-pool" rows="3" spellcheck="false"></textarea></label><div class="button-row"><button id="faceting-source-faces">Use source faces</button><button id="faceting-search">Search</button><button id="faceting-cancel">Cancel</button></div><output id="faceting-status" aria-live="polite"></output><label>Result <select id="faceting-result"></select></label><div class="button-row"><button id="faceting-preview">Preview</button><button id="faceting-adopt">Adopt</button><button id="faceting-clear">Clear preview</button></div><div id="facet-preview" hidden style="height:220px;position:relative"></div><pre id="faceting-evidence" class="code-box"></pre>';
    document.getElementById('facet').after(panel);this.panel=panel;
    for(const action of ['candidates','search','preview','adopt'])this.node(action).onclick=context.guard(()=>this.apply(action));
    this.node('cancel').onclick=()=>this.cancel();this.node('source-faces').onclick=context.guard(()=>this.useSourceFaces());
    this.node('criterion').onchange=context.guard(()=>this.sync());
    this.node('symmetry-mode').onchange=context.guard(()=>this.sync());
    this.node('clear').onclick=()=>this.clearPreview();this.node('result').onchange=()=>this.clearPreview();
    for(const node of panel.querySelectorAll('input:not([type="checkbox"])')){node.type='text';node.inputMode='decimal';}
    this.sync();
  }
  node(name){return this.panel.querySelector('#faceting-'+name);}
  read(){
    const value={};for(const key of Object.keys(limits))value[key]=this.node(key).value;
    for(const key of ['criterion','equivalence','actions','plane-counts','pool','dual-center','dual-radius','symmetry-mode','symmetry-work'])value[key]=this.node(key).value;
    for(const key of ['partial','coplanar','invariant'])value[key]=this.node(key).checked;
    return value;
  }
  signature(){return JSON.stringify(this.read());}
  generationSignature(){const input=this.read();return JSON.stringify([...generation,'actions','symmetry-mode','symmetry-work'].map(key=>input[key]));}
  literal(text,label,maximum){
    if(typeof text!=='string'||text.length>maximum)throw Error(`${label} exceeds its text bound.`);
    return text.trim()?JSON.parse(text):undefined;
  }
  selected(){
    if(!this.search)throw Error('Search before selecting a result.');
    verifyNativeSource(this.context,this.searchOwner);
    if(this.signature()!==this.searchForm)throw Error('Search inputs changed. Search again.');
    const id=this.node('result').value,row=this.search.results.find(row=>row.id===id);
    if(!row)throw Error('Choose a retained result; empty or refused searches cannot be adopted.');
    return {search:clone(this.search),result_id:id};
  }
  async apply(action){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current action before faceting.');
    if(!['candidates','search','preview','adopt'].includes(action))throw Error('Choose a supported faceting action.');
    const model=this.context.getState()?.model;
    if(model?.dimension!==3||(model.embeddingDimension??3)!==3)throw Error('Automatic facets require intrinsic 3D source coordinates.');
    const input=this.read(),signature=this.signature(),selectedResult=this.node('result').value;let args,fields={};
    if(action==='preview'||action==='adopt'){
      args=this.selected();fields.confirm={text:'0',min:0,max:0};
    }else{
      if(!['closed','isohedral','tidy','spiky','tidy-spiky','tidy-dual'].includes(input.criterion)||!['labeled','subgroup'].includes(input.equivalence))
        throw Error('Choose an implemented criterion and equivalence.');
      const symmetry=this.literal(input.actions,'Source subgroup',65536);
      const keys=action==='candidates'?generation:Object.keys(limits);
      for(const key of keys){const [min,max]=limits[key];fields[key]={text:input[key],integer:true,min,max};}
      args={};
      if(!['declared','all','proper'].includes(input['symmetry-mode']))throw Error('Choose declared, full or proper source symmetry.');
      if(input['symmetry-mode']==='declared'){if(symmetry!==undefined)args.symmetry_permutations=symmetry;}
      else{
        if(input.actions.trim())throw Error('Clear declared permutations before automatic symmetry discovery.');
        args.source_symmetry={mode:input['symmetry-mode']};
        fields.symmetry_work={text:input['symmetry-work'],integer:true,min:1,max:500000};
      }
      if(action==='search'){
        args.equivalence=input.equivalence;args.invariant_under_subgroup=input.invariant;
        args.criteria={accept_partial:input.partial,coplanar_vertices:input.coplanar?'allow':'disjoint',isohedral:input.criterion==='isohedral'};
        if(['tidy','tidy-spiky'].includes(input.criterion))args.criteria.tidy=true;
        if(['spiky','tidy-spiky'].includes(input.criterion))args.criteria.spiky=true;
        if(input.criterion==='tidy-dual'){
          args.criteria.tidy_dual=true;args.criteria.dual_center=null;
          fields.dual_radius={text:input['dual-radius'],min:0.0001,max:10000};
          if(input['dual-center'].trim())fields.dual_center={kind:'vector',length:3,text:input['dual-center']};
        }
        const planeCounts=this.literal(input['plane-counts'],'Exact plane counts',65536);
        if(planeCounts!==undefined)args.criteria.plane_face_counts=planeCounts;
        if(input.pool.length>512000)throw Error('Candidate selection exceeds its text bound.');
        if(input.pool.trim()){
          const ids=input.pool.trim().split(/[\s,;]+/);if(ids.length>4096||new Set(ids).size!==ids.length||ids.some(id=>!/^facet-[0-9a-f]{64}$/.test(id)))
            throw Error('Use distinct generated literal candidate IDs; blank selects all.');
          args.candidate_ids=ids;
        }
      }
    }
    // The potentially 4,096-ID pool is compared literally outside NumericEntry's
    // small target-signature bound; it is never reduced to a collision-prone hash.
    const entry=new NumericEntry(this.context);this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,async(values,numericVerify,{signal,source})=>{
      const verify=()=>{numericVerify();if(this.signature()!==signature||
        (action==='preview'||action==='adopt')&&this.node('result').value!==selectedResult)
          throw Error('Faceting target fields changed. Repeat the action.');};
      verify();
      if(action==='candidates'||action==='search'){
        for(const key of generation)args[key]=values[key];
        if(args.source_symmetry)args.source_symmetry.work_limit=values.symmetry_work;
        if(action==='search'){
          args.node_limit=values.node_limit;args.result_limit=values.result_limit;
          if(args.criteria.tidy_dual){args.criteria.dual_radius=values.dual_radius;args.criteria.dual_center=values.dual_center??null;}
          for(const key of ['min_face_types','max_face_types','max_faces_per_plane'])args.criteria[key]=values[key];
        }
      }
      const options={signal,verifyPublication:verify,sourceSnapshot:source};
      if(action==='adopt'){
        this.publishing=true;
        try{await this.context.commit('facet-adopt',clone(args),'Adopt faceting',options);}finally{this.publishing=false;}
        if(signal.aborted)throw Object.assign(Error('Faceting canceled.'),{name:'AbortError'});
        this.invalidate({cancelActive:false});return;
      }
      const op=action==='candidates'?'facet-candidates':action==='search'?'facet-search':'facet-adopt';
      const result=await this.context.read(op,clone(args),source,options);verify();
      if(action==='preview'){
        await this.context.preview(result,options);verify();this.node('evidence').textContent=JSON.stringify({
          vertices:result.vertices.length,edges:result.edges.length,faces:result.faces.length,
          types:result.metadata.facetingSymmetry.faceTypeCount,criteria:result.metadata.facetingCriteria,
          solidInterpretation:result.metadata.solidInterpretation},null,2);
      }else if(action==='candidates'){
        this.catalogue=clone(result);this.catalogueOwner=captureNativeSource(this.context);this.catalogueForm=this.generationSignature();
        this.node('candidate-summary').textContent=statusText(result)+(result.sourceSymmetryDiscovery?` Source symmetry: ${result.sourceSymmetryDiscovery.status}; ${result.sourceSymmetryDiscovery.verifiedActionsFound} verified actions; selected order ${result.sourceSymmetryDiscovery.complete?result.symmetry.group.order:'unresolved'}.`:'');
        this.node('evidence').textContent=JSON.stringify(result.candidates.map(row=>({id:row.id,plane:row.planeId,cycle:row.cycle,sourceFaceIds:row.sourceFaceIds})),null,2);
      }else{
        this.search=clone(result);this.searchOwner=captureNativeSource(this.context);this.searchForm=this.signature();
        const select=this.node('result');select.replaceChildren();
        result.results.forEach((row,index)=>{const option=document.createElement('option');option.value=row.id;
          option.textContent=`${index+1}: ${row.cycles.length} faces · ${row.symmetryEvidence.faceTypeCount} types`;select.append(option);});
        if(result.results.length)select.value=result.results[0].id;
        this.clearPreview();this.node('status').textContent=statusText(result);this.node('status').dataset.status=result.status;
        this.node('evidence').textContent=JSON.stringify({phaseStatus:result.phaseStatus,nodes:result.nodesVisited,
          accepted:result.labeledSelectionsAccepted,distinct:result.distinctResultsFound,domain:result.domain,
          ...(result.sourceSymmetryDiscovery?{sourceSymmetry:result.sourceSymmetryDiscovery}:{}),
          ...(result.tidyDualScope?{tidyDualScope:result.tidyDualScope,tidyDualRejections:result.tidyDualRejections,exactPolicyWork:result.exactPolicyWork}:{})},null,2);
      }
      return result;
    });}catch(error){this.node('status').textContent=error.message;this.node('status').dataset.status=error.name==='AbortError'?'user-cancelled':'refused';throw error;}
    finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  useSourceFaces(){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current action first.');
    if(!this.catalogue)throw Error('Build a candidate pool first.');
    verifyNativeSource(this.context,this.catalogueOwner);
    if(this.generationSignature()!==this.catalogueForm)throw Error('Candidate bounds or actions changed. Rebuild the pool.');
    this.node('pool').value=this.catalogue.candidates.filter(row=>row.sourceFaceIds.length).map(row=>row.id).join('\n');
    this.clearPreview();this.sync();
  }
  clearPreview(){this.context.clearPreview?.();this.panel.querySelector('#facet-preview').hidden=true;}
  invalidate({cancelActive=true}={}){if(cancelActive&&!this.publishing)this.cancel();this.catalogue=null;this.search=null;this.clearPreview();
    this.node('result').replaceChildren();this.node('candidate-summary').textContent='';this.node('evidence').textContent='';
    this.node('status').textContent='';delete this.node('status').dataset.status;this.sync();}
  cancel(){this.entry?.cancel();}
  sync(){
    const model=this.context.getState()?.model,eligible=model?.dimension===3&&(model.embeddingDimension??3)===3;
    let stale=false;
    if(this.search){try{verifyNativeSource(this.context,this.searchOwner);stale=this.signature()!==this.searchForm;}catch{stale=true;}}
    if(stale){this.clearPreview();if(!this.busy){this.node('status').textContent='stale: source or search inputs changed. Search again.';this.node('status').dataset.status='stale';}}
    const disabled=this.busy||this.context.isExporting()||!eligible;
    for(const node of this.panel.querySelectorAll('button,input,select,textarea'))node.disabled=disabled;
    this.node('actions').disabled=disabled||this.node('symmetry-mode').value!=='declared';
    this.node('symmetry-work').disabled=disabled||this.node('symmetry-mode').value==='declared';
    this.node('dual-center').disabled=this.node('dual-radius').disabled=disabled||this.node('criterion').value!=='tidy-dual';
    this.node('cancel').disabled=!this.busy;
    this.node('source-faces').disabled=disabled||!this.catalogue;
    this.node('preview').disabled=this.node('adopt').disabled=disabled||stale||!this.search?.results.length;
  }
}
