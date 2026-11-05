function disclosure(doc,id,title,nodes){
  const details=doc.createElement('details');details.id=id;details.className='inspector-group';
  const summary=doc.createElement('summary');summary.textContent=title;details.append(summary,...nodes.filter(Boolean));return details;
}
/** Move existing nodes so their handlers, values, source IDs and history survive. */
export function organizeNetInspector(doc){
  const node=id=>doc.getElementById(id),field=id=>node(id)?.closest('label')??node(id);
  const face=node('face-net-controls'),cell=node('cell-net-controls');
  if(!face||!cell)throw Error('Net Inspector controls are missing.');
  const title=(text)=>{const n=doc.createElement('div');n.className='panel-title';n.textContent=text;return n;};
  const hint=text=>{const n=doc.createElement('p');n.className='muted';n.textContent=text;return n;};
  const paper=node('net-paper').closest('div'),color=node('net-print-color-mode').closest('div'),tabs=node('net-tab-default').closest('div');
  const foldHelp=Array.from(face.children).find(n=>n.tagName==='P');
  const checks=disclosure(doc,'net-checks-settings','Numerical checks and source domain',[node('net-fold-evidence')]);
  checks.append(node('net-domain')??Object.assign(doc.createElement('p'),{id:'net-domain',className:'muted'}));
  const fold=disclosure(doc,'net-fold-settings','Fold preview',[field('net-fold'),node('net-fold-value'),node('net-play'),foldHelp]);
  const edit=disclosure(doc,'net-layout-settings','Cuts and piece placement',[
    field('net-action'),field('net-edge'),node('net-toggle-edge'),field('net-component'),field('net-move-x'),field('net-angle'),node('net-move')]);
  const generate=disclosure(doc,'net-generation-settings','Starting face and separate pieces',[field('net-root'),node('net-separate')]);
  const glue=disclosure(doc,'net-tab-settings','Glue tab placement',Array.from(tabs.children).filter(n=>!n.classList.contains('rule')&&!n.classList.contains('panel-title')));
  const printDetails=disclosure(doc,'net-paper-options','Margins, spacing and color',[
    field('net-paper-margin'),disclosure(doc,'net-print-color-settings','Color printing',Array.from(color.children).filter(n=>!n.classList.contains('rule')&&!n.classList.contains('panel-title')))]);
  const print=disclosure(doc,'net-paper-settings','Paper and export',[
    field('net-paper'),field('net-paper-orientation'),node('net-custom-size'),printDetails,node('net-pack'),
    node('net-page-prev').parentElement,node('net-paper-status'),node('net-packed-pdf'),node('net-packed-svg'),node('net-export-actions'),
    node('net-assembly-controls'),
    node('net-fabrication-settings'),
    hint('Packing keeps the current edge length and connected pieces intact. Review face and tab overlaps before printing at 100%.')]);
  const history=node('net-undo').parentElement;
  const visible=node('net-visible-surface-settings');
  face.replaceChildren(title('3D face net'),field('net-length'),field('net-tabs'),node('net-rebuild'),node('net-rearrange'),...(visible?[visible]:[]),node('net-summary'),field('net-display'),history,print,edit,glue,fold,generate,checks);
  paper.remove();tabs.remove();
  node('net-summary').className='net-status';node('net-summary').setAttribute('role','status');
  field('net-length').firstChild.textContent='Edge 0 length ';
  const cellHint=Array.from(cell.children).find(n=>n.tagName==='P');
  const cellChecks=disclosure(doc,'cell-net-checks-settings','Numerical checks and source domain',[
    Object.assign(doc.createElement('div'),{id:'cell-net-checks',className:'code-box'})]);
  const cellEdit=disclosure(doc,'cell-net-edit-settings','Connections and piece placement',[
    field('cell-net-face'),node('cell-net-match'),node('cell-net-toggle'),field('cell-net-moving'),node('cell-net-reattach'),
    field('cell-net-component'),field('cell-net-translation'),field('cell-net-angles'),node('cell-net-move')]);
  const cellSelection=disclosure(doc,'cell-net-selection-settings','Match source elements',[
    field('cell-net-vertex'),node('cell-net-match-vertex'),node('cell-net-selection'),cellHint]);
  const cellGenerate=disclosure(doc,'cell-net-generation-settings','Starting cell and pieces',[field('cell-net-root'),node('cell-net-separate')]);
  cell.replaceChildren(title('4D whole-cell net'),node('cell-net-build'),node('cell-net-summary'),
    node('cell-net-undo').parentElement,field('cell-net-shrink'),node('cell-net-shrink-value'),cellEdit,cellSelection,cellGenerate,cellChecks);
  node('cell-net-summary').className='net-status';node('cell-net-summary').setAttribute('role','status');
  for(const group of [face,cell])for(const details of group.querySelectorAll('.inspector-group'))details.addEventListener('focusin',event=>{if(event.target.tagName!=='SUMMARY')details.open=true;});
}
