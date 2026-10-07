import {NumericEntry} from './numeric-entry.mjs';
export class FaceEditingControls{
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='face-editing-settings';panel.innerHTML='<summary>Face editing</summary><label>Coincidence tolerance <input id="coincidence-tolerance" value="0"></label><label><input id="face-weld" type="checkbox"> Weld coincident coordinates</label><div class="button-row"><button id="coincidence-analyze">Inspect pairs</button><button id="coincidence-remove">Remove pairs</button></div><label>Faces to blend <input id="blend-face-ids" placeholder="0, 1"></label><label>Color policy <select id="face-color-policy"><option value="require-equal">Require equal colors</option><option value="first-source">Use first source</option></select></label><button id="blend-faces">Blend coplanar faces</button><pre id="face-edit-evidence" class="code-box"></pre>';
    document.getElementById('facet').after(panel);this.panel=panel;
    for(const [id,op] of [['coincidence-analyze','face-coincidences'],['coincidence-remove','remove-coincident-pairs'],['blend-faces','blend-faces']])panel.querySelector('#'+id).onclick=context.guard(()=>this.apply(op));
  }
  async apply(op){
    if(this.busy||this.context.isExporting())throw new Error('Finish the current action before editing faces.');
    if(!['face-coincidences','remove-coincident-pairs','blend-faces'].includes(op))throw Error('Choose a supported face action.');
    const read=()=>{
      const target={tolerance:this.panel.querySelector('#coincidence-tolerance').value};
      if(op!=='face-coincidences')target.weld=this.panel.querySelector('#face-weld').checked;
      if(op==='blend-faces'){target.ids=this.panel.querySelector('#blend-face-ids').value;target.color_policy=this.panel.querySelector('#face-color-policy').value;}
      return target;
    };
    const input=read(),entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run({tolerance:{text:input.tolerance,min:0,max:1e100}},async({tolerance},verify,{signal,source})=>{
      const params={tolerance};verify();
      if(op==='face-coincidences'){
        const result=await this.context.analyze(source,params,{signal,verifyPublication:verify,sourceSnapshot:source});verify();
        this.panel.querySelector('#face-edit-evidence').textContent=JSON.stringify({pairs:result.pairs,unpairedFaceIds:result.unpairedFaceIds,tolerance:result.welding.tolerance},null,2);
        return result;
      }else{
        params.weld=input.weld;
        if(op==='blend-faces'){params.face_ids=input.ids.trim().split(/[\s,;]+/).filter(Boolean).map(Number);params.color_policy=input.color_policy;}
        verify();await this.context.commit(op,params,op==='blend-faces'?'Blend selected coplanar faces':'Remove coincident face pairs',
          {signal,verifyPublication:verify,sourceSnapshot:source});
        if(signal.aborted)throw Object.assign(Error('Expression edit canceled.'),{name:'AbortError'});
        this.panel.querySelector('#face-edit-evidence').textContent='Result retained in construction history. Source maps are saved with its geometry.';
      }
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){const disabled=this.busy||this.context.isExporting()||!this.context.getState()?.model.faces.length;for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=disabled;}
}
