export function holdPresentationLayout(doc,overlay){
  const body=doc.body,hadClass=body.classList.contains('presentation-mode'),focus=doc.activeElement;
  const hadStyle=body.hasAttribute?.('style')??true,bounds=body.getBoundingClientRect(),dimensions=['width','height'].map(key=>({key,value:body.style.getPropertyValue(key),priority:body.style.getPropertyPriority(key)}));
  const siblings=[...body.children].filter(node=>node!==overlay).map(node=>({node,inert:node.inert,aria:node.getAttribute('aria-hidden')}));
  body.classList.add('presentation-mode');overlay.hidden=false;
  for(const {key} of dimensions)body.style.setProperty(key,bounds[key]+'px');
  for(const {node} of siblings){node.inert=true;node.setAttribute('aria-hidden','true');}
  let released=false;
  return ()=>{
    if(released)return;released=true;overlay.hidden=true;
    body.classList.toggle('presentation-mode',hadClass);
    for(const {key,value,priority} of dimensions)if(value)body.style.setProperty(key,value,priority);else body.style.removeProperty(key);
    if(!hadStyle&&!body.style.length){body.setAttribute('style','');body.removeAttribute('style');}
    for(const {node,inert,aria} of siblings){node.inert=inert;if(aria===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',aria);}
    if(focus?.isConnected)focus.focus({preventScroll:true});
  };
}
