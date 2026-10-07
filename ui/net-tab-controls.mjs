/** Preferences refer to literal source edges/faces, never flattened edge copies. */
export function tabPreferences(model,current){
  return current?.sourceId===model.id&&current.sourceFingerprint===model.fingerprint
    ?structuredClone(current):{version:1,sourceId:model.id,sourceFingerprint:model.fingerprint,mode:'single',widthMm:4,edges:[]};
}
export function edgePreference(model,current,edge,mode,face){
  if(!Number.isSafeInteger(edge)||edge<0||edge>=model.edges.length)throw Error('Choose an existing source edge.');
  const options=tabPreferences(model,current);options.edges=options.edges.filter(item=>item.edge!==edge);
  if(mode!=='default'){
    if(!['none','single','double'].includes(mode))throw Error('Choose default, none, single or double tabs.');
    const item={edge,mode};
    if(mode==='single'&&face!=='auto'){
      const index=Number(face),[a,b]=model.edges[edge];
      if(!Number.isSafeInteger(index)||!model.faces[index]?.some((u,i,cycle)=>u===a&&cycle[(i+1)%cycle.length]===b||u===b&&cycle[(i+1)%cycle.length]===a))throw Error('Choose a source face incident on this edge.');
      item.face=index;
    }
    options.edges.push(item);options.edges.sort((a,b)=>a.edge-b.edge);
  }
  return options;
}

export class NetTabControls{
  constructor(editor,host){
    this.editor=editor;this.$=editor.$;
    const root=document.createElement('div');root.innerHTML='<div class="rule"></div><div class="panel-title">GLUE TAB PLACEMENT</div><label>Default method <select id="net-tab-default"><option value="single">Single: glue under face</option><option value="double">Double: glue tab to tab</option><option value="none">No tabs</option></select></label><label>Tab width <span><input id="net-tab-width" value="4" aria-label="Glue tab width"> mm</span></label><button id="net-tab-default-apply" class="wide">Apply default and width</button><label>Selected source edge method <select id="net-tab-method"><option value="default">Use default</option><option value="single">Single tab</option><option value="double">Double tabs</option><option value="none">No tabs</option></select></label><label>Single tab on face <select id="net-tab-face"></select></label><button id="net-tab-edge-apply" class="wide">Apply to source edge</button><div id="net-tab-status" class="muted"></div><p class="muted">Select the source edge above, or choose the Select tab edge mouse action and click an edge in the layout. A single tab can be placed on either adjoining face. Overrides survive cutting and joining; hinges have no tabs. Width stays in physical millimetres when E0 changes. Include glue tabs switches all tabs off temporarily.</p>';
    host.append(root);this.$('net-tab-width').type='text';this.$('net-tab-width').inputMode='text';
    const mouse=document.createElement('option');mouse.value='tabs';mouse.textContent='Select tab edge';this.$('net-action').append(mouse);
    this.$('net-edge').addEventListener('input',()=>this.show());
    this.$('net-tab-method').onchange=()=>{this.$('net-tab-face').disabled=this.$('net-tab-method').value!=='single';};
    this.$('net-tab-default-apply').onclick=editor.guard(()=>this.defaults());
    this.$('net-tab-edge-apply').onclick=editor.guard(()=>this.edge());this.show();
  }
  async defaults(){
    const mode=this.$('net-tab-default').value;
    return this.editor.expressionEntry.run({widthMm:this.$('net-tab-width').value},(values,verify,owner)=>{
      if(!['none','single','double'].includes(mode)||values.widthMm<.1||values.widthMm>100)throw Error('Use a tab width between 0.1 and 100 mm.');
      verify();const options=tabPreferences(this.editor.getModel(),this.editor.getState().netLayout?.tabOptions);options.mode=mode;options.widthMm=values.widthMm;
      return this.editor.edit('set-tab-options',{tab_options:options},{verifyPublication:verify,owner});
    });
  }
  async edge(){
    const editor=this.editor,edge=editor.index('net-edge','source edge'),options=edgePreference(editor.getModel(),editor.getState().netLayout?.tabOptions,edge,this.$('net-tab-method').value,this.$('net-tab-face').value);
    return editor.edit('set-tab-options',{tab_options:options});
  }
  show(net=this.editor.getState()?.netLayout){
    const model=this.editor.getModel();if(!model)return;
    const options=tabPreferences(model,net?.tabOptions??this.editor.config().tabOptions),edge=Number(this.$('net-edge').value),item=options.edges.find(e=>e.edge===edge),select=this.$('net-tab-face');
    this.$('net-tab-default').value=options.mode;this.$('net-tab-width').value=options.widthMm;this.$('net-tab-method').value=item?.mode??'default';
    select.replaceChildren();const auto=document.createElement('option');auto.value='auto';auto.textContent='Automatic first incident face';select.append(auto);
    const pair=model.edges[edge];if(pair)model.faces.forEach((face,id)=>{if(face.some((a,i)=>pair.includes(a)&&pair.includes(face[(i+1)%face.length]))){const option=document.createElement('option');option.value=String(id);option.textContent=`Source F${id}`;select.append(option);}});
    select.value=item?.face==null?'auto':String(item.face);select.disabled=item?.mode!=='single';
    this.$('net-tab-status').textContent=`${options.edges.length} source-edge overrides${net?.hinges.includes(edge)?' · selected edge is a hinge (override saved for a future cut)':''}${net?.tabs===false?' · all tabs temporarily off':''}`;
    for(const id of ['net-tab-default-apply','net-tab-edge-apply'])this.$(id).disabled=!net;
  }
}
