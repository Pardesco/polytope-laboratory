"""Native finite convex uniform library; parabolic face orbits avoid hull scaling."""
from collections import Counter, deque
from copy import deepcopy
from functools import lru_cache
from itertools import combinations
import json
import math
from pathlib import Path
import uuid
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError, TOLERANCE, cycle, hull, identity, validate
from .wythoff import FAMILIES, reflection_orbit, mirror_gram, diagram_components

DATA=Path(__file__).resolve().parent/'catalog_data/convex_uniform4.json'
KINDS=('vertices','edges','faces','cells')

@lru_cache(maxsize=1)
def manifest():
    return json.loads(DATA.read_text(encoding='utf-8'))

def uniform4_catalog():
    return deepcopy(manifest()['entries'])

def _orbit(seed,actions):
    seen={tuple(sorted(seed))};pending=deque(seen)
    while pending:
        face=pending.popleft()
        for action in actions:
            other=tuple(sorted(action[v] for v in face))
            if other not in seen:seen.add(other);pending.append(other)
    return seen

def wythoff_boundary(family,rings):
    orbit=reflection_orbit(family,rings,max_vertices=20000)
    points=np.asarray(orbit.pop('vertices'));diagram=FAMILIES[family]
    gram=mirror_gram(family)
    roots=np.linalg.cholesky(gram);tree=cKDTree(points);actions=[];residual=0.
    for root in roots:
        distances,ids=tree.query(points-2*np.outer(points@root,root))
        residual=max(residual,float(max(distances)))
        if residual>1e-8 or len(set(ids))!=len(points):raise GeometryError('Uniform reflection action is numerically unresolved.')
        actions.append(ids.tolist())
    strata=[]
    for dimension in (1,2,3):
        faces=set()
        for nodes in combinations(range(4),dimension):
            components=diagram_components(family,nodes)
            if any(not any(rings[n] for n in part) for part in components):continue
            seed={0};pending=[0]
            while pending:
                v=pending.pop()
                for n in nodes:
                    other=actions[n][v]
                    if other not in seed:seed.add(other);pending.append(other)
            faces.update(_orbit(seed,actions))
        strata.append(sorted(faces))
    edges,face_sets,cell_sets=strata
    faces=[cycle(points,f) for f in face_sets];members=[set(f) for f in face_sets]
    at_vertex=[set() for _ in points]
    for i,f in enumerate(faces):
        for v in f:at_vertex[v].add(i)
    cells=[]
    for vertices in cell_sets:
        vs=set(vertices);candidates=set().union(*(at_vertex[v] for v in vs))
        cells.append(sorted(i for i in candidates if members[i]<=vs))
    model={'id':str(uuid.uuid4()),'name':family+' uniform','dimension':4,'embeddingDimension':4,
           'interpretation':'convex-polytope','vertices':points.tolist(),'edges':[list(e) for e in edges],
           'faces':faces,'cells':cells,'facetVertices':[list(c) for c in cell_sets],
           'metadata':{},'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,
           'algorithm':'finite reflection orbit + parabolic face orbits'},
           'provenance':{'operation':'uniform4-wythoff','algorithmVersion':'1','parameters':{'family':family,'rings':rings},
           **orbit,'actionResidual':residual}}
    return _finish(model)

def _finish(model):
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Uniform boundary failed validation: '+'; '.join(model['validation']['errors']))
    model['fingerprint']=identity(model)
    return model

def convex_prism(source):
    p=np.asarray(source['vertices']);v,e,f=(len(source[k]) for k in KINDS[:3])
    lengths=[np.linalg.norm(p[a]-p[b]) for a,b in source['edges']];height=float(np.mean(lengths))
    if max(lengths)-min(lengths)>1e-7*height:raise GeometryError('Uniform prism requires an equal-edge base.')
    faces=deepcopy(source['faces'])+[[a+v for a in face] for face in source['faces']]
    edge_ids={tuple(sorted(edge)):i for i,edge in enumerate(source['edges'])}
    faces.extend([[a,b,b+v,a+v] for a,b in source['edges']])
    cells=[list(range(f)),list(range(f,2*f))]
    for i,face in enumerate(source['faces']):
        cells.append([i,i+f]+[2*f+edge_ids[tuple(sorted((a,b)))] for a,b in zip(face,face[1:]+face[:1])])
    return _finish({'id':str(uuid.uuid4()),'name':'Uniform prism','dimension':4,'embeddingDimension':4,
        'interpretation':'convex-polytope','vertices':[[*point,z] for z in (-height/2,height/2) for point in p.tolist()],
        'edges':sorted(deepcopy(source['edges'])+[[a+v,b+v] for a,b in source['edges']]+[[i,i+v] for i in range(v)]),
        'faces':faces,'cells':cells,'metadata':{},'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'algorithm':'uniform polyhedron × equal-edge interval'},
        'provenance':{'operation':'uniform4-prism','algorithmVersion':'1','sourceKey':source['metadata']['key'],'height':height}})

def load_uniform4(key):
    entry=next((r for r in manifest()['entries'] if r['key']==key),None)
    if entry is None or not key.startswith('uniform4-'):return None
    if 'baseKey' in entry:
        from .generators import regular
        model=convex_prism(regular(entry['baseKey']))
    elif entry.get('rings'):
        model=wythoff_boundary(entry['coxeterFamily'],entry['rings'])
    else:
        from .generators import vertices600
        points=vertices600()
        if entry['uniformIndex']==31:
            points=points[np.count_nonzero(np.abs(points)>1e-9,axis=1)==3]
        else:
            # Two orthogonal decagons are the 20 removed vertices of the 600-cell.
            a=0;b=next(i for i in range(1,len(points)) if abs(points[a]@points[i]-(1+math.sqrt(5))/4)<1e-9)
            basis=np.linalg.qr(np.stack([points[a],points[b]],axis=1))[0]
            squared=np.sum((points@basis)**2,axis=1)
            points=points[(squared>1e-8)&(squared<1-1e-8)]
        model=hull(points,entry['name'])
    actual=[len(model[k]) for k in KINDS]
    if actual!=entry['counts']:raise GeometryError(f'Uniform library count mismatch: {actual} versus {entry["counts"]}.')
    model['name']=entry['name'];model['metadata'].update(deepcopy(entry))
    p=np.asarray(model['vertices']);lengths=np.linalg.norm(p[np.asarray(model['edges'])[:,0]]-p[np.asarray(model['edges'])[:,1]],axis=1)
    spread=float(np.ptp(lengths)/np.mean(lengths))
    if spread>1e-7:raise GeometryError('Uniform library equal-edge residual exceeds tolerance.')
    model['metadata']['uniformVerification']={'edgeRelativeSpread':spread,'countsMatched':True,'exact':False}
    return model

def uniform_family(family='duoprism',n=5,m=5):
    if family not in ('duoprism','antiprism-prism','prism','antiprism'):
        raise GeometryError('Uniform families: duoprism, antiprism-prism, prism, antiprism.')
    if type(n) is not int or not 3<=n<=200 or type(m) is not int or not 3<=m<=200:
        raise GeometryError('Uniform family polygon counts must be integers from 3 to 200.')
    if family!='duoprism':
        if family=='prism':
            from .generators import generate
            model=generate('prism',n=n,height=2*math.sin(math.pi/n))
        else:
            from .antiprisms import rational_antiprism
            model=hull(rational_antiprism(n=n,d=1,base_edge=1)['vertices'])
            model['metadata']['key']=f'uniform-antiprism-{n}'
            if family=='antiprism-prism':model=convex_prism(model)
    else:
        if n*m>4000:raise GeometryError('Uniform duoprism limit is 4,000 product vertices.')
        from .generators import polygon
        left=polygon(n,1/(2*math.sin(math.pi/n)));right=polygon(m,1/(2*math.sin(math.pi/m)))
        index=lambda i,j:(i%n)*m+j%m
        faces=[[index(i,j) for i in range(n)] for j in range(m)]+[[index(i,j) for j in range(m)] for i in range(n)]
        faces.extend([[index(i,j),index(i+1,j),index(i+1,j+1),index(i,j+1)] for i in range(n) for j in range(m)])
        cells=[[m+i,m+(i+1)%n]+[m+n+i*m+j for j in range(m)] for i in range(n)]
        cells.extend([[j,(j+1)%m]+[m+n+i*m+j for i in range(n)] for j in range(m)])
        edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
        model=_finish({'id':str(uuid.uuid4()),'dimension':4,'embeddingDimension':4,'interpretation':'convex-polytope',
            'vertices':[[*a,*b] for a in left.tolist() for b in right.tolist()],'edges':[list(e) for e in edges],
            'faces':faces,'cells':cells,'metadata':{},'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE,'algorithm':'equal-edge polygon Cartesian product'},'provenance':{}})
    model['name']=f'{n} × {m} uniform duoprism' if family=='duoprism' else f'{n}-gonal uniform '+family
    model['metadata'].update(family='Uniform '+family,convex=True,uniform=True,regular=False,vertexTransitive=True,chiral=False,
        generatorFamily={'family':family,'n':n,'m':m,'parameterized':True})
    if family=='antiprism-prism':
        from .library_navigation import cell_inventory
        model['metadata']['cellTypes']=cell_inventory(model)
    if family=='duoprism':
        model['metadata']['cellTypes']=[{'key':f'uniform-prism-{n}','count':m},{'key':f'uniform-prism-{m}','count':n}]
        model['metadata']['symmetryGroup']=f'[{n}] × [{m}]'
        model['metadata']['regular']=n==m==4
    else:
        model['metadata']['symmetryGroup']=f'D{n}h' if family=='prism' else f'D{n}d' if family=='antiprism' else f'D{n}d × A1'
        model['metadata']['regular']=family=='prism' and n==4 or family=='antiprism' and n==3
        if model['metadata']['regular']:model['metadata']['symmetryGroup']='Oh'
    model['provenance'].update(operation='uniform-family',algorithmVersion='1',parameters={'family':family,'n':n,'m':m})
    return model
