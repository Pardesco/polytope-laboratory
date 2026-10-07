/** Analytic normals on the stereographic image of a linear S^2 in S^3. */
const det3=rows=>rows[0][0]*(rows[1][1]*rows[2][2]-rows[1][2]*rows[2][1])-rows[0][1]*(rows[1][0]*rows[2][2]-rows[1][2]*rows[2][0])+rows[0][2]*(rows[1][0]*rows[2][1]-rows[1][1]*rows[2][0]);
const unit=p=>{const length=Math.hypot(...p);return length&&Number.isFinite(length)?p.map(x=>x/length):null;};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const FORWARD=Object.freeze([0,1,2]),REVERSE=Object.freeze([0,2,1]);

export function sphericalSpanNormal(points){
  if(!Array.isArray(points)||points.length!==3||points.some(p=>!Array.isArray(p)||p.length!==4||!p.every(Number.isFinite)))return null;
  const rows=points.map(unit);if(rows.some(p=>!p))return null;
  const cofactors=[0,1,2,3].map(axis=>(axis%2?-1:1)*det3(rows.map(row=>row.filter((_,i)=>i!==axis))));
  if(Math.hypot(...cofactors)<1e-12)return null;
  return unit(cofactors);
}

/** Inverse stereo: q=(2r/(1+|r|²), (|r|²-1)/(1+|r|²)).
 * n·q=0 => nw(|r|²-1)+2nxyz·r=0. Its gradient gives smooth normals.
 */
export function stereographicPatchNormals(points,spanNormal){
  if(!spanNormal||!Array.isArray(points)||points.length!==3||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return null;
  const gradient=p=>spanNormal.slice(0,3).map((x,i)=>x+spanNormal[3]*p[i]);
  const normals=points.map(p=>unit(gradient(p)));if(normals.some(n=>!n))return null;
  // For ordered raw rows a,b,c: cross(dr/du,dr/dv) = -gradient/(rho*d*d).
  // Child chord winding never determines the source differential orientation.
  return normals.map(n=>n.map(x=>-x));
}

/** Rendering-only permutation. Source/parameter incidence is never reordered.
 * DoubleSide flips back-facing fragment normals, so chord fronts must agree
 * with the source differential normal. Null means zero/undefined chord area. */
export function stereographicPatchCornerOrder(points,normals){
  if(!Array.isArray(points)||points.length!==3||!Array.isArray(normals)||normals.length!==3)return null;
  const chord=cross(points[1].map((x,i)=>x-points[0][i]),points[2].map((x,i)=>x-points[0][i])),average=normals[0].map((x,i)=>x+normals[1][i]+normals[2][i]),alignment=dot(chord,average);
  return !Number.isFinite(alignment)||alignment===0?null:alignment<0?REVERSE:FORWARD;
}
