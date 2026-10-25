import {GeometryExportSession} from './geometry-export-session.mjs';
const UNITS=[['model','Model units'],['mm','mm'],['cm','cm'],['m','m'],['in','in'],['ft','ft']];
export class ExportControls {
  constructor(context){
    this.context=context;this.scope=null;
    const panel=document.createElement('div');panel.innerHTML='<label>Geometry <select id="export-source"><option value="base">Model</option><option value="derived">Derived result</option></select></label><label>Output units <select id="export-units"></select></label><p id="export-contract" class="muted"></p><p id="export-format-note" class="muted"></p><div id="export-preview" role="status" aria-live="polite"></div>';
    this.format=document.getElementById('export-format');this.format.before(panel);this.source=panel.querySelector('#export-source');this.units=panel.querySelector('#export-units');this.contract=panel.querySelector('#export-contract');
    this.note=panel.querySelector('#export-format-note');this.preview=panel.querySelector('#export-preview');this.dialog=document.getElementById('export-dialog');this.button=document.getElementById('confirm-export');
    const formatRow=document.createElement('label');formatRow.textContent='File format';this.units.closest('label').before(formatRow);formatRow.append(this.format);
    this.units.replaceChildren(...UNITS.map(([value,label])=>new Option(label,value)));
    this.session=new GeometryExportSession({...context,isOpen:()=>this.dialog.open,getScope:()=>this.scope,getGeometry:()=>this.selected(),getSelection:()=>({source:this.source.value,format:this.format.value,unit:this.units.value}),useOptions:options=>this.useOptions(options),onState:()=>this.sync()});
    this.source.onchange=()=>this.refresh(true);this.units.onchange=()=>this.refresh();this.format.addEventListener('change',()=>this.refresh());
    this.dialog.addEventListener('cancel',()=>this.cancelPending());
    this.dialog.addEventListener('close',()=>{if(!this.dialog.open)this.cancelPending();});
  }
  cancelPending(){this.scope=null;this.session.cancel();this.context.onClose?.();}
  close(){this.cancelPending();this.dialog.close();}
  unit(){const state=this.context.getState();return state?.view.coordinateUnit??state?.model.metadata?.coordinateUnits??'model';}
  selected(){return this.source.value==='derived'?this.context.getDerived():this.context.getState()?.model;}
  open(){
    if(this.context.isExporting())throw Error('Finish animation export before exporting geometry.');
    if(!this.dialog.open)this.cancelPending();
    if(this.session.saving)throw Error('Finish the current geometry export first.');
    this.scope=Object.freeze({});
    this.source.value='base';this.source.options[1].disabled=!this.context.getDerived();this.dialog.showModal();return this.refresh(true);
  }
  useOptions(options){
    for(const option of this.format.options){const row=options.formats.find(row=>row.format===option.value);option.disabled=!row?.available;option.title=row?.reason??'';}
    const unavailable=options.formats.filter(row=>!row.available),reasons=[...new Set(unavailable.map(row=>row.reason))];
    this.note.textContent=unavailable.length?'Unavailable: '+unavailable.map(row=>row.format.toUpperCase()).join(', ')+'. '+reasons.join(' '):'';
    if(this.format.selectedOptions[0]?.disabled){
      const previous=this.format.value,first=Array.from(this.format.options).find(option=>!option.disabled);
      if(first){this.format.value=first.value;this.note.textContent='Selected '+first.value.toUpperCase()+' because '+previous.toUpperCase()+' is unavailable for this model. '+this.note.textContent;}
    }
    if(this.format.value==='vrml'&&this.unit()!=='model')this.units.value='m';
    for(const option of this.units.options)option.disabled=(this.unit()==='model')!==(option.value==='model')||this.format.value==='vrml'&&this.unit()!=='model'&&option.value!=='m';
    if(this.units.selectedOptions[0]?.disabled)this.units.value=this.unit();
    if(this.unit()==='model')this.note.textContent+=' To convert physical units, declare Coordinate units in Construct → Scale, reflect and extrude first.';
  }
  async refresh(reset=false){
    if(reset)this.units.value=this.unit();
    this.preview.textContent='Preparing export preview…';this.preview.dataset.status='preparing';
    try{
      const result=await this.session.prepare();this.preview.replaceChildren();
      const losses=result.report.losses;
      if(losses.length){const title=document.createElement('p');title.textContent='What this format leaves out';const list=document.createElement('ul');for(const loss of losses){const row=document.createElement('li');row.textContent=loss;list.append(row);}this.preview.append(title,list);}
      else this.preview.textContent=this.format.value==='json'?'Model geometry, metadata and notes are retained. Save a project to retain views and construction history.':'Source boundary incidence and colors are retained. Save a project to retain views and construction history.';
      this.preview.dataset.status='ready';this.sync();return result;
    }catch(error){if(error.name==='AbortError')return null;this.preview.textContent=error.message;this.preview.dataset.status='error';this.sync();return null;}
  }
  sync(){
    const model=this.selected(),saving=Boolean(this.session?.saving),preparing=Boolean(this.session?.preparing);
    document.getElementById('export-domain').textContent=model?`${model.name} · intrinsic ${model.dimension}D`:'No derived geometry available';
    this.contract.textContent=`Coordinates: ${this.unit()} → ${this.units.value}. Display rotation, morphing and camera zoom do not alter this geometry export.`;
    this.source.disabled=saving;this.format.disabled=saving;this.units.disabled=saving;
    this.button.disabled=saving||preparing||!this.session?.prepared;this.button.textContent=saving?'Saving…':preparing?'Preparing…':'Choose file & export';
    for(const id of ['export-net','export-net-pdf']){const node=document.getElementById(id);if(node)node.disabled=saving||!this.context.getNet?.();}
  }
  async confirm(){
    const scope=this.scope;
    try{const result=this.session.prepared?.result,saved=await this.session.confirm();if(saved&&this.scope===scope&&this.dialog.open){this.close();this.context.setStatus('Exported '+saved.path+(result.report.losses.length?' · '+result.report.losses.join(' '):''));}return saved;}
    catch(error){if(error.name==='AbortError'||this.scope!==scope||!this.dialog.open)return null;this.session.prepared=null;this.preview.textContent=error.message;this.preview.dataset.status='error';this.sync();throw error;}
  }
}
