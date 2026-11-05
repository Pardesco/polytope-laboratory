// Fit the projected display cloud in an orthonormal observation frame. These
// bounds affect the camera only; intrinsic source coordinates remain intact.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);if(!length||!Number.isFinite(length))throw Error('Camera direction must be finite and nonzero.');return a.map(x=>x/length);};

export function fitView(points,{aspect=1,direction=[1,1,1],up=[0,1,0],fov=38,padding=1.2,insets={},sphereRadius=0,projection='orthographic'}={}){
  if(!Number.isFinite(aspect)||aspect<=0||!Number.isFinite(fov)||fov<=0||fov>=179||!Number.isFinite(padding)||padding<1)throw Error('Invalid camera fit parameters.');
  const cloud=points.filter(point=>point.length===3&&point.every(Number.isFinite));
  if(!cloud.length&&!sphereRadius)return null;
  const {left=0,right:insetRight=0,top=0,bottom=0}=insets;
  if(![left,insetRight,top,bottom,sphereRadius].every(x=>Number.isFinite(x)&&x>=0)||left+insetRight>=1||top+bottom>=1)throw Error('Invalid camera safe area.');
  const backward=unit(direction),right=unit(cross(up,backward)),vertical=unit(cross(backward,right));
  const axes=[right,vertical,backward],low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const point of cloud)for(let k=0;k<3;k++){const x=dot(point,axes[k]);low[k]=Math.min(low[k],x);high[k]=Math.max(high[k],x);}
  if(sphereRadius)for(let k=0;k<3;k++){low[k]=Math.min(low[k],-sphereRadius);high[k]=Math.max(high[k],sphereRadius);}
  const middle=low.map((x,i)=>(x+high[i])/2);
  const center=[0,1,2].map(i=>axes.reduce((s,axis,k)=>s+middle[k]*axis[i],0));
  let radius=.15;
  for(const point of cloud)radius=Math.max(radius,Math.hypot(...point.map((x,i)=>x-center[i])));
  if(sphereRadius)radius=Math.max(radius,sphereRadius+Math.hypot(...center));
  const width=1-left-insetRight,height=1-top-bottom,cx=left-insetRight,cy=bottom-top;
  const halfHeight=Math.max(.15,(high[1]-low[1])/(2*height),(high[0]-low[0])/(2*aspect*width))*padding;
  const tan=Math.tan(fov*Math.PI/360),limits=[width/padding,height/padding],offset=[cx,cy];
  let distance=radius/Math.sin(Math.min(Math.atan(tan),Math.atan(tan*aspect)))*padding;
  for(let axis=0;axis<2;axis++)for(const sign of [-1,1]){
    const edge=offset[axis]+sign*limits[axis],scale=tan*(axis===0?aspect:1);
    for(const point of cloud){const q=point.map((x,i)=>x-center[i]);distance=Math.max(distance,sign*(dot(q,axes[axis])/scale+edge*dot(q,backward))/limits[axis]);}
    if(sphereRadius){const support=sphereRadius*Math.hypot(1/scale,edge)-sign*(dot(center,axes[axis])/scale+edge*dot(center,backward));distance=Math.max(distance,support/limits[axis]);}
  }
  const screenHeight=projection==='perspective'?distance*tan:halfHeight;
  const target=center.map((x,i)=>x-right[i]*cx*screenHeight*aspect-vertical[i]*cy*screenHeight);
  return {center:target,direction:backward,up:vertical,radius,halfHeight,distance};
}

// A normalized 4D ball stays a ball under every SO(4) turn. Outside its eye,
// finite perspective maps it into a 3D ball with this circumradius.
export function projectedRotationRadius(radius,projection='orthographic',{distance=3,near=.08,scale='equatorial'}={}){
  if(!Number.isFinite(radius)||radius<0)return null;
  if(projection==='orthographic')return radius;
  if(projection!=='perspective'||!Number.isFinite(distance)||!Number.isFinite(near)||distance-radius<near)return null;
  return (scale==='unit-plane'?1:distance)*radius/Math.sqrt(distance*distance-radius*radius);
}
