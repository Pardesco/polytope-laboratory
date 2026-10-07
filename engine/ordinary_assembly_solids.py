"""GPL-3.0-or-later. Original bounded ordinary-solid contact oracle.

Actual source-face triangulation, closed surface self/contact intersections and
signed solid angles; no hull, Boolean replacement, metric weld or star interior.
"""
from itertools import combinations
import math
import numpy as np
from .geometry import GeometryError
from .generalized_nets import _shell_geometry,source_triangles

EPS=1e-8
MAX_TRIANGLES=1500
MAX_PAIRS=300000
MAX_QUERY_VISITS=2000000

def _require(value,message):
    if not value:raise GeometryError('Ordinary assembly solid: '+message)

def _cross(a,b):return float(a[0]*b[1]-a[1]*b[0])

def _unique(points,tol):
    result=[]
    for p in points:
        if not any(np.linalg.norm(p-q)<=tol for q in result):result.append(p)
    return result

def triangle_contact(a,b,tol=EPS*4):
    """All extreme points of the closed intersection of two actual triangles."""
    a=np.asarray(a,dtype=float);b=np.asarray(b,dtype=float)
    if np.any(np.minimum(a.max(0),b.max(0))-np.maximum(a.min(0),b.min(0)) < -tol):return []
    na=np.cross(a[1]-a[0],a[2]-a[0]);nb=np.cross(b[1]-b[0],b[2]-b[0]);la=float(np.linalg.norm(na));lb=float(np.linalg.norm(nb))
    _require(la>EPS**2 and lb>EPS**2,'triangle contact has numerically degenerate source triangles.')
    na/=la;nb/=lb
    axis=np.cross(na,nb);length=float(np.linalg.norm(axis));da=(b-a[0])@na;db=(a-b[0])@nb
    if length<=EPS*4:
        if np.max(abs(da))>tol:return []
        u=a[1]-a[0];u/=np.linalg.norm(u);v=np.cross(na,u);basis=np.asarray([u,v]);aa=(a-a[0])@basis.T;poly=list((b-a[0])@basis.T)
        # Closed convex clipping includes point/segment contact and coplanar area.
        for x,y in zip(aa,np.roll(aa,-1,axis=0)):
            if not poly:break
            edge=y-x;scale=float(np.linalg.norm(edge));out=[]
            for p,q in zip(poly,poly[1:]+poly[:1]):
                dp=_cross(edge,p-x)/scale;dq=_cross(edge,q-x)/scale
                pin=dp>=-tol;qin=dq>=-tol
                if pin:out.append(p)
                if pin!=qin:
                    den=dp-dq
                    if abs(den)>1e-15:out.append(p+(dp/den)*(q-p))
            poly=_unique(out,tol)
        return _unique([a[0]+q@basis for q in poly],tol)
    if EPS*4<length<EPS*32:_require(False,'nearly parallel triangle planes are numerically unresolved.')
    if (min(da)>tol or max(da)<-tol or min(db)>tol or max(db)<-tol):return []
    axis/=length
    def cut(cloud,distances):
        hits=[]
        for p,q,dp,dq in zip(cloud,np.roll(cloud,-1,axis=0),distances,np.roll(distances,-1)):
            if abs(dp)<=tol:hits.append(p)
            if dp*dq<0:hits.append(p+dp/(dp-dq)*(q-p))
        return _unique(hits,tol)
    first=cut(a,db);second=cut(b,da)
    if not first or not second:return []
    reference=first[0];one=sorted(float((p-reference)@axis) for p in first);two=sorted(float((p-reference)@axis) for p in second)
    low=max(one[0],two[0]);high=min(one[-1],two[-1])
    if low>high+tol:return []
    return _unique([reference+axis*low,reference+axis*high],tol)

def _on_triangle(point,triangle,tol=EPS*8):
    a,b,c=triangle;n=np.cross(b-a,c-a);n/=np.linalg.norm(n)
    if abs(float((point-a)@n))>tol:return False
    return all(float(np.cross(y-x,point-x)@n)>=-tol*float(np.linalg.norm(y-x)) for x,y in ((a,b),(b,c),(c,a)))

def solid_location(point,triangles):
    """Closed embedded oriented surface: outside=0, inside=1, boundary=-1.

    Direct signed solid-angle sum, no sampled ray or approximate fast tree.
    Ambiguous noninteger sums fail rather than selecting an assumed interior.
    """
    point=np.asarray(point,dtype=float);cloud=np.asarray(triangles,dtype=float)
    if any(_on_triangle(point,t) for t in cloud):return -1
    r=cloud-point;a,b,c=r[:,0],r[:,1],r[:,2];la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);lc=np.linalg.norm(c,axis=1)
    numerator=np.einsum('ij,ij->i',a,np.cross(b,c))
    denominator=la*lb*lc+np.einsum('ij,ij->i',a,b)*lc+np.einsum('ij,ij->i',b,c)*la+np.einsum('ij,ij->i',c,a)*lb
    winding=float(np.sum(2*np.arctan2(numerator,denominator))/(4*math.pi))
    _require(math.isfinite(winding) and min(abs(winding),abs(winding-1))<=1e-6,'solid-angle side is ambiguous; no interior was assumed.')
    return 1 if abs(winding-1)<=1e-6 else 0

def qualify_piece_solids(points,faces,groups,edges,pinched,*,cancelled=None):
    """Source incidence decomposition must already be explicit and checked."""
    original=np.asarray(points,dtype=float);span=float(np.max(np.ptp(original,axis=0)));p=(original-original.mean(0))/span
    normals={};proofs=[];piece_vertices=[];meshes=[];work=0;visits=0
    def stop():
        if cancelled is not None and cancelled():raise GeometryError('Ordinary assembly solid qualification canceled before publication.')
    def budget():
        nonlocal work
        work+=1
        _require(work<=MAX_PAIRS,'surface contact verification exceeds 300000 triangle pairs.')
        if work%256==0:stop()
    def allowed(point,vertices,common_edges):
        if any(np.linalg.norm(point-p[v])<=EPS*8 for v in vertices):return True
        for a,b in common_edges:
            u=p[b]-p[a];t=float((point-p[a])@u)/float(u@u)
            if -EPS*8<=t<=1+EPS*8 and np.linalg.norm(point-(p[a]+t*u))<=EPS*8:return True
        return False
    for pi,group in enumerate(groups):
        stop();ids=sorted({v for f in group for v in faces[f]});mapping={v:i for i,v in enumerate(ids)};cycles=[[mapping[v] for v in faces[f]] for f in group]
        local_edges=sorted({tuple(sorted((a,b))) for f in cycles for a,b in zip(f,f[1:]+f[:1])});chi=len(ids)-len(local_edges)+len(group)
        _require(chi<=2 and (2-chi)%2==0,'closed orientable source piece has unsupported Euler characteristic.')
        model=dict(id='assembly-piece-'+str(pi),dimension=3,embeddingDimension=3,interpretation='generalized-complex',vertices=p[ids].tolist(),faces=cycles,edges=[list(e) for e in local_edges],cells=[])
        _,ns,_=_shell_geometry(model);records=[]
        for f,n in zip(group,ns):
            u=p[faces[f][1]]-p[faces[f][0]];u/=np.linalg.norm(u);basis=np.asarray([u,np.cross(n,u)])
            records.append(dict(id=f,sourceVertices=faces[f],points=((p[faces[f]]-p[faces[f][0]])@basis.T).tolist()))
        refs=source_triangles(records);_require(sum(len(m) for m in meshes)+len(refs)<=MAX_TRIANGLES,'source-face triangulation exceeds 1500 triangles.')
        mesh=[]
        for ref in refs:
            f=ref['face'];tri=p[ref['sourceVertices']];n=ns[group.index(f)]
            if float(np.cross(tri[1]-tri[0],tri[2]-tri[0])@n)<0:tri=tri[[0,2,1]]
            mesh.append((f,tri))
        center=p[ids].mean(0);volume=sum(float((t[0]-center)@np.cross(t[1]-center,t[2]-center))/6 for _,t in mesh)
        _require(abs(volume)>EPS**2,'closed source piece has numerically unresolved solid volume.')
        if volume<0:ns=[-n for n in ns];mesh=[(f,t[[0,2,1]]) for f,t in mesh]
        boundary_edges={f:{tuple(sorted(e)) for e in zip(faces[f],faces[f][1:]+faces[f][:1])} for f in group}
        for (f,a),(g,b) in combinations(mesh,2):
            if f==g:continue
            budget();hits=triangle_contact(a,b)
            common=set(faces[f])&set(faces[g]);shared=boundary_edges[f]&boundary_edges[g]
            checks=hits+[(a+b)/2 for a,b in zip(hits,hits[1:]+hits[:1])]+([np.mean(hits,axis=0)] if hits else [])
            _require(all(allowed(h,common,shared) for h in checks),f'piece {pi} has self-crossing/touching source faces {f}/{g} without literal boundary incidence.')
        for f,n in zip(group,ns):normals[f]=n
        convex=all(float(np.max((p[ids]-p[faces[f][0]])@n))<=EPS*4 for f,n in zip(group,ns))
        proofs.append(dict(id=pi,sourceFaceIds=group,sourceVertexIds=ids,eulerCharacteristic=chi,genus=(2-chi)//2,ordinaryVertexLinks=True,convexSupportingFaces=convex,
            embeddedSurface=True,outwardBySignedVolume=True,volumeSourceUnits=abs(volume)*span**3,sourceTriangleCount=len(mesh)))
        piece_vertices.append(ids);meshes.append(mesh)
    contacts=[];lookup={tuple(sorted(e)):i for i,e in enumerate(edges)}
    for i,j in combinations(range(len(groups)),2):
        stop();common=sorted(set(piece_vertices[i])&set(piece_vertices[j]));edge=None
        if common:
            _require(len(common)==2 and tuple(common) in lookup and lookup[tuple(common)] in pinched,'piece contact must be one literal four-face edge, not vertex/face/multiple contacts.')
            edge=lookup[tuple(common)]
        pair_work=work
        for _,a in meshes[i]:
            for _,b in meshes[j]:
                budget();hits=triangle_contact(a,b);checks=hits+[(a+b)/2 for a,b in zip(hits,hits[1:]+hits[:1])]+([np.mean(hits,axis=0)] if hits else [])
                _require(all(allowed(h,common,[common] if edge is not None else []) for h in checks),'piece closures touch/cross beyond their declared literal source edge.')
        # Without additional surface intersection, the connected ordinary
        # surface minus this one edge has constant side relative to the other
        # solid. Check all noncontact vertices and actual triangle barycentres;
        # this also refuses pure containment, absent any surface crossing.
        query_count=0
        for a,b in ((i,j),(j,i)):
            target=[t for _,t in meshes[b]];samples=[p[v] for v in piece_vertices[a] if v not in common]+[t.mean(0) for _,t in meshes[a]]
            for sample in samples:
                visits+=len(target);query_count+=1
                _require(visits<=MAX_QUERY_VISITS,'solid-angle side verification exceeds 2000000 triangle visits.')
                if query_count%32==0:stop()
                _require(solid_location(sample,target)==0,'piece surface lies inside/on the other solid; overlap or unresolved contact is unsupported.')
        if edge is not None:
            _require(all(solid_location(p[v],[t for _,t in meshes[k]])==-1 for k in (i,j) for v in common),'declared source-edge endpoint is not on both actual solid boundaries.')
            contacts.append(dict(pieces=[i,j],sourceEdgeId=edge,sourceVertexIds=common,intersectionEndpoints=original[common].tolist(),interiorDisjoint=True,
                surfaceTrianglePairs=work-pair_work,solidSideQueries=query_count,method='complete source triangle contacts plus signed-solid-angle sides'))
    stop()
    return dict(normals=normals,pieces=proofs,contacts=contacts,work=work,queryVisits=visits,tolerance=span*EPS*8)
