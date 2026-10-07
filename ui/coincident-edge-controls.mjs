/** GPL-3.0-or-later. Detached, source-owned four-face edge assembly editor. */
import {NumericEntry} from './numeric-entry.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
const clone=structuredClone;
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const policies=['tongue-in-groove','internal-support','no-internal-support','disconnected'];
const fail=message=>{throw Error(message);};
const exported=result=>{if(result===null||result===false)throw Object.assign(Error('Assembly export canceled.'),{name:'AbortError'});return result;};
export function checkedAssemblySVG(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>16*1024*1024)fail('Assembly SVG exceeds16MiB.');
  const parsed=new DOMParser().parseFromString(text,'image/svg+xml'),root=parsed.documentElement;
  if(root.localName!=='svg'||parsed.querySelector('parsererror'))fail('Malformed assembly SVG.');
  const tags=new Set(['svg','rect','g','path','polygon','text','tspan','metadata','defs','clipPath','image']);
  const attrs=new Set(['width','height','viewBox','points','fill','fill-opacity','stroke','stroke-width','stroke-dasharray','d','x','y','font-size','font-family','font-weight','font-style','text-anchor','pointer-events','transform','id','clipPathUnits','clip-rule','clip-path','baseline-shift','preserveAspectRatio','href']);
  const nodes=[root,...root.querySelectorAll('*')];if(nodes.length>50000)fail('Assembly SVG exceeds its node bound.');
  for(const node of nodes){
    if(node.namespaceURI!=='http://www.w3.org/2000/svg'||!tags.has(node.localName))fail('Unsupported assembly SVG content.');
    for(const attr of node.attributes){
      if(attr.namespaceURI==='http://www.w3.org/2000/xmlns/')continue;
      if(!attrs.has(attr.name)&&!/^data-(?:net|assembly|tab|component|annotation)/.test(attr.name))fail('Unsupported assembly SVG attribute.');
      if(attr.name==='href'&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(attr.value))fail('Assembly images must be source-owned portable PNG data.');
      if(attr.name==='clip-path'&&!/^url\(#annotation-face-\d+\)$/.test(attr.value))fail('Unverified assembly clip reference.');
      if(attr.name!=='clip-path'&&/url\s*\(/i.test(attr.value))fail('External assembly SVG references are unavailable.');
    }
  }
  return root;
}
export class AssemblySession{
  constructor(context){this.context=context;this.busy=false;this.generation=0;}
  signature(form){const s=this.context.getState();return stable([{policy:form.policy,supportSide:form.supportSide,length:form.length,width:form.width,ordinaryTabs:form.ordinaryTabs},s?.view.elementAnnotations??null,s?.view.coincidentAssembly??null]);}
  clearReply(){this.reply=null;this.draft=null;this.replySignature=null;this.context.clearPreview?.();}
  invalidate(){this.cancel();this.clearReply();this.qualification=null;this.owner=null;}
  cancel(){this.generation++;this.entry?.cancel();this.entry=null;}
  checkedReply(form){if(!this.reply)fail('Preview or restore a qualified assembly first.');verifyNativeSource(this.context,this.owner);if(this.signature(form)!==this.replySignature)fail('Assembly settings/content/history changed. Preview or restore again.');}
  async execute(action,form){
    if(this.busy)fail('Finish or cancel the current assembly operation.');const c=this.context,generation=++this.generation;const original=this.signature(form);
    const fields=action==='preview'?{length:{text:form.length,min:1,max:1000},width:{text:form.width,min:.1,max:100}}:action==='move'?{x:{text:form.x,min:-100000,max:100000},y:{text:form.y,min:-100000,max:100000},angle:{text:form.angle,min:-360000,max:360000}}:{confirm:{text:'0',min:0,max:0}};
    const entry=new NumericEntry(c);this.entry=entry;this.busy=true;
    try{return await entry.run(fields,async(values,numericVerify,{source,signal})=>{
      const verifyPublication=()=>{numericVerify();if(generation!==this.generation||this.signature(form)!==original||c.formSignature&&c.formSignature()!==stable(form))fail('Assembly source/settings/history changed or canceled. Repeat the operation.');};
      const options={signal,verifyPublication,sourceSnapshot:source};verifyPublication();let result;
      const content=c.getState().view.elementAnnotations?{element_annotations:clone(c.getState().view.elementAnnotations)}:{};
      if(action==='inspect'){
        result=await c.read('coincident-edge-qualify',{},source,options);verifyPublication();if(result?.format!=='coincident-edge-qualification'||result.sourceId!==source.id||!Array.isArray(result.joints)||!result.joints.length)fail('Native source pairing qualification is incomplete.');
        this.clearReply();this.qualification=clone(result);this.owner=captureNativeSource(c);return result;
      }
      if(action==='preview'){
        if(!this.qualification)fail('Inspect the literal four-face source edges first.');verifyNativeSource(c,this.owner);
        if(!policies.includes(form.policy)||!['none','single','double'].includes(form.ordinaryTabs)||!['0','1'].includes(form.supportSide))fail('Choose a documented assembly policy, ordinary tabs and support side.');
        const recipe={root:0,edge_length_mm:values.length,width_mm:values.width,ordinary_tabs:form.ordinaryTabs,joints:this.qualification.joints.map(j=>({edge:j.edge,outsidePairs:clone(j.outsidePairs),insidePairs:clone(j.insidePairs),policy:form.policy,supportSide:Number(form.supportSide)}))};
        result=await c.read('coincident-edge-net',{recipe,...content},source,options);verifyPublication();this.draft={format:'coincident-edge-assembly-state',version:1,kernelVersion:'0.1.0',sourceId:source.id,sourceHash:result.sourceHash,states:[clone(result.recipe)],cursor:0};
      }else if(action==='restore'){
        const saved=c.getState().view.coincidentAssembly;if(!saved)fail('This source has no saved assembly.');
        result=await c.read('coincident-edge-restore',{state:clone(saved),...content},source,options);verifyPublication();this.draft=clone(saved);this.qualification=clone(result.qualification);
      }else{
        this.checkedReply(form);const recipe=clone(this.draft.states[this.draft.cursor]);
        if(action==='save'){verifyPublication();c.getState().view.coincidentAssembly=clone(this.draft);c.markDirty();this.replySignature=this.signature(form);return clone(this.draft);}
        if(action==='svg'){exported(await c.export('svg',this.reply.svg,options));verifyPublication();return this.reply;}
        if(action==='pdf'){
          if(typeof c.exportPdf!=='function')fail('Assembly PDF export is unavailable.');const paper=clone(c.getPaperParameters?.()??{}),paperSignature=stable(paper);const verify=options.verifyPublication;options.verifyPublication=()=>{verify();if(stable(c.getPaperParameters?.()??{})!==paperSignature)fail('Assembly paper settings changed before export.');};
          result=await c.read('coincident-edge-pages',{recipe,paper,...content},source,options);options.verifyPublication();if(!Array.isArray(result.pages)||!result.pages.length||result.pages.length>250||result.contentScale!==1||result.validation?.allSourceFacesRepresented!==true)fail('Assembly print pages require complete source ownership and physical scale.');exported(await c.exportPdf(result.pages.map(p=>p.svg),options));options.verifyPublication();return result;
        }
        if(action==='undo'||action==='redo'){
          const cursor=this.draft.cursor+(action==='undo'?-1:1);if(cursor<0||cursor>=this.draft.states.length)fail('No more detached assembly history in this direction.');
          result=await c.read('coincident-edge-net',{recipe:clone(this.draft.states[cursor]),...content},source,options);verifyPublication();this.draft.cursor=cursor;
        }else if(action==='cut'||action==='move'){
          const edit=action==='cut'?{action:'toggle-connection',connection:form.connection}:{action:'move-component',component:form.component,translation:[values.x,values.y],angle:values.angle};
          result=await c.read('coincident-edge-edit',{recipe,...edit,...content},source,options);verifyPublication();this.draft.states.splice(this.draft.cursor+1);this.draft.states.push(clone(result.recipe));if(this.draft.states.length>100)this.draft.states.shift();this.draft.cursor=this.draft.states.length-1;
        }else fail('Unsupported assembly action.');
      }
      if(result?.sourceId!==source.id||result.validation?.allFacesRepresented!==true||result.foldValidation?.endpointReconstructed!==true||result.sourceHash!==this.draft.sourceHash)fail('Native assembly did not retain the complete qualified source endpoint.');
      await c.preview(result.svg,result,options);verifyPublication();this.reply=clone(result);this.owner=captureNativeSource(c);this.replySignature=this.signature(form);return result;
    });}catch(error){if(action!=='inspect')this.clearReply();throw error;}finally{if(this.entry===entry)this.entry=null;this.busy=false;}
  }
}
export class CoincidentEdgeControls{
  constructor(context){
    this.context=context;this.session=new AssemblySession({...context,formSignature:()=>stable(this.form())});
    const panel=document.createElement('details');panel.id='coincident-edge-assembly';panel.innerHTML='<summary>Four-face coincident edge assembly</summary><p class="muted">For qualified embedded closed ordinary pieces, including concave/toroidal pieces, meeting at a literal source edge. Source faces/vertices stay intact. This is a separate assembly, not an ordinary two-face net.</p><button id="assembly-inspect">Inspect source pairings</button><pre id="assembly-pairings" class="code-box"></pre><label>Policy <select id="assembly-policy"><option value="tongue-in-groove">Tongue-in-groove: two double-tab pairs</option><option value="internal-support">Internal support: one double-tab pair</option><option value="no-internal-support">No internal support: no joint tabs</option><option value="disconnected">Disconnected: inside face pairings</option></select></label><label>Supporting/tongue side <select id="assembly-side"><option value="0">Outside pair A</option><option value="1">Outside pair B</option></select></label><label>E0 / tab width <span><input id="assembly-length" value="25"> / <input id="assembly-width" value="3"> mm</span></label><label>Ordinary cut tabs <select id="assembly-tabs"><option>single</option><option>double</option><option>none</option></select></label><div class="button-row"><button id="assembly-preview">Preview assembly</button><button id="assembly-restore">Restore saved</button><button id="assembly-save">Save assembly</button><button id="assembly-cancel">Cancel</button></div><label>Face-pair connection <select id="assembly-connection"></select></label><button id="assembly-cut">Cut / join this pair</button><label>Component root <select id="assembly-component"></select></label><label>Move X / Y / angle <span><input id="assembly-x" value="0"> / <input id="assembly-y" value="0"> / <input id="assembly-angle" value="0"></span></label><button id="assembly-move">Move detached piece</button><div class="button-row"><button id="assembly-undo">Undo detached edit</button><button id="assembly-redo">Redo detached edit</button></div><div class="button-row"><button id="assembly-svg">Export SVG</button><button id="assembly-pdf">Export packed PDF</button></div><output id="assembly-status" aria-live="polite"></output><div id="assembly-chart" style="overflow:auto;max-height:360px;background:white" hidden></div>';
    context.mount.after(panel);this.panel=panel;
    for(const action of ['inspect','preview','restore','save','cut','move','undo','redo','svg','pdf'])this.node(action).onclick=context.guard(()=>this.apply(action));this.node('cancel').onclick=()=>this.cancel();
    for(const input of panel.querySelectorAll('input')){input.type='text';input.inputMode='text';}this.sync();
  }
  node(key){return this.panel.querySelector('#assembly-'+key);}
  form(){return {policy:this.node('policy').value,supportSide:this.node('side').value,length:this.node('length').value,width:this.node('width').value,ordinaryTabs:this.node('tabs').value,connection:this.node('connection').value,component:Number(this.node('component').value),x:this.node('x').value,y:this.node('y').value,angle:this.node('angle').value};}
  async apply(action){const form=this.form(),job=this.session.execute(action,form);this.sync();try{const result=await job;
    if(action==='inspect')this.node('pairings').textContent=result.joints.map(j=>`E${j.edge} V${j.sourceVertexIds.join(':')} faces[${j.incidentFaceIds}]\noutside A[${j.outsidePairs[0]}] B[${j.outsidePairs[1]}]; inside A[${j.insidePairs[0]}] B[${j.insidePairs[1]}]`).join('\n');
    if(this.session.reply&&['preview','restore','cut','move','undo','redo'].includes(action)){
      const reply=this.session.reply;this.node('connection').replaceChildren(...reply.connections.map(c=>{const option=document.createElement('option');option.value=c.id;option.textContent=c.id+(c.forcedCut?' required cut':reply.connectionHinges.includes(c.id)?' hinge':' cut');option.disabled=c.forcedCut;return option;}));
      this.node('component').replaceChildren(...reply.components.map(c=>{const option=document.createElement('option');option.value=String(c.root);option.textContent='C'+c.root;return option;}));
      this.node('connection').value=reply.connections.some(c=>c.id===form.connection&&!c.forcedCut)?form.connection:reply.connections.find(c=>!c.forcedCut)?.id??'';
      this.node('component').value=String(reply.components.some(c=>c.root===form.component)?form.component:reply.components[0].root);
      if(action==='restore'||action==='undo'||action==='redo'){const recipe=reply.recipe;this.node('policy').value=recipe.joints[0].policy;this.node('side').value=String(recipe.joints[0].supportSide);this.node('length').value=String(recipe.edge_length_mm);this.node('width').value=String(recipe.width_mm);this.node('tabs').value=recipe.ordinary_tabs;}
      this.session.replySignature=this.session.signature(this.form());
      this.node('pairings').textContent=reply.assemblyInstructions.map(j=>`E${j.sourceEdgeId}: ${j.policy}\n${j.action}`).join('\n');
    }
    this.node('status').textContent=action==='inspect'?`${result.joints.length} four-face edges; ${result.pieces.length} embedded pieces, genera [${result.pieces.map(p=>p.genus).join(', ')}]; source pairings shown.`:action==='save'?'Detached assembly history saved with source.':action==='pdf'?`${result.pageCount} pages exported at physical scale.`:`${this.session.reply?.faces.length??0} original source faces; overlap warnings retained.`;return result;
  }catch(error){this.node('status').textContent=error.message;throw error;}finally{this.sync();}}
  cancel(){this.session.cancel();}
  invalidate(){this.session.invalidate();this.sync();}
  sync(){const c=this.context,eligible=c.getState()?.model?.dimension===3&&(c.getState()?.model?.embeddingDimension??3)===3,disabled=this.session.busy||c.isExporting?.()||!eligible;
    for(const node of this.panel.querySelectorAll('button,input,select'))node.disabled=disabled;this.node('cancel').disabled=!this.session.busy;
    for(const name of ['save','cut','move','undo','redo','svg','pdf'])this.node(name).disabled=disabled||!this.session.reply;this.node('preview').disabled=disabled||!this.session.qualification;this.node('restore').disabled=disabled||!c.getState()?.view.coincidentAssembly;
    if(this.session.draft){this.node('undo').disabled||=this.session.draft.cursor===0;this.node('redo').disabled||=this.session.draft.cursor===this.session.draft.states.length-1;}
  }
}
