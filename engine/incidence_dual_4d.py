"""Finite 4D cell-plane reciprocation with literal ordered edge links.

Ordinary closed generalized cells and boundary incidence, including stars.
No supporting halfspaces, hull, angular sort, face collapse or filled measure.
"""
from collections import Counter,defaultdict
from copy import deepcopy
import hashlib
import json
import math
import numpy as np
from scipy.spatial import cKDTree
from .dual_morph_expansion import _clone,_cycle,_require
from .geometry import GeometryError,identity,validate,TOLERANCE

VERSION='0.5.0'
DEFINITION='0.25.0-literal-cell-plane-4d'
KINDS=('vertices','edges','faces','cells')
MAX_VERTICES=4000
MAX_CELLS=2048
MAX_ELEMENTS=32000
MAX_INCIDENCES=1000000

def snapshot_hash(source):
    return hashlib.sha256(json.dumps(source,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def _rank(cloud):
    s=np.linalg.svd(cloud-cloud[0],compute_uv=False)
    return int(np.sum(s>TOLERANCE*8))

def _boundary(model,points):
    """Actual cycles, closed cell shells, one full cyclic edge link."""
    edges=model['edges'];faces=model['faces'];cells=model['cells']
    edge_lookup={tuple(sorted(E)):e for e,E in enumerate(edges)}
    _require(len(edge_lookup)==len(edges),'4D incidence dual source edges are duplicated.')
    edge_faces=[[] for E in edges];face_edges=[];vertex_edges=[[] for v in points]
    for e,(a,b) in enumerate(edges):vertex_edges[a].append(e);vertex_edges[b].append(e)
    for f,F in enumerate(faces):
        boundary=[edge_lookup.get(tuple(sorted((a,b)))) for a,b in zip(F,F[1:]+F[:1])]
        _require(all(e is not None for e in boundary) and len(set(boundary))==len(boundary),'4D incidence dual face repeats or omits a literal boundary edge.')
        for e in boundary:edge_faces[e].append(f)
        face_edges.append(boundary)
    _require(all(edge_faces) and all(vertex_edges),'4D incidence dual wire leftovers and isolated vertices are unsupported.')
    face_cells=[[] for F in faces];cell_vertices=[];cell_edges=[]
    visits=sum(len(F) for F in faces)
    for c,cell in enumerate(cells):
        _require(len(cell)>=4 and len(set(cell))==len(cell),'4D incidence dual cell needs at least four distinct literal faces.')
        counts=Counter(e for f in cell for e in face_edges[f]);vertices=set(v for f in cell for v in faces[f])
        visits+=sum(len(face_edges[f]) for f in cell)
        _require(visits<=MAX_INCIDENCES,'4D incidence dual traversal budget exceeded.')
        _require(all(n==2 for n in counts.values()),f'Source cell {c} is open/nonmanifold: each actual edge must have two distinct faces.')
        local_faces={e:[] for e in counts};adjacency=defaultdict(set)
        for f in cell:
            face_cells[f].append(c)
            for e in face_edges[f]:local_faces[e].append(f)
        for fs in local_faces.values():adjacency[fs[0]].add(fs[1]);adjacency[fs[1]].add(fs[0])
        pending=[cell[0]];seen=set()
        while pending:
            f=pending.pop()
            if f not in seen:seen.add(f);pending.extend(adjacency[f]-seen)
        _require(seen==set(cell),f'Source cell {c} has disconnected face-shell components.')
        for v in vertices:
            link=defaultdict(list)
            for e in vertex_edges[v]:
                if e in local_faces:
                    a,b=local_faces[e];link[a].append(b);link[b].append(a)
            _cycle(link,f'Source cell {c} vertex {v} face link')
        _require(_rank(points[sorted(vertices)])==3,f'Source cell {c} plane has unresolved affine rank or is nonplanar.')
        cell_vertices.append(sorted(vertices));cell_edges.append(sorted(counts))
    _require(all(len(C)==2 and C[0]!=C[1] for C in face_cells),'4D incidence dual needs exactly two distinct cells per source face; open/nonmanifold ridges are unsupported.')
    links=[]
    for e,fs in enumerate(edge_faces):
        adjacency=defaultdict(list)
        for f in fs:
            a,b=face_cells[f];adjacency[a].append(b);adjacency[b].append(a)
        links.append(_cycle(adjacency,f'Source edge {e} cell link'))
    return {'faceEdges':face_edges,'edgeFaces':edge_faces,'faceCells':face_cells,'cellVertices':cell_vertices,
            'cellEdges':cell_edges,'vertexEdges':vertex_edges,'edgeCellCycles':links,'visitedIncidences':visits}

def incidence_dual_4d(model,center=None,radius=1):
    source=_clone(model)
    _require(source.get('dimension')==4 and source.get('embeddingDimension',4)==4 and source.get('interpretation') in ('convex-polytope','generalized-complex'),
             '4D incidence dual requires an ordinary finite intrinsic 4D convex or generalized boundary.')
    _require(validate(source)['passed'],'4D incidence dual source geometry/incidence validation failed.')
    _require(5<=len(source['vertices'])<=MAX_VERTICES and 5<=len(source['cells'])<=MAX_CELLS and all(len(source[k])<=MAX_ELEMENTS for k in ('edges','faces')),
             '4D incidence dual exceeds 4000 vertices/2048 cells/32000 edges or faces, or has insufficient full-dimensional incidence.')
    _require(all(type(x) in (int,float) and math.isfinite(x) for v in source['vertices'] for x in v),'4D incidence dual needs literal finite numeric coordinates.')
    fingerprint=identity(source);_require(source.get('fingerprint',fingerprint)==fingerprint,'4D incidence dual source fingerprint differs from literal incidence.')
    P=np.asarray(source['vertices'],dtype=float);span=float(np.max(np.ptp(P,axis=0)))
    _require(math.isfinite(span) and span>0 and _rank((P-P[0])/span)==4,'4D incidence dual source scale or affine rank is unresolved.')
    _require(center is None or type(center) in (list,tuple) and len(center)==4 and all(type(x) in (int,float) and math.isfinite(x) for x in center),'4D reciprocation center requires four finite literal coordinates.')
    C=P.mean(axis=0) if center is None else np.asarray(center,dtype=float)
    _require(np.isfinite(C).all() and type(radius) in (int,float) and math.isfinite(radius) and radius>0,'4D reciprocation requires a finite center and positive finite numeric radius.')
    r2=radius*radius;_require(math.isfinite(r2) and r2>0,'4D reciprocation radius squared overflowed or vanished.')
    boundary=_boundary(source,(P-P[0])/span);Q=[];offsets=[];maximumCellPlaneResidual=0.
    for c,ids in enumerate(boundary['cellVertices']):
        cloud=(P[ids]-C)/span;_,s,vt=np.linalg.svd(cloud-cloud[0],full_matrices=True)
        _require(len(s)>=3 and s[2]>TOLERANCE*8 and (len(s)<4 or s[3]<=TOLERANCE*8),f'Source cell {c} has a nonplanar or unresolved cell plane.')
        n=vt[-1];h=float(n@cloud.mean(axis=0))*span
        _require(abs(h)>TOLERANCE*span*8,f'Source cell {c} passes through/too near the center; its reciprocal vertex is singular.')
        residual=float(np.max(np.abs((P[ids]-C)@n-h)));maximumCellPlaneResidual=max(maximumCellPlaneResidual,residual/span)
        _require(residual<=TOLERANCE*span*16,f'Source cell {c} plane residual is unresolved.')
        Q.append(C+n*(r2/h));offsets.append(abs(h))
    Q=np.asarray(Q);_require(np.isfinite(Q).all(),'4D reciprocal vertices overflowed.')
    dualSpan=float(np.max(np.ptp(Q,axis=0)));_require(math.isfinite(dualSpan) and dualSpan>0,'4D reciprocal scale vanished or overflowed.')
    _require(not cKDTree((Q-C)/dualSpan).query_pairs(TOLERANCE*8),'Distinct source cell planes have coincident or unresolved reciprocal vertices; no identities are collapsed.')
    _require(_rank((Q-Q[0])/dualSpan)==4,'4D reciprocal has unresolved affine span.')
    edges=[C[:] for C in boundary['faceCells']];faces=[F[:] for F in boundary['edgeCellCycles']];cells=[E[:] for E in boundary['vertexEdges']]
    result={'id':'4D incidence dual of '+str(source.get('id')),'name':'4D incidence dual of '+source.get('name','source'),
        'dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex','vertices':Q.tolist(),'edges':edges,'faces':faces,'cells':cells,
        'numeric':{'mode':'float64-approximate','tolerance':TOLERANCE,'certified':False}}
    result['validation']=validate(result);_require(result['validation']['passed'],'4D reciprocal geometry failed its rank/planarity/incidence validation.')
    reciprocalBoundary=_boundary(result,(Q-Q[0])/dualSpan)
    maximumPolarityResidual=max(abs(float((P[v]-C)@(Q[c]-C))-r2) for c,ids in enumerate(boundary['cellVertices']) for v in ids)
    _require(maximumPolarityResidual<=TOLERANCE*r2*32,'4D cell/vertex polarity residual is unresolved.')
    _require(len(P)-len(source['edges'])+len(source['faces'])-len(source['cells'])==-(len(Q)-len(edges)+len(faces)-len(cells)),
             '4D incidence reversal Euler relation failed.')
    maps={kind:[{'sourceRank':3-r,'sourceElement':i,'sourceModelId':source.get('id'),'sourceFingerprint':fingerprint} for i in range(len(result[kind]))] for r,kind in enumerate(KINDS)}
    raw=source.get('metadata',{}).get('offColors',{});colors={kind:[deepcopy(raw.get(KINDS[3-r],[])[i]) if i<len(raw.get(KINDS[3-r],[])) else None for i in range(len(result[kind]))] for r,kind in enumerate(KINDS)}
    result['metadata']={'family':'4D incidence dual','coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),
        'offColors':colors,'sourceMetadata':deepcopy(source.get('metadata',{})),
        'elementSourceMaps':maps,'dualSourceCellIds':list(range(len(Q))),'dualSourceFaceIds':list(range(len(edges))),
        'dualSourceEdgeIds':list(range(len(faces))),'dualSourceVertexIds':list(range(len(cells))),
        'fillSemantics':'Ordered face cycles and complete literal cells; crossings create no vertices, no convexity/filled volume/density asserted.',
        'incidenceDual':{'version':1,'definitionVersion':DEFINITION,'sourceSnapshotSha256':snapshot_hash(source),
            'sourceCounts':[len(source[k]) for k in KINDS],'dualCounts':[len(result[k]) for k in KINDS],
            'sourceEdgeCellCycles':deepcopy(boundary['edgeCellCycles']),'sourceCellVertexIds':deepcopy(boundary['cellVertices']),
            'sourceVisitedIncidences':boundary['visitedIncidences'],'dualVisitedIncidences':reciprocalBoundary['visitedIncidences']}}
    result['provenance']={'operation':'incidence-dual','algorithmVersion':VERSION,'definitionVersion':DEFINITION,
        'sourceId':source.get('id'),'sourceFingerprint':fingerprint,'sourceSnapshotSha256':snapshot_hash(source),
        'parameters':{'center':C.tolist(),'radius':radius},'convexified':False,
        'boundaryMethod':'Source cell planes -> dual vertices; source ridge cell pairs -> dual edges; actual source-edge cell-link cycles -> dual faces; source vertex edge sets -> full dual cells.',
        'maximumPolarityResidual':maximumPolarityResidual,'polarityTolerance':TOLERANCE*r2*32,
        'maximumNormalizedCellPlaneResidual':maximumCellPlaneResidual,'minimumCellCenterDistance':min(offsets)}
    result['fingerprint']=identity(result)
    return result
