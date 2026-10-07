import {NumericEntry} from './numeric-entry.mjs';
/** Future generator controls: equal-radius ordinary polygon step prisms.
 * Constructing a new document is owned by context.generate, including its
 * native-await workspace/export publication guards.
 */
export class StepPrismControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='step-prism-settings';
    panel.innerHTML='<summary>Step prisms (4D)</summary><label>Order n <input id="step-prism-n" type="text" maxlength="512" value="13"></label><label>Signed step <input id="step-prism-step" type="text" maxlength="512" value="2"></label><label>Radius <input id="step-prism-radius" value="1"></label><button id="generate-step-prism" title="Convex hull of vertices (i, step × i mod n) in an ordinary n × n duoprism">Generate 4D step prism</button>';
    const anchor=['antiprism-settings','product-settings','star-polygon-settings','cupola-settings','subdivision-settings']
      .map(id=>document.getElementById(id)).find(Boolean);
    if(!anchor)throw new Error('Step-prism controls require an existing construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    panel.querySelector('#generate-step-prism').onclick=context.guard(()=>this.generate());
    this.sync();
  }
  checkExport(){
    if(this.context.isExporting?.())throw new Error('Finish animation export before constructing geometry.');
  }
  ensureIdle(){
    this.checkExport();
    if(this.busy)throw new Error('Finish the current step-prism construction first.');
  }
  inputs(){
    return Object.fromEntries([['n','step-prism-n'],['step','step-prism-step'],['radius','step-prism-radius']]
      .map(([key,id])=>[key,this.panel.querySelector('#'+id).value]));
  }
  async generate(){
    this.ensureIdle();const input=this.inputs(),entry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});
    this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run({n:{text:input.n,integer:true,min:5,max:128},
      step:{text:input.step,integer:true,min:-127,max:127},radius:{text:input.radius,min:1e-70,max:1e70}},
      (values,verify,{signal,source})=>{
        verify();return this.context.generate('step-prism',{...values},{verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
      },{validate:values=>{if(values.step===0||Math.abs(values.step)>=values.n)
        throw Error('Step must be nonzero with absolute value below the polygon order.');}});
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('button,input'))node.disabled=disabled;
  }
}
