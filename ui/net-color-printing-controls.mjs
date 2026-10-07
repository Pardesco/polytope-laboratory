/** Paper batches are represented by literal source face IDs, never palette indices. */
export function paperColorChoices(model){
  const rows=model.metadata?.offColors?.faces,seen=new Map(),choices=[];
  model.faces.forEach((_,face)=>{
    const row=rows?.[face],factor=row?.encoding==='byte'?255:1,rgba=row?.values?[...row.values.slice(0,3).map(v=>v/factor),row.values.length===4?row.values[3]/factor:1]:null,key=JSON.stringify(rgba);
    if(seen.has(key)){seen.get(key).faceIds.push(face);return;}const choice={face,faceIds:[face],rgba,label:rgba?`F${face}: RGBA ${rgba.map(v=>Number(v.toFixed(4))).join(', ')}`:`F${face}: uncolored source faces`};seen.set(key,choice);choices.push(choice);
  });return choices;
}
export function colorPrintParameters(model,mode,batch,fill){
  if(!['auto','mixed','separate'].includes(mode)||typeof fill!=='boolean')throw Error('Choose a supported color-printing method.');
  const paper_color=batch==='all'?'all':Number(batch);
  if(paper_color!=='all'&&(!/^\d+$/.test(String(batch))||!Number.isSafeInteger(paper_color)||paper_color>=model.faces.length))throw Error('Choose an existing source paper-color batch.');
  if(mode!=='separate'&&paper_color!=='all')throw Error('Select one-color-per-net/page printing to choose a paper-color batch.');
  return {color_mode:mode,paper_color,print_fill:fill,color_source_id:model.id,color_source_fingerprint:model.fingerprint};
}
export class NetColorPrintingControls{
  constructor(editor,host){
    this.editor=editor;this.$=editor.$;const root=document.createElement('div');
    root.innerHTML='<div class="rule"></div><div class="panel-title">COLOR PRINTING</div><label>Color method <select id="net-print-color-mode"><option value="mixed">Allow mixing source colors</option><option value="auto">Automatic</option><option value="separate">One source color per net/page</option></select></label><label>Paper color batch <select id="net-print-paper-color"></select></label><label><input id="net-print-color-fill" type="checkbox" checked> Print source face color fill</label><p class="muted">Separate printing cuts cross-color hinges in a detached print forest; your editable net keeps its connections. Source OFF face RGBA defines paper batches. Turn color fill off for colored paper; face text and PNG images remain. Automatic mixes convex sources or sources with face images, and separates other sources. Use Pack and preview to apply these settings.</p>';
    host.insertBefore(root,editor.$('net-pack'));this.$('net-print-color-mode').onchange=()=>{if(this.$('net-print-color-mode').value!=='separate')this.$('net-print-paper-color').value='all';this.$('net-print-paper-color').disabled=this.$('net-print-color-mode').value!=='separate';};
    this.sync();
  }
  parameters(){return colorPrintParameters(this.editor.getModel(),this.$('net-print-color-mode').value,this.$('net-print-paper-color').value,this.$('net-print-color-fill').checked);}
  sync(){
    const state=this.editor.getState(),model=this.editor.getModel();if(!state||!model)return;
    const settings=state.view.netPrint||{};
    if(settings.color_source_id&&(settings.color_source_id!==model.id||settings.color_source_fingerprint!==model.fingerprint)){
      settings.paper_color='all';delete settings.color_source_id;delete settings.color_source_fingerprint;
    }
    this.$('net-print-color-mode').value=settings.color_mode||'mixed';this.$('net-print-color-fill').checked=settings.print_fill!==false;
    const select=this.$('net-print-paper-color');select.replaceChildren();const all=document.createElement('option');all.value='all';all.textContent='All paper colors';select.append(all);
    const choices=paperColorChoices(model);for(const choice of choices){const option=document.createElement('option');option.value=String(choice.face);option.textContent=choice.label;select.append(option);}
    const chosen=settings.paper_color??'all',represented=choices.find(choice=>choice.faceIds.includes(chosen));
    select.value=chosen==='all'?'all':String(represented?.face??chosen);if(!select.value)select.value='all';select.disabled=this.$('net-print-color-mode').value!=='separate';
  }
}
