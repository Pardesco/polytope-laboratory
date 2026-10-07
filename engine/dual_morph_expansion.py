"""Incidence-product expansion and its reversed polar dual.

No hull, weld, angular face sorting or filled-measure substitution is performed.
The affine expansion parameter is declared, not a Stella trajectory certificate.
"""
from collections import defaultdict
from copy import deepcopy
import hashlib
import json
import math

import numpy as np

from engine.geometry import GeometryError, identity, validate

VERSION = '0.1.0-development'
METHODS = ('expansion', 'tilting-quads')
EPS = 1e-8
MAX_VERTICES = 20000
MAX_FACES = 32000
MAX_PAIRS = 1000000


def _require(test, message):
    if not test:
        raise GeometryError(message)


def _finite(value, label):
    _require(type(value) in (int, float) and math.isfinite(value), label + ' must be finite numeric data.')
    return float(value)


def _clone(value):
    try:
        def check(item, depth=0):
            _require(depth<=64,'Morph snapshot nesting exceeds 64 levels.')
            if type(item) is dict:
                _require(all(type(key) is str for key in item),'Morph snapshot object keys must be strings.')
                for member in item.values():check(member,depth+1)
            elif type(item) in (list,tuple):
                for member in item:check(member,depth+1)
            else:
                _require(item is None or type(item) in (str,bool,int) or isinstance(item,float),'Morph snapshot contains non-JSON attributes.')
                if isinstance(item,float):_require(math.isfinite(item),'Morph snapshot contains nonfinite attributes.')
        check(value)
        text = json.dumps(value, allow_nan=False, sort_keys=True, separators=(',', ':'))
        _require(len(text.encode('utf-8')) <= 128 * 1024**2, 'Morph source snapshot exceeds 128MiB.')
        return json.loads(text)
    except (TypeError, ValueError, RecursionError) as error:
        raise GeometryError('Morph needs bounded finite plain JSON snapshots.') from error


def _lattice(model):
    d = model['dimension']
    values = [[frozenset([v]) for v in range(len(model['vertices']))],
              [frozenset(e) for e in model['edges']], [frozenset(f) for f in model['faces']]]
    if d == 4:
        values.append([frozenset(v for f in cell for v in model['faces'][f]) for cell in model['cells']])
    _require(all(len(set(rank)) == len(rank) for rank in values), 'Duplicate source lattice elements are unsupported.')
    return values


def _cycle(adjacency, label):
    _require(len(adjacency) >= 3 and all(len(set(v)) == 2 for v in adjacency.values()), label + ' needs one simple cyclic link.')
    first = min(adjacency);order = [first];previous = first;current = min(adjacency[first])
    while current != first:
        _require(current not in order, label + ' has disconnected/repeated links.')
        order.append(current)
        following = [v for v in adjacency[current] if v != previous]
        _require(len(following) == 1, label + ' has ambiguous links.')
        previous, current = current, following[0]
    _require(set(order) == set(adjacency), label + ' has disconnected cyclic components.')
    return order


def _dual_topology(model, lattice):
    """Reverse actual source incidence; use links rather than angular sorting."""
    d = model['dimension'];facets = lattice[d-1]
    _require(sum(len(rank)*len(facets) for rank in lattice[:-1]) <= MAX_PAIRS,
             'Dual correspondence exceeds the bounded incidence-pair budget.')
    supers = [[tuple(i for i, facet in enumerate(facets) if element <= facet) for element in rank] for rank in lattice]
    edges = [list(ids) for ids in supers[d-2]]
    _require(all(len(ids) == 2 for ids in edges), 'Every source ridge needs exactly two facet incidences.')
    faces = []
    for i, element in enumerate(lattice[d-3]):
        adjacency = defaultdict(list)
        for ridge, edge in zip(lattice[d-2], edges):
            if element <= ridge:
                a, b = edge;adjacency[a].append(b);adjacency[b].append(a)
        faces.append(_cycle(adjacency, 'Reciprocal face '+str(i)))
    cells = [] if d == 3 else [[i for i, edge in enumerate(model['edges']) if v in edge] for v in range(len(model['vertices']))]
    return {'edges':edges, 'faces':faces, 'cells':cells}, supers


def _plane(points, ids, center, scale):
    cloud = (points[ids] - center) / scale
    _, singular, vt = np.linalg.svd(cloud-cloud[0], full_matrices=True)
    d = points.shape[1]
    _require(len(singular) >= d-1 and singular[d-2] > EPS and
             (len(singular) < d or singular[d-1] <= EPS * 8), 'Facet is nonplanar or has unresolved affine rank.')
    normal = vt[-1];height = float(normal @ cloud.mean(axis=0))
    if height < 0:normal = -normal;height = -height
    _require(height > EPS*4, 'Polar facet passes through/too near the center, or has an unresolved orientation.')
    residual = (points-center)/scale @ normal-height
    _require(float(np.max(residual)) <= EPS*8, 'Center is outside, or the supplied facet is not a supporting plane.')
    _require(set(ids) == set(np.flatnonzero(np.abs(residual) <= EPS*8)),
             'Facet omits/duplicates coplanar source vertices; no identity merge is performed.')
    return normal, height*scale


def _geometry(model, coordinates, topology, label, metadata):
    result = {'id':label, 'name':label, 'dimension':model['dimension'], 'embeddingDimension':model['dimension'],
              'interpretation':'generalized-complex', 'vertices':np.asarray(coordinates).tolist(),
              'edges':deepcopy(topology['edges']), 'faces':deepcopy(topology['faces']), 'cells':deepcopy(topology['cells']),
              'metadata':deepcopy(metadata), 'numeric':{'mode':'float64-approximate','certified':False,'tolerance':EPS},
              'provenance':{'operation':'dual-morph','algorithmVersion':VERSION,'convexified':False}}
    _require(np.isfinite(coordinates).all(), 'Morph coordinates overflowed or became singular.')
    result['fingerprint'] = identity(result)
    result['validation'] = validate(result)
    _require(result['validation']['passed'], 'Morph incidence failed: '+'; '.join(result['validation']['errors']))
    return result


def _color_record(model, kind, index):
    colors = model.get('metadata',{}).get('offColors',{}).get(kind,[])
    return deepcopy(colors[index]) if index < len(colors) else None


def _mix(records, complement=False):
    colors = []
    for record in records:
        if record is None:continue
        _require(type(record) is dict and record.get('encoding') in ('byte','float'),
                 'Interpolated morph colors require explicit byte/float RGBA; indexed palettes need a renderer adapter.')
        values = record.get('values');limit = 255 if record['encoding']=='byte' else 1
        _require(type(values) is list and len(values) in (3,4) and all(type(v) in (int,float) and math.isfinite(v) and 0<=v<=limit for v in values),
                 'Morph RGBA color record is invalid.')
        color = [float(v)/limit for v in values]
        if len(color)==3:color.append(1.0)
        colors.append(color)
    if not colors:return None
    values = np.mean(colors,axis=0).tolist()
    if complement:values[:3]=[1-v for v in values[:3]]
    return {'encoding':'float','values':values}


class DualMorphPlan:
    """Owns detached preflight data; public accessors return detached copies."""
    def __init__(self, state, center=None, radius=1.0, *, complement=False):
        self._state = _clone(state)
        _require(type(self._state) is dict and type(self._state.get('model')) is dict, 'Morph requires a source state/model.')
        source = self._state['model'];d = source.get('dimension')
        _require(d in (3,4) and source.get('embeddingDimension',d)==d and source.get('interpretation')=='convex-polytope',
                 'This prototype supports closed intrinsic 3D/4D convex sources only; generalized/infinite polars are unsupported.')
        _require(type(complement) is bool, 'Complement color option must be boolean.')
        _require(validate(source)['passed'], 'Source incidence is invalid.')
        _require(len(source['vertices']) <= 4000 and len(source['faces']) <= MAX_FACES,
                 'Morph source exceeds 4000 vertices/32000 faces.')
        self._source_id = source.get('id');self._source_fingerprint = identity(source)
        _require(source.get('fingerprint',self._source_fingerprint)==self._source_fingerprint,'Source fingerprint does not match literal incidence.')
        points = np.asarray(source['vertices'],dtype=float)
        _require(all(type(x) in (int,float) and math.isfinite(x) for vertex in source['vertices'] for x in vertex),
                 'Source coordinates must be finite literal numbers, not strings/booleans.')
        scale = float(np.max(np.ptp(points,axis=0)))
        _require(math.isfinite(scale) and scale>0,'Source scale overflowed or vanished.')
        _require(center is None or type(center) in (list,tuple) and len(center)==d and
                 all(type(x) in (int,float) and math.isfinite(x) for x in center), 'Center needs finite literal coordinates of the source dimension.')
        self._center = points.mean(axis=0) if center is None else np.asarray(center,dtype=float)
        _require(self._center.shape==(d,) and np.isfinite(self._center).all(), 'Reciprocation center has the wrong dimension/nonfinite coordinates.')
        self._radius = _finite(radius,'Reciprocation radius');self._radius2 = self._radius*self._radius
        _require(self._radius>0 and math.isfinite(self._radius2) and self._radius2>0,'Radius squared overflowed/underflowed or is not positive.')
        self._lattice = _lattice(source);dual_topology,self._supers = _dual_topology(source,self._lattice)
        q = []
        for facet in self._lattice[d-1]:
            normal,height = _plane(points,sorted(facet),self._center,scale)
            q.append(self._center+normal*(self._radius2/height))
        q = np.asarray(q)
        _require(np.isfinite(q).all(),'Reciprocal coordinates overflowed.')
        residual = max(abs(float((points[v]-self._center)@(q[c]-self._center))-self._radius2)
                       for c,facet in enumerate(self._lattice[d-1]) for v in facet)
        _require(residual <= EPS*16*self._radius2,'Face/vertex polarity is numerically unresolved.')
        unit = source.get('metadata',{}).get('coordinateUnits','model')
        dual_face_colors = [_mix([_color_record(source,'faces',f) for f,face in enumerate(source['faces']) if element<=set(face)])
                            for element in self._lattice[d-3]]
        dual_cell_colors = [] if d==3 else [_mix([_color_record(source,'cells',c) for c,facet in enumerate(self._lattice[3]) if v in facet]) for v in range(len(points))]
        metadata = {'coordinateUnits':unit,'offColors':{'faces':dual_face_colors,'cells':dual_cell_colors},
                    'dualSourceFacetIds':list(range(len(q))),'dualSourceRidgeIds':list(range(len(dual_topology['edges']))),
                    'dualSourceFaceOriginRank':d-3,'dualSourceCellVertexIds':list(range(len(points))) if d==4 else []}
        self._dual = _geometry(source,q,dual_topology,'Reciprocal of '+source.get('name','source'),metadata)
        # Verify the reciprocal supporting lattice as well, without a Hull.
        qscale = float(np.max(np.ptp(q,axis=0)))
        for facet in _lattice(self._dual)[d-1]:_plane(q,sorted(facet),self._center,qscale)
        self._build_product(points,q,source,complement)
        self._maximum_polarity_residual = residual

    def _build_product(self, p, q, source, complement):
        d=source['dimension'];lattice=self._lattice;supers=self._supers
        products=[];lookups=[];visits=0
        for k in range(d):
            records=[];lookup={}
            for r in range(k+1):
                s=k-r;origin_rank=d-1-s
                for a,A in enumerate(lattice[r]):
                    for b,D in enumerate(lattice[origin_rank]):
                        visits+=1;_require(visits<=MAX_PAIRS,'Expansion correspondence exceeds bounded incidence visits.')
                        if A<=D:lookup[(r,a,s,b)]=len(records);records.append((r,a,s,b))
            _require(len(records)<=(MAX_VERTICES if k==0 else MAX_FACES),'Expanded geometry exceeds the output-element budget.')
            products.append(records);lookups.append(lookup)
        flags=[(a,b) for _,a,_,b in products[0]];point_lookup={flag:i for i,flag in enumerate(flags)}
        edges=[]
        for r,a,s,b in products[1]:
            endpoints = [(v,b) for v in source['edges'][a]] if r==1 else [(a,c) for c in supers[d-2][b]]
            edges.append([point_lookup[e] for e in endpoints])
        faces=[]
        for r,a,s,b in products[2]:
            if r==2:vertices=[(v,b) for v in source['faces'][a]]
            elif s==2:vertices=[(a,c) for c in self._dual['faces'][b]]
            else:
                v,w=source['edges'][a];c,e=supers[d-2][b]
                vertices=[(v,c),(w,c),(w,e),(v,e)]
            faces.append([point_lookup[v] for v in vertices])
        cells=[]
        if d==4:
            for r,a,s,b in products[3]:
                boundary=[]
                if r:
                    for child,A in enumerate(lattice[r-1]):
                        if A<lattice[r][a]:boundary.append(lookups[2][(r-1,child,s,b)])
                if s:
                    for parent,D in enumerate(lattice[d-s]):
                        if lattice[d-1-s][b]<D:boundary.append(lookups[2][(r,a,s-1,parent)])
                cells.append(boundary)
        self._product_topology={'edges':edges,'faces':faces,'cells':cells}
        self._start=np.asarray([p[v]-self._center for v,c in flags]);self._end=np.asarray([q[c]-self._center for v,c in flags])
        colors=[];tiltcolors=[];owners=[]
        for r,a,s,b in products[2]:
            A=lattice[r][a];D=lattice[d-1-s][b]
            incident=[f for f,F in enumerate(lattice[2]) if A<=F and (F<=D or D<=F)]
            if d==3 and r==2:basecolor=_color_record(source,'faces',a)
            else:basecolor=_mix([_color_record(source,'faces',f) for f in incident])
            color=_mix([_color_record(source,'faces',f) for f in incident],True) if complement and r==s==1 else basecolor
            tiltcolors.append(basecolor)
            colors.append(color);owners.append({'sourceRank':r,'sourceElement':a,'dualRank':s,'dualOriginElement':b,'sourceFaceIds':incident})
        cellcolors=[]
        if d==4:
            for r,a,s,b in products[3]:
                cellcolors.append(_color_record(source,'cells',a) if r==3 else _mix([_color_record(source,'cells',c) for c,facet in enumerate(lattice[3]) if lattice[r][a]<=facet]))
        self._product_metadata={'coordinateUnits':source.get('metadata',{}).get('coordinateUnits','model'),
                                'offColors':{'faces':colors,'cells':cellcolors}}
        self._product_maps={'vertices':[{'sourceVertex':v,'sourceFacet':c,'sourceFacetRank':d-1} for v,c in flags],
                            'edges':[{'sourceRank':r,'sourceElement':a,'dualRank':s,'dualOriginElement':b} for r,a,s,b in products[1]],
                            'faces':owners,'cells':[{'sourceRank':r,'sourceElement':a,'dualRank':s,'dualOriginElement':b} for r,a,s,b in products[3]] if d==4 else []}
        middle=(self._start+self._end)/2+self._center
        product=_geometry(source,middle,self._product_topology,'Expansion preflight',self._product_metadata)
        dual_topology,_=_dual_topology(product,_lattice(product))
        facets=_lattice(product)[d-1];scale=float(np.max(np.ptp(middle,axis=0)));normals=[];hp=[];hq=[]
        for facet in facets:
            ids=sorted(facet);normal,_=_plane(middle,ids,self._center,scale)
            a=float(normal@self._start[ids[0]]);b=float(normal@self._end[ids[0]])
            _require(a>EPS*scale and b>EPS*scale,'Polar expansion has a zero/unresolved endpoint support offset.')
            _require(np.max(np.abs(self._start[ids]@normal-a))<=EPS*scale*16 and np.max(np.abs(self._end[ids]@normal-b))<=EPS*scale*16,
                     'Expansion support plane is not constant on both source factors.')
            _require(np.max((p-self._center)@normal-a)<=EPS*scale*16 and np.max((q-self._center)@normal-b)<=EPS*scale*16,
                     'This source/radius pair does not support the incidence-product expansion; no Hull repair is substituted.')
            normals.append(normal);hp.append(a);hq.append(b)
        self._tilt_normals=np.asarray(normals);self._tilt_start=np.asarray(hp);self._tilt_end=np.asarray(hq)
        self._tilt_topology=dual_topology
        # A reciprocal cell belongs to an expanded vertex flag. Preserve its
        # incident source-cell colors rather than silently dropping alpha.
        tilt_cellcolors=[]
        if d==4:
            cell_vertices=[set(v for f in cell for v in faces[f]) for cell in cells]
            tilt_cellcolors=[_mix([cellcolors[c] for c,C in enumerate(cell_vertices) if v in C]) for v in range(len(flags))]
        self._tilt_metadata={'coordinateUnits':self._product_metadata['coordinateUnits'],
                             'offColors':{'faces':[_mix([tiltcolors[f] for f,F in enumerate(faces) if e[0] in F and e[1] in F]) for e in edges] if d==4 else
                                         [_mix([tiltcolors[f] for f,F in enumerate(faces) if v in F]) for v in range(len(flags))], 'cells':tilt_cellcolors}}
        self._tilt_maps={'vertices':[deepcopy(self._product_maps['faces' if d==3 else 'cells'][i]) for i in range(len(facets))],
                         'edges':deepcopy(self._product_maps['edges' if d==3 else 'faces']),
                         'faces':deepcopy(self._product_maps['vertices' if d==3 else 'edges']),
                         'cells':deepcopy(self._product_maps['vertices']) if d==4 else []}

    @property
    def source_snapshot(self):
        return deepcopy(self._state)

    @property
    def dual(self):
        return deepcopy(self._dual)

    def descriptor(self):
        """Detached native preflight envelope for a future absolute JS adapter."""
        return {'version':1,'algorithmVersion':VERSION,'supportedMethods':list(METHODS),'dimension':self._state['model']['dimension'],
                'sourceModelId':self._source_id,'sourceFingerprint':self._source_fingerprint,
                'sourceSnapshotSha256':hashlib.sha256(json.dumps(self._state,sort_keys=True,separators=(',', ':')).encode()).hexdigest(),
                'center':self._center.tolist(),'radius':self._radius,'certified':False,
                'expansion':{'start':self._start.tolist(),'end':self._end.tolist(),'topology':deepcopy(self._product_topology),'sourceMaps':deepcopy(self._product_maps),'metadata':deepcopy(self._product_metadata)},
                'tiltingQuads':{'normals':self._tilt_normals.tolist(),'primalOffsets':self._tilt_start.tolist(),'dualOffsets':self._tilt_end.tolist(),'topology':deepcopy(self._tilt_topology),'sourceMaps':deepcopy(self._tilt_maps),'metadata':deepcopy(self._tilt_metadata)},
                'original':deepcopy(self._state['model']),'dual':self.dual,
                'parameterization':'Affine incidence-product expansion; reversed reciprocal support interpolation for tilting quads',
                'limits':{'maximumVertices':MAX_VERTICES,'maximumElementsPerRank':MAX_FACES,'maximumIncidenceVisits':MAX_PAIRS,'unclampedRatio':[-4,4]}}

    def evaluate(self, method, ratio, *, clamp=True):
        _require(method in METHODS,'Unsupported dual-morph method; six other documented 3D modes remain unimplemented.')
        requested=_finite(ratio,'Morph ratio');_require(type(clamp) is bool,'Clamp must be boolean.')
        t=max(0.0,min(1.0,requested)) if clamp else requested
        _require(-4<=t<=4,'Unclamped prototype ratio is bounded to [-4,4].')
        endpoint = t in (0.0,1.0)
        if endpoint:model=deepcopy(self._state['model']) if t==0 else self.dual
        elif method=='expansion':
            model=_geometry(self._state['model'],self._center+self._start*(1-t)+self._end*t,
                            self._product_topology,'Expansion of '+self._state['model'].get('name','source'),self._product_metadata)
        else:
            # Reversing the expansion before reciprocation preserves P->P*.
            offsets=self._tilt_start*t+self._tilt_end*(1-t)
            _require(np.min(np.abs(offsets))>EPS*max(float(np.max(np.abs(offsets))),np.finfo(float).tiny)*8,
                     'Tilting morph hits a polar pole/near-singular support plane; no infinity clipping substitute is returned.')
            coordinates=self._center+self._tilt_normals*(self._radius2/offsets[:,None])
            model=_geometry(self._state['model'],coordinates,self._tilt_topology,
                            'Tilting quads of '+self._state['model'].get('name','source'),self._tilt_metadata)
        return {'method':method,'requestedRatio':requested,'ratio':t,'endpoint':endpoint,'model':model,
                'sourceModelId':self._source_id,'sourceFingerprint':self._source_fingerprint,'certified':False,
                'sourceMaps':({'endpoint':'source' if t==0 else 'dual'} if endpoint else deepcopy(self._product_maps) if method=='expansion' else
                              {**deepcopy(self._tilt_maps),'dualOfReversedExpansion':True}),
                'diagnostics':(['Literal endpoint topology snap; collapsed interior elements are not welded.'] if endpoint else
                               ['Display/ordered incidence only; no filled volume or convexity certificate.'])+
                              ([] if 0<=t<=1 else ['Extrapolation may invert/intersect elements; topology is retained.']),
                'maximumPolarityResidual':self._maximum_polarity_residual,'algorithmVersion':VERSION}


def prepare_dual_morph(state, center=None, radius=1.0, *, complement=False):
    try:
        return DualMorphPlan(state,center,radius,complement=complement)
    except GeometryError:
        raise
    except (KeyError, TypeError, ValueError, IndexError, ArithmeticError, RecursionError) as error:
        raise GeometryError('Malformed/unresolved dual-morph source or parameters.') from error
