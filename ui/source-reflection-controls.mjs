import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {captureContentHistoryPublication} from './element-content-history.mjs';
export const reflectionEligible=model=>model?.dimension===3&&(model.embeddingDimension??model.dimension)===3&&['convex-polytope','generalized-complex'].includes(model.interpretation);
export class SourceReflectionControls{
 constructor(context,{mount=true}={}){
  this.context=context;this.generation=0;this.busy=false;if(!mount)return;
  const panel=document.createElement('details');panel.id='source-reflection-settings';
  panel.innerHTML='<summary>Reflected source form</summary><label>Reflection plane <select id="source-reflection-axis"><option value="0">X = 0</option><option value="1">Y = 0</option><option value="2">Z = 0</option></select></label><button id="reflect-literal-source">Construct reflected form</button><p class="muted">Retains literal source IDs, ordered face cycles, colors and text/PNG owners. Form is relative to source coordinates; reflection alone does not establish chirality.</p>';
  document.getElementById('mirror').after(panel);this.panel=panel;
  panel.querySelector('button').onclick=context.guard(()=>this.reflect(Number(panel.querySelector('select').value)));this.sync();
 }
 async reflect(axis=0){
  if(this.busy)throw Error('Finish the current source reflection first.');
  if(!reflectionEligible(this.context.getState()?.model))throw Error('Choose a finite intrinsic 3D source to reflect.');
  if(!Number.isInteger(axis)||axis<0||axis>2)throw Error('Choose a coordinate reflection plane.');
  const owner=captureNativeSource(this.context),content=captureContentHistoryPublication(this.context),generation=++this.generation;
  const selected=this.panel?.querySelector('select').value,controller=new AbortController();this.controller=controller;this.busy=true;this.sync();
  const verify=()=>{if(controller.signal.aborted||generation!==this.generation)throw Object.assign(Error('Source reflection canceled.'),{name:'AbortError'});verifyNativeSource(this.context,owner);content();if(this.panel&&this.panel.querySelector('select').value!==selected)throw Error('Reflection plane changed. Construct the requested form again.');};
  try{verify();return await this.context.commit('reflect-source',{axis},'Reflected source form',{signal:controller.signal,verifyPublication:verify});}
  finally{if(this.controller===controller)this.controller=null;this.busy=false;this.sync();}
 }
 cancel(){this.generation++;this.controller?.abort();}
 sync(){if(!this.panel)return;const blocked=this.busy||Boolean(this.context.isExporting?.());for(const node of this.panel.querySelectorAll('select,button'))node.disabled=blocked;this.panel.querySelector('button').disabled=blocked||!reflectionEligible(this.context.getState()?.model);}
}
