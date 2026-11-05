import * as THREE from 'three';
import {rotate} from './projection.js';
import {resolveDisplayFrame} from './display-frame.mjs';
import {captureNativeSource,verifyNativeSource} from './native-source-binding.mjs';
import {holdObservationControls} from './observation-controls.mjs';
const eye=()=>Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>+(i===j)));
const multiply=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((sum,x,k)=>sum+x*b[k][j],0)));
const transpose=a=>a[0].map((_,j)=>a.map(row=>row[j]));
export function rotationPath(start,target){
  const reduced=multiply(target,transpose(start)),steps=[];
  for(let j=0;j<3;j++)for(let i=j+1;i<4;i++){
    const a=reduced[j][j],b=reduced[i][j],r=Math.hypot(a,b);if(r<1e-14)continue;
    const angle=Math.atan2(-b,a),c=Math.cos(angle),s=Math.sin(angle),x=[...reduced[j]],y=[...reduced[i]];
    reduced[j]=x.map((v,k)=>c*v-s*y[k]);reduced[i]=x.map((v,k)=>s*v+c*y[k]);steps.push([j,i,-angle]);
  }
  return t=>{if(t===1)return target.map(row=>[...row]);let matrix=start.map(row=>[...row]);for(const [i,j,a] of [...steps].reverse()){const c=Math.cos(a*t),s=Math.sin(a*t),x=[...matrix[i]],y=[...matrix[j]];matrix[i]=x.map((v,k)=>c*v-s*y[k]);matrix[j]=x.map((v,k)=>s*v+c*y[k]);}return matrix;};
}
export class SymmetryOrientationControls{
  constructor(context){
    this.context=context;this.sequence=0;
    this.root=document.createElement('details');this.root.id='symmetry-orientation-settings';this.root.className='inspector-group';
    this.root.innerHTML='<summary>Orient to symmetry axis</summary><button id="symmetry-directions-list">List symmetry directions</button><label>Direction <select id="symmetry-direction"><option value="greatest">Greatest symmetry (automatic)</option></select></label><button id="symmetry-direction-apply">Orient to symmetry axis</button><output id="symmetry-direction-result" aria-live="polite"></output>';
    document.getElementById('entity-orientation-controls').after(this.root);
    this.node('list').onclick=context.guard(()=>this.load());this.node('apply').onclick=context.guard(()=>this.apply());this.sync();
  }
  node(key){return this.root.querySelector('#'+({list:'symmetry-directions-list',apply:'symmetry-direction-apply',choice:'symmetry-direction',result:'symmetry-direction-result'}[key]));}
  sync(){const source=this.context.getState();if(this.source!==source){this.cancel();this.source=source;this.node('choice').replaceChildren(new Option('Greatest symmetry (automatic)','greatest'));this.node('result').textContent='';}for(const key of ['list','apply','choice'])this.node(key).disabled=!source||this.busy||this.context.isExporting();}
  cancel(){this.sequence++;this.controller?.abort();}
  cancelNumeric(){this.cancel();}
  async request(choice,action){
    this.cancel();const seq=this.sequence,owner=captureNativeSource(this.context),controller=new AbortController();this.controller=controller;this.busy=true;this.sync();
    const verify=()=>{if(seq!==this.sequence||controller.signal.aborted)throw Object.assign(Error('Symmetry orientation canceled.'),{name:'AbortError'});verifyNativeSource(this.context,owner);};
    try{const result=await this.context.run('symmetry-orientation',choice===undefined?{}:{choice},JSON.parse(owner.modelSignature),'Find symmetry directions',{signal:controller.signal});verify();await action(result,verify);verify();return result;}
    finally{if(this.controller===controller){this.controller=null;this.busy=false;this.sync();}}
  }
  async load(){return this.request(undefined,result=>{this.node('choice').replaceChildren(new Option('Greatest symmetry (automatic)','greatest'),...result.choices.map(c=>new Option(c.label,c.id)));this.node('result').textContent=`Numerical group order ${result.groupOrder}; axis residual ${result.maximumAxisResidual.toExponential(2)}. ${result.definition}`;});}
  async apply(){
    if(this.busy||this.context.isExporting())throw Error('Finish the current operation before orienting.');
    this.context.stop();
    return this.request(this.node('choice').value,async(result,verify)=>{
      const state=this.context.getState(),sourceModel=state.model,viewer=this.context.viewer,view=state.view,viewKey=JSON.stringify(view);
      const current=()=>{verify();if(JSON.stringify(view)!==viewKey)throw Error('Display settings changed during orientation.');};
      const observation=holdObservationControls([viewer]);let from;
      try{
      from=viewer.cameraState();const cameraKey=JSON.stringify(from);let pose,path;
      if(result.frame){
        const frame=resolveDisplayFrame(state.model,view.orientationFrame),matrix=frame.matrix??eye();
        const rotation=transpose(eye().map(row=>rotate(row,view.angles??[])));path=rotationPath(multiply(rotation,matrix),result.frame.matrix);
        pose=t=>viewer.setDisplay({...view,angles:Array(6).fill(0),orientationFrame:{...result.frame,matrix:path(t)}});
      }else{
        const direction=new THREE.Vector3(...rotate(result.selected.direction,view.angles??[])).normalize(),origin=new THREE.Vector3(...from.target),offset=new THREE.Vector3(...from.position).sub(origin),up=new THREE.Vector3(...from.up),turn=new THREE.Quaternion().setFromUnitVectors(offset.clone().normalize(),direction);
        pose=t=>{const q=new THREE.Quaternion().slerp(turn,t);viewer.restoreCamera({...from,position:offset.clone().applyQuaternion(q).add(origin).toArray(),up:up.clone().applyQuaternion(q).toArray()});};
      }
        const duration=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:450,begin=performance.now();await new Promise((resolve,reject)=>{const step=now=>{try{current();if(result.frame&&JSON.stringify(viewer.cameraState())!==cameraKey)throw Error('Observer camera changed during orientation.');const t=duration===0?1:Math.min(1,(now-begin)/duration),u=t*t*(3-2*t);pose(u);viewer.draw();if(t===1)resolve();else requestAnimationFrame(step);}catch(error){reject(error);}};requestAnimationFrame(step);});
        current();if(result.frame){view.orientationFrame=result.frame;view.angles=Array(6).fill(0);}else view.camera=viewer.cameraState();
        this.context.markDirty();this.context.display();this.context.syncPose?.();this.node('result').textContent=`${result.selected.label}; numerical axis residual ${result.maximumAxisResidual.toExponential(2)}. ${result.definition}`;
      }catch(error){if(from&&this.context.getState()===state&&viewer.model===sourceModel){if(result.frame)this.context.display();else viewer.restoreCamera(from);}throw error;}
      finally{observation.release();}
    });
  }
}
