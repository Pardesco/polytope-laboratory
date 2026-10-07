import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {NumericEntry} from './numeric-entry.mjs';
const canceled=()=>Object.assign(Error('Vertex-figure construction canceled.'),{name:'AbortError'});
const eligible=m=>m?.dimension===3&&(m.embeddingDimension??3)===3&&m.interpretation==='convex-polytope'&&Array.isArray(m.vertices)&&m.vertices.length>=4&&m.vertices.length<=64;
const content=s=>JSON.stringify([s?.view?.elementAnnotations??null,s?.detachedElementContent??null]);
export class VertexFigureConstructionControls{
  constructor(context,{anchor='construct-panel'}={}){
    this.context=context;this.busy=false;this.generation=0;this.active=null;this.result=null;this.destroyed=false;
    const panel=document.createElement('details');panel.id='vertex-figure-construction-settings';
    panel.innerHTML=`<summary>4D from vertex figure</summary>
      <p class="muted">Use this convex 3D model as a supplied vertex figure. Choose one matching 4D construction; several can share the same figure.</p>
      <label>Candidate domain <select id="vertex-figure-domain"><option value="regular-convex">Six convex regular 4D types</option><option value="regular-and-wythoff">Regular + bounded finite Wythoff</option></select></label>
      <button id="vertex-figure-search">Find matching constructions</button>
      <label>Matching candidate <select id="vertex-figure-candidate"></select></label>
      <label>Output edge length (source units) <input id="vertex-figure-output-length" value="1" maxlength="512"></label>
      <button id="construct-from-vertex-figure">Create 4D document</button>
      <button id="vertex-figure-cancel" hidden>Cancel</button>
      <output id="vertex-figure-construction-status" aria-live="polite"></output>
      <p class="muted">Full metric and face incidence are matched up to similarity. Finite native convex candidates only; no universal uniform or scaliform completion is claimed.</p>`;
    this.panel=panel;if(context.mount)context.mount(panel);else{const target=document.getElementById(anchor);if(!target)throw Error('Vertex-figure controls need a construction panel.');target.append(panel);}
    const guarded=fn=>context.guard?context.guard(fn):fn;
    this.node('vertex-figure-search').onclick=guarded(()=>this.search());this.node('construct-from-vertex-figure').onclick=guarded(()=>this.construct());
    this.node('vertex-figure-candidate').onchange=()=>this.sync();this.node('vertex-figure-cancel').onclick=()=>this.cancel();this.node('vertex-figure-domain').onchange=()=>{this.cancel();this.invalidate();this.sync();};this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  invalidate(){this.result=null;this.node('vertex-figure-candidate').replaceChildren();}
  source(){const owner=captureNativeSource(this.context),model=JSON.parse(owner.modelSignature);if(!eligible(model))throw Error('Choose an intrinsic convex 3D vertex figure with 4..64 vertices.');return {owner,model,content:content(this.context.getState()),domain:this.node('vertex-figure-domain').value};}
  verify(job){if(this.destroyed||this.active!==job||job.generation!==this.generation||job.controller.signal.aborted)throw canceled();verifyNativeSource(this.context,job.owner);if(content(this.context.getState())!==job.content||this.node('vertex-figure-domain').value!==job.domain)throw Error('The supplied vertex figure or candidate domain changed. Repeat the search.');}
  async search(){
    if(this.busy)throw Error('Finish or cancel the current candidate search.');
    const source=this.source(),job={...source,generation:++this.generation,controller:new AbortController()};this.active=job;this.busy=true;this.invalidate();this.sync();
    try{
      this.verify(job);const receipt=await this.context.run('vertex-figure-candidates',{domain:job.domain},job.model,'Match supplied vertex figure',{signal:job.controller.signal,isCurrent:()=>{try{this.verify(job);return true;}catch{return false;}}});this.verify(job);
      if(receipt?.algorithmVersion!=='0.1.0'||receipt.sourceId!==job.model.id||!Array.isArray(receipt.candidates)||receipt.candidates.length>48)throw Error('Invalid native vertex-figure candidate receipt.');
      this.result={...source,receipt};const select=this.node('vertex-figure-candidate');
      select.replaceChildren(...receipt.candidates.map(row=>{const option=document.createElement('option');option.value=row.id;option.textContent=`${row.name}${row.symbol?' '+row.symbol:''} — ${row.counts.vertices} vertices, ${row.counts.cells} cells`;return option;}));
      if(receipt.candidates.length>1){const choice=document.createElement('option');choice.value='';choice.textContent='Choose one matching construction';select.prepend(choice);select.value='';}
      const status=this.node('vertex-figure-construction-status');status.textContent=receipt.candidates.length?`${receipt.candidates.length} matching construction${receipt.candidates.length===1?'':'s'}. ${receipt.candidates.length>1?'Select the intended completion.':'Ready to construct.'}`:'No full metric/incidence match in this finite domain.';status.dataset.status=receipt.status;return receipt;
    }finally{if(this.active===job){this.active=null;this.busy=false;}this.sync();}
  }
  async construct(){
    if(this.busy)throw Error('Finish or cancel the current construction.');const result=this.result;if(!result)throw Error('Find matching candidates first.');
    verifyNativeSource(this.context,result.owner);if(content(this.context.getState())!==result.content)throw Error('Source content changed. Repeat the search.');
    const candidate=this.node('vertex-figure-candidate').value;if(!result.receipt.candidates.some(c=>c.id===candidate))throw Error('Select one explicit matching construction.');
    const read=()=>({candidate:this.node('vertex-figure-candidate').value,length:this.node('vertex-figure-output-length').value,domain:this.node('vertex-figure-domain').value}),input=read();
    const job={...result,generation:++this.generation,controller:new AbortController()},entry=new NumericEntry({...this.context,getTarget:read});job.numericEntry=entry;this.active=job;this.busy=true;this.sync();
    try{return await entry.run({edge_length:{text:input.length,min:1e-6,max:1e6}},async(values,verify)=>{
      const check=()=>{verify();this.verify(job);};check();
      const model=await this.context.run('construct-from-vertex-figure',{candidate,edge_length:values.edge_length},job.model,'Construct 4D from vertex figure',{signal:job.controller.signal,isCurrent:()=>{try{check();return true;}catch{return false;}}});check();
      if(model?.dimension!==4||model.embeddingDimension!==4||model.metadata?.vertexFigureConstruction?.candidate?.id!==candidate)throw Error('Invalid native 4D construction result.');
      // Preserve source in its existing document; native retains its complete
      // model in construction provenance. The new document has ordinary history.
      this.context.addDocument(model,model.name);return model;
    },{signal:job.controller.signal});}finally{if(this.active===job){this.active=null;this.busy=false;}this.sync();}
  }
  cancel(){this.generation++;this.active?.controller.abort();this.active?.numericEntry?.cancel();}
  sync(){
    if(this.result){try{verifyNativeSource(this.context,this.result.owner);if(content(this.context.getState())!==this.result.content)throw Error('changed');}catch{this.invalidate();}}
    const blocked=this.busy||this.context.isExporting?.();for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=Boolean(blocked);
    this.node('vertex-figure-search').disabled=Boolean(blocked)||!eligible(this.context.getState()?.model);this.node('construct-from-vertex-figure').disabled=Boolean(blocked)||!this.result?.receipt.candidates.some(c=>c.id===this.node('vertex-figure-candidate').value);
    const cancel=this.node('vertex-figure-cancel');cancel.hidden=!this.busy;cancel.disabled=!this.busy;
  }
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;this.panel.remove();}
}
