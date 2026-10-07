/** The existing adaptive triangle sampled-error criterion without subdivision.
 * This checks samples, not the maximum error over a whole curved patch.
 * Origin/pole-domain guards belong to the conforming caller.
 */
import {stereographicPoint} from './stereographic.mjs';
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const midpoint=(a,b)=>a.map((x,i)=>(x+b[i])/2);
function chordError(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],den=((0+dx*dx)+dy*dy)+dz*dz;
  const px=p[0]-a[0],py=p[1]-a[1],pz=p[2]-a[2],numerator=((0+px*dx)+py*dy)+pz*dz;
  const t=den?Math.max(0,Math.min(1,numerator/den)):0;
  return Math.hypot(px-t*dx,py-t*dy,pz-t*dz);
}
export function conformingTriangleSampledQuality(raw,options={},projected=null){
  const mids=[midpoint(raw[0],raw[1]),midpoint(raw[1],raw[2]),midpoint(raw[2],raw[0])],center=[0,1,2,3].map(i=>(raw[0][i]+raw[1][i]+raw[2][i])/3);
  const corners=projected??raw.map(p=>stereographicPoint(p,options)),middle=mids.map(p=>stereographicPoint(p,options)),pc=stereographicPoint(center,options);
  if(corners.some(p=>p.clipped)||middle.some(p=>p.clipped)||pc.clipped)return {clipped:true,error:Infinity,points:null};
  const q=corners.map(p=>p.point),u=q[1].map((x,i)=>x-q[0][i]),v=q[2].map((x,i)=>x-q[0][i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],norm=Math.hypot(...normal);
  const interior=norm?Math.abs(dot(pc.point.map((x,i)=>x-q[0][i]),normal))/norm:Infinity;
  const error=Math.max(interior,...middle.map((p,i)=>chordError(p.point,q[i],q[(i+1)%3])));
  return {clipped:false,error,points:q};
}

// Same numerical source-center refusal as the existing projection oracle.
const length=a=>Math.hypot(...a),mix=(a,b,t=.5)=>a.map((x,i)=>x*(1-t)+b[i]*t);
function originOnSegment(a,b){
  const d=b.map((x,i)=>x-a[i]),den=dot(d,d),t=den?Math.max(0,Math.min(1,-dot(a,d)/den)):0;
  return length(mix(a,b,t))<=1e-12*Math.max(length(a),length(b));
}
function solve(matrix,rhs){
  const rows=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
  for(let k=0;k<n;k++){
    let pivot=k;for(let j=k+1;j<n;j++)if(Math.abs(rows[j][k])>Math.abs(rows[pivot][k]))pivot=j;
    if(Math.abs(rows[pivot][k])<1e-12)return null;
    [rows[pivot],rows[k]]=[rows[k],rows[pivot]];const divisor=rows[k][k];for(let j=k;j<=n;j++)rows[k][j]/=divisor;
    for(let i=0;i<n;i++)if(i!==k){const factor=rows[i][k];for(let j=k;j<=n;j++)rows[i][j]-=factor*rows[k][j];}
  }
  return rows.map(row=>row[n]);
}
export function conformingSourceOriginRefused([a,b,c]){
  if(originOnSegment(a,b)||originOnSegment(b,c)||originOnSegment(c,a))return true;
  const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),weights=solve([[dot(u,u),dot(u,v)],[dot(v,u),dot(v,v)]],[-dot(a,u),-dot(a,v)]);
  if(!weights||weights[0]<0||weights[1]<0||weights[0]+weights[1]>1)return false;
  return length(a.map((x,i)=>x+weights[0]*u[i]+weights[1]*v[i]))<1e-12*Math.max(...[a,b,c].map(length));
}
