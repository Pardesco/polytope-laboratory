import {GeometryExportSession} from './geometry-export-session.mjs';
import {PrintableExportControls} from './printable-export.mjs';
import {InterchangeExportControls,isExportAssembly} from './interchange-controls.mjs';
import {updateExportFormatLabels} from './export-format-labels.mjs';
import {createStatus} from './status.mjs';
const UNITS=[['model','Model units'],['mm','mm'],['cm','cm'],['m','m'],['in','in'],['ft','ft']];
export class ExportControls {
  constructor(context){
    this.context=context;this.scope=null;
    const panel=document.createElement('div');panel.innerHTML='<label>Geometry <select id="export-source"><option value="base">Model</option><option value="derived">Derived result</option></select></label><label>Output units <select id="export-units"></select></label><p id="export-contract" class="muted"></p><p id="export-format-note" class="muted"></p><div id="export-preview" role="status" aria-live="polite"></div>';
    this.format=document.getElementById('export-format');this.format.before(panel);this.source=panel.querySelector('#export-source');this.units=panel.querySelector('#export-units');this.contract=panel.querySelector('#export-contract');
    this.note=panel.querySelector('#export-format-note');this.preview=panel.querySelector('#export-preview');this.dialog=document.getElementById('export-dialog');this.button=document.getElementById('confirm-export');
    this.dialog.querySelector('h2').textContent='Export model';
    const formatRow=document.createElement('label');formatRow.textContent='File format';this.units.closest('label').before(formatRow);formatRow.append(this.format);
    this.units.replaceChildren(...UNITS.map(([value,label])=>new Option(label,value)));
    this.format.append(new Option('3MF · printable shells (mm)','3mf'));
    this.format.append(new Option('GLB · displayed glTF 2.0 (meters)','glb'),new Option('X3D · colored faces and lines','x3d'));
    this.formatLabels=new Map(Array.from(this.format.options,option=>[option.value,option.textContent]));
    this.previewStatus=createStatus(text=>{this.preview.textContent=text;});
    this.printable=new PrintableExportControls({...context,getGeometry:()=>this.selected(),getViewer:()=>context.getViewer(this.source.value),setFormat:value=>{this.format.value=value;}},panel,()=>this.refresh());
    this.displayed=new InterchangeExportControls({...context,getGeometry:()=>this.selected(),getViewer:()=>context.getViewer(this.source.value),setFormat:value=>{this.format.value=value;}},panel,this.printable.node('kind'),()=>this.refresh());
    this.session=new GeometryExportSession({...context,isOpen:()=>this.dialog.open,getScope:()=>this.scope,getGeometry:()=>this.selected(),getSelection:()=>({source:this.source.value,format:this.format.value,unit:this.units.value,printable:this.printable.selection(),displayed:this.displayed.selection()}),getDisplaySignature:()=>this.displayed.enabled?this.displayed.signature():this.printable.signature(),beforeCapture:o=>this.displayed.enabled?this.displayed.beforeCapture(o):this.printable.beforeCapture(o),describe:(m,o)=>this.displayed.enabled?this.displayed.describe():this.printable.enabled?this.printable.describe():context.describe(m,o),prepare:(m,p,o)=>this.displayed.enabled?this.displayed.prepare(m,p,o):this.printable.enabled?this.printable.prepare(m,p,o):context.prepare(m,p,o),useOptions:options=>this.useOptions(options),onState:()=>this.sync()});
    this.source.onchange=()=>{if(isExportAssembly(this.selected()))this.printable.node('kind').value='displayed';return this.refresh(true);};this.units.onchange=()=>this.refresh();this.format.addEventListener('change',()=>{if(this.format.value==='glb'&&!this.printable.enabled)this.printable.node('kind').value='displayed';this.refresh();});
    this.dialog.addEventListener('cancel',()=>this.cancelPending());
    this.dialog.addEventListener('close',()=>{if(!this.dialog.open)this.cancelPending();});
  }
  cancelPending(){this.scope=null;this.previewStatus?.settle(this.previewProgress);this.session.cancel();this.context.onClose?.();}
  close(){this.cancelPending();this.dialog.close();}
  unit(){const state=this.context.getState();return state?.view.coordinateUnit??state?.model.metadata?.coordinateUnits??'model';}
  selected(){return this.source.value==='derived'?this.context.getDerived():this.context.getState()?.model;}
  open(){
    if(this.context.isExporting())throw Error('Finish animation export before exporting geometry.');
    if(!this.dialog.open)this.cancelPending();
    if(this.session.saving)throw Error('Finish the current geometry export first.');
    this.scope=Object.freeze({});
    this.source.value='base';this.source.options[1].disabled=!this.context.getDerived();this.goals?.open();this.dialog.showModal();return this.refresh(true);
  }
  useOptions(options){
    if(this.displayed.enabled){
      if(this.units.value==='model'||['glb','vrml'].includes(this.format.value))this.units.value='m';
      for(const option of this.units.options)option.disabled=option.value==='model'||['glb','vrml'].includes(this.format.value)&&option.value!=='m';
    }
    if(this.printable.enabled){this.units.value='mm';for(const option of this.units.options)option.disabled=option.value!=='mm';}
    for(const option of this.format.options){const row=options.formats.find(row=>row.format===option.value);option.disabled=!row?.available;option.title=row?.reason??'';}
    const unavailable=options.formats.filter(row=>!row.available),reasons=[...new Set(unavailable.map(row=>row.reason))];
    this.note.textContent=unavailable.length?'Unavailable: '+unavailable.map(row=>row.format.toUpperCase()).join(', ')+'. '+reasons.join(' '):'';
    if(this.format.selectedOptions[0]?.disabled){
      const previous=this.format.value,first=Array.from(this.format.options).find(option=>!option.disabled);
      if(first){this.format.value=first.value;this.note.textContent='Selected '+first.value.toUpperCase()+' because '+previous.toUpperCase()+' is unavailable for this model. '+this.note.textContent;}
    }
    if(this.printable.enabled||this.displayed.enabled)return;
    if(this.format.value==='vrml'&&this.unit()!=='model')this.units.value='m';
    for(const option of this.units.options)option.disabled=(this.unit()==='model')!==(option.value==='model')||this.format.value==='vrml'&&this.unit()!=='model'&&option.value!=='m';
    if(this.units.selectedOptions[0]?.disabled)this.units.value=this.unit();
    if(this.unit()==='model')this.note.textContent+=' To convert physical units, declare Coordinate units in Construct → Scale, reflect and extrude first.';
  }
  async refresh(reset=false){
    if(reset)this.units.value=this.unit();
    this.previewStatus.set('');const progress=this.previewStatus.defer('Preparing export preview…');this.previewProgress=progress;this.preview.dataset.status='preparing';
    try{
      const result=await this.session.prepare();this.preview.replaceChildren();
      const losses=result.report.losses;
      if(this.printable.enabled){const r=result.report;this.preview.textContent=`${r.triangleCount.toLocaleString()} triangles · ${r.shellCount.toLocaleString()} closed shells · ${r.volumeMM3!==undefined?r.volumeMM3.toFixed(3)+' mm³ material volume · ':''}${r.solidPolicy?r.solidPolicy+' · ':''}bounding box ${r.boundsMM.size.map(x=>x.toFixed(3)).join(' × ')} mm. File size residual ${r.encodedSizeResidualMM.toExponential(2)} mm. ${r.warnings.join(' ')} ${losses.join(' ')}`;this.preview.dataset.status='ready';this.sync();return result;}
      if(this.displayed.enabled){const r=result.report;this.preview.textContent=`${r.triangleCount.toLocaleString()} face triangles · ${r.lineCount.toLocaleString()} line segments · longest dimension ${r.sizeMeters} m. ${r.encodedSizeResidualMeters!==undefined?'GLB float32 size residual '+r.encodedSizeResidualMeters.toExponential(2)+' m. ':''}${losses.join(' ')}`;this.preview.dataset.status='ready';this.sync();return result;}
      if(losses.length){const title=document.createElement('p');title.textContent='What this format leaves out';const list=document.createElement('ul');for(const loss of losses){const row=document.createElement('li');row.textContent=loss;list.append(row);}this.preview.append(title,list);}
      else this.preview.textContent=this.format.value==='json'?'Model geometry, metadata and notes are retained. Save a project to retain views and construction history.':'Source boundary incidence and colors are retained. Save a project to retain views and construction history.';
      this.preview.dataset.status='ready';this.sync();return result;
    }catch(error){if(error.name==='AbortError')return null;this.preview.textContent=error.message;this.preview.dataset.status='error';this.sync();return null;}
    finally{this.previewStatus.settle(progress);}
  }
  sync(){
    const model=this.selected(),saving=Boolean(this.session?.saving),preparing=Boolean(this.session?.preparing);
    document.getElementById('export-domain').textContent=model?`${model.name} · intrinsic ${model.dimension}D`:'No derived geometry available';
    this.contract.textContent=`Coordinates: ${this.unit()} → ${this.units.value}. Display rotation, morphing and camera zoom do not alter this geometry export.`;
    if(this.displayed?.enabled)this.contract.textContent='Displayed geometry is scaled to the chosen longest dimension. GLB coordinates are meters; text formats use Output units. Face colors follow the viewport.';
    if(this.printable?.enabled)this.contract.textContent='Printable geometry uses the current displayed 3D projection and rotation, scaled to millimeters. Observer camera orientation is independent of the sculpture.';
    this.printable?.sync(saving);
    updateExportFormatLabels(this.format.options,this.formatLabels,{printable:this.printable.enabled,displayed:this.displayed.enabled,ascii:this.printable.node('ascii').checked});
    if(this.printable?.settings){this.printable.settings.hidden=!this.printable.enabled;for(const option of this.printable.node('kind').options)option.disabled=isExportAssembly(model)&&option.value!=='displayed';}
    this.displayed?.sync(saving);
    this.source.disabled=saving;this.format.disabled=saving;this.units.disabled=saving||Boolean(this.printable?.enabled);
    this.button.disabled=saving||preparing||!this.session?.prepared;this.button.textContent=saving?'Saving…':preparing?'Preparing…':'Choose file & export';
    for(const id of ['export-net','export-net-pdf']){const node=document.getElementById(id);if(node)node.disabled=saving||!this.context.getNet?.();}
    this.goals?.sync();
  }
  async confirm(){
    const scope=this.scope;
    try{const saved=await this.session.confirm();if(saved&&this.scope===scope&&this.dialog.open){this.close();this.context.setStatus('Exported '+saved.path);}return saved;}
    catch(error){if(error.name==='AbortError'||this.scope!==scope||!this.dialog.open)return null;this.session.prepared=null;this.preview.textContent=error.message;this.preview.dataset.status='error';this.sync();throw error;}
  }
}
