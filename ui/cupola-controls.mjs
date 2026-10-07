import {NumericEntry} from './numeric-entry.mjs';
export class CupolaControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='cupola-settings';
    panel.innerHTML='<summary>Cupola</summary><label>Upper polygon sides <input id="cupola-n" type="text" maxlength="512" value="3"></label><label>Ring edge length <input id="cupola-edge-length" value="1"></label><label>Height <input id="cupola-height" placeholder="Blank: regular faces for 3, 4 or 5 sides"></label><button id="generate-cupola">Generate cupola</button>';
    document.getElementById('subdivision-settings').after(panel);this.panel=panel;
    panel.querySelector('button').onclick=context.guard(()=>this.generate());
  }
  async generate(){
    if(this.busy)throw Error('Finish the current cupola construction first.');
    const read=()=>({n:this.panel.querySelector('#cupola-n').value,edge_length:this.panel.querySelector('#cupola-edge-length').value,
      height:this.panel.querySelector('#cupola-height').value});
    const input=read(),fields={n:{text:input.n,integer:true,min:3,max:128},edge_length:{text:input.edge_length,min:0,exclusiveMin:true}};
    if(input.height.trim())fields.height={text:input.height,min:0,exclusiveMin:true};
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      verify();return this.context.generate({n:values.n,edge_length:values.edge_length,height:values.height??null},
        {verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
    },{validate:values=>{if(values.height===undefined&&values.n>=6)throw Error('For 6 or more sides, enter an explicit positive cupola height.');}});
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){for(const node of this.panel.querySelectorAll('button,input'))node.disabled=this.busy||Boolean(this.context.isExporting?.());}
}
