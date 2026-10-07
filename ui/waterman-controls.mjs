import {NumericEntry} from './numeric-entry.mjs';
export class WatermanControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='waterman-settings';
    panel.innerHTML='<summary>Waterman (FCC)</summary><label>Sphere <select id="waterman-mode"><option value="exact-sphere">Exact origin and squared radius</option><option value="author-root">Centered root N (r² = 2N)</option></select></label><label id="waterman-root-row" hidden>Root N <input id="waterman-root" value="5" type="text" maxlength="512"></label><label id="waterman-radius-row">Squared radius <input id="waterman-radius-squared" value="10" maxlength="512" placeholder="Exact rational expression"></label><label id="waterman-x-row">Origin X <input id="waterman-x" value="0" maxlength="512"></label><label id="waterman-y-row">Origin Y <input id="waterman-y" value="0" maxlength="512"></label><label id="waterman-z-row">Origin Z <input id="waterman-z" value="0" maxlength="512"></label><button id="generate-waterman">Generate Waterman hull</button>';
    const anchor=document.getElementById('podia-settings');
    if(!anchor)throw Error('Waterman controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    panel.querySelector('#waterman-mode').onchange=()=>this.sync();
    panel.querySelector('#generate-waterman').onclick=context.guard(()=>this.generate());this.sync();
  }
  inputs(){
    const mode=this.panel.querySelector('#waterman-mode').value;
    if(mode==='author-root')return {mode,root:this.panel.querySelector('#waterman-root').value};
    if(mode!=='exact-sphere')throw Error('Choose an exact sphere or centered author root.');
    return {mode,radius_squared:this.panel.querySelector('#waterman-radius-squared').value,
      center:['x','y','z'].map(axis=>this.panel.querySelector('#waterman-'+axis).value)};
  }
  async generate(){
    if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');
    if(this.busy)throw Error('Finish the current Waterman construction first.');
    const input=this.inputs(),root=input.mode==='author-root',fields={};
    if(root)fields.root={text:input.root,mode:'rational',integer:true,min:1,max:Number.MAX_SAFE_INTEGER};
    else{
      fields.radius_squared={text:input.radius_squared,mode:'rational',min:0,exclusiveMin:true};
      ['x','y','z'].forEach((axis,i)=>{fields[axis]={text:input.center[i],mode:'rational'};});
    }
    const entry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});this.numericEntry=entry;this.busy=true;this.sync();
    try{return await entry.run(fields,(values,verify,{signal,source})=>{
      const parameters=root?{root:Number(values.root)}:{radius_squared:values.radius_squared,center:[values.x,values.y,values.z]};
      verify();return this.context.generate(root?'waterman-root':'waterman-fcc',parameters,
        {verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
    },{validate:values=>{if(!root&&Object.values(values).some(value=>value.length>256))
      throw Error('Waterman exact rational results exceed the native 256-character bound.');}});
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const root=this.panel.querySelector('#waterman-mode').value==='author-root',disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=disabled;
    this.panel.querySelector('#waterman-root-row').hidden=!root;
    this.panel.querySelector('#waterman-root').disabled=disabled||!root;
    for(const id of ['radius','x','y','z'])this.panel.querySelector('#waterman-'+id+'-row').hidden=root;
    for(const id of ['radius-squared','x','y','z'])this.panel.querySelector('#waterman-'+id).disabled=disabled||root;
  }
}
