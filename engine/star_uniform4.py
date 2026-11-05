"""Registered rational-angle Wythoff boundaries; never replace stars by hulls."""
from collections import Counter, deque
from copy import deepcopy
from fractions import Fraction
from functools import lru_cache
from itertools import combinations
import json
import math
from pathlib import Path
import uuid
import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError, canonical_cycle, identity, validate
from .wythoff import _OrbitIndex, _verify_orbit_closure

DATA=Path(__file__).resolve().parent/'catalog_data/star_uniform4.json'
KINDS=('vertices','edges','faces','cells')

@lru_cache(maxsize=1)
def manifest():
    return json.loads(DATA.read_text(encoding='utf-8'))

def star_uniform4_catalog():
    return deepcopy(manifest()['entries'])

def _orbit(seed,actions):
    seen={tuple(sorted(seed))};pending=deque(seen)
    while pending:
        row=pending.popleft()
        for action in actions:
            other=tuple(sorted(action[v] for v in row))
            if other not in seen:seen.add(other);pending.append(other)
    return seen

def _active(nodes,rings):
    return all(any(rings[n] for n in part) for part in
               np.split(np.asarray(nodes),np.where(np.diff(nodes)!=1)[0]+1))

def _cycle(edges):
    neighbors={}
    for a,b in edges:
        neighbors.setdefault(a,[]).append(b);neighbors.setdefault(b,[]).append(a)
    if any(len(row)!=2 for row in neighbors.values()):
        raise GeometryError('Rational Wythoff face has coinciding or branched edges.')
    start=min(neighbors);row=[start];previous=None;current=start
    while True:
        other=next(v for v in sorted(neighbors[current]) if v!=previous)
        if other==start:break
        if other in row:raise GeometryError('Rational Wythoff face is a compound cycle.')
        row.append(other);previous,current=current,other
    if len(row)!=len(neighbors):raise GeometryError('Rational Wythoff face has disconnected cycles.')
    return list(canonical_cycle(row))

def rational_boundary(diagram,rings,expected_vertices):
    """Bounded internal builder; public generation only uses verified manifest rows."""
    if len(diagram)!=3 or len(rings)!=4 or any(type(r) is not int or r not in (0,1) for r in rings) or not any(rings):
        raise GeometryError('Rational Wythoff requires three angles and four nonempty binary rings.')
    try:angles=[Fraction(m) for m in diagram]
    except (ValueError,TypeError,ZeroDivisionError) as exc:raise GeometryError('Invalid rational mirror angle.') from exc
    if any(m.numerator not in (3,4,5) or not 1<=m.denominator<m.numerator for m in angles):
        raise GeometryError('Only finite rank-four angles with numerators 3, 4, 5 are supported.')
    if type(expected_vertices) is not int or not 1<=expected_vertices<=14400:
        raise GeometryError('Rational Wythoff requires a published orbit bound of at most 14,400 vertices.')
    gram=np.eye(4)
    for i,m in enumerate(angles):gram[i,i+1]=gram[i+1,i]=-math.cos(math.pi/float(m))
    try:roots=np.linalg.cholesky(gram)
    except np.linalg.LinAlgError as exc:raise GeometryError('Rational mirror Gram matrix is not positive definite.') from exc
    seed=np.linalg.solve(roots,np.asarray(rings)*.5);scale=float(np.linalg.norm(seed));seed/=scale
    points=[seed];pending=deque(points);index=_OrbitIndex();index.add(seed)
    while pending:
        point=pending.popleft()
        for root in roots:
            other=point-2*np.dot(point,root)*root
            if index.find(other) is None:
                if len(points)>=expected_vertices:raise GeometryError('Rational orbit exceeds its published vertex count; unsupported or unresolved seed.')
                index.add(other);points.append(other);pending.append(other)
    if len(points)!=expected_vertices:raise GeometryError('Rational seed has coinciding vertices or disagrees with the published count.')
    residual=_verify_orbit_closure(points,roots,index)
    points=np.asarray(points);tree=cKDTree(points);actions=[]
    for root in roots:
        distances,ids=tree.query(points-2*np.outer(points@root,root))
        if max(distances)>1e-8 or len(set(ids))!=len(points):raise GeometryError('Rational reflection action is unresolved.')
        actions.append(ids.tolist())
    points*=scale
    previous_actions=actions;seeds={};strata=[]
    for dimension in (1,2,3):
        local={};all_rows=set()
        for nodes in combinations(range(4),dimension):
            if not _active(nodes,rings):continue
            if dimension==1:row=tuple(sorted((0,actions[nodes[0]][0])))
            else:
                boundary=set()
                for sub in combinations(nodes,dimension-1):
                    if sub in seeds:boundary.update(_orbit(seeds[sub],[previous_actions[n] for n in nodes]))
                row=tuple(sorted({v for face in boundary for v in face}))
            if dimension==1 and len(set(row))!=2:raise GeometryError('Rational seed collapses an edge.')
            local[nodes]=row;all_rows.update(_orbit(row,previous_actions))
        rows=sorted(all_rows);lookup={row:i for i,row in enumerate(rows)}
        seeds={nodes:(lookup[row],) for nodes,row in local.items()}
        next_actions=[[lookup[tuple(sorted(action[v] for v in row))] for row in rows] for action in previous_actions]
        if dimension==1:strata.append([list(e) for e in rows])
        elif dimension==2:strata.append([_cycle([strata[0][e] for e in row]) for row in rows])
        else:strata.append([list(row) for row in rows])
        previous_actions=next_actions
    edges,faces,cells=strata
    model={'id':str(uuid.uuid4()),'name':'Rational Wythoff boundary','dimension':4,'embeddingDimension':4,
           'interpretation':'generalized-complex','vertices':points.tolist(),'edges':edges,'faces':faces,'cells':cells,
           'metadata':{},'numeric':{'mode':'float64-approximate','certified':False,'tolerance':1e-8,
           'algorithm':'rational mirror orbit + ordered parabolic boundary orbits'},
           'provenance':{'operation':'star-uniform4-wythoff','algorithmVersion':'1','parameters':{'diagram':list(diagram),'rings':list(rings)},
           'mirrorGramResidual':float(np.max(abs(roots@roots.T-gram))),'orbitClosureResidual':residual,
           'orbitTolerance':1e-9,'expectedOrbitSize':expected_vertices}}
    return model

def _polygon_data(points,face):
    cloud=points[face];cloud=cloud-cloud.mean(axis=0)
    _,_,vt=np.linalg.svd(cloud,full_matrices=False);plane=cloud@vt[:2].T
    angles=np.arctan2(plane[:,1],plane[:,0]);turns=(np.roll(angles,-1)-angles+math.pi)%(2*math.pi)-math.pi
    winding=int(round(abs(float(np.sum(turns)))/(2*math.pi)))
    n=len(face)
    if not 1<=winding<n/2 or math.gcd(n,winding)!=1:raise GeometryError('Unsupported compound or degenerate polygon.')
    expected=2*math.pi*winding/n
    radii=np.linalg.norm(cloud,axis=1)
    radial=float(np.ptp(radii)/np.mean(radii));angular=float(np.max(abs(abs(turns)-expected)))
    if radial>1e-7 or angular>1e-7 or not (np.all(turns>0) or np.all(turns<0)):
        raise GeometryError('Rational face is not a regular polygon within tolerance.')
    return str(n) if winding==1 else f'{n}/{winding}',radial,angular

def polygon_symbol(points,face):
    return _polygon_data(points,face)[0]

def boundary_evidence(model):
    """Local orientations and opposite shared-face signs on the abstract boundary."""
    uses=[[] for _ in model['faces']];orientations=[]
    for ci,cell in enumerate(model['cells']):
        at_edge={}
        for fi in cell:
            face=model['faces'][fi]
            for a,b in zip(face,face[1:]+face[:1]):at_edge.setdefault(tuple(sorted((a,b))),[]).append((fi,1 if a<b else -1))
        if any(len(row)!=2 for row in at_edge.values()):raise GeometryError('Star cell has an open or nonmanifold edge link.')
        graph={f:[] for f in cell}
        for (a,x),(b,y) in at_edge.values():graph[a].append((b,-x*y));graph[b].append((a,-x*y))
        signs={cell[0]:1};pending=[cell[0]]
        while pending:
            a=pending.pop()
            for b,sign in graph[a]:
                if b in signs:
                    if signs[b]!=signs[a]*sign:raise GeometryError('Nonorientable cell boundary is outside this native registry.')
                else:signs[b]=signs[a]*sign;pending.append(b)
        if len(signs)!=len(cell):raise GeometryError('Disconnected star cell boundary.')
        orientations.append([signs[f] for f in cell])
        for fi in cell:uses[fi].append((ci,signs[fi]))
    if any(len(row)!=2 for row in uses):raise GeometryError('Every native star face must belong to exactly two cells.')
    graph=[[] for _ in model['cells']]
    for (a,x),(b,y) in uses:graph[a].append((b,-x*y));graph[b].append((a,-x*y))
    signs={0:1};pending=[0]
    while pending:
        a=pending.pop()
        for b,sign in graph[a]:
            if b in signs:
                if signs[b]!=signs[a]*sign:raise GeometryError('Nonorientable polychoron is outside this native registry.')
            else:signs[b]=signs[a]*sign;pending.append(b)
    if len(signs)!=len(graph):raise GeometryError('Disconnected star polychoron boundary.')
    return [[signs[i]*s for s in row] for i,row in enumerate(orientations)]

def cell_signature(model,cell,symbols):
    faces=[model['faces'][i] for i in cell]
    vertices={v for f in faces for v in f}
    edges={tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])}
    return [len(vertices),len(edges),len(faces)],dict(sorted(Counter(symbols[i] for i in cell).items()))

@lru_cache(maxsize=4)
def _build(key):
    entry=next((r for r in manifest()['entries'] if r['key']==key),None)
    if entry is None:return None
    model=rational_boundary(entry['diagram'],entry['rings'],entry['counts'][0])
    if [len(model[k]) for k in KINDS]!=entry['counts']:raise GeometryError('Native star incidence disagrees with the published face vector.')
    p=np.asarray(model['vertices']);e=np.asarray(model['edges']);lengths=np.linalg.norm(p[e[:,0]]-p[e[:,1]],axis=1)
    if np.linalg.matrix_rank((p-p.mean(axis=0))/np.max(np.ptp(p,axis=0)),tol=1e-8)!=4:
        raise GeometryError('Native star coordinates do not resolve four dimensions.')
    spread=float(np.ptp(lengths)/np.mean(lengths))
    if spread>1e-7:raise GeometryError('Native star equal-edge residual exceeds tolerance.')
    face_data=[_polygon_data(p,f) for f in model['faces']];symbols=[row[0] for row in face_data]
    signatures=[cell_signature(model,c,symbols) for c in model['cells']];inventory=[];unassigned=set(range(len(signatures)))
    for cell in entry['cellTypes']:
        ids=[i for i,s in enumerate(signatures) if s==(cell['counts'],cell['facePolygons'])]
        if len(ids)!=cell['count'] or not set(ids)<=unassigned:raise GeometryError('Native star cell boundary disagrees with the published cell inventory.')
        unassigned.difference_update(ids);inventory.append({**deepcopy(cell),'ids':ids})
    if unassigned:raise GeometryError('Native star has unverified cell types.')
    orientations=boundary_evidence(model)
    model['name']=entry['name'];model['metadata'].update(deepcopy(entry))
    model['metadata']['uniformVerification']={'countsMatched':True,'cellTypesMatched':True,'edgeRelativeSpread':spread,
        'facePolygonCounts':dict(sorted(Counter(symbols).items())),'maxFaceRadialRelativeSpread':max(row[1] for row in face_data),
        'maxFaceAngularResidual':max(row[2] for row in face_data),'orientable':True,'faceCellIncidences':2,'exact':False}
    model['provenance']['cellFaceOrientations']=orientations
    model['validation']=validate(model)
    if not model['validation']['passed']:raise GeometryError('Native star boundary validation failed: '+'; '.join(model['validation']['errors']))
    model['fingerprint']=identity(model)
    return model,inventory

def load_star_uniform4(key):
    if not isinstance(key,str) or not key.startswith('star-uniform4-'):return None
    built=_build(key)
    if built is None:return None
    model=deepcopy(built[0]);model['id']=str(uuid.uuid4());return model

def native_star_evidence(model):
    metadata=model.get('metadata') if isinstance(model,dict) else None
    key=metadata.get('key') if isinstance(metadata,dict) else None
    if not isinstance(key,str) or not key.startswith('star-uniform4-'):return None
    built=_build(key)
    if built is None or any(model.get(k)!=built[0][k] for k in ('dimension','embeddingDimension','interpretation')) or identity(model)!=built[0]['fingerprint']:return None
    return {'cellTypes':deepcopy(built[1]),'verification':deepcopy(built[0]['metadata']['uniformVerification']),
            'orbitClosureResidual':built[0]['provenance']['orbitClosureResidual'],
            'referenceUrls':deepcopy(built[0]['metadata']['referenceUrls'])}

def native_cell_inventory(model):
    evidence=native_star_evidence(model)
    return evidence['cellTypes'] if evidence is not None else None
