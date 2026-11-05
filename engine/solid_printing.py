"""Approximate, conforming solid boundaries; no convexification of stars."""
from collections import defaultdict, Counter
import numpy as np
from scipy.spatial import ConvexHull
from .geometry import GeometryError, identity

MAX_SOLID_TRIANGLES = 20000
EPS = 2e-9


def volume(p, t):
    q=p-p.mean(axis=0)
    return float(np.einsum('ij,ij->i',q[t[:,0]],np.cross(q[t[:,1]],q[t[:,2]])).sum()/6)


def triangulate(p, face):
    cloud=p[face];relative=cloud-cloud[0]
    _,s,axes=np.linalg.svd(relative,full_matrices=False)
    if s[1]<1e-10 or s[-1]>2e-8:
        raise GeometryError('Solid face is degenerate or nonplanar.')
    q=relative@axes[:2].T
    def cross(a,b):return float(a[0]*b[1]-a[1]*b[0])
    area=sum(cross(a,b) for a,b in zip(q,np.roll(q,-1,axis=0)))
    ids=list(range(len(face)))
    if area<0:ids.reverse()
    result=[]
    while len(ids)>3:
        for j,b in enumerate(ids):
            a,c=ids[j-1],ids[(j+1)%len(ids)]
            if cross(q[b]-q[a],q[c]-q[b])<=1e-13:continue
            if any(all(cross(q[v]-q[u],q[k]-q[u])>=-1e-13 for u,v in ((a,b),(b,c),(c,a))) for k in ids if k not in (a,b,c)):continue
            result.append([face[a],face[b],face[c]]);ids.pop(j);break
        else:raise GeometryError('Solid ear clipping is unresolved; faces must be simple planar polygons.')
    result.append([face[i] for i in ids])
    if area<0:result=[t[::-1] for t in result]
    return result


def components(t):
    edges=defaultdict(list)
    for i,triangle in enumerate(t):
        for a,b in zip(triangle,np.roll(triangle,-1)):edges[tuple(sorted((int(a),int(b))))].append(i)
    if any(len(ids)!=2 for ids in edges.values()):
        raise GeometryError('Solid is not watertight: every triangle edge must have exactly two uses.')
    neighbors=defaultdict(list)
    for a,b in edges.values():neighbors[a].append(b);neighbors[b].append(a)
    remaining=set(range(len(t)));groups=[]
    while remaining:
        queue=[min(remaining)];group=[]
        while queue:
            a=queue.pop()
            if a not in remaining:continue
            remaining.remove(a);group.append(a);queue.extend(neighbors[a])
        groups.append(group)
    return groups


def qualify_solid(shells, float32=False, intersections=False):
    volumes=[];boundary_count=0
    for shell in shells:
        p=shell['vertices'].astype(np.float32).astype(float) if float32 else shell['vertices']
        span=float(np.ptp(p,axis=0).max())
        if not np.isfinite(span) or span<=0:raise GeometryError('Solid shell has no finite spatial extent.')
        q=(p-p.mean(axis=0))/span;t=shell['triangles']
        if not np.isfinite(q).all() or len(np.unique(p,axis=0))!=len(p):
            raise GeometryError('Solid vertices collapse at the requested size or encoding precision.')
        areas=np.linalg.norm(np.cross(q[t[:,1]]-q[t[:,0]],q[t[:,2]]-q[t[:,0]]),axis=1)
        if np.any(areas<=1e-13):raise GeometryError('Solid has a degenerate triangle at the requested size or encoding precision.')
        directed=Counter((int(a),int(b)) for tri in t for a,b in zip(tri,np.roll(tri,-1)))
        if any(n!=1 or directed[b,a]!=1 for (a,b),n in directed.items()):
            raise GeometryError('Solid has inconsistent orientation or a nonmanifold edge.')
        groups=components(t);boundary_count+=len(groups)
        incident=defaultdict(list)
        for tri in t:
            for j,v in enumerate(tri):incident[int(v)].append((int(tri[(j+1)%3]),int(tri[(j+2)%3])))
        if set(incident)!=set(range(len(p))):raise GeometryError('Solid has unused vertices.')
        for link in incident.values():
            adjacency=defaultdict(list)
            for a,b in link:adjacency[a].append(b);adjacency[b].append(a)
            seen=set();queue=[next(iter(adjacency))]
            while queue:
                a=queue.pop()
                if a in seen:continue
                seen.add(a);queue.extend(adjacency[a])
            if len(seen)!=len(adjacency) or any(len(v)!=2 for v in adjacency.values()):
                raise GeometryError('Solid has a pinched or nonmanifold vertex link.')
        signs=[volume(q,t[g]) for g in groups]
        expected=2 if shell.get('hollow') else 1
        if len(signs)!=expected or sum(v>0 for v in signs)!=1 or any(abs(v)<=1e-13 for v in signs):
            raise GeometryError('Solid boundary orientation or cavity nesting is unresolved.')
        v=volume(p,t)
        if v<=0:raise GeometryError('Solid material volume must be positive.')
        if float32 or intersections:_unexpected_intersections(q,t)
        volumes.append(v)
    return volumes,boundary_count


def _orient(t):
    incidences=defaultdict(list)
    for i,tri in enumerate(t):
        for a,b in zip(tri,np.roll(tri,-1)):incidences[tuple(sorted((a,b)))].append((i,1 if a<b else -1))
    if any(len(v)!=2 for v in incidences.values()):raise GeometryError('Solid requires a closed edge-manifold boundary.')
    neighbors=defaultdict(list)
    for (a,da),(b,db) in incidences.values():neighbors[a].append((b,-da*db));neighbors[b].append((a,-da*db))
    signs={}
    for root in range(len(t)):
        if root in signs:continue
        signs[root]=1;queue=[root]
        while queue:
            a=queue.pop()
            for b,r in neighbors[a]:
                wanted=signs[a]*r
                if b in signs:
                    if signs[b]!=wanted:raise GeometryError('Solid boundary is nonorientable.')
                else:signs[b]=wanted;queue.append(b)
    return np.asarray([tri if signs[i]>0 else tri[::-1] for i,tri in enumerate(t)],dtype=int)


def _unexpected_intersections(p,t):
    """Bounded triangle/triangle test, allowing only common indexed boundaries."""
    triangles=p[t];lo=triangles.min(axis=1);hi=triangles.max(axis=1);budget=0
    def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
    for i,a in enumerate(triangles):
        candidates=np.flatnonzero(np.all(hi[i]+EPS>=lo,axis=1)&np.all(hi+EPS>=lo[i],axis=1))
        for j in candidates[candidates>i]:
            budget+=1
            if budget>2000000:raise GeometryError('Solid intersection guard exceeds two million candidate pairs.')
            b=triangles[j];common=set(t[i])&set(t[j])
            na=np.cross(a[1]-a[0],a[2]-a[0]);na/=np.linalg.norm(na)
            nb=np.cross(b[1]-b[0],b[2]-b[0]);nb/=np.linalg.norm(nb)
            def allowed(x):
                return any(np.linalg.norm(x-p[v])<EPS*4 for v in common) or len(common)==2 and np.linalg.norm(np.cross(x-p[min(common)],p[max(common)]-p[min(common)]))<EPS*4*np.linalg.norm(p[max(common)]-p[min(common)])
            if np.linalg.norm(np.cross(na,nb))<1e-8:
                if abs((b[0]-a[0])@na)>EPS:continue
                axes=np.delete(np.eye(3),np.argmax(abs(na)),axis=0).T;aa=a@axes;bb=b@axes
                for cloud,other in ((aa,bb),(bb,aa)):
                    orientation=np.sign(cross2(other[1]-other[0],other[2]-other[0]))
                    for k,x in enumerate(cloud):
                        if all(orientation*cross2(v-u,x-u)>=-EPS for u,v in zip(other,np.roll(other,-1,axis=0))):
                            point=(a if cloud is aa else b)[k]
                            if not allowed(point):raise GeometryError('Solid boundary has overlapping or touching triangles.')
                    for k,(u,v) in enumerate(zip(cloud,np.roll(cloud,-1,axis=0))):
                        for x,y in zip(other,np.roll(other,-1,axis=0)):
                            denominator=cross2(v-u,y-x)
                            if abs(denominator)<1e-14:continue
                            s=cross2(x-u,y-x)/denominator;r=cross2(x-u,v-u)/denominator
                            if -EPS<=s<=1+EPS and -EPS<=r<=1+EPS:
                                source=a if cloud is aa else b;point=source[k]+s*(source[(k+1)%3]-source[k])
                                if not allowed(point):raise GeometryError('Solid boundary has coplanar self-intersections.')
            else:
                for cloud,other,normal in ((a,b,nb),(b,a,na)):
                    for u,v in zip(cloud,np.roll(cloud,-1,axis=0)):
                        du=(u-other[0])@normal;dv=(v-other[0])@normal
                        if abs(du-dv)<1e-14:continue
                        ratio=du/(du-dv)
                        if not -EPS<=ratio<=1+EPS:continue
                        x=u+ratio*(v-u)
                        if all(np.dot(np.cross(y-z,x-z),normal)>=-EPS for z,y in zip(other,np.roll(other,-1,axis=0))) and not allowed(x):
                            raise GeometryError('Solid boundary has self-intersections or touching components.')


def _hollow(shell, thickness):
    p=shell['vertices'];t=shell['triangles'];span=float(np.ptp(p,axis=0).max());q=(p-p.mean(axis=0))/span
    normals=np.cross(q[t[:,1]]-q[t[:,0]],q[t[:,2]]-q[t[:,0]]);normals/=np.linalg.norm(normals,axis=1)[:,None]
    if any(np.max((q-q[tri[0]])@normal)>EPS for tri,normal in zip(t,normals)):
        raise GeometryError('Hollow shell currently requires a convex outer surface; nonconvex inward offsets are unsafe.')
    vertex_normals=np.zeros_like(q)
    for tri,n in zip(t,normals):
        for k,v in enumerate(tri):
            a=q[tri[(k+1)%3]]-q[v];b=q[tri[(k+2)%3]]-q[v]
            angle=np.arctan2(np.linalg.norm(np.cross(a,b)),a@b);vertex_normals[v]+=angle*n
    vertex_normals/=np.linalg.norm(vertex_normals,axis=1)[:,None]
    clearance=np.ones(len(p))
    for tri,n in zip(t,normals):clearance[tri]=np.minimum(clearance[tri],vertex_normals[tri]@n)
    if np.min(clearance)<1e-6:raise GeometryError('Hollow vertex normal has insufficient inward clearance.')
    inner=q-vertex_normals*(thickness/span/clearance)[:,None]
    for tri,n in zip(t,normals):
        if np.max((inner-q[tri[0]])@n)>-thickness/span+EPS:
            raise GeometryError('Hollow wall thickness cannot be maintained without crossing the outer surface.')
    inner_normals=np.cross(inner[t[:,1]]-inner[t[:,0]],inner[t[:,2]]-inner[t[:,0]])
    lengths=np.linalg.norm(inner_normals,axis=1)
    if np.min(lengths)<1e-13 or np.any(np.einsum('ij,ij->i',inner_normals,normals)<=1e-13):
        raise GeometryError('Hollow wall thickness collapses or reverses an inner face.')
    inner_normals/=lengths[:,None]
    if any(np.max((inner-inner[tri[0]])@n)>EPS for tri,n in zip(t,inner_normals)) or volume(inner,t)<=0:
        raise GeometryError('Hollow inward offset is not a safe nested convex shell; reduce wall thickness.')
    cavity=inner*span+p.mean(axis=0)
    shell['vertices']=np.concatenate((p,cavity));shell['triangles']=np.concatenate((t,t[:,::-1]+len(p)))
    shell['colors']=shell['colors']*2;shell['sourceFaceIds']=shell['sourceFaceIds']*2;shell['hollow']=True
    return volume(cavity,t)


def build_solid(model, display, nodes, size_mm, wall_mm=0, fill_rule='nonzero'):
    if model.get('dimension')!=3 or model.get('embeddingDimension',3)!=3 or display.get('solid_eligible') is not True or len(nodes)!=len(model['vertices']):
        raise GeometryError('Solid requires a complete, un-exploded 3D source display. Use Strut or Panels for projected 4D.')
    source=np.asarray(model['vertices'],dtype=float);origin=source.mean(axis=0);span=float(np.ptp(source,axis=0).max())
    if span<=0:raise GeometryError('Solid source has zero spatial extent.')
    normalized=(source-origin)/span
    if np.linalg.matrix_rank(normalized,tol=1e-10)!=3:raise GeometryError('Solid source must span three spatial dimensions.')
    target=nodes-nodes.mean(axis=0);display_span=float(np.ptp(nodes,axis=0).max())
    transform=np.linalg.lstsq(normalized,target,rcond=None)[0];singular=np.linalg.svd(transform,compute_uv=False)
    residual=float(np.max(np.linalg.norm(normalized@transform-target,axis=1)))/max(display_span,1e-30)
    if singular[-1]<=0 or np.ptp(singular)>2e-6*singular[0] or residual>2e-6:
        raise GeometryError('Solid requires source-ordered display vertices related by a rigid rotation and uniform scale.')
    from .visible_surface import visible_surface
    from .interchange import face_colors
    # Region unions already expose their disjoint-cell boundary, often larger
    # than the paper extractor. Verify geometry rather than trusting its label.
    direct=model.get('interpretation') in ('convex-polytope','polyhedral-region-union')
    if not direct and len(model['faces'])>100:
        if sum(len(f)-2 for f in model['faces'])>MAX_SOLID_TRIANGLES:
            raise GeometryError('Solid printing exceeds the 20,000-triangle guard limit.')
        # An already embedded connected boundary needs no arrangement. This
        # admits larger face-surgery results without relaxing paper-net limits.
        probe=_orient(np.asarray([t for f in model['faces'] for t in triangulate(normalized,f)],dtype=int))
        if len(components(probe))!=1:
            raise GeometryError('Large generalized Solid requires one simple embedded shell; intersecting/disconnected sources retain the 100-face arrangement limit.')
        if volume(normalized,probe)<0:probe=probe[:,::-1]
        qualify_solid([{'vertices':normalized,'triangles':probe}]);_unexpected_intersections(normalized,probe)
        direct=True
    surface=model if direct else visible_surface(model,fill_rule=fill_rule)
    meta=surface.get('metadata',{}).get('visibleSurface',{}) if not direct else {}
    face_ids=meta.get('sourceFaceIds',list(range(len(surface['faces']))));colors=face_colors(surface)
    p=(np.asarray(surface['vertices'])-origin)/span
    ts=[];owners=[];rgba=[]
    for fi,face in enumerate(surface['faces']):
        triangles=triangulate(p,face);ts.extend(triangles);owners.extend([face_ids[fi]]*len(triangles));rgba.extend([colors[fi]]*len(triangles))
    if len(ts)>MAX_SOLID_TRIANGLES:raise GeometryError('Solid printing exceeds the 20,000-triangle guard limit.')
    t=_orient(np.asarray(ts,dtype=int))
    # Verify direct boundaries and the extracted arrangement alike.
    _unexpected_intersections(p,t)
    p=p@transform;p-= (p.min(axis=0)+p.max(axis=0))/2
    scale=size_mm/float(np.ptp(p,axis=0).max());p*=scale
    shells=[]
    for i,group in enumerate(components(t)):
        tris=t[group];used=np.unique(tris);mapping=np.full(len(p),-1,dtype=int);mapping[used]=np.arange(len(used));tris=mapping[tris]
        if volume(p[used],tris)<0:tris=tris[:,::-1]
        shells.append({'name':'solid' if i==0 else 'solid_'+str(i),'vertices':p[used].copy(),'triangles':tris,
                       'sourceFaceIds':[owners[j] for j in group],'colors':[rgba[j] for j in group]})
    if model.get('interpretation')=='polyhedral-region-union':
        # Check both sides against the actual cell union. This also refuses
        # nested/overlapping alleged components and unsupported cavity shells.
        centers=[];normals=[]
        for shell in shells:
            cloud=shell['vertices'][shell['triangles']]/scale
            n=np.cross(cloud[:,1]-cloud[:,0],cloud[:,2]-cloud[:,0]);n/=np.linalg.norm(n,axis=1)[:,None]
            centers.extend(cloud.mean(axis=1));normals.extend(n)
        centers=np.asarray(centers);normals=np.asarray(normals)
        shift=((np.asarray(surface['vertices'])-origin)/span@transform)
        shift=(shift.min(axis=0)+shift.max(axis=0))/2
        equations=[ConvexHull((np.asarray(piece['vertices'])-origin)/span@transform-shift).equations for piece in model['convexPieces']]
        delta=5e-7*display_span
        inside=[]
        for sign in (-1,1):
            points=centers+sign*delta*normals;filled=np.zeros(len(points),dtype=bool)
            for eq in equations:filled|=np.all(points@eq[:,:3].T+eq[:,3]<0,axis=1)
            inside.append(filled)
        if not inside[0].all() or inside[1].any():
            raise GeometryError('Solid region-union exterior is unresolved: cavity, overlapping boundary, or thin feature.')
    volumes,boundaries=qualify_solid(shells);outer_volume=sum(volumes);cavity=0.
    if wall_mm:
        for shell in shells:cavity+=_hollow(shell,wall_mm)
        volumes,boundaries=qualify_solid(shells)
    lo=p.min(axis=0);hi=p.max(axis=0)
    warnings=list(dict.fromkeys(display.get('diagnostics',[])))+['Approximate outer surface solid; inspect supports and slicer preview before printing.']
    if wall_mm:warnings.append('Closed hollow cavity has no drain holes. Vertex-normal offsets guarantee minimum face-plane wall clearance; wall thickness can be larger near corners.')
    report={'mode':'solid','solidPolicy':'outer surface solid','units':'millimeter','triangleCount':sum(len(s['triangles']) for s in shells),
            'shellCount':len(shells),'boundaryShellCount':boundaries,'volumeMM3':sum(volumes),'outerVolumeMM3':outer_volume,'cavityVolumeMM3':cavity,
            'wallThicknessMM':wall_mm,'boundsMM':{'min':lo.tolist(),'max':hi.tolist(),'size':(hi-lo).tolist()},'targetSizeMM':size_mm,
            'sizeResidualMM':abs(float((hi-lo).max())-size_mm),'minimumShellVolumeMM3':min(volumes),'centerlineScale':scale,
            'warnings':warnings,'sourceFingerprint':identity(model),'coordinateDomain':'complete displayed 3D source boundary',
            'precision':'Approximate float64 arrangement and triangulation; STL/GLB use float32.',
            'validation':{'edgeManifold':True,'vertexManifold':True,'consistentOrientation':True,'positiveMaterialVolume':True,'degenerateTriangles':0,'selfIntersections':0},
            'surfaceDiagnostics':meta,'displaySimilarityResidual':residual}
    return shells,report
