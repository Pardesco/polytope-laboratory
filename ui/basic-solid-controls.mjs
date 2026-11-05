import {NumericEntry} from './numeric-entry.mjs';
import {explainAvailability} from './availability-copy.mjs';
const edgeKeys=['edge01','edge02','edge03','edge12','edge13','edge23'];
export class BasicSolidControls{
  constructor(context){
    this.context=context;this.busy=false;
    const panel=document.createElement('details');panel.id='basic-solid-settings';
    panel.innerHTML=`<summary>Basic geometric constructions</summary>
      <label>Construction <select id="basic-kind"><option value="block">Subdivided block (cuboid)</option><option value="edge-tetrahedron">Tetrahedron from six edges</option><option value="triangular-prism">Irregular triangular prism</option><option value="triangular-grid">Triangular grid</option></select></label>
      <label class="basic-input-row" data-basic-kind="block">Dimensions X, Y, Z <input id="basic-dimensions" value="3,2,1" maxlength="1800"></label>
      <label class="basic-input-row" data-basic-kind="block">Subdivisions X, Y, Z <input id="basic-block-subdivisions" value="3,2,1" maxlength="1800"></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Boundary <select id="basic-grid-shape"><option value="triangle">Triangle</option><option value="hexagon">Hexagon</option></select></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Crease fold (degrees, -170 to 170) <input id="basic-fold-angle" value="0" maxlength="512"></label>
      ${edgeKeys.map(key=>`<label class="basic-input-row" data-basic-kind="edge-tetrahedron">Edge ${key.slice(4)} <input id="basic-${key}" value="1" maxlength="512"></label>`).join('')}
      <label class="basic-input-row" data-basic-kind="triangular-prism">Base sides AB, AC, BC <input id="basic-sides" value="3,4,5" maxlength="1800"></label>
      <label class="basic-input-row" data-basic-kind="triangular-prism">Perpendicular height <input id="basic-height" value="2" maxlength="512"></label>
      <label class="basic-input-row" data-basic-kind="triangular-prism">Top XY displacement <input id="basic-shear" value="0,0" maxlength="1200"></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Subdivisions (1–50) <input id="basic-subdivisions" value="4" maxlength="512"></label>
      <label class="basic-input-row" data-basic-kind="triangular-grid">Small triangle edge <input id="basic-edge-length" value="1" maxlength="512"></label>
      <label>Coordinate units <select id="basic-unit">${['model','mm','cm','m','in','ft'].map(unit=>`<option>${unit}</option>`).join('')}</select></label>
      <button id="basic-generate">Create new document</button><output id="basic-status" aria-live="polite"></output>
      <p class="muted">Uses literal analytic vertices and boundary cycles. Blocks retain exterior tiles; equal dimension/subdivision ratios make cubes. Grids are open triangle/hexagon meshes with an optional rigid horizontal crease fold. Edge lengths must define a nondegenerate solid.</p>`;
    this.panel=panel;document.getElementById('generator').closest('select').before(panel);
    this.node('kind').onchange=()=>this.sync();this.node('generate').onclick=context.guard(()=>this.generate());this.sync();
  }
  node(key){return this.panel.querySelector('#basic-'+key);}
  input(){return Object.fromEntries(['kind','dimensions','block-subdivisions','grid-shape','fold-angle',...edgeKeys,'sides','height','shear','subdivisions','edge-length','unit'].map(key=>[key,this.node(key).value]));}
  async generate(){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current operation first.');
    const input=this.input(),positive={min:.0001,max:10000},fields={};
    if(input.kind==='block'){fields.dimensions={text:input.dimensions,kind:'vector',length:3,...positive};fields.subdivisions={text:input['block-subdivisions'],kind:'vector',length:3,integer:true,min:1,max:32};}
    else if(input.kind==='edge-tetrahedron')for(const key of edgeKeys)fields[key]={text:input[key],...positive};
    else if(input.kind==='triangular-prism'){
      fields.sides={text:input.sides,kind:'vector',length:3,...positive};fields.height={text:input.height,...positive};fields.shear={text:input.shear,kind:'vector',length:2,min:-10000,max:10000};
    }else if(input.kind==='triangular-grid'){
      fields.subdivisions={text:input.subdivisions,integer:true,min:1,max:50};fields.edge_length={text:input['edge-length'],...positive};fields.fold_angle={text:input['fold-angle'],min:-170,max:170};
      if(!['triangle','hexagon'].includes(input['grid-shape']))throw Error('Choose a triangle or hexagon boundary.');
    }else throw Error('Choose a supported basic construction.');
    if(!['model','mm','cm','m','in','ft'].includes(input.unit))throw Error('Choose coordinate units.');
    const entry=new NumericEntry({...c,getTarget:()=>this.input()});this.entry=entry;this.busy=true;this.sync();
    try{
      const result=await entry.run(fields,(values,verify,{signal,source})=>{verify();const parameters=input.kind==='edge-tetrahedron'?{edges:edgeKeys.map(key=>values[key])}:input.kind==='triangular-grid'?{...values,shape:input['grid-shape']}:values;return c.generate(input.kind,{...parameters,coordinate_unit:input.unit},{verifyPublication:verify,signal,sourceSnapshot:source});});
      const evidence=result.metadata?.basicConstruction,residual=evidence?.maximumRelativeEdgeResidual??evidence?.cayleyMenger?.relativeVolumeResidual;
      this.node('status').textContent='Created '+result.name+'.'+(residual===undefined?'':' Relative '+(evidence?.cayleyMenger?'volume':'edge')+' residual '+Number(residual).toExponential(2)+' (approximate).');return result;
    }finally{if(this.entry===entry)this.entry=null;this.busy=false;this.sync();}
  }
  cancel(){this.entry?.cancel();}
  sync(){const kind=this.node('kind').value;for(const row of this.panel.querySelectorAll('.basic-input-row'))row.hidden=row.dataset.basicKind!==kind;
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=this.busy||this.context.isExporting()||!this.context.getState();
    explainAvailability(this.panel,this.busy?'Finish or cancel the current construction.':this.context.isExporting()?'Finish or cancel export first.':'Open a model before creating a new document.');}
}
