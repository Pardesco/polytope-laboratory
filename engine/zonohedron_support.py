"""Native polynomial-size 3D zonotope boundary from exact raw support signs.

Generator normalization, output coordinates, Hull and native measurements remain
approximate. Exact rational predicates apply ONLY to the supplied raw directions.
The previous twelve-zone sign-sum prototype remains unchanged.
"""
from copy import deepcopy
from fractions import Fraction
from functools import cmp_to_key
from itertools import combinations
import hashlib
import json

import numpy as np

from engine.zonohedron import _direction, _number, MIN_SEPARATION, TOLERANCE
from engine.convex_classification import analyze_convex_boundary
from engine.formats import validate_project
from engine.geometry import GeometryError, canonical_cycle, hull, identity
from engine.history import _json_bytes

VERSION = '0.1.0'
MAX_ZONES = 32
MAX_INPUT = 64
MAX_BITS = 4096
MAX_VERTICES = 1024


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _checked(vector):
    if any(max(x.numerator.bit_length(), x.denominator.bit_length()) > MAX_BITS for x in vector):
        raise GeometryError('Zonohedron support rational bit budget exceeded.')
    return vector


def _sign(value):
    return (value > 0) - (value < 0)


def _facet_codes(raw, normal):
    sides = [_sign(_checked((_dot(g, normal),))[0]) for g in raw]
    zeros = [i for i, side in enumerate(sides) if not side]
    u = raw[zeros[0]]
    v = _checked(_cross(normal, u))
    rays = [(i, sign, tuple(sign*x for x in raw[i])) for i in zeros for sign in (-1, 1)]

    def compare(a, b):
        def half(ray):
            x, y = _dot(ray[2], u), _dot(ray[2], v)
            return 0 if y > 0 or y == 0 and x >= 0 else 1
        ha, hb = half(a), half(b)
        if ha != hb:
            return ha - hb
        turn = _sign(_checked((_dot(normal, _cross(a[2], b[2])),))[0])
        if not turn:
            raise GeometryError('Distinct zonogon rays became parallel.')
        return -turn

    rays.sort(key=cmp_to_key(compare))
    first = rays[:len(zeros)]
    if len({i for i, _, _ in first}) != len(zeros):
        raise GeometryError('Zonogon half-circle does not own every zone once.')
    code = sides[:]
    for i, sign, _ in first:
        code[i] = -sign
    initial = tuple(code)
    cycle = []
    for i, sign, _ in rays:
        if code[i] != -sign:
            raise GeometryError('Zonogon sign walk is inconsistent.')
        cycle.append(tuple(code))
        code[i] = sign
    if tuple(code) != initial:
        raise GeometryError('Zonogon sign walk did not close.')
    return cycle, zeros, sides


def zonohedron_support(directions, *, edge_length=1.0, max_zones=None):
    """At most32 equal-length zones; enumerate facets instead of2**n sums."""
    if type(directions) is not list or not 1 <= len(directions) <= MAX_INPUT:
        raise GeometryError('Support zonohedron requires1..64 literal directions.')
    _json_bytes(directions, 1024*1024)
    length = _number(edge_length, 'edge length', 1e6)
    if length < 1e-6:
        raise GeometryError('Zonohedron edge length must be from1e-6 to1e6.')
    if max_zones is not None and (type(max_zones) is not int or not 1 <= max_zones <= MAX_ZONES):
        raise GeometryError('Support zonohedron zone maximum must be1..32.')
    groups, lookup = [], {}
    for index, point in enumerate(directions):
        key, unit = _direction(point)
        _checked(key)
        if key in lookup:
            groups[lookup[key]]['sourceDirectionIds'].append(index)
        else:
            lookup[key] = len(groups)
            groups.append({'sourceDirectionIds': [index], 'unitDirection': unit.tolist(), 'raw': key})
    selected = groups if max_zones is None else groups[:max_zones]
    if not 3 <= len(selected) <= MAX_ZONES:
        raise GeometryError('Support zonohedron needs3..32 distinct selected zones.')
    units = np.array([g['unitDirection'] for g in selected])
    if np.linalg.svd(units, compute_uv=False)[-1] < MIN_SEPARATION:
        raise GeometryError('Zonohedron lacks a well-separated full3D span.')
    if any(np.linalg.norm(np.cross(units[a], units[b])) < MIN_SEPARATION
           for a, b in combinations(range(len(units)), 2)):
        raise GeometryError('Distinct zones are numerically too close to parallel.')
    raw = [g['raw'] for g in selected]
    normals = {}
    for a, b in combinations(range(len(raw)), 2):
        normal = _checked(_cross(raw[a], raw[b]))
        anchor = next((x for x in normal if x), None)
        if anchor is None:
            raise GeometryError('Distinct exact generator zones are parallel.')
        key = _checked(tuple(x/anchor for x in normal))
        normals.setdefault(key, (a, b))
    vertices, vertex_lookup, facets = [], {}, []
    for normal, pair in normals.items():
        for orientation in (1, -1):
            oriented = tuple(orientation*x for x in normal)
            codes, zeros, sides = _facet_codes(raw, oriented)
            cycle = []
            for code in codes:
                if code not in vertex_lookup:
                    if len(vertices) >= MAX_VERTICES:
                        raise GeometryError('Support zonohedron output vertex budget exceeded.')
                    vertex_lookup[code] = len(vertices)
                    vertices.append(code)
                cycle.append(vertex_lookup[code])
            facets.append({'cycle': cycle, 'zeroZoneIds': zeros,
                           'fixedZoneSigns': sides, 'seedZonePair': list(pair),
                           'exactRawNormal': [str(x) for x in oriented]})
    generators = units*length
    points = np.array(vertices, dtype=float) @ generators * .5
    model = hull(points.tolist(), name='Equal-edge support zonohedron')
    parameters = {'version': VERSION, 'directions': directions, 'edgeLength': length, 'maxZones': max_zones}
    model['id'] = 'support-zonohedron-' + hashlib.sha256(json.dumps(parameters, sort_keys=True, allow_nan=False).encode()).hexdigest()
    if model['provenance']['extremeInputIndices'] != list(range(len(points))):
        raise GeometryError('Numerical Hull omitted an exact sign-code vertex.')
    expected = {canonical_cycle(f['cycle']): f for f in facets}
    actual = [canonical_cycle(face) for face in model['faces']]
    if len(expected) != len(facets) or set(actual) != set(expected) or len(actual) != len(expected):
        raise GeometryError('Numerical Hull differs from exact raw support incidence.')
    classification = analyze_convex_boundary(model)
    if classification['status'] != 'passed':
        raise GeometryError('Support zonohedron native convex classification failed.')
    classification = json.loads(json.dumps(classification, allow_nan=False))
    edge_zones = []
    for a, b in model['edges']:
        changed = [i for i, (x, y) in enumerate(zip(vertices[a], vertices[b])) if x != y]
        if len(changed) != 1 or abs(np.linalg.norm(points[b]-points[a])/length-1) > TOLERANCE:
            raise GeometryError('Zonohedron edge lacks one equal-length sign-code zone.')
        edge_zones.append(changed[0])
    for equation in model['facetEquations']:
        n = np.array(equation[:3])
        support = np.abs(generators @ n).sum()*.5
        if abs(float(equation[3])+support) > TOLERANCE*length:
            raise GeometryError('Support plane differs from analytic segment support.')
    evidence = {
        'algorithmVersion': VERSION, 'sourceDirections': deepcopy(directions),
        'edgeLength': length, 'maxZones': max_zones,
        'distinctZoneCount': len(groups),
        'selectedZones': [{k: deepcopy(v) for k, v in g.items() if k != 'raw'} for g in selected],
        'vertexSignVectors': [list(code) for code in vertices], 'edgeZoneIds': edge_zones,
        'facets': [expected[key] for key in actual],
        'sourcePairCount': len(raw)*(len(raw)-1)//2,
        'antipodalNormalCount': len(normals), 'endpointSignSumsEnumerated': 0,
        'numeric': {'certified': False, 'exactScope': 'raw direction proportionality, support signs and zonogon order only',
                    'reconstructionTolerance': TOLERANCE, 'minimumNormalizedSeparation': MIN_SEPARATION},
        'resourceBounds': {'inputDirections': MAX_INPUT, 'selectedZones': MAX_ZONES,
                           'outputVertices': MAX_VERTICES, 'rationalBits': MAX_BITS},
        'classification': classification,
    }
    model['provenance'] = {'operation': 'support-zonohedron', 'algorithmVersion': VERSION}
    model['numeric']['certified'] = False
    model['metadata']['supportZonohedron'] = evidence
    evidence['resultModelId'] = model['id']
    evidence['resultFingerprint'] = identity(model)
    validate_project({'format': 'polytope-laboratory', 'version': 1, 'active': 0,
                      'documents': [{'id': 'support-zonohedron-check', 'cursor': 0,
                                     'states': [{'model': model, 'view': {}}]}]})
    return model


def verify_support_zonohedron(model):
    try:
        _json_bytes(model, 16*1024*1024)
        e = model['metadata']['supportZonohedron']
        if e['algorithmVersion'] != VERSION:
            raise GeometryError('Unknown support zonohedron evidence version.')
        rebuilt = zonohedron_support(e['sourceDirections'], edge_length=e['edgeLength'], max_zones=e['maxZones'])
        if json.dumps(rebuilt, sort_keys=True, allow_nan=False) != json.dumps(model, sort_keys=True, allow_nan=False):
            raise GeometryError('Support zonohedron full attributes or evidence changed.')
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Malformed support zonohedron evidence.') from exc
    return {'passed': True, 'certified': False, 'scope': 'full literal reconstruction within bounded numerical domain'}
