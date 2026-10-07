// Same rigid transformations as engine/nets.py, evaluated on the render clock.
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mv=(a,v)=>a.map(row=>dot(row,v));
const mm=(a,b)=>a.map(row=>b[0].map((_,i)=>dot(row,b.map(r=>r[i]))));
const rotation=(axis,angle)=>{
  const [x,y,z]=axis,c=Math.cos(angle),s=Math.sin(angle),t=1-c;
  return [[c+x*x*t,x*y*t-z*s,x*z*t+y*s],[y*x*t+z*s,c+y*y*t,y*z*t-x*s],[z*x*t-y*s,z*y*t+x*s,c+z*z*t]];
};
function quaternionRotation(quaternion,fraction){
  let q=quaternion;if(q[3]<0)q=q.map(x=>-x);
  const length=Math.hypot(...q.slice(0,3));
  const angle=2*Math.atan2(length,q[3]);
  return rotation(length>1e-15?q.slice(0,3).map(x=>x/length):[1,0,0],angle*fraction);
}

export function foldPositions(net,fraction){
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw new Error('Fold fraction must be in [0,1].');
  const faces=new Map(net.faces.map(f=>[f.id,f])),roots=new Map(net.components.map(c=>[c.root,c])),transforms=new Map(),positions=new Map();
  for(const id of net.traversalOrder){
    const face=faces.get(id);let matrix,translation;
    if(face.parent===null){const root=roots.get(id);matrix=quaternionRotation(root.targetQuaternion,fraction);translation=mul(root.targetTranslation,fraction);}
    else{
      const parent=faces.get(face.parent),[pr,pt]=transforms.get(face.parent),[a,b]=net.sourceEdges[face.parentHinge];
      const aa=add(mv(pr,[...parent.points[parent.sourceVertices.indexOf(a)],0]),pt),bb=add(mv(pr,[...parent.points[parent.sourceVertices.indexOf(b)],0]),pt);
      const axis=sub(bb,aa),r=rotation(mul(axis,1/Math.hypot(...axis)),face.foldAngle*fraction);
      matrix=mm(r,pr);translation=add(mv(r,sub(pt,aa)),aa);
    }
    transforms.set(id,[matrix,translation]);positions.set(id,face.points.map(p=>add(mv(matrix,[...p,0]),translation)));
  }
  return net.faces.map(face=>({id:face.id,sourceVertices:face.sourceVertices,component:face.component,points:positions.get(face.id)}));
}
