// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
export function studioFace(face,size=32){
  if(!Number.isInteger(face)||face<0||face>5||!Number.isInteger(size)||size<4||size>128)throw Error('Studio faces require a cube side 0..5 and size 4..128.');
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size;
    const softbox=Math.exp(-((u-.32)**2/.018+(v-.28)**2/.12));
    const strip=Math.exp(-((u-.82)**2/.004+(v-.45)**2/.3));
    const sky=face===2?.7:face===3?.05:.15+.16*(1-v);
    const light=Math.min(1,sky+.7*softbox+.45*strip),i=(y*size+x)*4;
    data[i]=Math.round(255*light);data[i+1]=Math.round(255*Math.min(1,light*1.03));data[i+2]=Math.round(255*Math.min(1,light*1.1));data[i+3]=255;
  }
  return data;
}
export function loadProceduralStudio(_urls,onLoad){
  const images=Array.from({length:6},(_,face)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const context=canvas.getContext('2d'),pixels=context.createImageData(32,32);pixels.data.set(studioFace(face));context.putImageData(pixels,0,0);return canvas;
  });
  const texture=new THREE.CubeTexture(images);texture.needsUpdate=true;
  queueMicrotask(()=>onLoad(texture));return texture;
}
