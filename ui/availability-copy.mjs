const titles=new WeakMap();
export function explainAvailability(panel,reason,overrides={}){
  for(const node of panel.querySelectorAll('button,input,select,textarea')){
    if(!titles.has(node))titles.set(node,node.title??'');
    const text=node.disabled?(overrides[node.id]??reason):'';
    node.title=text||titles.get(node);
    if(node.dataset){if(text)node.dataset.disabledReason=text;else delete node.dataset.disabledReason;}
    if(text)node.setAttribute?.('aria-description',text);else node.removeAttribute?.('aria-description');
  }
}
