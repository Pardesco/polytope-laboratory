/** Face placement controls. Native owns frames, convexity and output.
 * Disjoint source incidence, RGBA and units pass unchanged through history. */
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {normalizeMemories,retrieveMemoryEntry} from './model-memories.mjs';

export const PLACEMENT_CONTROL_LIMITS=Object.freeze({vertices:256,references:16384,
  selectedFaces:16,faceVertices:64,coordinate:1e100,angle:360,entryBytes:8*1024*1024,
  expressionCharacters:256,selectionCharacters:256});
const encoder=new TextEncoder(),units=new Set(['model','mm','cm','m','in','ft']);
const fail=message=>{throw Error(message);};
function field(record,key,fallback){
  if(!record||typeof record!=='object')fail('Placement sources require plain records.');
  const descriptor=Object.getOwnPropertyDescriptor(record,key);
  if(!descriptor)return fallback;
  if(!('value' in descriptor))fail('Placement sources must not contain accessors.');
  return descriptor.value;
}
function items(array){
  if(!Array.isArray(array))fail('Placement source incidence must be arrays.');
  return Array.from({length:array.length},(_,i)=>{
    const descriptor=Object.getOwnPropertyDescriptor(array,String(i));
    if(!descriptor||!('value' in descriptor))fail('Placement sources must not contain sparse arrays or accessors.');
    return descriptor.value;
  });
}
const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
function shape(model){
  const dimension=field(model,'dimension'),embedding=field(model,'embeddingDimension',dimension);
  if(dimension!==3||embedding!==3)fail('Choose an intrinsic 3D source embedded in XYZ.');
  const id=field(model,'id');
  if(typeof id!=='string'||!id.length||id.length>128)fail('Placement sources require a stable model ID of at most 128 characters.');
  const vertices=field(model,'vertices'),edges=field(model,'edges'),faces=field(model,'faces'),cells=field(model,'cells',[]);
  if(!Array.isArray(vertices)||vertices.length<4||vertices.length>PLACEMENT_CONTROL_LIMITS.vertices)
    fail('Placement sources require 4..256 vertices.');
  if(!Array.isArray(edges)||!Array.isArray(faces)||faces.length<4||!Array.isArray(cells)||cells.length||
      edges.length>PLACEMENT_CONTROL_LIMITS.references||faces.length>PLACEMENT_CONTROL_LIMITS.references)
    fail('Choose a bounded closed 3D face source without cells.');
  let references=vertices.length*3+edges.length*2;
  if(references>PLACEMENT_CONTROL_LIMITS.references)fail('Placement source incidence resource limit exceeded.');
  for(const point of items(vertices))if(!Array.isArray(point)||point.length!==3||
      items(point).some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>PLACEMENT_CONTROL_LIMITS.coordinate))
    fail('Placement source coordinates must be finite XYZ numbers bounded to 1e100.');
  const index=v=>Number.isInteger(v)&&v>=0&&v<vertices.length,keys=new Set(),boundary=new Map(),used=new Set();
  for(const row of items(edges)){
    if(!Array.isArray(row)||row.length!==2)fail('Placement source edges require two endpoints.');
    const [a,b]=items(row),key=edgeKey(a,b);
    if(!index(a)||!index(b)||a===b||keys.has(key))fail('Placement source edge IDs are invalid or duplicated.');
    keys.add(key);
  }
  for(const row of items(faces)){
    if(!Array.isArray(row)||row.length<3||row.length>PLACEMENT_CONTROL_LIMITS.references-references)
      fail('Placement source face cycle or incidence budget is invalid.');
    references+=row.length;const face=items(row);
    if(new Set(face).size!==face.length||face.some(v=>!index(v)))fail('Placement source face IDs are invalid.');
    for(let i=0;i<face.length;i++){
      const a=face[i],b=face[(i+1)%face.length],key=edgeKey(a,b);used.add(a);
      if(!keys.has(key))fail('Placement source face references a missing edge.');
      boundary.set(key,(boundary.get(key)??0)+1);
    }
  }
  if(used.size!==vertices.length||boundary.size!==keys.size||[...boundary.values()].some(n=>n!==2))
    fail('Choose a closed face boundary without leftover wire or point strata.');
  return {references,faces};
}
function signature(value){
  const text=JSON.stringify(value);
  if(encoder.encode(text).length>PLACEMENT_CONTROL_LIMITS.entryBytes)
    fail('Placement source snapshot exceeds the 8 MiB control limit.');
  return text;
}
function effectiveUnit(state){
  const unit=state.view?.coordinateUnit??state.model.metadata?.coordinateUnits??'model';
  if(!units.has(unit))fail('Placement source display units are unsupported.');
  return unit;
}
function modelUnit(model){
  const unit=model.metadata?.coordinateUnits;
  if(unit!==undefined&&!units.has(unit))fail('Placement source coordinate units are unsupported.');
  return unit;
}
function literalIndex(text,count,label){
  const raw=String(text).trim();
  if(!/^\d{1,8}$/.test(raw))fail(`${label} must be a literal nonnegative integer source ID.`);
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value>=count)fail(`${label} is outside the source face table.`);
  return value;
}
function selectedFaces(text,count){
  const raw=String(text).trim();
  if(raw.length>PLACEMENT_CONTROL_LIMITS.selectionCharacters||!/^\d{1,8}(?:\s*,\s*\d{1,8})*$/.test(raw))
    fail('Target face IDs must be an ordered comma-separated list of literal source IDs.');
  const ids=raw.split(',').map(value=>literalIndex(value,count,'Target face ID'));
  if(ids.length>PLACEMENT_CONTROL_LIMITS.selectedFaces||new Set(ids).size!==ids.length)
    fail('Choose 1..16 distinct target face IDs in explicit order.');
  return ids;
}

export class FacePlacementControls{
  constructor(context){
    this.context=context;this.busy=false;this.memoryOptions=[];
    const panel=document.createElement('details');panel.id='face-placement-settings';
    panel.innerHTML=`<summary>Place at faces (3D)</summary>
      <label>Addition <select id="placement-source"><option value="current">Current model copy</option></select></label>
      <label>Target face IDs <input id="placement-face-ids" value="0" inputmode="numeric" title="Explicit ordered source IDs separated by commas, at most 16."></label>
      <label>Addition face ID <input id="placement-addition-face" value="0" inputmode="numeric"></label>
      <label>Scale <input id="placement-scale" value="1"></label>
      <label>Height <input id="placement-height" value="0"></label>
      <label>Angle (degrees) <input id="placement-angle" value="0"></label>
      <button id="place-at-faces" title="Place independent copies using native checked face frames. Colors and original incidence remain; overlaps and gaps are retained.">Place copies</button>`;
    const anchor=['augmentation-settings','convex-core-settings','geodesic-settings','layer-join-settings','subdivision-settings']
      .map(id=>document.getElementById(id)).find(Boolean);
    if(!anchor)fail('Placement controls require a construction shelf anchor.');
    anchor.after(panel);this.panel=panel;
    for(let slot=1;slot<=9;slot++){
      const option=document.createElement('option');option.value=`memory:${slot}`;
      this.node('placement-source').append(option);this.memoryOptions.push(option);
    }
    this.node('placement-source').onchange=()=>this.sync();
    this.node('place-at-faces').onclick=context.guard(()=>this.place());this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  memories(){
    const bank=typeof this.context.getMemories==='function'?this.context.getMemories():this.context.getProject()?.memories;
    if(bank===undefined)return Array(9).fill(null);
    if(field(bank,'version')!==1||!Array.isArray(field(bank,'slots'))||field(bank,'slots').length!==9)
      fail('Placement memories require version 1 and nine numbered slots.');
    return items(field(bank,'slots'));
  }
  selected(value,base){
    if(value==='current')return {kind:'current',model:JSON.parse(base.modelSignature),unit:base.unit};
    const match=/^memory:([1-9])$/.exec(value);
    if(!match)fail('Choose the current copy or numbered Memory 1..9.');
    const slot=Number(match[1]),entry=this.memories()[slot-1];
    if(!entry)fail(`Memory ${slot} is empty. Store an addition source first.`);
    const slots=Array(9).fill(null);slots[slot-1]=entry;
    const copy=retrieveMemoryEntry(normalizeMemories({version:1,slots}),slot);
    shape(copy.state.model);
    return {kind:'memory',slot,entry,signature:signature(copy),model:copy.state.model,unit:effectiveUnit(copy.state)};
  }
  capture(){
    shape(field(this.context.getState(),'model'));
    const base=captureNativeSource(this.context),model=JSON.parse(base.modelSignature);
    signature(model);
    if(!units.has(base.unit))fail('Placement source display units are unsupported.');
    const selected=this.selected(this.node('placement-source').value,base),addition=selected.model;
    shape(model);shape(addition);
    if(base.unit!==selected.unit)fail('Source display units differ; choose compatible saved units explicitly before placement. No conversion is performed.');
    if(modelUnit(model)!==modelUnit(addition))
      fail('Source coordinate unit metadata differ; convert geometry explicitly before placement. No conversion is performed.');
    return {base,selected,model,addition};
  }
  verify(owner){
    verifyNativeSource(this.context,owner.base);
    if(owner.selected.kind==='memory'){
      const current=this.memories()[owner.selected.slot-1];
      if(current!==owner.selected.entry||this.selected(`memory:${owner.selected.slot}`,owner.base).signature!==owner.selected.signature)
        fail('The selected placement memory changed. Repeat the construction.');
    }
  }
  async place(){
    if(this.busy)fail('Finish the current placement first.');
    const owner=this.capture(),face_ids=selectedFaces(this.node('placement-face-ids').value,owner.model.faces.length),
      addition_face_id=literalIndex(this.node('placement-addition-face').value,owner.addition.faces.length,'Addition face ID');
    if(face_ids.some(id=>owner.model.faces[id].length>PLACEMENT_CONTROL_LIMITS.faceVertices)||
        owner.addition.faces[addition_face_id].length>PLACEMENT_CONTROL_LIMITS.faceVertices)
      fail('Selected face cycles must contain at most 64 source vertices.');
    const expressions=['scale','height','angle'].map(id=>this.node('placement-'+id).value.trim());
    if(expressions.some(value=>!value||value.length>PLACEMENT_CONTROL_LIMITS.expressionCharacters))
      fail('Enter scale, height, and angle expressions of at most 256 characters each.');
    this.busy=true;this.sync();
    try{
      this.verify(owner);
      const [scale,height,angle_degrees]=await Promise.all(expressions.map(value=>this.context.number(value)));
      this.verify(owner);
      if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0||scale>PLACEMENT_CONTROL_LIMITS.coordinate)
        fail('Scale must be positive, finite, and bounded to 1e100.');
      if(typeof height!=='number'||!Number.isFinite(height)||Math.abs(height)>PLACEMENT_CONTROL_LIMITS.coordinate)
        fail('Height must be finite and bounded to +/-1e100.');
      if(typeof angle_degrees!=='number'||!Number.isFinite(angle_degrees)||Math.abs(angle_degrees)>PLACEMENT_CONTROL_LIMITS.angle)
        fail('Angle must be finite and within +/-360 degrees.');
      const params={addition:owner.addition,face_ids,addition_face_id,scale,height,angle_degrees,color_policy:'preserve'};
      this.verify(owner);
      return await this.context.commit('place-at-faces',params,'Place at faces (3D)',{verifyPublication:()=>this.verify(owner)});
    }finally{this.busy=false;this.sync();}
  }
  sync(){
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    let entries=[];try{entries=this.memories();}catch{}
    for(const [i,option] of this.memoryOptions.entries()){
      let name='Empty',valid=false;
      try{const model=field(field(entries[i],'state'),'model');shape(model);name=field(model,'name','3D source');valid=true;}catch{}
      option.textContent=`Memory ${i+1}: ${typeof name==='string'?name.slice(0,64):'3D source'}`;option.disabled=!valid;
    }
    const button=this.node('place-at-faces');button.disabled=blocked;
    if(!blocked)try{
      shape(field(this.context.getState(),'model'));
      const selected=this.node('placement-source').value;
      if(selected!=='current'){
        const match=/^memory:([1-9])$/.exec(selected);if(!match)fail('Invalid source.');
        shape(field(field(entries[Number(match[1])-1],'state'),'model'));
      }
    }catch{button.disabled=true;}
  }
}
