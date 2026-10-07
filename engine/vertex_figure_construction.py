"""Finite candidate completion from an intrinsic convex 3D vertex figure.

This matches existing native convex constructions, not an unrestricted
uniform/scaliform reconstruction theorem. Counts only prune; full normalized
metric, vertex bijection, edges and ordered face cycles decide every match.
"""
from collections import Counter
from copy import deepcopy
from functools import lru_cache
from itertools import product
import hashlib
import json
import math
import uuid

import numpy as np
from scipy.spatial import cKDTree
from .geometry import GeometryError, canonical_cycle, identity, validate
from .augmentation import _source
from .generators import regular
from .operations import vertex_figure, transform
from .wythoff import wythoff, FAMILIES, GROUP_ORDERS, _inactive_stabilizer_order

VERSION='0.1.0'
TOLERANCE=8e-8
REGULAR_KEYS=('simplex4','tesseract','cross4','cell24','cell120','cell600')
SOURCE_LIMIT=64
SEARCH_NODE_LIMIT=100000
DOMAINS=('regular-convex','regular-and-wythoff')


def _source_figure(model):
    if type(model) is not dict or type(model.get('vertices')) is not list or not 4<=len(model['vertices'])<=SOURCE_LIMIT:
        raise GeometryError('Vertex-figure construction requires 4..64 source vertices.')
    _source(model) # Independent convex-boundary/closed-link and literal index checks.
    if model.get('interpretation')!='convex-polytope':
        raise GeometryError('Choose an intrinsic convex 3D source as the supplied vertex figure.')
    return deepcopy(model)


def _normalized(model):
    p=np.asarray(model['vertices'],dtype=float)
    # Scaling before centering avoids overflow for large finite source units.
    magnitude=float(np.max(np.abs(p)))
    if not math.isfinite(magnitude) or magnitude==0:raise GeometryError('Vertex figure has no finite metric scale.')
    q=p/magnitude;center=q.mean(axis=0);q-=center
    radius=math.sqrt(float(np.mean(np.einsum('ij,ij->i',q,q))))
    if radius<=np.finfo(float).eps or np.linalg.matrix_rank(q,TOLERANCE)!=3:
        raise GeometryError('Vertex figure must have well-conditioned full affine rank 3.')
    return q/radius,(center*magnitude).tolist(),radius*magnitude


def _incidence(model,permutation=None):
    mapping=list(range(len(model['vertices']))) if permutation is None else permutation
    edges=Counter(tuple(sorted(mapping[i] for i in e)) for e in model['edges'])
    faces=Counter(tuple(canonical_cycle([mapping[i] for i in face])) for face in model['faces'])
    return edges,faces


def match_vertex_figure(source,target):
    """Return one complete similarity receipt, or None after bounded exhaustion."""
    if tuple(len(source[k]) for k in ('vertices','edges','faces'))!=tuple(len(target[k]) for k in ('vertices','edges','faces')):
        return None
    a,source_center,source_radius=_normalized(source);b,target_center,target_radius=_normalized(target)
    # Entire sorted distance matrix is a necessary metric test, never acceptance.
    distances=lambda p:np.sort(np.sum((p[:,None]-p[None,:])**2,axis=2),axis=1)
    signatures_a=distances(a);signatures_b=distances(b)
    choices=[np.flatnonzero(np.max(np.abs(signatures_b-row),axis=1)<=TOLERANCE*8) for row in signatures_a]
    if any(not len(c) for c in choices):return None
    radii=np.einsum('ij,ij->i',b,b)
    choices=[c[np.abs(radii[c]-np.dot(a[i],a[i]))<=TOLERANCE*4] for i,c in enumerate(choices)]
    if any(not len(c) for c in choices):return None
    basis=[]
    for _ in range(3):
        possible=[i for i in range(len(a)) if i not in basis and np.linalg.matrix_rank(a[basis+[i]],TOLERANCE)==len(basis)+1]
        if not possible:raise GeometryError('No stable vertex-figure spanning frame.')
        basis.append(min(possible,key=lambda i:(len(choices[i]),-float(np.prod(np.linalg.svd(a[basis+[i]],compute_uv=False))),i)))
    frame=a[basis];inverse=np.linalg.inv(frame);gram=frame@frame.T;tree=cKDTree(b);target_incidence=_incidence(target)
    nodes=0;receipt=None
    def visit(indices):
        nonlocal nodes,receipt
        nodes+=1
        if nodes>SEARCH_NODE_LIMIT:raise GeometryError('Vertex-figure metric frame limit reached; no unresolved candidate was accepted.')
        if len(indices)==3:
            matrix=(inverse@b[indices]).T
            if np.max(np.abs(matrix@matrix.T-np.eye(3)))>TOLERANCE*8:return
            errors,mapping=tree.query(a@matrix.T)
            if max(errors)>TOLERANCE or len(set(mapping))!=len(a) or _incidence(source,mapping)!=target_incidence:return
            # Complete pairwise metric verification independent of nearest lookup.
            if np.max(np.abs(a@a.T-b[mapping]@b[mapping].T))>TOLERANCE*8:return
            receipt={'sourceVertexToCandidateFigure':mapping.tolist(),'orthogonalMatrix':matrix.tolist(),
                     'sourceCenter':source_center,'candidateFigureCenter':target_center,
                     'sourceRmsRadius':source_radius,'candidateFigureRmsRadius':target_radius,
                     'similarityScale':target_radius/source_radius,'maxNormalizedResidual':float(max(errors)),
                     'checks':['complete vertex bijection','full pairwise metric','edge multiplicity','ordered face cycles'],
                     'numericMode':'float64-approximate','certified':False}
            return
        k=len(indices);eligible=choices[basis[k]]
        if indices:eligible=eligible[np.all(np.abs(b[eligible]@b[indices].T-gram[k,:k])<=TOLERANCE*4,axis=1)]
        for i in eligible:
            if i not in indices:visit(indices+[int(i)])
            if receipt is not None:return
    visit([])
    return receipt


def candidate_specs(domain='regular-convex'):
    if domain not in DOMAINS:raise GeometryError('Choose regular-convex or regular-and-wythoff candidate domain.')
    result=[{'id':'regular:'+key,'kind':'regular','key':key} for key in REGULAR_KEYS]
    if domain=='regular-and-wythoff':
        # Practical finite extension: every equal-weight rank 4 seed whose
        # independently known orbit size is at most 128. No failed partial orbit.
        for family in ('A4','B4','F4','H4'):
            for rings in product((0,1),repeat=4):
                if not any(rings):continue
                expected=GROUP_ORDERS[family]//_inactive_stabilizer_order(FAMILIES[family],rings)
                if expected<=128:
                    mask=''.join(map(str,rings));result.append({'id':f'wythoff:{family}:{mask}','kind':'wythoff','family':family,'rings':list(rings)})
    return result


@lru_cache(maxsize=48)
def _candidate(candidate_id):
    spec=next((s for s in candidate_specs('regular-and-wythoff') if s['id']==candidate_id),None)
    if spec is None:raise GeometryError('Choose a candidate from the finite supported domain.')
    model=regular(spec['key']) if spec['kind']=='regular' else wythoff(spec['family'],spec['rings'],max_vertices=128)
    figure=vertex_figure(model,vertex=0,fraction=.15)
    if figure['status']!='full-dimensional' or not figure.get('model'):raise GeometryError('Candidate local vertex figure is unresolved.')
    return model,figure['model'],spec


def vertex_figure_candidates(model,domain='regular-convex'):
    source=_source_figure(model);rows=[];specs=candidate_specs(domain)
    for spec in specs:
        candidate,figure,_=_candidate(spec['id']);match=match_vertex_figure(source,figure)
        if match is not None:rows.append({'id':spec['id'],'name':candidate['name'],'kind':spec['kind'],
            'symbol':candidate.get('metadata',{}).get('symbol'),'counts':{k:len(candidate[k]) for k in ('vertices','edges','faces','cells')},
            'vertexFigureCounts':{k:len(figure[k]) for k in ('vertices','edges','faces')},'match':match})
    return {'algorithmVersion':VERSION,'sourceId':source['id'],'sourceFingerprint':identity(source),
        'sourceSha256':_hash(source),'domain':domain,'candidateCount':len(specs),'candidates':rows,
        'status':'ambiguous' if len(rows)>1 else 'matched' if rows else 'no-match',
        'scope':'Finite native convex 4D candidates only; a vertex figure does not determine a unique completion.',
        'numericMode':'float64-approximate','tolerance':TOLERANCE,'certified':False}


def _hash(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def construct_from_vertex_figure(model,candidate,edge_length=1):
    source=_source_figure(model)
    if type(candidate) is not str:raise GeometryError('Select one explicit supported completion candidate.')
    if type(edge_length) not in (int,float) or not math.isfinite(edge_length) or not 1e-6<=edge_length<=1e6:
        raise GeometryError('Output edge length must be finite and between 1e-6 and 1e6 source units.')
    template,figure,spec=_candidate(candidate);match=match_vertex_figure(source,figure)
    if match is None:raise GeometryError('The selected candidate no longer matches the full source vertex-figure metric and incidence.')
    a,b=template['edges'][0];current=math.dist(template['vertices'][a],template['vertices'][b])
    result=transform(template,scale=edge_length/current);result['name']=template['name']+' from vertex figure'
    result['id']=str(uuid.uuid5(uuid.NAMESPACE_URL,'vertex-figure-construction:'+_hash([source,candidate,edge_length,VERSION])))
    result['metadata']['coordinateUnits']=source.get('metadata',{}).get('coordinateUnits','model')
    result['metadata']['vertexFigureConstruction']={'algorithmVersion':VERSION,'candidate':deepcopy(spec),
        'sourceFigure':source,'sourceSha256':_hash(source),'sourceFingerprint':identity(source),
        'outputEdgeLength':edge_length,'sourceVertex':0,'cutFraction':.15,'match':match,
        'scope':'Selected finite native convex 4D completion, not a universal reconstruction.'}
    result['provenance']={'operation':'construct-from-vertex-figure','algorithmVersion':VERSION,
        'sourceId':source['id'],'sourceFingerprint':identity(source),'parameters':{'candidate':candidate,'edge_length':edge_length}}
    if not validate(result)['passed']:raise GeometryError('Completed candidate failed native structural validation.')
    return result
