import {NumericEntry} from './numeric-entry.mjs';
const edgeKeys=['edge01','edge02','edge03','edge12','edge13','edge23'];
export class BasicSolidControls{
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='basic-solid-settings';
    panel.innerHTML=`<summary>Basic geometric constructions</summary>
      <label>Construction <select id="basic-kind"><option value="edge-tetrahedron">Tetrahedron from six edges</option><option value="triangular-prism">Irregular triangular prism</option><option value="triangular-grid">Triangular grid</option></select></label>
      ${edgeKeys.map(key=>`<label class="basic-input-row" data-basic-kind="edge-tetrahedron">Edge ${key.slice(4)} <input id="basic-${key}" value="1" maxlength="512"></label>`).join('')}
      <label class="basic-input-row" data-basic-kind="triangular-prism">Base sides AB, AC, BC <input id="basic-sides" value="3,4,5" maxlength="1800"></label>
      <label class="basic-input-row" data-basic-kind="triangular-prism">Perpendicular height <input id="basic-height" value="2" maxlength="512"></label>
      <label class="basic-input-row" data-basic-kind="triangular-prism">Top XY displacement <input id="basic-shear" value="0,0" maxlength="1200"></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Subdivisions (1–50) <input id="basic-subdivisions" value="4" maxlength="512"></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Small triangle edge <input id="basic-edge-length" value="1" maxlength="512"></label>
      <label>Coordinate units <select id="basic-unit">${['model','mm','cm','m','in','ft'].map(unit=>`<option>${unit}</option>`).join('')}</select></label>
      <button id="basic-generate">Create new document</button><output id="basic-status" aria-live="polite"></output>
      <p class="muted">Uses literal analytic vertices and boundary cycles. A grid is a planar triangular mesh. Edge lengths must define a nondegenerate solid.</p>`;
    this.panel=panel;document.getElementById('generator').closest('select').before(panel);
    this.node('kind').onchange=()=>this.sync();this.node('generate').onclick=context.guard(()=>this.generate());this.sync();
  }
  node(key){return this.panel.querySelector('#basic-'+key);}
  input(){return Object.fromEntries(['kind',...edgeKeys,'sides','height','shear','subdivisions','edge-length','unit'].map(key=>[key,this.node(key).value]));}
  async generate(){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current operation first.');
    const input=this.input(),positive={min:.0001,max:10000},fields={};
    if(input.kind==='edge-tetrahedron')for(const key of edgeKeys)fields[key]={text:input[key],...positive};
    else if(input.kind==='triangular-prism'){
      fields.sides={text:input.sides,kind:'vector',length:3,...positive};fields.height={text:input.height,...positive};fields.shear={text:input.shear,kind:'vector',length:2,min:-10000,max:10000};
    }else if(input.kind==='triangular-grid'){
      fields.subdivisions={text:input.subdivisions,integer:true,min:1,max:50};fields.edge_length={text:input['edge-length'],...positive};
    }else throw Error('Choose a supported basic construction.');
    if(!['model','mm','cm','m','in','ft'].includes(input.unit))throw Error('Choose coordinate units.');
    const entry=new NumericEntry({...c,getTarget:()=>this.input()});this.entry=entry;this.busy=true;this.sync();
    try{
      const result=await entry.run(fields,(values,verify,{signal,source})=>{verify();const parameters=input.kind==='edge-tetrahedron'?{edges:edgeKeys.map(key=>values[key])}:values;return c.generate(input.kind,{...parameters,coordinate_unit:input.unit},{verifyPublication:verify,signal,sourceSnapshot:source});});
      this.node('status').textContent='Created '+result.name+'.';return result;
    }finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){const kind=this.node('kind').value;for(const row of this.panel.querySelectorAll('.basic-input-row'))row.hidden=row.dataset.basicKind!==kind;
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=this.busy||this.context.isExporting()||!this.context.getState();}
}
