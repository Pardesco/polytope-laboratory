import {hiddenElements,setElementsHidden,setComponentHidden,selectionElements} from './element-visibility.mjs';
export function appendVisibilityControls(panel,context,model,result,rerender){
  const source=context.getState(),key=JSON.stringify(model),make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const check=()=>{if(context.isExporting())throw Error('Finish export before changing visibility.');if(source.view.dualMorph?.enabled)throw Error('Disable the dual morph preview before filtering source elements.');if(context.getState()!==source||source.model!==model||JSON.stringify(model)!==key)throw Error('Visibility source changed.');};
  const button=(id,label,action)=>{const n=make('button',label);n.id=id;n.type='button';n.disabled=context.isExporting();n.onclick=context.guard(()=>{check();action();context.markDirty();context.display();rerender();});return n;};
  const actions=make('div','');
  actions.append(button('element-hide-selected','Hide selected',()=>{const s=source.view.entitySelection;if(!s||!selectionElements(s).length)throw Error('Select a source element first.');setElementsHidden(model,source.view,s.kind,selectionElements(s));}),button('element-show-all','Show all',()=>{delete source.view.elementVisibility;source.view.hiddenCells=[];source.view.isolatedCell=null;source.view.cellFacing='all';}));panel.append(actions);
  const hidden=hiddenElements(model,source.view.elementVisibility),fields={vertex:'vertices',edge:'edges',face:'faces',cell:'cells'};
  if(result.available)for(const [kind,types] of Object.entries(result.types))for(const type of types){
    const off=type.ids.every(id=>hidden[fields[kind]].includes(id));
    const eye=button(`element-type-eye-${kind}-${type.typeId}`,`${off?'○ Show':'◉ Hide'} ${kind} type ${type.typeId+1}`,()=>setElementsHidden(model,source.view,kind,type.ids,!off));
    eye.title=off?'Show all elements of this type':'Hide all elements of this type';eye.ariaPressed=String(!off);
    panel.querySelector(`#element-type-${kind}-${type.typeId}`)?.after(eye);
  }
  if(model.components?.length){const details=make('details','');details.append(make('summary','Component visibility'));
    model.components.forEach((c,i)=>{const off=Object.entries(c.maps??{}).every(([field,ids])=>ids.every(id=>hidden[field]?.includes(id)));details.append(button(`element-component-eye-${i}`,`${off?'Show':'Hide'} ${c.name||'component '+(i+1)}`,()=>setComponentHidden(model,source.view,c,!off)));});panel.append(details);
  }
}
