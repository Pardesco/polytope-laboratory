import {NumericEntry} from './numeric-entry.mjs';
const eligible=(model,triangles)=>Boolean(model&&(triangles?model.dimension===3:[3,4].includes(model.dimension))&&(model.embeddingDimension??model.dimension)===model.dimension
  &&Array.isArray(model.vertices)&&model.vertices.length>=4&&Array.isArray(model.faces)&&model.faces.length
  &&(model.dimension!==4||Array.isArray(model.cells)&&model.cells.length)
  &&(!triangles||model.faces.every(face=>Array.isArray(face)&&face.length===3)));
export class SourceConstructionControls{
  constructor(context,kind){
    this.context=context;this.kind=kind;this.busy=false;
    const geodesic=kind==='geodesic';
    if(!geodesic&&kind!=='core')throw Error('Unknown source construction.');
    const panel=document.createElement('details');panel.id=geodesic?'geodesic-settings':'convex-core-settings';
    panel.innerHTML=geodesic?'<summary>Triangular geodesic</summary><label>Frequency <input id="geodesic-frequency" type="text" maxlength="512" value="2"></label><button id="make-geodesic" title="Subdivide a closed convex triangular boundary and project onto its checked common sphere.">Subdivide</button>'
      :'<summary>Convex core</summary><label>Center X <input id="core-x" value="0"></label><label>Center Y <input id="core-y" value="0"></label><label>Center Z <input id="core-z" value="0"></label><label id="core-w-row" hidden>Center W <input id="core-w" value="0"></label><label>Colors <select id="core-color-policy"><option value="require-equal">Preserve source colors</option><option value="none">Clear colors</option></select></label><button id="make-convex-core" title="Intersect source supporting halfspaces containing the chosen center. Native checks require a bounded result.">Construct core</button>';
    document.getElementById(geodesic?'subdivision-settings':'geodesic-settings').after(panel);this.panel=panel;
    panel.querySelector('button').onclick=context.guard(()=>this.construct());
  }
  async construct(){
    if(this.busy)throw Error('Finish the current construction first.');
    const geodesic=this.kind==='geodesic',source=this.context.getState()?.model,dimension=source?.dimension;
    if(!eligible(source,geodesic))throw Error(geodesic?'Choose an intrinsic 3D triangular source.':'Choose an intrinsic 3D face or 4D cell source.');
    const axes=dimension===4?['x','y','z','w']:['x','y','z'];
    const read=()=>geodesic?{frequency:this.panel.querySelector('#geodesic-frequency').value}:
      {center:axes.map(axis=>this.panel.querySelector('#core-'+axis).value),color_policy:this.panel.querySelector('#core-color-policy').value};
    const input=read(),fields={};
    if(geodesic)fields.frequency={text:input.frequency,integer:true,min:1,max:128};
    else{
      if(input.center.some(text=>!text.trim()||text.trim().length>256))throw Error(`Enter ${axes.length} finite center expressions, each at most 256 characters.`);
      if(!['require-equal','none'].includes(input.color_policy))throw Error('Choose a supported source color policy.');
      axes.forEach((axis,i)=>{fields[axis]={text:input.center[i]};});
    }
    const entry=new NumericEntry({...this.context,getTarget:read});this.numericEntry=entry;
    this.busy=true;this.sync();
    try{
      return await entry.run(fields,(values,verify,{signal,source})=>{
        const params=geodesic?{frequency:values.frequency}:{center:axes.map(axis=>values[axis]),color_policy:input.color_policy};
        verify();return this.context.commit(geodesic?'triangular-geodesic':dimension===4?'convex-core-4d':'convex-core',params,
          geodesic?'Triangular geodesic':'Convex core',{verifyPublication:verify,signal,sourceSnapshot:source,expressionInputs:input});
      });
    }finally{if(this.numericEntry===entry)this.numericEntry=null;this.busy=false;this.sync();}
  }
  cancel(){this.numericEntry?.cancel();}
  sync(){
    const blocked=this.busy||Boolean(this.context.isExporting?.());
    if(this.kind==='core'){const row=this.panel.querySelector('#core-w-row');if(row)row.hidden=this.context.getState()?.model.dimension!==4;}
    for(const node of this.panel.querySelectorAll('input,select,button'))node.disabled=blocked;
    this.panel.querySelector('button').disabled=blocked||!eligible(this.context.getState()?.model,this.kind==='geodesic');
  }
}
