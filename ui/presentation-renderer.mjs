import {presentationCaptionAt} from './presentation.mjs';

function fitText(ctx,text,width){
  if(ctx.measureText(text).width<=width)return text;
  let low=0,high=text.length;
  while(low<high){const mid=Math.ceil((low+high)/2);if(ctx.measureText(text.slice(0,mid)+'…').width<=width)low=mid;else high=mid-1;}
  return text.slice(0,low)+'…';
}
export function drawPresentationCaption(canvas,{caption,opacity}){
  if(!caption||opacity<=0)return;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=Math.max(.35,Math.min(w/1280,h/720)),pad=48*scale;
  ctx.save();
  try{
    ctx.globalAlpha=opacity;ctx.globalCompositeOperation='source-over';
    const gradient=ctx.createLinearGradient(0,h-240*scale,0,h);gradient.addColorStop(0,'#0000');gradient.addColorStop(1,'#000d');ctx.fillStyle=gradient;ctx.fillRect(0,h-240*scale,w,240*scale);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.shadowColor='#0009';ctx.shadowBlur=4*scale;
    for(const [text,size,y,color] of [[caption.title,38,h-112*scale,'#fff'],[caption.description,20,h-76*scale,'#edf0f5'],[caption.facts,16,h-42*scale,'#c6d4e2']]){
      ctx.font=`${size===38?'600':'400'} ${size*scale}px system-ui, sans-serif`;ctx.fillStyle=color;ctx.fillText(fitText(ctx,text,w-pad*2),pad,y);
    }
  }finally{ctx.restore();}
}
export class PresentationRenderer{
  constructor(renderer,captions,{visible=()=>true,draw=drawPresentationCaption}={}){Object.assign(this,{renderer,captions,visible,draw});}
  get timeline(){return this.renderer.timeline;}
  get canvas(){return this.renderer.canvas;}
  get published(){return this.renderer.published;}
  ownerCurrent(){return this.renderer.ownerCurrent();}
  current(p){return this.renderer.current(p);}
  async apply(time,options){const p=await this.renderer.apply(time,options);if(this.visible()&&this.current(p))this.draw(this.canvas,presentationCaptionAt(this.timeline,time,this.captions));return p;}
  image(p){if(!this.current(p))throw Error('Presentation frame is stale.');return this.canvas.toDataURL('image/png');}
  createExportRenderer(options){return new PresentationRenderer(this.renderer.createExportRenderer(options),this.captions,{visible:this.visible,draw:this.draw});}
  cancel(){this.renderer.cancel();}
  close(){return this.renderer.close();}
}
