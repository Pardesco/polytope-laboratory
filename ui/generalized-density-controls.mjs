/** GPL-3.0-or-later. Source-bound generalized surface measurement inspector. */
import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const clone=structuredClone;
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fail=message=>{throw Error(message);};
export class DensitySession{
  constructor(context){this.context=context;this.busy=false;this.generation=0;}
  signature(form){const v=this.context.getState()?.view;return stable([form,v?.generalizedDensity??null,v?.elementAnnotations??null]);}
  invalidate(){this.cancel();this.reply=null;this.owner=null;this.context.clear?.();}
  cancel(){this.generation++;this.entry?.cancel();}
  async execute(action,form){
    if(this.busy)fail('Finish or cancel the current density query first.');
    const c=this.context,original=this.signature(form),generation=++this.generation;
    if(action==='clear'){delete c.getState().view.generalizedDensity;this.invalidate();c.markDirty();return null;}
    if(['save','json','csv'].includes(action)){
      if(!this.reply)fail('Compute or restore source density information first.');verifyNativeSource(c,this.owner);
      if(this.signature(form)!==this.replySignature)fail('Density point/orientation/source content/evidence changed; compute or restore again.');
      const verifyPublication=()=>{verifyNativeSource(c,this.owner);if(generation!==this.generation||this.signature(form)!==original)fail('Density export source/settings/evidence changed or canceled.');};
      if(action==='save'){verifyPublication();c.getState().view.generalizedDensity=clone(this.reply.state);c.markDirty();this.replySignature=this.signature(form);return this.reply.state;}
      const text=action==='csv'?this.reply.csv:JSON.stringify({format:'generalized-density-export',version:1,source:clone(c.getState().model),notes:c.getState().notes??'',coordinateUnit:form.unit,elementAnnotations:clone(c.getState().view.elementAnnotations??null),report:this.reply.report},null,2)+'\n';
      verifyPublication();this.busy=true;
      try{const result=await c.export(action,text,{verifyPublication});verifyPublication();if(result===null||result===false)throw Object.assign(Error('Density export canceled.'),{name:'AbortError'});return result;}finally{this.busy=false;}
    }
    const fields=action==='compute'?{point:{kind:'vector',text:form.point,length:3}}:{confirm:{text:'0'}};
    const entry=new NumericEntry({...c,getTarget:()=>this.signature(form)});this.entry=entry;this.busy=true;
    try{return await entry.run(fields,async(values,numericVerify,{source,signal})=>{
      const verifyPublication=()=>{numericVerify();if(generation!==this.generation||this.signature(form)!==original||c.formSignature&&c.formSignature()!==stable(form))fail('Density source/settings/evidence changed or canceled.');};
      const options={signal,verifyPublication,sourceSnapshot:source};verifyPublication();let result;
      if(action==='compute')result=await c.read('generalized-density-info',{point:[...values.point],orientation:form.orientation,unit:form.unit},source,options);
      else if(action==='restore'){
        const saved=c.getState().view.generalizedDensity;if(!saved)fail('This source has no saved density query.');
        if(saved.parameters?.unit!==form.unit)fail('Saved density units changed; compute explicitly.');
        result=await c.read('generalized-density-restore',{state:clone(saved)},source,options);
      }else fail('Unsupported density action.');
      verifyPublication();if(result?.report?.format!=='generalized-density-info'||result.report.sourceId!==source.id||result.report.sourceHash!==result.state?.sourceHash||result.report.validation?.closedOrientedChain!==true||result.report.validation?.ordinaryFilledInteriorAsserted!==false)fail('Native density evidence did not retain its qualified source contract.');
      await c.present(result.report,options);verifyPublication();this.reply=clone(result);this.owner=captureNativeSource(c);this.replySignature=this.signature(form);return result;
    });}catch(error){this.reply=null;this.owner=null;c.clear?.();throw error;}finally{if(this.entry===entry)this.entry=null;this.busy=false;}
  }
}
export class GeneralizedDensityControls{
  constructor(context){
    this.context=context;const panel=document.createElement('details');panel.id='generalized-density-controls';panel.innerHTML='<summary>Generalized 3D density / algebraic measures</summary><p class="muted">Measure winding at a declared source point, including ordered star faces. Algebraic volume counts signed multiplicity; filled/union bulk volume is unavailable.</p><label>Point XYZ <input id="density-point" value="0, 0, 0"></label><button id="density-mean">Use source vertex mean</button><label>Orientation <select id="density-orientation"><option value="positive-algebraic-volume">Positive algebraic volume per component</option><option value="source-anchor">Coherent source face anchors</option></select></label><output id="density-unit"></output><div class="button-row"><button id="density-compute">Compute</button><button id="density-restore">Restore saved</button><button id="density-save">Save evidence</button><button id="density-cancel">Cancel</button></div><div class="button-row"><button id="density-json">Export source + JSON evidence</button><button id="density-csv">Export measurement CSV</button></div><pre id="density-result" class="code-box">Declare a point and orientation.</pre>';
    context.mount.after(panel);this.panel=panel;
    this.session=new DensitySession({...context,formSignature:()=>stable(this.form()),present:async(report,options)=>{options.verifyPublication();this.show(report);},clear:()=>{this.node('result').textContent='Declare a point and orientation.';}});
    const clear=document.createElement('button');clear.id='density-clear';clear.textContent='Clear saved evidence';this.node('save').after(clear);
    for(const action of ['compute','restore','save','clear','json','csv'])this.node(action).onclick=context.guard(()=>this.apply(action));this.node('cancel').onclick=()=>this.cancel();
    this.node('point').type='text';this.node('mean').onclick=()=>{const p=context.getState().model.vertices;this.node('point').value=p[0].map((_,axis)=>p.reduce((sum,v)=>sum+v[axis]/p.length,0)).join(', ');};this.sync();
  }
  node(key){return this.panel.querySelector('#density-'+key);}
  form(){const s=this.context.getState();return {point:this.node('point').value,orientation:this.node('orientation').value,unit:s.view.coordinateUnit??'model'};}
  show(r){const f=this.context.format??String,d=r.pointDensity,m=r.measures;
    this.node('result').textContent=`Point status: ${r.status}\nSigned density: ${d.signedWinding??'undefined'}; magnitude: ${d.densityMagnitude??'undefined'}\nPoint: ${r.parameters.point.map(f).join(', ')} ${m.lengthUnit}\nOrientation: ${r.parameters.orientation}\nAlgebraic volume: ${m.orientedAlgebraicVolume===null?'undefined':f(m.orientedAlgebraicVolume)} ${m.volumeUnit}\nAbsolute algebraic face-area sum: ${f(m.absoluteAlgebraicFaceAreaSum)} ${m.areaUnit}\n${r.components.length} oriented source components; ${r.faces.length} ordered source faces\n${r.definitions.volume}\n${r.definitions.area}${r.diagnostics.length?'\n'+r.diagnostics.join('\n'):''}`;
  }
  async apply(action){const task=this.session.execute(action,this.form());this.sync();try{const result=await task;
    if(action==='restore'){this.node('point').value=result.report.parameters.point.join(', ');this.node('orientation').value=result.report.parameters.orientation;this.session.replySignature=this.session.signature(this.form());}return result;
  }finally{this.sync();}}
  cancel(){this.session.cancel();this.sync();}
  invalidate(){this.session.invalidate();this.sync();}
  sync(){const c=this.context,s=c.getState(),eligible=s?.model?.dimension===3&&(s.model.embeddingDimension??3)===3,disabled=this.session.busy||c.isExporting?.()||!eligible;
    for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=disabled;
    this.node('cancel').disabled=!this.session.busy;for(const name of ['save','json','csv'])this.node(name).disabled=disabled||!this.session.reply;
    this.node('clear').disabled=this.session.busy||c.isExporting?.()||!s?.view.generalizedDensity;
    this.node('restore').disabled=disabled||!s?.view.generalizedDensity;this.node('unit').textContent='Declared source coordinate unit: '+(s?.view.coordinateUnit??'model')+'; density is dimensionless.';
  }
}
