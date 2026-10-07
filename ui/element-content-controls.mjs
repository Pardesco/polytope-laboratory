import {NumericEntry} from './numeric-entry.mjs';
import {prepareEmptySectionSourceContent,verifySectionSourcePose} from './section-source-content.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

export const ELEMENT_CONTENT_LIMITS=Object.freeze({pngBytes:4*1024*1024,markup:4096,listCharacters:128*1024,listEntries:1024});
const names={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'};
const clone=value=>JSON.parse(JSON.stringify(value));
const annotationSignature=state=>JSON.stringify(state?.view?.elementAnnotations??null);
const aborted=()=>Object.assign(Error('Element content canceled.'),{name:'AbortError'});

export async function readElementPNG(file,verify,signal){
  if(!file||!Number.isSafeInteger(file.size)||file.size<8||file.size>ELEMENT_CONTENT_LIMITS.pngBytes||typeof file.arrayBuffer!=='function')
    throw Error('Choose a PNG file of at most4MiB.');
  verify();if(signal?.aborted)throw aborted();const data=await file.arrayBuffer();verify();if(signal?.aborted)throw aborted();
  if(!(data instanceof ArrayBuffer)||data.byteLength!==file.size||data.byteLength>ELEMENT_CONTENT_LIMITS.pngBytes)throw Error('PNG bytes changed or exceed their bound.');
  const bytes=new Uint8Array(data),signature=[137,80,78,71,13,10,26,10];
  if(signature.some((v,i)=>bytes[i]!==v))throw Error('The selected file is not a PNG.');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  verify();return btoa(binary); // Native decoding, CRC/pixels/normalization remain authoritative.
}

export class ElementContentControls{
  constructor(context){
    this.context=context;this.busy=false;this.jobs=new Map();
    const panel=document.createElement('details');panel.id='element-content-settings';
    panel.innerHTML='<summary>Element text and images</summary><div class="button-row"><label>Element <select id="element-content-kind"><option value="vertex">Vertex</option><option value="edge">Edge</option><option value="face">Face</option><option value="cell">Cell</option></select></label><label>Source index <input id="element-content-index" value="0" inputmode="numeric"></label></div><button id="element-content-selection">Use current selection</button><label>Formatted text <textarea id="element-content-markup" rows="3" spellcheck="false" maxlength="4096"></textarea></label><details><summary>Text placement (mm)</summary><div class="button-row"><label>X <input id="element-content-x" value="0"></label><label>Y <input id="element-content-y" value="0"></label></div><label>Rotation (degrees) <input id="element-content-angle" value="0"></label><label>Line height (mm) <input id="element-content-line-height" value="4"></label><p class="muted">Formatting: b, i, sub, sup, br; font color, size in mm, generic face.</p></details><div class="button-row"><button id="element-content-text">Apply text</button><button id="element-content-remove-text">Remove text</button></div><label>Face PNG <input id="element-content-png" type="file" accept="image/png"></label><div class="button-row"><button id="element-content-texture">Apply face image</button><button id="element-content-remove-texture">Remove face image</button></div><details><summary>Ordered text list</summary><label>Targets <select id="element-content-list-mode"><option value="all">Source order</option><option value="shown">Shown source targets</option><option value="explicit">Explicit source IDs</option></select></label><label id="element-content-target-row" hidden>Ordered source IDs <textarea id="element-content-targets" rows="2" spellcheck="false"></textarea></label><label>One formatted entry per line <textarea id="element-content-lines" rows="4" spellcheck="false"></textarea></label><button id="element-content-list">Apply ordered list</button></details><button id="element-content-cancel">Cancel</button><output id="element-content-status" aria-live="polite"></output>';
    document.getElementById('selection-info').after(panel);this.panel=panel;
    this.node('kind').value='face';this.node('list-mode').value='all';
    for(const action of ['text','texture','list','remove-text','remove-texture'])this.node(action).onclick=context.guard(()=>this.apply(action));
    this.node('selection').onclick=context.guard(()=>this.useSelection());this.node('cancel').onclick=()=>this.cancel();
    this.node('kind').onchange=context.guard(()=>{this.loadTarget();this.sync();});this.node('index').onchange=context.guard(()=>this.loadTarget());
    this.node('list-mode').onchange=()=>{this.node('target-row').hidden=this.node('list-mode').value!=='explicit';};this.sync();
  }
  node(key){return this.panel.querySelector('#element-content-'+key);}
  read(){return Object.fromEntries(['kind','index','markup','x','y','angle','line-height','list-mode','targets','lines'].map(key=>[key,this.node(key).value]));}
  signature(){const file=this.node('png').files?.[0];return JSON.stringify({...this.read(),file:file?[file.name,file.size,file.lastModified]:null});}
  sourceIndex(text,kind){
    if(!Object.hasOwn(names,kind)||typeof text!=='string'||! /^(0|[1-9]\d*)$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)>=this.context.getState().model[names[kind]].length)
      throw Error('Choose an existing literal source element index.');return Number(text);
  }
  targets(input){
    const model=this.context.getState().model,count=model[names[input.kind]].length;
    if(input['list-mode']==='all')return null;
    let ids;
    if(input['list-mode']==='shown'){
      ids=this.context.visibleTargets(input.kind);
      if(!Array.isArray(ids)||ids.some(i=>!Number.isSafeInteger(i)||i<0||i>=count)||new Set(ids).size!==ids.length)throw Error('Shown targets must retain distinct native source IDs.');
    }else if(input['list-mode']==='explicit'){
      if(input.targets.length>ELEMENT_CONTENT_LIMITS.listCharacters)throw Error('Target IDs exceed their input bound.');
      ids=input.targets.trim()?input.targets.trim().split(/[\s,;]+/).map(value=>this.sourceIndex(value,input.kind)):[];
      if(new Set(ids).size!==ids.length)throw Error('Use distinct ordered source target IDs.');
    }else throw Error('Choose a supported ordered target mode.');
    if(!ids.length)throw Error('Choose at least one source target.');return ids.slice();
  }
  async apply(action){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current action before editing content.');
    if(!['text','texture','list','remove-text','remove-texture'].includes(action))throw Error('Choose a supported content action.');
    const input=this.read(),form=this.signature(),content=annotationSignature(this.context.getState()),file=this.node('png').files?.[0];
    let params,fields={confirm:{text:'0',min:0,max:0}},targets;
    if(!Object.hasOwn(names,input.kind))throw Error('Choose a source element kind.');
    if(action==='list'){
      if(input.lines.length>ELEMENT_CONTENT_LIMITS.listCharacters)throw Error('Text list exceeds128KiB.');
      const lines=input.lines.split(/\r\n|\n|\r/);if(lines.length>ELEMENT_CONTENT_LIMITS.listEntries||lines.some(line=>line.length>ELEMENT_CONTENT_LIMITS.markup))throw Error('Use at most1024 bounded formatted lines.');
      targets=this.targets(input);if(lines.length>(targets?.length??this.context.getState().model[names[input.kind]].length))throw Error('Each list line needs a source target.');
      params={action:'list',kind:input.kind,lines,...targets===null?{}:{targetIds:targets}};
    }else{
      const index=this.sourceIndex(input.index,input.kind);
      if(action==='text'){
        if(input.markup.length>ELEMENT_CONTENT_LIMITS.markup)throw Error('Formatted text exceeds4096 characters.');
        params={action:'text',kind:input.kind,index,markup:input.markup};
        fields={offset:{kind:'vector',text:input.x+';'+input.y,length:2,min:-1000,max:1000},
          rotation:{text:input.angle,min:-360,max:360},lineHeight:{text:input['line-height'],min:.1,max:100}};
      }else if(action==='texture'){
        if(input.kind!=='face')throw Error('PNG images require a source face.');params={action:'texture',index};
      }else{
        const part=action==='remove-text'?'text':'texture';if(part==='texture'&&input.kind!=='face')throw Error('Images belong to source faces.');
        params={action:'remove',kind:input.kind,index,parts:[part]};
      }
    }
    const entry=new NumericEntry(this.context);this.entry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,async(values,numericVerify,{source,signal})=>{
      const verify=()=>{numericVerify();if(this.signature()!==form||annotationSignature(this.context.getState())!==content||this.node('png').files?.[0]!==file)
        throw Error('Element content or target fields changed. Repeat the edit.');
        if(input['list-mode']==='shown'&&action==='list'&&JSON.stringify(this.targets(input))!==JSON.stringify(targets))throw Error('Shown source targets changed. Repeat the edit.');};
      verify();if(action==='text')params.placement={offsetMm:[...values.offset],rotationDeg:values.rotation,lineHeightMm:values.lineHeight};
      if(action==='texture')params.pngBase64=await readElementPNG(file,verify,signal);verify();
      this.publishing=true;let result;
      try{result=await this.context.commit('element-content',clone(params),'Edit source element content',{sourceSnapshot:source,signal,verifyPublication:verify});}
      finally{this.publishing=false;}
      this.node('status').textContent='Source content edit recorded.';this.node('status').dataset.status='recorded';return result;
    });}catch(error){this.node('status').textContent=error.message;this.node('status').dataset.status=error.name==='AbortError'?'user-cancelled':'refused';throw error;}
    finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  useSelection(){
    if(this.busy||this.context.isExporting())throw Error('Finish the current action before selecting content.');
    const {kind,index}=this.context.selection();this.sourceIndex(String(index),kind);this.node('kind').value=kind;this.node('index').value=String(index);this.loadTarget();this.sync();
  }
  loadTarget(){
    const kind=this.node('kind').value,index=this.sourceIndex(this.node('index').value,kind);
    const item=this.context.getState().view.elementAnnotations?.entries.find(row=>row.kind===kind&&row.index===index);
    this.node('markup').value=item?.text?.markup??'';const placement=item?.text?.placement??{offsetMm:[0,0],rotationDeg:0,lineHeightMm:4};
    this.node('x').value=String(placement.offsetMm[0]);this.node('y').value=String(placement.offsetMm[1]);this.node('angle').value=String(placement.rotationDeg);this.node('line-height').value=String(placement.lineHeightMm);
  }
  cancel(){this.entry?.cancel();}
  invalidate(){if(!this.publishing)this.cancel();for(const job of this.jobs.values())job.controller.abort();this.jobs.clear();this.loadedState=null;this.sync();}
  async refresh(viewer=this.context.viewer,{signal,isCurrent,referenceEdgeMm=25}={}){
    const state=this.context.getState();verifySectionSourcePose(viewer,state);const empty=await prepareEmptySectionSourceContent(viewer,state,{signal,isCurrent:()=>this.context.getState()===state&&isCurrent?.()!==false});if(empty)return empty;if(!state?.model){await this.context.render(viewer,null,{});return {ready:true};}
    const readContext={...this.context,isExporting:()=>false},owner=captureNativeSource(readContext),content=annotationSignature(state),
      key=JSON.stringify([owner.modelSignature,content,owner.notes,owner.unit,referenceEdgeMm]);
    if(signal?.aborted||isCurrent?.()===false)throw aborted();
    let job=this.jobs.get(viewer);
    if(job?.key===key&&job.state===state&&!job.failed&&!job.controller.signal.aborted&&job.isCurrent?.()!==false&&(job.pending||job.layer===viewer.elementContentLayer&&job.model===viewer.model&&job.net===viewer.net&&job.cellNet===viewer.cellNet)){
      const cancel=()=>job.controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
      return job.promise.finally(()=>signal?.removeEventListener('abort',cancel));
    }
    job?.controller.abort();job={key,state,pending:true,controller:new AbortController()};this.jobs.set(viewer,job);
    const cancel=()=>job.controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const verify=()=>{if(job.controller.signal.aborted||isCurrent?.()===false||this.jobs.get(viewer)!==job)throw aborted();verifyNativeSource(readContext,owner);
      if(annotationSignature(this.context.getState())!==content)throw Error('Source element content changed while preparing its presentation.');};
    job.isCurrent=()=>{try{verify();return true;}catch{return false;}};
    job.promise=(async()=>{
      const source=JSON.parse(owner.modelSignature),options={signal:job.controller.signal,sourceSnapshot:source,verifyPublication:verify};verify();
      await this.context.render(viewer,null,options);verify();
      let descriptor=null;if(state.view.elementAnnotations){descriptor=await this.context.describe(source,{document:clone(state.view.elementAnnotations),reference_edge_mm:referenceEdgeMm},options);verify();}
      const result=await this.context.render(viewer,descriptor?.entries.length?descriptor:null,options);verify();
      if(result?.ready===false)throw Error(result.diagnostic||'Requested element content cannot be mapped to this presentation.');job.layer=viewer.elementContentLayer;job.model=viewer.model;job.net=viewer.net;job.cellNet=viewer.cellNet;return result??{ready:true};
    })().catch(error=>{job.failed=true;throw error;}).finally(()=>{job.pending=false;signal?.removeEventListener('abort',cancel);});return job.promise;
  }
  async prepareCapture(options={}){await this.refresh(this.context.viewer,options);if(options.signal?.aborted||options.isCurrent&& !options.isCurrent())throw aborted();}
  sync(){
    const state=this.context.getState(),model=state?.model,content=annotationSignature(state);
    if(state!==this.loadedState||content!==this.loadedContent){
      this.loadedState=state;this.loadedContent=content;
      if(model){if(!model[names[this.node('kind').value]]?.length)this.node('kind').value=model.faces.length?'face':'vertex';
        if(! /^(0|[1-9]\d*)$/.test(this.node('index').value)||Number(this.node('index').value)>=model[names[this.node('kind').value]].length)this.node('index').value='0';this.loadTarget();}
    }
    const disabled=this.busy||this.context.isExporting()||!model;
    for(const node of this.panel.querySelectorAll('input,select,textarea,button'))node.disabled=disabled;
    for(const option of this.node('kind').options??[])option.disabled=!model?.[names[option.value]]?.length;
    this.node('cancel').disabled=!this.busy;this.node('texture').disabled=disabled||this.node('kind').value!=='face';
    this.node('remove-texture').disabled=this.node('texture').disabled;
  }
}
