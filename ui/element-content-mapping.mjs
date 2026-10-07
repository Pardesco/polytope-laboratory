/** Source-affine content mapping. No source-coordinate welding or new surface. */
import {applyDisplayFrame} from './display-frame.mjs';
import {rotate} from './projection.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),length=p=>Math.hypot(...p),finite=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
const fail=message=>{throw Error(`Element content mapping: ${message}`);};
export function validateContentFaceFrame(model,entry){
  const ids=model.faces[entry.index],f=entry.faceFrame,d=model.embeddingDimension??model.dimension;
  if(!ids||JSON.stringify(ids)!==JSON.stringify(entry.sourceVertexIds)||!finite(f?.origin,d)||!finite(f?.u,d)||!finite(f?.v,d)||!Array.isArray(f.xy)||f.xy.length!==ids.length||!f.xy.every(p=>finite(p,2))||!Number.isInteger(f.pivot)||f.pivot<0||f.pivot>=ids.length)fail('Face frame/cycle does not match the source.');
  if(Math.abs(dot(f.u,f.u)-1)>1e-8||Math.abs(dot(f.v,f.v)-1)>1e-8||Math.abs(dot(f.u,f.v))>1e-8)fail('Face tangent frame is not orthonormal.');
  const scale=Math.max(1,...ids.map(id=>length(sub(model.vertices[id],f.origin))));
  for(let i=0;i<ids.length;i++)if(length(sub(model.vertices[ids[i]],f.origin.map((x,k)=>x+f.xy[i][0]*f.u[k]+f.xy[i][1]*f.v[k])))>scale*1e-8)fail('Face coordinates do not reconstruct the source.');
  if(length(sub(f.origin,model.vertices[ids[0]]))>scale*1e-8)fail('Face origin is not its ordered first corner.');
  const low=[0,1].map(k=>Math.min(...f.xy.map(p=>p[k]))),high=[0,1].map(k=>Math.max(...f.xy.map(p=>p[k])));
  if(high.some((x,k)=>x-low[k]<=scale*1e-10))fail('Face texture bounds are degenerate.');
  return {...f,low,high};
}
export function contentPresentationFrame(frame,{center,radius,matrix=null,angles=[],translation=null,shrink=1,cellCenter=null}={}){
  const d=frame.origin.length;if(!finite(center,d)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(shrink)||shrink<=0||shrink>1||translation!==null&&!finite(translation,d)||shrink!==1&&!finite(cellCenter,d))fail('Invalid original normalization/presentation recipe.');
  let origin=frame.origin.map((x,k)=>(x-center[k])/radius+(translation?.[k]??0)),u=frame.u.map(x=>x/radius),v=frame.v.map(x=>x/radius);
  if(shrink!==1){origin=origin.map((x,k)=>cellCenter[k]+shrink*(x-cellCenter[k]));u=u.map(x=>x*shrink);v=v.map(x=>x*shrink);}
  const pose=p=>rotate(applyDisplayFrame(p,matrix),angles);
  return {origin:pose(origin),u:pose(u),v:pose(v),low:frame.low.slice(),high:frame.high.slice(),sourceFrame:frame};
}
function solve(columns,target,tolerance=2e-5){
  const n=columns.length,d=target.length,rows=Array.from({length:n},(_,i)=>[...columns.map(c=>dot(columns[i],c)),dot(columns[i],target)]),scale=Math.max(...rows.flatMap(r=>r.slice(0,n).map(Math.abs)));
  if(!scale||!Number.isFinite(scale))return null;
  for(let k=0;k<n;k++){let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(rows[j][k])>Math.abs(rows[pivot][k]))pivot=j;if(Math.abs(rows[pivot][k])<=scale*1e-12)return null;[rows[pivot],rows[k]]=[rows[k],rows[pivot]];const a=rows[k][k];for(let j=k;j<=n;j++)rows[k][j]/=a;for(let i=0;i<n;i++)if(i!==k){const b=rows[i][k];for(let j=k;j<=n;j++)rows[i][j]-=b*rows[k][j];}}
  const values=rows.map(r=>r[n]),predicted=Array.from({length:d},(_,k)=>columns.reduce((s,c,i)=>s+c[k]*values[i],0)),residual=length(sub(predicted,target));
  if(!values.every(Number.isFinite)||residual>tolerance*Math.max(1,length(target),length(predicted)))return null;
  return {values,residual};
}
export function recoverContentXY(point,frame,{projection='orthographic',distance=3,tolerance=2e-5}={}){
  if(!finite(point,3))return {supported:false,reason:'Nonfinite projected corner.'};const d=frame.origin.length;
  let solved;
  if(d===4&&projection==='stereographic'){
    const rr=dot(point,point),q=[...point.map(x=>2*x/(1+rr)),(rr-1)/(1+rr)];
    if(!Number.isFinite(rr)||1-q[3]<.02-2e-6)return {supported:false,reason:'Projected corner is outside the qualified pole domain.'};
    solved=solve([q,frame.u.map(x=>-x),frame.v.map(x=>-x)],frame.origin,tolerance);
    if(!solved||solved.values[0]<=0)return {supported:false,reason:'Source-face ray scale is nonunique, reversed or inconsistent.'};
    return {supported:true,xy:solved.values.slice(1),rayScale:solved.values[0],residual:solved.residual};
  }
  if(d===4&&projection==='perspective'){
    if(!Number.isFinite(distance)||distance<=0)return {supported:false,reason:'Invalid 4D perspective eye.'};const eye=[0,0,0,distance],direction=[...point,-distance];
    solved=solve([direction,frame.u.map(x=>-x),frame.v.map(x=>-x)],sub(frame.origin,eye),tolerance);
    if(!solved||solved.values[0]<=0)return {supported:false,reason:'Perspective ray/face mapping is nonunique or inconsistent.'};
    return {supported:true,xy:solved.values.slice(1),rayScale:solved.values[0],residual:solved.residual};
  }
  solved=solve([frame.u.slice(0,3),frame.v.slice(0,3)],sub(point,frame.origin.slice(0,3)),tolerance);
  return solved?{supported:true,xy:solved.values,residual:solved.residual}:{supported:false,reason:'Collapsed or inconsistent projected face frame.'};
}
export function contentUV(xy,frame){return xy.map((x,i)=>(x-frame.low[i])/(frame.high[i]-frame.low[i]));}
export function normalizedCellCenter(model,cell,center,radius,translation=null){const ids=[...new Set(model.cells[cell]?.flatMap(f=>model.faces[f])??[])];if(!ids.length)fail('Missing source-cell incidence.');return center.map((_,k)=>ids.reduce((s,id)=>s+(model.vertices[id][k]-center[k])/radius/ids.length,0)+(translation?.[k]??0));}
