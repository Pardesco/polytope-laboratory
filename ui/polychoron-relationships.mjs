import {createStatus} from './status.mjs';
export class PolychoronRelationshipControls {
  constructor({document,after,getState,getEntries,open,run,guard,isExporting}){
    Object.assign(this,{document,getState,getEntries,open,run,guard,isExporting});this.sequence=0;
    this.root=document.createElement('section');this.root.id='polychoron-relationships';this.root.className='inspector-card';after.after(this.root);
  }
  node(tag,text,id){const node=this.document.createElement(tag);node.textContent=text;if(id)node.id=id;return node;}
  cancel(){this.sequence++;this.status?.settle(this.progress);if(this.controller&&this.output)this.output.textContent='Relationship check canceled.';this.controller?.abort();this.controller=null;}
  sync(){
    this.cancel();const source=this.getState(),model=source?.model,root=this.root;root.replaceChildren();
    root.hidden=model?.dimension!==4;if(root.hidden)return;
    root.append(this.node('div','4D compounds / scaliforms','polychoron-relationships-title'));
    const metadata=model.metadata??{},compound=metadata.compound4Evidence,scaliform=metadata.scaliform4Evidence;
    const current=e=>e?.resultFingerprint===model.fingerprint;
    root.append(this.node('p',`Components: ${model.components?.length||1}. Source fissary classification: ${typeof metadata.fissary==='boolean'?(metadata.fissary?'Yes':'No'):'Unknown'}.`,'polychoron-classification'));
    if(current(compound)){
      root.append(this.node('p',`${compound.distinctVertexCount} distinct frame positions; vertex multiplicity ${compound.vertexMultiplicity}. ${compound.group}, order ${compound.groupOrder}. ${compound.symmetryScope}.`,'polychoron-frame-summary'));
      const entry=this.getEntries().find(e=>e.key===compound.frameKey);
      if(entry){const button=this.node('button','Open frame type: '+entry.name,'polychoron-open-frame');button.disabled=Boolean(this.isExporting?.());
        button.onclick=this.guard(()=>{if(this.getState()!==source||this.isExporting?.())throw Error('Source changed or export is active.');return this.open(entry);});root.append(button);}
    }
    if(current(scaliform))root.append(this.node('p',scaliform.definition+' Cells: '+scaliform.cellInventory.map(c=>c.count+' × '+c.name).join(', ')+'.','polychoron-scaliform-summary'));
    const button=this.node('button','Check literal vertex links','polychoron-check-links');button.disabled=Boolean(this.isExporting?.());
    button.onclick=this.guard(()=>this.check());root.append(button);
    this.output=this.node('output','Connectivity uses source IDs. Coincident coordinates remain separate. Frame type links use library scale and orientation.','polychoron-link-result');root.append(this.output);
    this.output.setAttribute?.('role','status');
    const details=this.node('details','','polychoron-construction-evidence');details.append(this.node('summary','Construction evidence and limits'));
    const e=current(compound)?compound:current(scaliform)?scaliform:null;
    details.append(this.node('p',e?'Float64, approximate; no exact certificate. '+(e.construction??''):'No current native construction receipt.'));
    if(e){const residual=compound===e?`Frame action residual ${e.frameActionResidual}; frame vertex residual ${e.frameVertexResidual}.`:
      `Edge relative spread ${e.edgeRelativeSpread}; element circumsphere relative spread ${e.maxElementCircumsphereRelativeSpread}; numerical symmetry order ${e.symmetryOrder}.`;
      details.append(this.node('p',residual));}
    details.append(this.node('p','A closed vertex link does not classify every fissary rank. This is a finite catalog slice; unrestricted regiments and the full regular-compound catalog remain incomplete.'));
    for(const reference of metadata.referenceUrls??[])if(typeof reference==='string'&&reference.startsWith('https://'))details.append(this.node('p','Reference: '+reference));
    root.append(details);
  }
  async check(){
    if(this.isExporting?.())throw Error('Finish or cancel export before checking relationships.');
    this.cancel();const sequence=this.sequence,source=this.getState(),model=source?.model;
    if(model?.dimension!==4)throw Error('Open a 4D source first.');
    const spelling=JSON.stringify(model),controller=new AbortController(),output=this.output;this.controller=controller;
    const current=()=>sequence===this.sequence&&!controller.signal.aborted&&this.getState()===source&&source.model===model&&JSON.stringify(model)===spelling&&!this.isExporting?.();
    const status=this.status=createStatus(text=>{if(current())output.textContent=text;});status.set('');
    const progress=this.progress=status.defer('Checking literal vertex links…');
    try{
      const result=await this.run('polychoron-relationships',{},model,'Check polychoron relationships',{signal:controller.signal});
      if(!current())return null;
      output.textContent=`${result.componentCount} component(s); ${result.disconnectedVertexIds.length} vertices with disconnected literal cell links. Source fissary classification: ${typeof result.classification.fissary==='boolean'?(result.classification.fissary?'Yes':'No'):'Unknown'}. ${result.scope}`;
      return result;
    }catch(error){if(current())output.textContent='Check unavailable: '+error.message;if(current())throw error;return null;}
    finally{status.settle(progress);if(this.controller===controller)this.controller=null;}
  }
}
