const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('polytope',{
  engine:(request,id)=>ipcRenderer.invoke('engine',request,id),
  cancel:id=>ipcRenderer.invoke('cancel',id),
  open:()=>ipcRenderer.invoke('open'), save:project=>ipcRenderer.invoke('save',project),
  autosave:project=>ipcRenderer.invoke('autosave',project), recover:()=>ipcRenderer.invoke('recover'),
  recoveryInfo:()=>ipcRenderer.invoke('recovery-info'), setDirty:value=>ipcRenderer.invoke('dirty',value),
  importTour:()=>ipcRenderer.invoke('import-tour'),exportTour:tour=>ipcRenderer.invoke('export-tour',tour),
  export:(model,format)=>ipcRenderer.invoke('export',model,format),
  saveImage:data=>ipcRenderer.invoke('save-image',data),saveSvg:(svg,name)=>ipcRenderer.invoke('save-svg',svg,name),
  library:()=>ipcRenderer.invoke('library'),libraries:()=>ipcRenderer.invoke('libraries'),unlinkLibrary:path=>ipcRenderer.invoke('unlink-library',path),libraryModel:path=>ipcRenderer.invoke('library-model',path),
  attachLibraryAudit:path=>ipcRenderer.invoke('attach-library-audit',path),verifyLibraryAudit:path=>ipcRenderer.invoke('verify-library-audit',path),repairLibraryCopy:path=>ipcRenderer.invoke('repair-library-copy',path),
  animationBegin:options=>ipcRenderer.invoke('animation-begin',options),animationWrite:(id,index,data)=>ipcRenderer.invoke('animation-write',id,index,data),animationFinish:id=>ipcRenderer.invoke('animation-finish',id),animationAbort:id=>ipcRenderer.invoke('animation-abort',id),
  print:svg=>ipcRenderer.invoke('print',svg),saveNetPdf:svg=>ipcRenderer.invoke('save-net-pdf',svg),fullscreen:()=>ipcRenderer.invoke('fullscreen'),
  savePackedNetPdf:pages=>ipcRenderer.invoke('save-packed-net-pdf',pages),printPackedNets:pages=>ipcRenderer.invoke('print-packed-nets',pages),
  renderPackedNetPdf:pages=>ipcRenderer.invoke('render-packed-net-pdf',pages),
  beginTextExport:params=>ipcRenderer.invoke('text-export-begin',params),
  writeTextExport:(id,data)=>ipcRenderer.invoke('text-export-write',id,data),
  abortTextExport:id=>ipcRenderer.invoke('text-export-abort',id),
  onAction:callback=>{const listener=(_,name)=>callback(name);ipcRenderer.on('menu-action',listener);return ()=>ipcRenderer.removeListener('menu-action',listener);}
});
