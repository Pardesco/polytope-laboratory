/** Display-only planar cycle filling. Source cycles and coordinates stay intact.
 * Crossings become virtual triangle points, never new incidence vertices.
 * Float64 predicates are approximate; unsupported faces are reported explicitly.
 */
const EPS = 1e-9;
export const FACE_FILL_LIMITS = Object.freeze({faceVertices:512, slabs:8192, triangles:250000});
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const minus = (a,b) => a.map((x,i)=>x-b[i]);
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];

function frame(points){
  const origin=points[0],relative=points.map(p=>minus(p,origin));
  const scale=Math.max(...relative.map(p=>Math.hypot(...p)));
  if(!Number.isFinite(scale)||scale===0)throw Error('degenerate face');
  const q=relative.map(p=>p.map(x=>x/scale));
  const first=q.reduce((a,b)=>dot(a,a)>dot(b,b)?a:b);
  const u=first.map(x=>x/Math.hypot(...first));
  const residual=q.map(p=>p.map((x,i)=>x-dot(p,u)*u[i]));
  const second=residual.reduce((a,b)=>dot(a,a)>dot(b,b)?a:b);
  const length=Math.hypot(...second);
  if(length<EPS)throw Error('face has affine dimension below two');
  const v=second.map(x=>x/length),local=q.map(p=>[dot(p,u),dot(p,v)]);
  if(q.some((p,j)=>Math.hypot(...p.map((x,i)=>x-local[j][0]*u[i]-local[j][1]*v[i]))>EPS*8))throw Error('nonplanar face');
  return {local,restore:p=>origin.map((x,i)=>x+scale*(p[0]*u[i]+p[1]*v[i]))};
}

// This full half-plane test rejects pentagrams, whose turns alone have one sign.
function isConvex(q){
  // Different source IDs can coincide geometrically. A cycle traversing a
  // convex boundary twice has winding 2 and must use the arrangement path.
  for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++)if(Math.hypot(...minus(q[i],q[j]))<=EPS)return false;
  let orientation=0;
  for(let i=0;i<q.length;i++){
    const a=q[i],b=q[(i+1)%q.length],edge=minus(b,a);
    for(const p of q){
      const c=cross(edge,minus(p,a));
      if(Math.abs(c)<=EPS)continue;
      const sign=Math.sign(c);
      if(orientation&&sign!==orientation)return false;
      orientation=sign;
    }
  }
  return orientation!==0;
}

function triangulate(q,fillRule,triangleBudget){
  const segments=q.map((a,i)=>({a,b:q[(i+1)%q.length]}));
  const cuts=q.map(p=>p[0]);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const {a,b}=segments[i],{a:c,b:d}=segments[j],r=minus(b,a),s=minus(d,c),den=cross(r,s);
    if(Math.abs(den)<=EPS*EPS)continue; // Parallel/coincident edges aggregate in each slab.
    const t=cross(minus(c,a),s)/den,u=cross(minus(c,a),r)/den;
    if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)cuts.push(a[0]+t*r[0]);
  }
  cuts.sort((a,b)=>a-b);
  const xs=cuts.filter((x,i)=>i===0||x-cuts[i-1]>EPS);
  if(xs.length>FACE_FILL_LIMITS.slabs)throw Error('face exceeds slab resource limit');
  const triangles=[];
  const yAt=(s,x)=>s.a[1]+(x-s.a[0])*(s.b[1]-s.a[1])/(s.b[0]-s.a[0]);
  const add=(a,b,c)=>{
    if(Math.abs(cross(minus(b,a),minus(c,a)))<=EPS*EPS)return;
    if(triangles.length>=triangleBudget)throw Error('model exceeds triangle resource limit');
    triangles.push([a,b,c]);
  };
  for(let i=0;i<xs.length-1;i++){
    const left=xs[i],right=xs[i+1],middle=(left+right)/2;
    const hits=segments.filter(s=>middle>Math.min(s.a[0],s.b[0])&&middle<Math.max(s.a[0],s.b[0]))
      .map(s=>({s,y:yAt(s,middle),delta:Math.sign(s.b[0]-s.a[0])})).sort((a,b)=>a.y-b.y);
    const groups=[];
    for(const hit of hits){
      const previous=groups.at(-1);
      if(previous&&Math.abs(hit.y-previous.y)<=EPS){previous.delta+=hit.delta;previous.count++;}
      else groups.push({...hit,count:1});
    }
    let winding=0,parity=0;
    for(let j=0;j<groups.length-1;j++){
      const bottom=groups[j],top=groups[j+1];winding+=bottom.delta;parity=(parity+bottom.count)%2;
      if((fillRule==='nonzero'?winding!==0:parity!==0)&&top.y-bottom.y>EPS){
        const a=[left,yAt(bottom.s,left)],b=[right,yAt(bottom.s,right)],c=[right,yAt(top.s,right)],d=[left,yAt(top.s,left)];
        add(a,b,c);add(a,c,d);
      }
    }
  }
  return triangles;
}

export function buildFaceSurfaces(model,fillRule='nonzero',options={}){
  if(!['nonzero','even-odd'].includes(fillRule))throw Error('Face fill rule must be nonzero or even-odd.');
  const faces=model.faces||[],requested=options.faceIds;
  if(requested!==undefined&&(!Array.isArray(requested)||new Set(requested).size!==requested.length||requested.some(i=>!Number.isInteger(i)||i<0||i>=faces.length)))throw Error('Face selection must contain unique valid source face IDs.');
  const entries=requested===undefined?faces.entries():requested.map(face=>[face,faces[face]]);
  const triangles=[],diagnostics=[];let filledFaces=0;
  for(const [face,ids] of entries){
    try{
      if(ids.length<3||new Set(ids).size!==ids.length)throw Error('invalid or repeated source vertex IDs');
      if(ids.length>FACE_FILL_LIMITS.faceVertices)throw Error('face exceeds vertex resource limit');
      const points=ids.map(id=>model.vertices[id]);
      const dimension=points[0]?.length;
      if(!dimension||points.some(p=>!p||p.length!==dimension||p.some(x=>!Number.isFinite(x))))throw Error('invalid source coordinates');
      const {local,restore}=frame(points);
      let result;
      if(isConvex(local))result=ids.slice(1,-1).map((_,i)=>({points:[points[0],points[i+1],points[i+2]],vertices:[ids[0],ids[i+1],ids[i+2]],face}));
      else {
        // These identities belong only to the approximate planar paint mesh.
        // The existing EPS grouping of crossings/cuts also defines its corner
        // coincidence tolerance; native source vertices/cycles stay untouched.
        const corners=[],buckets=new Map(),key=(x,y)=>`${x},${y}`;
        const register=p=>{
          const x=Math.floor(p[0]/EPS),y=Math.floor(p[1]/EPS);let found=null;
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const id of buckets.get(key(x+dx,y+dy))||[]){
            const q=corners[id];if(Math.hypot(p[0]-q[0],p[1]-q[1])<=EPS&&(found===null||id<found))found=id;
          }
          if(found!==null)return found;
          const id=corners.length;corners.push([...p]);const k=key(x,y);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);return id;
        };
        result=triangulate(local,fillRule,FACE_FILL_LIMITS.triangles-triangles.length).map(t=>{
          const presentationCornerIds=t.map(register);
          return {points:presentationCornerIds.map(id=>restore(corners[id])),face,presentationCornerIds};
        }).filter(t=>new Set(t.presentationCornerIds).size===3);
      }
      if(triangles.length+result.length>FACE_FILL_LIMITS.triangles)throw Error('model exceeds triangle resource limit');
      for(const triangle of result)triangles.push(triangle);
      filledFaces++;
    }catch(error){diagnostics.push({face,reason:error.message});}
  }
  return {triangles,diagnostics,filledFaces,suppressedFaces:diagnostics.length,fillRule,
    consideredFaces:requested===undefined?faces.length:requested.length,sourceFaces:faces.length,
    semantics:'per-source-face planar winding fill; no filled-volume interpretation',numeric:'float64-approximate'};
}
