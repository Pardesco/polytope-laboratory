// Broad phase only: sourceEntityHits still performs every exact distance test.
export class ScreenPickIndex{
  constructor(kind,primitives,{cellSize=64,maxReferences=262144}={}){
    this.cells=new Map();this.global=[];this.cellSize=cellSize;let references=0;
    const radius=kind==='vertex'?14:8;
    for(const primitive of primitives){
      const points=kind==='vertex'?[primitive.point]:primitive.points;
      const x0=Math.floor((Math.min(...points.map(p=>p[0]))-radius)/cellSize),x1=Math.floor((Math.max(...points.map(p=>p[0]))+radius)/cellSize),y0=Math.floor((Math.min(...points.map(p=>p[1]))-radius)/cellSize),y1=Math.floor((Math.max(...points.map(p=>p[1]))+radius)/cellSize),count=(x1-x0+1)*(y1-y0+1);
      if(![x0,x1,y0,y1].every(Number.isSafeInteger)||count>64||references+count>maxReferences){this.global.push(primitive);continue;}
      references+=count;
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;let bucket=this.cells.get(key);if(!bucket)this.cells.set(key,bucket=[]);bucket.push(primitive);}
    }
  }
  query(x,y){const bucket=this.cells.get(Math.floor(x/this.cellSize)+','+Math.floor(y/this.cellSize))||[];return this.global.length?bucket.concat(this.global):bucket;}
}

export function screenPickKey(camera,width,height,viewer){
  return JSON.stringify([width,height,camera.matrixWorldInverse.elements,camera.projectionMatrix.elements,viewer.edgeGeometry.attributes.position.version,viewer.pointGeometry.attributes.position.version]);
}
