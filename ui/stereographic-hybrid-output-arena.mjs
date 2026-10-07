/** Source-bound hybrid worker output arena. Seed full triangle capacity for
 * >=1000 visible input instances; grow smaller snapshots. Edge capacity follows
 * visible instances. These are allocation heuristics; caps and completeness
 * remain the adaptive worker/transport contract. Decode prefixes before transfer.
 */
import {validateStereographicInput,STEREOGRAPHIC_WORKER_LIMITS} from './stereographic-worker-protocol.mjs';
import {STEREO_VIEW_LIMITS} from './viewer-stereographic.mjs';

const fail=message=>{throw Error(`Stereographic output arena: ${message}`);};
const defaults=Object.freeze({segments:STEREO_VIEW_LIMITS.segments,triangles:STEREO_VIEW_LIMITS.triangles,bytes:STEREOGRAPHIC_WORKER_LIMITS.bytes});
function limits(value){
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('Limits must be a plain record.');
  const result={...defaults};
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!(key in defaults)||!descriptor||!('value' in descriptor))fail('Limits contain an unknown key or accessor.');
    const n=descriptor.value;if(!Number.isSafeInteger(n)||n<0||n>defaults[key])fail('Limits may only lower existing resource bounds.');result[key]=n;
  }
  // Includes all coordinate, normal and owner arrays allocated by this arena.
  if(result.segments*40+result.triangles*88>result.bytes)fail('Capacity exceeds the arena byte bound.');
  return result;
}
function data(value,key,label){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!('value' in descriptor))fail(`${label} must have an own data property.`);
  return descriptor.value;
}
function vector(value,label){
  if(!Array.isArray(value)||value.length!==3)fail(`${label} must have three finite coordinates.`);
  for(let k=0;k<3;k++){
    const n=data(value,k,label);if(!Number.isFinite(n)||Math.abs(n)>STEREOGRAPHIC_WORKER_LIMITS.coordinate)fail(`${label} must have finite bounded coordinates.`);
  }
}
function triple(value,label){
  if(!Array.isArray(value)||value.length!==3)fail(`${label} must have three vectors.`);
  for(let k=0;k<3;k++)vector(data(value,k,label),label);
}
function normalFallback(points){
  // Deliberately matches the existing worker arithmetic/order, including zero.
  const [a,b,c]=points,u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal),unit=normal.map(x=>length?x/length:0);
  return [unit,unit,unit];
}
const finite=n=>Number.isFinite(n)&&Math.abs(n)<=STEREOGRAPHIC_WORKER_LIMITS.coordinate;

export class HybridStereographicOutputArena{
  #input;#buffers;#limits;#capacity;#allocatedBytes=0;#growths=0;#segments=0;#triangles=0;#lastEdge=-1;#lastTriangle=-1;#finished=false;
  constructor(input,overrides={}){
    const cap=limits(overrides);this.#input=validateStereographicInput(input);this.#limits=cap;
    const edges=this.#input.edgeVisible.reduce((n,v)=>n+v,0),triangles=this.#input.triangleVisible.reduce((n,v)=>n+v,0);
    this.#capacity={segments:Math.min(cap.segments,edges?Math.max(32,edges*2):0),triangles:Math.min(cap.triangles,triangles>=1000?cap.triangles:triangles?Math.max(32,triangles*16):0)};
    this.#buffers={segments:new Float32Array(this.#capacity.segments*6),edgeIds:new Uint32Array(this.#capacity.segments),edgeFaces:new Int32Array(this.#capacity.segments),edgeCells:new Int32Array(this.#capacity.segments),edgeInstanceIds:new Uint32Array(this.#capacity.segments),triangles:new Float32Array(this.#capacity.triangles*9),normals:new Float32Array(this.#capacity.triangles*9),faceIds:new Uint32Array(this.#capacity.triangles),cellIds:new Int32Array(this.#capacity.triangles),triangleIds:new Uint32Array(this.#capacity.triangles),triangleInstanceIds:new Uint32Array(this.#capacity.triangles)};
    this.#allocatedBytes=this.capacityBytes;
  }
  get capacityBytes(){return this.#capacity.segments*40+this.#capacity.triangles*88;}
  get cumulativeAllocatedBytes(){return this.#allocatedBytes;}
  get growthCount(){return this.#growths;}
  get segmentCapacity(){return this.#capacity.segments;}
  get triangleCapacity(){return this.#capacity.triangles;}
  #ensure(kind,total){
    if(total<=this.#capacity[kind])return;
    const old=this.#capacity[kind],next=Math.min(this.#limits[kind],Math.max(total,old?old*2:32)),edge=kind==='segments',count=edge?this.#segments:this.#triangles;
    const transitionBytes=this.capacityBytes+next*(edge?40:88);
    if(transitionBytes>this.#limits.bytes)fail('Capacity transition exceeds the live arena byte bound.');
    const replacements={};
    for(const [key,array] of Object.entries(this.#buffers)){
      const isEdge=key==='segments'||key.startsWith('edge');if(isEdge!==edge)continue;
      const stride=key==='segments'?6:['triangles','normals'].includes(key)?9:1;
      const replacement=new array.constructor(next*stride);replacement.set(array.subarray(0,count*stride));replacements[key]=replacement;
    }
    Object.assign(this.#buffers,replacements);this.#capacity[kind]=next;this.#growths++;this.#allocatedBytes+=next*(edge?40:88);
  }
  get segmentCount(){return this.#segments;}
  get triangleCount(){return this.#triangles;}
  get remainingSegments(){return this.#limits.segments-this.#segments;}
  get remainingTriangles(){return this.#limits.triangles-this.#triangles;}
  #instance(instance,kind){
    if(this.#finished)fail('The arena is already finished.');
    const edge=kind==='edge',input=this.#input,n=(edge?input.edgeIds:input.faceIds).length,last=edge?this.#lastEdge:this.#lastTriangle;
    if(!Number.isSafeInteger(instance)||instance<0||instance>=n||instance<last)fail('Instance must follow native input order.');
    if(!(edge?input.edgeVisible:input.triangleVisible)[instance])fail('Masked instances cannot own output.');
  }
  #preflight(instance,batch,kind){
    this.#instance(instance,kind);const edge=kind==='edge';
    if(!Array.isArray(batch)||batch.length>(edge?this.remainingSegments:this.remainingTriangles))fail('Batch exceeds the remaining resource bound.');
    // Validate the whole batch before writing any coordinates or advancing IDs.
    for(let i=0;i<batch.length;i++){
      const record=data(batch,i,'Batch');
      if(!record||typeof record!=='object')fail('Primitive must be a local data record.');
      if(edge){vector(data(record,'a','Segment'),'Segment endpoint');vector(data(record,'b','Segment'),'Segment endpoint');}
      else{
        triple(data(record,'points','Patch'),'Patch points');
        const descriptor=Object.getOwnPropertyDescriptor(record,'normals');
        if(descriptor&&!('value' in descriptor))fail('Normals must be a data property.');
        if(descriptor?.value!=null)triple(descriptor.value,'Patch normals');
      }
    }
  }
  appendSegments(instance,batch){
    this.#preflight(instance,batch,'edge');this.#ensure('segments',this.#segments+batch.length);const b=this.#buffers,input=this.#input;
    for(let k=0;k<batch.length;k++){
      const arc=batch[k],i=this.#segments++,offset=i*6;
      b.segments[offset]=arc.a[0];b.segments[offset+1]=arc.a[1];b.segments[offset+2]=arc.a[2];
      b.segments[offset+3]=arc.b[0];b.segments[offset+4]=arc.b[1];b.segments[offset+5]=arc.b[2];
      b.edgeInstanceIds[i]=instance;b.edgeIds[i]=input.edgeIds[instance];b.edgeFaces[i]=input.edgeFaces[instance];b.edgeCells[i]=input.edgeCells[instance];
    }
    this.#lastEdge=instance;
  }
  appendTriangles(instance,batch){
    this.#preflight(instance,batch,'triangle');this.#ensure('triangles',this.#triangles+batch.length);const b=this.#buffers,input=this.#input;
    for(let k=0;k<batch.length;k++){
      const patch=batch[k],points=patch.points,normals=Object.getOwnPropertyDescriptor(patch,'normals')?.value??normalFallback(points),i=this.#triangles++,offset=i*9;
      for(let vertex=0;vertex<3;vertex++){
        const p=points[vertex],n=normals[vertex],j=offset+vertex*3;
        b.triangles[j]=p[0];b.triangles[j+1]=p[1];b.triangles[j+2]=p[2];
        b.normals[j]=n[0];b.normals[j+1]=n[1];b.normals[j+2]=n[2];
      }
      b.triangleInstanceIds[i]=instance;b.faceIds[i]=input.faceIds[instance];b.cellIds[i]=input.cellIds[instance];b.triangleIds[i]=input.triangleIds[instance];
    }
    this.#lastTriangle=instance;
  }
  /** Scalar APIs avoid inspecting/cloning worker-local nested patch records.
   * Every argument is still finite/bounded, ownership is still taken only from
   * the validated source snapshot, and a rejected primitive advances nothing.
   */
  appendSegmentCoordinates(instance,ax,ay,az,bx,by,bz){
    this.#instance(instance,'edge');if(!this.remainingSegments)fail('Primitive exceeds the remaining resource bound.');
    if(!(finite(ax)&&finite(ay)&&finite(az)&&finite(bx)&&finite(by)&&finite(bz)))fail('Segment must have finite bounded coordinates.');
    this.#ensure('segments',this.#segments+1);const b=this.#buffers,input=this.#input,i=this.#segments++,j=i*6;
    b.segments[j]=ax;b.segments[j+1]=ay;b.segments[j+2]=az;b.segments[j+3]=bx;b.segments[j+4]=by;b.segments[j+5]=bz;
    b.edgeIds[i]=input.edgeIds[instance];b.edgeFaces[i]=input.edgeFaces[instance];b.edgeCells[i]=input.edgeCells[instance];b.edgeInstanceIds[i]=instance;this.#lastEdge=instance;
  }
  appendTriangleCoordinates(instance,ax,ay,az,bx,by,bz,cx,cy,cz,nax,nay,naz,nbx,nby,nbz,ncx,ncy,ncz){
    this.#instance(instance,'triangle');if(!this.remainingTriangles)fail('Primitive exceeds the remaining resource bound.');
    if(!(finite(ax)&&finite(ay)&&finite(az)&&finite(bx)&&finite(by)&&finite(bz)&&finite(cx)&&finite(cy)&&finite(cz)&&finite(nax)&&finite(nay)&&finite(naz)&&finite(nbx)&&finite(nby)&&finite(nbz)&&finite(ncx)&&finite(ncy)&&finite(ncz)))fail('Patch coordinates and normals must be finite and bounded.');
    this.#ensure('triangles',this.#triangles+1);const b=this.#buffers,input=this.#input,i=this.#triangles++,j=i*9;
    b.triangles[j]=ax;b.triangles[j+1]=ay;b.triangles[j+2]=az;b.triangles[j+3]=bx;b.triangles[j+4]=by;b.triangles[j+5]=bz;b.triangles[j+6]=cx;b.triangles[j+7]=cy;b.triangles[j+8]=cz;
    b.normals[j]=nax;b.normals[j+1]=nay;b.normals[j+2]=naz;b.normals[j+3]=nbx;b.normals[j+4]=nby;b.normals[j+5]=nbz;b.normals[j+6]=ncx;b.normals[j+7]=ncy;b.normals[j+8]=ncz;
    b.faceIds[i]=input.faceIds[instance];b.cellIds[i]=input.cellIds[instance];b.triangleIds[i]=input.triangleIds[instance];b.triangleInstanceIds[i]=instance;this.#lastTriangle=instance;
  }
  finish(){
    if(this.#finished)fail('The arena is already finished.');this.#finished=true;
    const result={};for(const [key,array] of Object.entries(this.#buffers)){
      const edge=key==='segments'||key.startsWith('edge'),count=edge?this.#segments:this.#triangles,stride=key==='segments'?6:['triangles','normals'].includes(key)?9:1;
      result[key]=array.subarray(0,count*stride);
    }
    return result;
  }
}

export const createHybridStereographicOutputArena=(input,limits={})=>new HybridStereographicOutputArena(input,limits);
