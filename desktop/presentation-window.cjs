function createPresentationWindow({getWindow,hidden=()=>false}){
  let previous=null;
  return enabled=>{
    if(typeof enabled!=='boolean')throw Error('Presentation window state must be boolean.');
    if(hidden())return false;
    const window=getWindow();
    if(enabled){
      if(!previous)previous={fullscreen:window.isFullScreen(),menu:window.isMenuBarVisible(),autoHide:window.isMenuBarAutoHide(),zoom:window.webContents.getZoomFactor()};
      try{window.setAutoHideMenuBar(true);window.setMenuBarVisibility(false);window.setFullScreen(true);}
      catch(error){const saved=previous;previous=null;window.setFullScreen(saved.fullscreen);window.setAutoHideMenuBar(saved.autoHide);window.setMenuBarVisibility(saved.menu);window.webContents.setZoomFactor(saved.zoom);throw error;}
    }else if(previous){const saved=previous;previous=null;window.setFullScreen(saved.fullscreen);window.setAutoHideMenuBar(saved.autoHide);window.setMenuBarVisibility(saved.menu);window.webContents.setZoomFactor(saved.zoom);}
    return enabled;
  };
}
module.exports={createPresentationWindow};
