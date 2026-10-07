import {stereographicPoint} from './stereographic.mjs';
import {perspectivePoint4D} from './perspective4d.mjs';
export const PLANES = [[0,1,'XY'],[0,2,'XZ'],[0,3,'XW'],[1,2,'YZ'],[1,3,'YW'],[2,3,'ZW']];
export function rotate(point, angles) {
  const p=[...point];
  for(let k=0;k<PLANES.length;k++){
    const [i,j]=PLANES[k];if(j>=p.length)continue;
    const a=(angles[k]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=p[i],y=p[j];
    p[i]=c*x-s*y;p[j]=s*x+c*y;
  }
  return p;
}
export function project(point,mode='orthographic',options){
  const p=[...point];while(p.length<4)p.push(0);
  if(point.length!==4||mode==='orthographic')return {point:p.slice(0,3),clipped:false};
  if(mode==='stereographic')return stereographicPoint(p);
  if(options!==undefined){const result=perspectivePoint4D(p,options);return {point:result.point,clipped:result.clipped,...(result.reason?{reason:result.reason}:{})};}
  const denominator=3-p[3];
  if(denominator<0.08)return {point:[0,0,0],clipped:true};
  const factor=3/denominator;
  return {point:p.slice(0,3).map(x=>x*factor),clipped:false};
}
