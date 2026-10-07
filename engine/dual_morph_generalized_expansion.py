"""Generalized 3D expansion from actual face/vertex flags and edge links.

Homothetic source sheets, polar vertex-link caps and orthogonal edge bridges.
No supporting halfspaces, angular sorting, hull, welding or filled solid.
"""
from collections import Counter,defaultdict
from copy import deepcopy
import hashlib
import json
import numpy as np
from .dual_morph_expansion import EPS,_color_record,_finite,_geometry,_mix,_require
from .dual_morph_generalized_sizing import prepare_generalized_sizing
from .geometry import GeometryError

VERSION='0.24.0-generalized-local-flag-expansion'
KINDS=('vertices','edges','faces','cells')
MAX_FLAGS=20000
MAX_ELEMENTS=32000
MAX_INCIDENCES=200000

class GeneralizedExpansionPlan:
    def __init__(self,state,center=None,radius=1.0,*,complement=False):
        _require(type(complement) is bool,'Generalized expansion complement must be boolean.')
        self._pair=prepare_generalized_sizing(state,center,radius);self._state=self._pair.source_snapshot
        self._source=self._state['model'];self._dual=self._pair.dual;descriptor=self._pair.descriptor()
        self._center=np.asarray(descriptor['center']);self._radius=descriptor['radius'];self._identity=descriptor['sourceFingerprint']
        p=self._source;q=self._dual;edgeIndex={tuple(sorted(E)):e for e,E in enumerate(p['edges'])}
        incident=defaultdict(list);vertexFaces=defaultdict(list);reciprocalEdgeIndex={}
        for e,E in enumerate(p['edges']):
            for v in E:
                key=(v,tuple(sorted(q['edges'][e])));_require(key not in reciprocalEdgeIndex,'Generalized expansion reciprocal edge link is ambiguous.');reciprocalEdgeIndex[key]=e
        for f,F in enumerate(p['faces']):
            for v in F:vertexFaces[v].append(f)
            for a,b in zip(F,F[1:]+F[:1]):incident[edgeIndex[tuple(sorted((a,b))) ]].append(f)
        flags=[(v,f) for v in range(len(p['vertices'])) for f in sorted(vertexFaces[v])]
        _require(len(flags)<=MAX_FLAGS and len(flags)+len(p['edges'])*4<=MAX_INCIDENCES,'Generalized expansion flag traversal budget exceeded.')
        lookup={flag:i for i,flag in enumerate(flags)};edges=[];edgeOwners=[];edgeColors=[]
        for f,F in enumerate(p['faces']):
            for a,b in zip(F,F[1:]+F[:1]):
                e=edgeIndex[tuple(sorted((a,b)))];edges.append([lookup[a,f],lookup[b,f]])
                edgeOwners.append({'sourceRank':1,'sourceElement':e,'dualRank':0,'dualOriginElement':f})
                edgeColors.append(_color_record(p,'edges',e))
        for v,F in enumerate(q['faces']):
            for a,b in zip(F,F[1:]+F[:1]):
                e=reciprocalEdgeIndex.get((v,tuple(sorted((a,b)))))
                _require(e is not None,'Generalized expansion reciprocal link has ambiguous source edge ownership.');edges.append([lookup[v,a],lookup[v,b]])
                edgeOwners.append({'sourceRank':0,'sourceElement':v,'dualRank':1,'dualOriginElement':e})
                edgeColors.append(_color_record(p,'edges',e))
        faces=[];faceOwners=[];faceColors=[];types=[]
        for f,F in enumerate(p['faces']):
            faces.append([lookup[v,f] for v in F]);faceOwners.append({'sourceRank':2,'sourceElement':f,'sourceFaceIds':[f]})
            faceColors.append(_color_record(p,'faces',f));types.append('source-sheet')
        for v,F in enumerate(q['faces']):
            faces.append([lookup[v,f] for f in F]);faceOwners.append({'sourceRank':0,'sourceElement':v,'dualRank':2,'dualOriginElement':v,'sourceFaceIds':sorted(vertexFaces[v])})
            color=_color_record(q,'faces',v)
            faceColors.append(color if color is not None else _mix([_color_record(p,'faces',f) for f in vertexFaces[v]]));types.append('reciprocal-cap')
        for e,(a,b) in enumerate(p['edges']):
            _require(len(incident[e])==2,'Generalized expansion requires two actual face-cycle incidences on each edge.')
            f,g=incident[e];faces.append([lookup[a,f],lookup[b,f],lookup[b,g],lookup[a,g]])
            faceOwners.append({'sourceRank':1,'sourceElement':e,'dualRank':1,'dualOriginElement':e,'sourceFaceIds':[f,g]})
            faceColors.append(_mix([_color_record(p,'faces',f),_color_record(p,'faces',g)],complement));types.append('edge-rectangle')
        _require(len(edges)<=MAX_ELEMENTS and len(faces)<=MAX_ELEMENTS,'Generalized expansion element budget exceeded.')
        boundary=Counter(tuple(sorted((a,b))) for F in faces for a,b in zip(F,F[1:]+F[:1]))
        _require(len({tuple(sorted(E)) for E in edges})==len(edges) and set(boundary)=={tuple(sorted(E)) for E in edges} and all(n==2 for n in boundary.values()),
                 'Generalized expansion does not have two distinct face incidences per actual output edge.')
        self._euler=len(flags)-len(edges)+len(faces)
        _require(self._euler==len(p['vertices'])-len(p['edges'])+len(p['faces']),'Generalized expansion changes literal source Euler characteristic.')
        self._topology={'edges':edges,'faces':faces,'cells':[]};self._flags=flags;self._types=types
        self._start=np.asarray([p['vertices'][v] for v,f in flags])-self._center
        self._end=np.asarray([q['vertices'][f] for v,f in flags])-self._center
        self._maps={'vertices':[{'sourceVertex':v,'sourceFacet':f,'sourceFacetRank':2} for v,f in flags],
                    'edges':edgeOwners,'faces':faceOwners,'cells':[]}
        self._metadata={'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),'sourceMetadata':deepcopy(p.get('metadata',{})),
            'offColors':{'vertices':[_color_record(p,'vertices',v) for v,f in flags],'edges':edgeColors,'faces':faceColors,'cells':[]},
            'fillSemantics':'Ordered local flag cycles; source winding and intersections retained, no volume or density.',
            'colorPolicy':'Literal source sheet RGBA and source edge colors; reciprocal cap rank color or incident-face mix; edge bridges incident-face mix.',
            'generalizedExpansion':{'sourceEulerCharacteristic':self._euler,'closedEdgeIncidence':True,'sourceFaceCount':len(p['faces']),
                'reciprocalCapCount':len(p['vertices']),'edgeRectangleCount':len(p['edges']),'complementBridgeColors':complement}}
        self._residual=descriptor['maximumPolarityResidual'];self._qualify(.5)

    @property
    def source_snapshot(self):return deepcopy(self._state)
    @property
    def dual(self):return deepcopy(self._dual)

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'supportedMethods':['expansion'],'dimension':3,'certified':False,
            'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,
            'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'center':self._center.tolist(),'radius':self._radius,'original':deepcopy(self._source),'dual':self.dual,
            'expansion':{'start':self._start.tolist(),'end':self._end.tolist(),'flags':[list(f) for f in self._flags],
                'topology':deepcopy(self._topology),'sourceMaps':deepcopy(self._maps),'metadata':deepcopy(self._metadata)},
            'parameterization':'X(v,f)=C+(1-ratio)(Pv-C)+ratio(Qf-C); actual source-face cycles, reciprocal vertex links and four-flag edge rectangles.',
            'sourceDomain':'Finite closed ordinary generalized intrinsic 3D boundaries with a resolved finite incidence reciprocal.',
            'limits':{'flags':MAX_FLAGS,'elementsPerRank':MAX_ELEMENTS,'incidenceVisits':MAX_INCIDENCES,'unclampedRatio':[-4,4]}}

    def _qualify(self,t):
        points=self._center+(1-t)*self._start+t*self._end
        _require(np.isfinite(points).all(),'Generalized expansion coordinates overflowed.')
        scale=float(np.max(np.ptp(points,axis=0)));_require(scale>0 and np.isfinite(scale),'Generalized expansion scale vanished or overflowed.')
        minimumEdge=min(float(np.linalg.norm(points[a]-points[b])) for a,b in self._topology['edges'])
        _require(minimumEdge>EPS*scale*8,'Generalized expansion has a near-collapsed output edge; use an exact endpoint or another ratio.')
        maximumPlanarity=0.;maximumOrthogonality=0.
        for F,kind in zip(self._topology['faces'],self._types):
            cloud=(points[F]-points[F[0]])/scale;_,s,vt=np.linalg.svd(cloud,full_matrices=True)
            _require(len(s)>=2 and s[1]>EPS*8 and (len(s)<3 or s[2]<=EPS*16),'Generalized expansion output sheet is nonplanar or has unresolved rank; no repair is used.')
            maximumPlanarity=max(maximumPlanarity,float(np.max(np.abs(cloud@vt[-1]))))
            if kind=='edge-rectangle':
                a,b,c,d=points[F];u=b-a;v=d-a
                closure=float(np.linalg.norm(c-(a+u+v)))/scale
                orthogonality=abs(float(u@v))/(float(np.linalg.norm(u))*float(np.linalg.norm(v)))
                _require(closure<=EPS*16 and orthogonality<=EPS*32,'Generalized expansion edge bridge is not a resolved planar rectangle.')
                maximumOrthogonality=max(maximumOrthogonality,orthogonality)
        return points,{'maximumNormalizedSheetResidual':maximumPlanarity,'maximumBridgeCosineResidual':maximumOrthogonality,
            'minimumEdgeLength':minimumEdge,'sourceEulerCharacteristic':self._euler,'closedEdgeIncidence':True,
            'sourceSheets':len(self._source['faces']),'reciprocalCaps':len(self._source['vertices']),'edgeRectangles':len(self._source['edges'])}

    def evaluate(self,method,ratio,*,clamp=True):
        _require(method=='expansion','Generalized flag construction implements expansion only; other methods retain their own domain guards.')
        requested=_finite(ratio,'Generalized expansion ratio');_require(type(clamp) is bool,'Generalized expansion clamp must be boolean.')
        t=max(0.,min(1.,requested)) if clamp else requested;_require(-4<=t<=4,'Generalized expansion extrapolation is bounded to [-4,4].')
        endpoint=t in (0.,1.)
        if endpoint:
            component='source' if t==0 else 'dual';model=deepcopy(self._source if t==0 else self._dual)
            maps={kind:[{'component':component,'sourceRank':r if component=='source' else 2-r,'sourceElement':i} for i in range(len(model[kind]))] for r,kind in enumerate(KINDS)}
            statistics={'literalEndpoint':True}
        else:
            points,statistics=self._qualify(t);model=_geometry(self._source,points,self._topology,'Generalized expansion of '+self._source.get('name','source'),self._metadata);maps=deepcopy(self._maps)
        return {'method':'expansion','requestedRatio':requested,'ratio':t,'endpoint':endpoint,'model':model,'sourceMaps':maps,'statistics':statistics,
            'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,'maximumPolarityResidual':self._residual,'algorithmVersion':VERSION,'certified':False,
            'diagnostics':['Local source-owned planar sheets, reciprocal caps and edge rectangles; ordered generalized winding, no hull, weld or filled solid.']+
              (['Literal endpoint topology snap; vanished flag elements are omitted.'] if endpoint else [])+
              (['Extrapolation inverts layer factors; resolved ordered geometry only.'] if not 0<=t<=1 else [])}

def prepare_generalized_expansion(state,center=None,radius=1.0,*,complement=False):
    try:return GeneralizedExpansionPlan(state,center,radius,complement=complement)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed or unresolved generalized expansion source/parameters.') from error
