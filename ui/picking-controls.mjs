export class PickingControls{
  constructor(context){
    this.context=context;this.selector=document.createElement('select');this.selector.id='pick-kind';this.selector.setAttribute('aria-label','Pick source entity');this.selector.title='Pick a visible source entity; repeat a click to cycle coincident candidates';
    for(const kind of ['vertex','edge','face','cell'])this.selector.add(new Option('Pick: '+kind,kind));document.querySelector('.view-toolbar').append(this.selector);
    this.selector.onchange=context.guard(()=>this.choose(this.selector.value));document.getElementById('selection-kind').onchange=context.guard(()=>this.choose(document.getElementById('selection-kind').value));
  }
  choose(kind){if(this.context.isExporting())throw new Error('Finish animation export before changing selection mode.');const s=this.context.getState();if(!s)return;s.view.pickKind=kind;if(kind==='vertex')s.view.vertices=true;if(kind==='edge')s.view.edges=true;if(kind==='face'||kind==='cell')s.view.faces=true;document.getElementById('selection-kind').value=kind;document.getElementById('selection-id').value='0';document.getElementById('vertices-visible').checked=s.view.vertices;document.getElementById('faces-visible').checked=s.view.faces;this.context.display();this.context.markDirty();this.sync();}
  sync(){const s=this.context.getState();if(!s)return;for(const option of this.selector.options)option.disabled=!s.model[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[option.value]]?.length;let kind=s.view.pickKind||'edge';if(!s.model[{vertex:'vertices',edge:'edges',face:'faces',cell:'cells'}[kind]]?.length)kind='vertex';this.selector.value=kind;this.selector.disabled=this.context.isExporting();}
}
