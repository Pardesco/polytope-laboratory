// Independent pre-optimization .14.0 Viewer.surfaceColors reference, captured
// before packed-color integration. Normalized original method SHA256:
// 9990d5b184311f0324c00668b0ad89272787666056c74e7fafc45f36a28fd3f8
// Keep this baseline fixed; importing the current Viewer would become circular.
import * as THREE from 'three';

export function legacySurfaceColors(mode){
  const triangles=this.renderTriangles||this.triangles;
  const packed=this.stereographicGeometry?.packed,previous=this.surfaceGeometry.getAttribute('color');
  const colors=packed&&previous?.itemSize===4&&previous.array.length>=triangles.length*12?previous.array:new Float32Array(triangles.length*12),metadata=this.model.metadata?.offColors;this.surfaceVertexAlpha=false;
  const cache=new Map();
  for(let i=0;i<triangles.length;i++){
    const face=packed?packed.faceIds[i]:triangles[i].face,cell=packed?(packed.cellIds[i]<0?undefined:packed.cellIds[i]):triangles[i].cell;
    const owner=cell??this.visibility.faceOwners[face]?.find(c=>this.visibility.activeCellSet.has(c));
    const key=`${face}:${owner??''}`;let rgba=cache.get(key);
    if(!rgba){const supplied=metadata?.faces?.[face]||metadata?.cells?.[owner];
    let color=new THREE.Color(0x9aaec3),alpha=1;
    if(mode==='source'&&supplied){const factor=supplied.encoding==='byte'?1/255:1;color.setRGB(...supplied.values.slice(0,3).map(x=>x*factor),THREE.SRGBColorSpace);if(supplied.values.length===4)alpha=supplied.values[3]*factor;}
    else if(mode==='cell'&&owner!==undefined)color.setHSL((owner*.173+.58)%1,.32,.6);
    else if(mode==='face')color.setHSL((face*.173+.58)%1,.32,.6);
    rgba=[...color.toArray(),alpha];cache.set(key,rgba);}
    if(rgba[3]<1)this.surfaceVertexAlpha=true;
    for(let j=0;j<3;j++)colors.set(rgba,i*12+j*4);
  }
  if(colors===previous?.array)previous.needsUpdate=true;else {if(previous)this.surfaceGeometry.dispose();this.surfaceGeometry.setAttribute('color',new THREE.BufferAttribute(colors,4));}
  this.surface.material.vertexColors=true;this.surface.material.color.set(0xffffff);this.surface.material.needsUpdate=true;
}

// Fixed old owner-comparison algorithm, likewise independent of integration.
const legacyOwnerKeys=['vertexIds','vertexFaces','vertexCells','edgeIds','edgeFaces','edgeCells','edgeInstanceIds','faceIds','cellIds','triangleIds','triangleInstanceIds'];
export function legacySameTypedDisplayOwners(a,b){return Boolean(a&&b&&a.owner.sourceKey===b.owner.sourceKey&&legacyOwnerKeys.every(key=>a[key].length===b[key].length&&a[key].every((n,i)=>n===b[key][i])));}
