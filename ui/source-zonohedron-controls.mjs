/** Source-feature construction controls. Native owns direction predicates, convexity,
 * zone merging, output incidence, approximate realization and measures. */
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {NumericEntry} from './numeric-entry.mjs';

export const SOURCE_ZONOHEDRON_OPERATION='source-zonohedron';
export const SOURCE_ZONOHEDRON_VERSION='0.1.0';
export const SOURCE_ZONOHEDRON_CONTROL_LIMITS=Object.freeze({vertices:256,
  sourceBytes:16*1024*1024,faceVertices:64,selectedIds:64,selectionGroups:16,selectionCharacters:1024,
  expressionCharacters:256,coordinate:1e100,edgeLength:1e6,maxZones:32});
const kinds=['vertices','edges','faces','world-axes'],units=new Set(['model','mm','cm','m','in','ft']);
const fail=message=>{throw Error(message);},encoder=new TextEncoder();
const canceled=()=>Object.assign(Error('Source zonohedron construction canceled.'),{name:'AbortError'});
function data(record,key,fallback){
  if(!record||typeof record!=='object')return fallback;
  const d=Object.getOwnPropertyDescriptor(record,key);return d&&'value' in d?d.value:fallback;
}
function eligible(model){
  const vertices=data(model,'vertices'),faces=data(model,'faces'),edges=data(model,'edges'),cells=data(model,'cells',[]);
  return data(model,'dimension')===3&&data(model,'embeddingDimension',3)===3&&
    Array.isArray(vertices)&&vertices.length>=4&&vertices.length<=SOURCE_ZONOHEDRON_CONTROL_LIMITS.vertices&&
    Array.isArray(edges)&&edges.length>=6&&Array.isArray(faces)&&faces.length>=4&&
    faces.every(f=>Array.isArray(f)&&f.length>=3&&f.length<=SOURCE_ZONOHEDRON_CONTROL_LIMITS.faceVertices)&&
    Array.isArray(cells)&&cells.length===0;
}
function indexList(raw,count){
  raw=String(raw).trim();
  if(raw.length>SOURCE_ZONOHEDRON_CONTROL_LIMITS.selectionCharacters||!/^\d{1,8}(?:\s*,\s*\d{1,8})*$/.test(raw))
    fail('Enter an explicit ordered comma-separated list of literal source IDs.');
  const ids=raw.split(',').map(Number);
  if(ids.length>SOURCE_ZONOHEDRON_CONTROL_LIMITS.selectedIds||new Set(ids).size!==ids.length||ids.some(i=>!Number.isSafeInteger(i)||i>=count))
    fail('Choose 1..64 distinct ordered in-range source IDs; world-axis IDs are 0,1,2.');
  return ids;
}
export class SourceZonohedronControls{
  constructor(context,{anchor='face-placement-settings'}={}){
    this.context=context;this.active=null;this.busy=false;this.generation=0;this.destroyed=false;this.groups=[];this.groupSource=null;
    const panel=document.createElement('details');panel.id='source-zonohedron-settings';
    panel.innerHTML=`<summary>Source zonohedron</summary>
      <label>Seed feature <select id="zonohedron-feature"><option value="world-axes">World axes</option><option value="vertices">Source vertices</option><option value="edges">Source edges</option><option value="faces">Source face normals</option></select></label>
      <label>Ordered IDs <input id="zonohedron-ids" value="0,1,2" inputmode="numeric" title="Explicit IDs only; world axes X,Y,Z have IDs 0,1,2. At most 64 distinct source IDs."></label>
      <div><button id="add-zonohedron-selection">Add selection</button><button id="clear-zonohedron-selections">Clear selections</button></div>
      <output id="zonohedron-selection-list" style="white-space:pre-line" aria-live="polite"></output>
      <label>Center X <input id="zonohedron-x" value="0"></label><label>Center Y <input id="zonohedron-y" value="0"></label><label>Center Z <input id="zonohedron-z" value="0"></label>
      <label>Edge length (source units) <input id="zonohedron-length" value="1"></label>
      <label>Maximum zones <input id="zonohedron-max-zones" value="32" type="text" maxlength="512"></label>
      <button id="make-source-zonohedron" title="Construct a new equal-edge zonohedron from explicit literal features. Native checks own convexity and realization; original RGBA is historical, not assigned to new faces.">Construct</button>
      <button id="cancel-source-zonohedron" hidden>Cancel construction</button>`;
    if(context.mount)context.mount(panel);
    else{const target=document.getElementById(anchor);if(!target)fail('Source zonohedron controls require an explicit mount or construction anchor.');target.after(panel);}
    this.panel=panel;
    const guarded=fn=>context.guard?context.guard(fn):fn;
    this.node('make-source-zonohedron').onclick=guarded(()=>this.construct());
    this.node('add-zonohedron-selection').onclick=guarded(()=>this.addSelection());
    this.node('clear-zonohedron-selections').onclick=guarded(()=>this.clearSelections());
    this.node('cancel-source-zonohedron').onclick=()=>this.cancel();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  selection(source){
    const kind=this.node('zonohedron-feature').value;if(!kinds.includes(kind))fail('Choose explicit vertices, edges, faces or world axes.');
    const count=kind==='world-axes'?3:source[kind].length;
    return {kind,ids:indexList(this.node('zonohedron-ids').value,count)};
  }
  selections(source){
    if(!this.groups?.length)return [this.selection(source)];
    if(this.groups.length>SOURCE_ZONOHEDRON_CONTROL_LIMITS.selectionGroups)fail('Choose at most 16 ordered selection groups.');
    const selections=this.groups.map(group=>{
      if(!kinds.includes(group.kind)||!Array.isArray(group.ids))fail('Choose explicit source selection groups.');
      return {kind:group.kind,ids:indexList(group.ids.join(','),group.kind==='world-axes'?3:source[group.kind].length)};
    });
    if(selections.reduce((sum,group)=>sum+group.ids.length,0)>SOURCE_ZONOHEDRON_CONTROL_LIMITS.selectedIds)
      fail('Choose at most 64 source IDs across all selection groups.');
    return selections;
  }
  addSelection(){
    if(this.busy||this.context.isExporting?.())fail('Finish construction or export before editing selection groups.');
    this.sync();const source=data(this.context.getState(),'model');
    if(!eligible(source))fail('Choose an intrinsic XYZ 3D source before adding a selection.');
    const group=this.selection(source),previous=this.groups;
    this.groups=[...(previous||[]),group];
    try{this.selections(source);}catch(error){this.groups=previous;throw error;}
    this.groupSource=source;this.sync();
  }
  clearSelections(){
    if(this.busy||this.context.isExporting?.())fail('Finish construction or export before editing selection groups.');
    this.groups=[];this.sync();
  }
  verify(job){
    if(this.destroyed||this.active!==job||this.generation!==job.generation||job.controller.signal.aborted)throw canceled();
    verifyNativeSource(this.context,job.owner);
    if(JSON.stringify(this.selections(job.source))!==job.selectionSignature)
      fail('The selected source features changed. Repeat the construction.');
  }
  async construct(){
    if(this.destroyed)throw canceled();if(this.busy)fail('Finish or cancel the current source zonohedron construction first.');
    const owner=captureNativeSource(this.context);
    if(encoder.encode(owner.modelSignature).length>SOURCE_ZONOHEDRON_CONTROL_LIMITS.sourceBytes)
      fail('Source zonohedron snapshot exceeds the 16 MiB control bound.');
    const source=JSON.parse(owner.modelSignature);
    if(!eligible(source))fail('Choose an intrinsic XYZ 3D face source with 4..256 vertices and faces of at most 64 vertices. Native checks convexity.');
    if(typeof source.id!=='string'||!source.id||source.id.length>128)fail('Choose a bounded source with a stable model ID.');
    if(source.vertices.some(p=>p.length!==3||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>SOURCE_ZONOHEDRON_CONTROL_LIMITS.coordinate)))
      fail('Source coordinates must be finite XYZ values bounded to 1e100.');
    if(!units.has(owner.unit)||(source.metadata?.coordinateUnits!==undefined&&!units.has(source.metadata.coordinateUnits)))
      fail('Choose supported source display and coordinate units. No conversion is performed.');
    const selections=this.selections(source),maxZones=this.node('zonohedron-max-zones').value;
    const expressions=['x','y','z','length'].map(id=>this.node('zonohedron-'+id).value.trim());
    if(expressions.some(s=>!s||s.length>SOURCE_ZONOHEDRON_CONTROL_LIMITS.expressionCharacters))
      fail('Enter center XYZ and edge length expressions, each at most 256 characters.');
    const job={owner,source,selectionSignature:JSON.stringify(selections),controller:new AbortController(),generation:++this.generation};
    const read=()=>({expressions:['x','y','z','length'].map(id=>this.node('zonohedron-'+id).value),maxZones:this.node('zonohedron-max-zones').value});
    const input=read(),fields={};
    ['x','y','z'].forEach((axis,i)=>{fields[axis]={text:expressions[i]};});
    fields.edge_length={text:expressions[3],min:0,max:SOURCE_ZONOHEDRON_CONTROL_LIMITS.edgeLength,exclusiveMin:true};
    fields.max_zones={text:maxZones,integer:true,min:1,max:SOURCE_ZONOHEDRON_CONTROL_LIMITS.maxZones};
    const entry=new NumericEntry({...this.context,getTarget:read});job.numericEntry=entry;
    this.active=job;this.busy=true;this.sync();
    try{
      this.verify(job);
      const result=await entry.run(fields,(values,verify)=>{
        const verifyPublication=()=>{verify();this.verify(job);};verifyPublication();
        const params={selections,center:[values.x,values.y,values.z],edge_length:values.edge_length,max_zones:values.max_zones};
        return this.context.commit(SOURCE_ZONOHEDRON_OPERATION,params,'Source zonohedron',{
          sourceSnapshot:source,signal:job.controller.signal,verifyPublication,expressionInputs:input});
      },{signal:job.controller.signal});
      // A provider can publish only after its final callback; this subsequent
      // check catches cancellation but cannot roll back a broken provider.
      if(this.active!==job||job.controller.signal.aborted||this.generation!==job.generation)throw canceled();
      return result;
    }catch(error){job.controller.abort();throw error;}
    finally{if(this.active===job){this.active=null;this.busy=false;this.sync();}}
  }
  cancel(){
    const job=this.active;if(!job)return false;this.active=null;this.generation++;this.busy=false;
    job.controller.abort();job.numericEntry?.cancel();this.sync();return true;
  }
  sync(){
    if(this.destroyed)return;
    const source=data(this.context.getState(),'model');
    if(this.groupSource&&source!==this.groupSource)this.groups=[];
    this.groupSource=source;
    const list=this.node('zonohedron-selection-list');
    if(list)list.textContent=(this.groups||[]).map((group,index)=>`${index+1}. ${group.kind}: ${group.ids.join(', ')}`).join('\n');
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.node('make-source-zonohedron').disabled=blocked||!eligible(data(this.context.getState(),'model'));
    const add=this.node('add-zonohedron-selection'),clear=this.node('clear-zonohedron-selections');
    if(add)add.disabled=blocked||!eligible(source)||(this.groups?.length||0)>=SOURCE_ZONOHEDRON_CONTROL_LIMITS.selectionGroups;
    if(clear)clear.disabled=blocked||!this.groups?.length;
    const cancel=this.node('cancel-source-zonohedron');cancel.hidden=!this.busy;cancel.disabled=!this.busy;
  }
  destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;this.panel.remove();}
}
