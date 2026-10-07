"""4D expansion on the literal boundary and its finite cell-plane reciprocal.

Products of actual primal/dual incident elements; never vertex-set containment,
angular sorting, convex supports, hulls, welding or filled-solid substitution.
"""
from copy import deepcopy
import hashlib
import json
import numpy as np
from .geometry import GeometryError, identity
from .incidence_dual_4d import incidence_dual_4d, _boundary
from .dual_morph_expansion import EPS, _clone, _color_record, _finite, _geometry, _require

VERSION='0.25.0-literal-4d-flag-expansion'
KINDS=('vertices','edges','faces','cells')
MAX_FLAGS=20000
MAX_ELEMENTS=32000
MAX_INCIDENCES=1000000

class GeneralizedExpansion4DPlan:
    def __init__(self,state,center=None,radius=1.):
        self._state=_clone(state);p=self._state['model'];self._source=p
        self._dual=q=incidence_dual_4d(p,center,radius)
        parameters=q['provenance']['parameters'];self._center=np.asarray(parameters['center']);self._radius=parameters['radius']
        self._identity=identity(p);self._residual=q['provenance']['maximumPolarityResidual']
        P=np.asarray(p['vertices']);scale=float(np.max(np.ptp(P,axis=0)))
        b=_boundary(p,(P-P[0])/scale)
        vertexCells=[[] for v in P];vertexFaces=[[] for v in P]
        for f,F in enumerate(p['faces']):
            for v in F:vertexFaces[v].append(f)
        for c,vs in enumerate(b['cellVertices']):
            for v in vs:vertexCells[v].append(c)
        flags=[(v,c) for v,cs in enumerate(vertexCells) for c in cs]
        _require(len(flags)<=MAX_FLAGS,'4D expansion vertex/cell flag budget exceeded.')
        lookup={flag:i for i,flag in enumerate(flags)};edges=[];faces=[];cells=[]
        maps={k:[] for k in KINDS};colors={k:[] for k in KINDS};records=[[],[],[],[]]
        faceLookup={};visits=len(flags)*2

        def add(rank,element,r,a,s,origin):
            nonlocal visits
            visits+=len(element);kind=KINDS[rank]
            _require(len(maps[kind])<MAX_ELEMENTS and visits<=MAX_INCIDENCES,'4D expansion output element/incidence budget exceeded.')
            record={'sourceRank':r,'sourceElement':a,'dualRank':s,'dualOriginElement':origin}
            if rank==2:record['sourceSheetFace']=a if r==2 and s==0 else None
            maps[kind].append(record);records[rank].append([r,a,s,origin])
            colors[kind].append(_color_record(p,KINDS[r],a) if r else _color_record(q,KINDS[s],origin))
            return len(maps[kind])-1

        for v,c in flags:
            maps['vertices'].append({'sourceVertex':v,'sourceFacet':c,'sourceFacetRank':3})
            colors['vertices'].append(_color_record(p,'vertices',v));records[0].append([0,v,0,c])
        # Rank 1: vertex x polar edge; source edge x polar point.
        for v in range(len(P)):
            for f in vertexFaces[v]:
                edges.append([lookup[v,c] for c in q['edges'][f]]);add(1,edges[-1],0,v,1,f)
        for e,E in enumerate(p['edges']):
            for c in sorted({c for f in b['edgeFaces'][e] for c in b['faceCells'][f]}):
                edges.append([lookup[v,c] for v in E]);add(1,edges[-1],1,e,0,c)
        # Rank 2: source-point/polar-face sheets, orthogonal product
        # rectangles, and homothetic original ordered source faces.
        def face(cycle,r,a,s,origin):
            index=add(2,cycle,r,a,s,origin);faces.append(cycle);faceLookup[r,a,s,origin]=index
        for v in range(len(P)):
            for e in b['vertexEdges'][v]:face([lookup[v,c] for c in q['faces'][e]],0,v,2,e)
        for e,(v,w) in enumerate(p['edges']):
            for f in b['edgeFaces'][e]:
                a,c=q['edges'][f];face([lookup[v,a],lookup[w,a],lookup[w,c],lookup[v,c]],1,e,1,f)
        for f,F in enumerate(p['faces']):
            for c in b['faceCells'][f]:face([lookup[v,c] for v in F],2,f,0,c)
        # Rank 3: full reciprocal vertex cells; edge x full polar-face
        # prisms; ordered source-face x polar-edge prisms; original cells.
        def cell(fs,r,a,s,origin):
            add(3,fs,r,a,s,origin);cells.append(fs)
        for v in range(len(P)):cell([faceLookup[0,v,2,e] for e in q['cells'][v]],0,v,3,v)
        for e,(v,w) in enumerate(p['edges']):
            cell([faceLookup[0,v,2,e],faceLookup[0,w,2,e]]+[faceLookup[1,e,1,f] for f in b['edgeFaces'][e]],1,e,2,e)
        for f,F in enumerate(p['faces']):
            cell([faceLookup[2,f,0,c] for c in q['edges'][f]]+[faceLookup[1,e,1,f] for e in b['faceEdges'][f]],2,f,1,f)
        for c,fs in enumerate(p['cells']):cell([faceLookup[2,f,0,c] for f in fs],3,c,0,c)
        self._flags=flags;self._maps=maps;self._records=records
        self._topology={'edges':edges,'faces':faces,'cells':cells}
        self._cellVertices=[sorted({v for f in C for v in faces[f]}) for C in cells]
        _require(visits+sum(len(V) for V in self._cellVertices)<=MAX_INCIDENCES,'4D expansion cell vertex traversal budget exceeded.')
        self._start=np.asarray([p['vertices'][v] for v,c in flags])-self._center
        self._end=np.asarray([q['vertices'][c] for v,c in flags])-self._center
        self._euler=len(flags)-len(edges)+len(faces)-len(cells)
        sourceEuler=len(P)-len(p['edges'])+len(p['faces'])-len(p['cells'])
        _require(self._euler==sourceEuler,'4D expansion changes the literal source Euler characteristic.')
        self._metadata={'coordinateUnits':p.get('metadata',{}).get('coordinateUnits','model'),
            'sourceMetadata':deepcopy(p.get('metadata',{})),'offColors':colors,
            'fillSemantics':'Full ordered ordinary boundary cells; star winding and crossings retained, no filled volume or density asserted.',
            'colorPolicy':'Literal source-factor rank color; polar-factor rank color for zero-dimensional source factors. No RGBA normalization or blending.',
            'generalizedExpansion4D':{'sourceEulerCharacteristic':sourceEuler,'outputEulerCharacteristic':self._euler,
                'elementFactorRecords':deepcopy(records),'sourceSheetBinding':'sourceSheetFace identifies complete ordered affine source faces; null is a mixed or polar sheet.'}}
        points,_=self._qualify(.5)
        # This checks every complete cell shell and cyclic edge link of the
        # actual packet, not a hull of its coordinates.
        closure=_boundary({**self._topology,'vertices':points.tolist()},(points-points[0])/float(np.max(np.ptp(points,axis=0))))
        self._closureVisits=closure['visitedIncidences']

    @property
    def source_snapshot(self):return deepcopy(self._state)
    @property
    def dual(self):return deepcopy(self._dual)

    def descriptor(self):
        return {'version':1,'algorithmVersion':VERSION,'supportedMethods':['expansion'],'dimension':4,'certified':False,
            'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,
            'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'center':self._center.tolist(),'radius':self._radius,'original':deepcopy(self._source),'dual':self.dual,
            'expansion':{'start':self._start.tolist(),'end':self._end.tolist(),'flags':[list(f) for f in self._flags],
                'topology':deepcopy(self._topology),'sourceMaps':deepcopy(self._maps),'metadata':deepcopy(self._metadata)},
            'parameterization':'X(v,c)=C+(1-ratio)(Pv-C)+ratio(Qc-C); actual source/reciprocal rank products and literal ordered boundaries.',
            'sourceDomain':'Finite intrinsic 4D closed ordinary planar-cell boundaries with a resolved finite incidence reciprocal; no convex enclosure required.',
            'limits':{'flags':MAX_FLAGS,'elementsPerRank':MAX_ELEMENTS,'outputIncidenceVisits':MAX_INCIDENCES,'unclampedRatio':[-4,4]}}

    def _qualify(self,t):
        points=self._center+(1-t)*self._start+t*self._end
        _require(np.isfinite(points).all(),'4D expansion coordinates overflowed.')
        scale=float(np.max(np.ptp(points,axis=0)));_require(scale>0 and np.isfinite(scale),'4D expansion scale vanished or overflowed.')
        minimumEdge=min(float(np.linalg.norm(points[a]-points[b])) for a,b in self._topology['edges'])
        _require(minimumEdge>EPS*scale*8,'4D expansion has a near-collapsed output edge; use an exact endpoint or another ratio.')
        faceResidual=0.;cellResidual=0.;cosineResidual=0.
        for F,record in zip(self._topology['faces'],self._records[2]):
            cloud=(points[F]-points[F[0]])/scale;_,s,vt=np.linalg.svd(cloud,full_matrices=True)
            _require(len(s)>=2 and s[1]>EPS*8 and (len(s)<3 or s[2]<=EPS*16),'4D expansion output face is nonplanar or has unresolved rank; no repair is used.')
            faceResidual=max(faceResidual,float(np.max(np.abs(cloud@vt[2:].T))))
            if record[0]==record[2]==1:
                a,b,c,d=points[F];u=b-a;v=d-a
                closure=float(np.linalg.norm(c-(a+u+v)))/scale;cosine=abs(float(u@v))/(float(np.linalg.norm(u))*float(np.linalg.norm(v)))
                _require(closure<=EPS*16 and cosine<=EPS*32,'4D expansion mixed face is not a resolved orthogonal rectangle.')
                cosineResidual=max(cosineResidual,cosine)
        for ids in self._cellVertices:
            cloud=(points[ids]-points[ids[0]])/scale;_,s,vt=np.linalg.svd(cloud,full_matrices=False)
            _require(len(s)>=3 and s[2]>EPS*8 and (len(s)<4 or s[3]<=EPS*16),'4D expansion output cell is nonplanar or has unresolved rank; no repair is used.')
            cellResidual=max(cellResidual,float(np.max(np.abs(cloud@vt[3:].T))))
        return points,{'maximumNormalizedFaceResidual':faceResidual,'maximumNormalizedCellResidual':cellResidual,
            'maximumBridgeCosineResidual':cosineResidual,'minimumEdgeLength':minimumEdge,
            'closedLiteralCellShells':True,'cyclicActualEdgeLinks':True,'outputEulerCharacteristic':self._euler,
            'counts':[len(points),len(self._topology['edges']),len(self._topology['faces']),len(self._topology['cells'])]}

    def evaluate(self,method,ratio,*,clamp=True):
        _require(method=='expansion','4D literal flag construction implements expansion only; other methods retain their domain guards.')
        requested=_finite(ratio,'4D expansion ratio');_require(type(clamp) is bool,'4D expansion clamp must be boolean.')
        t=max(0.,min(1.,requested)) if clamp else requested;_require(-4<=t<=4,'4D expansion extrapolation is bounded to [-4,4].')
        endpoint=t in (0.,1.)
        if endpoint:
            component='source' if t==0 else 'dual';model=deepcopy(self._source if t==0 else self._dual)
            maps={kind:[{'component':component,'sourceRank':r if component=='source' else 3-r,'sourceElement':i} for i in range(len(model[kind]))] for r,kind in enumerate(KINDS)}
            statistics={'literalEndpoint':True}
        else:
            points,statistics=self._qualify(t);model=_geometry(self._source,points,self._topology,'4D generalized expansion of '+self._source.get('name','source'),self._metadata);maps=deepcopy(self._maps)
        return {'method':'expansion','requestedRatio':requested,'ratio':t,'endpoint':endpoint,'model':model,'sourceMaps':maps,'statistics':statistics,
            'sourceModelId':self._source.get('id'),'sourceFingerprint':self._identity,'maximumPolarityResidual':self._residual,
            'algorithmVersion':VERSION,'certified':False,
            'diagnostics':['Actual source/reciprocal rank products with complete planar cells; ordered star winding retained, no hull/weld/filled solid.']+
                (['Literal endpoint topology snap; vanished flag elements are omitted.'] if endpoint else [])+
                (['Extrapolation reverses factor directions; resolved ordered boundary only.'] if not 0<=t<=1 else [])}

def prepare_generalized_expansion_4d(state,center=None,radius=1.):
    try:return GeneralizedExpansion4DPlan(state,center,radius)
    except GeometryError:raise
    except (KeyError,TypeError,ValueError,IndexError,ArithmeticError,RecursionError) as error:
        raise GeometryError('Malformed or unresolved 4D generalized expansion source/parameters.') from error
