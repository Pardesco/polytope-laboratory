import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';

export class BlendingControls{
  constructor(context,{mount=true}={}){
    this.context=context;this.busy=false;
    this.entry=new NumericEntry({...context,getTarget:()=>this.fields()});
    if(!mount)return;
    const panel=document.createElement('div');panel.id='blending-controls';
    panel.innerHTML='<button id="merge-compound" class="wide">Merge compound</button><details id="pseudo-uniform-settings"><summary>Pseudo-uniform transformations</summary><label>Construction <select id="pseudo-uniform-operation"><option value="truncate">Truncation</option><option value="expand">Expansion / runcination</option></select></label><label>Seed amount (0 to 1/2) <input id="pseudo-uniform-amount" value="1/3"></label><label>Maximum evaluations <input id="pseudo-uniform-evaluations" value="100"></label><label>Relative residual tolerance <input id="pseudo-uniform-tolerance" value="1e-7"></label><label><input id="pseudo-uniform-symmetry" type="checkbox" checked> Keep construction symmetry</label><button id="pseudo-uniform" class="wide">Try equal-edge variant</button><p class="muted">Convex 3D only, at most 64 constructed vertices. Fits equal edges and planar faces approximately; uniformity is not established. Unresolved fits leave the source unchanged.</p></details><output id="blending-result" class="muted"></output>';
    const mergeOptions=document.createElement('details');mergeOptions.id='merge-compound-options';
    mergeOptions.innerHTML='<summary>Merge options</summary><label>Solid winding <select id="merge-compound-rule"><option value="nonzero">Nonzero</option><option value="even-odd">Even / odd</option></select></label><label>Coplanar colors <select id="merge-compound-color"><option value="require-equal">Require equal colors</option><option value="first-source">Use first source</option></select></label><p class="muted">Union of closed oriented 3D component interiors, limited to 100 source faces. Requires one connected outer shell. Approximate classification; thin or nonmanifold results are refused.</p>';
    panel.querySelector('#merge-compound').after(mergeOptions);
    document.getElementById('make-dual').after(panel);this.panel=panel;
    const region=document.createElement('div');region.id='blend-region-controls';
    region.innerHTML='<label>Union winding rule <select id="blend-region-rule"><option value="nonzero">Nonzero</option><option value="even-odd">Even / odd</option></select></label><button id="blend-regions" class="wide">Union selected faces (holes / stars)</button><p class="muted">Uses Faces to blend, tolerance, weld and color policy above. Maximum 128 selected corners. Holes retain simple planar pieces for rendering, nets and export. Union resolves coincident coordinates and conforms cut edges.</p>';
    document.getElementById('face-editing-settings').append(region);this.region=region;
    panel.querySelector('#merge-compound').onclick=context.guard(()=>this.apply('merge-compound'));
    panel.querySelector('#pseudo-uniform').onclick=context.guard(()=>this.apply('pseudo-uniform'));
    region.querySelector('#blend-regions').onclick=context.guard(()=>this.apply('blend-regions'));
  }
  fields(){const get=id=>document.getElementById(id);return {
    ids:get('blend-face-ids').value,color:get('face-color-policy').value,
    weld:get('face-weld').checked,tolerance:get('coincidence-tolerance').value,
    rule:get('blend-region-rule').value,operation:get('pseudo-uniform-operation').value,
    amount:get('pseudo-uniform-amount').value,evaluations:get('pseudo-uniform-evaluations').value,
    residual:get('pseudo-uniform-tolerance').value,symmetry:get('pseudo-uniform-symmetry').checked,
    mergeRule:get('merge-compound-rule').value,mergeColor:get('merge-compound-color').value};}
  async apply(op){
    if(this.busy||this.context.isExporting())throw Error('Finish current preparation/export before blending or fitting.');
    if(!['merge-compound','blend-regions','pseudo-uniform'].includes(op))throw Error('Unsupported blending action.');
    const raw=this.fields(),source=this.context.getState()?.model;
    if(op!=='blend-regions'&&(source?.dimension!==3||(source.embeddingDimension??3)!==3))throw Error('Choose an intrinsic 3D model.');
    if(op==='pseudo-uniform'&&source.interpretation!=='convex-polytope')throw Error('Pseudo-uniform fitting requires a convex source.');
    if(op==='merge-compound')return this.merge(raw);
    const fields=op==='pseudo-uniform'?{
      amount:{text:raw.amount,min:0,max:.5,exclusiveMin:true},
      max_evaluations:{text:raw.evaluations,min:1,max:400,integer:true},
      residual_tolerance:{text:raw.residual,min:1e-10,max:1e-3}}:
      {tolerance:{text:raw.tolerance,min:0,max:1e100}};
    this.busy=true;this.sync();
    try{return await this.entry.run(fields,async(values,verify,{signal,source})=>{
      const params=op==='pseudo-uniform'?{...values,operation:raw.operation,keep_symmetry:raw.symmetry}:
        {...values,face_ids:raw.ids.trim().split(/[\s,;]+/).filter(Boolean).map(Number),
          weld:raw.weld,color_policy:raw.color,fill_rule:raw.rule};
      verify();const result=await this.context.commit(op,params,
        op==='merge-compound'?'Merge compound':op==='blend-regions'?'Union coplanar regions':'Pseudo-uniform '+raw.operation,
        {signal,verifyPublication:verify,sourceSnapshot:source});
      if(signal.aborted)throw Object.assign(Error('Construction canceled.'),{name:'AbortError'});
      this.showEvidence();return result;
    },{validate:values=>{if(op==='pseudo-uniform'&&values.amount>=.5)throw Error('Seed amount must be less than 1/2.');}});}finally{this.busy=false;this.sync();}
  }
  async merge(raw){
    const owner=captureNativeSource(this.context),controller=new AbortController();this.mergeJob=controller;
    const verify=()=>{if(controller.signal.aborted)throw Object.assign(Error('Construction canceled.'),{name:'AbortError'});
      verifyNativeSource(this.context,owner);const current=this.fields();
      if(current.mergeRule!==raw.mergeRule||current.mergeColor!==raw.mergeColor)throw Error('Merge options changed. Repeat the construction.');};
    this.busy=true;this.sync();
    try{verify();const result=await this.context.commit('merge-compound',{fill_rule:raw.mergeRule,color_policy:raw.mergeColor},'Merge compound',
      {signal:controller.signal,verifyPublication:verify,sourceSnapshot:JSON.parse(owner.modelSignature)});
      if(controller.signal.aborted)throw Object.assign(Error('Construction canceled.'),{name:'AbortError'});
      this.showEvidence();return result;
    }finally{if(this.mergeJob===controller)this.mergeJob=null;this.busy=false;this.sync();}
  }
  showEvidence(){if(!this.panel)return;const m=this.context.getState()?.model,
    p=m?.metadata?.pseudoUniform,e=m?.metadata?.faceEditing?.evidence,c=m?.metadata?.compoundMerge;
    this.panel.querySelector('#blending-result').textContent=p?
      `Approximate equal-edge residual: ${p.relativeEdgeResidual.toExponential(3)}; planarity: ${p.relativePlanarityResidual.toExponential(3)}. Uniformity not established.`:
      c?`Merged outer shell: ${m.vertices.length} vertices, ${m.edges.length} edges, ${m.faces.length} faces. Approximate winding residual: ${c.visibleSurface.maxWindingResidual.toExponential(3)}.`:
      e?.representation?`Union: ${e.holes} hole(s); ${m.faces.length} simple faces. ${e.representation}.`:'';}
  cancel(){this.entry.cancel();this.mergeJob?.abort();}
  sync(){if(!this.panel)return;const m=this.context.getState()?.model,disabled=this.busy||this.context.isExporting();
    for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=disabled;
    for(const node of this.region.querySelectorAll('button,input,select'))node.disabled=disabled;
    this.panel.querySelector('#merge-compound').disabled ||= m?.dimension!==3||(m.embeddingDimension??3)!==3;
    this.panel.querySelector('#pseudo-uniform').disabled ||= m?.dimension!==3||m?.interpretation!=='convex-polytope';
    this.region.querySelector('#blend-regions').disabled ||= !m?.faces?.length;
    this.showEvidence();}
}
