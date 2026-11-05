import {NumericEntry} from './numeric-entry.mjs';

export function printableDisplaySignature(viewer){
  if(!viewer?.model)return null;
  return JSON.stringify({view:viewer.view,model:viewer.model.fingerprint??viewer.model.id,
    buffers:[viewer.pointGeometry,viewer.edgeGeometry,viewer.surfaceGeometry].map(g=>[g?.attributes.position?.version,g?.attributes.position?.count]),
    net:Boolean(viewer.net),cellNet:Boolean(viewer.cellNet)});
}

export function capturePrintableDisplay(viewer,model,mode='strut'){
  if(viewer?.morphSource===model)throw Error('Disable the morph preview before printable export, or promote its displayed result to a model.');
  if(!viewer||viewer.model!==model)throw Error('Wait for the selected model to finish displaying before printable export.');
  const geometry=viewer.stereographicGeometry||viewer.perspectiveGeometry;
  if(geometry?.complete===false||viewer.explosionDiagnostic)throw Error('Printable export requires a complete display. '+(viewer.explosionDiagnostic||'Resolve projection resource limits first.'));
  if(mode==='panels'&&viewer.view.faces===false)throw Error('Enable faces in the viewport before exporting panels.');
  if(mode==='panels'&&viewer.fillDiagnostics?.length)throw Error('Some faces could not be filled. Resolve face fill diagnostics before panel export.');
  const nodes=[],edges=[],triangles=[],face_ids=[],published=viewer.publishedPickState||viewer,packed=published.packedDisplay;
  const copy=(array,offset)=>Array.from(array.slice(offset,offset+3));
  if(packed){
    for(let i=0;i<packed.vertexVisible.length;i++)if(packed.vertexVisible[i])nodes.push(copy(packed.positions,i*3));
  }else{
    const points=published.instanceProjected||published.projected||[],visibility=published.instanceVisibility||published.visibility;
    const positions=viewer.pointGeometry.attributes.position.array;
    for(let i=0;i<points.length;i++)if(!points[i].clipped&&visibility?.vertices[i]!==false)nodes.push(copy(positions,i*3));
  }
  const segments=viewer.edgeGeometry.attributes.position.array;
  if(segments.length/6>100000)throw Error('Printable display exceeds 100,000 edge segments. Reduce display complexity.');
  for(let i=0;i<segments.length;i+=6){const a=copy(segments,i),b=copy(segments,i+3);if(a.some((x,k)=>x!==b[k]))edges.push([a,b]);}
  if(mode==='panels'){
    const surface=viewer.surfaceGeometry.attributes.position.array,owners=published.renderTriangles||published.triangles||[];
    if(surface.length/9>100000)throw Error('Printable display exceeds 100,000 face patches. Reduce display complexity.');
    for(let i=0;i<surface.length;i+=9){triangles.push([copy(surface,i),copy(surface,i+3),copy(surface,i+6)]);face_ids.push(packed?packed.faceIds[i/9]:owners[i/9].face);}
  }
  const diagnostics=[...new Set([...(geometry?.diagnostics||[]),viewer.perspectiveDiagnostic,viewer.stereographicDiagnostic].filter(Boolean))];
  if(diagnostics.some(s=>/resource limit|omitted|unresolved|unsupported|undefined/i.test(s)))throw Error('Printable export requires complete finite display geometry. '+diagnostics.join(' '));
  return {nodes,edges,triangles,face_ids,diagnostics,projection:viewer.view.projection||'orthographic',
    solid_eligible:!viewer.explosionDisplay&&!viewer.morphFrame&&!viewer.net&&!viewer.cellNet&&!(published.visibility&&['faces','edges','vertices'].some(k=>published.visibility[k]?.some(x=>!x)))};
}

export class PrintableExportControls{
  constructor(context,host,onChange){
    this.context=context;this.host=host;
    const panel=document.createElement('div');panel.innerHTML='<label>Export type <select id="export-kind"><option value="intrinsic">Intrinsic geometry</option><option value="printable">Printable model (STL/3MF/OBJ/GLB)</option></select></label><div id="printable-settings" hidden><label>Construction <select id="printable-mode"><option value="strut">Strut · cylinders and spheres</option><option value="panels">Panels · thickened face patches</option><option value="solid">Solid · outer surface solid</option></select></label><label>Longest dimension (mm) <input id="printable-size" value="100" maxlength="512"></label><label>Strut diameter (mm) <input id="printable-strut" value="2" maxlength="512"></label><label>Node diameter (mm) <input id="printable-node" value="3" maxlength="512"></label><label>Panel thickness (mm) <input id="printable-thickness" value="1.6" maxlength="512"></label><label><input id="printable-ascii" type="checkbox"> ASCII STL (default: binary)</label><details id="printable-solid-settings"><summary>Solid interior and hollow shell</summary><label>Component fill <select id="printable-fill"><option value="nonzero">Nonzero winding (union)</option><option value="even-odd">Even / odd winding (union)</option></select></label><label><input id="printable-hollow" type="checkbox"> Hollow shell (convex only)</label><label>Minimum wall thickness (mm) <input id="printable-wall" value="2" maxlength="512"></label><p class="muted">Closed inward offset; unsafe offsets are refused. No drain holes are added.</p></details><details><summary>Mesh quality</summary><label>Circular segments (8–64, multiple of 4) <input id="printable-segments" value="16" maxlength="512"></label></details><p class="muted">Solid uses the closed outer surface of stars, compounds and stellations. Strut and Panels may overlap; inspect the slicer union and supports. No base or feet are added.</p></div>';
    host.prepend(panel);this.panel=panel;this.settings=this.node('settings');
    panel.addEventListener('change',event=>{this.settings.hidden=!this.enabled;this.sync(false);if(this.enabled&&event.target===this.node('kind'))context.setFormat('stl');onChange();});
    for(const input of panel.querySelectorAll('input'))input.addEventListener('input',()=>onChange());
  }
  node(name){return this.panel.querySelector('#'+(name==='kind'?'export-kind':'printable-'+name));}
  get enabled(){return this.node('kind').value==='printable';}
  selection(){return {enabled:this.enabled,mode:this.node('mode').value,size:this.node('size').value,strut:this.node('strut').value,
    node:this.node('node').value,thickness:this.node('thickness').value,segments:this.node('segments').value,ascii:this.node('ascii').checked,hollow:this.node('hollow')?.checked??false,wall:this.node('wall')?.value??'2',fill:this.node('fill')?.value??'nonzero'};}
  viewer(){return this.context.getViewer();}
  signature(){return this.enabled?printableDisplaySignature(this.viewer()):null;}
  async beforeCapture(options){if(this.enabled){const viewer=this.viewer(),view=JSON.stringify(viewer.view);await viewer.prepareGeometryCapture(options);if(JSON.stringify(viewer.view)!==view)throw Error('Display pose changed. Review the printable export again.');}}
  describe(){return {formats:['stl','3mf','obj',...(this.node('mode').value==='solid'?['glb']:[])].map(format=>({format,available:true}))};}
  prepare(model,params,options){
    const selection=this.selection(),fields={};
    for(const [name,key] of [['size_mm','size'],['strut_mm','strut'],['node_mm','node'],['thickness_mm','thickness']])fields[name]={text:selection[key],min:name==='size_mm'?.1:.05,max:name==='size_mm'?10000:1000};
    if(selection.mode==='solid'&&selection.hollow)fields.wall_mm={text:selection.wall,min:.05,max:1000};
    fields.segments={text:selection.segments,integer:true,min:8,max:64};
    const displaySignature=this.signature(),entry=new NumericEntry({...this.context,getTarget:()=>this.selection()});this.entry=entry;
    return entry.run(fields,async(values,verify,{signal})=>{
      verify();if(values.segments%4)throw Error('Circular segments must be a multiple of 4.');
      const display=capturePrintableDisplay(this.viewer(),this.context.getGeometry(),selection.mode);
      const result=await this.context.preparePrintable(model,{...values,display,mode:selection.mode,format:params.format,ascii_stl:selection.ascii,
        wall_mm:selection.mode==='solid'&&selection.hollow?values.wall_mm:0,fill_rule:selection.fill,source_unit:params.source_unit,target_unit:'mm'},{signal});verify();if(this.signature()!==displaySignature)throw Error('Display pose changed. Review the printable export again.');return result;
    },{signal:options.signal}).finally(()=>{if(this.entry===entry)this.entry=null;});
  }
  sync(saving){for(const node of this.panel.querySelectorAll('input,select'))node.disabled=saving;const solid=this.node('mode').value==='solid';if(this.node('solid-settings'))this.node('solid-settings').hidden=!solid;}
}
