const jobPhrases=[
  [/^(?:load local catalog|catalog)$/i,'Loading the model library','Model library ready'],
  [/^(?:analyze(?: incidence)?|information-panel|generalized source density information)$/i,'Analyzing shape','Shape analysis ready'],
  [/^(?:validate|revalidate|check)/i,'Checking shape','Shape checked'],
  [/expression|numeric inputs/i,'Checking numbers','Numbers checked'],
  [/^(?:open|load|read)/i,'Opening model','Model opened'],
  [/recover/i,'Recovering your work','Recovery ready'],
  [/export|print/i,'Preparing your file','File preparation ready'],
  [/section|slice/i,'Slicing shape','Slice ready'],
  [/net|unfold/i,'Unfolding shape','Unfolding ready'],
  [/symmetry/i,'Finding symmetries','Symmetry results ready'],
  [/dual|reciprocat/i,'Building dual shape','Dual shape ready'],
  [/truncat|edge.cut/i,'Cutting corners','Corner cut ready'],
  [/measure|deviation/i,'Measuring shape','Measurements ready'],
  [/generate|construct|create|build|extrude|hull/i,'Building shape','Shape ready'],
  [/prepare|preview|compute|evaluate|orient|transform|fit|project|reflect|scale|relax/i,'Preparing shape','Shape results ready']
];

export function friendlyJob(label,{phase='progress',elapsed=0,result,count=Array.isArray(result)?result.length:undefined,expert=false}={}){
  label=String(label??'');
  const phrases=jobPhrases.find(([pattern])=>pattern.test(label));
  let text=phrases?.[phase==='progress'?1:2]??(phase==='progress'?'Working on shape':'Shape results ready');
  if(phase==='complete'&&/^(?:load local catalog|catalog)$/i.test(label)&&Number.isInteger(count))text=`Loaded ${count.toLocaleString('en-US')} models`;
  if(phase==='progress')return text+'…';
  return text+((elapsed>2000||expert)?` · ${(elapsed/1000).toFixed(2)} s`:'');
}

export function friendlyStatus(text,{expert=false}={}){
  if(/^Starting local geometry engine/.test(text))return 'Getting your workspace ready…';
  const match=String(text).match(/^(.+) completed in ([\d.]+) s$/);
  return match?friendlyJob(match[1],{phase:'complete',elapsed:Number(match[2])*1000,expert}):String(text);
}

export function friendlyError(error){
  const detail=error?.message??String(error);
  const clean=detail.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'').replace(/^(?:Error|GeometryError):\s*/,''),lower=clean.toLowerCase();
  let message;
  if(/two-minute|timed?\s*out|timeout|time limit/.test(lower))message='The engine needed too long. Try a smaller model, or cancel a long job.';
  else if(/could not start|exited before completing|engine.*(?:crash|shutting down)|invalid engine response|broken pipe|epipe/.test(lower))message='The geometry engine stopped. Try the action again.';
  else if(/workers are busy|queue.*full/.test(lower))message='Other tools are still working. Wait a moment, or cancel the current job.';
  else if(/limit|too (?:large|many)|maximum|at most|budget|limited to|import requires 1[–-]|resource bound/.test(lower))message='This input is too large or complex for this tool. Try a smaller model or file.';
  else if(/^Every vertex must have exactly (\d+) finite coordinates/.test(clean))message=`That file has invalid vertex coordinates. Each vertex needs exactly ${clean.match(/^Every vertex must have exactly (\d+)/)[1]} finite numbers.`;
  else if(/^Declared edge count .* differs from boundary-derived count/.test(clean))message='The OFF file’s edge count does not match its faces. Check the header or save a corrected copy from the Library.';
  else if(/coordinates must be finite numbers within/.test(lower))message='Some coordinates are outside the supported numeric range. Use smaller finite numbers.';
  else if(/(?:export|output).*(?:requires|supports).*convex.*3d/.test(lower))message='This export needs a convex 3D shape. Try a different format.';
  else if(/export.*(?:2d\/3d|2d or 3d|3d or 4d)/.test(lower))message='This format cannot save this shape. Choose a supported dimension or another format.';
  else if(/2d,?\s*3d\s*(?:or|and)\s*4d/.test(lower))message='This tool needs valid 2D, 3D, or 4D coordinates.';
  else if(/(?:only|requires?|supports?|works|needs?|choose).*2d\s*(?:\/|or|and)\s*3d/.test(lower))message='This tool only works on 2D or 3D shapes.';
  else if(/(?:only|requires?|supports?|works|needs?|choose).*3d\s*(?:\/|or|and|to 2d or)\s*4d|sections currently reduce/.test(lower))message='This tool only works on 3D or 4D shapes.';
  else if(/(?:only|requires?|supports?|works|needs?|choose)(?: (?:an?|intrinsic|full-dimensional|convex|validated|literal|source|closed|rigid|structurally valid))* ?3d\b|3d[- ]only/.test(lower))message='This tool only works on 3D shapes.';
  else if(/(?:only|requires?|supports?|works|needs?|choose)(?: (?:an?|intrinsic|full-dimensional|convex|validated|literal|source|closed|rigid|structurally valid))* ?4d\b|4d[- ]only/.test(lower))message='This tool only works on 4D shapes.';
  else if(/convex.*only|only.*convex/.test(lower))message='This tool needs a convex shape (one with no inward dents).';
  else if(/off|4off/.test(lower)&&/invalid|malformed|expected|truncated|coordinate|record|count|marker|boundary/.test(lower)){
    const line=clean.match(/line\s+\d+[^\n]*/i);
    message="That file isn’t a valid OFF file."+(line?' '+line[0].slice(0,200):' Check its coordinates and face lists.');
  }
  else if(/invalid.*utf-?8|unicode|utf-8 text/.test(lower))message='This file needs to be saved as UTF-8 text before it can be opened.';
  else if(/json|parse|malformed|truncated file|trailing records|invalid (?:count|boundary|document|history|project)|project.*(?:invalid|unsupported)|unsupported project/.test(lower))message='This file could not be read. Check its format and contents.';
  else if(/enospc|no space left|disk.*full/.test(lower))message='There isn’t enough disk space to save this file. Free some space and try again.';
  else if(/eacces|eperm|permission denied|access.*denied/.test(lower))message='This file or folder cannot be accessed. Choose a location you can use.';
  else if(/export|save|write|print/.test(lower))message='The file could not be saved or printed. Check the settings and destination, then try again.';
  else if(/finite|numeric|number|expression|syntax|nonzero|positive|fraction/.test(lower))message='Check the entered values. This tool needs valid numbers in its supported range.';
  else if(/source.*changed|superseded|no longer|current.*result/.test(lower))message='The shape or settings changed. Run the tool again.';
  else message='This action could not finish. Open Details for the reason.';
  return {message,detail};
}

export class Toasts {
  constructor(host,{document=host.ownerDocument,successHost=host,copy=text=>globalThis.navigator.clipboard.writeText(text)}={}){
    this.host=host;this.successHost=successHost;this.document=document;this.copy=copy;this.items=[];
    host.removeAttribute('role');host.setAttribute('aria-label','Notifications');
  }
  sync(){for(const host of new Set([this.host,this.successHost]))host.hidden=!this.items.some(item=>item.host===host);}
  show(message,{error=false,detail}={}){
    const doc=this.document,node=doc.createElement('section');node.className='friendly-toast';node.dataset.kind=error?'error':'success';
    node.setAttribute('role',error?'alert':'status');node.setAttribute('aria-atomic','true');
    const text=doc.createElement('p');text.textContent=message;
    const close=doc.createElement('button');close.type='button';close.className='toast-close';close.textContent='×';close.setAttribute('aria-label','Dismiss notification');
    const host=error?this.host:this.successHost,item={node,host,timer:null},remove=()=>{clearTimeout(item.timer);node.remove();this.items=this.items.filter(value=>value!==item);this.sync();};
    close.onclick=remove;node.append(text,close);
    if(detail!==undefined){
      const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre'),copy=doc.createElement('button');
      details.className='toast-details';copy.className='toast-copy';
      summary.textContent='Details';pre.textContent=detail;copy.type='button';copy.textContent='Copy details';
      copy.onclick=async()=>{try{await this.copy(detail);copy.textContent='Copied';}catch{copy.textContent='Select the details to copy';pre.tabIndex=0;pre.focus();}};
      details.append(summary,pre,copy);node.append(details);
    }
    this.items.push(item);host.append(node);
    while(this.items.length>3){const first=this.items.shift();clearTimeout(first.timer);first.node.remove();}
    this.sync();
    if(!error)item.timer=setTimeout(remove,3600);
    return {node,close:remove};
  }
}

// IDs stay with their existing controls; these hints supplement tool-owned reasons.
export const AUDITED_CONTROLS=['new','open','save','undo','redo','reset','image','export','print','fit-view','auto-rotate','animate','projection','camera-projection','viewport-layout','render-style','isolate-cell','hide-cell','show-all-cells','select-entity','measure','make-dual','truncate','extrude','scale','mirror','generate','apply-section','section-events','promote','copy-facets','facet','validate','symmetry','rational-dual','certify-current'];
export function disabledReason(id,{hasModel=true,exporting=false,dimension=3,canUndo=true,canRedo=true,cells=0,saving=false}={}){
  if(id==='save'&&saving)return 'Wait for the project to finish saving.';
  if(exporting)return 'Finish or cancel the export before using this tool.';
  if(!hasModel)return 'Choose a model from the Library, use New, or Open a project first.';
  if(id==='undo'&&!canUndo)return 'There are no earlier construction steps to undo.';
  if(id==='redo'&&!canRedo)return 'There are no undone construction steps to redo.';
  if(id==='projection'&&dimension!==4)return '4D projection is available when a 4D shape is open.';
  if(['isolate-cell','hide-cell','show-all-cells'].includes(id)&&!cells)return 'This shape has no 3D cells to show or hide.';
  if(['auto-rotate','animate'].includes(id)&&dimension<3)return 'Open a 3D or 4D shape to use this rotation tool.';
  if(id==='promote')return 'Compute a current slice, net, or other derived shape first.';
  return 'Finish the current action or check this tool’s model requirements.';
}

export function updateDisabledHints(doc,context,owned=new WeakMap()){
  for(const id of AUDITED_CONTROLS){
    const node=doc.getElementById(id);if(!node)continue;
    const previous=owned.get(node),existing=node.dataset.disabledReason;
    if(existing&&existing!==previous?.reason){owned.delete(node);continue;}
    const disabled=node.matches(':disabled')||node.getAttribute('aria-disabled')==='true';
    if(!disabled){
      if(previous){if(node.title===previous.reason)node.title=previous.title;node.removeAttribute('aria-description');delete node.dataset.disabledReason;owned.delete(node);}
      continue;
    }
    const reason=disabledReason(id,context),title=previous&&node.title===previous.reason?previous.title:node.title;
    owned.set(node,{title,reason});if(node.title!==reason)node.title=reason;if(node.dataset.disabledReason!==reason)node.dataset.disabledReason=reason;if(node.getAttribute('aria-description')!==reason)node.setAttribute('aria-description',reason);
  }
  return owned;
}

export class FriendlyMessages {
  constructor(doc){
    this.doc=doc;this.status=doc.getElementById('status');
    const errors=doc.getElementById('toast'),stack=doc.createElement('div'),successes=doc.createElement('div');
    stack.id='friendly-notifications';this.stack=stack;successes.id='success-toasts';successes.hidden=true;errors.before(stack);stack.append(errors,successes);
    this.toasts=new Toasts(errors,{successHost:successes});
    this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.status.setAttribute('aria-atomic','true');
    this.progress=doc.createElement('span');this.progress.id='job-progress';this.progress.hidden=true;this.progress.setAttribute('role','progressbar');this.progress.setAttribute('aria-label','Working on shape');
    doc.getElementById('cancel').before(this.progress);doc.getElementById('cancel').textContent='Cancel';
    this.expertObserver=new MutationObserver(()=>this.renderStatus());this.expertObserver.observe(doc.body,{attributes:true,attributeFilter:['class']});
    doc.addEventListener('close',event=>{if(event.target.contains(this.stack))doc.body.append(this.stack);},true);
    this.publish(this.status.textContent);
  }
  expert(){return this.doc.body.classList.contains('expert-mode');}
  publish(text){
    this.lastText=String(text);this.completion=null;this.renderStatus();
    if(/^(?:Saved |Opened |Exported |Recovered autosave\.)/.test(text)&&(this.lastSuccess!==text||Date.now()-this.lastSuccessAt>1000)){this.lastSuccess=text;this.lastSuccessAt=Date.now();this.placeNotifications();this.toasts.show(text);}
  }
  renderStatus(){
    if(this.lastText===undefined)return;
    const job=this.completion;
    this.status.textContent=job?friendlyJob(job.label,{...job,expert:this.expert()}):friendlyStatus(this.lastText,{expert:this.expert()});
    this.status.title=job?job.label+((job.elapsed>2000||this.expert())?` · ${(job.elapsed/1000).toFixed(2)} s`:''):this.lastText;
  }
  job(label,options={}){return friendlyJob(label,{...options,expert:this.expert()});}
  completed({label,elapsed,result}){this.completion={label,phase:'complete',elapsed,count:Array.isArray(result)?result.length:undefined};this.renderStatus();}
  placeNotifications(){const dialogs=this.doc.querySelectorAll('dialog[open]'),host=dialogs[dialogs.length-1]??this.doc.body;if(this.stack.parentElement!==host)host.append(this.stack);}
  error(error){const result=friendlyError(error);this.placeNotifications();this.toasts.show(result.message,{error:true,detail:result.detail});return result.message;}
  syncJobs(jobs){
    clearTimeout(this.progressTimer);
    const oldest=Math.min(...[...jobs.values()].map(job=>job.start)),delay=700-(performance.now()-oldest),busy=jobs.size>0&&delay<=0;
    this.progress.hidden=!busy;this.status.setAttribute('aria-busy',String(busy));
    if(jobs.size&&delay>0)this.progressTimer=setTimeout(()=>this.syncJobs(jobs),delay);
  }
  observeAvailability(context){
    const owned=new WeakMap(),sync=()=>updateDisabledHints(this.doc,context(),owned);sync();
    this.availabilityObserver=new MutationObserver(sync);this.availabilityObserver.observe(this.doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','aria-disabled']});
  }
}
