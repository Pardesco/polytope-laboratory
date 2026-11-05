// Frozen pre-W25 scalar reference, retained for output equality.
export function referenceHighlight({kind,indices,edgePositions=[],edgeIds=[],surfacePositions=[],triangles=[],faceOwners=[],activeCells=[],limit=100000}){
  const selected=new Set(indices),lines=[],fill=[],boundary=new Map(),active=new Set(activeCells);
  const empty=diagnostic=>({lines:[],fill:[],diagnostic});
  const segment=(a,b)=>{if(a.length===3&&b.length===3&&a.every(Number.isFinite)&&b.every(Number.isFinite)&&a.some((x,i)=>x!==b[i]))lines.push(...a,...b);};
  if(!selected.size||kind==='vertex')return empty(null);
  if(kind==='edge'){
    if(edgeIds.length>limit)return empty('Selection uses vertex dots: displayed edge traversal limit exceeded.');
    for(let i=0;i<edgeIds.length;i++)if(selected.has(edgeIds[i]))segment(Array.from(edgePositions.slice(i*6,i*6+3)),Array.from(edgePositions.slice(i*6+3,i*6+6)));
  }else if(kind==='face'||kind==='cell'){
    if(triangles.length>limit)return empty('Selection uses vertex dots: displayed surface traversal limit exceeded.');
    for(let i=0;i<triangles.length;i++){
      const t=triangles[i];
      if(t.visible===false)continue;
      const match=kind==='face'?selected.has(t.face):Number.isInteger(t.cell)?active.has(t.cell)&&selected.has(t.cell):(faceOwners[t.face]||[]).some(c=>active.has(c)&&selected.has(c));
      if(!match)continue;
      const p=Array.from(surfacePositions.slice(i*9,i*9+9));if(p.length!==9||!p.every(Number.isFinite))continue;
      const a=p.slice(0,3),b=p.slice(3,6),c=p.slice(6,9),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
      if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=1e-15)continue;
      fill.push(...p);
      for(const [x,y] of [[a,b],[b,c],[c,a]]){
        const keys=[x.join(','),y.join(',')].sort(),key=`${t.face}:${t.cell??''}:${keys.join('|')}`,entry=boundary.get(key);
        if(entry)entry.count++;else boundary.set(key,{a:x,b:y,count:1});
      }
    }
    for(const edge of boundary.values())if(edge.count===1)segment(edge.a,edge.b);
  }
  return {lines,fill,diagnostic:null};
}
