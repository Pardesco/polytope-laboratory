const fs=require('node:fs');
const path=require('node:path');
const validRect=r=>r&&['x','y','width','height'].every(k=>Number.isSafeInteger(r[k]))&&r.width>0&&r.height>0&&Math.abs(r.x)<1000000&&Math.abs(r.y)<1000000;
function restoreWindowState(saved,displays){
  const areas=displays.map(d=>d.workArea).filter(validRect);if(!areas.length)return {width:1500,height:960,minWidth:1050,minHeight:720,maximized:false};
  const bounds=validRect(saved?.bounds)?saved.bounds:null;
  const overlap=a=>bounds?Math.max(0,Math.min(bounds.x+bounds.width,a.x+a.width)-Math.max(bounds.x,a.x))*Math.max(0,Math.min(bounds.y+bounds.height,a.y+a.height)-Math.max(bounds.y,a.y)):0;
  const area=areas.reduce((best,a)=>overlap(a)>overlap(best)?a:best,areas[0]);
  const minWidth=Math.min(1050,area.width),minHeight=Math.min(720,area.height);
  const width=Math.max(minWidth,Math.min(bounds?.width??1500,area.width)),height=Math.max(minHeight,Math.min(bounds?.height??960,area.height));
  const x=Math.max(area.x,Math.min(bounds?.x??area.x+Math.round((area.width-width)/2),area.x+area.width-width));
  const y=Math.max(area.y,Math.min(bounds?.y??area.y+Math.round((area.height-height)/2),area.y+area.height-height));
  return {x,y,width,height,minWidth,minHeight,maximized:saved?.maximized===true};
}
function createWindowState({file,io=fs}){
  let timer;
  return {
    load(displays){let saved;try{saved=JSON.parse(io.readFileSync(file,'utf8'));}catch{}return restoreWindowState(saved,displays);},
    track(window){
      const save=()=>{clearTimeout(timer);timer=undefined;if(window.isDestroyed()||window.isMinimized()||window.isFullScreen())return;
        const bounds=window.getNormalBounds();if(!validRect(bounds))return;
        try{io.mkdirSync(path.dirname(file),{recursive:true});io.writeFileSync(file+'.tmp',JSON.stringify({bounds,maximized:window.isMaximized()}));io.renameSync(file+'.tmp',file);}catch{}
      };
      const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,300);timer.unref?.();};
      for(const event of ['resize','move','maximize','unmaximize'])window.on(event,schedule);
      window.on('close',save);window.on('closed',()=>clearTimeout(timer));
    }
  };
}
module.exports={restoreWindowState,createWindowState};
