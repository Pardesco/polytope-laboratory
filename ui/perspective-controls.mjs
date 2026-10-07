import {perspective4DSettings} from './perspective4d.mjs';
import {NumericEntry} from './numeric-entry.mjs';

export class PerspectiveControls {
  constructor(context){
    this.context=context;
    const panel=document.createElement('div');panel.id='perspective4d-controls';panel.title='Distances use the normalized 4D source radius. The eye is on +W; near depth clips before projection.';
    panel.innerHTML='<label>4D eye distance <input id="perspective-distance-4d" type="text" maxlength="512" value="3"></label><label>4D near depth <input id="perspective-near-4d" type="text" maxlength="512" value="0.08"></label>';
    document.getElementById('rotation-controls').append(panel);this.panel=panel;
    panel.querySelectorAll('input').forEach(input=>input.onchange=context.guard(()=>this.edit()));
    this.distance=panel.querySelector('#perspective-distance-4d');this.near=panel.querySelector('#perspective-near-4d');
  }
  async edit(){
    if(this.numericEntry?.busy)throw Error('Finish or cancel the current projection edit first.');
    const source=this.context.getState();if(source?.model.dimension!==4)throw Error('Open a 4D model before changing projection.');
    const target=()=>({distance:this.distance.value,near:this.near.value,
      sourceDistance:this.context.getState()?.view.perspectiveDistance4D??3,
      sourceNear:this.context.getState()?.view.perspectiveNear4D??.08});
    const entry=new NumericEntry({...this.context,getTarget:target});this.numericEntry=entry;
    try{return await entry.run({distance:{text:this.distance.value,min:0,max:100,exclusiveMin:true},
      near:{text:this.near.value,min:0,exclusiveMin:true}},({distance,near},verify)=>{
      verify();Object.assign(this.context.getState().view,{perspectiveDistance4D:distance,perspectiveNear4D:near});
      this.distance.value=String(distance);this.near.value=String(near);
      this.context.display();this.context.markDirty();
    },{validate:perspective4DSettings});}finally{if(this.numericEntry===entry)this.numericEntry=null;}
  }
  cancelNumeric(){this.numericEntry?.cancel();}
  sync(){
    const source=this.context.getState();this.panel.hidden=!source||source.model.dimension!==4||source.view.projection!=='perspective';
    if(!source)return;
    if(!this.numericEntry?.busy){
      if(document.activeElement!==this.distance)this.distance.value=String(source.view.perspectiveDistance4D??3);
      if(document.activeElement!==this.near)this.near.value=String(source.view.perspectiveNear4D??.08);
    }
    this.distance.disabled=this.near.disabled=this.context.isExporting();
    this.near.max=String(source.view.perspectiveDistance4D??3);
  }
}
