// Shared helpers for Electron smoke scripts.
// The inspector groups controls into collapsed <details> disclosures (ui/inspector-layout.mjs).
// reveal() opens only the disclosures that own the target, outermost first, so the control
// becomes interactable without forcing unrelated groups (e.g. the workspace shelf) open.
// A <summary> target leaves its own <details> untouched so clicking it still toggles the group.
async function reveal(page,selector){
  const target=typeof selector==='string'?page.locator(selector).first():selector;
  await target.evaluate(element=>{
    const doc=element.ownerDocument??(typeof document==='undefined'?null:document);
    const view=doc?.defaultView??(typeof window==='undefined'?null:window);
    if(element.closest('[data-expert]'))doc?.body.classList.add('expert-mode');
    const RevealEvent=view?.Event??globalThis.Event;
    element.dispatchEvent?.(new RevealEvent('app-chrome-reveal',{bubbles:true}));
    if(element.closest('[data-construct-tool]'))view?.openConstructTool?.(element,{focus:false});
    const chain=[];
    for(let node=element.closest('details');node;node=node.parentElement?.closest('details')??null){
      const ownSummary=node.querySelector(':scope > summary');
      if(ownSummary&&ownSummary.contains(element))continue;
      chain.unshift(node);
    }
    for(const details of chain)if(!details.open)details.open=true;
  });
  return target;
}

// Dock overflow entries open the original disclosures through their visible UI.
async function openDisclosure(page,id){
  if(await page.locator('#'+id).evaluate(node=>node.open))return;
  const entry=page.locator('#open-'+id);
  const target=await reveal(page,await entry.count()?entry:'#'+id+' > summary');
  await target.click();
}

// desktop/main.cjs installs no application menu in hidden-no-focus mode (Menu.getApplicationMenu() is null).
// Menu-dependent smokes then assert the same contract through the main-process workspace-availability IPC,
// whose handler returns the enabled map computed by desktop/workspace-menu.cjs (applyWorkspaceMenu), and
// dispatch menu commands as the same 'menu-action' messages the menu items send.
const MENU_ITEMS=Object.freeze({'Save project…':['workspace-save','save'],'Export model…':['workspace-export','export'],
  'Save image…':['workspace-image','image'],'Print…':['workspace-print','print'],'Undo geometry':['workspace-undo','undo'],
  'Redo geometry':['workspace-redo','redo'],'Reset camera':['workspace-reset','reset']});
async function menuless(app){return app.evaluate(({Menu})=>!Menu.getApplicationMenu());}
async function installMenuShadow(app){
  await app.evaluate(({ipcMain})=>{
    if(globalThis.smokeMenuShadow)return;
    const original=ipcMain._invokeHandlers.get('workspace-availability');if(!original)throw Error('workspace-availability handler is missing.');
    const shadow=globalThis.smokeMenuShadow={enabled:null,updates:0};ipcMain.removeHandler('workspace-availability');
    ipcMain.handle('workspace-availability',async(event,...args)=>{const enabled=await original(event,...args);shadow.enabled=enabled;shadow.updates++;return enabled;});
  });
}
// Enabled state by menu item id. With `expected`, waits (bounded) for the asynchronous availability publication to match.
async function menuEnabledById(app,ids,expected,timeout=5000){
  const read=()=>app.evaluate(({Menu},ids)=>{const menu=Menu.getApplicationMenu(),shadow=globalThis.smokeMenuShadow?.enabled;
    return Object.fromEntries(ids.map(id=>[id,menu?menu.getMenuItemById(id)?.enabled:shadow?.[id]]));},ids);
  const end=Date.now()+timeout;let value=await read();
  while(expected&&Date.now()<end&&ids.some(id=>value[id]!==expected[id])){await new Promise(resolve=>setTimeout(resolve,50));value=await read();}
  return value;
}
async function menuEnabledByLabel(app,labels,expected,timeout){
  if(!await menuless(app))return app.evaluate(({Menu},labels)=>Object.fromEntries(Menu.getApplicationMenu().items.flatMap(top=>top.submenu.items).filter(item=>labels.includes(item.label)).map(item=>[item.label,item.enabled])),labels);
  const ids=labels.map(label=>MENU_ITEMS[label][0]),byId=await menuEnabledById(app,ids,expected&&Object.fromEntries(labels.map((label,i)=>[ids[i],expected[label]])),timeout);
  return Object.fromEntries(labels.map((label,i)=>[label,byId[ids[i]]]));
}
async function clickMenu(app,labels){
  await app.evaluate(({Menu,BrowserWindow},{labels,items})=>{const menu=Menu.getApplicationMenu();
    if(menu){const all=menu.items.flatMap(top=>top.submenu.items);for(const label of labels)all.find(item=>item.label===label).click();return;}
    const contents=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()).webContents;for(const label of labels)contents.send('menu-action',items[label][1]);
  },{labels,items:MENU_ITEMS});
}
// The simplified UI keeps many controls inside closed tool panes, popovers and expert groups.
// autoReveal(page) makes locator actions reveal a hidden target first (through reveal()), so workflow
// smokes keep exercising the same controls. It patches the shared Locator prototype once per process.
function autoReveal(page){
  const proto=Object.getPrototypeOf(page.locator('body'));if(proto.__autoReveal)return page;proto.__autoReveal=true;
  for(const name of ['click','dblclick','selectOption','fill','check','uncheck','setChecked','press','type','focus','hover','setInputFiles']){
    const original=proto[name];if(typeof original!=='function')continue;
    proto[name]=async function(...args){
      try{if(await this.count()>0&&!await this.first().isVisible()){await reveal(this.page(),this.first());
        // A disclosure summary hidden by a construct tool pane: "click to open" means open its group.
        if(name==='click'&&!await this.first().isVisible()&&await this.first().evaluate(node=>node.tagName==='SUMMARY'&&!!node.parentElement?.matches('details'))){
          await this.first().evaluate(node=>{const group=node.parentElement;window.openConstructTool?.(group,{focus:false});group.open=true;});return;}}}catch{}
      return original.apply(this,args);
    };
  }
  return page;
}

module.exports={autoReveal,reveal,openDisclosure,menuless,installMenuShadow,menuEnabledById,menuEnabledByLabel,clickMenu};
