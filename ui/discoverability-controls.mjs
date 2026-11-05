// SPDX-License-Identifier: GPL-3.0-only
import {buildCommandIndex,rankCommands,moveCommandSelection,revealCommand} from './command-index.mjs';
import {bindings,shortcutTable,matchesShortcut} from './shortcut-bindings.mjs';
import {GUIDE_TOPICS,guideContext} from './user-guide.mjs';
import {appendFeatureActionIndex,guideCommandKeywords} from './guide-action-index.mjs';
const text=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('.group-help').forEach(n=>n.remove());return copy.textContent.trim().replace(/\s+/g,' ');};
const label=node=>node.getAttribute('aria-label')||Array.from(node.labels??[]).map(label=>{const copy=label.cloneNode(true);copy.querySelectorAll('input,textarea,select,button').forEach(n=>n.remove());return copy.textContent.trim();}).join(' ')||(node.tagName==='BUTTON'||node.tagName==='SUMMARY'?text(node):'')||node.title||node.id;
export class DiscoverabilityControls{
  constructor(context){
    this.context=context;this.doc=context.document??document;this.nodeIds=new WeakMap();this.nextNodeId=0;const doc=this.doc;
    const button=doc.createElement('button');button.id='command-search';button.textContent='⌕';button.title='Search commands (Ctrl+K)';button.setAttribute('aria-label','Search commands');doc.querySelector('.command-bar nav').append(button);button.onclick=()=>this.show();
    this.dialog=doc.createElement('dialog');this.dialog.id='command-palette';this.dialog.setAttribute('aria-labelledby','command-palette-title');
    this.dialog.innerHTML='<div class="dialog-heading"><h2 id="command-palette-title">Search commands</h2><button id="command-close" aria-label="Close commands">Close</button></div><label>Find a tool, model, view or guide topic<input id="command-query" type="search" autocomplete="off" aria-controls="command-results" aria-describedby="command-hint"></label><p id="command-hint" class="muted">↑ / ↓ to choose · Enter to run or focus · Esc to close</p><div id="command-results" role="listbox" aria-label="Matching commands"></div><p id="command-count" aria-live="polite"></p>';
    doc.body.append(this.dialog);this.query=this.dialog.querySelector('input');this.query.setAttribute('role','combobox');this.query.setAttribute('aria-expanded','true');this.query.setAttribute('aria-autocomplete','list');this.results=this.dialog.querySelector('#command-results');
    this.dialog.querySelector('#command-close').onclick=()=>this.dialog.close();this.query.oninput=()=>this.render();
    this.dialog.addEventListener('close',()=>{if(this.restoreFocus&&this.previousFocus?.isConnected)this.previousFocus.focus();});
    this.dialog.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();this.selected=moveCommandSelection(this.selected,event.key==='ArrowDown'?1:-1,this.matches.length);this.select();}
      else if(event.key==='Enter'&&event.target!==this.dialog.querySelector('#command-close')){event.preventDefault();this.execute(this.matches[this.selected]);}
    });
    this.sheet=doc.createElement('dialog');this.sheet.id='shortcut-sheet';this.sheet.setAttribute('aria-labelledby','shortcut-title');this.sheet.innerHTML='<div class="dialog-heading"><h2 id="shortcut-title">Keyboard shortcuts</h2><button>Close</button></div><p>File and geometry shortcuts follow the native menu. Text fields retain their editing shortcuts. Memory and tour shortcuts wait while a dialog or export is active.</p><dl id="shortcut-list"></dl>';
    this.sheet.querySelector('button').onclick=()=>this.sheet.close();doc.body.append(this.sheet);this.sheet.addEventListener('close',()=>{if(!this.dialog.open&&this.sheetFocus?.isConnected)this.sheetFocus.focus();});
    appendFeatureActionIndex(doc,this.sheet,query=>{this.sheet.close();this.show();this.query.value=query;this.render();});
    doc.addEventListener('keydown',event=>{
      if(event.defaultPrevented)return;
      if(bindings.commands.keys.some(key=>matchesShortcut(event,key))){if(doc.querySelector('dialog[open]')&&!this.dialog.open)return;event.preventDefault();this.show();}
      if(bindings.shortcuts.keys.some(key=>matchesShortcut(event,key))&&!event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')&&!doc.querySelector('dialog[open]')){event.preventDefault();this.showShortcuts();}
    });
    this.helpGroups();this.observer=new MutationObserver(()=>this.helpGroups());this.observer.observe(doc.getElementById('inspector-region'),{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    const shelf=doc.querySelector('.workspace-shelf');if(shelf)this.observer.observe(shelf,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  }
  helpGroups(){
    for(const summary of this.doc.querySelectorAll('#inspector-region details > summary,.workspace-shelf details > summary')){
      const existing=summary.querySelector('.group-help');if(existing){if(existing.disabled){existing.disabled=false;existing.title='Guide: '+text(summary);delete existing.dataset.disabledReason;existing.removeAttribute('aria-description');}continue;}
      const button=this.doc.createElement('button');button.className='group-help';button.type='button';button.textContent='?';button.title='Guide: '+text(summary);button.setAttribute('aria-label','Help for '+text(summary));
      button.onclick=event=>{event.preventDefault();event.stopPropagation();this.context.guide.show(guideContext(summary.parentElement));};summary.append(button);
    }
  }
  reason(node){
    if(!node?.isConnected)return 'This control is no longer available.';
    if(node.matches(':disabled')||node.getAttribute('aria-disabled')==='true')return node.dataset.disabledReason||node.getAttribute('aria-description')||node.title||'Unavailable for the current model or workspace state.';
    for(let parent=node;parent;parent=parent.parentElement)if(parent.hidden&&!parent.classList.contains('inspector-panel')&&!parent.dataset?.constructTool&&parent.id!=='construct-gallery-home')return 'This control is hidden in the current workspace mode.';
    return '';
  }
  index(){
    const doc=this.doc,c=this.context,actions=Object.entries(c.actions).map(([id,run])=>{
      const node=doc.getElementById(id),reason=c.actionReason?.(id)||(node?this.reason(node):'');return {id:'action:'+id,label:bindings[id]?.label||id,path:[bindings[id]?.scope||'Commands'],keywords:guideCommandKeywords(id),disabled:!!reason,reason,run};
    }),controls=[];
    for(const node of doc.querySelectorAll('.command-bar button,.workspace button,.workspace input,.workspace select,#library-region button:not(.catalog-entry),#library-region input,#library-region select,#inspector-region button,#inspector-region input,#inspector-region select,#inspector-region textarea,#inspector-region summary,#cancel')){
      if(node.classList.contains('group-help')||node.id==='command-search'||node.dataset.panel||c.actions[node.id])continue;
      if(node.classList.contains('construct-tool-summary')||node.classList.contains('construct-source-heading')||node.classList.contains('construct-back')||node.closest('.construct-recent'))continue;
      const panel=node.closest('.inspector-panel'),groups=[];for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')groups.unshift(text(parent.querySelector('summary')));
      if(!this.nodeIds.has(node))this.nodeIds.set(node,++this.nextNodeId);
      const path=[panel?({info:'Analysis',construct:'Construct',net:'Nets',evidence:'Advanced'}[panel.id.replace(/-panel$/,'')]):node.closest('#library-region')?'Library':'Workspace',...groups],reason=this.reason(node),base={id:'control:'+(node.id||'anonymous-'+this.nodeIds.get(node)),label:label(node),path,keywords:guideCommandKeywords(node.id),disabled:!!reason,reason,node};
      const pane=node.closest('[data-construct-tool]');if(pane){base.path=['Construct',pane.dataset.constructName,...groups];base.keywords+=' '+pane.dataset.constructKeywords;}
      controls.push({...base,run:()=>{this.reveal(node);if(node.tagName==='BUTTON')node.click();else if(node.tagName==='SUMMARY')node.parentElement.open=true;}});
      if(node.tagName==='SELECT')for(const option of node.options){const optionReason=reason||(option.disabled?'This choice is unavailable.':'');controls.push({...base,id:base.id+':'+option.value,label:base.label+': '+option.textContent,disabled:!!optionReason,reason:optionReason,option,run:()=>{this.reveal(node);node.value=option.value;node.dispatchEvent(new Event('change',{bubbles:true}));}});}
    }
    const library=c.library().map(entry=>{const reason=c.libraryReason?.(entry)||((entry.external&&entry.supported===false)?entry.diagnostic||'Unsupported source file.':'');return {id:'library:'+entry.key,label:'Open: '+entry.name,path:['Library',entry.family||'Linked OFF'],keywords:[entry.symbol,...(entry.aliases??[])].join(' '),disabled:!!reason,reason,run:()=>c.openLibrary(entry)};});
    const topics=GUIDE_TOPICS.map(topic=>({id:'guide:'+topic.id,label:'Guide: '+topic.title,path:['Guide',topic.where],keywords:topic.keywords,run:()=>c.guide.show(topic.id)}));
    return buildCommandIndex({actions,controls,library,topics});
  }
  reveal(node){revealCommand(node,{showRegion:region=>{if(this.doc.body.classList.contains(region+'-hidden'))this.doc.getElementById('toggle-'+region).click();},activatePanel:id=>this.doc.querySelector(`[data-panel="${id}"]`)?.click()});setTimeout(()=>node.classList.remove('command-highlight'),1800);}
  show(){if(!this.dialog.open){if(this.doc.querySelector('dialog[open]'))return;this.restoreFocus=true;this.previousFocus=this.doc.activeElement;this.query.value='';this.dialog.showModal();}this.render();this.query.focus();}
  render(){this.matches=rankCommands(this.index(),this.query.value);this.selected=this.matches.length?0:-1;this.results.replaceChildren();
    this.matches.forEach((item,i)=>{const row=this.doc.createElement('div');row.id='command-result-'+i;row.className='command-result';row.setAttribute('role','option');row.setAttribute('aria-disabled',String(!!item.disabled));const title=this.doc.createElement('strong');title.textContent=item.label;const path=this.doc.createElement('small');path.textContent=[item.path,item.reason].filter(Boolean).join(' · ');row.append(title,path);row.onclick=()=>this.execute(item);this.results.append(row);});
    this.dialog.querySelector('#command-count').textContent=this.matches.length?(this.matches.length===80?'Showing up to 80 matches. Refine your search.':this.matches.length+' matches'):'No matches. Try a shorter phrase.';this.select();
  }
  select(){Array.from(this.results.children).forEach((row,i)=>{row.setAttribute('aria-selected',String(i===this.selected));if(i===this.selected){this.query.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'});}});if(this.selected<0)this.query.removeAttribute('aria-activedescendant');}
  execute(item){if(!item)return;const current=this.index().find(row=>row.id===item.id);if(!current||current.disabled){this.render();return;}this.restoreFocus=false;this.dialog.close();this.context.guard(()=>current.run())();}
  showShortcuts(){if(this.doc.querySelector('dialog[open]'))return;this.sheetFocus=this.doc.activeElement;const list=this.sheet.querySelector('dl');list.replaceChildren();for(const item of shortcutTable()){const term=this.doc.createElement('dt'),description=this.doc.createElement('dd');term.textContent=item.keys;description.textContent=item.label+' · '+item.scope;list.append(term,description);}this.sheet.showModal();}
}
