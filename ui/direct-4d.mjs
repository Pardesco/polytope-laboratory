import {PLANES,rotate} from './projection.js';
import {holdObservationControls} from './observation-controls.mjs';
import {canvasOverlays} from './canvas-overlays.mjs';

const RAD=Math.PI/180,DEFAULT=[0,0,24,0,18,0],ZERO=()=>[0,0,0];
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const wrap=x=>((x+180)%360+360)%360-180;
export const rotationMatrix=angles=>[0,1,2,3].map(i=>rotate([0,1,2,3].map(j=>Number(i===j)),angles)).reduce((rows,column,i)=>{column.forEach((x,j)=>rows[j][i]=x);return rows;},Array.from({length:4},()=>Array(4).fill(0)));

// Undo the renderer's six Givens rotations on the right, in its own order.
export function matrixAngles(matrix){
  const m=matrix.map(row=>[...row]),angles=[];
  for(const [i,j] of PLANES){
    const a=Math.hypot(m[i][i],m[i][j])<1e-12?0:Math.atan2(-m[i][j],m[i][i]),c=Math.cos(a),s=Math.sin(a);
    angles.push(wrap(a/RAD));
    for(const row of m){const x=row[i],y=row[j];row[i]=c*x-s*y;row[j]=s*x+c*y;}
  }
  return angles;
}

export function screenDrag(dx,dy,right=[1,0,0],up=[0,1,0],sensitivity=.35){
  return right.map((x,i)=>(x*dx-up[i]*dy)*sensitivity);
}

// A proper rotation of the screen direction toward W, composed after the saved pose.
export function turn4D(angles,delta){
  const length=Math.hypot(...delta);if(!length)return [...angles];
  const n=delta.map(x=>x/length),c=Math.cos(length*RAD),s=Math.sin(length*RAD),m=rotationMatrix(angles);
  const result=Array.from({length:4},()=>Array(4));
  for(let column=0;column<4;column++){
    const spatial=m.slice(0,3).map(row=>row[column]),along=dot(n,spatial),w=m[3][column];
    for(let i=0;i<3;i++)result[i][column]=spatial[i]+n[i]*((c-1)*along-s*w);
    result[3][column]=s*along+c*w;
  }
  return matrixAngles(result);
}

export const TUMBLE=Object.freeze({minSpeed:12,maxSpeed:90});
export function dampMotion(velocity,dt,damping=9){
  dt=Math.max(0,Math.min(.1,dt));const decay=Math.exp(-damping*dt);
  return {delta:velocity.map(x=>x*(1-decay)/damping),velocity:velocity.map(x=>x*decay)};
}

export function hintSession(storage){
  try{
    if(storage?.getItem('polytope.direct4d.hint-dismissed')==='1')return false;
    const count=Math.max(0,Number(storage?.getItem('polytope.direct4d.sessions'))||0);
    storage?.setItem('polytope.direct4d.sessions',String(Math.min(count+1,4)));return count<3;
  }catch{return true;}
}

export class Direct4D {
  constructor(context,owner){
    this.context=context;this.owner=owner;this.pending=ZERO();this.velocity=ZERO();this.visible=true;
    try{this.storage=context.storage??globalThis.localStorage;this.visible=this.storage?.getItem('polytope.direct4d.gizmo')!=='0';}catch{}
    const create=tag=>document.createElement(tag),host=context.base.container.parentElement;
    this.overlays=context.overlays??canvasOverlays(document,host);
    this.gizmo=create('div');this.gizmo.id='direct-4d-gizmo';this.gizmo.className='direct-4d-gizmo';this.gizmo.hidden=true;this.gizmo.setAttribute('role','group');this.gizmo.setAttribute('aria-label','Turn in four dimensions');
    const heading=create('span');heading.className='direct-4d-heading';heading.textContent='4D turn';
    this.pads=[2,4,5].map((index,axis)=>{
      const pad=create('button'),name=PLANES[index][2];pad.type='button';pad.id='direct-4d-'+name.toLowerCase();pad.className='direct-4d-pad';pad.textContent=name;pad.title=`Drag to turn in ${name}. Arrow keys turn by 2 degrees.`;
      pad.addEventListener('pointerdown',event=>{if(event.button===0&&this.available())this.begin(event,pad,axis);});
      pad.addEventListener('pointermove',event=>this.move(event));
      pad.addEventListener('pointerup',event=>this.finish(event));
      pad.addEventListener('pointercancel',()=>this.cancel());pad.addEventListener('lostpointercapture',()=>{if(owner.drag?.canvas===pad)this.cancel();});
      pad.addEventListener('keydown',event=>{
        const sign={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[event.key];if(!sign||!this.available())return;
        event.preventDefault();this.keyTurn(axis,sign*(event.shiftKey?10:2));
      });
      pad.addEventListener('click',event=>{if(event.detail===0&&this.available())this.keyTurn(axis,5);});return pad;
    });
    this.straighten=create('button');this.straighten.type='button';this.straighten.id='direct-4d-straighten';this.straighten.textContent='Straighten';this.straighten.title='Return to the default 4D orientation';this.straighten.addEventListener('click',()=>this.reset());
    this.gizmo.append(heading,...this.pads,this.straighten);host.append(this.gizmo);
    this.hint=create('div');this.hint.id='direct-4d-hint';this.hint.className='direct-4d-hint';this.hint.hidden=true;
    const message=create('span');message.textContent='Shift-drag to turn in 4D · let go while moving to keep it tumbling';
    const close=create('button');close.type='button';close.id='direct-4d-dismiss-hint';close.textContent='×';close.setAttribute('aria-label','Dismiss 4D gesture hint');
    close.addEventListener('click',()=>{this.overlays?.dismiss('direct4d');this.showHint=false;this.hint.hidden=true;try{this.storage?.setItem('polytope.direct4d.hint-dismissed','1');}catch{}});this.hint.append(message,close);host.append(this.hint);
    const label=create('label');label.className='direct-4d-visibility';this.checkbox=create('input');this.checkbox.type='checkbox';this.checkbox.id='direct-4d-visible';this.checkbox.checked=this.visible;
    label.append(this.checkbox,' Show 4D turn controls');document.getElementById('rotation-controls').prepend(label);this.visibilityLabel=label;
    this.checkbox.addEventListener('change',()=>this.setVisible(this.checkbox.checked));
    const canvas=context.base.renderer.domElement;
    canvas.addEventListener('wheel',event=>this.wheel(event),{capture:true,passive:false});
    canvas.addEventListener('pointerdown',event=>{if(!owner.drag&&!(event.shiftKey||owner.view()?.drag4D)&&!this.tumbling)this.cancel();},true);
    globalThis.addEventListener?.('blur',()=>this.cancel());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')this.cancel();});
  }
  available(){return this.context.getModel()?.dimension===4&&this.owner.canEdit();}
  bindSource(){this.source=this.context.getState();this.sourceModel=this.context.getModel();this.sourceView=this.source.view;this.expected=[...this.sourceView.angles];}
  current(){return this.available()&&this.context.getState()===this.source&&this.context.getModel()===this.sourceModel&&this.source.view===this.sourceView&&this.sourceView.angles.every((x,i)=>x===this.expected[i]);}
  prepare(){this.owner.stop();this.context.stopTrack?.();this.context.cancelProjectionFit?.();this.bindSource();this.notified=false;}
  begin(event,canvas,axis=null){
    if(!this.available()||this.owner.drag)return;
    this.prepare();event.stopImmediatePropagation();event.preventDefault();
    this.context.base.down=null;this.context.base.pickDragged=true;
    const drag={source:this.source,x:event.clientX,y:event.clientY,time:event.timeStamp,axis,canvas,pointer:event.pointerId,observation:holdObservationControls([this.context.base])};this.owner.drag=drag;
    try{canvas.setPointerCapture(event.pointerId);}catch{this.cancel();}
  }
  move(event){
    const drag=this.owner.drag;if(!drag||event.pointerId!==drag.pointer)return;
    event.stopImmediatePropagation();event.preventDefault();if(!this.current()){this.cancel();return;}
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    let delta;
    if(drag.axis!==null){delta=ZERO();delta[drag.axis]=(dx-dy)*.35;}
    else{
      const camera=this.context.base.camera;camera.updateMatrixWorld();const m=camera.matrixWorld.elements;
      delta=screenDrag(dx,dy,[m[0],m[1],m[2]],[m[4],m[5],m[6]]);
    }
    this.pending=this.pending.map((x,i)=>x+delta[i]);
    const dt=Math.max(.008,Math.min(.1,(event.timeStamp-drag.time)/1000||.016)),speed=delta.map(x=>x/dt),scale=Math.min(1,240/(Math.hypot(...speed)||1));this.velocity=speed.map(x=>x*scale);
    drag.x=event.clientX;drag.y=event.clientY;drag.time=event.timeStamp;
  }
  finish(event){
    const drag=this.owner.drag;if(!drag||event.pointerId!==drag.pointer)return;
    event.stopImmediatePropagation();event.preventDefault();
    if(event.type==='pointercancel'||!this.current()){this.cancel();return;}
    if(event.timeStamp-drag.time>100)this.velocity=ZERO();this.owner.endDrag();
    // Released while moving: keep tumbling at that speed (capped) until a still Shift-click, Esc, Straighten or another turn.
    const speed=Math.hypot(...this.velocity);this.tumbling=speed>=TUMBLE.minSpeed;if(this.tumbling&&speed>TUMBLE.maxSpeed)this.velocity=this.velocity.map(x=>x*TUMBLE.maxSpeed/speed);
  }
  wheel(event){
    if(!event.shiftKey||!this.available()||this.owner.drag)return;
    event.stopImmediatePropagation();event.preventDefault();
    if(!this.active)this.notified=false;
    if(!this.current())this.prepare();else{this.owner.playing=false;this.owner.syncPlaying();this.context.stopTrack?.();this.context.cancelProjectionFit?.();}
    this.tumbling=false;this.velocity=ZERO();this.returning=null;this.demo=null;this.gizmo.classList?.remove('direct-4d-demo');
    const scale=event.deltaMode===1?16:event.deltaMode===2?this.context.base.renderer.domElement.clientHeight:1;
    this.pending[2]+=Math.max(-120,Math.min(120,(event.deltaY||event.deltaX)*scale))*.12;
  }
  keyTurn(axis,degrees){this.prepare();this.pending[axis]=degrees;}
  demoTurn(){
    if(!this.available())return;this.prepare();this.setVisible(true);this.owner.frameModel?.();
    this.gizmo.classList?.add('direct-4d-demo');
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){this.gizmo.focus?.();this.gizmo.classList?.remove('direct-4d-demo');this.pads[0]?.focus?.();return;}
    this.demo={from:[...this.source.view.angles],time:0};
  }
  reset(){
    if(!this.available())return;this.prepare();
    this.returning={from:[...this.source.view.angles],time:0};
  }
  cancel(){this.tumbling=false;this.pending=ZERO();this.velocity=ZERO();this.returning=null;this.demo=null;this.gizmo.classList?.remove('direct-4d-demo');this.owner.endDrag();}
  get active(){return !!(this.owner.drag||this.returning||this.demo||this.pending.some(Boolean)||this.velocity.some(Boolean));}
  tick(dt){
    if(!this.active)return false;
    if(!this.current()){this.cancel();return false;}
    let angles;
    if(this.demo){
      const demo=this.demo;demo.time+=Math.max(0,Math.min(dt,.1));const t=Math.min(1,demo.time/1.4);
      angles=t===1?[...demo.from]:turn4D(demo.from,[18*Math.sin(Math.PI*t),8*Math.sin(Math.PI*t),0]);
      if(t===1){this.demo=null;this.gizmo.classList?.remove('direct-4d-demo');}
    }else if(this.returning){
      const r=this.returning;r.time+=Math.max(0,Math.min(dt,.1));const t=Math.min(1,r.time/.45),ease=t*t*(3-2*t);
      angles=r.from.map((x,i)=>wrap(x+wrap(DEFAULT[i]-x)*ease));if(t===1){angles=[...DEFAULT];this.returning=null;}
    }else{
      const delta=this.pending;this.pending=ZERO();
      if(!this.owner.drag&&this.tumbling){const step=Math.max(0,Math.min(dt,.1));delta.forEach((_,i)=>delta[i]+=this.velocity[i]*step);}
      else if(!this.owner.drag){const damped=dampMotion(this.velocity,dt);delta.forEach((_,i)=>delta[i]+=damped.delta[i]);this.velocity=Math.hypot(...damped.velocity)<.5?ZERO():damped.velocity;}
      if(!delta.some(Boolean))return false;angles=turn4D(this.source.view.angles,delta);
    }
    this.source.view.angles.splice(0,6,...angles);this.expected=[...angles];
    (this.context.displayPose||this.context.display)();this.context.syncPose();this.refreshPads();
    // The app frame records every tick; invalidate previews once per gesture.
    if(!this.notified){this.notified=true;(this.context.markPoseDirty||this.context.markDirty)();}return true;
  }
  refreshPads(){this.pads.forEach((pad,i)=>{const angle=this.owner.view()?.angles[[2,4,5][i]]??0;pad.style.setProperty('--turn',angle+'deg');pad.setAttribute('aria-label',`${pad.textContent}: ${angle.toFixed(1)} degrees. Drag or use arrow keys to turn.`);});}
  setVisible(visible){this.visible=!!visible;this.checkbox.checked=this.visible;try{this.storage?.setItem('polytope.direct4d.gizmo',this.visible?'1':'0');}catch{}this.sync();this.overlays?.context.refitOverlay?.();}
  sync(){
    const four=this.context.getModel()?.dimension===4;
    if(!four||this.active&&!this.current())this.cancel();
    if(four&&this.showHint===undefined)this.showHint=hintSession(this.storage);
    this.gizmo.hidden=!four||!this.visible;
    if(this.overlays){
      if(four&&this.showHint&&!this.hintQueued){this.hintQueued=true;this.overlays.enqueue('direct4d',this.hint,{priority:5,onDismiss:()=>{this.showHint=false;}});}
      this.overlays.eligible('direct4d',four&&this.showHint);
    }else this.hint.hidden=!four||!this.showHint;
    this.visibilityLabel.hidden=!four;this.checkbox.disabled=!this.owner.canEdit();
    for(const node of [...this.pads,this.straighten])node.disabled=!this.available();this.refreshPads();
  }
}
