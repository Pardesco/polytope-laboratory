"""Literal vertex links with midpoint/unit-distance metric adapters; no hull."""
from collections import Counter,defaultdict
import hashlib
import math
import numpy as np
from .geometry import identity,validate,TOLERANCE
from .history import _json_bytes
from .dual_morph_expansion import _cycle,_require
from .incidence_dual_4d import _boundary

VERSION='0.1.0'
EPS=TOLERANCE*8


def source_boundary(model):
    import json
    source=json.loads(_json_bytes(model,32*1024*1024))
    _require(type(source) is dict and source.get('dimension') in (3,4) and
             source.get('embeddingDimension',source['dimension'])==source['dimension'] and
             source.get('interpretation') in ('convex-polytope','generalized-complex') and not source.get('components'),
             'Incidence construction requires one intrinsic 3D/4D closed boundary.')
    _require(all(type(source.get(k)) is list and 0<len(source[k])<=bound for k,bound in
                 (('vertices',4000),('edges',32000),('faces',32000))) and len(source.get('cells',[]))<=2048 and
             sum(map(len,source['faces']))<=200000,'Incidence source exceeds bounded work limits.')
    _require(validate(source)['passed'],'Invalid source geometry/incidence for vertex links.')
    _require(source.get('fingerprint',identity(source))==identity(source),'Incidence source fingerprint is stale.')
    p=np.asarray(source['vertices'],dtype=float);span=float(np.max(np.ptp(p,axis=0)))
    _require(math.isfinite(span) and span>0,'Source metric scale is unresolved.')
    q=(p-p.mean(axis=0))/span
    _require(np.linalg.matrix_rank(q,EPS)==source['dimension'],'Source intrinsic affine rank is unresolved.')
    _require(all(np.linalg.norm(q[a]-q[b])>EPS for a,b in source['edges']),'Source has an unresolved edge length.')
    vertex_faces=[[] for _ in p]
    for fi,face in enumerate(source['faces']):
        for v in face:vertex_faces[v].append(fi)
    if source['dimension']==4:
        _require(len(source['cells'])>=5,'A closed 4D boundary requires complete cells.')
        boundary=_boundary(source,q)
        for vertex in range(len(p)):
            incident=vertex_faces[vertex]
            nodes={c for fi in incident for c in boundary['faceCells'][fi]};neighbors={c:set() for c in nodes}
            for fi in incident:
                a,b=boundary['faceCells'][fi];neighbors[a].add(b);neighbors[b].add(a)
            seen=set();pending=[min(nodes)]
            while pending:
                c=pending.pop()
                if c not in seen:seen.add(c);pending.extend(neighbors[c]-seen)
            _require(seen==nodes,'Source vertex has disconnected/pinched cell links.')
    else:
        _require(not source.get('cells'),'3D source must be a face shell without 4D cells.')
        edges={tuple(sorted(e)):i for i,e in enumerate(source['edges'])};counts=Counter()
        vertex_edges=[[] for _ in p]
        for ei,(a,b) in enumerate(source['edges']):vertex_edges[a].append(ei);vertex_edges[b].append(ei)
        for f in source['faces']:
            counts.update(tuple(sorted((a,b))) for a,b in zip(f,f[1:]+f[:1]))
        _require(set(counts)==set(edges) and all(n==2 for n in counts.values()),'Every source edge must belong to two faces.')
        boundary={'vertexEdges':vertex_edges}
        for vertex in range(len(p)):corner_cycle(source,vertex_faces[vertex],vertex)
    boundary['vertexFaces']=vertex_faces
    return source,p,q,boundary


def corner_cycle(source,faces,vertex):
    adjacency=defaultdict(list)
    for fi in faces:
        face=source['faces'][fi]
        if vertex not in face:continue
        i=face.index(vertex);a,b=face[i-1],face[(i+1)%len(face)]
        adjacency[a].append(b);adjacency[b].append(a)
    _require(all(len(row)==2 for row in adjacency.values()),'Source vertex/cell link has repeated or nonmanifold incidences.')
    return _cycle(adjacency,'Source vertex '+str(vertex))


def combinatorial_vertex_figure(model,vertex=0,placement='midpoint'):
    source,p,q,boundary=source_boundary(model);d=source['dimension']
    _require(type(vertex) is int and 0<=vertex<len(p),'Choose an existing literal vertex index.')
    _require(placement in ('midpoint','unit-distance'),'Choose midpoint or unit-distance vertex-figure placement.')
    edge_ids=boundary['vertexEdges'][vertex];neighbors=[]
    for ei in edge_ids:
        a,b=source['edges'][ei];neighbors.append(b if a==vertex else a)
    mapping={w:i for i,w in enumerate(neighbors)};vectors=p[neighbors]-p[vertex];directions=q[neighbors]-q[vertex]
    points=vectors*.5 if placement=='midpoint' else directions/np.linalg.norm(directions,axis=1)[:,None]
    center=points.mean(axis=0);cloud=points-center;origin=p[vertex]+center
    _,singular,axes=np.linalg.svd(cloud/float(np.max(np.ptp(points,axis=0))),full_matrices=False)
    affine_rank=int(sum(singular>EPS))
    residual=float(max(np.linalg.norm(cloud-(cloud@axes[:d-1].T)@axes[:d-1],axis=1),default=0))
    _require(affine_rank==d-1,'The incidence link exists, but this placement is not a planar intrinsic vertex figure. Try the other placement; no flattening or slicing substitution is performed.')
    local=cloud@axes[:d-1].T;face_sources=[];edge_sources=[]
    if d==3:
        cycle=corner_cycle(source,boundary['vertexFaces'][vertex],vertex)
        faces=[[mapping[w] for w in cycle]]
    else:
        faces=[]
        for ci,ids in enumerate(boundary['cellVertices']):
            if vertex in ids:
                faces.append([mapping[w] for w in corner_cycle(source,source['cells'][ci],vertex)])
                face_sources.append({'cell':ci})
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    for a,b in edges:
        owners=[fi for fi in boundary['vertexFaces'][vertex] for f in [source['faces'][fi]] if
                {f[f.index(vertex)-1],f[(f.index(vertex)+1)%len(f)]}=={neighbors[a],neighbors[b]}]
        _require(len(owners)==1,'Vertex link has duplicate/ambiguous source face ownership.')
        edge_sources.append({'face':owners[0]})
    info={'version':VERSION,'mode':'combinatorial','placement':placement,'sourceVertex':vertex,'sourceFingerprint':identity(source),
          'vertexSources':[{'edge':ei} for ei in edge_ids],'edgeSources':edge_sources,'faceSources':face_sources,
          'origin':origin.tolist(),'basis':axes[:d-1].T.tolist(),'maximumEmbeddingResidual':residual,
          'hullUsed':False,'definition':'source edges -> vertices; source faces -> edges; source cells -> ordered faces'}
    result={'id':'vertex-link-'+hashlib.sha256(_json_bytes([identity(source),vertex,placement])).hexdigest(),
            'name':f'Combinatorial vertex figure {vertex} of '+source.get('name','source'),
            'dimension':d-1,'embeddingDimension':d-1,'interpretation':'generalized-complex',
            'vertices':local.tolist(),'edges':[list(e) for e in edges],'faces':faces,'cells':[],
            'metadata':{'combinatorialVertexFigure':info,'coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),
                        'fillRule':source.get('metadata',{}).get('fillRule','nonzero')},
            'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE},
            'provenance':{'operation':'vertex-figure','algorithmVersion':VERSION,'sourceId':source.get('id'),
                          'sourceFingerprint':identity(source),'parameters':{'vertex':vertex,'mode':'combinatorial','placement':placement}}}
    result['validation']=validate(result)
    _require(result['validation']['passed'],'Incidence vertex figure has nonplanar faces or unresolved geometry.')
    result['fingerprint']=identity(result)
    return {'status':'full-dimensional','model':result,'sourceId':source.get('id'),**info}
