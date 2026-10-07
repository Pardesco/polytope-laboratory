// Fit the projected display cloud in an orthonormal observation frame. These
// bounds affect the camera only; intrinsic source coordinates remain intact.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);if(!length||!Number.isFinite(length))throw Error('Camera direction must be finite and nonzero.');return a.map(x=>x/length);};

export function fitView(points,{aspect=1,direction=[1,1,1],up=[0,1,0],fov=38,padding=1.2}={}){
  if(!Number.isFinite(aspect)||aspect<=0||!Number.isFinite(fov)||fov<=0||fov>=179||!Number.isFinite(padding)||padding<1)throw Error('Invalid camera fit parameters.');
  const cloud=points.filter(point=>point.length===3&&point.every(Number.isFinite));
  if(!cloud.length)return null;
  const backward=unit(direction),right=unit(cross(up,backward)),vertical=unit(cross(backward,right));
  const axes=[right,vertical,backward],low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const point of cloud)for(let k=0;k<3;k++){const x=dot(point,axes[k]);low[k]=Math.min(low[k],x);high[k]=Math.max(high[k],x);}
  const middle=low.map((x,i)=>(x+high[i])/2);
  const center=[0,1,2].map(i=>axes.reduce((s,axis,k)=>s+middle[k]*axis[i],0));
  let radius=.15;
  for(const point of cloud)radius=Math.max(radius,Math.hypot(...point.map((x,i)=>x-center[i])));
  const halfHeight=Math.max(.15,(high[1]-low[1])/2,(high[0]-low[0])/(2*aspect))*padding;
  const halfVertical=fov*Math.PI/360,halfHorizontal=Math.atan(Math.tan(halfVertical)*aspect);
  const distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*padding;
  return {center,direction:backward,up:vertical,radius,halfHeight,distance};
}
