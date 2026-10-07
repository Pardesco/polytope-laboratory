import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {captureContentHistoryPublication} from './element-content-history.mjs';
export const arrangementEligible=model=>model?.dimension===4&&(model.embeddingDimension??4)===4&&['convex-polytope','generalized-complex'].includes(model.interpretation);
const clone=value=>structuredClone(value);
const current=document=>document.states[document.cursor];
export class CoincidicRegimentControls{
 constructor(context,{mount=true}={}){
  this.context=context;this.busy=false;this.generation=0;this.selection='';this.receipt=null;if(!mount)return;
  const panel=document.createElement('details');panel.id='coincidic-regiment-settings';
  panel.innerHTML='<summary>4D arrangement / regiment comparison</summary><label>Other opened source <select id="coincidic-other-source"></select></label><label>Relative tolerance <input id="coincidic-tolerance" type="number" value="0.00000001" min="0.000000000001" max="0.000001" step="any"></label><label>Explicit A-to-B vertex IDs (optional JSON array) <textarea id="coincidic-vertex-bijection" rows="2" placeholder="Leave empty for a unique fixed-placement match"></textarea></label><button id="coincidic-compare">Compare and save record</button><button id="coincidic-compound">Construct literal compound</button><button id="coincidic-navigate">Go to other source</button><button id="coincidic-restore">Open retained other source</button><output id="coincidic-result"></output><p class="muted">Uses current XYZW placement and matching coordinate units. Keeps every original vertex/edge/face/cell ID. Regiment evidence requires the same edges; coincidic evidence requires distinct corealmic cells sharing a 3D span. No uniform classification or filled union is inferred.</p>';
  document.getElementById('source-reflection-settings').after(panel);this.panel=panel;
  const inspector=document.createElement('div');inspector.innerHTML='<label>Correspondence rank <select id="coincidic-rank"><option value="vertex">Vertex</option><option value="edge">Edge</option><option value="face">Face cycle</option><option value="cell">Full cell boundary</option></select></label><label>Source A ID <input id="coincidic-source-id" type="number" min="0" value="0" step="1"></label><output id="coincidic-counterparts"></output><label>Literal source B counterpart <select id="coincidic-counterpart-id"></select></label><button id="coincidic-inspect-a">Select source A entity</button><button id="coincidic-inspect-b">Go to source B counterpart</button>';
  panel.querySelector('#coincidic-result').after(inspector);this.inspector=inspector;
  const node=id=>panel.querySelector('#'+id);this.nodes={other:node('coincidic-other-source'),tolerance:node('coincidic-tolerance'),bijection:node('coincidic-vertex-bijection'),output:node('coincidic-result')};
  this.nodes.other.onchange=()=>{this.selection=this.nodes.other.value;this.receipt=null;this.sync();};
  node('coincidic-compare').onclick=context.guard(()=>this.perform('coincidic-record'));
  node('coincidic-compound').onclick=context.guard(()=>this.perform('coincidic-compound'));
  node('coincidic-navigate').onclick=context.guard(()=>this.navigate());
  node('coincidic-restore').onclick=context.guard(()=>this.restore());this.sync();
  node('coincidic-rank').onchange=()=>this.syncMapping();node('coincidic-source-id').oninput=()=>this.syncMapping();
  node('coincidic-inspect-a').onclick=context.guard(()=>this.inspect('a'));node('coincidic-inspect-b').onclick=context.guard(()=>this.inspect('b'));
 }
 otherDocument(){return this.context.getProject()?.documents.find(d=>d.id===(this.nodes?.other.value??this.selection));}
 readOptions(){
  const result={relativeTolerance:this.nodes?Number(this.nodes.tolerance.value):1e-8};
  const spelling=this.nodes?.bijection.value.trim();if(spelling){try{result.vertexBijection=JSON.parse(spelling);}catch{throw Error('Explicit vertex IDs require a complete JSON permutation array.');}}
  return result;
 }
 async perform(operation='coincidic-record'){
  if(this.busy)throw Error('Finish the current arrangement comparison first.');
  if(!['coincidic-record','coincidic-compound'].includes(operation))throw Error('Choose a comparison or literal compound operation.');
  const other=this.otherDocument();
  if(!other||other===this.context.getDocument()||!arrangementEligible(current(other)?.model)||!arrangementEligible(this.context.getState()?.model))throw Error('Choose two different opened intrinsic4D source documents.');
  const contextB={...this.context,getDocument:()=>other,getState:()=>current(other)};
  const a=captureNativeSource(this.context),b=captureNativeSource(contextB),ca=captureContentHistoryPublication(this.context),cb=captureContentHistoryPublication(contextB);
  const options=this.readOptions(),spelling=JSON.stringify(options),selection=other.id,otherState=clone(current(other)),generation=++this.generation,controller=new AbortController();
  this.controller=controller;this.busy=true;this.sync();
  const verify=()=>{
   if(controller.signal.aborted||generation!==this.generation)throw Object.assign(Error('Arrangement comparison canceled.'),{name:'AbortError'});
   verifyNativeSource(this.context,a);verifyNativeSource(contextB,b);ca();cb();
   if(!this.context.getProject().documents.includes(other)||this.otherDocument()?.id!==selection||JSON.stringify(this.readOptions())!==spelling)throw Error('Other source or comparison options changed. Compare the current pair again.');
  };
  try{
   verify();const result=await this.context.commit(operation,{otherState,options},operation==='coincidic-record'?'Saved4D arrangement comparison':'Literal4D comparison compound',{signal:controller.signal,verifyPublication:verify});
   const state=result.states[result.cursor];this.receipt=state.view.coincidicComparison?.receipt??state.model.metadata?.arrangementComparison;
   this.context.setStatus?.(this.describe(this.receipt));return result;
  }finally{if(this.controller===controller)this.controller=null;this.busy=false;this.sync();}
 }
 describe(receipt){
  if(!receipt)return 'No saved comparison for this source.';
  const r=receipt.rankCorrespondences,c=receipt.coincidicEvidence;
  return `Same vertices; edges ${r.edges.sameArrangement?'match (regiment evidence)':'differ'}, faces ${r.faces.sameArrangement?'match':'differ'}, cells ${r.cells.sameArrangement?'match':'differ'}. Internal coincidic witnesses A:${c.sourceA.witnesses.length}, B:${c.sourceB.witnesses.length}; cross-source realm witnesses:${c.crossSourceWitnesses.length}. Maximum coordinate residual ${receipt.maximumVertexResidual}.`;
 }
 navigate(){if(this.busy||this.context.isExporting?.())throw Error('Finish the comparison or export first.');const other=this.otherDocument();if(!other)throw Error('Choose an opened other source.');this.context.navigateDocument(other.id);}
 mapping(){
  const state=this.context.getState(),receipt=state?.view?.coincidicComparison?.receipt??state?.model?.metadata?.arrangementComparison;
  const kind=this.panel?.querySelector('#coincidic-rank').value??'vertex',index=Number(this.panel?.querySelector('#coincidic-source-id').value??0),field={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind];
  const row=receipt?.rankCorrespondences[field].aToB[index];return {kind,index,ids:row===undefined?[]:Array.isArray(row)?row:[row]};
 }
 syncMapping(){
  if(!this.inspector)return;const {kind,index,ids}=this.mapping(),blocked=this.busy||Boolean(this.context.isExporting?.());
  this.panel.querySelector('#coincidic-counterparts').textContent=`Source A ${kind} ${index} → source B IDs ${ids.length?ids.join(', '):'none'}.`;
  this.panel.querySelector('#coincidic-counterpart-id').replaceChildren(...ids.map(id=>{const option=document.createElement('option');option.value=String(id);option.textContent=String(id);return option;}));
  this.panel.querySelector('#coincidic-inspect-a').disabled=blocked||!this.context.getState()?.model||!Number.isInteger(index)||index<0;
  this.panel.querySelector('#coincidic-inspect-b').disabled=blocked||!ids.length||!this.otherDocument();
 }
 inspect(side='a'){
  if(this.busy||this.context.isExporting?.())throw Error('Finish the comparison or export first.');
  const {kind,index,ids}=this.mapping();if(!Number.isInteger(index)||index<0)throw Error('Choose a literal source A entity ID.');
  if(side==='a')return this.context.onSelect(kind,index);
  const state=this.context.getState(),sources=state.view.coincidicComparison?.sourceStates??state.model.metadata?.arrangementSourceStates,other=this.otherDocument();
  if(!other||!sources||JSON.stringify(current(other).model)!==JSON.stringify(sources[1].model))throw Error('Opened source B attributes differ from the saved pair. Compare its current source again.');
  const selected=Number(this.panel?.querySelector('#coincidic-counterpart-id').value??ids[0]);if(!ids.includes(selected))throw Error('Choose one explicitly listed source B counterpart.');
  this.context.navigateDocument(other.id);return this.context.onSelect(kind,selected);
 }
 async restore(){
  if(this.busy||this.context.isExporting?.())throw Error('Finish the comparison or export first.');
  const state=this.context.getState(),sources=state.view.coincidicComparison?.sourceStates??state.model.metadata?.arrangementSourceStates;
  if(!sources?.[1])throw Error('Save a comparison before opening its retained other source.');
  return this.context.restoreState(clone(sources[1]),'Retained comparison source');
 }
 cancel(){this.generation++;this.controller?.abort();}
 sync(){
  if(!this.panel)return;
  const state=this.context.getState(),project=this.context.getProject(),selected=this.nodes.other.value||this.selection;
  const candidates=project?.documents.filter(d=>d!==this.context.getDocument()&&arrangementEligible(current(d)?.model))??[];
  this.nodes.other.replaceChildren(...candidates.map(d=>{const option=document.createElement('option');option.value=d.id;option.textContent=d.name||current(d).model.name||d.id;return option;}));
  if(candidates.some(d=>d.id===selected))this.nodes.other.value=selected;
  this.selection=this.nodes.other.value;
  const blocked=this.busy||Boolean(this.context.isExporting?.());for(const node of this.panel.querySelectorAll('input,textarea,select,button'))node.disabled=blocked;
  for(const id of ['coincidic-compare','coincidic-compound'])this.panel.querySelector('#'+id).disabled=blocked||!arrangementEligible(state?.model)||!candidates.length;
  this.panel.querySelector('#coincidic-navigate').disabled=blocked||!candidates.length;
  this.panel.querySelector('#coincidic-restore').disabled=blocked||!(state?.view.coincidicComparison?.sourceStates??state?.model.metadata?.arrangementSourceStates)?.[1];
  this.nodes.output.textContent=this.describe(state?.view.coincidicComparison?.receipt??state?.model.metadata?.arrangementComparison);
  this.syncMapping();
 }
}
