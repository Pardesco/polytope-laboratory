import {NumericEntry} from './numeric-entry.mjs';
import {explainAvailability} from './availability-copy.mjs';
import {normalizeMemories,retrieveMemoryEntry} from './model-memories.mjs';

const fail=message=>{throw Error(message);};
export class FaceSurgeryControls{
  constructor(context){
    this.context=context;this.busy=false;
    this.panel=document.createElement('details');this.panel.id='face-surgery-settings';
    this.panel.innerHTML=`<summary>Augment / excavate</summary>
      <p>Pick a face in the viewport (Selection kind: Face). For model copies, you can also pick a vertex.</p>
      <output id="surgery-selection" aria-live="polite"></output>
      <label>Piece <select id="surgery-piece"><option value="pyramid">Pyramid</option><option value="cupola">Cupola (lower ring)</option><option value="prism">Prism</option><option value="antiprism">Antiprism</option><option value="library">Built-in library model</option>${Array.from({length:9},(_,i)=>`<option value="memory:${i+1}">Model memory ${i+1}</option>`).join('')}</select></label>
      <label><input id="surgery-all" type="checkbox"> All faces / vertices of the same type</label>
      <label><input id="surgery-excavate" type="checkbox"> Excavate (inwards)</label>
      <label>Height / face edge (vertex offset in source units) <input id="surgery-height" value="1/4" maxlength="256"></label>
      <p>Height sets generated pieces. Face attachment of a stored/library model uses its saved shape and a scale that preserves the matching face.</p>
      <details><summary>Orientation and model options</summary>
      <label>Library key <input id="surgery-library-key" value="cube" maxlength="128"></label>
      <p>Choose a library key, or store any convex library model (including a rotunda) in a model memory first.</p>
      <label>Addition face ID <input id="surgery-addition-face" value="0" inputmode="numeric"></label>
      <label>Twist (cycle offset, 0 … n−1) <input id="surgery-twist" value="0" maxlength="256"></label>
      <label>Model scale <input id="surgery-scale" value="1" maxlength="256"></label>
      <label><input id="surgery-blend" type="checkbox" checked> Blend equal-color coplanar faces when possible</label>
      </details>
      <button id="apply-face-surgery">Apply to selection</button>
      <label>Tunnel radius / face radius <input id="surgery-inset" value="1/2" maxlength="256"></label>
      <button id="drill-face-surgery">Drill opposite faces (prism)</button>
      <button id="cancel-face-surgery" hidden>Cancel construction</button>
      <p>Drill finds a translated parallel opposite face and leaves a polygonal rim. Numerical checks refuse intersecting cavities. Vertex copies form a literal compound; overlaps remain.</p>`;
    document.getElementById('augmentation-settings').after(this.panel);
    this.node('apply-face-surgery').onclick=context.guard(()=>this.construct());
    this.node('drill-face-surgery').onclick=context.guard(()=>this.construct('drill'));
    this.node('cancel-face-surgery').onclick=()=>this.entry?.cancel();this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  target(){
    const selection=this.context.selection();
    return {selection,piece:this.node('surgery-piece').value,all:this.node('surgery-all').checked,
      excavate:this.node('surgery-excavate').checked,blend:this.node('surgery-blend').checked,
      height:this.node('surgery-height').value,scale:this.node('surgery-scale').value,
      twist:this.node('surgery-twist').value,inset:this.node('surgery-inset').value,
      library:this.node('surgery-library-key').value,additionFace:this.node('surgery-addition-face').value};
  }
  memory(slot){
    const bank=this.context.getProject().memories;
    const copy=retrieveMemoryEntry(normalizeMemories(bank),slot);
    if(!copy)fail(`Model memory ${slot} is empty. Store a convex addition model first.`);
    return copy;
  }
  async construct(requested){
    if(this.busy)fail('Finish the current construction first.');
    const target=this.target(),selection=target.selection,source=this.context.getState()?.model;
    if(!source||source.dimension!==3||(source.embeddingDimension??3)!==3)fail('Choose a 3D source model.');
    if(!['face','vertex'].includes(selection.kind)||!Number.isInteger(selection.index)||selection.index<0||
      selection.index>=source[selection.kind==='face'?'faces':'vertices'].length)fail('Pick a source face or vertex in Selection first.');
    const mode=requested==='drill'?'drill':selection.kind==='vertex'?'vertices':target.excavate?'excavate':'augment';
    if(mode==='drill'&&(selection.kind!=='face'||target.piece!=='prism'||target.all))
      fail('For Drill, pick one face, choose Prism, and clear All of type.');
    if(mode==='vertices'&&target.excavate)fail('Clear Excavate before placing vertex copies.');
    let memory=null,slot=null;
    const params={mode,all_of_type:target.all};
    if(mode==='vertices')params.vertex_id=selection.index;else params.face_id=selection.index;
    if(target.piece.startsWith('memory:')){
      slot=Number(target.piece.slice(7));memory=this.memory(slot);params.piece='model';params.addition=memory.state.model;
      const unit=s=>s.view?.coordinateUnit??s.model.metadata?.coordinateUnits??'model';
      if(unit(memory.state)!==unit(this.context.getState()))fail('Memory and source display units differ; convert explicitly first.');
    }else params.piece=target.piece;
    if(mode==='vertices'&&!['model','library'].includes(params.piece))fail('Vertex placement requires a built-in library model or model memory.');
    if(params.piece==='library')params.library_key=target.library.trim();
    if(['model','library'].includes(params.piece)){
      if(!/^\d{1,8}$/.test(target.additionFace.trim()))fail('Addition face ID must be a literal nonnegative integer.');
      params.addition_face_id=Number(target.additionFace);
    }
    const fields={};
    if(mode==='drill')fields.inset={text:target.inset,min:.01,max:.99};
    else{
      fields.height={text:target.height,min:mode==='vertices'?0:.0001,max:100};
      fields.scale={text:target.scale,min:.0001,max:100};
      if(mode!=='vertices')fields.cycle_offset={text:target.twist,integer:true,min:0,max:source.faces[selection.index].length-1};
      if(mode!=='vertices')params.blend=target.blend;
    }
    const signature=memory?JSON.stringify(memory):null;
    const entry=new NumericEntry({...this.context,getTarget:()=>this.target()});this.entry=entry;
    this.busy=true;this.sync();
    try{
      return await entry.run(fields,(values,verify,{signal})=>{
        const verifyPublication=()=>{verify();if(memory&&JSON.stringify(this.memory(slot))!==signature)fail('The chosen model memory changed. Repeat the construction.');};
        verifyPublication();
        return this.context.commit('face-surgery',{...params,...values},
          {augment:'Augment faces',excavate:'Excavate faces',drill:'Drill prism tunnel',vertices:'Place models at vertices'}[mode],
          {signal,verifyPublication});
      });
    }finally{this.busy=false;this.entry=null;this.sync();}
  }
  sync(){
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    const cancel=this.node('cancel-face-surgery');cancel.hidden=!this.busy;cancel.disabled=false;
    const selection=this.context.selection();this.node('surgery-selection').textContent=`Current selection: ${selection.kind} ${selection.index}`;
    this.node('surgery-blend').disabled=blocked||selection.kind==='vertex';
    if(!this.context.getState()?.model)for(const id of ['apply-face-surgery','drill-face-surgery'])this.node(id).disabled=true;
    explainAvailability(this.panel,this.busy?'Finish or cancel the current construction.':this.context.isExporting?.()?'Finish animation export before construction.':'Choose a 3D source model.',{'surgery-blend':blocked?'Finish the current construction or export.':'Blending applies to face surgery; vertex copies remain separate.'});
  }
}
