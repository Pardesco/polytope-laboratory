"""Regenerate dense native uniform boundaries; caller labels grant no trust."""
from functools import lru_cache
import math
import numpy as np
from .geometry import GeometryError, identity


def _parameters(model):
    if model.get('dimension')!=4 or model.get('interpretation')!='convex-polytope' or len(model.get('vertices',[]))<=1024:return None
    provenance=model.get('provenance',{});operation=provenance.get('operation')
    if operation not in ('coxeter-build','uniform4-wythoff'):return None
    params=provenance.get('parameters')
    keys={'family','rings','snub','hand'} if operation=='coxeter-build' else {'family','rings'}
    version='0.1.0' if operation=='coxeter-build' else '1'
    if provenance.get('algorithmVersion')!=version or type(params) is not dict or set(params)!=keys:
        raise GeometryError('Dense native uniform source requires supported generation parameters and version.')
    family=params['family'];rings=params['rings']
    if type(family) is not str or family not in ('A4','B4','D4','F4','H4') or type(rings) is not list or len(rings)!=4 or any(type(r) is not int or r not in (0,1) for r in rings) or not any(rings):
        raise GeometryError('Dense native uniform source requires a finite rank-four family and nonempty binary rings.')
    if operation=='coxeter-build' and (params['snub'] is not False or params['hand'] not in ('A','B')):
        raise GeometryError('Dense native uniform source does not support four-dimensional snubs.')
    return family,tuple(rings)


def _boundary_measure(model):
    points=np.asarray(model['vertices']);center=points.mean(axis=0);volumes=[];pyramids=[]
    for cell in model['cells']:
        ids=sorted({v for f in cell for v in model['faces'][f]});cloud=points[ids];cc=cloud.mean(axis=0)
        _,_,vt=np.linalg.svd(cloud-cc,full_matrices=False)
        triangles=np.asarray([[face[0],face[i],face[i+1]] for f in cell for face in [model['faces'][f]] for i in range(1,len(face)-1)])
        local=(points[triangles]-cc)@vt[:3].T
        volume=float(np.abs(np.linalg.det(local)).sum()/6)
        height=abs(float((cc-center)@vt[3]))
        volumes.append(volume);pyramids.append(volume*height/4)
    content=math.fsum(pyramids);boundary=math.fsum(volumes)
    if not all(math.isfinite(x) and x>0 for x in (content,boundary)):
        raise GeometryError('Native uniform boundary measures are numerically unresolved.')
    return {'content':content,'boundaryMeasure':boundary,'dimension':4,'units':'model-units',
        'definition':'Regenerated finite uniform boundary; convex cell-pyramid content and tetrahedral boundary sum (float64).'}


@lru_cache(maxsize=4)
def _reference(family,rings):
    from .uniform4 import wythoff_boundary
    model=wythoff_boundary(family,list(rings))
    return identity(model),tuple(tuple(cell) for cell in model['facetVertices']),_boundary_measure(model)


def native_uniform_measure(model):
    params=_parameters(model)
    if params is None:return None
    if model.get('embeddingDimension',4)!=4 or model.get('numeric',{}).get('mode')!='float64-approximate' or model.get('numeric',{}).get('certified') is not False or any(model.get(k) is not None for k in ('facetEquations','rationalCoordinates','convexPieces')):
        raise GeometryError('Dense native uniform evidence requires its original approximate four-dimensional geometry.')
    fingerprint,facets,measure=_reference(*params)
    if identity(model)!=fingerprint:
        raise GeometryError('Dense native uniform geometry differs from its independently regenerated generation parameters.')
    supplied=model.get('facetVertices')
    if supplied is not None and (type(supplied) is not list or any(type(row) is not list for row in supplied) or tuple(tuple(row) for row in supplied)!=facets):
        raise GeometryError('Dense native uniform facet vertices differ from the regenerated boundary.')
    return dict(measure)
