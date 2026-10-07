// Source-owned supporting facets and calibrated printable/exported data.
import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const clone=structuredClone;
// Native JSON canonicalizes object keys. Array order remains part of ownership.
const stableJSON=value=>JSON.stringify(value,(_,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key]])):entry);
const exported=result=>{if(result===null||result===false)throw Object.assign(Error('Supporting data export canceled.'),{name:'AbortError'});return result;};

export function checkedReinforcementSVG(svg){
  if(typeof svg!=='string'||new TextEncoder().encode(svg).length>16*1024*1024)throw Error('Support SVG exceeds its bound.');
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml'),root=parsed.documentElement;
  if(root.localName!=='svg'||parsed.querySelector('parsererror'))throw Error('Malformed support SVG.');
  const tags=new Set(['svg','polygon','text','title']),attrs=new Set(['xmlns','width','height','viewBox','data-panel-id','data-source-vertex-ids','points','fill','stroke','stroke-width','x','y','font-size']);
  const nodes=[root,...root.querySelectorAll('*')];if(nodes.length>10000)throw Error('Support SVG exceeds its element bound.');
  for(const node of nodes){
    if(node.namespaceURI!=='http://www.w3.org/2000/svg'||!tags.has(node.localName))throw Error('Unsupported support SVG content.');
    for(const attr of node.attributes)if(!attrs.has(attr.name)||/url\s*\(/i.test(attr.value))throw Error('Unsupported support SVG attribute or external reference.');
  }
  return root;
}

export function literalSupportCycles(text){
  if(typeof text!=='string'||text.length>32000)throw Error('Support cycles exceed their text bound.');
  const cycles=JSON.parse(text);
  if(!Array.isArray(cycles)||cycles.length>32||cycles.some(c=>!Array.isArray(c)||c.length<3||c.length>128||new Set(c).size!==c.length||c.some(v=>!Number.isSafeInteger(v)||v<0)))
    throw Error('Use up to32 cycles of distinct literal nonnegative source vertex IDs.');
  return cycles;
}

// Callback contracts match the application's existing atomic numeric entry.
// read/preview/save/export must honor signal and call verifyPublication just
// before publishing. Camera motion is independent; source/view net edits are not.
export class ReinforcementSession{
  constructor(context){this.context=context;this.busy=false;this.reply=null;}
  signature(form){return stableJSON({form,net:this.context.getNetParameters(),liveForm:this.context.formSignature?.()});}
  clear(){this.reply=null;this.context.clearPreview?.();}
  cancel(){this.entry?.cancel();}
  invalidate(){this.cancel();this.clear();}
  async execute(action,form){
    const c=this.context;if(this.busy||c.isExporting())throw Error('Finish or cancel the current operation first.');
    if(!['build','restore','save','svg','pdf','csv','json'].includes(action))throw Error('Unsupported reinforcement action.');
    if(['save','svg','pdf'].includes(action)){
      if(!this.reply)throw Error('Build or restore supporting facets first.');verifyNativeSource(c,this.owner);
      if(this.signature(form)!==this.form)throw Error('Supporting facet fields or net layout changed. Rebuild explicitly.');
    }
    const signature=this.signature(form),netParameters=clone(c.getNetParameters()),paper=clone(c.getPaperParameters?.()??{});let params;
    if(action==='restore'){
      const state=c.getState().view.netReinforcement;if(!state)throw Error('There are no saved supporting facets.');
      if(stableJSON(state.netParameters)!==stableJSON(netParameters))throw Error('Saved support net scale or layout changed. Restore that net first, or rebuild.');
      params={state:clone(state)};
    }else if(!['save','svg','pdf'].includes(action)){
      const cycles=literalSupportCycles(form.cycles);
      if(action==='build'&&!cycles.length)throw Error('Choose at least one supporting facet.');
      params={netParameters,...action==='build'?{cycles}:{...cycles.length?{cycles}:{},unit:form.unit,angle_unit:form.angleUnit}};
    }
    const entry=new NumericEntry(c);this.entry=entry;this.busy=true;
    try{return await entry.run({confirm:{text:'0',min:0,max:0}},async(_,numericVerify,{source,signal})=>{
      const verifyPublication=()=>{numericVerify();if(this.signature(form)!==signature||action==='pdf'&&stableJSON(c.getPaperParameters?.()??{})!==stableJSON(paper))throw Error('Supporting facet target, paper or net layout changed. Repeat the operation.');};
      const options={signal,sourceSnapshot:source,verifyPublication};verifyPublication();
      if(['save','svg','pdf'].includes(action)){
        const state=Object.fromEntries(['format','version','kernelVersion','source','sourceHash','netParameters','cycles'].map(k=>[k,clone(this.reply[k])]));
        if(action==='save'){await c.save(state,options);return state;}
        if(action==='svg'){exported(await c.export('svg',this.reply.panelSvg,options));verifyPublication();return this.reply;}
        if(typeof c.exportPdf!=='function')throw Error('Supporting panel PDF export is unavailable.');
        const pages=await c.read('net-reinforcement-pages',{state,paper},source,options);verifyPublication();
        if(!Array.isArray(pages.pages)||!pages.pages.length||pages.pages.length>32||pages.scale!==1)throw Error('Native supporting sheets require bounded complete physical pages without scaling.');
        exported(await c.exportPdf(pages.pages.map(page=>page.svg),options));verifyPublication();return pages;
      }
      const result=await c.read(action==='csv'||action==='json'?'net-measurements':'net-reinforcement',clone(params),source,options);verifyPublication();
      if(action==='csv'||action==='json'){
        exported(await c.export(action,result[action],options));verifyPublication();return result;
      }
      await c.preview(result.panelSvg,options);verifyPublication();this.reply=clone(result);
      if(action==='restore')form.cycles=JSON.stringify(result.cycles);
      this.owner=captureNativeSource(c);this.form=this.signature(form);return result;
    });}catch(error){this.clear();throw error;}finally{if(this.entry===entry)this.entry=null;this.busy=false;}
  }
}

export class ReinforcementControls{
  constructor(context){
    this.context=context;this.session=new ReinforcementSession({...context,formSignature:()=>JSON.stringify(this.form())});
    const panel=document.createElement('details');panel.id='net-reinforcement-settings';
    panel.innerHTML='<summary>Internal support panels</summary><label>Ordered source vertex cycles <textarea id="reinforcement-cycles" rows="3" spellcheck="false" placeholder="[[0,1,7,6]]"></textarea></label><label>Measurement units <select id="reinforcement-unit"><option>mm</option><option>cm</option><option>m</option><option>in</option><option>ft</option></select></label><label>Angle units <select id="reinforcement-angle"><option>degrees</option><option>radians</option></select></label><div class="button-row"><button id="reinforcement-build">Preview panels</button><button id="reinforcement-restore">Restore saved</button><button id="reinforcement-save">Save panels</button><button id="reinforcement-cancel">Cancel</button></div><div class="button-row"><button id="reinforcement-svg">Export support SVG</button><button id="reinforcement-pdf">Export support PDF</button></div><div class="button-row"><button id="reinforcement-csv">Export measurements CSV</button><button id="reinforcement-json">Export measurements JSON</button></div><output id="reinforcement-status" aria-live="polite"></output><div id="reinforcement-chart" hidden style="overflow:auto;max-height:300px;background:white"></div>';
    context.mount.after(panel);this.panel=panel;this.node('cycles').value='[]';
    for(const action of ['build','restore','save','svg','pdf','csv','json'])this.node(action).onclick=context.guard(()=>this.apply(action));
    for(const key of ['cycles','unit','angle']){this.node(key).oninput=()=>this.sync();this.node(key).onchange=()=>this.sync();}
    this.node('cancel').onclick=()=>this.cancel();this.sync();
  }
  node(key){return this.panel.querySelector('#reinforcement-'+key);}
  form(){return {cycles:this.node('cycles').value,unit:this.node('unit').value,angleUnit:this.node('angle').value};}
  async apply(action){const form=this.form();const job=this.session.execute(action,form);this.sync();try{const result=await job;
    if(action==='restore'){this.node('cycles').value=form.cycles;this.session.form=this.session.signature(this.form());}
    this.node('status').textContent=action==='csv'||action==='json'?`${result.report.rows.length} measurements exported.`:action==='pdf'?`${result.pages.length} support sheets exported; physical net scale retained.`:`${result.panels?.length??this.session.reply?.panels.length??0} internal support panels; physical net scale retained.`;this.node('status').dataset.status='complete';return result;
  }catch(error){this.node('status').textContent=error.message;this.node('status').dataset.status=error.name==='AbortError'?'user-cancelled':'refused';throw error;}finally{this.sync();}}
  cancel(){this.session.cancel();}
  invalidate(){this.session.invalidate();this.sync();}
  sync(){const c=this.context,model=c.getState()?.model,eligible=model?.dimension===3&&model.interpretation==='convex-polytope';
    if(this.session.reply){try{verifyNativeSource(this.session.context,this.session.owner);if(this.session.signature(this.form())!==this.session.form)this.session.clear();}catch{this.session.clear();}}
    const disabled=this.session.busy||c.isExporting()||!eligible;for(const node of this.panel.querySelectorAll('button,input,textarea,select'))node.disabled=disabled;
    this.node('cancel').disabled=!this.session.busy;for(const key of ['save','svg','pdf'])this.node(key).disabled=disabled||!this.session.reply;this.node('restore').disabled=disabled||!c.getState()?.view.netReinforcement;
  }
}
