"""Checked concentric reference spheres and edge dispersion diagnostics."""
from copy import deepcopy
import math
import numpy as np
from .geometry import GeometryError, identity


def edge_variation(model):
    p=np.asarray(model['vertices'],dtype=float)
    lengths=np.array([np.linalg.norm(p[b]-p[a]) for a,b in model['edges']])
    if not len(lengths):return None
    lo,hi,mean=float(min(lengths)),float(max(lengths)),float(np.mean(lengths))
    return {'minimum':lo,'maximum':hi,'mean':mean,'maxMinRatio':hi/lo if lo>0 else None,
        'coefficientOfVariation':float(np.std(lengths)/mean) if mean>0 else None}


def reference_spheres(source):
    receipt=source.get('metadata',{}).get('faceSubdivision',{})
    if type(receipt) is not dict:receipt={}
    inherited=receipt.get('referenceSpheres')
    if inherited is not None and receipt.get('resultFingerprint')==identity(source):return deepcopy(inherited)
    p=np.asarray(source['vertices'],dtype=float);origin=p.mean(axis=0);q=p-origin
    scale=max(float(np.max(np.linalg.norm(q,axis=1))),1e-100)
    # A unique cospherical least-squares center is preferable to a vertex mean
    # for translated or irregular cospherical polyhedra.
    relative=(p-p[0])/scale
    center,_,rank,_=np.linalg.lstsq(2*relative,np.sum(relative*relative,axis=1),rcond=None)
    circum=p[0]+center*scale
    vertex_radii=np.linalg.norm(p-circum,axis=1)
    result={}
    def put(key,values,center):
        values=np.asarray(values,dtype=float)
        radius=float(np.mean(values));residual=float(np.max(np.abs(values-radius)))/max(radius,1e-100)
        if radius>1e-8 and residual<=1e-7:result[key]={'center':center.tolist(),'radius':radius,'relativeResidual':residual}
    if rank==3:put('circumsphere',vertex_radii,circum)
    if source.get('interpretation')=='convex-polytope':
        # Centered edge-tangent and face-tangent spheres are checked, not fitted
        # to arbitrary sources. The distance is to the line, not its midpoint.
        mids=[]
        for a,b in source['edges']:
            delta=q[b]-q[a];parameter=-np.dot(q[a],delta)/np.dot(delta,delta)
            if not -1e-8<=parameter<=1+1e-8:break
            mids.append(float(np.linalg.norm(q[a]+parameter*delta)))
        else:
            if mids:put('midsphere',mids,origin)
        distances=[]
        for face in source['faces']:
            _,_,vt=np.linalg.svd(q[face]-q[face].mean(axis=0),full_matrices=False)
            distances.append(abs(float(np.dot(vt[-1],q[face][0]))))
        if distances:put('insphere',distances,origin)
    return result


def sphere_target(source,kind):
    if kind not in ('circumsphere','midsphere','insphere'):raise GeometryError('Choose circumsphere, midsphere or insphere.')
    targets=reference_spheres(source)
    if type(targets) is not dict or kind not in targets:raise GeometryError('No checked common '+kind+' is available for this source; choose an explicit radius. Subdivide a regular source to retain its reference spheres.')
    target=targets[kind]
    if (type(target) is not dict or type(target.get('center')) is not list or len(target['center'])!=3
            or any(type(x) not in (int,float) or not math.isfinite(x) or abs(x)>1e100 for x in target['center'])
            or type(target.get('radius')) not in (int,float) or not 1e-8<=target['radius']<=1e100
            or type(target.get('relativeResidual')) not in (int,float) or not 0<=target['relativeResidual']<=1e-7):
        raise GeometryError('Malformed inherited reference sphere; use an explicit center/radius.')
    return target
