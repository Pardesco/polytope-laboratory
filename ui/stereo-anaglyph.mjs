import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
export class StereoAnaglyph{
  constructor(renderer){
    this.renderer=renderer;this.left=new THREE.WebGLRenderTarget();this.right=new THREE.WebGLRenderTarget();
    this.material=new THREE.ShaderMaterial({uniforms:{left:{value:this.left.texture},right:{value:this.right.texture},
      colorL:{value:new THREE.Matrix3().fromArray([.4561,-.0400822,-.0152161,.500484,-.0378246,-.0205971,.176381,-.0157589,-.00546856])},
      colorR:{value:new THREE.Matrix3().fromArray([-.0434706,.378476,-.0721527,-.0879388,.73364,-.112961,-.00155529,-.0184503,1.2264])}},
      vertexShader:'varying vec2 uvStereo; void main(){uvStereo=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D left;uniform sampler2D right;uniform mat3 colorL;uniform mat3 colorR;varying vec2 uvStereo;void main(){vec4 l=texture2D(left,uvStereo),r=texture2D(right,uvStereo);gl_FragColor=vec4(clamp(colorL*l.rgb+colorR*r.rgb,0.,1.),max(l.a,r.a));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
    this.quad=new FullScreenQuad(this.material);
  }
  render(scene,eyes,width,height){
    const renderer=this.renderer,target=renderer.getRenderTarget(),ratio=renderer.getPixelRatio();
    if(this.left.width!==width*ratio||this.left.height!==height*ratio){this.left.setSize(width*ratio,height*ratio);this.right.setSize(width*ratio,height*ratio);}
    try{
      for(const [i,buffer] of [this.left,this.right].entries()){renderer.setRenderTarget(buffer);renderer.clear();renderer.render(scene,eyes[i]);}
      renderer.setRenderTarget(target);this.quad.render(renderer);
    }finally{renderer.setRenderTarget(target);}
  }
  dispose(){this.left.dispose();this.right.dispose();this.material.dispose();this.quad.dispose();}
}
