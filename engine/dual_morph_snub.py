"""The R5 B3 seed locus, bound to literal cube incidence and polar endpoints."""
from copy import deepcopy
import hashlib
import json
import math
import numpy as np

from .geometry import GeometryError, canonical_cycle, identity, validate
from .dual_morph_sizing import prepare_sizing
from .dual_morph_expansion import _color_record, _geometry, _mix, _require
from .snub_morph_contract import canonical_frame, topology, uniform_q, MIN_INTERIOR_RATIO

VERSION = '1-b3-via-snub'
DOMAIN = 'Via-snub supports only a centered axis-aligned cube with complete ordinary incidence, origin center, and form A, or a regular dodecahedron/icosahedron at its geometric center; rotated/translated cubes, other sources and 4D are unavailable.'


def cube_domain(source):
    _require(source.get('dimension') == 3 and source.get('embeddingDimension', 3) == 3 and
             source.get('interpretation') == 'convex-polytope', DOMAIN)
    _require(all(len(source.get(k, [])) == n for k, n in [('vertices', 8), ('edges', 12), ('faces', 6), ('cells', 0)]), DOMAIN)
    points = source['vertices']
    _require(all(type(v) is list and len(v) == 3 and all(type(x) in (int, float) and math.isfinite(x) for x in v) for v in points), DOMAIN)
    a = abs(points[0][0])
    _require(a > 0 and all(abs(x) == a for v in points for x in v), DOMAIN)
    lookup = {tuple(x/a for x in v): i for i, v in enumerate(points)}
    reference = canonical_frame(0)
    _require(len(lookup) == 8 and set(lookup) == set(map(tuple, reference['vertices'])), DOMAIN)
    mapping = [lookup[tuple(v)] for v in reference['vertices']]
    edges = {tuple(sorted(mapping[v] for v in e)) for e in reference['edges']}
    faces = {canonical_cycle([mapping[v] for v in f]) for f in reference['faces']}
    _require(edges == {tuple(sorted(e)) for e in source['edges']} and
             faces == {canonical_cycle(f) for f in source['faces']}, DOMAIN)
    return a, mapping


class SnubPlan:
    def __init__(self, state, center=None, radius=1.):
        a, source_ids = cube_domain(state['model'])
        _require(center is None or type(center) in (list, tuple) and len(center) == 3 and
                 all(type(x) in (int, float) and x == 0 for x in center), DOMAIN)
        baseline = prepare_sizing(state, [0., 0., 0.], radius)
        self._state = baseline.source_snapshot
        self._dual = baseline.dual
        self._a = a
        self._radius = float(radius)
        self._polarity = baseline.evaluate(1.)['maximumPolarityResidual']
        source = self._state['model']
        source_end = canonical_frame(0)
        dual_end = canonical_frame(1)
        face_lookup = {frozenset(f): i for i, f in enumerate(source['faces'])}
        dual_ids = [face_lookup[frozenset(source_ids[i] for i, v in enumerate(source_end['vertices'])
                                         if sum(x*y for x, y in zip(v, normal)) == 1)]
                    for normal in dual_end['vertices']]
        b = self._radius*self._radius/a
        _require(math.isfinite(b) and b > 0, 'Via-snub reciprocal support overflowed or vanished.')
        _require(np.max(np.abs(np.asarray(self._dual['vertices'])[dual_ids]/b - np.asarray(dual_end['vertices']))) < 1e-10,
                 'Via-snub literal polar does not match its axis-facet correspondence.')
        self._quotients = {'source': [source_ids[i] for i in source_end['endpointQuotient']],
                           'dual': [dual_ids[i] for i in dual_end['endpointQuotient']]}
        corners = list(zip(self._quotients['source'], self._quotients['dual']))
        _require(len(set(corners)) == 24 and all(v in source['faces'][f] for v, f in corners),
                 'Via-snub corner correspondence is incomplete.')
        top = topology('A')
        self._topology = {k: top[k] for k in ('edges', 'faces', 'cells')}
        edge_lookup = {frozenset(e): i for i, e in enumerate(source['edges'])}

        def owner(ids):
            vertices = {corners[i][0] for i in ids}; facets = {corners[i][1] for i in ids}
            if len(vertices) == 1: rank, index = 0, next(iter(vertices))
            elif len(facets) == 1: rank, index = 2, next(iter(facets))
            else:
                _require(frozenset(vertices) in edge_lookup, 'Via-snub bridge has no source edge owner.')
                rank, index = 1, edge_lookup[frozenset(vertices)]
            return {'sourceRank': rank, 'sourceElement': index}

        self._maps = {'vertices': [{'sourceVertex': v, 'sourceFacet': f, 'sourceFacetRank': 2} for v, f in corners],
                      'edges': [owner(e) for e in top['edges']], 'faces': [owner(f) for f in top['faces']], 'cells': []}
        for component, endpoint in [('source', source), ('dual', self._dual)]:
            lookup = {frozenset([v]): {'rank': 0, 'element': v} for v in range(len(endpoint['vertices']))}
            for rank, kind in [(1, 'edges'), (2, 'faces')]:
                lookup.update({frozenset(ids): {'rank': rank, 'element': i} for i, ids in enumerate(endpoint[kind])})
            for kind in ('vertices', 'edges', 'faces'):
                entities = [[i] for i in range(24)] if kind == 'vertices' else top[kind]
                for ids, record in zip(entities, self._maps[kind]):
                    image = frozenset(self._quotients[component][i] for i in ids)
                    _require(image in lookup, 'Via-snub endpoint image has no literal incidence identity.')
                    record.setdefault('endpointImages', {})[component] = deepcopy(lookup[image])
        colors = []
        for record, kind in zip(self._maps['faces'], top['faceKinds']):
            record['faceKind'] = kind
            rank, index = record['sourceRank'], record['sourceElement']
            record['sourceSheetFace'] = index if rank == 2 else None
            entity = {index} if rank == 0 else set(source[('vertices', 'edges', 'faces')[rank]][index])
            incident = [f for f, cycle in enumerate(source['faces']) if entity <= set(cycle)]
            colors.append(_color_record(source, 'faces', index) if rank == 2 else
                          _mix([_color_record(source, 'faces', f) for f in incident]))
        self._metadata = {'coordinateUnits': source.get('metadata', {}).get('coordinateUnits', 'model'),
                          'sourceMetadata': deepcopy(source.get('metadata', {})),
                          'offColors': {'faces': colors},
                          'colorPolicy': 'Squares retain their source face RGBA; diagonal triangles use incident vertex-face means; bridge triangles use incident edge-face means. Only squares carry source PNG sheets.'}

    @property
    def source_snapshot(self): return deepcopy(self._state)

    @property
    def dual(self): return deepcopy(self._dual)

    def descriptor(self):
        source = self._state['model']
        return {'version': 1, 'algorithmVersion': VERSION, 'method': 'via-snub', 'dimension': 3,
                'certified': False, 'form': 'A', 'center': [0., 0., 0.], 'radius': self._radius,
                'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
                'sourceSnapshotSha256': hashlib.sha256(json.dumps(self._state, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                'original': deepcopy(source), 'dual': self.dual, 'halfWidth': self._a,
                'topology': deepcopy(self._topology), 'sourceMaps': deepcopy(self._maps),
                'endpointQuotients': deepcopy(self._quotients),
                'uniformSnubRatio': 1-uniform_q(),
                'parameterization': 'q=1-t; h=(1-t)*a+t*r^2/a; h times the proper signed-axis orbit of (q^2,q,1). Fixed form A.',
                'limits': {'exactEndpointRatios': [0, 1], 'interiorRatio': [MIN_INTERIOR_RATIO, 1-MIN_INTERIOR_RATIO]},
                'limitations': [DOMAIN, 'Binary64 approximate; unresolved open endpoint collars refuse without snapping.',
                                'Declared trajectory; installed Stella parity and other source domains remain unqualified.']}

    def evaluate(self, ratio):
        raw = canonical_frame(ratio, half_width=self._a, radius=self._radius)
        source = self._state['model']; endpoint = raw['endpoint'] is not None
        if endpoint:
            result = deepcopy(source) if ratio == 0 else self.dual
            maps = {}
        else:
            result = _geometry(source, raw['vertices'], self._topology, 'Via-snub of '+source.get('name', 'cube'), self._metadata)
            result['interpretation'] = 'convex-polytope'
            result['provenance'].update(algorithmVersion=VERSION, method='via-snub', form='A')
            result['fingerprint'] = identity(result)
            result['validation'] = validate(result)
            _require(result['validation']['passed'], 'Via-snub frame is numerically unresolved: '+'; '.join(result['validation']['errors']))
            maps = deepcopy(self._maps)
        return {'method': 'via-snub', 'requestedRatio': ratio, 'ratio': float(ratio), 'endpoint': endpoint,
                'endpointIdentity': 'literal-source' if ratio == 0 else 'literal-polar' if ratio == 1 else None,
                'model': result, 'sourceMaps': maps, 'sourceModelId': source.get('id'), 'sourceFingerprint': identity(source),
                'algorithmVersion': VERSION, 'certified': False, 'form': 'A',
                'normalizedResiduals': raw['normalizedResiduals'], 'maximumPolarityResidual': self._polarity,
                'endpointQuotients': deepcopy(self._quotients),
                'diagnostics': ['Cube / snub family / octahedron; approximate coordinates with prescribed incidence and explicit endpoint quotients.',
                                'Uniform snub ratio '+str(1-uniform_q())+'; ratio 0.5 is not uniform.',
                                'Interior ratios outside [0.001,0.999] refuse without snapping.']}


def prepare_snub(state, center=None, radius=1.):
    try:
        if len(state['model'].get('vertices', [])) in (12, 20):
            from .dual_morph_snub_h3 import H3SnubPlan
            return H3SnubPlan(state, center, radius)
        return SnubPlan(state, center, radius)
    except GeometryError: raise
    except (KeyError, TypeError, ValueError, IndexError, ArithmeticError, RecursionError) as error:
        raise GeometryError('Malformed/unresolved via-snub source or parameters. '+DOMAIN) from error
