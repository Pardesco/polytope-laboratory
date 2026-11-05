"""Bounded convex 4D sizing layers and supporting-halfspace truncation.

Float64/Qhull incidence reconstruction is explicit; no exact trajectory claim.
"""
from copy import deepcopy
import hashlib
import json
import numpy as np
from scipy.spatial import HalfspaceIntersection, QhullError
from .geometry import GeometryError, identity, hull, validate
from .incidence_dual_4d import incidence_dual_4d
from .dual_morph_expansion import _clone, _finite, _geometry, _lattice, _plane, _require, _color_record, EPS

KINDS=('vertices','edges','faces','cells')
VERSION='w29-convex-4d-halfspaces-1'


class ConvexMorph4D:
    def __init__(self,state,center=None,radius=1.,method='sizing'):
        self._state=_clone(state);p=self._state['model'];self.method=method
        _require(p.get('dimension')==4 and p.get('embeddingDimension',4)==4 and p.get('interpretation')=='convex-polytope',
                 '4D sizing/truncation requires a finite intrinsic convex 4D polytope.')
        self.p=p;self.q=incidence_dual_4d(p,center,radius)
        self.center=np.asarray(self.q['provenance']['parameters']['center']);self.radius=radius
        self.residual=self.q['provenance']['maximumPolarityResidual']
        self.planes=[];self.heights=[];self.owners=[]
        for component,m in [('source',p),('dual',self.q)]:
            points=np.asarray(m['vertices']);span=float(np.max(np.ptp(points,axis=0)))
            for c,ids in enumerate(_lattice(m)[3]):
                n,h=_plane(points,sorted(ids),self.center,span)
                self.planes.append(n);self.heights.append(h);self.owners.append({'component':component,'cell':c,'sourceRank':3 if component=='source' else 0,'sourceElement':c})
        self.planes=np.asarray(self.planes);self.heights=np.asarray(self.heights);self.cut=len(p['cells'])
        _require(len(self.planes)<=2048,'4D morph is bounded to 2048 combined supporting planes.')
        _require(all(len(p[k])+len(self.q[k])<=32000 for k in KINDS),'4D sizing output exceeds its 32000 elements per rank budget.')
        _require(len(p['vertices'])+len(self.q['vertices'])<=20000,'4D sizing vertex budget exceeded.')
        P=np.asarray(p['vertices'])-self.center;Q=np.asarray(self.q['vertices'])-self.center
        self.q_enclosure=max(1.,float(np.max(P@self.planes[self.cut:].T/self.heights[self.cut:])))
        self.p_enclosure=max(1.,float(np.max(Q@self.planes[:self.cut].T/self.heights[:self.cut])))

    @property
    def source_snapshot(self):return deepcopy(self._state)
    @property
    def dual(self):return deepcopy(self.q)

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'method':self.method,'dimension':4,'certified':False,
                'center':self.center.tolist(),'radius':self.radius,'original':deepcopy(self.p),'dual':self.dual,
                'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                'sourceFingerprint':identity(self.p),'sourceModelId':self.p.get('id'),
                'sourceEnclosure':self.p_enclosure,'reciprocalEnclosure':self.q_enclosure,
                'parameterization':('Separate homotheties P*(1-t), Q*t about center; literal endpoint omission.' if self.method=='sizing' else
                    'Intersection P with Q scaled enclosure->1 on [0,.5]; then P scaled 1->enclosure with Q fixed on [.5,1].'),
                'topologyPolicy':'Literal endpoint topology at 0/1; interior incidence rebuilt and validated per pose. Active supporting planes identify topology changes; unresolved near-coincidences are refused.',
                'limits':{'combinedPlanes':2048,'vertices':20000,'elementsPerRank':32000}}

    def maps(self,m,component):
        return {k:[{'component':component,'componentElement':i,'sourceRank':r if component=='source' else 3-r,'sourceElement':i}
                   for i in range(len(m[k]))] for r,k in enumerate(KINDS)}

    def evaluate(self,ratio,*,clamp=True):
        requested=_finite(ratio,'4D morph ratio');_require(type(clamp) is bool,'Morph clamp must be boolean.')
        t=min(1.,max(0.,requested)) if clamp else requested
        _require(0<=t<=1,'4D convex morph ratios must lie in [0,1]; extrapolation is unsupported.')
        statistics={};layers=[]
        if t in (0.,1.):
            m=deepcopy(self.p if t==0 else self.q);maps=self.maps(m,'source' if t==0 else 'dual')
        elif self.method=='sizing':
            points=np.vstack([self.center+(np.asarray(m['vertices'])-self.center)*s for m,s in [(self.p,1-t),(self.q,t)]])
            nv=len(self.p['vertices']);nf=len(self.p['faces'])
            topology={k:deepcopy(self.p[k])+[[v+(nf if k=='cells' else nv) for v in e] for e in self.q[k]] for k in KINDS[1:]}
            colors={k:[_color_record(self.p,k,i) for i in range(len(self.p[k]))]+
                      deepcopy(self.q['metadata']['offColors'][k]) for k in KINDS}
            m=_geometry(self.p,points,topology,'4D sizing of '+self.p.get('name','source'),
                        {'offColors':colors,'coordinateUnits':self.p.get('metadata',{}).get('coordinateUnits','model'),
                         'sourceMetadata':deepcopy(self.p.get('metadata',{}))})
            a=self.maps(self.p,'source');b=self.maps(self.q,'dual');maps={k:a[k]+b[k] for k in KINDS}
            layers=[{'component':'source','scale':1-t},{'component':'dual','scale':t}]
        else:
            ps=1. if t<=.5 else 1+(2*t-1)*(self.p_enclosure-1)
            qs=self.q_enclosure+(2*t)*(1-self.q_enclosure) if t<=.5 else 1.
            h=self.heights*np.r_[np.full(self.cut,ps),np.full(len(self.planes)-self.cut,qs)]
            try:points=HalfspaceIntersection(np.c_[self.planes,-h],np.zeros(4)).intersections
            except QhullError as error:raise GeometryError('4D truncation halfspaces are numerically unresolved near a topology transition.') from error
            _require(len(points)<=20000,'4D truncation vertex budget exceeded.')
            scale=float(np.max(h));tol=EPS*scale*16;raw_residual=points@self.planes.T-h
            _require(not np.any((np.abs(raw_residual)>np.finfo(float).eps*scale*512)&(np.abs(raw_residual)<=tol)),
                     '4D truncation is near an unresolved supporting-plane topology transition; choose another ratio.')
            # Qhull reconstructs the approximate convex intersection, explicitly
            # unlike the literal-incidence 3D truncation implementation.
            try:m=hull(points+self.center,'4D halfspace truncation of '+self.p.get('name','source'))
            except GeometryError as error:raise GeometryError('4D truncation incidence is unresolved near a topology transition; choose another ratio.') from error
            m['id']='4D truncation '+identity(m)
            m['metadata'].update(coordinateUnits=self.p.get('metadata',{}).get('coordinateUnits','model'),
                                 sourceMetadata=deepcopy(self.p.get('metadata',{})))
            _require(all(len(m[k])<=32000 for k in KINDS),'4D truncation incidence budget exceeded.')
            P=np.asarray(m['vertices'])-self.center;residual=P@self.planes.T-h
            scale=float(np.max(h));tol=EPS*scale*16
            _require(np.max(residual)<=tol,'4D truncation violates an input supporting halfspace.')
            active=np.abs(residual)<=tol
            _require(not np.any((np.abs(residual)>np.finfo(float).eps*scale*512)&active),
                     '4D truncation is near an unresolved supporting-plane topology transition; choose another ratio.')
            ids=[np.flatnonzero(row).tolist() for row in active]
            _require(all(np.linalg.matrix_rank(self.planes[row],tol=EPS*8)==4 for row in ids),'4D truncation vertex active-plane rank is unresolved.')
            maps={k:[] for k in KINDS}
            lattice=_lattice(m)
            for rank,k in enumerate(KINDS):
                for vs in lattice[rank]:
                    planes=sorted(set.intersection(*(set(ids[v]) for v in vs)))
                    maps[k].append({'supportingPlanes':planes,'owners':[self.owners[i] for i in planes]})
            statistics={'sourceScale':ps,'reciprocalScale':qs,'maximumHalfspaceViolation':max(0.,float(np.max(residual))),
                        'activePlaneVertexSets':ids,'topologySignature':hashlib.sha256(json.dumps(ids).encode()).hexdigest()}
        _require(validate(m)['passed'],'4D morph incidence validation failed.')
        statistics['counts']=[len(m[k]) for k in KINDS]
        return {'method':self.method,'requestedRatio':requested,'ratio':t,'endpoint':t in (0.,1.),'model':m,'sourceMaps':maps,
                'layers':layers,'statistics':statistics,'maximumPolarityResidual':self.residual,'certified':False,'algorithmVersion':VERSION,
                'sourceModelId':self.p.get('id'),'sourceFingerprint':identity(self.p),
                'diagnostics':['Approximate convex halfspace intersection with Qhull incidence reconstruction.' if self.method=='truncation' else
                               'Separate overlapping homothetic boundary layers, not a filled union.',
                               'Literal endpoint topology at ratios 0 and 1; interior incidence is checked at each requested pose.']}


def prepare_sizing_4d(state,center=None,radius=1.):return ConvexMorph4D(state,center,radius,'sizing')
def prepare_truncation_4d(state,center=None,radius=1.):return ConvexMorph4D(state,center,radius,'truncation')
