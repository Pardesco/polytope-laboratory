import {NumericEntry} from './numeric-entry.mjs';
export class StarPolygonControls {
  constructor(context) {
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='star-polygon-settings';
    panel.innerHTML='<summary>Star polygon</summary><label>Polygon <input id="star-polygon-symbol" value="5/2" placeholder="n or n/d" maxlength="32"></label><label>Radius <input id="star-polygon-radius" value="1"></label><button id="generate-star-polygon">Generate polygon</button>';
    document.getElementById('cupola-settings').after(panel);this.panel=panel;
    panel.querySelector('button').onclick=context.guard(()=>this.generate());
  }
  inputs(){
    const symbol=this.panel.querySelector('#star-polygon-symbol').value.trim(),radius=this.panel.querySelector('#star-polygon-radius').value;
    if(!symbol||symbol.length>32||!/^\s*[0-9]+\s*(?:\/\s*[+-]?[0-9]+\s*)?$/.test(symbol))throw Error('Enter a literal polygon n or n/d, such as 5/2 or 6/2.');
    if(!radius.trim())throw Error('Enter a positive polygon radius.');return {symbol,radius};
  }
  async generate(){
    if(this.context.isExporting?.())throw Error('Finish animation export before generating geometry.');
    if(this.busy)throw Error('Finish the current polygon construction first.');
    const input=this.inputs(),entry=this.numericEntry=new NumericEntry({...this.context,getTarget:()=>({symbol:this.panel.querySelector('#star-polygon-symbol').value,radius:this.panel.querySelector('#star-polygon-radius').value})});
    this.busy=true;this.sync();
    try{return await entry.run({radius:{text:input.radius,min:0,exclusiveMin:true,max:1e100}},(values,verify,{signal,source})=>{
      verify();return this.context.generate({symbol:input.symbol,radius:values.radius},{signal,verifyPublication:verify,sourceSnapshot:source,expressionInputs:input});
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){for(const node of this.panel.querySelectorAll('button,input'))node.disabled=this.busy||Boolean(this.context.isExporting?.());}
}
