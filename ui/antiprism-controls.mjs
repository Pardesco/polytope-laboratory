import {NumericEntry} from './numeric-entry.mjs';
export class AntiprismControls {
  constructor(context) {
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='antiprism-settings';
    panel.innerHTML='<summary>Antiprisms & prisms</summary><label>Polygon <input id="antiprism-symbol" value="5/2" placeholder="n or n/d" maxlength="32"></label><label>Base sizing <select id="antiprism-base-sizing"><option value="radius">Radius</option><option value="base-edge">Edge length</option></select></label><label><span id="antiprism-base-size-name">Radius</span><input id="antiprism-base-size" value="1"></label><label>Elevation <select id="antiprism-elevation"><option value="equal-triangle">Equilateral triangles</option><option value="height">Height</option><option value="side-edge">Side edge length</option></select></label><label id="antiprism-elevation-input" hidden><span id="antiprism-elevation-name">Height</span><input id="antiprism-elevation-value" value="1"></label><button id="generate-antiprism">Generate 3D antiprism</button><label>4D prism height <input id="antiduoprism-height" value="1"></label><button id="generate-antiduoprism">Generate antiduoprism</button><label>Current model prism height <input id="polyhedron-prism-height" value="1"></label><button id="make-polyhedron-prism">4D prism from current model</button>';
    document.getElementById('product-settings').after(panel);this.panel=panel;
    this.baseSizing=panel.querySelector('#antiprism-base-sizing');this.elevation=panel.querySelector('#antiprism-elevation');
    this.baseName=panel.querySelector('#antiprism-base-size-name');this.elevationName=panel.querySelector('#antiprism-elevation-name');this.elevationRow=panel.querySelector('#antiprism-elevation-input');
    this.prismButton=panel.querySelector('#make-polyhedron-prism');
    this.baseSizing.onchange=()=>this.sync();this.elevation.onchange=()=>this.sync();
    panel.querySelector('#generate-antiprism').onclick=context.guard(()=>this.generate('rational-antiprism'));
    panel.querySelector('#generate-antiduoprism').onclick=context.guard(()=>this.generate('antiduoprism'));
    this.prismButton.onclick=context.guard(()=>this.prism());
    this.sync();
  }
  model(){return this.context.getState()?.model;}
  canPrism(){const model=this.model();return Boolean(model&&model.dimension===3&&(model.embeddingDimension??model.dimension)===3);}
  checkExport(){if(this.context.isExporting?.())throw new Error('Finish animation export before constructing geometry.');}
  ensureIdle(){this.checkExport();if(this.busy)throw new Error('Finish the current antiprism or prism construction first.');}
  inputs(){
    const symbol=this.panel.querySelector('#antiprism-symbol').value;
    if(!symbol.trim()||symbol.length>32||!/^\s*[0-9]+\s*(?:\/\s*[+-]?[0-9]+\s*)?$/.test(symbol))throw new Error('Enter a literal polygon n or n/d, such as 5/2 or 6/2.');
    const base=this.baseSizing.value,elevation=this.elevation.value;
    if(!['radius','base-edge'].includes(base))throw new Error('Choose radius or base edge length.');
    if(!['equal-triangle','height','side-edge'].includes(elevation))throw new Error('Choose equilateral triangles, height or side edge length.');
    return {symbol,base,elevation,baseText:this.panel.querySelector('#antiprism-base-size').value,elevationText:this.panel.querySelector('#antiprism-elevation-value').value};
  }
  positive(text,label){
    this.checkExport();
    if(!text.trim())throw new Error('Enter a positive '+label+'.');
    return {text,min:0,max:1e100,exclusiveMin:true};
  }
  async numeric(fields,read,publish){
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;
    this.busy=true;this.sync();
    try{return await entry.run(fields,publish);}
    finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  async generate(kind){
    this.ensureIdle();
    if(!['rational-antiprism','antiduoprism'].includes(kind))throw new Error('Choose an antiprism construction.');
    const input=this.inputs(),intervalText=this.panel.querySelector('#antiduoprism-height').value;
    const fields={size:this.positive(input.baseText,input.base==='radius'?'radius':'base edge length')};
    if(input.elevation!=='equal-triangle')fields.elevation=this.positive(input.elevationText,input.elevation==='height'?'height':'side edge length');
    if(kind==='antiduoprism')fields.interval=this.positive(intervalText,'4D prism height');
    const read=()=>{
      const target={symbol:this.panel.querySelector('#antiprism-symbol').value,base:this.baseSizing.value,
        elevation:this.elevation.value,baseText:this.panel.querySelector('#antiprism-base-size').value};
      if(target.elevation!=='equal-triangle')target.elevationText=this.panel.querySelector('#antiprism-elevation-value').value;
      if(kind==='antiduoprism')target.interval=this.panel.querySelector('#antiduoprism-height').value;
      return target;
    };
    return this.numeric(fields,read,(values,verify,{signal,source})=>{
      const size=values.size;
      const params={symbol:input.symbol,[input.base==='radius'?'radius':'base_edge']:size};
      if(input.elevation!=='equal-triangle')params[input.elevation==='height'?'height':'side_edge']=values.elevation;
      if(kind==='antiduoprism')params.interval_height=values.interval;
      verify();return this.context.generate(kind,params,{signal,verifyPublication:verify,sourceSnapshot:source});
    });
  }
  async prism(){
    this.ensureIdle();
    if(!this.canPrism())throw new Error('Choose an intrinsic 3D model embedded in three coordinates.');
    const read=()=>({height:this.panel.querySelector('#polyhedron-prism-height').value});
    return this.numeric({height:this.positive(read().height,'prism height')},read,({height},verify,{signal,source})=>{
      verify();return this.context.commit('polyhedron-prism',{height},'Polyhedron × interval',
        {signal,verifyPublication:verify,sourceSnapshot:source});
    });
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const disabled=this.busy||Boolean(this.context.isExporting?.()),equal=this.elevation.value==='equal-triangle';
    this.baseName.textContent=this.baseSizing.value==='base-edge'?'Base edge length':'Radius';
    this.elevationName.textContent=this.elevation.value==='side-edge'?'Side edge length':'Height';
    this.elevationRow.hidden=equal;
    for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=disabled;
    this.panel.querySelector('#antiprism-elevation-value').disabled=disabled||equal;
    this.prismButton.disabled=disabled||!this.canPrism();
    this.panel.querySelector('#polyhedron-prism-height').disabled=disabled||!this.canPrism();
  }
}
