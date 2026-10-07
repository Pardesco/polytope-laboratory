import {NumericEntry} from './numeric-entry.mjs';
const AXES=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],PLANES=['XY','XZ','XW','YZ','YW','ZW'];
const $=id=>document.getElementById(id);

export class ViewportControls {
  constructor(context){
    this.context=context;this.playing=false;this.source=null;this.drag=null;
    const toolbar=document.querySelector('.view-toolbar');
    const select=(id,label,options)=>{
      let node=$(id);if(node)return node;
      node=document.createElement('select');node.id=id;node.setAttribute('aria-label',label);node.title=label;
      for(const [value,text] of options)node.add(new Option(text,value));toolbar.append(node);return node;
    };
    this.camera=select('camera-projection','3D camera projection',[['orthographic','Camera: parallel'],['perspective','Camera: perspective']]);
    this.stereo=select('stereo-mode','Stereoscopic display',[['none','Stereo: off'],['anaglyph','Red/cyan glasses'],['parallel','Parallel stereo'],['cross-eyed','Cross-eyed stereo']]);
    this.stereo.onchange=()=>{if(!this.canEdit())return this.sync();const view=this.view();view.stereoMode=this.stereo.value;if(view.stereoMode!=='none')view.cameraProjection='perspective';this.context.display();this.persistCamera();this.sync();};
    this.orientation=select('view-orientation','View direction',[['free','View: free'],['isometric','Isometric'],['x','Along X'],['y','Along Y'],['z','Along Z']]);
    const settings=$('rotation-controls');
    const row=document.createElement('div');row.className='spin-controls';
    this.plane=document.createElement('select');this.plane.id='auto-rotation-plane';this.plane.setAttribute('aria-label','Auto rotation plane');
    PLANES.forEach((label,i)=>this.plane.add(new Option(label,String(i))));
    this.speed=document.createElement('input');this.speed.id='auto-rotation-speed';this.speed.type='text';this.speed.maxLength=512;this.speed.setAttribute('aria-label','Rotation speed in degrees per second');
    const label=document.createElement('label');label.textContent='Spin ';label.append(this.plane);
    const speedLabel=document.createElement('label');speedLabel.textContent='°/s ';speedLabel.append(this.speed);
    row.append(label,speedLabel);settings.prepend(row);
    const gestureLabel=document.createElement('label');gestureLabel.className='four-dimensional-drag';this.gesture=document.createElement('input');this.gesture.type='checkbox';this.gesture.id='four-dimensional-drag';gestureLabel.append(this.gesture,' Drag in 4D');row.append(gestureLabel);this.gestureLabel=gestureLabel;
    this.camera.onchange=()=>{if(!this.canEdit())return this.sync();this.context.cancelProjectionFit?.();const view=this.view();view.cameraProjection=this.camera.value;if(view.cameraProjection==='orthographic')view.stereoMode='none';this.context.display();this.persistCamera();this.sync();};
    this.orientation.onchange=()=>{if(!this.canEdit())return this.sync();this.context.cancelProjectionFit?.();if(this.orientation.value==='free')return;this.context.base.snap(this.orientation.value);this.persistCamera();};
    $('fit-view').onclick=()=>{if(!this.canEdit())return;this.context.cancelProjectionFit?.();this.context.base.fit();this.persistCamera();};
    $('viewport-layout').onchange=()=>{if(!this.canEdit())return this.sync();this.view().viewportLayout=$('viewport-layout').value;this.sync();this.context.markDirty();};
    $('render-style').onchange=()=>this.setPresentation($('render-style').value);
    $('auto-rotate').onclick=()=>this.toggle();
    $('animate').onclick=()=>this.toggle();$('animate').hidden=true;
    this.plane.onchange=()=>{if(this.canEdit()){this.view().rotationPlane=Number(this.plane.value);this.context.markDirty();}};
    this.speed.onchange=context.guard(()=>this.editSpeed());
    this.gesture.onchange=()=>{if(this.canEdit()){this.view().drag4D=this.gesture.checked;this.context.markDirty();}};
    for(const [id,cls] of [['toggle-library','library-hidden'],['toggle-inspector','inspector-hidden']]){
      $(id).onclick=()=>{document.body.classList.toggle(cls);this.syncSidebars();};
    }
    // Native groups close sibling panels synchronously, including keyboard and
    // programmatic opens. Nested details retain their independent state.
    const panels='.workspace-shelf > details';
    document.querySelectorAll(panels).forEach(item=>item.setAttribute('name','viewport-tools'));
    const closePanels=()=>document.querySelectorAll(panels).forEach(item=>{item.open=false;});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.workspace-shelf'))closePanels();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels();});
    const canvas=this.context.base.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{
      const source=this.context.getState();
      if(event.button!==0||!this.canEdit()||this.context.getModel()?.dimension!==4||!(event.shiftKey||this.view().drag4D))return;
      this.stop();this.context.stopTrack();event.stopImmediatePropagation();event.preventDefault();
      this.drag={source,x:event.clientX,y:event.clientY,angles:[...source.view.angles],enabled:this.context.base.controls.enabled,pointer:event.pointerId};
      this.context.base.controls.enabled=false;canvas.setPointerCapture(event.pointerId);
    },true);
    canvas.addEventListener('pointermove',event=>{
      if(!this.drag||event.pointerId!==this.drag.pointer)return;event.stopImmediatePropagation();event.preventDefault();
      if(this.context.getState()!==this.drag.source){this.endDrag();return;}
      const wrap=value=>((value+180)%360+360)%360-180,view=this.view();view.angles[2]=wrap(this.drag.angles[2]+(event.clientX-this.drag.x)*.35);view.angles[4]=wrap(this.drag.angles[4]-(event.clientY-this.drag.y)*.35);
      this.context.display();this.context.syncPose();
    },true);
    const end=event=>{if(this.drag){event.stopImmediatePropagation();this.endDrag();this.context.markDirty();}};
    canvas.addEventListener('pointerup',end,true);canvas.addEventListener('pointercancel',end,true);
    canvas.addEventListener('lostpointercapture',()=>this.endDrag());
    this.syncSidebars();
  }
  async editSpeed(){
    if(!this.canEdit())throw Error('Finish export before editing rotation speed.');
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current speed edit first.');
    const entry=new NumericEntry({...this.context,getTarget:()=>({text:this.speed.value,speed:this.view()?.rotationSpeed??12})});
    this.numericEntry=entry;
    try{return await entry.run({speed:{text:this.speed.value,min:-180,max:180}},({speed},verify)=>{
      verify();this.view().rotationSpeed=speed;this.speed.value=String(speed);this.context.markDirty();
    });}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  cancelNumeric(){this.numericEntry?.cancel();}
  view(){return this.context.getState()?.view;}
  canEdit(){return !!this.view()&&!this.context.isExporting();}
  endDrag(){if(!this.drag)return;this.context.base.controls.enabled=this.drag.enabled;this.drag=null;}
  persistCamera(){this.view().camera=this.context.base.cameraState();this.context.markDirty();}
  syncSidebars(){for(const [id,cls] of [['toggle-library','library-hidden'],['toggle-inspector','inspector-hidden']])$(id).setAttribute('aria-pressed',String(!document.body.classList.contains(cls)));}
  sync(){
    const source=this.context.getState();if(!source)return;
    if(source!==this.source){this.stop();this.endDrag();this.source=source;this.orientation.value='free';}
    const view=source.view,d=this.context.getModel()?.embeddingDimension||this.context.getModel()?.dimension||3;
    const layout=view.viewportLayout||'single';document.body.dataset.viewportLayout=layout;$('views').dataset.layout=layout;$('viewport-layout').value=layout;
    this.camera.value=view.cameraProjection||'orthographic';$('render-style').value=view.presentation||(!view.faces?'wireframe':view.surfaceOpacity>.6?'solid':'translucent');
    this.stereo.value=view.stereoMode||'none';this.stereo.disabled=this.context.isExporting();
    for(const option of this.plane.options)option.disabled=AXES[Number(option.value)][1]>=d;
    this.plane.value=String(view.rotationPlane??(d===4?2:1));if(!this.numericEntry?.busy&&document.activeElement!==this.speed)this.speed.value=view.rotationSpeed??12;
    this.gesture.checked=!!view.drag4D;this.gestureLabel.hidden=d!==4;
    $('rotation-settings').hidden=d<3;
    $('projection').hidden=d!==4;
    $('auto-rotate').disabled=d<3||this.context.isExporting();
    for(const node of [this.camera,this.orientation,$('fit-view'),$('render-style'),$('viewport-layout'),this.plane,this.speed,this.gesture])node.disabled=this.context.isExporting();
    this.context.base.renderer.domElement.title=d===4?'Drag to orbit the 3D projection. Shift-drag to rotate in XW/YW. Scroll to zoom.':'Drag to orbit. Scroll to zoom.';
    const mode=view.derivedMode,controls=document.querySelector('.section-controls');
    controls.hidden=layout!=='split'||!['section','vertex-figure','cell','face'].includes(mode);
    for(const label of controls.querySelectorAll('label')){const field=label.querySelector('input');label.hidden=mode==='section'?field?.id==='entity-id':field?.id!=='entity-id';}
    $('apply-section').hidden=mode!=='section';$('section-events').hidden=mode!=='section';
    this.syncPlaying();
  }
  syncPlaying(){$('auto-rotate').textContent=this.playing?'Pause rotation':'Rotate';$('auto-rotate').setAttribute('aria-pressed',String(this.playing));}
  stop(){this.playing=false;this.syncPlaying();}
  toggle(){if(!this.canEdit())return;this.context.cancelProjectionFit?.();this.context.stopTrack();this.playing=!this.playing;this.context.markDirty();this.syncPlaying();}
  setPresentation(presentation){
    if(!this.canEdit())return this.sync();
    const view=this.view();view.presentation=presentation;view.faces=presentation!=='wireframe';view.edges=true;view.vertices=false;
    view.surfaceOpacity=presentation==='solid'?1:.22;view.edgeOpacity=presentation==='solid'?.62:.78;
    $('faces-visible').checked=view.faces;$('vertices-visible').checked=view.vertices;$('surface-opacity').value=view.surfaceOpacity;
    this.context.display();this.context.refreshDerived();this.context.markDirty();
  }
  tick(dt){
    if(!this.playing)return false;if(!this.canEdit()){this.stop();return false;}
    const view=this.view(),index=view.rotationPlane??(this.context.getModel()?.dimension===4?2:1),speed=view.rotationSpeed??12;
    view.angles[index]=((view.angles[index]+speed*dt+180)%360+360)%360-180;
    this.context.display();this.context.syncPose();return true;
  }
}
