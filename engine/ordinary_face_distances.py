"""Bounded source-face distance by a verified union of literal ear triangles.

Each small simplex pair uses all feasible active supports. The union minimum
retains original face IDs; no convex hull, source repair, or hole inference.
"""
from itertools import combinations, product
import hashlib
import numpy as np
from .geometry import GeometryError, TOLERANCE
from .element_annotations import _source
from .generalized_nets import _simple, _triangles_cached, _signed_area

MAX_VERTICES = 64
MAX_PAIRS = 4096
VERSION = '0.1.0'


def _parts(model, frame, entity, points, origin, scale):
    ids = frame['vertices']
    if frame['kind'] not in ('vertex','edge','face') or len(ids)>MAX_VERTICES:
        raise GeometryError('Ordinary face distance supports source vertices, edges and simple planar faces with at most 64 vertices.')
    cloud = (points[ids]-origin)/scale
    if frame['kind'] != 'face':
        return [list(ids)], {'kind':frame['kind'],'sourceIndex':entity['index'],'sourceVertexIds':list(ids)}
    relative = cloud-cloud[0]
    _, singular, axes = np.linalg.svd(relative, full_matrices=False)
    if len(singular)<2 or singular[1]<=TOLERANCE or (len(singular)>2 and singular[2]>TOLERANCE):
        raise GeometryError('Ordinary bounded face distance requires a nondegenerate simple planar face.')
    q=relative@axes[:2].T
    _simple(q,entity['index'])
    corners={tuple(p):i for i,p in enumerate(q)}
    if len(corners)!=len(ids):raise GeometryError('Ordinary distance refuses coincident original face corners.')
    triangles = _triangles_cached(tuple(map(tuple,q)))
    covered=sum(abs(_signed_area(T)) for T in triangles); area=abs(_signed_area(q))
    if not triangles or len(triangles)>len(ids)-2 or abs(covered-area)>max(area*1e-8,1e-12):
        raise GeometryError('Literal face triangulation did not verify region coverage; no distance adopted.')
    pieces=[[ids[corners[tuple(p)]] for p in T] for T in triangles]
    return pieces, {'kind':'face','sourceIndex':entity['index'],'sourceVertexIds':list(ids),
                    'sourceTriangles':pieces,'normalizedArea':area,'normalizedTriangleArea':covered,
                    'fillSemantics':'simple planar source cycle region; no holes or star winding'}


def _supports(n):
    return [list(ids) for size in range(1,n+1) for ids in combinations(range(n),size)]


def _simplex_distance(a,b):
    best=None
    for A,B in product(_supports(len(a)),_supports(len(b))):
        # Eliminate each simplex sum-to-one constraint at its first corner.
        columns=[a[i]-a[A[0]] for i in A[1:]]+[-(b[i]-b[B[0]]) for i in B[1:]]
        matrix=np.column_stack(columns) if columns else np.empty((3,0))
        delta=a[A[0]]-b[B[0]]
        coefficients=np.linalg.lstsq(matrix,-delta,rcond=TOLERANCE)[0] if columns else np.empty(0)
        na=len(A)-1;wa=np.r_[1-sum(coefficients[:na]),coefficients[:na]];wb=np.r_[1-sum(coefficients[na:]),coefficients[na:]]
        if min(wa)<-1e-10 or min(wb)<-1e-10:continue
        wa=np.maximum(wa,0);wa/=sum(wa);wb=np.maximum(wb,0);wb/=sum(wb)
        fulla=np.zeros(len(a));fullb=np.zeros(len(b));fulla[A]=wa;fullb[B]=wb
        difference=fulla@a-fullb@b;upper=float(difference@difference)
        if best is None or upper<best[0]:best=(upper,fulla,fullb,difference)
    if best is None:raise GeometryError('Simplex distance has no verified feasible witness.')
    upper,wa,wb,delta=best
    ga=2*a@delta;gb=-2*b@delta
    gap=max(0.,float(ga@wa+gb@wb-min(ga)-min(gb)))
    if gap>1e-9:raise GeometryError('Ordinary region distance has unresolved numerical simplex optimality; no distance adopted.')
    return upper,max(0.,upper-gap),wa,wb,gap


def ordinary_face_distance(model,frames,entities,points):
    if model.get('dimension')!=3 or points.shape[1]!=3:
        raise GeometryError('Concave region distance currently requires a literal intrinsic 3D source.')
    scale=frames[0]['scale'];origin=points[frames[0]['vertices'][0]]
    prepared=[_parts(model,F,E,points,origin,scale) for F,E in zip(frames,entities)]
    parts=[P[0] for P in prepared];pairs=len(parts[0])*len(parts[1])
    if pairs>MAX_PAIRS:raise GeometryError('Ordinary region distance exceeds 4096 simplex pairs.')
    best=None;lower=float('inf');max_gap=0.
    for i,A in enumerate(parts[0]):
        for j,B in enumerate(parts[1]):
            result=_simplex_distance((points[A]-origin)/scale,(points[B]-origin)/scale)
            upper,lo,wa,wb,gap=result;lower=min(lower,lo);max_gap=max(max_gap,gap)
            if best is None or upper<best[0]:best=(upper,A,B,wa,wb,i,j,gap)
    upper,A,B,wa,wb,i,j,gap=best
    witnesses=[points[A].T@wa,points[B].T@wb]
    value=float(np.linalg.norm(witnesses[1]-witnesses[0]))
    receipts=[{'sourceKind':E['kind'],'sourceIndex':E['index'],'sourceVertexIds':ids,
               'barycentricWeights':W.tolist(),'pieceIndex':piece,
               'location':'original face region' if E['kind']=='face' else 'original source entity'}
              for E,ids,W,piece in zip(entities,(A,B),(wa,wb),(i,j))]
    return {'value':value,'units':'model-units','bounded':True,'witnessPoints':[P.tolist() for P in witnesses],
            'witnessOwners':receipts,'numericallyIncident':value<=scale*TOLERANCE*8,
            'definition':'minimum intrinsic distance between bounded original vertices, edge segments and simple planar source face regions (including concave regions)',
            'boundedDistanceEvidence':{'method':'verified source ear-triangle union and exhaustive simplex active supports','version':VERSION,
                'sourceSha256':hashlib.sha256(_source(model)).hexdigest(),
                'sourceVertexIds':[list(A),list(B)],'barycentricWeights':[wa.tolist(),wb.tolist()],
                'sourceRegions':[P[1] for P in prepared],'simplexPairCount':pairs,
                'normalizedSquaredOptimalityGap':gap,'maximumPairOptimalityGap':max_gap,
                'distanceBounds':[float(np.sqrt(lower)*scale),float(np.sqrt(upper)*scale)],
                'exactCertificate':False,'sourceIncidenceRebuilt':False,'convexified':False,
                'holesRepresented':False}}
