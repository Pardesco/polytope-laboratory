// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import {ViewerStereo} from './viewer-stereo.mjs';
import {mediaExportOptions,mediaDimensions} from './media-export-options.mjs';
export function pngCaptureOptions({transparent=false,scale=1,...target}={}){
  if(typeof transparent!=='boolean'||![1,2,4].includes(scale))throw Error('PNG options require a transparent flag and scale 1, 2 or 4.');
  if(Object.keys(target).length){const o=mediaExportOptions({...target,format:'png'});return {transparent,scale,size:o.size,framing:o.framing,margin:o.margin,supersample:o.supersample};}
  return {transparent,scale};
}
export function captureViewerPNG(viewer,value={}){
  const options=pngCaptureOptions(value),renderer=viewer.renderer;
  if(viewer.createExportSurface){
    const size=mediaDimensions(renderer.domElement.width,renderer.domElement.height,{...options,format:'png'});
    const surface=viewer.createExportSurface({...options,width:size.width*options.scale,height:size.height*options.scale,onDiagnostic:message=>viewer.onCaptureDiagnostic?.(message)});
    try{surface.copy();return surface.canvas.toDataURL('image/png');}finally{surface.dispose();}
  }
  if(!options.transparent&&options.scale===1){viewer.draw();return renderer.domElement.toDataURL('image/png');}
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),alpha=renderer.getClearAlpha(),color=renderer.getClearColor(new THREE.Color()).clone(),background=viewer.scene.background;
  const width=Math.floor(size.x*ratio*options.scale),height=Math.floor(size.y*ratio*options.scale);
  const limit=renderer.capabilities?.maxTextureSize??8192;
  if(width>limit||height>limit||width*height>32*1024*1024)throw Error('PNG scale exceeds the graphics limit or 32 megapixel capture bound. Choose a smaller scale.');
  if(viewer.view?.stereoMode==='anaglyph')throw Error('Transparent or scaled PNG capture is unavailable for anaglyph. Choose a single or side-by-side view.');
  try{
    renderer.setPixelRatio(ratio*options.scale);renderer.setSize(size.x,size.y,false);
    if(options.transparent){viewer.scene.background=null;renderer.setClearColor(color,0);}
    // Retain the prepared geometry and camera; drawing must not request a new worker pose.
    const mode=viewer.view?.stereoMode;
    if(mode==='parallel'||mode==='cross-eyed')(viewer.stereoRenderer??=new ViewerStereo(renderer)).render(viewer.scene,viewer.camera,mode,viewer.view);
    else renderer.render(viewer.scene,viewer.camera);
    return renderer.domElement.toDataURL('image/png');
  }finally{
    renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.setClearColor(color,alpha);viewer.scene.background=background;
    const mode=viewer.view?.stereoMode;
    if(mode==='parallel'||mode==='cross-eyed')(viewer.stereoRenderer??=new ViewerStereo(renderer)).render(viewer.scene,viewer.camera,mode,viewer.view);
    else renderer.render(viewer.scene,viewer.camera);
  }
}
