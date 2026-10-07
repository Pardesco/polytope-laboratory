/** Picking produces source references, never IDs for virtual surface samples. */
export const PICK_LIMIT=100000;
const finitePoint=p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite);

/** Clip a projected segment to the observer camera frustum before pixel tests. */
export function clipNdcSegment(a,b){
  if(!finitePoint(a)||!finitePoint(b)||a.length!==3||b.length!==3)return null;
  let low=0,high=1;
  for(let i=0;i<3;i++){
    const d=b[i]-a[i];
    if(Math.abs(d)<1e-15){if(a[i]<-1||a[i]>1)return null;continue;}
    const x=(-1-a[i])/d,y=(1-a[i])/d;low=Math.max(low,Math.min(x,y));high=Math.min(high,Math.max(x,y));
    if(low>high)return null;
  }
  return [low,high].map(t=>a.map((x,i)=>x+t*(b[i]-x)));
}

/** Homogeneous clipping also handles an endpoint behind a perspective camera. */
export function clipCameraSegment(a,b){
  if(!finitePoint(a)||!finitePoint(b)||a.length!==4||b.length!==4)return null;
  let low=0,high=1;
  for(let axis=0;axis<3;axis++)for(const side of [-1,1]){
    const start=a[3]+side*a[axis],end=b[3]+side*b[axis];
    if(start<0&&end<0)return null;
    if(start<0||end<0){const t=start/(start-end);if(start<0)low=Math.max(low,t);else high=Math.min(high,t);}
    if(low>high)return null;
  }
  const result=[low,high].map(t=>a.map((x,i)=>x+t*(b[i]-x)));
  if(result.some(p=>p[3]<=0))return null;
  return result.map(p=>p.slice(0,3).map(x=>x/p[3]));
}

export function pointSegmentDistance(point,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],denominator=dx*dx+dy*dy;
  const t=denominator?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/denominator)):0;
  return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
}

/** Inputs are already projected/visibility-filtered drawing primitives.
 * Pixel distance orders vertex/edge hits; ray depth orders face/cell hits.
 */
export function sourceEntityHits(kind,{cursor,vertices=[],segments=[],rayHits=[],triangles=[],faceOwners=[],activeCells=[],enabled=true,limit=PICK_LIMIT}={}){
  const rejected=message=>({hits:[],diagnostic:`Picking unavailable: ${message}`});
  if(!['vertex','edge','face','cell'].includes(kind))return rejected('source entity kind is unsupported.');
  if(!finitePoint(cursor))return rejected('pointer coordinates must be finite.');
  if(!Number.isInteger(limit)||limit<1||limit>PICK_LIMIT)return rejected('resource bound is invalid.');
  if(!enabled)return {hits:[],diagnostic:null};
  const candidates=new Map(),active=new Set(activeCells);
  let visits=0;
  const add=(id,distance)=>{if(!Number.isInteger(id)||id<0||!Number.isFinite(distance)||distance<0)return;const previous=candidates.get(id);if(previous===undefined||distance<previous)candidates.set(id,distance);};
  if(kind==='vertex'){
    if(vertices.length>limit)return rejected('vertex traversal resource limit exceeded.');
    for(const vertex of vertices){if(vertex.visible===false||vertex.clipped||!finitePoint(vertex.point))continue;const distance=Math.hypot(cursor[0]-vertex.point[0],cursor[1]-vertex.point[1]);if(distance<=14)add(vertex.id,distance);}
  }else if(kind==='edge'){
    if(segments.length>limit)return rejected('edge traversal resource limit exceeded.');
    for(const segment of segments){if(segment.visible===false||segment.clipped||!Array.isArray(segment.points)||segment.points.length!==2||!segment.points.every(finitePoint))continue;const distance=pointSegmentDistance(cursor,...segment.points);if(distance<=8)add(segment.id,distance);}
  }else{
    if(rayHits.length>limit)return rejected('surface traversal resource limit exceeded.');
    for(const hit of rayHits){
      if(++visits>limit)return rejected('cell-owner traversal resource limit exceeded.');
      const triangle=triangles[hit.faceIndex];if(!triangle||triangle.visible===false||!Number.isFinite(hit.distance)||hit.distance<0)continue;
      if(kind==='face')add(triangle.face,hit.distance);
      else if(Number.isInteger(triangle.cell)){if(active.has(triangle.cell))add(triangle.cell,hit.distance);}
      else for(const cell of faceOwners[triangle.face]||[]){if(++visits>limit)return rejected('cell-owner traversal resource limit exceeded.');if(active.has(cell))add(cell,hit.distance);}
    }
  }
  return {hits:[...candidates].map(([id,distance])=>({kind,id,distance})).sort((a,b)=>a.distance-b.distance||a.id-b.id),diagnostic:null};
}

/** Repeated clicks cycle only the same ordered candidates at the same location. */
export class PickCycle{
  constructor(){this.reset();}
  reset(){this.previous=null;this.index=0;}
  choose(hits,cursor,kind){
    if(!hits.length){this.reset();return null;}
    const key=hits.map(hit=>hit.id).join(','),same=this.previous&&this.previous.kind===kind&&this.previous.key===key&&Math.hypot(cursor[0]-this.previous.cursor[0],cursor[1]-this.previous.cursor[1])<=5;
    this.index=same?(this.index+1)%hits.length:0;this.previous={key,kind,cursor:[...cursor]};return hits[this.index];
  }
}
