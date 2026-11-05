import {NumericEntry} from './numeric-entry.mjs';
import {explainAvailability} from './availability-copy.mjs';
export class WatermanControls {
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='waterman-settings';
    panel.innerHTML='<summary>Waterman (SC / FCC / BCC)</summary><label>Sphere <select id="waterman-mode"><option value="exact-sphere">Exact origin and squared radius</option><option value="author-root">Centered root N (r² = 2N)</option></select></label><label id="waterman-root-row" hidden>Root N <input id="waterman-root" value="5" type="text" maxlength="512"></label><label id="waterman-radius-row">Squared radius <input id="waterman-radius-squared" value="10" maxlength="512" placeholder="Exact rational expression"></label><label id="waterman-x-row">Origin X <input id="waterman-x" value="0" maxlength="512"></label><label id="waterman-y-row">Origin Y <input id="waterman-y" value="0" maxlength="512"></label><label id="waterman-z-row">Origin Z <input id="waterman-z" value="0" maxlength="512"></label><button id="generate-waterman">Generate Waterman hull</button>';
    panel.insertAdjacentHTML('beforeend','<label>Lattice <select id="waterman-lattice"><option>FCC</option><option>SC</option><option>BCC</option></select></label><label>Origin preset <select id="waterman-origin"><option value="custom">Custom coordinates</option><option value="0,0,0">0, 0, 0</option><option value="1/2,1/2,1/2">1/2, 1/2, 1/2</option><option value="1,0,0">1, 0, 0</option><option value="1,1,1">1, 1, 1</option></select></label><label>Squared-radius increment <input id="waterman-increment" value="2" maxlength="512"></label><div class="button-row"><button id="waterman-previous">Previous radius</button><button id="waterman-next">Next radius</button></div><p class="muted">SC: all integer sites; FCC: even coordinate sum; BCC: equal coordinate parity. These lattice units differ. Root mode uses centered FCC and steps N by one. Radius stepping may repeat a hull.</p>');
    const anchor=document.getElementById('podia-settings');
    if(!anchor)throw Error('Waterman controls require a construction controls anchor.');
    anchor.after(panel);this.panel=panel;
    panel.querySelector('#waterman-mode').onchange=()=>this.sync();
    panel.querySelector('#waterman-origin').onchange=()=>{
      const value=panel.querySelector('#waterman-origin').value;
      if(value!=='custom')value.split(',').forEach((text,i)=>panel.querySelector('#waterman-'+['x','y','z'][i]).value=text);
    };
    for(const [id,direction] of [['previous',-1],['next',1]])panel.querySelector('#waterman-'+id).onclick=context.guard(()=>this.generate(direction));
    panel.querySelector('#generate-waterman').onclick=context.guard(()=>this.generate());this.sync();
  }
  inputs(){
    const mode=this.panel.querySelector('#waterman-mode').value;
    if(mode==='author-root')return {mode,root:this.panel.querySelector('#waterman-root').value};
    if(mode!=='exact-sphere')throw Error('Choose an exact sphere or centered author root.');
    const lattice=this.panel.querySelector('#waterman-lattice').value;
    if(!['FCC','SC','BCC'].includes(lattice))throw Error('Choose FCC, SC or BCC.');
    return {mode,lattice,increment:this.panel.querySelector('#waterman-increment').value,radius_squared:this.panel.querySelector('#waterman-radius-squared').value,
      center:['x','y','z'].map(axis=>this.panel.querySelector('#waterman-'+axis).value)};
  }
  async generate(direction=0){
    if(this.context.isExporting?.())throw Error('Finish animation export before constructing geometry.');
    if(this.busy)throw Error('Finish the current Waterman construction first.');
    if(![0,-1,1].includes(direction))throw Error('Choose previous, generate or next.');
    const input=this.inputs(),root=input.mode==='author-root',fields={};let resolved;
    if(root)fields.root={text:direction?`(${input.root})+(${direction})`:input.root,mode:'rational',integer:true,min:1,max:Number.MAX_SAFE_INTEGER};
    else{
      fields.radius_squared={text:direction?`(${input.radius_squared})+(${direction})*(${input.increment})`:input.radius_squared,mode:'rational',min:0,exclusiveMin:true};
      if(direction)fields.increment={text:input.increment,mode:'rational',min:0,exclusiveMin:true};
      ['x','y','z'].forEach((axis,i)=>{fields[axis]={text:input.center[i],mode:'rational'};});
    }
    const entry=new NumericEntry({...this.context,getTarget:()=>this.inputs()});this.numericEntry=entry;this.busy=true;this.sync();
    try{const result=await entry.run(fields,(values,verify,{signal,source})=>{
      const parameters=root?{root:Number(values.root)}:{radius_squared:values.radius_squared,center:[values.x,values.y,values.z]};
      resolved=root?values.root:values.radius_squared;
      if(!root&&input.lattice!=='FCC')parameters.lattice=input.lattice;
      verify();return this.context.generate(root?'waterman-root':input.lattice==='FCC'?'waterman-fcc':'waterman-lattice',parameters,
        {verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
    },{validate:values=>{if(!root&&Object.values(values).some(value=>value.length>256))
      throw Error('Waterman exact rational results exceed the native 256-character bound.');}});
      if(direction&&JSON.stringify(this.inputs())===JSON.stringify(input))this.panel.querySelector(root?'#waterman-root':'#waterman-radius-squared').value=resolved;
      return result;
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const root=this.panel.querySelector('#waterman-mode').value==='author-root',disabled=this.busy||Boolean(this.context.isExporting?.());
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=disabled;
    for(const id of ['lattice','origin','increment'])this.panel.querySelector('#waterman-'+id).disabled=disabled||root;
    this.panel.querySelector('#waterman-root-row').hidden=!root;
    this.panel.querySelector('#waterman-root').disabled=disabled||!root;
    for(const id of ['radius','x','y','z'])this.panel.querySelector('#waterman-'+id+'-row').hidden=root;
    for(const id of ['radius-squared','x','y','z'])this.panel.querySelector('#waterman-'+id).disabled=disabled||root;
    const reason=this.busy?'Finish or cancel the current construction.':this.context.isExporting?.()?'Finish or cancel export first.':'Centered root mode uses FCC, origin (0, 0, 0) and unit root steps.';
    explainAvailability(this.panel,reason,{'waterman-root':disabled?reason:'Choose Centered root N to edit the root.'});
  }
}
