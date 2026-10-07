"""Sizing morph: separate homothetic primal and reciprocal layers.

Only finite checked intrinsic 3D convex sources are implemented here. The
linear parameterization is explicit, not a Stella intermediate-ratio proof.
"""
from copy import deepcopy
import hashlib
import json
import math

import numpy as np

from .dual_morph_expansion import (
    EPS, _clone, _color_record, _dual_topology, _finite, _geometry,
    _lattice, _plane, _require,
)
from engine.geometry import GeometryError, identity, validate

VERSION='0.1.0-development'
MAX_VERTICES=20000
MAX_ELEMENTS=32000


class SizingPlan:
    def __init__(self,state,center=None,radius=1.0):
        self._state=_clone(state)
        _require(type(self._state) is dict and type(self._state.get('model')) is dict,'Sizing requires a source state/model.')
        p=self._state['model']
        _require(p.get('dimension')==3 and p.get('embeddingDimension',3)==3 and p.get('interpretation')=='convex-polytope',
                 'Sizing prototype supports finite checked intrinsic 3D convex sources only; no 4D/generalized benchmark claim.')
        _require(validate(p)['passed'],'Sizing source incidence is invalid.')
        _require(len(p['vertices'])<=4000 and len(p['faces'])<=MAX_ELEMENTS,'Sizing source exceeds its element budget.')
        _require(all(type(x) in (int,float) and math.isfinite(x) for v in p['vertices'] for x in v),'Sizing source coordinates must be finite literal numbers.')
        points=np.asarray(p['vertices'],dtype=float)
        scale=float(np.max(np.ptp(points,axis=0)))
        _require(math.isfinite(scale) and scale>0,'Sizing source scale vanished/overflowed.')
        _require(center is None or type(center) in (list,tuple) and len(center)==3 and all(type(x) in (int,float) and math.isfinite(x) for x in center),
                 'Sizing center requires three finite literal coordinates.')
        self._center=points.mean(axis=0) if center is None else np.asarray(center,dtype=float)
        _require(np.isfinite(self._center).all(),'Sizing center overflowed.')
        self._radius=_finite(radius,'Sizing reciprocal radius');r2=self._radius*self._radius
        _require(self._radius>0 and math.isfinite(r2) and r2>0,'Sizing reciprocal radius squared vanished/overflowed.')
        self._source_id=p.get('id');self._fingerprint=identity(p)
        _require(p.get('fingerprint',self._fingerprint)==self._fingerprint,'Sizing source fingerprint differs from its literal incidence.')
        lattice=_lattice(p);topology,_=_dual_topology(p,lattice)
        reciprocal=[]
        for F in lattice[2]:
            n,h=_plane(points,sorted(F),self._center,scale)
            reciprocal.append(self._center+n*r2/h)
        reciprocal=np.asarray(reciprocal)
        _require(np.isfinite(reciprocal).all(),'Sizing reciprocal coordinates overflowed.')
        self._residual=max(abs(float((points[v]-self._center)@(reciprocal[f]-self._center))-r2) for f,F in enumerate(lattice[2]) for v in F)
        _require(self._residual<=EPS*r2*16,'Sizing reciprocal polarity is numerically unresolved.')
        # No color blending is needed for homothety. Reverse each supplied
        # rank's color record literally, retaining palette indices and alpha.
        dual_colors={kind:[_color_record(p,origin,i) for i in range(len(entries))] for kind,origin,entries in
                     [('vertices','faces',reciprocal),('edges','edges',topology['edges']),('faces','vertices',topology['faces'])]}
        dual_colors['cells']=[]
        metadata={'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),
                  'offColors':dual_colors,'sourceMetadata':deepcopy(p.get('metadata',{})),
                  'colorTransfer':'Literal source rank reversal, not a benchmark palette certificate.'}
        self._dual=_geometry(p,reciprocal,topology,'Sizing reciprocal of '+p.get('name','source'),metadata)
        qscale=float(np.max(np.ptp(reciprocal,axis=0)))
        for F in _lattice(self._dual)[2]:_plane(reciprocal,sorted(F),self._center,qscale)
        _require(len(points)+len(reciprocal)<=MAX_VERTICES,'Sizing combined vertices exceed the output budget.')
        for kind in ('edges','faces'):_require(len(p[kind])+len(self._dual[kind])<=MAX_ELEMENTS,'Sizing combined incidence exceeds the output budget.')
        self._primal=points;self._reciprocal=reciprocal

    @property
    def source_snapshot(self):return deepcopy(self._state)

    @property
    def dual(self):return deepcopy(self._dual)

    def _owners(self,component):
        model=self._state['model'] if component=='source' else self._dual
        return {kind:[{'component':component,'componentElement':i,'sourceRank':rank if component=='source' else 2-rank,
                       'sourceElement':i,'sourceModelId':self._source_id,'sourceFingerprint':self._fingerprint} for i in range(len(model[kind]))]
                for rank,kind in enumerate(('vertices','edges','faces'))} | {'cells':[]}

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'method':'sizing','dimension':3,'certified':False,
                'sourceModelId':self._source_id,'sourceFingerprint':self._fingerprint,
                'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                'center':self._center.tolist(),'radius':self._radius,'original':deepcopy(self._state['model']),'dual':self.dual,
                'sourceMaps':{'source':self._owners('source'),'dual':self._owners('dual')},
                'parameterization':'source scale=1-ratio; reciprocal scale=ratio; shared reciprocation center',
                'limits':{'vertices':MAX_VERTICES,'elementsPerOtherRank':MAX_ELEMENTS,'unclampedRatio':[-4,4]}}

    def evaluate(self,ratio,*,clamp=True):
        requested=_finite(ratio,'Sizing ratio');_require(type(clamp) is bool,'Sizing clamp must be boolean.')
        t=min(1.0,max(0.0,requested)) if clamp else requested
        _require(-4<=t<=4,'Unclamped sizing ratio is bounded to [-4,4].')
        p=self._state['model'];q=self._dual
        if t in (0.0,1.0):
            component='source' if t==0 else 'dual';model=deepcopy(p if t==0 else q)
            maps=self._owners(component)
            layers=[{'component':component,'scale':1.0,'vertexOffset':0,'edgeOffset':0,'faceOffset':0,
                     'counts':{k:len(model.get(k,[])) for k in ('vertices','edges','faces','cells')}}]
        else:
            points=np.vstack((self._center+(self._primal-self._center)*(1-t),self._center+(self._reciprocal-self._center)*t))
            offset=len(p['vertices'])
            topology={kind:deepcopy(p[kind])+[[v+offset for v in entry] for entry in q[kind]] for kind in ('edges','faces')};topology['cells']=[]
            colors={kind:[_color_record(p,kind,i) for i in range(len(p[kind]))]+deepcopy(q['metadata']['offColors'][kind]) for kind in ('vertices','edges','faces')};colors['cells']=[]
            model=_geometry(p,points,topology,'Sizing display of '+p.get('name','source'),
                            {'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),'offColors':colors,
                             'sourceMetadata':deepcopy(p.get('metadata',{})),'colorTransfer':'Literal source rank reversal; separate layers.'})
            primal_maps=self._owners('source');dual_maps=self._owners('dual')
            maps={kind:primal_maps[kind]+dual_maps[kind] for kind in ('vertices','edges','faces','cells')}
            layers=[{'component':'source','scale':1-t,'vertexOffset':0,'edgeOffset':0,'faceOffset':0,'counts':{k:len(p.get(k,[])) for k in ('vertices','edges','faces','cells')}},
                    {'component':'dual','scale':t,'vertexOffset':len(p['vertices']),'edgeOffset':len(p['edges']),'faceOffset':len(p['faces']),'counts':{k:len(q[k]) for k in ('vertices','edges','faces','cells')}}]
        return {'method':'sizing','requestedRatio':requested,'ratio':t,'endpoint':t in (0.0,1.0),'model':model,'layers':layers,
                'sourceMaps':maps,'sourceModelId':self._source_id,'sourceFingerprint':self._fingerprint,'algorithmVersion':VERSION,
                'certified':False,'maximumPolarityResidual':self._residual,
                'diagnostics':['Separate overlapping display layers; no union, hull, weld, connecting faces, or filled compound measure.']+
                              (['Vanished layer omitted at the literal endpoint.'] if t in (0.0,1.0) else [])+
                              (['Extrapolation permits negative scale/inverted layer traversal.'] if not 0<=t<=1 else [])}


def prepare_sizing(state,center=None,radius=1.0):
    try:return SizingPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed/unresolved sizing source or parameters.') from error
