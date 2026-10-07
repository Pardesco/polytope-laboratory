import * as THREE from 'three';
import {AnaglyphEffect} from 'three/addons/effects/AnaglyphEffect.js';

export const STEREO_MODES=Object.freeze(['none','anaglyph','parallel','cross-eyed']);
export function stereoMode(view){return STEREO_MODES.includes(view?.stereoMode)?view.stereoMode:'none';}

export class ViewerStereo{
  constructor(renderer){this.renderer=renderer;this.camera=new THREE.StereoCamera();this.size=new THREE.Vector2();}
  eyes(camera){
    camera.updateMatrixWorld();this.camera.aspect=.5;this.camera.update(camera);
    for(const eye of [this.camera.cameraL,this.camera.cameraR]){eye.near=camera.near;eye.far=camera.far;eye.updateMatrixWorld();}
    return [this.camera.cameraL,this.camera.cameraR];
  }
  render(scene,camera,mode){
    const renderer=this.renderer;renderer.getSize(this.size);
    const width=this.size.x,height=this.size.y;
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);
    if(mode==='anaglyph'){
      this.anaglyph??=new AnaglyphEffect(renderer);
      if(this.width!==width||this.height!==height){this.anaglyph.setSize(width,height);this.width=width;this.height=height;}
      this.anaglyph.render(scene,camera);return;
    }
    if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();
    const eyes=this.eyes(camera);if(mode==='cross-eyed')eyes.reverse();
    const previous=renderer.autoClear;
    try{
      renderer.autoClear=false;renderer.clear();renderer.setScissorTest(true);
      for(let i=0;i<2;i++){
        renderer.setViewport(i*width/2,0,width/2,height);renderer.setScissor(i*width/2,0,width/2,height);
        renderer.render(scene,eyes[i]);
      }
    }finally{renderer.autoClear=previous;renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);}
  }
  pick(camera,mode,x,width){
    if(mode!=='parallel'&&mode!=='cross-eyed')return {camera,x,width};
    const right=x>=width/2,eyes=this.eyes(camera);
    return {camera:eyes[mode==='cross-eyed'?(right?0:1):(right?1:0)],x:x-(right?width/2:0),width:width/2};
  }
  dispose(){this.anaglyph?.dispose();this.anaglyph=null;}
}
