"""Geometric-center H3 corner path with literal endpoints and fixed incidence."""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
import numpy as np
from scipy.optimize import root

from .geometry import GeometryError, identity, validate
from .dual_morph_sizing import prepare_sizing
from .dual_morph_expansion import _color_record, _geometry, _mix, _require
from .snub_morph_contract import MIN_INTERIOR_RATIO

VERSION = '1-h3-via-snub'
DOMAIN = 'H3 via-snub requires a regular convex dodecahedron or icosahedron with complete ordinary incidence and polarity at its geometric center; generalized, distorted and 4D sources are unavailable.'
TOL = 1e-8


def reference_vertices(n):
    phi = (1+math.sqrt(5))/2
    if n == 12:
        return np.asarray([v for a in (-1, 1) for b in (-phi, phi) for v in ((0, a, b), (a, b, 0), (b, 0, a))])
    return np.asarray([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]+
                      [v for a in (-1, 1) for b in (-1, 1) for v in ((0, a/phi, b*phi), (a/phi, b*phi, 0), (b*phi, 0, a/phi))])


def h3_domain(source):
    n = len(source.get('vertices', [])); nf = 12 if n == 20 else 20
    _require(source.get('dimension') == 3 and source.get('embeddingDimension', 3) == 3 and
             source.get('interpretation') == 'convex-polytope' and n in (12, 20) and
             len(source.get('edges', [])) == 30 and len(source.get('faces', [])) == nf and not source.get('cells'), DOMAIN)
    _require(all(type(v) is list and len(v) == 3 and all(type(x) in (int, float) and math.isfinite(x) for x in v) for v in source['vertices']), DOMAIN)
    points = np.asarray(source['vertices']); center = points.mean(axis=0)
    cloud = points-center; radius = float(np.max(np.linalg.norm(cloud, axis=1)))
    _require(math.isfinite(radius) and radius > 0, DOMAIN)
    unit = cloud/radius; reference = reference_vertices(n); reference /= np.linalg.norm(reference[0])
    distances = np.linalg.norm(unit[:, None]-unit[None, :], axis=2)
    expected = np.sort(np.linalg.norm(reference-reference[0], axis=1))
    _require(float(np.max(np.abs(np.sort(distances, axis=1)-expected))) < TOL, DOMAIN)
    edge_length = expected[1]
    edges = {frozenset((i, j)) for i in range(n) for j in range(i) if abs(distances[i, j]-edge_length) < TOL}
    _require(len(edges) == 30 and edges == {frozenset(e) for e in source['edges']}, DOMAIN)
    _require(all(len(f) == (5 if n == 20 else 3) and len(set(f)) == len(f) and
                 all(frozenset((a, b)) in edges for a, b in zip(f, f[1:]+f[:1])) for f in source['faces']), DOMAIN)
    return center, radius


def residuals(points, faces):
    unit = np.asarray(points); unit = (unit-unit.mean(axis=0))/np.max(np.linalg.norm(unit-unit.mean(axis=0), axis=1))
    result = {'planarity': 0., 'supportViolation': 0., 'minimumStrictSupportGap': math.inf}
    for face in faces:
        cloud = unit[face]; normal = np.cross(cloud[1]-cloud[0], cloud[2]-cloud[0]); norm = float(np.linalg.norm(normal))
        _require(norm > 1e-12, 'H3 via-snub face is numerically unresolved; no hull repair was applied.')
        normal /= norm
        if normal@cloud.mean(axis=0) < 0: normal = -normal
        gaps = normal@cloud[0]-unit@normal
        result['planarity'] = max(result['planarity'], float(np.max(np.abs(gaps[face]))))
        result['supportViolation'] = max(result['supportViolation'], float(max(0., -min(gaps))))
        result['minimumStrictSupportGap'] = min(result['minimumStrictSupportGap'], min(float(g) for i, g in enumerate(gaps) if i not in face))
    _require(result['planarity'] < TOL and result['supportViolation'] < TOL and result['minimumStrictSupportGap'] > 1e-10,
             'H3 via-snub support is numerically unresolved; no hull repair or endpoint snap was applied.')
    return result


class H3SnubPlan:
    def __init__(self, state, center=None, radius=1.):
        geometric_center, source_radius = h3_domain(state['model'])
        _require(center is None or type(center) in (list, tuple) and len(center) == 3 and
                 all(type(x) in (int, float) and math.isfinite(x) for x in center) and
                 np.max(np.abs(np.asarray(center)-geometric_center))/source_radius < 1e-10, DOMAIN)
        baseline = prepare_sizing(state, geometric_center.tolist(), radius)
        self._state = baseline.source_snapshot; self._dual = baseline.dual
        self._center = geometric_center; self._radius = float(radius); self._source_radius = source_radius
        self._polarity = baseline.evaluate(1.)['maximumPolarityResidual']
        source = self._state['model']; dual = self._dual
        primal = (np.asarray(source['vertices'])-geometric_center)/source_radius
        reciprocal = np.asarray(dual['vertices'])-geometric_center
        self._dual_radius = float(np.max(np.linalg.norm(reciprocal, axis=1))); reciprocal /= self._dual_radius
        corners = [(v, f) for f, cycle in enumerate(source['faces']) for v in cycle]; lookup = {c: i for i, c in enumerate(corners)}
        self._quotients = {'source': [v for v, f in corners], 'dual': [f for v, f in corners]}
        faces = []; kinds = []; oriented = []
        for f, cycle in enumerate(source['faces']):
            cycle = cycle[:]
            if np.cross(primal[cycle[1]]-primal[cycle[0]], primal[cycle[2]]-primal[cycle[0]])@reciprocal[f] < 0: cycle.reverse()
            oriented.append(cycle); faces.append([lookup[v, f] for v in cycle]); kinds.append('source-polygon')
        for v, cycle in enumerate(dual['faces']):
            faces.append([lookup[v, f] for f in cycle]); kinds.append('dual-polygon')
        for a, b in source['edges']:
            f, g = [f for f, cycle in enumerate(oriented) if a in cycle and b in cycle]
            if oriented[f][(oriented[f].index(a)+1)%len(oriented[f])] != b: f, g = g, f
            af, bf, ag, bg = [lookup[c] for c in ((a, f), (b, f), (a, g), (b, g))]
            faces.extend([[af, bf, ag], [bf, bg, ag]]); kinds.extend(['bridge-triangle']*2)
        edges = sorted({tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:]+face[:1])})
        _require(len(corners) == 60 and len(edges) == 150 and Counter(map(len, faces)) == {3: 80, 5: 12}, DOMAIN)
        self._topology = {'edges': [list(e) for e in edges], 'faces': faces, 'cells': []}
        self._a = np.asarray([primal[v] for v, f in corners]); self._b = np.asarray([reciprocal[f] for v, f in corners]); cross = np.cross(self._a, self._b)
        classes = [next((a, b) for a, b in edges if (0 if corners[a][1] == corners[b][1] else 1 if corners[a][0] == corners[b][0] else 2) == k) for k in range(3)]
        def seed(x): return (1-x[0])*self._a+x[0]*self._b+x[1]*cross
        def equal_edges(x):
            p = seed(x); lengths = [float(np.sum((p[a]-p[b])**2)) for a, b in classes]
            return [lengths[0]-lengths[1], lengths[0]-lengths[2]]
        solved = root(equal_edges, [.5, .15], tol=1e-11)
        _require(solved.success and np.isfinite(solved.x).all() and 0 < solved.x[0] < 1 and solved.x[1] > 0 and max(map(abs, equal_edges(solved.x))) < 1e-10,
                 'H3 via-snub equal-edge seed did not converge.')
        self._coefficients = solved.x.tolist(); self._uniform = seed(solved.x); self._uniform /= np.linalg.norm(self._uniform[0])
        lengths = [float(np.linalg.norm(self._uniform[a]-self._uniform[b])) for a, b in edges]
        self._uniform_residual = (max(lengths)-min(lengths))/min(lengths)
        _require(self._uniform_residual < TOL, 'H3 via-snub uniform edge residual is unresolved.')
        residuals(self._uniform, faces)
        edge_lookup = {frozenset(e): i for i, e in enumerate(source['edges'])}
        def owner(ids):
            vertices = {corners[i][0] for i in ids}; facets = {corners[i][1] for i in ids}
            if len(vertices) == 1: rank, index = 0, next(iter(vertices))
            elif len(facets) == 1: rank, index = 2, next(iter(facets))
            else:
                _require(frozenset(vertices) in edge_lookup, 'H3 bridge has no source edge owner.')
                rank, index = 1, edge_lookup[frozenset(vertices)]
            return {'sourceRank': rank, 'sourceElement': index}
        self._maps = {'vertices': [{'sourceVertex': v, 'sourceFacet': f, 'sourceFacetRank': 2} for v, f in corners],
                      'edges': [owner(e) for e in edges], 'faces': [owner(f) for f in faces], 'cells': []}
        for component, endpoint in [('source', source), ('dual', dual)]:
            images = {frozenset([v]): {'rank': 0, 'element': v} for v in range(len(endpoint['vertices']))}
            for rank, kind in [(1, 'edges'), (2, 'faces')]: images.update({frozenset(ids): {'rank': rank, 'element': i} for i, ids in enumerate(endpoint[kind])})
            for kind in ('vertices', 'edges', 'faces'):
                entities = [[i] for i in range(60)] if kind == 'vertices' else self._topology[kind]
                for ids, record in zip(entities, self._maps[kind]):
                    image = frozenset(self._quotients[component][i] for i in ids)
                    _require(image in images, 'H3 endpoint image has no literal incidence identity.')
                    record.setdefault('endpointImages', {})[component] = deepcopy(images[image])
        colors = []
        for record, kind in zip(self._maps['faces'], kinds):
            rank, index = record['sourceRank'], record['sourceElement']; record.update(faceKind=kind, sourceSheetFace=index if rank == 2 else None)
            entity = {index} if rank == 0 else set(source[('vertices', 'edges', 'faces')[rank]][index])
            incident = [f for f, cycle in enumerate(source['faces']) if entity <= set(cycle)]
            colors.append(_color_record(source, 'faces', index) if rank == 2 else _mix([_color_record(source, 'faces', f) for f in incident]))
        self._metadata = {'coordinateUnits': source.get('metadata', {}).get('coordinateUnits', 'model'), 'sourceMetadata': deepcopy(source.get('metadata', {})),
                          'offColors': {'faces': colors}, 'colorPolicy': 'Source polygons retain source RGBA and PNG sheets; vertex/edge polygons use incident source-face means.'}

    @property
    def source_snapshot(self): return deepcopy(self._state)

    @property
    def dual(self): return deepcopy(self._dual)

    def descriptor(self):
        source = self._state['model']
        return {'version': 1, 'algorithmVersion': VERSION, 'method': 'via-snub', 'dimension': 3, 'certified': False,
                'form': 'positive-corner-cross', 'family': 'H3', 'center': self._center.tolist(), 'radius': self._radius,
                'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
                'sourceSnapshotSha256': hashlib.sha256(json.dumps(self._state, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                'original': deepcopy(source), 'dual': self.dual, 'topology': deepcopy(self._topology), 'sourceMaps': deepcopy(self._maps),
                'endpointQuotients': deepcopy(self._quotients), 'uniformSnubRatio': .5, 'uniformSeedCoefficients': self._coefficients[:],
                'uniformEdgeRelativeResidual': self._uniform_residual,
                'parameterization': 'Unit source/polar corner vectors A,B; U=normalize((1-u)A+uB+k(A cross B)) at equal-edge solution. For t<=1/2: (1-2t)^2 A+4t(1-t)U; otherwise (2t-1)^2 B+4t(1-t)U. Multiply by interpolated endpoint circumradius and add geometric center.',
                'limits': {'exactEndpointRatios': [0, 1], 'interiorRatio': [MIN_INTERIOR_RATIO, 1-MIN_INTERIOR_RATIO]},
                'limitations': [DOMAIN, 'Binary64 approximate; declared C1 path with stationary uniform event, not a benchmark trajectory certificate.']}

    def evaluate(self, ratio):
        _require(type(ratio) in (int, float) and math.isfinite(ratio) and 0 <= ratio <= 1, 'H3 via-snub ratio must lie in [0,1]; extrapolation is unsupported.')
        _require(ratio in (0, 1) or MIN_INTERIOR_RATIO <= ratio <= 1-MIN_INTERIOR_RATIO,
                 'H3 via-snub interior is numerically unresolved near an endpoint; no endpoint snap was applied.')
        source = self._state['model']; t = float(ratio); endpoint = t in (0., 1.)
        if endpoint:
            result = deepcopy(source) if t == 0 else self.dual; maps = {}; checked = residuals(result['vertices'], result['faces'])
        else:
            unit = (1-2*t)**2*self._a+4*t*(1-t)*self._uniform if t <= .5 else (2*t-1)**2*self._b+4*t*(1-t)*self._uniform
            checked = residuals(unit, self._topology['faces'])
            points = self._center+((1-t)*self._source_radius+t*self._dual_radius)*unit
            _require(np.isfinite(points).all(), 'H3 via-snub coordinates overflowed.')
            result = _geometry(source, points, self._topology, 'Via-snub of '+source.get('name', 'H3 source'), self._metadata)
            result['interpretation'] = 'convex-polytope'; result['provenance'].update(algorithmVersion=VERSION, method='via-snub', family='H3')
            result['fingerprint'] = identity(result); result['validation'] = validate(result)
            _require(result['validation']['passed'], 'H3 via-snub frame is numerically unresolved: '+'; '.join(result['validation']['errors']))
            maps = deepcopy(self._maps)
        return {'method': 'via-snub', 'requestedRatio': ratio, 'ratio': t, 'endpoint': endpoint,
                'endpointIdentity': 'literal-source' if t == 0 else 'literal-polar' if t == 1 else None,
                'model': result, 'sourceMaps': maps, 'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
                'algorithmVersion': VERSION, 'certified': False, 'form': 'positive-corner-cross', 'family': 'H3',
                'normalizedResiduals': checked, 'maximumPolarityResidual': self._polarity, 'endpointQuotients': deepcopy(self._quotients),
                'diagnostics': ['Dodecahedron / snub family / icosahedron (either direction); prescribed incidence and literal endpoint quotients.',
                                'Uniform snub ratio 0.5; approximate equal-edge relative residual '+str(self._uniform_residual)+'.',
                                'Geometric-center polarity only; numerical interiors outside [0.001,0.999] refuse without snapping.']}
