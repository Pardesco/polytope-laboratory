// SPDX-License-Identifier: GPL-3.0-only
export class ProjectMetadataControls{
  constructor(context){
    this.context=context;const panel=document.createElement('details');panel.id='project-metadata-settings';
    panel.innerHTML='<summary>Project metadata</summary><label>Display title <input id="metadata-title" maxlength="512"></label><label>Author <input id="metadata-author" maxlength="512"></label><label>Reference <input id="metadata-reference" maxlength="4096"></label><label>Description <textarea id="metadata-description" rows="3" maxlength="16000"></textarea></label><label>Additional fields (JSON) <textarea id="metadata-custom" rows="4" spellcheck="false"></textarea></label><button id="metadata-save">Save metadata</button><output id="metadata-status" aria-live="polite"></output><details><summary>Source metadata</summary><pre id="metadata-source"></pre></details>';
    document.getElementById('notes').after(panel);this.panel=panel;
    this.node('save').onclick=context.guard(()=>this.save());
  }
  node(key){return this.panel.querySelector('#metadata-'+key);}
  save(){
    const c=this.context;if(c.isExporting())throw Error('Finish export before editing metadata.');
    const text=this.node('custom').value;if(new TextEncoder().encode(text).length>65536)throw Error('Additional metadata exceeds 64 KiB.');
    const custom=JSON.parse(text||'{}');if(custom===null||Array.isArray(custom)||typeof custom!=='object')throw Error('Additional metadata needs a JSON object.');
    const metadata=Object.fromEntries(['title','author','reference','description'].map(k=>[k,this.node(k).value]));metadata.custom=custom;
    c.getState().view.documentMetadata=metadata;c.markDirty();c.refresh();this.node('status').textContent='Project metadata saved.';
  }
  sync(){
    const state=this.context.getState();if(!state)return;const metadata=state.view.documentMetadata??{};
    for(const key of ['title','author','reference','description'])this.node(key).value=metadata[key]??'';
    this.node('custom').value=JSON.stringify(metadata.custom??{},null,2);this.node('source').textContent=JSON.stringify(state.model.metadata??{},null,2);
    for(const node of this.panel.querySelectorAll('input,textarea,button'))node.disabled=this.context.isExporting();
  }
}
