"""Complete sections of bounded ordinary 4D cell boundaries.

Each original closed embedded 3-cell has its own region meaning. Globally
intersecting cell sheets remain separate; no global 4D solid is inferred.
"""
from collections import Counter,defaultdict
from copy import deepcopy
import hashlib,json,math
import numpy as np
from .geometry import GeometryError,identity,validate,rank,canonical_cycle
from .dual_morph_expansion import _clone,_color_record
from .generalized_concave_cell_nets import qualify_cell_shells
from .generalized_nets import _cross,_touch,polygon_overlap
from .generalized_sections import _frame,_inside
from .cell_section_regions import planar_regions,triangulate_holes,_require

VERSION='0.26.0-ordinary-source-cell-sections'
EPS=1e-8
MAX_OUTPUT=20000
MAX_FACE_PAIRS=100000
MAX_GEOMETRY_VISITS=2000000

def _boundary_point(point,cycle,tolerance=EPS*4):
    return any(abs(_cross(b-a,point-a))<=tolerance*max(float(np.linalg.norm(b-a)),1e-15) and
        float((point-a)@(point-b))<=tolerance**2 for a,b in zip(cycle,np.roll(cycle,-1,axis=0)))

def _check_embedded_cells(source):
    """No unrequested filled meaning for self-crossing ordinary-looking shells."""
    P=np.asarray(source['vertices'],dtype=float);span=float(np.max(np.ptp(P,axis=0)));P=(P-P.mean(axis=0))/span
    pairs=0;visits=0
    for cellId,cell in enumerate(source['cells']):
        ids=sorted({v for f in cell for v in source['faces'][f]});_,_,axes=np.linalg.svd(P[ids]-P[ids[0]],full_matrices=False);points=P@axes[:3].T
        records=[]
        for f in cell:
            ids=source['faces'][f];cloud=points[ids];relative=cloud-cloud[0];_,_,vt=np.linalg.svd(relative,full_matrices=False)
            records.append((f,ids,cloud,vt[-1],vt[:2].T,relative@vt[:2].T))
        for i,A in enumerate(records):
            for B in records[i+1:]:
                pairs+=1;_require(pairs<=MAX_FACE_PAIRS,'source cell-face intersection verification exceeds 100000 pairs.')
                f,F,a,n,basis,xy=A;g,G,b,m,otherBasis,otherXY=B
                if np.any(np.minimum(a.max(axis=0),b.max(axis=0))-np.maximum(a.min(axis=0),b.min(axis=0)) < -EPS*4):continue
                shared=set(F)&set(G);commonEdges={tuple(sorted(E)) for E in zip(F,F[1:]+F[:1])}&{tuple(sorted(E)) for E in zip(G,G[1:]+G[:1])}
                if np.linalg.norm(np.cross(n,m))<=EPS*4:
                    if max(abs((b-a[0])@n))<=EPS*4:
                        other=(b-a[0])@basis
                        _require(not polygon_overlap(xy,other,tolerance=EPS*4),f'source cell {cellId} faces {f}/{g} overlap in one plane.')
                        for ai,(x,y) in enumerate(zip(F,F[1:]+F[:1])):
                            for bi,(z,w) in enumerate(zip(G,G[1:]+G[:1])):
                                visits+=1;_require(visits<=MAX_GEOMETRY_VISITS,'source geometric verification exceeds its bounded work.')
                                u,v=xy[ai],xy[(ai+1)%len(F)];r,s=other[bi],other[(bi+1)%len(G)]
                                if not _touch(u,v,r,s):continue
                                allowed=bool({x,y}&{z,w})
                                direction=v-u;den=float(direction@direction)
                                if abs(_cross(direction,s-r))<=EPS*4 and abs(_cross(direction,r-u))<=EPS*4:
                                    ts=sorted([float((r-u)@direction)/den,float((s-u)@direction)/den])
                                    if min(1.,ts[1])-max(0.,ts[0])>EPS*4:allowed=tuple(sorted((x,y)))==tuple(sorted((z,w)))
                                _require(allowed,f'source cell {cellId} has coincident/touching face boundaries {f}/{g} without literal edge/vertex ownership.')
                    continue
                intersectionHits=[]
                def allowedHit(hit):
                    allowed=any(np.linalg.norm(hit-points[v])<=EPS*8 for v in shared)
                    for x,y in commonEdges:
                        u=points[y]-points[x];t=float((hit-points[x])@u)/float(u@u)
                        allowed=allowed or -EPS<=t<=1+EPS and np.linalg.norm(hit-(points[x]+t*u))<=EPS*8
                    return allowed
                for cloud,target,targetNormal,targetBasis,targetXY in ((a,b,m,otherBasis,otherXY),(b,a,n,basis,xy)):
                    for start,end in zip(cloud,np.roll(cloud,-1,axis=0)):
                        visits+=len(targetXY);_require(visits<=MAX_GEOMETRY_VISITS,'source geometric verification exceeds its bounded work.')
                        da=float((start-target[0])@targetNormal);db=float((end-target[0])@targetNormal)
                        hits=[]
                        if abs(da)<=EPS*4:hits.append(start)
                        if abs(db)<=EPS*4:hits.append(end)
                        if da*db<0 and abs(da-db)>EPS*4:hits.append(start+da/(da-db)*(end-start))
                        for hit in hits:
                            q=(hit-target[0])@targetBasis
                            if not (_inside(q,targetXY,'nonzero') or _boundary_point(q,targetXY)):continue
                            if not any(np.linalg.norm(hit-H)<=EPS*8 for H in intersectionHits):intersectionHits.append(hit)
                            _require(allowedHit(hit),f'source cell {cellId} has crossing/touching faces {f}/{g} without literal boundary incidence.')
                direction=np.cross(n,m);intersectionHits.sort(key=lambda H:float(H@direction))
                for start,end in zip(intersectionHits,intersectionHits[1:]):
                    midpoint=(start+end)/2;qa=(midpoint-a[0])@basis;qb=(midpoint-b[0])@otherBasis
                    if (_inside(qa,xy,'nonzero') or _boundary_point(qa,xy)) and (_inside(qb,otherXY,'nonzero') or _boundary_point(qb,otherXY)):
                        _require(allowedHit(midpoint),f'source cell {cellId} faces {f}/{g} cross along an unowned interior line segment.')

def ordinary_cell_section(model,normal=None,offset=0,fill_rule='nonzero'):
    source=_clone(model)
    _require(type(source) is dict,'source must be a literal native model object.')
    _require(type(source.get('id')) is str and type(source.get('name')) is str,'source needs literal native identity/name strings.')
    _require(len(json.dumps(source).encode('utf-8'))<=8*1024*1024,'source exceeds 8 MiB.')
    _require(source.get('dimension')==4 and source.get('embeddingDimension',4)==4 and source.get('interpretation') in ('generalized-complex','convex-polytope'),
             'complete source-cell sections require an intrinsic ordinary 4D boundary.')
    _require(type(source.get('vertices')) is list and all(type(P) is list and len(P)==4 and all(type(x) in (int,float) and math.isfinite(x) for x in P) for P in source['vertices']),
             'source needs literal finite four-dimensional numeric coordinates.')
    _require(source.get('fingerprint',identity(source))==identity(source),'source fingerprint differs from its literal coordinates/incidence.')
    _require(fill_rule in ('nonzero','even-odd'),'unknown face fill rule.')
    normal=[0,0,0,1] if normal is None else normal
    _require(type(normal) in (list,tuple) and len(normal)==4 and all(type(x) in (int,float) and math.isfinite(x) for x in normal) and any(normal),
             'section normal needs four finite literal coefficients.')
    _require(type(offset) in (int,float) and math.isfinite(offset),'section depth must be finite numeric data.')
    try:qualification=qualify_cell_shells(source)
    except GeometryError as error:
        raise GeometryError('Complete ordinary source-cell section unavailable: '+str(error)+' Choose Surface / convex section to retain existing source-face curves.') from error
    _check_embedded_cells(source)
    P=np.asarray(source['vertices'],dtype=float);n=np.asarray(normal,dtype=float);n/=max(abs(n));n/=np.linalg.norm(n)
    span=float(np.max(np.ptp(P,axis=0)));tol=EPS*span*4;distances=P@n-offset
    _,_,vt=np.linalg.svd(n[None,:],full_matrices=True);basis=vt[1:].T;origin=n*offset
    common={'normal':n.tolist(),'offset':float(offset),'origin':origin.tolist(),'basis':basis.tolist(),'sourceId':source['id'],
            'semantics':'complete regions of ordinary source 3-cells; no global 4D filled-volume or star-cell meaning','fillRule':fill_rule}
    points=[];refs=[];vertexLookup={};edges=[];edgeRefs=[];edgeLookup={};faces=[];faceRefs=[];faceLookup={};regions=[]
    sourceEdgeIndex={tuple(sorted(E)):e for e,E in enumerate(source['edges'])};edgePoints={}
    def point(key,coordinate,reference):
        if key not in vertexLookup:
            _require(len(points)<MAX_OUTPUT,'output vertex limit exceeded.');vertexLookup[key]=len(points);points.append(((coordinate-origin)@basis).tolist());refs.append([])
        index=vertexLookup[key]
        if reference not in refs[index]:refs[index].append(reference)
        return index
    for e,(a,b) in enumerate(source['edges']):
        da,db=distances[a],distances[b];ids=[]
        for v,distance in ((a,da),(b,db)):
            if abs(distance)<=tol:ids.append(point(('vertex',v),P[v],{'vertex':v,'edge':e}))
        if da < -tol and db > tol or db < -tol and da > tol:
            t=float(da/(da-db));ids.append(point(('edge',e),P[a]+t*(P[b]-P[a]),{'edge':e,'parameter':t}))
        edgePoints[e]=ids
    faceSegments=[];coplanarFaces={}
    def edge(a,b,reference):
        if a==b:return None
        key=tuple(sorted((a,b)))
        if key not in edgeLookup:
            _require(len(edges)<MAX_OUTPUT*4,'output edge limit exceeded.');edgeLookup[key]=len(edges);edges.append(list(key));edgeRefs.append([])
        index=edgeLookup[key]
        if reference not in edgeRefs[index]:edgeRefs[index].append(reference)
        return index
    for f,F in enumerate(source['faces']):
        ds=distances[F];boundaryEdges=[sourceEdgeIndex[tuple(sorted(E))] for E in zip(F,F[1:]+F[:1])];segments=[]
        if min(ds)>tol or max(ds)<-tol:faceSegments.append(segments);continue
        if max(abs(ds))<=tol:
            cycle=[vertexLookup['vertex',v] for v in F];coplanarFaces[f]=cycle
            for a,b in zip(cycle,cycle[1:]+cycle[:1]):segments.append(edge(a,b,{'face':f,'coplanar':True}))
        else:
            local,faceBasis,faceScale=_frame(P[F]);cut=n@faceBasis;direction=np.array([-cut[1],cut[0]])
            _require(float(np.linalg.norm(direction))>EPS**2,'near-parallel source-face cut is numerically unresolved.');direction/=np.linalg.norm(direction)
            ids=sorted({v for e in boundaryEdges for v in edgePoints[e]},key=lambda i:float((origin+np.asarray(points[i])@basis.T-P[F[0]])@faceBasis@direction))
            for a,b in zip(ids,ids[1:]):
                # Winding intervals may split a concave source face into more
                # than one actual section edge. Only literal cut IDs are used.
                midpoint=origin+((np.asarray(points[a])+points[b])/2)@basis.T;q=(midpoint-P[F[0]])@faceBasis/faceScale
                if _inside(q,local,'nonzero') or _boundary_point(q,local):segments.append(edge(a,b,{'face':f,'fillRule':fill_rule}))
        faceSegments.append(segments)
    def face(cycle,c,component,coplanar=None,holePatch=False):
        key=('coplanar-face',coplanar) if coplanar is not None else ('cell-region',c,component,canonical_cycle(cycle))
        if key not in faceLookup:
            _require(len(faces)<MAX_OUTPUT,'output face limit exceeded.');faceLookup[key]=len(faces);faces.append(cycle);faceRefs.append({'cell':c,'cells':[c],'component':component,'coplanarFace':coplanar,'holeTessellation':holePatch})
        index=faceLookup[key]
        if c not in faceRefs[index]['cells']:faceRefs[index]['cells'].append(c)
        for a,b in zip(cycle,cycle[1:]+cycle[:1]):edge(a,b,{'cell':c,'region':component,'interiorTessellation':tuple(sorted((a,b))) not in edgeLookup})
        return index
    for c,C in enumerate(source['cells']):
        vertices=sorted({v for f in C for v in source['faces'][f]});ds=distances[vertices]
        if min(ds)>tol or max(ds)<-tol:continue
        if max(abs(ds))<=tol:
            output=[face(coplanarFaces[f],c,i,f) for i,f in enumerate(C)]
            regions.append({'sourceCell':c,'affineDimension':3,'coplanarCell':True,'sourceFaceIds':C[:],'outputFaces':output});continue
        selected={e for f in C for e in faceSegments[f]};adjacency=defaultdict(list)
        for e in selected:
            a,b=edges[e];adjacency[a].append(b);adjacency[b].append(a)
        # Isolated tangent vertices and edges remain in the global cut packet.
        if not adjacency:continue
        if any(len(N)!=2 for N in adjacency.values()):
            _require(not(min(ds)<-tol and max(ds)>tol),f'source cell {c} section has an unresolved tangent branch.');continue
        unseen=set(adjacency);loops=[]
        while unseen:
            first=min(unseen);loop=[first];previous=first;current=min(adjacency[first])
            while current!=first:
                _require(current not in loop,f'cell {c} section repeats a boundary identity.');loop.append(current)
                following=[v for v in adjacency[current] if v!=previous];_require(len(following)==1,f'cell {c} cut link is unresolved.')
                previous,current=current,following[0]
            unseen.difference_update(loop);loops.append(loop)
        planar,xy,scale=planar_regions(loops,points)
        expected=basis.T@qualification['normals'][c]
        for component,region in enumerate(planar):
            outer=region['outer'];holes=region['holes'];patches=triangulate_holes(region,xy) if holes else [outer]
            output=[]
            for cycle in patches:
                cloud=np.asarray(points)[cycle];normal3=np.sum(np.cross(cloud,np.roll(cloud,-1,axis=0)),axis=0)
                if float(normal3@expected)<0:cycle=cycle[::-1]
                coplanar=next((f for f in C if f in coplanarFaces and canonical_cycle(coplanarFaces[f])==canonical_cycle(cycle)),None)
                output.append(face(cycle,c,component,coplanar,bool(holes)))
            area=float(abs(sum(_cross(xy[b]-xy[a],xy[d]-xy[a])/2 for a,b,d in patches)))*scale**2 if holes else abs(float(np.sum(xy[outer,0]*np.roll(xy[outer,1],-1)-xy[outer,1]*np.roll(xy[outer,0],-1))/2))*scale**2
            regions.append({'sourceCell':c,'component':component,'affineDimension':2,'outer':outer,'holes':holes,'outputFaces':output,'area':area})
    common.update(intersection=points,sourceReferences=refs,edgeSourceReferences=edgeRefs,faceSourceReferences=faceRefs,cellSectionRegions=regions,diagnostics=[])
    if not points:
        from .section_source_content import section_content_record
        empty={'vertices':[],'edges':[],'faces':[],'cells':[]}
        return {'status':'empty','model':None,'sectionSourceContent':section_content_record(source,empty,common),**common}
    affine=rank(np.asarray(points)/span)
    maps={'vertices':[{'owners':[{'sourceRank':0 if 'vertex' in r else 1,'sourceElement':r.get('vertex',r.get('edge'))} for r in R]} for R in refs],
          'edges':[{'owners':[{'sourceRank':2 if 'face' in r else 3,'sourceElement':r.get('face',r.get('cell'))} for r in R]} for R in edgeRefs],
          'faces':[{'owners':[{'sourceRank':3,'sourceElement':c} for c in R['cells']]} for R in faceRefs],'cells':[]}
    colors={'vertices':[next((_color_record(source,'vertices',r['vertex']) for r in R if 'vertex' in r),_color_record(source,'edges',R[0]['edge'])) for R in refs],
            'edges':[next((_color_record(source,'faces',r['face']) for r in R if 'face' in r),None) for R in edgeRefs],
            'faces':[_color_record(source,'cells',R['cell']) for R in faceRefs],'cells':[]}
    result={'id':'ordinary-cell-section:'+source['id'],'name':'Ordinary cell section of '+source['name'],'dimension':3,'embeddingDimension':3,'interpretation':'generalized-complex',
            'vertices':points,'edges':edges,'faces':faces,'cells':[],'numeric':{'mode':'float64-approximate','tolerance':EPS,'certified':False},
            'metadata':{'coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),'offColors':colors,'fillSemantics':'ordinary-source-cell-section-regions',
                        'sectionEmbedding':{k:common[k] for k in ('normal','offset','origin','basis','sourceId')},'elementSourceMaps':maps,
                        'sourceReferences':refs,'edgeSourceReferences':edgeRefs,'faceSourceReferences':faceRefs,'cellSectionRegions':regions,
                        'ordinaryCellSection':{'version':1,'sourceFingerprint':identity(source),'sourceSnapshotSha256':hashlib.sha256(json.dumps(source,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                                               'sourceCellCount':len(source['cells']),'nonconvexSourceCells':qualification['nonconvexCells'],'sourceMetadata':deepcopy(source.get('metadata',{})),
                                               'colorPolicy':'Literal source cells become section faces; shared coplanar faces retain first source-cell color and all declared cell identities.'}},
            'provenance':{'operation':'section','algorithmVersion':VERSION,'convexified':False,'sourceId':source['id'],'sourceFingerprint':identity(source),
                          'parameters':{'normal':n.tolist(),'offset':float(offset),'fill_rule':fill_rule,'section_domain':'ordinary-cells'}}}
    from .section_source_content import section_content_record
    result['metadata']['sectionSourceContent']=section_content_record(source,result,common)
    result['validation']=validate(result);_require(result['validation']['passed'],'result failed native planar/incidence checks.')
    result['fingerprint']=identity(result)
    return {'status':'ordinary-cell-section' if faces else 'degenerate','model':result,'affineDimension':affine,**common}
