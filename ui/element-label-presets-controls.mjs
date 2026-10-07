// SPDX-License-Identifier: GPL-3.0-only
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const names={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'},copy=structuredClone;
const contentSignature=state=>JSON.stringify(state?.view?.elementAnnotations??null);
const abort=()=>Object.assign(Error('Source label preset canceled.'),{name:'AbortError'});
export class ElementLabelPresetsControls{
  constructor(context,{anchor='element-content-settings'}={}){
    this.context=context;this.busy=false;this.active=null;this.preview=null;this.generation=0;this.destroyed=false;
    const panel=document.createElement('details');panel.id='element-label-presets-settings';
    panel.innerHTML=`<summary>Automatic source labels</summary>
      <label>Element <select id="label-preset-kind"><option value="vertex">Vertices</option><option value="edge">Edges</option><option value="face">Faces</option><option value="cell">Cells</option></select></label>
      <label>Preset <select id="label-preset-type"><option value="ids">Source IDs</option><option value="lengths">Edge lengths</option><option value="coordinates">Intrinsic vertex coordinates</option><option value="incidence">Incidence counts</option></select></label>
      <label>Targets <select id="label-preset-target-mode"><option value="shown">Shown source elements</option><option value="all">All source elements</option><option value="explicit">Explicit source IDs</option></select></label>
      <label id="label-preset-target-row" hidden>Ordered source IDs <input id="label-preset-target-ids" placeholder="0, 2, 5"></label>
      <label>Literal prefix <input id="label-preset-prefix" maxlength="64" placeholder="V / E / F / C"></label>
      <label>Label color <select id="label-preset-color"><option value="auto">Automatic (dark faces / light other elements)</option><option value="black">Black</option><option value="white">White</option><option value="yellow">Yellow</option><option value="cyan">Cyan</option><option value="red">Red</option></select></label>
      <label>Number base <select id="label-preset-base"><option value="0">0 (source IDs)</option><option value="1">1</option></select></label>
      <label>Decimal places <select id="label-preset-decimals">${[0,1,2,3,4,5,6,7,8].map(n=>`<option${n===3?' selected':''}>${n}</option>`).join('')}</select></label>
      <label><input id="label-preset-overwrite" type="checkbox">Replace existing text (face images stay)</label>
      <div class="button-row"><button id="label-preset-preview">Preview labels</button><button id="label-preset-apply">Apply labels</button><button id="label-preset-cancel" hidden>Cancel</button></div>
      <output id="label-preset-status" aria-live="polite"></output><pre id="label-preset-output" style="max-height:180px;overflow:auto;white-space:pre-wrap"></pre>
      <p class="muted">Fills empty text by default. Metrics use intrinsic source coordinates. Choose up to 256 targets. Apply records one undoable element-content operation.</p>`;
    this.panel=panel;this.node('kind').value='face';if(context.mount)context.mount(panel);else{const target=document.getElementById(anchor);if(!target)throw Error('Source label presets need an annotation panel.');target.after(panel);}
    const guard=fn=>context.guard?context.guard(fn):fn;this.node('preview').onclick=guard(()=>this.prepare());this.node('apply').onclick=guard(()=>this.apply());this.node('cancel').onclick=()=>this.cancel();
    for(const node of panel.querySelectorAll('input,select'))node.onchange=()=>{if(this.node('type').value==='lengths')this.node('kind').value='edge';if(this.node('type').value==='coordinates')this.node('kind').value='vertex';this.preview=null;this.node('target-row').hidden=this.node('target-mode').value!=='explicit';this.sync();};this.sync();
  }
  node(key){return this.panel.querySelector('#label-preset-'+key);}
  input(){return Object.fromEntries(['kind','type','target-mode','target-ids','prefix','color','base','decimals'].map(k=>[k,this.node(k).value]).concat([['overwrite',this.node('overwrite').checked]]));}
  targets(input){
    const count=this.context.getState()?.model?.[names[input.kind]]?.length;if(!Number.isInteger(count))throw Error('Choose a source element kind.');
    let ids;if(input['target-mode']==='all')ids=Array.from({length:count},(_,i)=>i);else if(input['target-mode']==='shown')ids=this.context.visibleTargets(input.kind);else if(input['target-mode']==='explicit'){
      const text=input['target-ids'].trim();if(text.length>4096||!/^\d+(?:[\s,;]+\d+)*$/.test(text))throw Error('Enter ordered literal source IDs.');ids=text.split(/[\s,;]+/).map(Number);
    }else throw Error('Choose shown, all or explicit target IDs.');
    if(!Array.isArray(ids)||ids.length<1||ids.length>256||new Set(ids).size!==ids.length||ids.some(i=>!Number.isSafeInteger(i)||i<0||i>=count))throw Error('Choose 1..256 distinct existing source targets.');return ids.slice();
  }
  verify(job){
    if(this.destroyed||this.active!==job||job.generation!==this.generation||job.controller.signal.aborted)throw abort();verifyNativeSource(this.context,job.owner);
    if(contentSignature(this.context.getState())!==job.content||JSON.stringify(this.input())!==job.inputSignature||JSON.stringify(this.targets(job.input))!==job.targetsSignature)throw Error('Source content, label options or shown targets changed. Preview again.');
  }
  async prepare(){
    if(this.busy)throw Error('Finish or cancel the current label action.');const owner=captureNativeSource(this.context),input=this.input(),targetIds=this.targets(input),source=JSON.parse(owner.modelSignature),job={owner,input,inputSignature:JSON.stringify(input),content:contentSignature(this.context.getState()),targetsSignature:JSON.stringify(targetIds),controller:new AbortController(),generation:++this.generation};
    this.active=job;this.busy=true;this.preview=null;this.sync();
    try{
      this.verify(job);const parameters={kind:input.kind,preset:input.type,target_ids:targetIds,document:copy(this.context.getState().view.elementAnnotations??null),overwrite:input.overwrite,index_base:Number(input.base),decimals:Number(input.decimals),prefix:input.prefix,color:input.color};
      const receipt=await this.context.run('element-label-presets',parameters,source,'Preview source labels',{signal:job.controller.signal,isCurrent:()=>{try{this.verify(job);return true;}catch{return false;}}});this.verify(job);
      if(receipt?.algorithmVersion!=='0.1.0'||receipt.sourceId!==source.id||receipt.kind!==input.kind||!Array.isArray(receipt.rows)||receipt.rows.length>256||receipt.parameters?.action!=='list')throw Error('Invalid native source label preview.');
      this.preview={...job,receipt};this.node('output').textContent=receipt.rows.map(row=>`${row.sourceIndex}: ${row.text}`).join('\n');this.node('status').textContent=`${receipt.rows.length} labels prepared; ${receipt.skippedExistingIds.length} existing text labels retained.`;return receipt;
    }finally{if(this.active===job){this.active=null;this.busy=false;}this.sync();}
  }
  async apply(){
    if(this.busy)throw Error('Finish or cancel the current label action.');const preview=this.preview;if(!preview?.receipt.rows.length)throw Error('Preview new labels before applying.');
    const job={...preview,controller:new AbortController(),generation:++this.generation};this.active=job;this.busy=true;this.sync();
    try{
      const verify=()=>this.verify(job);verify();const result=await this.context.commit('element-content',copy(job.receipt.parameters),'Apply source label preset',{signal:job.controller.signal,sourceSnapshot:JSON.parse(job.owner.modelSignature),verifyPublication:verify});
      if(job.controller.signal.aborted)throw abort();this.preview=null;this.node('status').textContent='Source labels recorded in history.';return result;
    }finally{if(this.active===job){this.active=null;this.busy=false;}this.sync();}
  }
  cancel(){this.generation++;this.active?.controller.abort();}
  sync(){
    if(this.preview){try{verifyNativeSource(this.context,this.preview.owner);if(contentSignature(this.context.getState())!==this.preview.content||JSON.stringify(this.input())!==this.preview.inputSignature||JSON.stringify(this.targets(this.preview.input))!==this.preview.targetsSignature)throw Error('changed');}catch{this.preview=null;}}
    const blocked=this.busy||this.context.isExporting?.()||!this.context.getState()?.model;for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=Boolean(blocked);this.node('apply').disabled=Boolean(blocked)||!this.preview?.receipt.rows.length;this.node('cancel').hidden=!this.busy;this.node('cancel').disabled=!this.busy;
  }
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;this.panel.remove();}
}
