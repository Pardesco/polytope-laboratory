// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
export function radialBackground(options){
  const start=parseInt(options.background.slice(1),16),end=parseInt(options.backgroundBottom.slice(1),16),size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const t=Math.min(1,Math.hypot(x/(size-1)-.48,y/(size-1)-.58)/.78),offset=(y*size+x)*4;
    for(let c=0;c<3;c++){const shift=(2-c)*8,a=start>>shift&255,b=end>>shift&255;data[offset+c]=Math.round(a+(b-a)*t);}
    data[offset+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
export function radialPaint(context,width,height,options){
  context.save();context.scale(width,height);
  const gradient=context.createRadialGradient(.48,.42,0,.48,.42,.78);
  gradient.addColorStop(0,options.background);gradient.addColorStop(1,options.backgroundBottom);
  context.restore();return gradient;
}
