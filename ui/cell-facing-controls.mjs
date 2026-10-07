export class CellFacingControls {
  constructor(context){
    this.context=context;this.busy=false;
    this.root=document.createElement('div');this.root.id='cell-facing-controls';
    this.root.innerHTML='<label>4D cells <select id="cell-facing"><option value="all">All directions</option><option value="hide-front">Hide front</option><option value="hide-back">Hide back</option><option value="front">Front only</option><option value="back">Back only</option></select></label><output id="cell-facing-result"></output>';
    document.getElementById('cell-visibility-controls').after(this.root);
    this.select=this.root.querySelector('select');this.output=this.root.querySelector('output');
    this.select.onchange=context.guard(()=>this.change());this.sync();
  }
  sync(){
    const state=this.context.getState();this.root.hidden=state?.model.dimension!==4||!state?.model.cells?.length;
    const supported=state?.model.interpretation==='convex-polytope';
    this.select.disabled=this.busy||this.context.isExporting()||!supported;
    this.select.title=supported?'Facing is relative to the 4D projection observer. Grazing cells remain in Hide front/back.':'Generalized cells require explicit orientation semantics; use source cell Hide/Isolate.';
    this.select.value=state?.view.cellFacing||'all';
    const counts=this.context.getCounts();this.output.textContent=counts?`${counts.front} front / ${counts.back} back / ${counts.grazing} grazing`:'';
  }
  async change(){
    if(this.busy||this.context.isExporting())throw new Error('Finish or cancel the current operation before changing cell facing.');
    const state=this.context.getState(),mode=this.select.value;
    if(!state)throw new Error('Open a source model first.');
    this.busy=true;this.select.disabled=true;
    try{
      let cache=state.view.cellFacingCache;
      if(mode!=='all'&&(!cache||cache.sourceFingerprint!==state.model.fingerprint))cache=await this.context.evaluate(state.model);
      if(this.context.getState()!==state)throw new Error('Source document changed while cell planes were evaluated.');
      state.view.cellFacing=mode;if(cache)state.view.cellFacingCache=cache;this.context.display();this.context.markDirty();
    }finally{this.busy=false;this.sync();}
  }
}
