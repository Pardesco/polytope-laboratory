"""Sizing finite closed 3D polygonal incidence and its literal plane polar.

Star crossings remain crossings; vertex links determine reciprocal cycles.
No supporting-plane, angular sort, hull, filled volume or density assumption.
"""
from copy import deepcopy
import math
import numpy as np
from .dual_morph_expansion import _clone, _color_record, _finite, _geometry, _require, EPS
from .dual_morph_sizing import SizingPlan, MAX_VERTICES, MAX_ELEMENTS
from .incidence_dual import incidence_dual
from .geometry import GeometryError, identity, validate

VERSION='0.24.0-generalized-incidence-sizing'


class GeneralizedSizingPlan(SizingPlan):
    def __init__(self,state,center=None,radius=1.0):
        self._state=_clone(state)
        _require(type(self._state) is dict and type(self._state.get('model')) is dict,'Generalized sizing requires a source state/model.')
        p=self._state['model']
        _require(p.get('dimension')==3 and p.get('embeddingDimension',3)==3 and p.get('interpretation')=='generalized-complex' and not p.get('cells'),
                 'Generalized sizing supports intrinsic 3D ordinary polygonal boundaries; region unions and 4D sources are unsupported.')
        _require(validate(p)['passed'],'Generalized sizing source incidence or face planarity is invalid.')
        _require(len(p['vertices'])<=4000 and 4<=len(p['faces'])<=2048 and len(p['edges'])<=MAX_ELEMENTS,'Generalized sizing source exceeds 4000 vertices/2048 face planes/32000 edges.')
        _require(all(type(x) in (int,float) and math.isfinite(x) for v in p['vertices'] for x in v),'Generalized sizing coordinates require finite literal numeric values.')
        points=np.asarray(p['vertices'],dtype=float);scale=float(np.max(np.ptp(points,axis=0)))
        _require(math.isfinite(scale) and scale>0,'Generalized sizing source scale vanished or overflowed.')
        singular=np.linalg.svd((points-points[0])/scale,compute_uv=False)
        _require(len(singular)==3 and singular[-1]>EPS*8,'Generalized sizing requires a resolved full 3D affine span.')
        _require(center is None or type(center) in (list,tuple) and len(center)==3 and all(type(x) in (int,float) and math.isfinite(x) for x in center),'Generalized sizing center needs three finite literal coordinates.')
        self._center=points.mean(axis=0) if center is None else np.asarray(center,dtype=float)
        _require(np.isfinite(self._center).all(),'Generalized sizing center overflowed.')
        self._radius=_finite(radius,'Generalized sizing reciprocal radius');r2=self._radius*self._radius
        _require(self._radius>0 and math.isfinite(r2) and r2>0,'Generalized sizing radius squared vanished or overflowed.')
        self._source_id=p.get('id');self._fingerprint=identity(p)
        _require(p.get('fingerprint',self._fingerprint)==self._fingerprint,'Generalized sizing source fingerprint differs from literal incidence.')
        reciprocal=incidence_dual(p,center=self._center,radius=self._radius)
        Q=np.asarray(reciprocal['vertices'],dtype=float)
        # The existing helper builds source-vertex-link faces in source-vertex
        # order, but its facet builder sorts edges. Restore source-edge order
        # explicitly so every reverse-rank index and color is literal.
        edge_map=reciprocal['metadata']['dualSourceEdgeIds']
        _require(len(edge_map)==len(p['edges']) and all(record['sourceEdge']==i for i,record in enumerate(edge_map)),
                 'Generalized sizing reciprocal edge correspondence is incomplete.')
        topology={'edges':[record['dualVertices'][:] for record in edge_map],'faces':deepcopy(reciprocal['faces']),'cells':[]}
        colors={kind:[_color_record(p,origin,i) for i in range(len(entries))] for kind,origin,entries in
                [('vertices','faces',Q),('edges','edges',topology['edges']),('faces','vertices',topology['faces'])]};colors['cells']=[]
        # Rebuild only the helper result's deterministic envelope. All vertices,
        # source-edge incidences and vertex-link cycles are retained unchanged.
        self._dual=_geometry(p,Q,topology,'Generalized sizing reciprocal of '+p.get('name','source'),
                {'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),'offColors':colors,
                 'sourceMetadata':deepcopy(p.get('metadata',{})),'dualSourceFaceIds':list(range(len(Q))),
                 'dualSourceVertexIds':list(range(len(points))),'dualSourceEdgeIds':deepcopy(edge_map),
                 'colorTransfer':'Literal source rank reversal, preserving raw encoding and alpha.',
                 'fillSemantics':'Ordered incidence cycles; star crossings create no vertices; no filled-solid semantics.'})
        self._residual=max(abs(float((points[v]-self._center)@(Q[f]-self._center))-r2) for f,F in enumerate(p['faces']) for v in F)
        _require(self._residual<=EPS*r2*16,'Generalized sizing face/vertex polarity residual is unresolved.')
        _require(len(points)+len(Q)<=MAX_VERTICES and all(len(p[k])+len(self._dual[k])<=MAX_ELEMENTS for k in ('edges','faces')),'Generalized sizing combined layer budget exceeded.')
        self._primal=points;self._reciprocal=Q

    def descriptor(self):
        result=super().descriptor();result.update(algorithmVersion=VERSION,
            sourceDomain='Finite closed ordinary generalized 3D boundaries: two distinct faces per edge, one cyclic link per vertex, planar faces away from the center, distinct finite reciprocal vertices.',
            reciprocalConstruction='Literal source-face planes and ordered source-vertex links; source-edge index order restored explicitly.',
            maximumPolarityResidual=self._residual,
            fillSemantics='Separate ordered surface layers; star winding retained, no hull or filled volume/density.')
        result['limits'].update(sourceVertices=4000,sourceFacePlanes=2048)
        return result

    def evaluate(self,ratio,*,clamp=True):
        result=super().evaluate(ratio,clamp=clamp);result['algorithmVersion']=VERSION
        result['diagnostics'].append('Finite incidence reciprocal with ordered vertex links; generalized winding retained without convex support assumptions.')
        return result


def prepare_generalized_sizing(state,center=None,radius=1.0):
    try:return GeneralizedSizingPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed or unresolved generalized sizing source/parameters.') from error
