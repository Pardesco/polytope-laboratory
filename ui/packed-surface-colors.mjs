/** Isolated candidate for validated packed publications; not yet wired into
 * Viewer. Source/owner binding is checked before any target write. No borrowed
 * worker array is mutated. Palette work is per source face/cell, never a
 * per-patch string key, Map lookup, Color allocation, or TypedArray.set call.
 */
import * as THREE from 'three';

export const PACKED_COLOR_LIMITS=Object.freeze({patches:250000,faces:100000,cells:20000,bytes:32*1024*1024,ownerReferences:1000000});
const fail=message=>{throw Error(`Packed surface colors: ${message}`);};
function typed(value,Type,label){
  if(!(value instanceof Type)||Object.getPrototypeOf(value)!==Type.prototype||!(value.buffer instanceof ArrayBuffer)||value.buffer.resizable===true)fail(`${label} must have an ordinary owned typed buffer.`);
  try{new DataView(value.buffer,0,0);}catch{fail(`${label} is detached.`);}return value;
}
function limits(values){const out={...PACKED_COLOR_LIMITS};for(const [key,n] of Object.entries(values)){if(!(key in out)||!Number.isSafeInteger(n)||n<0||n>out[key])fail('Limits may only lower known caps.');out[key]=n;}return out;}
function sourceColor(record,color){
  const v=record?.values,byte=record?.encoding==='byte';
  if(!['byte','unit'].includes(record?.encoding)||!Array.isArray(v)||![3,4].includes(v.length)||v.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>(byte?255:1)))fail('Source colors require bounded byte/unit RGB or RGBA.');
  const factor=byte?1/255:1;color.setRGB(v[0]*factor,v[1]*factor,v[2]*factor,THREE.SRGBColorSpace);return [color.r,color.g,color.b,v.length===4?v[3]*factor:1];
}

/** Exact supported-mode equivalence to Viewer.surfaceColors: source face
 * overrides source cell; explicit cell owner overrides the first active owner
 * fallback. Face/cell modes ignore source RGBA. Alpha flag uses original
 * double precision even when its Float32 representation rounds to1.
 *
 * target is an optional caller-owned color buffer; a larger reusable buffer
 * retains its unused suffix. Errors before packing leave it unchanged.
 * visibility is the source cellVisibility result for this published pose.
 */
export function packSurfaceColors(model,packed,visibility,mode='source',{target,limits:overrides={}}={}){
  const cap=limits(overrides),owner=packed?.owner;
  if(!model||typeof model.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(model.fingerprint)||owner?.modelId!==(model.id??null)||owner?.fingerprint!==model.fingerprint||owner?.sourceKey!==JSON.stringify([model.id??null,model.fingerprint]))fail('Publication is not bound to this source model.');
  if(!['source','face','cell'].includes(mode))fail('Choose source, face, or cell color mode.');
  for(const kind of ['vertices','edges','faces','cells'])if(!Array.isArray(model[kind])||packed.sourceCounts?.[kind]!==model[kind].length)fail('Publication source counts are stale.');
  const faceIds=typed(packed.faceIds,Uint32Array,'face owners'),cellIds=typed(packed.cellIds,Int32Array,'cell owners'),n=faceIds.length,nf=model.faces.length,nc=model.cells.length;
  if(cellIds.length!==n||n>cap.patches||nf>cap.faces||nc>cap.cells)fail('Patch/source allocation limit exceeded.');
  if(target!==undefined){typed(target,Float32Array,'color target');if(target.length<n*12||target.length%4)fail('Color target has insufficient or invalid capacity.');for(const value of Object.values(packed))if(ArrayBuffer.isView(value)&&value.buffer===target.buffer)fail('Color target aliases borrowed worker geometry.');}
  const requiredBytes=(target?.byteLength??n*48)+nf*38+nc*33;
  if(requiredBytes>cap.bytes)fail('Color/palette allocation limit exceeded.');
  const rows=visibility?.faceOwners,active=visibility?.activeCellSet;
  if(!Array.isArray(rows)||rows.length!==nf||!(active instanceof Set)||active.size>nc)fail('Visibility must match source face/cell ownership.');
  for(const cell of active)if(!Number.isInteger(cell)||cell<0||cell>=nc)fail('Active cell ownership is invalid.');
  const fallback=new Int32Array(nf).fill(-1);let references=0;
  for(let face=0;face<nf;face++){
    const row=rows[face];if(!Array.isArray(row)||(references+=row.length)>cap.ownerReferences)fail('Visibility owner reference limit exceeded.');
    for(const cell of row){if(!Number.isInteger(cell)||cell<0||cell>=nc)fail('Visibility cell owner is invalid.');if(fallback[face]<0&&active.has(cell))fallback[face]=cell;}
  }
  // Validate all owners before borrowing an existing writable target. A late
  // malformed slot must never leave a partly recolored old visible mesh.
  for(let i=0;i<n;i++)if(faceIds[i]>=nf||cellIds[i]< -1||cellIds[i]>=nc)fail('Patch source ownership is invalid.');
  const faceColors=model.metadata?.offColors?.faces,cellColors=model.metadata?.offColors?.cells;
  const facePalette=new Float64Array(nf*4),cellPalette=new Float64Array(nc*4),faceSeen=new Uint8Array(nf),cellSeen=new Uint8Array(nc),hasFaceColor=new Uint8Array(nf),scratch=new THREE.Color(),defaultColor=new THREE.Color(0x9aaec3),neutral=[defaultColor.r,defaultColor.g,defaultColor.b,1];
  // Palette preparation remains bounded by source size, before target writes.
  // Only actually referenced owners need color conversion/validation.
  for(let i=0;i<n;i++){
    const f=faceIds[i],c=cellIds[i]>=0?cellIds[i]:fallback[f];
    if(!faceSeen[f]){let rgba=neutral;if(mode==='face'){scratch.setHSL((f*.173+.58)%1,.32,.6);rgba=[scratch.r,scratch.g,scratch.b,1];}else if(mode==='source'&&faceColors?.[f]){rgba=sourceColor(faceColors[f],scratch);hasFaceColor[f]=1;}for(let j=0;j<4;j++)facePalette[f*4+j]=rgba[j];faceSeen[f]=1;}
    if(c>=0&&!cellSeen[c]&&(mode==='cell'||mode==='source'&&!hasFaceColor[f])){let rgba=neutral;if(mode==='cell'){scratch.setHSL((c*.173+.58)%1,.32,.6);rgba=[scratch.r,scratch.g,scratch.b,1];}else if(cellColors?.[c])rgba=sourceColor(cellColors[c],scratch);for(let j=0;j<4;j++)cellPalette[c*4+j]=rgba[j];cellSeen[c]=1;}
  }
  const colors=target??new Float32Array(n*12);let vertexAlpha=false;
  for(let i=0,d=0;i<n;i++,d+=12){
    const f=faceIds[i],c=cellIds[i]>=0?cellIds[i]:fallback[f],useCell=c>=0&&(mode==='cell'||mode==='source'&&!hasFaceColor[f]),palette=useCell?cellPalette:facePalette,offset=(useCell?c:f)*4,r=palette[offset],g=palette[offset+1],b=palette[offset+2],a=palette[offset+3];
    vertexAlpha||=a<1;colors[d]=colors[d+4]=colors[d+8]=r;colors[d+1]=colors[d+5]=colors[d+9]=g;colors[d+2]=colors[d+6]=colors[d+10]=b;colors[d+3]=colors[d+7]=colors[d+11]=a;
  }
  return {colors,vertexAlpha,patches:n,requiredBytes};
}
