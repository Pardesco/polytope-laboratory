import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {ProjectiveDualViewer} from './projective-dual-viewer.mjs';
const clone=structuredClone;
const sourceContext=state=>({notes:state.notes??'',unit:state.view.coordinateUnit??state.model.metadata?.coordinateUnits??'model',documentMetadata:state.view.documentMetadata??null});
const content=state=>JSON.stringify([state.view.documentMetadata??null,state.view.elementAnnotations??null,state.view.elementContentDetached??null,state.view.projectiveDual??null]);
export class ProjectiveDualControls{
  constructor(context,{mount=true}={}){
    this.context=context;this.busy=false;this.generation=0;if(!mount)return;
    const panel=document.createElement('details');panel.id='projective-dual-settings';panel.innerHTML='<summary>Projective / infinite dual</summary><label>Reciprocal center XYZ (blank: vertex mean)<input id="projective-dual-center" maxlength="2200"></label><label>Reciprocal radius<input id="projective-dual-radius" maxlength="512" value="1"></label><label>Clipping cube half-width (source units)<input id="projective-dual-bound" maxlength="512" value="4"></label><div class="button-row"><button id="projective-dual-apply">Save reciprocal view recipe</button><button id="projective-dual-show">Show saved reciprocal</button></div><button id="projective-dual-cancel" hidden>Cancel preparation</button><output id="projective-dual-status" aria-live="polite"></output><p class="muted">Retains true projective vertices, including infinity, and original source links. The clipped wire view assigns no filled infinite face, solid measure or net.</p>';
    document.getElementById('sphere-projection-settings').after(panel);this.panel=panel;
    const guard=context.guard??(fn=>fn);this.node('apply').onclick=guard(()=>this.apply());this.node('show').onclick=guard(()=>this.preview());this.node('cancel').onclick=()=>this.cancel();this.sync();
  }
  node(key){return this.panel?.querySelector('#projective-dual-'+key);}
  status(text){if(this.panel)this.node('status').textContent=text;this.context.setStatus?.(text);}
  fields(){return {center:this.node('center').value,radius:this.node('radius').value,bound:this.node('bound').value};}
  async apply(){
    if(this.busy||this.context.isExporting?.())throw Error('Finish current preparation/export first.');
    const state=this.context.getState();if(state?.model.dimension!==3)throw Error('Projective reciprocal currently requires intrinsic 3D source geometry.');
    const raw=this.fields(),fields={radius:{text:raw.radius,min:1e-6,max:1e6},bound:{text:raw.bound,min:1e-6,max:1e9}};if(raw.center.trim())fields.center={text:raw.center,kind:'vector',length:3,min:-1e12,max:1e12};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.fields()});this.entry=entry;this.busy=true;this.sync();
    try{await entry.run(fields,async(values,verify,{signal,source})=>{verify();await this.context.commit('projective-incidence-dual',{version:1,center:values.center??null,radius:values.radius,clipBound:values.bound,sourceContext:sourceContext(this.context.getState())},'Projective reciprocal view',{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:raw});});}
    finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
    return this.preview();
  }
  verify(owner=this.owner){if(!owner)throw Error('Prepare a current projective reciprocal first.');verifyNativeSource(this.context,owner.native);if(content(this.context.getState())!==owner.content)throw Error('Projective view settings or source content changed. Reopen the reciprocal view.');}
  async preview(){
    if(this.busy||this.context.isExporting?.())throw Error('Finish current preparation/export first.');
    this.close();const native=captureNativeSource(this.context),state=native.state,config=state.view.projectiveDual;
    if(!config)throw Error('Save a reciprocal view recipe before opening its clipped display.');
    const actualContext=sourceContext(state);if(config.sourceContext?.notes!==actualContext.notes||config.sourceContext?.unit!==actualContext.unit)throw Error('Saved projective view no longer matches source attributes, units or notes. Save a new recipe.');
    const owner={native,content:content(state)},controller=new AbortController(),generation=++this.generation;this.job=controller;this.busy=true;this.sync();
    const check=()=>{if(controller.signal.aborted||generation!==this.generation)throw Error('Projective view preparation canceled.');this.verify(owner);};
    try{check();const descriptor=await this.context.run('projective-incidence-dual',{...clone(config.settings),sourceContext:sourceContext(state)},JSON.parse(native.modelSignature),'Prepare projective reciprocal',{signal:controller.signal,isCurrent:()=>{try{check();return true;}catch{return false;}}});check();
      if(Object.keys(descriptor.binding??{}).length!==4||Object.keys(config.binding??{}).length!==4||Object.keys(descriptor.binding).some(k=>descriptor.binding[k]!==config.binding[k]))throw Error('Saved projective view no longer matches source attributes, units or notes. Save a new recipe.');
      this.owner=owner;this.descriptor=descriptor;try{this.open(descriptor);}catch(error){this.close();throw error;}this.status(`${descriptor.vertices.filter(v=>v.kind==='ideal-numerical').length} ideal vertices; ${descriptor.edges.length} retained source-edge links; ${descriptor.coincidentPlaneIdentityGroups.length} coincident plane groups. Wire clipping is a display policy.`);return descriptor;
    }finally{if(this.job===controller)this.job=null;this.busy=false;this.sync();}
  }
  open(descriptor){
    if(this.context.openView){this.view=this.context.openView(descriptor,{onSelect:(kind,index)=>this.select(kind,index),onCamera:camera=>this.saveCamera(camera)});return;}
    const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1000px,94vw);height:min(790px,90vh);background:#142330;color:#e8f2fa;border:1px solid #63849a;padding:12px;';
    const heading=document.createElement('h3');heading.textContent='Source-owned projective reciprocal';const tools=document.createElement('div');tools.style.cssText='display:flex;gap:8px;flex-wrap:wrap';const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=this.context.guard?this.context.guard(fn):fn;tools.append(b);};
    const kind=document.createElement('select');for(const [value,text]of [['vertex','Dual vertex / source face'],['edge','Dual edge / source edge'],['face','Dual face cycle / source vertex']]){const option=document.createElement('option');option.value=value;option.textContent=text;kind.append(option);}const index=document.createElement('select');const populate=()=>{index.replaceChildren();const list=kind.value==='vertex'?descriptor.vertices:kind.value==='edge'?descriptor.edges:descriptor.faces;for(const item of list){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.id}${item.kind?' '+item.kind:''}${item.coincidentIdentities?' (coincident identities)':''}${item.coincidentSourceFaceIds?' (plane IDs '+item.coincidentSourceFaceIds.join(', ')+')':''}`;index.append(option);}};kind.onchange=populate;populate();index.onchange=()=>this.select(kind.value,Number(index.value));tools.append(kind,index);
    const clip=document.createElement('input');clip.value=descriptor.settings.clipBound;clip.maxLength=512;clip.setAttribute('aria-label','Reciprocal clipping half-width');clip.style.width='100px';tools.append(clip);add('Set clipping distance',()=>{this.verify();const settings=descriptor.settings;this.node('center').value=settings.center?.join(', ')??'';this.node('radius').value=settings.radius;this.node('bound').value=clip.value;this.close();return this.apply();});
    const canvas=document.createElement('div');canvas.style.cssText='height:calc(100% - 160px);min-height:180px';const note=document.createElement('p');note.textContent='Drag to orbit; wheel to zoom. Finite–ideal edges show both affine directions of their full projective supporting line. Infinite-face fill is unassigned. Source text/PNG stays in the original source document.';
    add('Fit clip box',()=>{this.verify();this.view.fit();this.saveCamera(this.view.cameraState());});add('X',()=>this.view.canonical([1,0,0]));add('Y',()=>this.view.canonical([0,1,0]));add('Z',()=>this.view.canonical([0,0,1]));add('Save PNG',()=>this.export());add('Close',()=>this.close());dialog.append(heading,tools,canvas,note);document.body.append(dialog);this.dialog=dialog;dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});dialog.showModal();this.view=new ProjectiveDualViewer(canvas,{onSelect:(k,i)=>this.select(k,i),onCamera:c=>this.saveCamera(c)});this.view.setDescriptor(descriptor);this.view.fit();if(this.context.getState().view.projectiveDualCamera)this.view.restoreCamera(this.context.getState().view.projectiveDualCamera);
  }
  select(kind,index){this.verify();const list=kind==='vertex'?this.descriptor.vertices:kind==='edge'?this.descriptor.edges:this.descriptor.faces;if(!Number.isInteger(index)||index<0||index>=list.length)throw Error('Choose a retained reciprocal element ID.');this.view?.select(kind,index);this.context.onSelect?.(kind==='vertex'?'face':kind==='face'?'vertex':'edge',index);return list[index];}
  saveCamera(camera){this.verify();this.context.getState().view.projectiveDualCamera=clone(camera);this.context.markDirty?.();}
  async export(){this.verify();const image=this.view.image();this.verify();const result=await this.context.saveImage(image,'Projective reciprocal.png');if(result?.path)this.status('Saved '+result.path);return result;}
  close(){this.view?.destroy();this.view=null;this.dialog?.close();this.dialog?.remove();this.dialog=null;this.owner=null;this.descriptor=null;}
  cancel(){this.generation++;this.entry?.cancel();this.job?.abort();this.close();}
  sync(){if(this.panel&&!this.busy&&this.context.getState()!==this.formSource){this.formSource=this.context.getState();const settings=this.formSource?.view.projectiveDual?.settings;this.node('center').value=settings?.center?.join(', ')??'';this.node('radius').value=settings?.radius??1;this.node('bound').value=settings?.clipBound??4;}if(this.owner){try{this.verify();}catch{this.close();}}if(!this.panel)return;const state=this.context.getState(),blocked=this.busy||this.context.isExporting?.();for(const n of this.panel.querySelectorAll('input'))n.disabled=blocked;this.node('apply').disabled=blocked||state?.model.dimension!==3;this.node('show').disabled=blocked||!state?.view.projectiveDual;this.node('cancel').hidden=!this.busy;}
}
