import {guideContext} from './user-guide.mjs';
import {icon} from './icons.mjs';

export const EXPERT_TOOLS_KEY='polytope.expert-tools.v1';
export function readExpertTools(storage,{hidden=false}={}){
  if(hidden)return true;
  try{return storage?.getItem(EXPERT_TOOLS_KEY)==='true';}catch{return false;}
}
const RARE_DRAWERS=new Set(['stereo-settings','memories-settings','dual-morph-settings']);
const EXPERT_IDS=['stereo-settings','stereo-mode','pick-kind','open-multiple-views'];
const text=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('.group-help').forEach(n=>n.remove());return copy.textContent.trim();};
const make=(doc,tag,cls,label)=>{const node=doc.createElement(tag);if(cls)node.className=cls;if(label)node.textContent=label;return node;};
const overlayOpen=doc=>!!doc.querySelector('dialog[open]')||doc.getElementById('presentation-showcase')?.hidden===false;

// Native disclosures remain the reveal/focus boundary for existing commands and smokes.
export function bindChromePopover(doc,root,trigger){
  trigger.setAttribute('aria-controls',root.querySelector('.chrome-menu-panel').id);
  const sync=()=>trigger.setAttribute('aria-expanded',String(root.open));sync();root.addEventListener('toggle',sync);
  const close=focus=>{if(!root.open)return;root.open=false;sync();if(focus)trigger.focus();};
  trigger.addEventListener('keydown',event=>{
    if(event.key!=='ArrowDown')return;event.preventDefault();root.open=true;sync();
    root.querySelector('.chrome-menu-panel button:not(:disabled),.chrome-menu-panel select:not(:disabled)')?.focus();
  });
  doc.addEventListener('pointerdown',event=>{if(!root.contains(event.target))close(false);});
  root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget))close(false);});
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.open&&!overlayOpen(doc)){event.preventDefault();close(true);}},true);
  return {close,sync};
}

export class AppChrome{
  constructor(context={}){
    this.context=context;this.doc=context.document??document;const doc=this.doc;
    try{this.storage=context.storage===undefined?doc.defaultView?.localStorage:context.storage;}catch{this.storage=null;}
    this.popovers=[];this.drawers=[];doc.body.classList.add('app-chrome');
    this.viewToolbar();this.dock();this.topbar();
    for(const id of EXPERT_IDS)doc.getElementById(id)?.setAttribute('data-expert','');
    this.setExpert(readExpertTools(this.storage),{persist:false});
    doc.addEventListener('app-chrome-reveal',event=>{if(event.target.closest?.('[data-expert]'))this.setExpert(true);});
    doc.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||overlayOpen(doc))return;
      const drawer=this.drawers.find(n=>n.open);if(!drawer)return;
      event.preventDefault();this.closeDrawer(drawer,true);
    },true);
    const presentation=doc.getElementById('presentation-showcase');
    if(presentation){const sync=()=>doc.getElementById('presentation')?.setAttribute('aria-pressed',String(!presentation.hidden));sync();
      this.presentationObserver=new MutationObserver(sync);this.presentationObserver.observe(presentation,{attributes:true,attributeFilter:['hidden']});}
    doc.getElementById('fullscreen')?.setAttribute('aria-pressed','false');
    context.api?.onFullscreenChanged?.(value=>this.fullscreen(value));
  }
  startup(info){this.setExpert(readExpertTools(this.storage,info),{persist:false});this.fullscreen(info.fullscreen??false);}
  fullscreen(value){this.doc.getElementById('fullscreen')?.setAttribute('aria-pressed',String(!!value));}
  setExpert(value,{persist=true}={}){
    const doc=this.doc;this.expert=!!value;doc.body.classList.toggle('expert-mode',this.expert);
    if(this.expertButton){this.expertButton.setAttribute('aria-pressed',String(this.expert));this.expertButton.textContent=this.expert?'Hide expert tools':'Show expert tools';}
    if(!this.expert){if(doc.activeElement?.closest?.('[data-expert]'))this.expertButton?.focus();for(const drawer of this.drawers)if(drawer.hasAttribute('data-expert'))drawer.open=false;}
    if(persist)try{this.storage?.setItem(EXPERT_TOOLS_KEY,String(this.expert));}catch{}
  }
  popover(host,id,label){
    const doc=this.doc,root=make(doc,'details','chrome-popover');root.id=id;
    const summary=make(doc,'summary','chrome-menu-trigger',label);summary.id=id+'-button';
    const panel=make(doc,'div','chrome-menu-panel');panel.id=id+'-panel';root.append(summary,panel);host.append(root);
    this.popovers.push(bindChromePopover(doc,root,summary));return {root,summary,panel};
  }
  viewToolbar(){
    const doc=this.doc,toolbar=doc.querySelector('.view-toolbar');if(!toolbar)return;
    const options=this.popover(toolbar,'view-options','View options');this.viewOptions=options.root;
    options.summary.textContent='';options.summary.append(make(doc,'span','chrome-toolbar-label','View options'));options.summary.setAttribute('aria-label','View options');options.summary.title='View options';
    const projection=doc.getElementById('projection');
    for(const option of projection?.options??[])option.textContent={orthographic:'Orthographic',perspective:'Perspective',stereographic:'Stereographic'}[option.value]??option.textContent;
    const snapshot=doc.getElementById('image');if(snapshot){snapshot.textContent='';snapshot.append(icon('snapshot',{document:doc}),make(doc,'span','chrome-toolbar-label','Snapshot (PNG)'));snapshot.setAttribute('aria-label','Snapshot (PNG)');snapshot.title='Snapshot (PNG)';}
    const move=(id,label,{expert=false}={})=>{
      const node=doc.getElementById(id);if(!node)return;
      const row=make(doc,'label','chrome-option',label);if(expert)row.setAttribute('data-expert','');
      // Keep the existing layout label too: its select and listeners retain identity.
      if(node.parentElement?.tagName==='LABEL')options.panel.append(node.parentElement);else{row.append(node);options.panel.append(row);}
      if(expert)node.setAttribute('data-expert','');
    };
    move('viewport-layout','Viewports');move('camera-projection','3D camera');move('view-orientation','Look from');
    const camera=doc.getElementById('camera-projection');if(camera)camera.title='3D camera: the on-screen camera observing the projected shape';
    move('stereo-mode','Stereo',{expert:true});move('pick-kind','Select by clicking',{expert:true});
    for(const [id,labels] of [
      ['camera-projection',{orthographic:'Parallel',perspective:'Perspective'}],
      ['view-orientation',{free:'Free orbit'}],
      ['stereo-mode',{none:'Off'}],
      ['pick-kind',{vertex:'Vertices',edge:'Edges',face:'Faces',cell:'Cells (4D)'}]
    ])for(const option of doc.getElementById(id)?.options??[])option.textContent=labels[option.value]??option.textContent;
    const reset=doc.getElementById('reset');if(reset)options.panel.append(reset);
    const png=doc.getElementById('png-settings');if(png)options.panel.append(png);
    // Any later toolbar additions go into the same anchored options panel.
    const essentials=new Set(['projection-label','projection','render-style','auto-rotate','fit-view','image']);
    const collect=()=>{
      for(const node of [...toolbar.children]){
        if(node===options.root)continue;
        if(node.classList.contains('toolbar-group')){if(!node.children.length)node.remove();continue;}
        if(!essentials.has(node.id))options.panel.append(node);
      }
    };collect();
    this.toolbarObserver=new MutationObserver(collect);this.toolbarObserver.observe(toolbar,{childList:true});
  }
  closeDrawer(drawer,focus=false){
    drawer.open=false;
    if(focus)(RARE_DRAWERS.has(drawer.id)?this.more.summary:drawer.querySelector(':scope > summary'))?.focus();
  }
  dock(){
    const doc=this.doc,shelf=doc.querySelector('.workspace-shelf');if(!shelf)return;
    const more=this.more=this.popover(shelf,'dock-more','More ▾');more.root.classList.add('chrome-dock-more');
    more.root.setAttribute('name','viewport-tools');
    for(const drawer of [...shelf.children].filter(n=>n.tagName==='DETAILS'&&n!==more.root)){
      const summary=drawer.querySelector(':scope > summary'),body=drawer.querySelector(':scope > .settings-body');if(!summary||!body)continue;
      if(drawer.id==='presentation-settings'){
        const help=summary.querySelector('.group-help');summary.textContent='Presentation settings';if(help)summary.append(help);
      }
      const title=text(summary);this.drawers.push(drawer);drawer.classList.add('chrome-drawer');drawer.setAttribute('name','viewport-tools');
      if(!body.id)body.id=drawer.id+'-body';summary.setAttribute('aria-controls',body.id);
      const header=make(doc,'div','chrome-drawer-header'),heading=make(doc,'strong','',title);heading.id=drawer.id+'-title';body.setAttribute('aria-labelledby',heading.id);
      const help=make(doc,'button','chrome-drawer-help','?');help.type='button';help.setAttribute('aria-label','Help for '+title);help.title='Guide: '+title;help.onclick=()=>this.context.guide?.show(guideContext(drawer));
      const close=make(doc,'button','chrome-drawer-close','×');close.type='button';close.setAttribute('aria-label','Close '+title);close.onclick=()=>this.closeDrawer(drawer,true);
      header.append(heading,help,close);body.prepend(header);
      const sync=()=>{
        summary.setAttribute('aria-expanded',String(drawer.open));
        if(drawer.open)for(const other of this.drawers)if(other!==drawer)other.open=false;
        more.summary.classList.toggle('active',this.drawers.some(n=>RARE_DRAWERS.has(n.id)&&n.open));
      };drawer.addEventListener('toggle',sync);sync();
      if(RARE_DRAWERS.has(drawer.id)){
        drawer.classList.add('chrome-overflow-drawer');
        const button=make(doc,'button','',title);button.id='open-'+drawer.id;button.setAttribute('aria-controls',body.id);
        if(drawer.id==='stereo-settings')button.setAttribute('data-expert','');
        button.onclick=()=>{more.root.open=false;drawer.open=true;sync();close.focus();};more.panel.append(button);
      }
    }
    const multiple=doc.getElementById('open-multiple-views');if(multiple)more.panel.append(multiple);
    // Keep overflow after the existing drawer tabs.
    shelf.append(more.root);
  }
  topbar(){
    const doc=this.doc,host=doc.querySelector('.workspace-actions');if(!host)return;
    const header=doc.querySelector('.command-bar');
    for(const [id,name,label] of [['new','new','New'],['open','open','Open'],['save','save','Save'],['undo','undo','Undo'],['redo','redo','Redo'],['export','export','Export'],['help','help','Help'],['presentation','presentation','Presentation'],['fullscreen','fullscreen','Full screen'],['toggle-library','library','Library'],['toggle-inspector','inspector','Inspector']]){
      const button=doc.getElementById(id);if(!button)continue;
      button.textContent='';button.append(icon(name,{document:doc}),make(doc,'span','chrome-button-label',label));
      if(!button.getAttribute('aria-label'))button.setAttribute('aria-label',label);
      if(id==='undo'||id==='redo'){button.classList.add('chrome-icon-button');button.setAttribute('aria-keyshortcuts',id==='undo'?'Control+Z':'Control+Shift+Z');}
    }
    const help=doc.getElementById('help');if(help)host.prepend(help);
    const search=doc.getElementById('command-search');
    if(search){
      search.textContent='';search.append(icon('search',{document:doc}),make(doc,'span','chrome-search-label','Find a shape or tool...'),make(doc,'kbd','','Ctrl+K'));
      search.setAttribute('aria-label','Find a shape or tool');search.setAttribute('aria-haspopup','dialog');search.setAttribute('aria-controls','command-palette');search.setAttribute('aria-keyshortcuts','Control+K');
      header.append(search,host);
    }
    const menu=this.popover(host,'app-options','⋯');menu.summary.setAttribute('aria-label','More app options');menu.summary.title='More app options';
    menu.summary.textContent='';menu.summary.append(icon('more',{document:doc}));
    const button=this.expertButton=make(doc,'button','','Show expert tools');button.id='expert-tools';button.type='button';button.title='Show or hide advanced controls';
    button.onclick=()=>this.setExpert(!this.expert);menu.panel.append(button);
  }
}
