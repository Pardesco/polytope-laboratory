/** Explicit convex parallel-layer join controls. Native commit owns final
 * convexity, rank/measure validation and native-await publication guards.
 * Mounted in the application's construction controls.
 */
import {storeMemory,normalizeMemories} from './model-memories.mjs';
import {NumericEntry,NUMERIC_ENTRY_LIMITS} from './numeric-entry.mjs';
import {splitExpressionVector} from './expression-entry.mjs';

export const SEGMENTOTOPE_CONTROL_LIMITS=Object.freeze({vertices:64,coordinate:1e100,orthogonality:1e-10});
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=SEGMENTOTOPE_CONTROL_LIMITS.coordinate;
const key=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;

function shape(model,role){
  const embedding=model?.embeddingDimension??model?.dimension;
  if(!model||!(role==='base'?model.dimension===3&&embedding===3:
    (model.dimension===3&&embedding===3)||(model.dimension===2&&[2,3].includes(embedding))))
    throw Error(role==='base'?'Choose an intrinsic 3D base embedded in XYZ.':'The top memory must contain an intrinsic 2D or 3D model with at most three coordinates.');
  if(typeof model.id!=='string'||!model.id.length||model.id.length>256)throw Error('Layer sources require a stable nonempty source model ID.');
  if(!Array.isArray(model.vertices)||!model.vertices.length||model.vertices.length>64||
    model.vertices.some(p=>!Array.isArray(p)||p.length!==embedding||p.some(x=>!finite(x))))
    throw Error('Layer sources require finite coordinates and at most 64 selected vertices in total.');
  if(!Array.isArray(model.edges)||!Array.isArray(model.faces)||!Array.isArray(model.cells??[])||(model.cells??[]).length)
    throw Error('Choose a source boundary without 4D cells.');
  if(model.edges.length>100000||model.faces.length>100000)throw Error('Layer source incidence resource limit exceeded.');
  if(role==='base'||model.dimension===3){
    if(model.vertices.length<4||model.faces.length<4)throw Error('The 3D layer source must have a closed face boundary.');
    const edges=new Set(),boundary=new Map(),used=new Set();
    const index=v=>Number.isInteger(v)&&v>=0&&v<model.vertices.length;
    for(const edge of model.edges){
      if(!Array.isArray(edge)||edge.length!==2||edge[0]===edge[1]||edge.some(v=>!index(v)))throw Error('The layer source has invalid edges.');
      const id=key(...edge);if(edges.has(id))throw Error('The layer source has duplicate edges.');edges.add(id);
    }
    let references=0;
    for(const face of model.faces){
      if(!Array.isArray(face)||face.length<3||new Set(face).size!==face.length||face.some(v=>!index(v)))throw Error('The layer source has an invalid face cycle.');
      references+=face.length;if(references>1000000)throw Error('Layer source incidence resource limit exceeded.');
      for(let i=0;i<face.length;i++){
        used.add(face[i]);const id=key(face[i],face[(i+1)%face.length]);
        if(!edges.has(id))throw Error('The layer source face references a missing edge.');
        boundary.set(id,(boundary.get(id)??0)+1);
        if(boundary.get(id)>2)throw Error('The 3D layer source must have a closed face boundary.');
      }
    }
    if(used.size!==model.vertices.length||boundary.size!==edges.size||[...boundary.values()].some(n=>n!==2))throw Error('The 3D layer source must have a closed face boundary.');
  }
  return model;
}

function captureModel(model,role,copy=true){
  shape(model,role);
  // Reuse the bounded plain-JSON clone (32 MiB / 64 levels) rather than
  // stringify/structuredClone unbounded arbitrary retained source attributes.
  const snapshot=storeMemory(undefined,1,{model,view:{}},{}).slots[0].state.model;
  return {signature:JSON.stringify(snapshot),...(copy?{copy:structuredClone(snapshot)}:{})};
}

function matrixExpressions(text){
  if(typeof text!=='string'||text.length>9*(NUMERIC_ENTRY_LIMITS.characters+1)+128)throw Error('Top XYZ matrix expression text exceeds its input bound.');
  const rows=text.trim().split(/\r?\n/).filter(row=>row.trim());
  try{return rows.length===3?rows.flatMap(row=>splitExpressionVector(row,3)):splitExpressionVector(text,9);}
  catch{throw Error('Enter nine matrix expressions as three XYZ rows or a comma/semicolon list; whitespace separates numeric literals only.');}
}
function matrix(a){
  if(a.some(x=>!Number.isFinite(x)||Math.abs(x)>1+1e-8))throw Error('Top XYZ matrix entries must be finite and bounded to 1.');
  const m=[a.slice(0,3),a.slice(3,6),a.slice(6,9)],tolerance=SEGMENTOTOPE_CONTROL_LIMITS.orthogonality;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(m[i].reduce((sum,x,k)=>sum+x*m[j][k],0)-(i===j?1:0))>tolerance)
    throw Error('Top XYZ matrix must be orthogonal; scaling and shear are unsupported.');
  const det=a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);
  if(Math.abs(Math.abs(det)-1)>tolerance)throw Error('Top XYZ matrix must have determinant +1 or -1.');
  return m;
}

function memorySignature(entry,slot){
  // Validate and detach the COMPLETE selected entry, including source metadata,
  // units, notes and saved view. Other memory slots are independent owners.
  const slots=Array(9).fill(null);slots[slot-1]=entry;
  return JSON.stringify(normalizeMemories({version:1,slots}).slots[slot-1]);
}

export class SegmentotopeControls {
  constructor(context){
    this.context=context;this.busy=false;this.memoryOptions=[];
    const panel=document.createElement('details');panel.id='layer-join-settings';
    panel.innerHTML=`<summary>Parallel layer join (4D)</summary>
      <label>Top source <select id="layer-join-top"><option value="current">Current model copy</option><option value="point">Point</option><option value="edge">Edge</option></select></label>
      <label>Signed layer height <input id="layer-join-height" value="1" title="Base W = −height/2; top W = +height/2"></label>
      <label><input id="layer-join-fit" type="checkbox">Match edges (positive height)</label>
      <div id="layer-join-point-row" hidden><label><span id="layer-join-point-label">Point XYZ</span><input id="layer-join-x" aria-label="Top point or edge start X" value="0"><input id="layer-join-y" aria-label="Top point or edge start Y" value="0"><input id="layer-join-z" aria-label="Top point or edge start Z" value="0"></label></div>
      <div id="layer-join-edge-row" hidden><label>Edge end XYZ<input id="layer-join-end-x" aria-label="Top edge end X" value="1"><input id="layer-join-end-y" aria-label="Top edge end Y" value="0"><input id="layer-join-end-z" aria-label="Top edge end Z" value="0"></label></div>
      <details><summary>Top XYZ transform</summary><label><input id="layer-join-transform" type="checkbox">Apply explicit transform</label>
      <label>Orthogonal 3×3 matrix <textarea id="layer-join-matrix" rows="3" aria-label="Top XYZ matrix" title="Three XYZ rows; separate expressions with commas or semicolons. Native degree trig such as cosd(30) is supported. Whitespace separates literal numbers only.">1 0 0\n0 1 0\n0 0 1</textarea></label>
      <label>XYZ translation<input id="layer-join-tx" aria-label="Top translation X" value="0"><input id="layer-join-ty" aria-label="Top translation Y" value="0"><input id="layer-join-tz" aria-label="Top translation Z" value="0"></label></details>
      <button id="make-layer-join" title="Native validation checks ordered convex source boundaries; coordinates are joined by their defining convex hull.">Construct 4D layer join</button>`;
    const anchor=['podia-settings','torus-settings','step-prism-settings','antiprism-settings','product-settings','star-polygon-settings','cupola-settings','subdivision-settings'].map(id=>document.getElementById(id)).find(Boolean);
    if(!anchor)throw Error('Layer join controls require an existing construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    for(let slot=1;slot<=9;slot++){
      const option=document.createElement('option');option.value=`memory:${slot}`;this.memoryOptions.push(option);
      panel.querySelector('#layer-join-top').append(option);
    }
    panel.querySelector('#layer-join-top').onchange=()=>this.sync();
    panel.querySelector('#layer-join-transform').onchange=()=>this.sync();
    panel.querySelector('#layer-join-fit').onchange=()=>this.sync();
    panel.querySelector('#make-layer-join').onclick=context.guard(()=>this.join());this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  checkExport(){if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');}
  memories(){
    const bank=this.context.getMemories?.();if(bank===undefined)return Array(9).fill(null);
    if(!bank||bank.version!==1||!Array.isArray(bank.slots)||bank.slots.length!==9)throw Error('Model memories require version 1 and nine numbered slots.');
    return bank.slots;
  }
  top(value){
    if(value==='current')return {kind:value,model:this.context.getState()?.model};
    if(value==='point'||value==='edge')return {kind:value};
    const match=/^memory:([1-9])$/.exec(value);
    if(!match)throw Error('Choose the current model, a numbered memory, a point or an edge.');
    const slot=Number(match[1]),entry=this.memories()[slot-1];
    if(!entry?.state?.model)throw Error(`Memory ${slot} is empty. Store a model before selecting it as the top.`);
    return {kind:'memory',slot,entry,model:entry.state.model};
  }
  ownership(selected){
    const state=this.context.getState(),model=state?.model,project=this.context.getProject?.();
    if(!state)throw Error('Choose a source model before constructing a layer join.');
    shape(model,'base');if(selected.model)shape(selected.model,'top');
    const count=selected.model?.vertices.length??(selected.kind==='edge'?2:1);
    if(model.vertices.length+count>64)throw Error('Layer join permits at most 64 selected vertices in total.');
    const base=captureModel(model,'base'),top=selected.model===model?base:selected.model?captureModel(selected.model,'top'):null;
    return {state,model,project,base,top,selected,
      memorySignature:selected.kind==='memory'?memorySignature(selected.entry,selected.slot):null};
  }
  verify(owner){
    this.checkExport();
    if(this.context.getProject?.()!==owner.project||this.context.getState()!==owner.state||this.context.getState()?.model!==owner.model)
      throw Error('The source workspace or history state changed while evaluating the layer join.');
    if(captureModel(owner.model,'base',false).signature!==owner.base.signature)throw Error('The source geometry or attributes changed while evaluating the layer join.');
    if(owner.selected.kind==='memory'){
      const entry=this.memories()[owner.selected.slot-1];
      if(entry!==owner.selected.entry||entry?.state?.model!==owner.selected.model)throw Error('The selected top memory changed while evaluating the layer join.');
      if(memorySignature(entry,owner.selected.slot)!==owner.memorySignature)throw Error('The selected top memory attributes, notes or view changed while evaluating the layer join.');
    }
    if(owner.top&&owner.selected.model!==owner.model&&captureModel(owner.selected.model,'top',false).signature!==owner.top.signature)
      throw Error('The top geometry or attributes changed while evaluating the layer join.');
  }
  inputs(){
    const text=id=>this.node(id).value,selected=this.top(text('layer-join-top'));
    const transform=this.node('layer-join-transform').checked;
    const fit=this.node('layer-join-fit').checked;
    const values=fit?[]:[['height',text('layer-join-height')]];
    if(selected.kind==='point'||selected.kind==='edge')for(const axis of ['x','y','z'])values.push([axis,text('layer-join-'+axis)]);
    if(selected.kind==='edge')for(const axis of ['x','y','z'])values.push(['end-'+axis,text('layer-join-end-'+axis)]);
    if(transform)for(const axis of ['x','y','z'])values.push(['t'+axis,text('layer-join-t'+axis)]);
    if(values.some(([,value])=>!value.trim()))throw Error('Enter the signed height and every selected XYZ coordinate.');
    const matrixTexts=transform?matrixExpressions(text('layer-join-matrix')):null;
    return {selected,values,fit,matrixTexts};
  }
  formTarget(){return Object.fromEntries(['layer-join-top','layer-join-height','layer-join-fit','layer-join-transform','layer-join-matrix',
    ...['x','y','z','end-x','end-y','end-z','tx','ty','tz'].map(axis=>'layer-join-'+axis)]
    .map(id=>[id,['layer-join-fit','layer-join-transform'].includes(id)?Boolean(this.node(id).checked):this.node(id).value]));}
  cancelNumeric(){this.numericEntry?.cancel();}
  async join(){
    this.checkExport();if(this.busy)throw Error('Finish the current layer join first.');
    const input=this.inputs(),owner=this.ownership(input.selected);
    const sourceId=['point','edge'].includes(input.selected.kind)?globalThis.crypto.randomUUID():null;
    const expressionInputs=Object.fromEntries(input.values),fields=Object.fromEntries(input.values.map(([name,text])=>[name,{text,nonzero:name==='height'}]));
    if(input.matrixTexts)for(let row=0;row<3;row++)fields['matrix'+row]={kind:'vector',text:input.matrixTexts.slice(3*row,3*row+3).join(';'),length:3,min:-1-1e-8,max:1+1e-8};
    if(input.matrixTexts)expressionInputs.top_matrix=this.node('layer-join-matrix').value;
    const bindingOnly=!Object.keys(fields).length;
    if(bindingOnly)fields.binding={text:'0',min:0,max:0};
    const entry=new NumericEntry({...this.context,getTarget:()=>{this.verify(owner);return this.formTarget();},
      // A fitted current/memory top without transforms has no numeric entries.
      // Keep the same owner/publication fences without scheduling dummy IPC.
      ...bindingOnly?{evaluateMany:async()=>[0]}:{}});
    this.numericEntry=entry;this.busy=true;this.sync();
    try{
      return await entry.run(fields,async(evaluated,verify,{signal,source})=>{
      let top=owner.top?.copy;
      const point=['x','y','z'].map(axis=>evaluated[axis]);
      if(input.selected.kind==='point')top={kind:'point',coordinates:point,source_id:sourceId};
      else if(input.selected.kind==='edge'){
        const end=['x','y','z'].map(axis=>evaluated['end-'+axis]);
        if(end.every((value,i)=>value===point[i]))throw Error('Top edge endpoints must be distinct.');
        top={kind:'edge',start:point,end,source_id:sourceId};
      }
      const params={top,...input.fit?{}:{height:evaluated.height}};
      if(input.matrixTexts){params.top_matrix=matrix([0,1,2].flatMap(row=>evaluated['matrix'+row]));params.top_translation=['x','y','z'].map(axis=>evaluated['t'+axis]);}
      // No intervening await between this final fence and commit invocation.
      // commit must separately fence its native await before workspace mutation.
      const signature=JSON.stringify(params),verifyPublication=()=>{verify();this.verify(owner);if(JSON.stringify(params)!==signature)throw Error('Layer parameters changed before publication.');};
      verifyPublication();
      return await this.context.commit(input.fit?'fit-strict-layer-join':'convex-layer-join',params,input.fit?'Fit strict layer height':'Parallel layer join (4D)',
        {signal,verifyPublication,sourceSnapshot:source,expressionInputs:structuredClone(expressionInputs)});
      });
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  sync(){
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,textarea,button'))if(!node.hasAttribute?.('data-independent-control'))node.disabled=blocked;
    let bank=[];try{bank=this.memories();}catch{}
    for(const [i,option] of this.memoryOptions.entries()){
      const model=bank[i]?.state?.model;option.textContent=`Memory ${i+1} · ${model?.name||'Empty'}`;
      let valid=false;try{if(model){shape(model,'top');valid=true;}}catch{}
      option.disabled=!valid;
    }
    const selected=this.node('layer-join-top').value,coordinates=selected==='point'||selected==='edge';
    this.node('layer-join-height').disabled=blocked||this.node('layer-join-fit').checked;
    this.node('layer-join-point-row').hidden=!coordinates;this.node('layer-join-edge-row').hidden=selected!=='edge';
    this.node('layer-join-point-label').textContent=selected==='edge'?'Edge start XYZ':'Point XYZ';
    for(const axis of ['x','y','z']){
      this.node('layer-join-'+axis).disabled=blocked||!coordinates;
      this.node('layer-join-end-'+axis).disabled=blocked||selected!=='edge';
      this.node('layer-join-t'+axis).disabled=blocked||!this.node('layer-join-transform').checked;
    }
    this.node('layer-join-matrix').disabled=blocked||!this.node('layer-join-transform').checked;
    const button=this.node('make-layer-join');button.disabled=blocked;
    try{
      const base=shape(this.context.getState()?.model,'base'),top=this.top(selected);
      if(top.model)shape(top.model,'top');
      if(base.vertices.length+(top.model?.vertices.length??(top.kind==='edge'?2:1))>64)throw Error('Layer join permits at most 64 selected vertices in total.');
    }catch{button.disabled=true;}
  }
}
