import {NumericEntry} from './numeric-entry.mjs';
export class SubdivisionControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='subdivision-settings';
    panel.innerHTML='<summary>Edge subdivision</summary><label>Segments per edge <input id="edge-divisions" type="text" maxlength="512" value="2"></label><label>Source edge IDs <input id="subdivision-edge-ids" placeholder="All edges, or IDs separated by commas"></label><button id="subdivide-edges">Subdivide edges</button>';
    document.getElementById('face-editing-settings').after(panel);this.panel=panel;
    panel.querySelector('button').onclick=context.guard(()=>this.construct());
  }
  async construct(){
    if(this.busy)throw Error('Finish the current subdivision first.');
    const read=()=>({divisions:this.panel.querySelector('#edge-divisions').value,ids:this.panel.querySelector('#subdivision-edge-ids').value});
    const input=read(),raw=input.ids.trim(),tokens=raw?raw.split(/[\s,;]+/):[],edge_ids=raw?tokens.map(Number):null;
    if(tokens.some(text=>!/^\d+$/.test(text))||edge_ids?.some(value=>!Number.isSafeInteger(value)||value<0))
      throw Error('Source edge IDs must be literal nonnegative integers.');
    // The literal ID list can legitimately exceed the small target JSON bound.
    // Bind its exact text directly, like the main point-cloud field.
    const entry=new NumericEntry({...this.context,getTarget:()=>({divisions:read().divisions})});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run({divisions:{text:input.divisions,integer:true,min:1,max:128}},(values,verify,{signal,source})=>{
      const verifyPublication=()=>{verify();if(read().ids!==input.ids)throw Error('The selected source edge IDs changed. Repeat subdivision.');};
      verifyPublication();return this.context.commit('subdivide-edges',{divisions:values.divisions,...edge_ids?{edge_ids}:{}},'Subdivide source edges',
        {verifyPublication,signal,sourceSnapshot:source,expressionInputs:input});
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){for(const node of this.panel.querySelectorAll('input,button'))node.disabled=this.busy||Boolean(this.context.isExporting?.());
    this.panel.querySelector('button').disabled ||= !this.context.getState();}
}
