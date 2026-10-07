import {NumericEntry} from './numeric-entry.mjs';
export class PodiaControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='podia-settings';
    panel.innerHTML='<summary>Podia & antipodia</summary><label>Construction <select id="podium-kind"><option value="rational-podium">Podium</option><option value="rational-antipodium">Antipodium</option></select></label><label>Polygon <input id="podium-symbol" value="5" maxlength="32" placeholder="n or n/d"></label><label>Ring sizing <select id="podium-sizing"><option value="radius">Radii</option><option value="edge">Edge lengths</option></select></label><label><span id="podium-base-label">Base radius</span><input id="podium-base-size" value="1"></label><label><span id="podium-top-label">Top radius</span><input id="podium-top-size" value="0.5"></label><label>Elevation <select id="podium-elevation"><option value="height">Height</option><option value="side-edge">Side edge length</option></select></label><label><span id="podium-elevation-label">Height</span><input id="podium-elevation-size" value="1"></label><button id="generate-podium">Generate</button>';
    const anchor=document.getElementById('torus-settings');
    if(!anchor)throw Error('Podia controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    for(const id of ['podium-sizing','podium-elevation'])panel.querySelector('#'+id).onchange=()=>this.sync();
    panel.querySelector('#generate-podium').onclick=context.guard(()=>this.generate());this.sync();
  }
  checkExport(){if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');}
  inputs(){
    const value=id=>this.panel.querySelector('#podium-'+id).value;
    const kind=value('kind'),symbol=value('symbol'),sizing=value('sizing'),elevation=value('elevation');
    if(!['rational-podium','rational-antipodium'].includes(kind))throw Error('Choose podium or antipodium.');
    if(symbol.length>32||!/^\s*\d+\s*(?:\/\s*[+-]?\d+\s*)?$/.test(symbol))throw Error('Enter a literal polygon n or n/d.');
    if(!['radius','edge'].includes(sizing)||!['height','side-edge'].includes(elevation))throw Error('Choose ring sizing and elevation.');
    const texts=[value('base-size'),value('top-size'),value('elevation-size')];
    if(texts.some(text=>!text.trim()))throw Error('Enter all three positive sizes.');
    return {kind,symbol,sizing,elevation,texts};
  }
  async generate(){
    this.checkExport();if(this.busy)throw Error('Finish the current podium construction first.');
    const input=this.inputs(),entry=this.numericEntry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});
    const fields=Object.fromEntries(['base','top','elevation'].map((key,i)=>[key,{text:input.texts[i],min:0,exclusiveMin:true,max:1e100}]));
    this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      const params={symbol:input.symbol,
        [input.sizing==='radius'?'base_radius':'base_edge']:values.base,
        [input.sizing==='radius'?'top_radius':'top_edge']:values.top,
        [input.elevation==='height'?'height':'side_edge']:values.elevation};
      verify();return this.context.generate(input.kind,params,{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:input});
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const edge=this.panel.querySelector('#podium-sizing').value==='edge';
    this.panel.querySelector('#podium-base-label').textContent=edge?'Base edge length':'Base radius';
    this.panel.querySelector('#podium-top-label').textContent=edge?'Top edge length':'Top radius';
    this.panel.querySelector('#podium-elevation-label').textContent=this.panel.querySelector('#podium-elevation').value==='side-edge'?'Side edge length':'Height';
    const disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=disabled;
  }
}
