/** Source-bound SO(4) observation frames, applied before display angle rotations.
 * Matrices act on normalized columns; centering is already performed by Viewer.
 * The engine-issued representation fingerprint binds the frame to its source.
 */
import {rotate,project} from './projection.js';

const TOLERANCE=1e-8;
const fingerprint=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

function determinant(matrix){
  const rows=matrix.map(row=>[...row]);let value=1;
  for(let i=0;i<4;i++){
    let pivot=i;
    for(let j=i+1;j<4;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;
    if(rows[pivot][i]===0)return 0;
    if(pivot!==i){[rows[pivot],rows[i]]=[rows[i],rows[pivot]];value=-value;}
    const scale=rows[i][i];value*=scale;
    for(let j=i+1;j<4;j++){
      const factor=rows[j][i]/scale;
      for(let k=i+1;k<4;k++)rows[j][k]-=factor*rows[i][k];
    }
  }
  return value;
}

/** Invalid frames fall back to identity with an explicit display diagnostic. */
export function resolveDisplayFrame(model,savedFrame){
  const rejected=reason=>({matrix:null,applied:false,diagnostic:`Orientation frame ignored: ${reason}`});
  if(savedFrame===undefined||savedFrame===null)return {matrix:null,applied:false,diagnostic:null};
  if(model?.dimension!==4||(model.embeddingDimension??model.dimension)!==4)return rejected('requires an intrinsic 4D source.');
  if(typeof savedFrame!=='object'||Array.isArray(savedFrame))return rejected('saved frame metadata is malformed.');
  if(!fingerprint(model.fingerprint)||!fingerprint(savedFrame.sourceFingerprint)||savedFrame.sourceFingerprint!==model.fingerprint)return rejected('source geometry fingerprint does not match.');
  const matrix=savedFrame.matrix;
  if(!Array.isArray(matrix)||matrix.length!==4||matrix.some(row=>!Array.isArray(row)||row.length!==4||!row.every(Number.isFinite)))return rejected('matrix must contain four rows of four finite numbers.');
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    const dot=matrix[i].reduce((sum,x,k)=>sum+x*matrix[j][k],0);
    if(Math.abs(dot-(i===j?1:0))>TOLERANCE)return rejected('matrix is not orthogonal within 1e-8.');
  }
  if(Math.abs(determinant(matrix)-1)>TOLERANCE)return rejected('matrix must have determinant +1 within 1e-8.');
  return {matrix:matrix.map(row=>[...row]),applied:true,diagnostic:null};
}

/** Return fresh coordinates; source and normalized point arrays stay immutable. */
export function applyDisplayFrame(point,matrix){
  if(!matrix)return [...point];
  if(point.length!==4)throw new Error('An SO(4) display frame requires a four-component point.');
  return matrix.map(row=>row.reduce((sum,x,i)=>sum+x*point[i],0));
}

/** Shared path for source vertices and virtual planar/star crossing points. */
export function projectDisplayPoint(point,matrix,angles=[],projection='orthographic',options){
  return project(rotate(applyDisplayFrame(point,matrix),angles),projection,options);
}
