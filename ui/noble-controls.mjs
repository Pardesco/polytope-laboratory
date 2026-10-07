// SPDX-License-Identifier: GPL-3.0-only
import {NumericEntry} from './numeric-entry.mjs';

export class NobleControls{
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='noble-settings';
    panel.innerHTML='<summary>Noble disphenoids (3D)</summary><label>Axis half-length a <input id="noble-a" value="1" maxlength="512"></label><label>Axis half-length b <input id="noble-b" value="2" maxlength="512"></label><label>Axis half-length c <input id="noble-c" value="3" maxlength="512"></label><label>Coordinate mirror <select id="noble-hand"><option value="A">A</option><option value="B">B</option></select></label><button id="generate-noble">Generate noble tetrahedron</button><output id="noble-status" aria-live="polite"></output>';
    const anchor=document.getElementById('step-prism-settings')??document.getElementById('antiprism-settings');
    if(!anchor)throw Error('Noble controls require a construction section.');
    anchor.after(panel);this.panel=panel;
    this.node('generate-noble').onclick=context.guard(()=>this.generate());this.sync();
  }
  node(id){return this.panel.querySelector('#'+id);}
  inputs(){return Object.fromEntries(['a','b','c','hand'].map(key=>[key,this.node('noble-'+key).value]));}
  async generate(){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current operation first.');
    const input=this.inputs();if(!['A','B'].includes(input.hand))throw Error('Choose coordinate mirror A or B.');
    const entry=new NumericEntry({...c,getTarget:()=>this.inputs()});this.entry=entry;this.busy=true;this.sync();
    try{
      const model=await entry.run(Object.fromEntries(['a','b','c'].map(key=>[key,{text:input[key],min:0.0001,max:10000}])),(values,verify,{signal,source})=>{
        verify();return c.generate('noble-disphenoid',{...values,hand:input.hand},{verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
      });
      this.node('noble-status').textContent=`Vertex/face transitive; ${model.metadata.chirality.status}.`;return model;
    }finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=this.busy||this.context.isExporting();}
}
