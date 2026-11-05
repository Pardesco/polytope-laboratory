import * as THREE from 'three';
import {StereoAnaglyph} from './stereo-anaglyph.mjs';

export const STEREO_MODES=Object.freeze(['none','anaglyph','parallel','cross-eyed']);
export function stereoMode(view){return STEREO_MODES.includes(view?.stereoMode)?view.stereoMode:'none';}
export function stereoSettings(view={}){return {
  eyeSeparation:Number.isFinite(view.stereoEyeSeparation)&&view.stereoEyeSeparation>=0&&view.stereoEyeSeparation<=1?view.stereoEyeSeparation:.064,
  convergence:Number.isFinite(view.stereoConvergence)&&view.stereoConvergence>=.01&&view.stereoConvergence<=1000?view.stereoConvergence:5
};}

export class ViewerStereo{
  constructor(renderer){this.renderer=renderer;this.camera=new THREE.StereoCamera();this.size=new THREE.Vector2();}
  eyes(camera,view={},aspect=.5){
    const settings=stereoSettings(view),focus=camera.focus;
    camera.updateMatrixWorld();this.camera.aspect=aspect;this.camera.eyeSep=settings.eyeSeparation;
    try{camera.focus=settings.convergence;this.camera.update(camera);}finally{camera.focus=focus;}
    for(const eye of [this.camera.cameraL,this.camera.cameraR]){eye.near=camera.near;eye.far=camera.far;eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();eye.updateMatrixWorld();}
    return [this.camera.cameraL,this.camera.cameraR];
  }
  render(scene,camera,mode,view={}){
    const renderer=this.renderer;renderer.getSize(this.size);
    const width=this.size.x,height=this.size.y;
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);
    if(mode==='anaglyph'){
      this.anaglyph??=new StereoAnaglyph(renderer);
      if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
      this.anaglyph.render(scene,this.eyes(camera,view,1),width,height);return;
    }
    if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
    const eyes=this.eyes(camera,view);if(mode==='cross-eyed')eyes.reverse();
    const previous=renderer.autoClear;
    try{
      renderer.autoClear=false;renderer.clear();renderer.setScissorTest(true);
      for(let i=0;i<2;i++){
        renderer.setViewport(i*width/2,0,width/2,height);renderer.setScissor(i*width/2,0,width/2,height);
        renderer.render(scene,eyes[i]);
      }
    }finally{renderer.autoClear=previous;renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);}
  }
  pick(camera,mode,x,width,view={}){
    if(mode!=='parallel'&&mode!=='cross-eyed')return {camera,x,width};
    const right=x>=width/2,eyes=this.eyes(camera,view);
    return {camera:eyes[mode==='cross-eyed'?(right?0:1):(right?1:0)],x:x-(right?width/2:0),width:width/2};
  }
  dispose(){this.anaglyph?.dispose();this.anaglyph=null;}
}
