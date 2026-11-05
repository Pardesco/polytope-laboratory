import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {captureContentHistoryPublication} from './element-content-history.mjs';
import {prepareHistoryCommit,verifyHistoryPublication} from './history-workflow.mjs';

export function densitySectionParameters(view){
 const config=view.densitySection;
 return {normal:structuredClone(view.sectionNormal),offset:view.sectionOffset??0,
  ...(config?.enabled?{section_domain:'density',fill_rule:config.rule??'nonzero',density_threshold:config.threshold??1}:{fill_rule:view.fillRule||'nonzero'})};
}
export function densitySectionDisplay(model){
 const density=model?.metadata?.densitySection;if(!density)return {};
 const boundary=density.boundaryEdges;
 const visible=boundary?new Set(boundary.map(e=>[...e].sort((a,b)=>a-b).join(':'))):null;
 return {fillRule:'nonzero',surfaceColors:'source',surfaceOpacity:1,
  ...(visible?{elementVisibility:{version:1,sourceFingerprint:model.fingerprint,hidden:{vertices:[],edges:model.edges.flatMap((e,i)=>visible.has([...e].sort((a,b)=>a-b).join(':'))?[]:[i]),faces:[],cells:[]}}}:{})};
}
const abort=()=>Object.assign(Error('Filled section canceled or superseded.'),{name:'AbortError'});
const signature=JSON.stringify;
const inputKey=s=>signature([s.view.derivedMode,densitySectionParameters(s.view)]);

export class DensitySectionWorkflow{
 constructor(context){this.context=context;this.generation=0;this.receipts=new WeakMap();}
 cancelActive(){if(!this.active)return false;this.active.abort();this.active=null;return true;}
 async evaluate({signal,isCurrent=()=>true,exportOwner}={}){
  this.cancelActive();const generation=++this.generation,controller=new AbortController();this.active=controller;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try{
   if(exportOwner!==undefined&&typeof exportOwner!=='function')throw Error('Filled section export requires a current exporter.');
   const readContext=exportOwner?{...this.context,isExporting:()=>false}:this.context;
   const owner=captureNativeSource(readContext),content=captureContentHistoryPublication(readContext),key=inputKey(owner.state),params=densitySectionParameters(owner.state.view);
   if(params.section_domain!=='density')throw Error('Choose Filled (density) before evaluating.');
   const verify=()=>{if(generation!==this.generation||controller.signal.aborted||!isCurrent()||exportOwner&&exportOwner()!==true)throw abort();verifyNativeSource(readContext,owner);content();if(inputKey(owner.state)!==key)throw Error('Section plane or density settings changed. Evaluate again.');};
   verify();const result=await this.context.run('section',params,JSON.parse(owner.modelSignature),'Evaluate filled density section',{signal:controller.signal});verify();
   this.receipts.set(result,{owner,content,key,params,generation,resultSignature:signature(result)});return result;
  }finally{signal?.removeEventListener('abort',cancel);if(this.active===controller)this.active=null;}
 }
 async promote(result){
  const receipt=this.receipts.get(result);if(!receipt||!result?.model)throw Error('Evaluate a current nonempty filled section before promotion.');
  const controller=new AbortController();this.cancelActive();this.active=controller;
  const verify=()=>{if(receipt.generation!==this.generation||controller.signal.aborted)throw abort();verifyNativeSource(this.context,receipt.owner);receipt.content();if(inputKey(receipt.owner.state)!==receipt.key||signature(result)!==receipt.resultSignature)throw Error('Filled section source, settings or result changed. Evaluate again.');};
  const context={...this.context,verifyPublication:verify,run:(op,p,m,label)=>this.context.run(op,p,m,label,{signal:controller.signal})};
  try{
   verify();const prepared=await prepareHistoryCommit(context,'section',structuredClone(receipt.params),'Promote filled density section');
   verifyHistoryPublication(context,prepared,{opening:true});verify();
   if(signature(prepared.result.states[prepared.result.cursor].model)!==signature(result.model))throw Error('Filled section history reconstruction differs from its preview. Evaluate again.');
   this.context.publishHistory(prepared.result);return prepared.result;
  }finally{if(this.active===controller)this.active=null;}
 }
}

export class DensitySectionControls{
 constructor(context){
  this.context=context;const doc=context.document??document;
  const label=doc.createElement('label');label.textContent='Section mode ';const select=doc.createElement('select');select.id='section-density-mode';
  select.innerHTML='<option value="surface">Surface / convex</option><option value="density">Filled (density)</option>';label.append(select);doc.getElementById('derived-mode').after(label);this.select=select;
  const panel=doc.createElement('details');panel.id='density-section-settings';panel.className='inspector-group';
  panel.innerHTML='<summary>Filled section settings</summary><label>Density fill <select id="section-density-rule"><option value="nonzero">Nonzero signed density</option><option value="even-odd">Even / odd density</option><option value="threshold">Signed density ≥ k</option></select></label><label>Threshold k <input id="section-density-threshold" value="1" maxlength="512"></label><button id="apply-density-section">Apply density settings</button><p class="muted">Closed oriented boundaries only. Vertex/edge contacts and resource limits refuse fill. Each connected source component uses positive algebraic volume orientation. 4D fills use bounded arrangements; deep star sections may exceed the limit.</p>';
  doc.getElementById('analysis').after(panel);this.panel=panel;
  const legend=doc.createElement('div');legend.id='section-density-legend';legend.setAttribute('aria-live','polite');legend.hidden=true;doc.getElementById('derived-status').after(legend);this.legend=legend;
  this.entry=new NumericEntry({...context,getTarget:()=>[this.select.value,this.node('section-density-rule').value,this.node('section-density-threshold').value]});
  select.onchange=context.guard(()=>this.setMode());this.node('apply-density-section').onclick=context.guard(()=>this.apply());this.sync();
 }
 node(id){return this.panel.querySelector('#'+id);}
 check(){if(this.busy||this.context.isExporting?.()||this.context.isPending?.()){this.sync();throw Error('Finish the current section evaluation or export first.');}}
 setMode(){
  this.check();const s=this.context.getState(),enabled=this.select.value==='density';
  s.view.densitySection={...s.view.densitySection,enabled};s.view.derivedMode='section';this.context.markDirty();this.context.showSection?.();this.sync();return this.context.refreshDerived();
 }
 async apply(){
  this.check();const rule=this.node('section-density-rule').value;if(!['nonzero','even-odd','threshold'].includes(rule))throw Error('Choose a supported density fill rule.');
  this.busy=true;
  this.select.disabled=true;for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=true;
  try{return await this.entry.run({threshold:{text:this.node('section-density-threshold').value,integer:true,min:1,max:100}},async({threshold},verify,{signal})=>{
   verify();const s=this.context.getState();s.view.densitySection={enabled:true,rule,threshold};s.view.derivedMode='section';this.context.markDirty();this.context.showSection?.();this.sync();return this.context.refreshDerived({signal,throwOnError:true});
  });}finally{this.busy=false;this.sync();}
 }
 cancel(){this.entry.cancel();}
 sync(){
  const s=this.context.getState(),config=s?.view.densitySection??{};this.select.value=config.enabled?'density':'surface';
  this.node('section-density-rule').value=config.rule??'nonzero';this.node('section-density-threshold').value=String(config.threshold??1);
  const blocked=!s||this.busy||this.context.isExporting?.()||this.context.isPending?.();this.select.disabled=Boolean(blocked)||![3,4].includes(s?.model.dimension);
  for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=Boolean(blocked);
 }
 show(result){
  this.legend.replaceChildren();this.legend.hidden=!Array.isArray(result?.densityLegend)||!result.densityLegend.length;
  if(this.legend.hidden)return;
  const doc=this.legend.ownerDocument;
  for(const record of result.densityLegend){const row=doc.createElement('span'),swatch=doc.createElement('span');swatch.textContent='■ ';swatch.style.color=`rgb(${record.color.slice(0,3).map(v=>Math.round(v*255)).join(',')})`;row.append(swatch,`density ${record.density}${record.selected?'':' (excluded)'} · `);this.legend.append(row);}
  const note=doc.createElement('small');note.textContent='Approximate signed winding · '+(result.densityDiagnostics?.maxIntegerResidual!==undefined?`max integer residual ${result.densityDiagnostics.maxIntegerResidual.toExponential(2)}`:'convex section kernel');this.legend.append(note);
 }
}
