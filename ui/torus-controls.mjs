import {NumericEntry} from './numeric-entry.mjs';
export class TorusControls {
  constructor(context) {
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='torus-settings';
    panel.innerHTML='<summary>Torus</summary><label>Ring segments <input id="torus-ring-segments" value="10" type="text" maxlength="512"></label><label>Arm segments <input id="torus-arm-segments" value="8" type="text" maxlength="512"></label><label>Arm / ring radius <input id="torus-arm-ratio" value="0.5"></label><label>Ring radius <input id="torus-ring-radius" value="1"></label><button id="generate-torus">Generate torus</button>';
    const anchor=document.getElementById('step-prism-settings');
    if(!anchor)throw Error('Torus controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    panel.querySelector('#generate-torus').onclick=context.guard(()=>this.generate());
    this.sync();
  }
  checkExport(){if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');}
  inputs(){
    return Object.fromEntries([['ring_segments','torus-ring-segments'],['arm_segments','torus-arm-segments'],
      ['arm_ratio','torus-arm-ratio'],['ring_radius','torus-ring-radius']].map(([name,id])=>[name,this.panel.querySelector('#'+id).value]));
  }
  async generate(){
    this.checkExport();if(this.busy)throw Error('Finish the current torus construction first.');
    const input=this.inputs(),fields={ring_segments:{text:input.ring_segments,integer:true,min:3,max:1333},
      arm_segments:{text:input.arm_segments,integer:true,min:3,max:1333},
      arm_ratio:{text:input.arm_ratio,min:0,max:1,exclusiveMin:true},ring_radius:{text:input.ring_radius,min:0,exclusiveMin:true}};
    const entry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      verify();return this.context.generate('torus',{...values},{verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
    },{validate:values=>{
      if(values.ring_segments*values.arm_segments>4000)throw Error('Torus limit is 4,000 vertices.');
      if(values.arm_ratio>=1)throw Error('Arm / ring radius must be between 0 and 1.');
    }});}finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,button'))node.disabled=disabled;
  }
}
