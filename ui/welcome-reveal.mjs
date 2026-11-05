// SPDX-License-Identifier: GPL-3.0-only
export function revealWalkthrough(anchor,{reveal,document:doc=globalThis.document,window:win=doc.defaultView}={}){
  if(anchor.closest('#export-dialog')&&!doc.getElementById('export-dialog').open)doc.getElementById('export').click();
  if(anchor.closest('#printable-settings')&&!anchor.closest('#export-goal-form')&&!doc.getElementById('export-goal-print')){
    const kind=doc.getElementById('export-kind');
    if(kind.value!=='printable'){kind.value='printable';kind.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  if(anchor.closest('#direct-4d-gizmo')){
    const visible=doc.getElementById('direct-4d-visible');
    if(!visible.checked){visible.checked=true;visible.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  if(anchor.closest('#export-goal-form')&&doc.getElementById('export-goal-form')?.hidden)doc.getElementById('export-goal-print')?.click();
  win?.openConstructTool?.(anchor,{focus:false});
  const drawer=anchor.closest('.chrome-overflow-drawer');
  if(drawer&&!drawer.open)doc.getElementById('open-'+drawer.id)?.click();
  reveal(anchor);
}
