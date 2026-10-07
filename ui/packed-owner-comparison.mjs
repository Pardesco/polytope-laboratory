/** Candidate indexed owner equality, not yet wired to the display module.
 * Equality permits coordinate/normal/pose changes only. Every ordered native
 * and presentation-instance owner slot must agree; no hash-only shortcut.
 */
export const PACKED_OWNER_FIELDS=Object.freeze({vertexIds:Uint32Array,vertexFaces:Int32Array,vertexCells:Int32Array,edgeIds:Uint32Array,edgeFaces:Int32Array,edgeCells:Int32Array,edgeInstanceIds:Uint32Array,faceIds:Uint32Array,cellIds:Int32Array,triangleIds:Uint32Array,triangleInstanceIds:Uint32Array});
const fields=Object.keys(PACKED_OWNER_FIELDS),MAX_BYTES=32*1024*1024;
function source(owner){return owner&&typeof owner.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(owner.fingerprint)&&(owner.modelId===null||typeof owner.modelId==='string'&&owner.modelId.length<=512)&&owner.sourceKey===JSON.stringify([owner.modelId,owner.fingerprint]);}
function ordinary(array,Type){if(!(array instanceof Type)||Object.getPrototypeOf(array)!==Type.prototype||!(array.buffer instanceof ArrayBuffer)||array.buffer.resizable===true||array.byteLength>MAX_BYTES)return false;try{new DataView(array.buffer,0,0);return true;}catch{return false;}}

/** Both inputs must be decoded/source-bound packed displays. A false result
 * invalidates the color cache; this function does not validate geometry or
 * replace native/transport source, phase, resolution or capture guards.
 */
export function samePackedDisplayOwners(a,b){
  if(!a||!b||!source(a.owner)||!source(b.owner)||a.owner.sourceKey!==b.owner.sourceKey)return false;
  let bytesA=0,bytesB=0;
  for(const field of fields){const x=a[field],y=b[field],Type=PACKED_OWNER_FIELDS[field];if(!ordinary(x,Type)||!ordinary(y,Type)||x.length!==y.length||(bytesA+=x.byteLength)>MAX_BYTES||(bytesB+=y.byteLength)>MAX_BYTES)return false;for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;}
  return true;
}
