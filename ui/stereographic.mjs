/** Radial projection to S^3, then stereographic projection from +W.
 * All subdivision is display geometry. Source coordinates/incidence stay intact.
 */
export const STEREOGRAPHIC_DEFAULTS=Object.freeze({poleEpsilon:.02,tolerance:.001,maxDepth:10,maxSegments:512,maxTriangles:4096});
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const mix=(a,b,t=.5)=>a.map((x,i)=>x*(1-t)+b[i]*t);
const length=a=>Math.hypot(...a);
const point4=p=>Array.isArray(p)&&p.length===4&&p.every(Number.isFinite);
function settings(value={}){
  const o={...STEREOGRAPHIC_DEFAULTS,...value};
  if(!Number.isFinite(o.poleEpsilon)||o.poleEpsilon<=0||o.poleEpsilon>=1||!Number.isFinite(o.tolerance)||o.tolerance<=0||!Number.isInteger(o.maxDepth)||o.maxDepth<0||o.maxDepth>14||!Number.isInteger(o.maxSegments)||o.maxSegments<1||o.maxSegments>100000||!Number.isInteger(o.maxTriangles)||o.maxTriangles<1||o.maxTriangles>250000)throw Error('Invalid stereographic subdivision bounds.');
  return o;
}
export function stereographicPoint(p,options={}){
  if(!point4(p))throw Error('Stereographic projection requires four finite coordinates.');
  const epsilon=options.poleEpsilon??STEREOGRAPHIC_DEFAULTS.poleEpsilon;
  if(!Number.isFinite(epsilon)||epsilon<=0||epsilon>=1)throw Error('Invalid stereographic pole cutoff.');
  const radius=length(p);if(!radius)return {point:[0,0,0],clipped:true,reason:'The source center has no radial image on S³.'};
  const denominator=1-p[3]/radius;
  if(denominator<epsilon)return {point:[0,0,0],clipped:true,reason:'Clipped at the stereographic projection pole.'};
  return {point:[(p[0]/radius)/denominator,(p[1]/radius)/denominator,(p[2]/radius)/denominator],clipped:false};
}
function chordError(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],den=((0+dx*dx)+dy*dy)+dz*dz;
  const px=point[0]-a[0],py=point[1]-a[1],pz=point[2]-a[2],numerator=((0+px*dx)+py*dy)+pz*dz;
  const t=den?Math.max(0,Math.min(1,numerator/den)):0;
  return Math.hypot(px-t*dx,py-t*dy,pz-t*dz);
}
function originOnSegment(a,b){
  const d=b.map((x,i)=>x-a[i]),den=dot(d,d),t=den?Math.max(0,Math.min(1,-dot(a,d)/den)):0;
  return length(mix(a,b,t))<=1e-12*Math.max(length(a),length(b));
}
export function stereographicEdge(a,b,options={}){
  const o=settings(options),segments=[],diagnostics=[];let clippedSegments=0,exhausted=false;
  if(!point4(a)||!point4(b))throw Error('Spherical edges require finite 4D endpoints.');
  if(originOnSegment(a,b))return {segments,clippedSegments:0,exhausted:false,diagnostics:['An edge through the source center has no unique radial spherical arc.']};
  // Child endpoints already have their parent's exact projection. Reusing them
  // preserves raw dyadic samples while avoiding repeated vector allocation.
  function visit(t0,t1,depth,knownA=null,knownB=null){
    if(segments.length>=o.maxSegments){exhausted=true;return;}
    const tm=(t0+t1)/2,pa=knownA??stereographicPoint(mix(a,b,t0),o),pb=knownB??stereographicPoint(mix(a,b,t1),o),pm=stereographicPoint(mix(a,b,tm),o);
    if(pa.clipped&&pb.clipped&&pm.clipped){clippedSegments++;return;}
    const clipped=pa.clipped||pb.clipped||pm.clipped;
    const error=clipped?Infinity:chordError(pm.point,pa.point,pb.point);
    if(depth<o.maxDepth&&(clipped||error>o.tolerance)){visit(t0,tm,depth+1,pa,pm);visit(tm,t1,depth+1,pm,pb);return;}
    if(clipped){clippedSegments++;return;}
    if(error>o.tolerance){exhausted=true;return;}
    // Public leaf endpoint arrays remain independent even when samples shared.
    segments.push({a:pa.point.slice(),b:pb.point.slice(),t0,t1});
  }
  visit(0,1,0);
  if(clippedSegments)diagnostics.push('Spherical edge portions near the stereographic pole were clipped; no segment bridges the omitted region.');
  if(exhausted)diagnostics.push('Stereographic edge subdivision reached its bound; unresolved portions were omitted.');
  return {segments,clippedSegments,exhausted,diagnostics};
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
function maximumW(points){
  if(points.every(p=>p[3]<=0))return 0;
  let result=Math.max(...points.map(p=>p[3]/length(p)));
  for(const subset of [[points[0],points[1]],[points[1],points[2]],[points[2],points[0]],points]){
    const weights=solve(subset.map(a=>subset.map(b=>dot(a,b))),subset.map(p=>p[3]));
    if(weights&&weights.every(x=>x>=-1e-10)){
      const p=[0,1,2,3].map(i=>subset.reduce((sum,a,j)=>sum+weights[j]*a[i],0));
      if(length(p)>1e-12)result=Math.max(result,p[3]/length(p));
    }
  }
  return result;
}
function originInTriangle([a,b,c]){
  if(originOnSegment(a,b)||originOnSegment(b,c)||originOnSegment(c,a))return true;
  const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]),weights=solve([[dot(u,u),dot(u,v)],[dot(v,u),dot(v,v)]],[-dot(a,u),-dot(a,v)]);
  if(!weights||weights[0]<0||weights[1]<0||weights[0]+weights[1]>1)return false;
  return length(a.map((x,i)=>x+weights[0]*u[i]+weights[1]*v[i]))<1e-12*Math.max(...[a,b,c].map(length));
}
export function stereographicTriangle(points,options={}){
  const o=settings(options),triangles=[],diagnostics=[];let clippedTriangles=0,exhausted=false;
  if(!Array.isArray(points)||points.length!==3||!points.every(point4))throw Error('Spherical surface patches require three finite 4D points.');
  if(originInTriangle(points))return {triangles,clippedTriangles:0,exhausted:false,diagnostics:['A face triangle through the source center has an undefined radial spherical patch and was omitted.']};
  // Every child remains in this same linear 3-subspace. If its entire great
  // 2-sphere misses the pole cap, no descendant needs a cone optimization.
  const gram=points.map(a=>points.map(b=>dot(a,b))),w=points.map(p=>p[3]),weights=solve(gram,w);
  const poleImpossible=points.every(p=>p[3]<=0)||(weights&&Math.sqrt(Math.max(0,dot(w,weights)))<1-o.poleEpsilon-1e-10);
  function visit(raw,depth,p0=null,p1=null,p2=null){
    if(triangles.length>=o.maxTriangles){exhausted=true;return;}
    const mids=[mix(raw[0],raw[1]),mix(raw[1],raw[2]),mix(raw[2],raw[0])],center=[0,1,2,3].map(i=>(raw[0][i]+raw[1][i]+raw[2][i])/3);
    const projected=p0?[p0,p1,p2]:raw.map(p=>stereographicPoint(p,o)),middle=mids.map(p=>stereographicPoint(p,o)),pc=stereographicPoint(center,o);
    const entirelyClipped=projected.every(p=>p.clipped)&&middle.every(p=>p.clipped)&&pc.clipped;
    if(entirelyClipped){clippedTriangles++;return;}
    const pole=!poleImpossible&&maximumW(raw)>1-o.poleEpsilon;
    const clipped=pole||projected.some(p=>p.clipped)||middle.some(p=>p.clipped)||pc.clipped;
    let error=Infinity;
    if(!clipped){
      const q=projected.map(p=>p.point),u=q[1].map((x,i)=>x-q[0][i]),v=q[2].map((x,i)=>x-q[0][i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],norm=length(normal);
      const interior=norm?Math.abs(dot(pc.point.map((x,i)=>x-q[0][i]),normal))/norm:Infinity;
      error=Math.max(interior,...middle.map((p,i)=>chordError(p.point,q[i],q[(i+1)%3])));
    }
    if(depth<o.maxDepth&&(clipped||error>o.tolerance)){
      const [a,b,c]=raw,[ab,bc,ca]=mids;
      visit([a,ab,ca],depth+1,projected[0],middle[0],middle[2]);
      visit([ab,b,bc],depth+1,middle[0],projected[1],middle[1]);
      visit([ca,bc,c],depth+1,middle[2],middle[1],projected[2]);
      visit([ab,bc,ca],depth+1,middle[0],middle[1],middle[2]);
      return;
    }
    if(clipped){clippedTriangles++;return;}
    if(error>o.tolerance){exhausted=true;return;}
    triangles.push(projected.map(p=>p.point.slice()));
  }
  visit(points,0);
  if(clippedTriangles)diagnostics.push('Spherical surface patches intersecting the stereographic pole cutoff were omitted.');
  if(exhausted)diagnostics.push('Stereographic surface subdivision reached its bound; unresolved patches were omitted.');
  return {triangles,clippedTriangles,exhausted,diagnostics};
}
