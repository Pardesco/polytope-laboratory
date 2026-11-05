export function holdExportPreview(viewers){
  const overlays=[];
  try{
    for(const viewer of new Set(viewers.filter(Boolean))){
      const source=viewer.renderer?.domElement,doc=source?.ownerDocument;if(!source?.isConnected||!doc)continue;
      const rect=source.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      const overlay=doc.createElement('div'),still=doc.createElement('canvas'),label=doc.createElement('span');
      still.width=source.width;still.height=source.height;still.getContext('2d').drawImage(source,0,0);
      Object.assign(overlay.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',zIndex:'100',pointerEvents:'none',overflow:'hidden',background:'#15191f'});
      Object.assign(still.style,{width:'100%',height:'100%'});label.textContent='Rendering export…';
      Object.assign(label.style,{position:'absolute',left:'12px',top:'12px',padding:'6px 10px',background:'#15191fee',color:'#eef2f8',borderRadius:'4px'});
      overlay.append(still,label);doc.body.append(overlay);overlays.push(overlay);
    }
  }catch(error){for(const overlay of overlays)overlay.remove();throw error;}
  return {release(){for(const overlay of overlays)overlay.remove();overlays.length=0;}};
}
