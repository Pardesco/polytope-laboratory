const UNITS=[['model','Model units'],['mm','mm'],['cm','cm'],['m','m'],['in','in'],['ft','ft']];
export class ExportControls {
  constructor(context){
    this.context=context;
    const panel=document.createElement('div');panel.innerHTML='<label>Geometry <select id="export-source"><option value="base">Base</option><option value="derived">Derived</option></select></label><label>Output units <select id="export-units"></select></label><p id="export-contract" class="muted"></p>';
    document.getElementById('export-format').before(panel);this.source=panel.querySelector('#export-source');this.units=panel.querySelector('#export-units');this.contract=panel.querySelector('#export-contract');
    this.units.replaceChildren(...UNITS.map(([value,label])=>new Option(label,value)));
    this.source.onchange=()=>this.sync(true);this.units.onchange=()=>this.sync();document.getElementById('export-format').addEventListener('change',()=>this.sync());
  }
  selected(){return this.source.value==='derived'?this.context.getDerived():this.context.getState()?.model;}
  open(){if(this.context.isExporting())throw new Error('Finish animation export before exporting geometry.');this.source.value='base';this.source.options[1].disabled=!this.context.getDerived();this.sync(true);document.getElementById('export-dialog').showModal();}
  sync(reset=false){const unit=this.context.getState()?.view.coordinateUnit||'model',model=this.selected();if(reset)this.units.value=unit;if(document.getElementById('export-format').value==='vrml'&&unit!=='model')this.units.value='m';document.getElementById('export-domain').textContent=model?`${model.name} · intrinsic ${model.dimension}D`:'No derived geometry available';this.contract.textContent=`Coordinates: ${unit} → ${this.units.value}. Intrinsic coordinates; display rotation and camera zoom do not alter the output.`;document.getElementById('confirm-export').disabled=!model;}
  async confirm(){
    if(this.context.isExporting())throw new Error('Finish animation export before exporting geometry.');
    const state=this.context.getState(),model=this.selected();if(!model)throw new Error('Choose an available geometry source.');
    const metadata=()=>JSON.stringify([state.view.documentMetadata??null,state.notes??null]),signature=metadata();
    const format=document.getElementById('export-format').value,result=await this.context.prepare(model,{format,source_unit:state.view.coordinateUnit||'model',target_unit:this.units.value,
      ...(state.view.documentMetadata?{document_metadata:structuredClone(state.view.documentMetadata)}:{}),...(state.notes?{notes:state.notes}:{})});
    if(state!==this.context.getState()||model!==this.selected()||metadata()!==signature)throw new Error('Export source or metadata changed while preparing geometry.');
    this.contract.textContent=result.report.losses.join(' ')||'Full source incidence retained by OFF/JSON; other formats have their declared boundary contracts.';
    const saved=await this.context.export(result.model,format);if(saved){document.getElementById('export-dialog').close();this.context.setStatus('Exported '+saved.path+(result.report.losses.length?' · '+result.report.losses.join(' '):''));}
  }
}
