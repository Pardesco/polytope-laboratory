/** Finite 4D eye projection after source normalization and display rotations.
 * This pure core never transforms source geometry or changes an observer camera.
 */
export const PERSPECTIVE4D_DEFAULTS=Object.freeze({distance:3,near:.08,scale:'equatorial',maxCoordinate:1000000});

export function perspective4DSettings(options={}){
  const settings={...PERSPECTIVE4D_DEFAULTS,...options};
  if(!Number.isFinite(settings.distance)||settings.distance<=0||settings.distance>100)throw new RangeError('4D perspective distance must be finite, positive and at most 100.');
  if(!Number.isFinite(settings.near)||settings.near<=0||settings.near>=settings.distance)throw new RangeError('4D perspective near distance must be finite, positive and smaller than the eye distance.');
  if(!['equatorial','unit-plane'].includes(settings.scale))throw new RangeError('4D perspective scale must be equatorial or unit-plane.');
  if(!Number.isFinite(settings.maxCoordinate)||settings.maxCoordinate<=0||settings.maxCoordinate>1000000)throw new RangeError('Projected coordinate bound must be positive and at most 1000000.');
  return {...settings,eye:[0,0,0,settings.distance],nearPlaneW:settings.distance-settings.near,scaleNumerator:settings.scale==='equatorial'?settings.distance:1};
}

function point4(point){
  if(!Array.isArray(point)||point.length!==4||!point.every(Number.isFinite))throw new TypeError('4D perspective requires four finite coordinates.');
  return [...point];
}
function projected(point,settings,boundary=false){
  const depth=boundary?settings.near:settings.distance-point[3];
  const omitted=reason=>({point:[0,0,0],clipped:true,reason,depth});
  if(depth<settings.near)return omitted('The point is behind the 4D near plane.');
  const factor=settings.scaleNumerator/depth;
  if(!Number.isFinite(depth)||!Number.isFinite(factor))return omitted('4D perspective arithmetic exceeds finite precision.');
  const values=point.slice(0,3).map(x=>x*factor);
  if(!values.every(Number.isFinite)||values.some(x=>Math.abs(x)>settings.maxCoordinate))return omitted('Projected coordinates exceed the finite display bound.');
  return {point:values,clipped:false,reason:null,depth,factor};
}
export function perspectivePoint4D(point,options={}){
  return projected(point4(point),perspective4DSettings(options));
}

// Scale signed distances before division so opposite huge finite values do not
// overflow their difference when locating a near-plane crossing.
function crossingParameter(a,b){const scale=Math.max(Math.abs(a),Math.abs(b));return (a/scale)/((a/scale)-(b/scale));}
const interpolate=(a,b,t)=>a.map((x,i)=>(1-t)*x+t*b[i]);
function boundaryVertex(a,b,da,db,settings){
  const t=crossingParameter(da,db),point=interpolate(a.point,b.point,t);
  if(!Number.isFinite(t)||t<0||t>1||!point.every(Number.isFinite)||Math.abs(point[3]-settings.nearPlaneW)>1e-12*Math.max(1,Math.abs(settings.nearPlaneW)))return null;
  point[3]=settings.nearPlaneW;
  return {point,weights:interpolate(a.weights,b.weights,t),boundary:true};
}
const depthFromPlane=(vertex,settings)=>vertex.boundary?0:settings.distance-vertex.point[3]-settings.near;
const clippingMessage='Source portions behind the 4D near plane were clipped; no projected piece crosses the omitted region.';

/** One source segment becomes zero or one finite straight projected segment.
 * t0/t1 refer to the original source edge, including newly clipped endpoints.
 */
export function perspectiveSegment4D(a,b,options={}){
  const settings=perspective4DSettings(options),start={point:point4(a),weights:[0],boundary:false},end={point:point4(b),weights:[1],boundary:false};
  const da=depthFromPlane(start,settings),db=depthFromPlane(end,settings),clipped=da<0||db<0,diagnostics=clipped?[clippingMessage]:[];
  if(da<0&&db<0)return {segments:[],clipped:true,omitted:true,diagnostics};
  let left=start,right=end;
  if(da<0)left=boundaryVertex(start,end,da,db,settings);
  if(db<0)right=boundaryVertex(start,end,da,db,settings);
  if(!left||!right){diagnostics.push('The near-plane crossing cannot be resolved within finite precision; the source segment was omitted.');return {segments:[],clipped,omitted:true,diagnostics};}
  const pa=projected(left.point,settings,left.boundary),pb=projected(right.point,settings,right.boundary);
  if(pa.clipped||pb.clipped){diagnostics.push(pa.reason||pb.reason);return {segments:[],clipped,omitted:true,diagnostics};}
  return {segments:[{a:pa.point,b:pb.point,t0:left.weights[0],t1:right.weights[0],points4:[left.point,right.point],nearBoundary:[left.boundary,right.boundary]}],clipped,omitted:false,diagnostics};
}

/** Clip a filled source triangle in 4D, then project a zero/three/four-point
 * polygon. At most two triangles are returned. New points carry barycentric
 * references to the original source triangle, not new source vertex IDs.
 */
export function perspectiveTriangle4D(points,options={}){
  const settings=perspective4DSettings(options);
  if(!Array.isArray(points)||points.length!==3)throw new TypeError('4D perspective surface clipping requires three points.');
  const vertices=points.map((p,i)=>({point:point4(p),weights:[0,1,2].map(j=>i===j?1:0),boundary:false})),polygon=[];
  let clipped=false;
  for(let i=0;i<3;i++){
    const current=vertices[i],previous=vertices[(i+2)%3],dc=depthFromPlane(current,settings),dp=depthFromPlane(previous,settings);
    if(dc<0||dp<0)clipped=true;
    if((dc<0)!==(dp<0)){
      const boundary=boundaryVertex(previous,current,dp,dc,settings);
      if(!boundary)return {triangles:[],clipped:true,omitted:true,diagnostics:['The near-plane crossing cannot be resolved within finite precision; the source triangle was omitted.']};
      polygon.push(boundary);
    }
    if(dc>=0)polygon.push(current);
  }
  const diagnostics=clipped?[clippingMessage]:[],same=(a,b)=>a.weights.every((x,i)=>Math.abs(x-b.weights[i])<1e-14),compact=[];
  for(const vertex of polygon)if(!compact.length||!same(compact.at(-1),vertex))compact.push(vertex);
  if(compact.length>1&&same(compact[0],compact.at(-1)))compact.pop();
  if(compact.length<3)return {triangles:[],clipped,omitted:true,diagnostics};
  const display=compact.map(p=>projected(p.point,settings,p.boundary));
  const failed=display.find(p=>p.clipped);
  if(failed){diagnostics.push(failed.reason);return {triangles:[],clipped,omitted:true,diagnostics};}
  const triangles=[];
  for(let i=1;i<compact.length-1;i++){
    const ids=[0,i,i+1];
    triangles.push({points:ids.map(id=>[...display[id].point]),points4:ids.map(id=>[...compact[id].point]),barycentrics:ids.map(id=>[...compact[id].weights]),nearBoundary:ids.map(id=>compact[id].boundary)});
  }
  return {triangles,clipped,omitted:false,diagnostics};
}
