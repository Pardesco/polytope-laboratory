import {PLANES,project} from './projection.js';
import {applyDisplayFrame} from './display-frame.mjs';

// Keep the original rotation order and arithmetic; only the pose trig is shared.
export function displayProjector(matrix,angles=[],projection='orthographic',options){
  const rotations=PLANES.map(([i,j],k)=>{const a=(angles[k]||0)*Math.PI/180;return [i,j,Math.cos(a),Math.sin(a)];});
  return point=>{
    const p=applyDisplayFrame(point,matrix);
    for(const [i,j,c,s] of rotations){if(j>=p.length)continue;const x=p[i],y=p[j];p[i]=c*x-s*y;p[j]=s*x+c*y;}
    if(projection==='orthographic'){while(p.length<3)p.push(0);return {point:p.slice(0,3),clipped:false};}
    return project(p,projection,options);
  };
}

export function writeSurfacePositions(target,triangles,{displayGeometry,explosionDisplay,projected,visibility,cellNet,cellSurfacePoints,displayPoint}){
  for(let i=0;i<triangles.length;i++){
    const t=triangles[i],offset=i*9;
    if(displayGeometry||explosionDisplay){target.set(t.points[0],offset);target.set(t.points[1],offset+3);target.set(t.points[2],offset+6);continue;}
    const a=t.vertices?projected[t.vertices[0]]:displayPoint(t.normalized[0]),b=t.vertices?projected[t.vertices[1]]:displayPoint(t.normalized[1]),c=t.vertices?projected[t.vertices[2]]:displayPoint(t.normalized[2]);
    if(!visibility.faces[t.face]||a.clipped||b.clipped||c.clipped){target.fill(0,offset,offset+9);continue;}
    if(cellNet&&t.vertices){target.set(cellSurfacePoints[t.vertices[0]],offset);target.set(cellSurfacePoints[t.vertices[1]],offset+3);target.set(cellSurfacePoints[t.vertices[2]],offset+6);}
    else {target.set(a.point,offset);target.set(b.point,offset+3);target.set(c.point,offset+6);}
  }
}
