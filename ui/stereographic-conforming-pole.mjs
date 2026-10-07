/** Bounded floating-point pole cone guard. Not an interval certificate. */
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),length=a=>Math.hypot(...a);
function solve(matrix,rhs){
  const rows=matrix.map((r,i)=>[...r,rhs[i]]),n=rhs.length;
  for(let k=0;k<n;k++){
    let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    if(Math.abs(rows[pivot][k])<1e-13)return null;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];const divisor=rows[k][k];for(let j=k;j<=n;j++)rows[k][j]/=divisor;
    for(let i=0;i<n;i++)if(i!==k){const factor=rows[i][k];for(let j=k;j<=n;j++)rows[i][j]-=factor*rows[k][j];}
  }
  return rows.map(r=>r[n]);
}
/** Positive-cone analytic stationary candidates, with conservative singular refusal.
 * This is a floating-point guard, not an interval-arithmetic certificate.
 */
export function poleConeMaximumW(points){
  const rays=points.map(p=>{const r=length(p);return r?p.map(x=>x/r):null;});
  if(rays.some(p=>!p))return {maximum:1,uncertain:true};
  if(rays.every(p=>p[3]<=0))return {maximum:0,uncertain:false};
  let maximum=Math.max(...rays.map(p=>p[3]));
  for(const ids of [[0,1],[1,2],[2,0],[0,1,2]]){
    const subset=ids.map(i=>rays[i]),weights=solve(subset.map(a=>subset.map(b=>dot(a,b))),subset.map(p=>p[3]));
    if(!weights)return {maximum:1,uncertain:true};
    if(weights.every(w=>w>=-1e-10)){
      const point=[0,1,2,3].map(j=>subset.reduce((sum,p,i)=>sum+weights[i]*p[j],0)),r=length(point);
      if(r>1e-12)maximum=Math.max(maximum,point[3]/r);
    }
  }
  return {maximum,uncertain:false};
}

