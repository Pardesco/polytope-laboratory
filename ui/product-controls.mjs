import {NumericEntry} from './numeric-entry.mjs';
export class ProductControls {
  constructor(context) {
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='product-settings';
    panel.innerHTML='<summary>Polygon products</summary><label>First polygon <input id="product-left-symbol" value="5/2" placeholder="n or n/d" maxlength="32"></label><label>First radius <input id="product-left-radius" value="1"></label><label>Second polygon <input id="product-right-symbol" value="3" placeholder="n or n/d" maxlength="32"></label><label>Second radius <input id="product-right-radius" value="1"></label><button id="generate-polygon-product">Generate 4D product</button><label>Prism height <input id="polygon-prism-height" value="1"></label><button id="make-polygon-prism">Prism from current polygon</button>';
    document.getElementById('star-polygon-settings').after(panel);this.panel=panel;
    this.generateButton=panel.querySelector('#generate-polygon-product');this.prismButton=panel.querySelector('#make-polygon-prism');
    this.generateButton.onclick=context.guard(()=>this.generate());
    this.prismButton.onclick=context.guard(()=>this.prism());
    this.sync();
  }
  model(){return this.context.getState()?.model;}
  canPrism(){const model=this.model();return Boolean(model&&model.dimension===2&&(model.embeddingDimension??model.dimension)===2);}
  ensureIdle(){
    if(this.context.isExporting?.())throw new Error('Finish animation export before constructing geometry.');
    if(this.busy)throw new Error('Finish the current product construction first.');
  }
  symbol(id){
    const value=this.panel.querySelector('#'+id).value.trim();
    if(!value||value.length>32||!/^\s*[0-9]+\s*(?:\/\s*[+-]?[0-9]+\s*)?$/.test(value))throw new Error('Enter a literal polygon n or n/d, such as 5/2 or 6/2.');
    return value;
  }
  positive(text,label){
    if(!text.trim())throw new Error('Enter a positive '+label+'.');
    return {text,min:0,max:1e100,exclusiveMin:true};
  }
  async numeric(fields,read,publish){
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;
    this.busy=true;this.sync();
    try{return await entry.run(fields,publish);}
    finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  async generate(){
    this.ensureIdle();
    const leftSymbol=this.symbol('product-left-symbol'),rightSymbol=this.symbol('product-right-symbol'),leftText=this.panel.querySelector('#product-left-radius').value,rightText=this.panel.querySelector('#product-right-radius').value;
    const read=()=>Object.fromEntries(['product-left-symbol','product-left-radius','product-right-symbol','product-right-radius']
      .map(id=>[id,this.panel.querySelector('#'+id).value]));
    return this.numeric({leftRadius:this.positive(leftText,'first radius'),rightRadius:this.positive(rightText,'second radius')},
      read,({leftRadius,rightRadius},verify,{signal,source})=>{
        verify();return this.context.generate({left:{symbol:leftSymbol,radius:leftRadius},right:{symbol:rightSymbol,radius:rightRadius}},
          {signal,verifyPublication:verify,sourceSnapshot:source});
      });
  }
  async prism(){
    this.ensureIdle();
    if(!this.canPrism())throw new Error('Choose an intrinsic 2D polygon embedded in two coordinates.');
    const read=()=>({height:this.panel.querySelector('#polygon-prism-height').value});
    return this.numeric({height:this.positive(read().height,'prism height')},read,({height},verify,{signal,source})=>{
      verify();return this.context.commit('polygon-prism',{height},'Polygon × interval',
        {signal,verifyPublication:verify,sourceSnapshot:source});
    });
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('button,input'))node.disabled=disabled;
    this.prismButton.disabled=disabled||!this.canPrism();
    this.panel.querySelector('#polygon-prism-height').disabled=disabled||!this.canPrism();
  }
}
