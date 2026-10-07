"""Minimum distance of qualified convex source entities in intrinsic 2/3/4D.

Source cycles are qualified before barycentric convex optimization. No source
incidence is rebuilt. The float64 convex optimality gap is reported, not an
exact-arithmetic certificate.
"""
from collections import Counter
import numpy as np
from scipy.optimize import minimize
from .geometry import GeometryError, TOLERANCE


def _convex_face(points):
    center=points.mean(axis=0)
    _,singular,vt=np.linalg.svd(points-center,full_matrices=False)
    if len(singular)<2 or singular[1]<=TOLERANCE or (len(singular)>2 and singular[2]>TOLERANCE):
        raise GeometryError('Bounded face distance requires a nondegenerate planar source face.')
    q=(points-center)@vt[:2].T
    signed=sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(q,np.roll(q,-1,axis=0)))
    if abs(signed)<=TOLERANCE:raise GeometryError('Bounded source face has unresolved area.')
    sign=1 if signed>0 else -1
    for a,b in zip(q,np.roll(q,-1,axis=0)):
        edge=b-a
        if np.linalg.norm(edge)<=TOLERANCE:raise GeometryError('Bounded source face contains a coincident edge.')
        cross=edge[0]*(q[:,1]-a[1])-edge[1]*(q[:,0]-a[0])
        if min(sign*cross)<-TOLERANCE*8:
            raise GeometryError('Bounded distance requires convex ordered faces; concave/star fill is unavailable.')
    return q


def _qualified_cloud(model,frame,entity,points,origin,scale):
    if frame['kind'] not in ('vertex','edge','face','cell'):
        raise GeometryError('Bounded distance uses source vertices, edges, convex faces or convex cells; explicit flats are infinite.')
    ids=frame['vertices']
    if len(ids)>64:raise GeometryError('Bounded entity distance is limited to 64 source vertices per entity.')
    cloud=(points[ids]-origin)/scale
    if frame['kind']=='face':_convex_face(cloud)
    if frame['kind']=='cell':
        if model.get('interpretation')!='convex-polytope':
            raise GeometryError('Bounded cell distance requires an explicit convex-polytope interior.')
        local=(cloud-cloud.mean(axis=0))@frame['basis']
        lookup={v:i for i,v in enumerate(ids)};uses=Counter();volume=0.
        face_ids=model['cells'][entity['index']]
        if len(face_ids)>128:raise GeometryError('Bounded cell distance is limited to 128 source faces.')
        for face_id in face_ids:
            cycle=model['faces'][face_id];face=local[[lookup[v] for v in cycle]];_convex_face(face)
            normal=np.cross(face[1]-face[0],face[2]-face[0]);length=np.linalg.norm(normal)
            if length<=TOLERANCE:raise GeometryError('Bounded cell face normal is unresolved.')
            normal/=length
            if np.dot(normal,face.mean(axis=0))<0:normal=-normal
            support=float(face[0]@normal)
            if support<=TOLERANCE or max(local@normal-support)>TOLERANCE*8:
                raise GeometryError('Source cell faces do not bound a qualified convex interior.')
            area=sum(np.linalg.norm(np.cross(face[i]-face[0],face[i+1]-face[0]))/2 for i in range(1,len(face)-1))
            volume+=area*support/3
            uses.update(tuple(sorted((a,b))) for a,b in zip(cycle,cycle[1:]+cycle[:1]))
        if not uses or any(count!=2 for count in uses.values()) or volume<=TOLERANCE:
            raise GeometryError('Bounded source cell is not a closed nondegenerate convex shell.')
    return cloud


def bounded_entity_distance(model,frames,entities,points):
    scale=frames[0]['scale'];origin=points[frames[0]['vertices'][0]]
    a,b=[_qualified_cloud(model,frame,entity,points,origin,scale) for frame,entity in zip(frames,entities)]
    na,nb=len(a),len(b);matrix=np.column_stack((a.T,-b.T))
    start=np.r_[np.full(na,1/na),np.full(nb,1/nb)]
    constraint=np.zeros((2,na+nb));constraint[0,:na]=1;constraint[1,na:]=1
    def objective(w):delta=matrix@w;return float(delta@delta)
    def gradient(w):return 2*matrix.T@(matrix@w)
    result=minimize(objective,start,jac=gradient,method='SLSQP',bounds=[(0.,1.)]*(na+nb),
        constraints={'type':'eq','fun':lambda w:constraint@w-1,'jac':lambda w:constraint},
        options={'maxiter':300,'ftol':1e-13})
    if not np.all(np.isfinite(result.x)):raise GeometryError('Bounded distance solver returned nonfinite weights.')
    w=np.clip(result.x,0,1)
    for offset,count in ((0,na),(na,nb)):
        total=sum(w[offset:offset+count])
        if abs(total-1)>1e-7:raise GeometryError('Bounded distance solver has unresolved feasible weights.')
        w[offset:offset+count]/=total
    grad=gradient(w);gap=max(0.,float(grad@w-min(grad[:na])-min(grad[na:])))
    if gap>1e-9:raise GeometryError('Bounded distance did not meet its numerical convex optimality gap; no value adopted.')
    upper=objective(w);lower=max(0.,upper-gap)
    witness=[origin+scale*(a.T@w[:na]),origin+scale*(b.T@w[na:])]
    value=float(np.linalg.norm(witness[1]-witness[0]))
    return {'value':value,'units':'model-units','bounded':True,'witnessPoints':[q.tolist() for q in witness],
        'definition':'minimum intrinsic distance between bounded source vertices, edge segments, qualified convex face regions or convex cell interiors',
        'numericallyIncident':value<=scale*TOLERANCE*8,
        'boundedDistanceEvidence':{'method':'convex barycentric quadratic optimization','version':'0.1.0',
            'sourceVertexIds':[frame['vertices'] for frame in frames],
            'barycentricWeights':[w[:na].tolist(),w[na:].tolist()],
            'normalizedSquaredOptimalityGap':gap,'distanceBounds':[float(np.sqrt(lower)*scale),float(np.sqrt(upper)*scale)],
            'solverSuccess':bool(result.success),'solverMessage':str(result.message),'iterations':int(result.nit),
            'exactCertificate':False,'sourceIncidenceRebuilt':False}}
