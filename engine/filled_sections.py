"""Bounded float64 supporting-plane arrangements classified by signed degree.

Arrangement walls extend source sheets; they subdivide space without changing
the winding field. Observation-box contact and unresolved predicates refuse.
"""
from collections import defaultdict, Counter
from itertools import product
import hashlib
import math
import numpy as np
from .geometry import GeometryError, identity, validate, hull
from .generalized_density import density_info, _angle

VERSION='0.1.0-density-sections'
EPS=1e-9
LIMITS=dict(vertices=10000,faces=2000,cells=600,planes=64,regions=4096,
            splits=100000,verticesOut=30000,densityVisits=5000000)
COLORS=((0.20,0.65,0.95,1),(1,0.62,0.18,1),(0.64,0.43,0.93,1),
        (0.25,0.80,0.53,1),(0.95,0.36,0.53,1),(0.30,0.79,0.80,1))


def _require(value,message):
    if not value:raise GeometryError('Filled density section: '+message)


def _result_id(source):return 'density-section:'+hashlib.sha256(source['id'].encode('utf-8')).hexdigest()[:32]


class _Surface:
    def __init__(self,source):
        report=density_info(source,point=[10.,11.,12.])
        _require(report['status']=='qualified','source orientation is ambiguous or unresolved: '+'; '.join(report['diagnostics']))
        p=np.asarray(source['vertices']);self.triangles=[];areaTolerance=1e-16*float(np.max(np.ptp(p,axis=0)))**2
        for record,face in zip(report['faces'],source['faces']):
            for i in range(1,len(face)-1):
                t=p[[face[0],face[i],face[i+1]]]
                if np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0]))<=areaTolerance:continue
                if record['orientationSign']<0:t=t[::-1]
                self.triangles.append(t)
        self.report=report;self.low=p.min(0);self.high=p.max(0)
        local=np.asarray(self.triangles)
        self.normals=np.cross(local[:,1]-local[:,0],local[:,2]-local[:,0]);self.lengths=np.linalg.norm(self.normals,axis=1)

    def value(self,point):
        value=_angle(np.asarray(point),self.triangles)/(4*math.pi)
        residual=abs(value-round(value))
        _require(math.isfinite(value) and residual<=1e-6,'solid-angle winding is not resolved to an integer; change the plane.')
        return int(round(value)),residual


def _clean(polygon):
    result=[]
    for p in polygon:
        if not result or np.linalg.norm(p-result[-1])>EPS:result.append(p)
    if len(result)>1 and np.linalg.norm(result[0]-result[-1])<=EPS:result.pop()
    return result if len(result)>=3 else []


def _clip(polygon,n,b):
    result=[]
    for a,c in zip(polygon,polygon[1:]+polygon[:1]):
        da=float(a@n+b);dc=float(c@n+b)
        if da<=EPS:result.append(a)
        if da < -EPS and dc > EPS or dc < -EPS and da > EPS:
            result.append(a+da/(da-dc)*(c-a))
    return _clean(result)


def _unique(points):
    result=[]
    for point in points:
        if not any(np.linalg.norm(point-q)<=EPS*4 for q in result):result.append(point)
    return result


def _split(region,n,b,d):
    points=region if d==2 else [p for face in region for p in face]
    values=np.asarray(points)@n+b
    if max(values)<=EPS or min(values)>=-EPS:return [region]
    if d==2:
        halves=[_clip(region,n,b),_clip(region,-n,-b)]
        _require(all(len(half)>=3 for half in halves),'a planar arrangement region collapsed; change the plane.')
        return halves
    halves=[[],[]];cut=[]
    for face in region:
        for k,sign in enumerate((1,-1)):
            clipped=_clip(face,sign*n,sign*b)
            if clipped:halves[k].append(clipped)
        for a,c in zip(face,face[1:]+face[:1]):
            da=float(a@n+b);dc=float(c@n+b)
            if abs(da)<=EPS:cut.append(a)
            if da < -EPS and dc > EPS or dc < -EPS and da > EPS:cut.append(a+da/(da-dc)*(c-a))
    cut=_unique(cut);_require(len(cut)>=3,'a 3D arrangement cap collapsed; change the plane.')
    center=np.mean(cut,axis=0);_,_,vt=np.linalg.svd(n[None,:],full_matrices=True);basis=vt[1:].T
    cut.sort(key=lambda p:math.atan2(*(((p-center)@basis)[::-1])))
    halves[0].append(cut);halves[1].append(cut[::-1]);return halves


def _content(region,d):
    if d==2:
        p=np.asarray(region);return abs(float(np.sum(p[:,0]*np.roll(p[:,1],-1)-p[:,1]*np.roll(p[:,0],-1))))/2
    center=np.mean([p for face in region for p in face],axis=0)
    return sum(abs(float(np.dot(face[0]-center,np.cross(face[i]-center,face[i+1]-center))))/6
               for face in region for i in range(1,len(face)-1))


def _arrange(planes,low,high,d):
    if d==2:box=[np.array(p) for p in ((low[0],low[1]),(high[0],low[1]),(high[0],high[1]),(low[0],high[1]))]
    else:
        boxModel=hull(list(product(*zip(low,high))))
        p=np.asarray(boxModel['vertices']);box=[list(p[face]) for face in boxModel['faces']]
    regions=[box];visits=0
    for n,b in planes:
        following=[]
        for region in regions:
            visits+=1;_require(visits<=LIMITS['splits'],'arrangement exceeds its split-work bound; no partial fill is returned.')
            following.extend(_split(region,n,b,d))
            _require(len(following)<=LIMITS['regions'],'arrangement exceeds 4096 regions; no partial fill is returned.')
        regions=following
    expected=float(np.prod(high-low));actual=sum(_content(r,d) for r in regions)
    residual=abs(actual-expected)/expected
    _require(residual<=1e-6,'arrangement fails area/volume conservation.')
    return regions,residual


def _plane(planes,n,b):
    length=float(np.linalg.norm(n))
    if length<=EPS:return
    n=n/length;b=float(b/length)
    if n[np.argmax(abs(n))]<0:n=-n;b=-b
    if any(np.linalg.norm(n-m)<=EPS*8 and abs(b-c)<=EPS*8 for m,c in planes):return
    planes.append((n,b));_require(len(planes)<=LIMITS['planes'],'more than 64 active supporting planes; use a shallower section or surface curves.')


def _cells(source,p):
    """Orient source 3-cells as a closed 4D chain, using their signed boundaries."""
    records=[];owners=defaultdict(list)
    for c,cell in enumerate(source['cells']):
        ids=sorted({v for f in cell for v in source['faces'][f]});center=p[ids].mean(0)
        _,s,vt=np.linalg.svd(p[ids]-center,full_matrices=True)
        _require(len(s)>=4 and s[2]>EPS and s[3]<=EPS*8,f'source cell {c} is not a planar full-dimensional 3-cell.')
        basis=vt[:3].T;normal=np.array([(-1)**i*np.linalg.det(np.delete(basis,i,axis=0)) for i in range(4)])
        remap={v:i for i,v in enumerate(ids)};faces=[[remap[v] for v in source['faces'][f]] for f in cell]
        edges=sorted({tuple(sorted((a,b))) for F in faces for a,b in zip(F,F[1:]+F[:1])})
        local=dict(id='density-cell-'+str(c),name='Source cell '+str(c),dimension=3,embeddingDimension=3,
                   interpretation='generalized-complex',vertices=((p[ids]-center)@basis).tolist(),edges=list(map(list,edges)),faces=faces,cells=[])
        surface=_Surface(local)
        _require(len(surface.report['components'])==1,f'source cell {c} has disconnected boundary sheets; cell orientation is unsupported.')
        for f,record in zip(cell,surface.report['faces']):owners[f].append((c,record['orientationSign']))
        records.append(dict(center=center,basis=basis,normal=normal,surface=surface,ids=ids))
    _require(set(owners)==set(range(len(source['faces']))) and all(len(o)==2 and o[0][0]!=o[1][0] for o in owners.values()),
             '4D signed degree requires exactly two distinct source cells at every source face.')
    neighbors=defaultdict(list)
    for pair in owners.values():
        (a,sa),(b,sb)=pair;neighbors[a].append((b,-sa*sb));neighbors[b].append((a,-sa*sb))
    signs={}
    for root in range(len(records)):
        if root in signs:continue
        signs[root]=1;todo=[root];group=[]
        while todo:
            a=todo.pop();group.append(a)
            for b,relative in neighbors[a]:
                wanted=signs[a]*relative
                _require(b not in signs or signs[b]==wanted,'source 4D cell chain is nonorientable.')
                if b not in signs:signs[b]=wanted;todo.append(b)
        volume=sum(signs[c]*float(records[c]['center']@records[c]['normal'])*records[c]['surface'].report['measures']['orientedAlgebraicVolume']/4 for c in group)
        _require(abs(volume)>EPS**2,'source component has zero/unresolved algebraic 4-volume; positive orientation is ambiguous.')
        for c in group:records[c]['sign']=signs[c]*(1 if volume>0 else -1)
    return records


def _degree4(point,records,budget):
    answers=[];residual=0.
    for raw in ((1.,math.sqrt(2),math.sqrt(3),math.sqrt(5)),(math.sqrt(7),-1.,math.sqrt(11),math.sqrt(13)),(-math.sqrt(17),math.sqrt(19),1.,math.sqrt(23))):
        ray=np.asarray(raw);ray/=np.linalg.norm(ray);total=0;resolved=True
        for record in records:
            n=record['normal'];den=float(n@ray)
            if abs(den)<=EPS:resolved=False;break
            t=float((record['center']-point)@n)/den
            if t<=EPS:continue
            query=(point+t*ray-record['center'])@record['basis'];surface=record['surface']
            if np.any(query<surface.low-EPS*8) or np.any(query>surface.high+EPS*8):continue
            budget[0]+=len(surface.triangles)
            _require(budget[0]<=LIMITS['densityVisits'],'4D winding exceeds the signed-fan work bound; no partial fill is returned.')
            # Rays meeting literal face planes can hit their edges. Retry a
            # different deterministic direction instead of assigning a side.
            local=np.asarray(surface.triangles)
            normals=surface.normals;lengths=surface.lengths
            if np.any((lengths>EPS**2)&(abs(np.einsum('ij,ij->i',query-local[:,0],normals))<=EPS*lengths)):
                resolved=False;break
            value,error=surface.value(query);residual=max(residual,error)
            total+=record['sign']*(1 if den>0 else -1)*value
        if resolved:answers.append(total)
        if len(answers)==2:break
    _require(len(answers)==2 and answers[0]==answers[1],'independent 4D winding rays are degenerate or disagree; change the plane.')
    return answers[0],residual


def filled_section(source,normal=None,offset=0,fill_rule='nonzero',density_threshold=1):
    _require(type(source) is dict,'source must be a native model.')
    _require(type(source.get('id')) is str and 1<=len(source['id'])<=128 and type(source.get('name')) is str,'source needs a bounded literal ID and name.')
    _require(type(source.get('metadata',{})) is dict,'source metadata must be an object.')
    _require(all(type(source.get(k,[])) is list for k in ('vertices','edges','faces','cells')) and
             all(type(F) is list for k in ('faces','cells') for F in source.get(k,[])),'source requires literal vertex/edge/face/cell arrays.')
    d=source.get('dimension');_require(d in (3,4) and source.get('embeddingDimension',d)==d,'requires intrinsic 3D or 4D source geometry.')
    _require(source.get('interpretation') in ('convex-polytope','generalized-complex'),'requires a convex boundary or closed generalized oriented boundary.')
    _require(fill_rule in ('nonzero','even-odd','threshold'),'choose nonzero, even-odd, or threshold density fill.')
    _require(type(density_threshold) is int and 1<=density_threshold<=100,'density threshold must be an integer in 1–100.')
    _require(type(offset) in (int,float) and math.isfinite(offset),'depth must be finite.')
    normal=[0]*(d-1)+[1] if normal is None else normal
    _require(type(normal) in (list,tuple) and len(normal)==d and all(type(x) in (int,float) and math.isfinite(x) for x in normal) and any(normal),'plane normal must be a finite nonzero vector matching source dimension.')
    def selected(w):return w!=0 if fill_rule=='nonzero' else w%2!=0 if fill_rule=='even-odd' else w>=density_threshold
    params=dict(normal=list(normal),offset=offset,fill_rule=fill_rule,section_domain='density',density_threshold=density_threshold)
    # Preserve the established convex kernel's coordinates and incidence.
    if source.get('interpretation')=='convex-polytope':
        from .operations import convex_section
        result=convex_section(source,normal,offset)
        result['densityLegend']=[] if not result.get('model') else [dict(density=1,color=list(COLORS[0]),selected=selected(1),regionCount=1,content=result['model']['measure']['content'])]
        result['densityDiagnostics']=dict(algorithm='existing convex section kernel',certified=False)
        if result.get('model'):
            m=result['model'];m['id']=_result_id(source);m['metadata']['densitySection']=dict(version=VERSION,fillRule=fill_rule,threshold=density_threshold,densities=[1],orientation='outward convex boundary')
            m['metadata']['offColors']={'faces':[{'encoding':'unit','values':list(COLORS[0])} for _ in m['faces']]}
            m['provenance']['parameters']=params
            if not selected(1):result.update(status='empty',model=None)
        return result
    _require(len(source.get('vertices',[]))<=LIMITS['vertices'] and len(source.get('faces',[]))<=LIMITS['faces'] and len(source.get('cells',[]))<=LIMITS['cells'],'source exceeds vertex/face/cell limits.')
    _require(sum(map(len,source.get('faces',[])))<=50000 and sum(map(len,source.get('cells',[])))<=50000,'source exceeds 50000 face/cell incidences.')
    _require(validate(source)['passed'],'source geometry or incidence failed native validation.')
    raw=np.asarray(source['vertices'],dtype=float);center=raw.mean(0);span=float(np.max(np.ptp(raw,axis=0)))
    _require(0<span<=1e90 and math.isfinite(span),'source scale is unresolved or scaled section measures would overflow.')
    p=(raw-center)/span;n=np.asarray(normal,dtype=float);n/=max(abs(n));n/=np.linalg.norm(n)
    depth=(offset-float(center@n))/span;distances=p@n-depth
    _require(np.min(abs(distances))>EPS*16,'plane meets or approaches a source vertex/edge/coplanar face; move the depth or use surface curves. No perturbation is implicit.')
    _,_,vt=np.linalg.svd(n[None,:],full_matrices=True);basis=vt[1:].T;origin=n*depth
    common=dict(normal=n.tolist(),offset=float(offset),origin=(center+span*origin).tolist(),basis=basis.tolist(),sourceId=source['id'])
    planes=[];budget=[0]
    if d==3:
        normalized={**source,'vertices':p.tolist()};surface=_Surface(normalized)
        for F in source['faces']:
            if min(distances[F])>0 or max(distances[F])<0:continue
            _,_,axes=np.linalg.svd(p[F]-p[F[0]],full_matrices=True);m=axes[-1]
            _plane(planes,m@basis,float((origin-p[F[0]])@m))
        def degree(q):
            budget[0]+=len(surface.triangles)
            _require(budget[0]<=LIMITS['densityVisits'],'winding exceeds the signed-fan work bound.')
            return surface.value(origin+basis@q)
    else:
        _require(source.get('cells'),'4D fill requires explicit closed source cells; face curves alone cannot define density.')
        records=_cells(source,p)
        for record in records:
            ds=distances[record['ids']]
            if min(ds)>0 or max(ds)<0:continue
            _plane(planes,record['normal']@basis,float((origin-record['center'])@record['normal']))
        def degree(q):return _degree4(origin+basis@q,records,budget)
    projected=(p-origin)@basis;low=projected.min(0)-.25;high=projected.max(0)+.25
    if not planes:return dict(status='empty',model=None,densityLegend=[],densityDiagnostics={'limits':LIMITS},**common)
    regions,conservation=_arrange(planes,low,high,d-1);classified=[];maxResidual=0.
    for region in regions:
        vertices=region if d==3 else _unique([p for face in region for p in face]);witness=np.mean(vertices,axis=0)
        value,residual=degree(witness);maxResidual=max(maxResidual,residual)
        if value:
            _require(not np.any(abs(np.asarray(vertices)-low)<=EPS*16) and not np.any(abs(np.asarray(vertices)-high)<=EPS*16),'nonzero density reaches the observation box; closed-source classification failed.')
            classified.append((region,value,witness,_content(region,d-1)*span**(d-1)))
    legend=[]
    for value in sorted({r[1] for r in classified}):
        same=[r for r in classified if r[1]==value]
        legend.append(dict(density=value,color=list(COLORS[(abs(value)-1)%len(COLORS)]),selected=selected(value),regionCount=len(same),content=sum(r[3] for r in same)))
    diagnostics=dict(algorithm='supporting-plane arrangement classified by signed source degree',numericMode='float64-approximate',certified=False,
                     partitionResidual=conservation,maxIntegerResidual=maxResidual,arrangementRegions=len(regions),supportingPlanes=len(planes),densityTriangleVisits=budget[0],
                     orientation='coherent incidence; each connected component has positive algebraic volume',limits=LIMITS,
                     degeneracyPolicy='refuse planes within 16e-9 source spans of any source vertex; no implicit perturbation')
    chosen=[r for r in classified if selected(r[1])]
    if not chosen:return dict(status='empty',model=None,densityLegend=legend,densityDiagnostics=diagnostics,**common)
    return _output(source,chosen,span,center,origin,basis,common,params,legend,diagnostics)


def _output(source,chosen,span,center,origin,basis,common,params,legend,diagnostics):
    d=source['dimension']-1;points=[];buckets=defaultdict(list)
    def point_id(p):
        key=tuple(np.floor(p/(EPS*8)).astype(int))
        for shift in product((-1,0,1),repeat=d):
            for i in buckets.get(tuple(a+b for a,b in zip(key,shift)),[]):
                if np.linalg.norm(p-points[i])<=EPS*8:return i
        _require(len(points)<LIMITS['verticesOut'],'output exceeds 30000 arrangement vertices.')
        i=len(points);points.append(p);buckets[key].append(i);return i
    patches=[];records=[]
    for region,value,witness,content in chosen:
        faces=[region] if d==2 else region;ids=[]
        for F in faces:
            if d==3:
                normal=np.sum(np.cross(np.asarray(F)-witness,np.roll(np.asarray(F),-1,axis=0)-witness),axis=0)
                if float(normal@(np.mean(F,axis=0)-witness))<0:F=F[::-1]
            cycle=[point_id(p) for p in F];ids.append(len(patches));patches.append((cycle,value))
        records.append(dict(density=value,witness=((witness*span)).tolist(),content=content,**({'outputFaces':ids} if d==2 else {})))
    # All clipping planes split all regions. Subdivide collinear edges at every
    # arrangement vertex to retain conforming interfaces even at plane ties.
    P=np.asarray(points);conforming=[];visits=0
    for F,value in patches:
        cycle=[]
        for a,b in zip(F,F[1:]+F[:1]):
            edge=P[b]-P[a];den=float(edge@edge);_require(den>EPS**2,'output edge collapsed.')
            visits+=len(P);_require(visits<=10000000,'output conformity exceeds its work bound.')
            ts=(P-P[a])@edge/den;distance=np.linalg.norm(P-(P[a]+ts[:,None]*edge),axis=1)
            ids=np.flatnonzero((ts>=-EPS)&(ts<1-EPS)&(distance<=EPS*8));cycle.extend(sorted(map(int,ids),key=lambda i:float(ts[i])))
        _require(len(set(cycle))==len(cycle),'an output patch repeats a boundary vertex.')
        conforming.append((cycle,value))
    if d==3:
        owners=defaultdict(list)
        for cycle,value in conforming:owners[frozenset(cycle)].append((cycle,value))
        _require(all(len(O)<=2 for O in owners.values()),'more than two arrangement regions share a facet.')
        conforming=[O[0] for O in owners.values() if len(O)==1]
    used=sorted({v for F,w in conforming for v in F});mapping={v:i for i,v in enumerate(used)}
    faces=[[mapping[v] for v in F] for F,w in conforming];densities=[w for F,w in conforming]
    counts=Counter(tuple(sorted((a,b))) for F in faces for a,b in zip(F,F[1:]+F[:1]));edges=sorted(counts)
    boundary=[list(e) for e,c in counts.items() if c==1] if d==2 else []
    _require(d!=3 or all(c==2 for c in counts.values()),'selected 3D solid has a nonclosed/nonmanifold boundary; change the depth or fill rule.')
    if d==3:
        orientation=Counter()
        for F in faces:
            for a,b in zip(F,F[1:]+F[:1]):orientation[tuple(sorted((a,b)))]+=1 if a<b else -1
        _require(all(c==0 for c in orientation.values()),'selected solid boundary has inconsistent orientation.')
        reference=P[used].mean(0)
        volume=sum(float((P[used[F[0]]]-reference)@np.cross(P[used[F[i]]]-reference,P[used[F[i+1]]]-reference))/6 for F in faces for i in range(1,len(F)-1))
        expected=sum(r[3] for r in chosen)/span**3;residual=abs(volume-expected)/max(expected,1e-300)
        _require(residual<=1e-5,'selected boundary fails region-volume conservation.')
        diagnostics['selectedBoundaryContentResidual']=residual
        owners=defaultdict(list)
        for f,F in enumerate(faces):
            cloud=P[[used[v] for v in F]];normal=np.sum(np.cross(cloud-cloud[0],np.roll(cloud,-1,axis=0)-cloud[0]),axis=0);length=float(np.linalg.norm(normal))
            _require(length>EPS**2,'an exposed boundary facet collapsed; change the depth.');normal/=length
            for a,b in zip(F,F[1:]+F[:1]):owners[tuple(sorted((a,b)))].append((normal,densities[f]))
        for edge,((n,a),(m,b)) in owners.items():
            if a!=b or np.linalg.norm(n-m)>EPS*16:boundary.append(list(edge))
    loops=[]
    if d==2:
        oriented=[(a,b) for F in faces for a,b in zip(F,F[1:]+F[:1]) if counts[tuple(sorted((a,b)))]==1]
        following=defaultdict(list)
        for a,b in oriented:following[a].append(b)
        incoming=Counter(b for a,b in oriented)
        _require(all(len(V)==incoming[a] for a,V in following.items()) and set(following)==set(incoming),'selected planar boundary is not a closed oriented chain.')
        unseen=set(oriented)
        while unseen:
            root=min(unseen);loop=[];edge=root
            while True:
                _require(edge in unseen,'selected planar boundary does not close into separate oriented loops.')
                unseen.remove(edge);a,b=edge;loop.append(a);direction=P[used[b]]-P[used[a]]
                def turn(c):
                    other=P[used[c]]-P[used[b]]
                    return math.atan2(float(direction[0]*other[1]-direction[1]*other[0]),float(direction@other))
                edge=(b,max(following[b],key=turn))
                if edge==root:break
            loops.append(loop)
    embedding={k:common[k] for k in ('normal','offset','origin','basis','sourceId')}
    metadata=dict(coordinateUnits=source.get('metadata',{}).get('coordinateUnits','model'),sectionEmbedding=embedding,
                  fillSemantics='signed-density-section',fillRule='nonzero',
                  offColors={'faces':[{'encoding':'unit','values':list(COLORS[(abs(w)-1)%len(COLORS)])} for w in densities]},
                  densitySection=dict(version=VERSION,fillRule=params['fill_rule'],threshold=params['density_threshold'],faceDensities=densities,
                                      boundaryEdges=boundary,boundaryLoops=loops,regions=records,legend=legend,diagnostics=diagnostics,
                                      regionCoordinates='intrinsic section coordinates; witness scaled to source units',
                                      promotion='boundary of regions selected by the explicit signed density fill rule'))
    result=dict(id=_result_id(source),name='Filled density section of '+source['name'],dimension=d,embeddingDimension=d,
                interpretation='generalized-complex',vertices=[(P[v]*span).tolist() for v in used],edges=list(map(list,edges)),faces=faces,cells=[],
                numeric=dict(mode='float64-approximate',certified=False,tolerance=EPS*span),metadata=metadata,
                provenance=dict(operation='section',algorithmVersion=VERSION,sourceId=source['id'],sourceFingerprint=identity(source),parameters=params,convexified=False))
    result['validation']=validate(result);_require(result['validation']['passed'],'filled output fails validation: '+'; '.join(result['validation']['errors']))
    result['fingerprint']=identity(result)
    return dict(status='filled-density-section',model=result,densityLegend=legend,densityDiagnostics=diagnostics,affineDimension=d,**common)
