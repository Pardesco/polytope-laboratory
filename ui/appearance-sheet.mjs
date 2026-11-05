// SPDX-License-Identifier: GPL-3.0-only
export const RADIUS_SLIDERS=Object.freeze({
  'vertex-radius':Object.freeze({label:'Vertex size',min:.001,max:.5,fallback:.015}),
  'edge-radius':Object.freeze({label:'Edge thickness',min:.0001,max:.5,fallback:.006})
});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function sliderToRadius(value,{min,max}){
  if(!Number.isFinite(Number(value)))throw Error('Choose a finite slider position.');
  return Number((min*(max/min)**(clamp(Number(value),0,1000)/1000)).toPrecision(8));
}
export function radiusToSlider(radius,{min,max}){
  if(!Number.isFinite(Number(radius))||Number(radius)<=0)throw Error('Choose a positive finite radius.');
  return 1000*Math.log(clamp(Number(radius),min,max)/min)/Math.log(max/min);
}

export class AppearanceSheet{
  constructor(context,{document:doc=document}={}){
    this.context=context;this.doc=doc;this.rows=new Map();this.open=false;
    const node=id=>doc.getElementById(id);this.drawer=node('surface-settings');
    this.body=this.drawer.querySelector(':scope > .settings-body');
    const views=node('views'),stage=doc.createElement('div');stage.className='appearance-stage';
    views.before(stage);stage.append(views);this.stage=stage;
    this.slot=doc.createElement('div');this.slot.className='appearance-sheet-slot';this.slot.hidden=true;
    this.slot.setAttribute('aria-hidden','true');stage.append(this.slot);
    this.body.classList.add('appearance-sheet');this.body.setAttribute('role','region');
    const header=this.body.querySelector('.chrome-drawer-header'),style=node('style-settings');
    if(style){style.querySelector('p').setAttribute('data-expert','');node('style-reset').textContent='Reset';}
    const show=doc.createElement('fieldset');show.id='appearance-show';
    const legend=doc.createElement('legend');legend.textContent='Show';show.append(legend);
    const edges=doc.createElement('label');edges.innerHTML='<input id="edges-visible" type="checkbox"> Edges';
    show.append(node('faces-visible').closest('label'),edges,node('vertices-visible').closest('label'));
    (style??header).after(show);this.edges=node('edges-visible');
    this.edges.onchange=context.guard(()=>{
      if(!context.getState()||context.isExporting())return this.sync();
      context.getState().view.edges=this.edges.checked;context.display();context.markDirty();this.sync();
    });
    show.after(node('surface-colors').closest('label'));
    const opacity=node('surface-opacity').closest('label');
    opacity.firstChild.textContent='Face opacity ';
    node('surface-colors').closest('label').after(opacity);
    this.opacityOutput=this.rangeOutput(opacity,node('surface-opacity'),'surface-opacity-output');
    node('surface-opacity').addEventListener('input',()=>{
      this.opacityOutput.textContent=Math.round(Number(node('surface-opacity').value)*100)+'%';
      node('surface-opacity').dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
    });
    const presentation=node('vertex-radius').closest('label').parentElement;
    presentation.classList.add('appearance-presentation');
    opacity.after(presentation);
    for(const [id,spec] of Object.entries(RADIUS_SLIDERS)){
      const input=node(id),numeric=input.closest('label');numeric.setAttribute('data-expert','');
      const row=doc.createElement('label');row.className='appearance-radius';
      row.textContent=spec.label+' ';row.title=(id==='vertex-radius'?'Sphere':'Cylinder')+' radius in normalized projected 3D view coordinates';
      const range=doc.createElement('input');range.type='range';range.id=id+'-slider';
      range.min='0';range.max='1000';range.step='1';range.setAttribute('aria-label',spec.label);
      row.append(range);const output=this.rangeOutput(row,range,id+'-output');numeric.before(row);
      this.rows.set(id,{input,range,output,spec});
      range.addEventListener('input',()=>{
        if(context.isExporting()||context.radiusBusy?.())return this.sync();
        input.value=String(sliderToRadius(range.value,spec));
        input.dispatchEvent(new doc.defaultView.CustomEvent('input',{bubbles:true,detail:{appearanceSlider:true}}));
        this.sync();
      });
      input.addEventListener('change',()=>this.sync());
    }
    node('cell-shrink').closest('label').classList.add('appearance-range');
    node('cell-shrink-output').setAttribute('for','cell-shrink');
    node('cell-shrink').title='Fraction of cell size retained; 1 means no shrink';
    const expert=doc.createElement('details');expert.id='appearance-expert-settings';expert.setAttribute('data-expert','');
    const expertTitle=doc.createElement('summary');expertTitle.textContent='Expert appearance';expert.append(expertTitle);presentation.append(expert);
    for(const id of ['face-fill-rule','vertex-style','edge-style','vertex-radius','edge-radius'])expert.append(node(id).closest('label'));
    for(const id of ['cell-visibility-controls','cell-facing-controls','material-effects-settings'])if(node(id))expert.append(node(id));
    this.drawer.addEventListener('toggle',()=>this.layout());
    this.drawer.querySelector(':scope > summary').addEventListener('click',event=>{
      if(context.isExporting())event.preventDefault();
    });
    const resize=()=>this.layout();
    this.observer=new doc.defaultView.ResizeObserver(resize);this.observer.observe(stage);this.observer.observe(this.slot);
    doc.defaultView.addEventListener('resize',resize);this.sync();this.layout();
  }
  rangeOutput(row,range,id){
    row.classList.add('appearance-range');const output=this.doc.createElement('output');
    output.id=id;output.setAttribute('for',range.id);row.append(output);return output;
  }
  sync(){
    const state=this.context.getState(),view=state?.view,disabled=!view||this.context.isExporting();
    this.edges.checked=view?.edges!==false;this.edges.disabled=disabled;
    for(const [id,row] of this.rows){
      const radius=view?.[id==='vertex-radius'?'vertexRadius':'edgeRadius']??row.spec.fallback;
      row.range.value=String(radiusToSlider(radius,row.spec));row.output.textContent=String(radius);
      row.range.setAttribute('aria-valuetext',String(radius)+' normalized view radius');
      row.range.disabled=disabled||!!this.context.radiusBusy?.();
    }
    this.opacityOutput.textContent=Math.round((view?.surfaceOpacity??.28)*100)+'%';
    this.drawer.querySelector(':scope > summary').setAttribute('aria-disabled',String(this.context.isExporting()));
  }
  layout(){
    const open=this.drawer.open;
    if(open!==this.open&&this.context.isExporting()){this.drawer.open=this.open;return;}
    this.slot.hidden=!open;this.stage.classList.toggle('appearance-open',open);
    const bounds=this.slot.getBoundingClientRect();
    if(open)for(const [key,value] of Object.entries({left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}))this.body.style[key]=value+'px';
    const signature=JSON.stringify([open,this.stage.clientWidth,this.stage.clientHeight,bounds.width]);
    this.open=open;
    if(signature===this.layoutSignature)return;
    const refit=this.layoutSignature!==undefined&&(open||this.wasOpen);this.layoutSignature=signature;this.wasOpen=open;
    if(refit&&!this.context.isExporting())this.context.refit?.();
  }
}
