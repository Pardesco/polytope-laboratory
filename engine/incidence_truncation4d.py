"""Directed-edge 4D truncation retaining complete source cells and links."""
from copy import deepcopy
import hashlib
import json
import math
from .polish_names import incidence_cut_name
import numpy as np
from .geometry import identity,validate,TOLERANCE
from .history import _json_bytes
from .dual_morph_expansion import _require
from .combinatorial_vertex_figures import source_boundary,corner_cycle,EPS
from .incidence_dual_4d import _boundary

VERSION='0.1.0'


def incidence_truncate4d(model,preset='manual',amount=1/3,reference_face=None,cap_colors='inherit'):
    source,p,_,boundary=source_boundary(model)
    _require(source['dimension']==4,'4D incidence cuts require a complete 4D boundary.')
    _require(preset in ('manual','rectify'),'4D incidence cuts support manual fractions or midpoint rectification.')
    _require(reference_face is None,'4D incidence cuts do not use a reference face.')
    _require(cap_colors in ('inherit','none'),'Cap colors must be inherit or none.')
    t=.5 if preset=='rectify' else amount
    _require(type(t) in (int,float) and math.isfinite(t) and 0<t<=.5,'4D edge-cut fraction must lie strictly above 0 and at most 1/2.')
    _require(sum(len(ids) for ids in boundary['cellVertices'])+len(source['faces'])<=32000,'4D edge-cut output face bound exceeded.')
    corners={};vertices=[];vertex_sources=[]
    for ei,(a,b) in enumerate(source['edges']):
        for v,w in ((a,b),) if t==.5 else ((a,b),(b,a)):
            corners[v,w]=len(vertices)
            if t==.5:corners[w,v]=len(vertices)
            vertices.append(((1-t)*p[v]+t*p[w]).tolist());vertex_sources.append({'edge':ei,'ownerVertex':None if t==.5 else v})
    _require(len(vertices)<=64000,'4D edge-cut output vertex bound exceeded.')
    faces=[];face_sources=[]
    for fi,f in enumerate(source['faces']):
        cycle=[]
        for i,v in enumerate(f):
            if t!=.5:cycle.append(corners[v,f[i-1]])
            cycle.append(corners[v,f[(i+1)%len(f)]])
        faces.append(cycle);face_sources.append({'face':fi})
    cells=[];cell_sources=[];caps=[[] for _ in p]
    for ci,cell in enumerate(source['cells']):
        cut=list(cell)
        for v in boundary['cellVertices'][ci]:
            link=corner_cycle(source,cell,v);fi=len(faces)
            faces.append([corners[v,w] for w in link]);face_sources.append({'cell':ci,'vertex':v})
            caps[v].append(fi);cut.append(fi)
        cells.append(cut);cell_sources.append({'cell':ci,'kind':'rectified-cell' if t==.5 else 'truncated-cell'})
    for v,cap in enumerate(caps):cells.append(cap);cell_sources.append({'vertex':v,'kind':'vertex-figure'})
    edges=sorted({tuple(sorted((a,b))) for f in faces for a,b in zip(f,f[1:]+f[:1])})
    output=np.asarray(vertices);span=float(np.max(np.ptp(output,axis=0)));local=(output-output.mean(axis=0))/span
    _require(np.isfinite(local).all() and all(np.linalg.norm(local[a]-local[b])>EPS for a,b in edges),'4D cut contains unresolved edges near a singular depth.')
    maximum=0.
    for label,items,rank in (('face',faces,2),('cell',[sorted({v for f in c for v in faces[f]}) for c in cells],3)):
        for i,ids in enumerate(items):
            cloud=local[ids]-local[ids].mean(axis=0);_,s,axes=np.linalg.svd(cloud,full_matrices=False)
            error=float(np.max(np.linalg.norm(cloud-(cloud@axes[:rank].T)@axes[:rank],axis=1)));maximum=max(maximum,error)
            _require(sum(s>EPS)==rank and error<=EPS,f'Cut {label} {i} is nonplanar or unresolved. Constant edge fractions need planar vertex caps; arbitrary metric links are unsupported without a different realization.')
    parameters={'preset':preset,'amount':float(t),'reference_face':None,'cap_colors':cap_colors};sha=hashlib.sha256(_json_bytes(source)).hexdigest()
    info={'algorithmVersion':VERSION,'sourceModelId':source.get('id'),'sourceFingerprint':identity(source),'sourceSnapshotSha256':sha,
          'sourceModel':source,'parameters':parameters,'vertexSources':vertex_sources,'faceSources':face_sources,'cellSources':cell_sources,
          'closedIncidence':True,'hullUsed':False,'toleranceWeld':False,'solidInteriorInferred':False,
          'maximumNormalizedPlanarityResidual':maximum,'semantics':'literal ordered boundary; intersections retained; no solid volume inferred'}
    raw=source.get('metadata',{}).get('offColors',{})
    def color(kind,index):
        values=raw.get(kind,[]);return deepcopy(values[index]) if index is not None and index<len(values) else None
    def common(values):
        return deepcopy(values[0]) if values and values[0] is not None and all(v==values[0] for v in values) else None
    vertex_cells=[[] for _ in p]
    for ci,ids in enumerate(boundary['cellVertices']):
        for v in ids:vertex_cells[v].append(ci)
    face_colors=[color('faces',r['face']) if 'face' in r else common([color('faces',fi) for fi in source['cells'][r['cell']] if r['vertex'] in source['faces'][fi]]) if cap_colors=='inherit' else None for r in face_sources]
    cell_colors=[color('cells',r['cell']) if 'cell' in r else common([color('cells',ci) for ci in vertex_cells[r['vertex']]]) if cap_colors=='inherit' else None for r in cell_sources]
    vertex_colors=[color('vertices',r['ownerVertex']) if t!=.5 else common([color('vertices',v) for v in source['edges'][r['edge']]]) for r in vertex_sources]
    edge_sources=[]
    for a,b in edges:
        ea,eb=vertex_sources[a]['edge'],vertex_sources[b]['edge']
        if t!=.5 and ea==eb:edge_sources.append({'edge':ea})
        else:edge_sources.append({'vertices':sorted(set(source['edges'][ea])&set(source['edges'][eb])),
                                  'faces':sorted(set(boundary['edgeFaces'][ea])&set(boundary['edgeFaces'][eb]))})
    info['edgeSources']=edge_sources
    result={'id':'incidence-cut-4d-'+hashlib.sha256((sha+json.dumps(parameters,sort_keys=True)).encode()).hexdigest(),
            'name':incidence_cut_name(source,t),
            'dimension':4,'embeddingDimension':4,'interpretation':'generalized-complex','vertices':vertices,
            'edges':[list(e) for e in edges],'faces':faces,'cells':cells,
            'numeric':{'mode':'float64-approximate','certified':False,'tolerance':TOLERANCE},
            'metadata':{'incidenceTruncation':info,'sourceMetadata':deepcopy(source.get('metadata',{})),
                        'coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),
                        'fillRule':source.get('metadata',{}).get('fillRule','nonzero'),
                        'offColors':{'faces':face_colors,'cells':cell_colors,'vertices':vertex_colors,'edges':[color('edges',r.get('edge')) for r in edge_sources]}},
            'provenance':{'operation':'incidence-truncate','algorithmVersion':VERSION,'sourceId':source.get('id'),
                          'sourceFingerprint':identity(source),'parameters':parameters,'convexified':False}}
    result['validation']=validate(result);_require(result['validation']['passed'],'Constructed 4D boundary failed validation.')
    _boundary(result,local);result['fingerprint']=identity(result)
    return result
