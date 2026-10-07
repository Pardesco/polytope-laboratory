// SPDX-License-Identifier: GPL-3.0-only
import {NumericEntry} from './numeric-entry.mjs';

export function adjacentStephanoid(n,a,b,step){
  if(![n,a,b].every(Number.isSafeInteger)||n<4||n>128||a<1||b<1||a===b||a+b>=n||![1,-1].includes(step))throw Error('Sequence navigation needs valid literal integer n, a and b.');
  [a,b]=[Math.min(a,b),Math.max(a,b)];
  let row;
  if(step===1){
    if(a+b+1<n)row=[n,a,b+1];else if(2*(a+1)+1<n)row=[n,a+1,a+2];else if(n<128)row=[n+1,1,2];
  }else{
    if(b-1>a)row=[n,a,b-1];else if(a>1)row=[n,a-1,n-a];else if(n>4){const previous=n-1,first=Math.floor((previous-2)/2);row=[previous,first,previous-first-1];}
  }
  if(!row)throw Error('Reached the bounded stephanoid sequence endpoint.');return row;
}

export class StephanoidControls{
  constructor(context){
    this.context=context;this.busy=false;const panel=document.createElement('details');panel.id='stephanoid-settings';
    panel.innerHTML=`<summary>Stephanoids (crown polyhedra)</summary>
      <label>n (4–128) <input id="stephanoid-n" value="7" maxlength="512"></label>
      <label>First step a <input id="stephanoid-a" value="1" maxlength="512"></label>
      <label>Second step b <input id="stephanoid-b" value="4" maxlength="512"></label>
      <label>Sizing <select id="stephanoid-mode"><option value="uniform-hull">Uniform-edge vertex hull</option><option value="self-dual">Geometrically self-dual</option><option value="height">Custom total height</option></select></label>
      <label>Ring radius <input id="stephanoid-radius" value="1" maxlength="512"></label>
      <label id="stephanoid-height-row" hidden>Total height <input id="stephanoid-height" value="1" maxlength="512"></label>
      <div class="button-row"><button id="stephanoid-previous">Previous</button><button id="stephanoid-generate">Generate</button><button id="stephanoid-next">Next</button></div>
      <output id="stephanoid-status" aria-live="polite"></output>
      <p class="muted">Positive distinct steps with a + b &lt; n. Retains bow-tie face cycles and compound constituents. Sequence uses increasing n, a, b with a &lt; b and needs literal integer fields.</p>`;
    this.panel=panel;const anchor=document.getElementById('noble-settings');if(!anchor)throw Error('Stephanoids need a construction section.');anchor.after(panel);
    this.node('generate').onclick=context.guard(()=>this.generate());for(const [key,step] of [['previous',-1],['next',1]])this.node(key).onclick=context.guard(()=>this.advance(step));this.node('mode').onchange=()=>this.sync();this.sync();
  }
  node(key){return this.panel.querySelector('#stephanoid-'+key);}
  inputs(){return Object.fromEntries(['n','a','b','mode','radius','height'].map(key=>[key,this.node(key).value]));}
  async advance(step){
    if(this.busy||this.context.isExporting())throw Error('Finish or cancel the current operation first.');const input=this.inputs();
    if(![input.n,input.a,input.b].every(text=>/^\d+$/.test(text.trim())))throw Error('Sequence navigation needs literal integers; Generate accepts expressions.');
    const row=adjacentStephanoid(Number(input.n),Number(input.a),Number(input.b),step);['n','a','b'].forEach((key,i)=>this.node(key).value=String(row[i]));return this.generate();
  }
  async generate(){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current operation first.');const input=this.inputs();if(!['uniform-hull','self-dual','height'].includes(input.mode))throw Error('Choose stephanoid sizing.');
    const fields={n:{text:input.n,integer:true,min:4,max:128},a:{text:input.a,integer:true,min:1,max:127},b:{text:input.b,integer:true,min:1,max:127},radius:{text:input.radius,min:.0001,max:10000}};
    if(input.mode==='height')fields.height={text:input.height,min:.0001,max:10000};
    const entry=new NumericEntry({...c,getTarget:()=>this.inputs()});this.entry=entry;this.busy=true;this.sync();
    try{
      const model=await entry.run(fields,(values,verify,{signal,source})=>{verify();return c.generate('stephanoid',{...values,mode:input.mode},{verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});},{validate:values=>{if(values.a===values.b||values.a+values.b>=values.n)throw Error('Steps must be distinct and a + b < n.');}});
      const info=model.metadata.stephanoid;this.node('status').textContent=`${info.symmetryFamily}; ${info.componentCount} constituent${info.componentCount===1?'':'s'}; total height ${Number(info.resolvedTotalHeight).toPrecision(6)}.`;return model;
    }finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){const blocked=this.busy||this.context.isExporting();this.node('height-row').hidden=this.node('mode').value!=='height';for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;}
}
