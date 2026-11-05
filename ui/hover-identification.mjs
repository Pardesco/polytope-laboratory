export class HoverGate{
  constructor(interval=100){this.interval=interval;this.last=-Infinity;}
  allow(now,{dragging=false,playing=false,exporting=false}={}){
    if(dragging||playing||exporting){this.last=-Infinity;return false;}
    if(now-this.last<this.interval)return false;this.last=now;return true;
  }
}
export class HoverIdentification{
  constructor({viewer,describe,blocked=()=>false,createElement=tag=>document.createElement(tag),now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){
    this.viewer=viewer;this.describe=describe;this.blocked=blocked;this.gate=new HoverGate();this.dragging=false;this.listeners=[];this.now=now;this.setTimer=setTimer;this.clearTimer=clearTimer;
    const canvas=viewer.renderer.domElement;this.canvas=canvas;this.node=createElement('output');this.node.className='viewport-hover';this.node.hidden=true;viewer.container.append(this.node);
    const listen=(event,fn)=>{canvas.addEventListener(event,fn,true);this.listeners.push([event,fn]);};
    listen('pointerdown',()=>{this.dragging=true;this.hide();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(event,()=>{this.dragging=false;this.hide();});
    listen('pointerleave',()=>this.hide());listen('wheel',()=>this.hide());
    listen('pointermove',event=>{
      if(event.buttons||this.dragging||this.blocked()){this.hide();return;}
      this.pointer={x:event.clientX,y:event.clientY};
      if(this.gate.allow(this.now())){if(this.timer!==undefined)this.clearTimer(this.timer);this.timer=undefined;this.identify();return;}
      this.node.hidden=true;
      if(this.timer===undefined)this.timer=this.setTimer(()=>{this.timer=undefined;if(!this.pointer||this.dragging||this.blocked())return;this.gate.last=this.now();this.identify();},Math.max(0,this.gate.interval-(this.now()-this.gate.last)));
    });
  }
  identify(){
    const {viewer,canvas,pointer}=this,rect=canvas.getBoundingClientRect(),result=viewer.pickAt(pointer.x-rect.left,pointer.y-rect.top,{hover:true});
    const text=result.picked?this.describe(result):'';this.node.textContent=text;this.node.hidden=!text;this.publication=viewer.publishedPickState;this.camera=viewer.cameraState?JSON.stringify(viewer.cameraState()):null;
  }
  hide(){this.node.hidden=true;this.pointer=null;if(this.timer!==undefined)this.clearTimer(this.timer);this.timer=undefined;}
  sync(){if(this.blocked()||this.publication!==this.viewer.publishedPickState||this.camera!==(this.viewer.cameraState?JSON.stringify(this.viewer.cameraState()):null))this.hide();}
  destroy(){this.hide();for(const [event,fn] of this.listeners)this.canvas.removeEventListener(event,fn,true);this.node.remove();}
}
