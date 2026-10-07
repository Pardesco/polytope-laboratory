import {NumericEntry} from './numeric-entry.mjs';
export class PresentationControls{
  constructor(context){
    this.context=context;
    const panel=document.createElement('div');panel.innerHTML='<label>Vertices <select id="vertex-style"><option value="point">Points</option><option value="sphere">Spheres</option></select></label><label>Edges <select id="edge-style"><option value="line">Lines</option><option value="cylinder">Cylinders</option></select></label><label title="Radius in normalized projected 3D view coordinates">Vertex view radius <input id="vertex-radius" type="text" maxlength="512" value="0.015"></label><label title="Radius in normalized projected 3D view coordinates">Edge view radius <input id="edge-radius" type="text" maxlength="512" value="0.006"></label><label>Cell shrink <input id="cell-shrink" type="range" min="0.02" max="1" step="0.02" value="1"><output id="cell-shrink-output">1</output></label>';
    document.getElementById('surface-colors').closest('label').after(panel);this.panel=panel;
    for(const id of ['vertex-radius','edge-radius'])panel.querySelector('#'+id).onchange=context.guard(()=>this.editRadius(id));
    for(const [id,field] of [['vertex-style','vertexStyle'],['edge-style','edgeStyle'],['cell-shrink','cellShrink']])
      panel.querySelector('#'+id).addEventListener('input',context.guard(()=>{
        if(context.isExporting())throw Error('Finish animation export before changing presentation.');
        const view=context.getState().view;view[field]=id==='cell-shrink'?Number(this.value(id)):this.value(id);
        if(id==='vertex-style'&&view.vertexStyle==='sphere')view.vertices=true;
        if(id==='edge-style'&&view.edgeStyle==='cylinder')view.edges=true;
        document.getElementById('vertices-visible').checked=view.vertices;context.display();context.markDirty();this.sync();
      }));
  }
  async editRadius(id){
    if(!['vertex-radius','edge-radius'].includes(id))throw Error('Choose a presentation radius.');
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current radius edit first.');
    const field=id==='vertex-radius'?'vertexRadius':'edgeRadius',fallback=id==='vertex-radius'?.015:.006;
    const entry=new NumericEntry({...this.context,getTarget:()=>({text:this.value(id),radius:this.context.getState()?.view[field]??fallback})});
    this.numericEntry=entry;
    try{return await entry.run({radius:{text:this.value(id),min:0,max:.5,exclusiveMin:true}},({radius},verify)=>{
      verify();this.context.getState().view[field]=radius;this.panel.querySelector('#'+id).value=String(radius);
      this.context.display();this.context.markDirty();
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  cancelNumeric(){this.numericEntry?.cancel();}
  value(id){return this.panel.querySelector('#'+id).value;}
  sync(){const state=this.context.getState();if(!state)return;const view=state.view;for(const [id,value] of [['vertex-style',view.vertexStyle||'point'],['edge-style',view.edgeStyle||'line'],['vertex-radius',view.vertexRadius??.015],['edge-radius',view.edgeRadius??.006],['cell-shrink',view.cellShrink??1]]){const input=this.panel.querySelector('#'+id);if(!(['vertex-radius','edge-radius'].includes(id)&&(this.numericEntry?.busy||document.activeElement===input)))input.value=String(value);input.disabled=this.context.isExporting()||(id==='cell-shrink'&&state.model.dimension!==4);}this.panel.querySelector('#cell-shrink-output').textContent=String(view.cellShrink??1);}
}
