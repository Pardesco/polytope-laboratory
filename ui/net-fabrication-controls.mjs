import {NumericEntry} from './numeric-entry.mjs';
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const aborted=()=>Object.assign(Error('Fabrication export canceled.'),{name:'AbortError'});

export class FabricationSession{
  constructor(context){this.context=context;this.busy=false;}
  cancel(){this.entry?.cancel();}
  async execute(action,form){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current export first.');
    if(!['parts-svg','parts-pdf','measure-csv','measure-pdf','measure-dxf'].includes(action))throw Error('Unsupported fabrication export.');
    const parts=action.startsWith('parts-'),format=action.split('-')[1],net=structuredClone(c.getNetParameters()),paper=structuredClone(c.getPaperParameters?.()??{});
    const signature=()=>stable({form,live:c.formSignature?.(),net:c.getNetParameters(),paper:c.getPaperParameters?.()??{}}),captured=signature();
    const entry=new NumericEntry(c);this.entry=entry;this.busy=true;
    try{return await entry.run(parts?{
      margin:{text:form.margin,min:.01,max:100},width:{text:form.width,min:1,max:100},radius:{text:form.radius,min:3,max:100}
    }:{confirm:{text:'0',min:0,max:0}},async(values,verifyNumeric,{source,signal})=>{
      const verifyPublication=()=>{verifyNumeric();if(signature()!==captured)throw Error('Fabrication fields, paper or net layout changed. Repeat the export.');};
      const options={signal,sourceSnapshot:source,verifyPublication,defaultName:parts?'Reinforcement parts':'Builder measurements'};
      const params={netParameters:net,paper,...parts?{options:{braces:form.braces,hinges:form.hinges,hubs:form.hubs,margin_mm:values.margin,strip_width_mm:values.width,hub_radius_mm:values.radius},include_net:form.includeNet}:{}};
      verifyPublication();const result=await c.read(parts?'net-reinforcement-parts':'net-measurement-export',params,source,options);verifyPublication();
      let exported;
      if(format==='pdf'){
        if(!Array.isArray(result.pages)||!result.pages.length||result.pages.length>250)throw Error('Native fabrication pages are outside their bound.');
        exported=await c.exportPdf(result.pages.map(p=>p.svg),options);
      }else exported=await c.export(format,result[format],options);
      verifyPublication();if(exported===null||exported===false)throw aborted();return result;
    });}finally{if(this.entry===entry)this.entry=null;this.busy=false;}
  }
}

export class FabricationControls{
  constructor(context){
    this.context=context;this.session=new FabricationSession({...context,formSignature:()=>this.form()});
    const panel=document.createElement('details');panel.id='net-fabrication-settings';this.panel=panel;
    panel.innerHTML='<summary>Reinforcement parts and measurements</summary><label><input id="fabrication-braces" type="checkbox" checked> Inner face braces</label><label><input id="fabrication-hinges" type="checkbox" checked> Dihedral hinge strips</label><label><input id="fabrication-hubs" type="checkbox" checked> Vertex direction rosettes</label><label>Brace margin (mm) <input id="fabrication-margin" value="2" inputmode="decimal"></label><label>Strip width (mm) <input id="fabrication-width" value="10" inputmode="decimal"></label><label>Rosette radius (mm) <input id="fabrication-radius" value="12" inputmode="decimal"></label><label><input id="fabrication-include-net" type="checkbox" checked> Prepend packed net sheets</label><div class="button-row"><button id="fabrication-parts-svg">Parts SVG sheets</button><button id="fabrication-parts-pdf">Parts PDF sheets</button></div><div class="panel-title">Measurements (CSV / PDF / DXF)</div><div class="button-row"><button id="fabrication-measure-csv">Cut list CSV</button><button id="fabrication-measure-pdf">Measurements PDF</button><button id="fabrication-measure-dxf">Flat faces DXF</button></div><p class="muted">Uses current E0 scale and P/F/E labels. Rosettes show projected directions plus true 3D angles. Hinge strips require setting and gluing at the printed angle. No thickness, kerf or mechanical fit allowance.</p><button id="fabrication-cancel">Cancel fabrication export</button><output id="fabrication-status" aria-live="polite"></output>';
    context.mount.after(panel);
    for(const action of ['parts-svg','parts-pdf','measure-csv','measure-pdf','measure-dxf'])this.node(action).onclick=context.guard(()=>this.apply(action));
    this.node('cancel').onclick=()=>this.cancel();this.sync();
  }
  node(id){return this.panel.querySelector('#fabrication-'+id);}
  form(){return {braces:this.node('braces').checked,hinges:this.node('hinges').checked,hubs:this.node('hubs').checked,margin:this.node('margin').value,width:this.node('width').value,radius:this.node('radius').value,includeNet:this.node('include-net').checked};}
  async apply(action){
    const job=this.session.execute(action,this.form());this.sync();
    try{const result=await job;this.node('status').textContent=action.startsWith('parts-')?`${result.braces.length} braces, ${result.hinges.length} hinge strips, ${result.hubs.length} rosettes exported (${result.pages.length} sheets).${result.sourceNetOverlap||result.sourceNetTabOverlap?' Source net has overlaps; review before assembly.':''}`:`${result.edges.length} edges and ${result.faces.length} faces exported in mm; approximate angles in degrees.`;return result;}
    catch(error){this.node('status').textContent=error.message;throw error;}finally{this.sync();}
  }
  cancel(){this.session.cancel();}
  sync(){const m=this.context.getState()?.model,disabled=this.session.busy||this.context.isExporting()||m?.dimension!==3||!['convex-polytope','generalized-complex'].includes(m?.interpretation);
    for(const node of this.panel.querySelectorAll('button,input'))node.disabled=disabled;this.node('cancel').disabled=!this.session.busy;
    this.flow?.sync();
  }
}
