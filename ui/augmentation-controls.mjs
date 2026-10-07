/** Bounded face attachment; native/history own accepted result publication.
 * Native owns convexity, congruence, rigid alignment, and publication after its
 * async operation. UI eligibility is an incidence/resource gate only.
 */
import {normalizeMemories, retrieveMemoryEntry, storeMemory} from './model-memories.mjs';

export const AUGMENTATION_CONTROL_LIMITS=Object.freeze({vertices:256,faceVertices:64,
  references:16384,coordinate:1e100,entryBytes:8*1024*1024,expressionCharacters:256});
const encoder=new TextEncoder(),edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
const fail=message=>{throw Error(message);};
const units=new Set(['model','mm','cm','m','in','ft']);
function field(object,key,fallback){
  if(!object||typeof object!=='object')fail('Attachment source data must be plain model records.');
  const descriptor=Object.getOwnPropertyDescriptor(object,key);
  if(!descriptor)return fallback;
  if(!('value' in descriptor))fail('Attachment source data must not contain accessors.');
  return descriptor.value;
}
function items(array){
  if(!Array.isArray(array))fail('Attachment source incidence must be arrays.');
  return Array.from({length:array.length},(_,i)=>{
    const descriptor=Object.getOwnPropertyDescriptor(array,String(i));
    if(!descriptor||!('value' in descriptor))fail('Attachment source data must not contain sparse arrays or accessors.');
    return descriptor.value;
  });
}
function shape(model){
  const dimension=field(model,'dimension'),embedding=field(model,'embeddingDimension',dimension);
  if(dimension!==3||embedding!==3)fail('Choose an intrinsic 3D source embedded in XYZ.');
  const id=field(model,'id');
  if(typeof id!=='string'||!id.length||id.length>128)fail('Attachment sources require a stable model ID of at most 128 characters.');
  const vertices=field(model,'vertices'),edges=field(model,'edges'),faces=field(model,'faces'),cells=field(model,'cells',[]);
  if(!Array.isArray(vertices)||vertices.length<4||vertices.length>AUGMENTATION_CONTROL_LIMITS.vertices)
    fail('Attachment sources require 4–256 vertices.');
  if(!Array.isArray(edges)||!Array.isArray(faces)||!Array.isArray(cells)||cells.length||faces.length<4||
    edges.length>AUGMENTATION_CONTROL_LIMITS.references||faces.length>AUGMENTATION_CONTROL_LIMITS.references)
    fail('Choose a bounded 3D face boundary without 4D cells.');
  let references=vertices.length*3+edges.length*2;
  if(references>AUGMENTATION_CONTROL_LIMITS.references)fail('Attachment source incidence resource limit exceeded.');
  for(const point of items(vertices)){
    if(!Array.isArray(point)||point.length!==3||items(point).some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>AUGMENTATION_CONTROL_LIMITS.coordinate))
      fail('Attachment source coordinates must be finite XYZ numbers bounded to 1e100.');
  }
  const index=v=>Number.isInteger(v)&&v>=0&&v<vertices.length,keys=new Set(),boundary=new Map(),used=new Set();
  for(const row of items(edges)){
    if(!Array.isArray(row)||row.length!==2)fail('Attachment source edges require two endpoints.');
    const [a,b]=items(row);
    if(!index(a)||!index(b)||a===b)fail('Attachment source edge IDs are invalid.');
    const key=edgeKey(a,b);if(keys.has(key))fail('Attachment source has duplicate edges.');keys.add(key);
  }
  for(const row of items(faces)){
    if(!Array.isArray(row)||row.length<3||row.length>AUGMENTATION_CONTROL_LIMITS.references-references)
      fail('Attachment source face cycle or incidence budget is invalid.');
    references+=row.length;const face=items(row);
    if(new Set(face).size!==face.length||face.some(v=>!index(v)))fail('Attachment source face IDs are invalid.');
    for(let j=0;j<face.length;j++){
      const a=face[j],b=face[(j+1)%face.length],key=edgeKey(a,b);used.add(a);
      if(!keys.has(key))fail('Attachment source face references a missing edge.');
      boundary.set(key,(boundary.get(key)??0)+1);
    }
  }
  if(used.size!==vertices.length||boundary.size!==keys.size||[...boundary.values()].some(n=>n!==2))
    fail('Choose a closed 3D face boundary without leftover wire or point strata.');
  return {references,faces,vertices};
}
function capture(state,source={}){
  // Reject oversized incidence before cloning; descriptors prevent getter reads.
  shape(field(state,'model'));
  const entry=storeMemory(undefined,1,state,source).slots[0],signature=JSON.stringify(entry);
  if(encoder.encode(signature).length>AUGMENTATION_CONTROL_LIMITS.entryBytes)
    fail('Attachment source snapshot exceeds the 8 MiB control limit.');
  return {entry,signature,modelSignature:JSON.stringify(entry.state.model)};
}
function literalIndex(text,count,label){
  const value=String(text).trim();
  if(!/^\d{1,8}$/.test(value))fail(`${label} must be a literal nonnegative integer source ID.`);
  const index=Number(value);
  if(!Number.isSafeInteger(index)||index<0||index>=count)fail(`${label} is outside the selected source cycle or face table.`);
  return index;
}
function unit(state){
  const label=state.view?.coordinateUnit??state.model?.metadata?.coordinateUnits??'model';
  if(!units.has(label))fail('Attachment source coordinate unit is unsupported.');
  return label;
}

export class AugmentationControls{
  constructor(context){
    this.context=context;this.busy=false;this.memoryOptions=[];
    const panel=document.createElement('details');panel.id='augmentation-settings';
    panel.innerHTML=`<summary>Attach faces (3D)</summary>
      <label>Addition source <select id="augmentation-source"><option value="current">Current model copy</option></select></label>
      <label>Base face ID <input id="augmentation-base-face" value="0" inputmode="numeric"></label>
      <label>Addition face ID <input id="augmentation-addition-face" value="0" inputmode="numeric"></label>
      <label>Cycle offset <input id="augmentation-cycle-offset" value="0" inputmode="numeric"></label>
      <label>Addition scale <input id="augmentation-scale" value="1"></label>
      <button id="attach-faces" title="Native validation checks convex source boundaries, ordered face congruence, and outward attachment. Source colors and seam IDs are retained.">Attach faces</button>`;
    const anchor=['layer-join-settings','podia-settings','torus-settings','step-prism-settings','antiprism-settings',
      'product-settings','star-polygon-settings','cupola-settings','subdivision-settings'].map(id=>document.getElementById(id)).find(Boolean);
    if(!anchor)fail('Face attachment controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    for(let slot=1;slot<=9;slot++){
      const option=document.createElement('option');option.value=`memory:${slot}`;
      panel.querySelector('#augmentation-source').append(option);this.memoryOptions.push(option);
    }
    this.node('augmentation-source').onchange=()=>this.sync();
    this.node('attach-faces').onclick=context.guard(()=>this.attach());this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  checkExport(){if(this.context.isExporting?.())fail('Finish animation export before attaching faces.');}
  memories(){
    const bank=typeof this.context.getMemories==='function'?this.context.getMemories():this.context.getProject?.()?.memories;
    if(bank===undefined)return Array(9).fill(null);
    if(field(bank,'version')!==1||!Array.isArray(field(bank,'slots'))||field(bank,'slots').length!==9)
      fail('Model memories require version 1 and nine numbered slots.');
    return items(field(bank,'slots'));
  }
  selected(value){
    if(value==='current')return {kind:'current'};
    const match=/^memory:([1-9])$/.exec(value);
    if(!match)fail('Choose the current model copy or a numbered memory.');
    const slot=Number(match[1]),entry=this.memories()[slot-1];
    if(!entry)fail(`Memory ${slot} is empty. Store a 3D source before attachment.`);
    // A one-entry bank bounds/clones the full memory entry, including ownership
    // and view, before any untrusted nested fields are read.
    const slots=Array(9).fill(null);slots[slot-1]=entry;
    const copy=retrieveMemoryEntry(normalizeMemories({version:1,slots}),slot);
    const captured=capture(copy.state,copy.source);
    const signature=JSON.stringify(copy);
    if(encoder.encode(signature).length>AUGMENTATION_CONTROL_LIMITS.entryBytes)
      fail('Attachment source snapshot exceeds the 8 MiB control limit.');
    return {kind:'memory',slot,entry,model:copy.state.model,copy:captured.entry.state.model,
      signature,state:copy.state};
  }
  ownership(selected){
    const project=this.context.getProject?.(),state=this.context.getState?.();
    if(!project||!Array.isArray(project.documents)||!Number.isInteger(project.active))
      fail('Open a source project before attaching faces.');
    const document=this.context.getDocument?.()??project.documents[project.active];
    if(!document||project.documents[project.active]!==document||document.states?.[document.cursor]!==state)
      fail('Choose the active source document and history state before attachment.');
    const base=capture(state),addition=selected.kind==='current'?base:{entry:{state:selected.state}};
    const a=shape(base.entry.state.model),b=shape(addition.entry.state.model);
    if(a.references+b.references>AUGMENTATION_CONTROL_LIMITS.references)
      fail('Attachment combined incidence resource limit exceeded.');
    if(unit(base.entry.state)!==unit(addition.entry.state))fail('Source coordinate units differ; convert explicitly before attachment.');
    return {workspace:this.context.getWorkspace?.(),project,documents:project.documents,active:project.active,
      document,documentId:document.id,cursor:document.cursor,states:document.states,stateCount:document.states.length,
      state,model:state.model,base,selected,addition:structuredClone(addition.entry.state.model),
      stateSignature:JSON.stringify({label:base.entry.state.label??null,notes:base.entry.state.notes??null,
        coordinateUnit:unit(base.entry.state)})};
  }
  verify(owner){
    this.checkExport();const project=this.context.getProject?.(),state=this.context.getState?.();
    const document=this.context.getDocument?.()??project?.documents?.[project.active];
    if(this.context.getWorkspace?.()!==owner.workspace||project!==owner.project||project.documents!==owner.documents||
      project.active!==owner.active||document!==owner.document||document?.id!==owner.documentId||
      document.cursor!==owner.cursor||document.states!==owner.states||document.states.length!==owner.stateCount||
      document.states[document.cursor]!==owner.state||state!==owner.state||state.model!==owner.model)
      fail('Source workspace, document, or history state changed while evaluating attachment. Repeat the action.');
    const current=capture(state);
    if(current.modelSignature!==owner.base.modelSignature||JSON.stringify({label:current.entry.state.label??null,
      notes:current.entry.state.notes??null,coordinateUnit:unit(current.entry.state)})!==owner.stateSignature)
      fail('Source geometry, units, or attributes changed while evaluating attachment. Repeat the action.');
    if(owner.selected.kind==='memory'){
      const currentEntry=this.memories()[owner.selected.slot-1];
      if(currentEntry!==owner.selected.entry||this.selected(`memory:${owner.selected.slot}`).signature!==owner.selected.signature)
        fail('The selected addition memory changed while evaluating attachment. Repeat the action.');
    }
  }
  async attach(){
    this.checkExport();if(this.busy)fail('Finish the current face attachment first.');
    const selected=this.selected(this.node('augmentation-source').value),owner=this.ownership(selected);
    const baseFace=literalIndex(this.node('augmentation-base-face').value,owner.model.faces.length,'Base face ID');
    const additionFace=literalIndex(this.node('augmentation-addition-face').value,owner.addition.faces.length,'Addition face ID');
    const a=owner.model.faces[baseFace],b=owner.addition.faces[additionFace];
    if(a.length!==b.length||a.length>AUGMENTATION_CONTROL_LIMITS.faceVertices)
      fail('Selected faces must have equal arity and at most 64 source vertices; native verifies their shape.');
    const offset=literalIndex(this.node('augmentation-cycle-offset').value,a.length,'Cycle offset');
    const expression=this.node('augmentation-scale').value.trim();
    if(!expression||expression.length>AUGMENTATION_CONTROL_LIMITS.expressionCharacters)
      fail('Enter a positive scale expression of at most 256 characters.');
    this.busy=true;this.sync();
    try{
      this.verify(owner);const scale=await this.context.number(expression);this.verify(owner);
      if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0||scale>AUGMENTATION_CONTROL_LIMITS.coordinate)
        fail('Addition scale must be positive, finite, and bounded to 1e100.');
      const params={addition:owner.addition,base_face_id:baseFace,addition_face_id:additionFace,cycle_offset:offset,scale};
      // Final fence has no await before invoking the supplied history callback.
      // The history callback invokes this source fence after its native await
      // and synchronously immediately before publishing, without serialization.
      this.verify(owner);
      return await this.context.commit('attach-at-faces',params,'Attach faces (3D)',
        {verifyPublication:()=>this.verify(owner)});
    }finally{this.busy=false;this.sync();}
  }
  sync(){
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    let entries=[];try{entries=this.memories();}catch{}
    for(const [i,option] of this.memoryOptions.entries()){
      let valid=false,name='Empty';
      try{const state=field(entries[i],'state'),model=field(state,'model');shape(model);valid=true;name=field(model,'name','3D model');}catch{}
      option.textContent=`Memory ${i+1} · ${typeof name==='string'?name:'3D model'}`;option.disabled=!valid;
    }
    const button=this.node('attach-faces');button.disabled=blocked;
    if(!blocked)try{
      const base=shape(this.context.getState?.()?.model),selected=this.node('augmentation-source').value;
      let addition=base;
      if(selected!=='current'){
        const match=/^memory:([1-9])$/.exec(selected);if(!match)fail('Invalid source.');
        addition=shape(field(field(entries[Number(match[1])-1],'state'),'model'));
      }
      if(base.references+addition.references>AUGMENTATION_CONTROL_LIMITS.references)fail('Incidence budget exceeded.');
    }catch{button.disabled=true;}
  }
}
