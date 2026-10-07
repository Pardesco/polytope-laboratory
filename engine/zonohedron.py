"""Isolated bounded equal-edge 3D zonotope; no source-feature UI or zone addition."""
from copy import deepcopy
from fractions import Fraction
from itertools import product
import json
import math

import numpy as np

from engine.geometry import GeometryError, hull, identity
from engine.convex_classification import analyze_convex_boundary
from engine.formats import validate_project
from engine.history import _json_bytes

VERSION = '0.1.0'
MAX_INPUT_DIRECTIONS = 64
MAX_ZONES = 12
MAX_SUMS = 4096
MIN_SEPARATION = 1e-6
TOLERANCE = 1e-7


def _number(value, label, maximum=1e100):
    if type(value) not in (int, float) or abs(value) > maximum or not math.isfinite(value):
        raise GeometryError(f'Zonohedron {label} requires a finite bounded number.')
    return float(value)


def _direction(point):
    if type(point) is not list or len(point) != 3:
        raise GeometryError('Zonohedron directions require three coordinates.')
    p = [_number(x, 'direction') for x in point]
    scale = max(map(abs, p))
    if not scale:
        raise GeometryError('Zonohedron directions cannot be zero.')
    # Exact supplied binary64 ratios decide only collinearity/direction identity.
    raw = [Fraction(x) for x in p]
    anchor = next(x for x in raw if x)
    key = tuple(x / anchor for x in raw)
    canonical = np.array([x / scale for x in p], dtype=float)
    if next(x for x in canonical if x) < 0:
        canonical = -canonical
    unit = canonical / np.linalg.norm(canonical)
    return key, unit


def zonohedron(directions, *, edge_length=1.0, max_zones=None):
    """Centered Minkowski sum of distinct antipodal equal-length segments.

    Generator ordering is first occurrence. max_zones selects that prefix after
    exact supplied-direction deduplication. Numerical construction is atomic.
    """
    if type(directions) is not list or not 1 <= len(directions) <= MAX_INPUT_DIRECTIONS:
        raise GeometryError('Zonohedron requires 1 to 64 literal directions.')
    length = _number(edge_length, 'edge length', 1e6)
    if length < 1e-6:
        raise GeometryError('Zonohedron edge length must be from 1e-6 to 1e6.')
    if max_zones is not None and (type(max_zones) is not int or not 1 <= max_zones <= MAX_ZONES):
        raise GeometryError('Zonohedron zone maximum must be an integer from 1 to 12.')
    groups = []
    lookup = {}
    for index, point in enumerate(directions):
        key, unit = _direction(point)
        if key in lookup:
            groups[lookup[key]]['sourceDirectionIds'].append(index)
        else:
            lookup[key] = len(groups)
            groups.append({'sourceDirectionIds': [index], 'unitDirection': unit.tolist()})
    selected = groups if max_zones is None else groups[:max_zones]
    if not 3 <= len(selected) <= MAX_ZONES:
        raise GeometryError('Zonohedron needs 3 to 12 selected distinct zones.')
    units = np.array([g['unitDirection'] for g in selected])
    if np.linalg.svd(units, compute_uv=False)[-1] < MIN_SEPARATION:
        raise GeometryError('Zonohedron zones lack a well-separated full 3D span.')
    for a in range(len(units)):
        for b in range(a):
            if np.linalg.norm(np.cross(units[a], units[b])) < MIN_SEPARATION:
                raise GeometryError('Zonohedron distinct zones are numerically too close to parallel.')
    generators = units * length
    signs = np.array(list(product((-1, 1), repeat=len(units))), dtype=float)
    sums = signs @ generators * .5
    if len(sums) > MAX_SUMS:
        raise GeometryError('Zonohedron sign-sum resource bound exceeded.')
    result = hull(sums.tolist(), name='Equal-edge zonohedron')
    vertex_signs = [signs[i].astype(int).tolist() for i in result['provenance']['extremeInputIndices']]
    result['id'] = 'zonohedron-' + identity(result)[:32]
    result['numeric'].update(certified=False)
    result['provenance'] = {'operation': 'zonohedron', 'algorithmVersion': VERSION}
    vertices = np.array(result['vertices'])
    edge_zones = []
    for a, b in result['edges']:
        delta = vertices[b] - vertices[a]
        distance = float(np.linalg.norm(delta))
        if abs(distance / length - 1) > TOLERANCE:
            raise GeometryError('Zonohedron reconstruction failed the equal-edge check.')
        matches = [i for i, u in enumerate(units)
                   if np.linalg.norm(np.cross(delta / distance, u)) <= TOLERANCE]
        if len(matches) != 1:
            raise GeometryError('Zonohedron edge has no unique generator owner.')
        edge_zones.append(matches[0])
    classification = analyze_convex_boundary(result)
    if classification['status'] != 'passed':
        raise GeometryError('Zonohedron native convex boundary classification failed.')
    classification = json.loads(json.dumps(classification, allow_nan=False))
    # Every output support plane must expose the analytic segment support sum.
    supports = []
    for support in classification['facetSupports']:
        ids = support['vertexIds']
        p = vertices[ids]
        _, _, vt = np.linalg.svd(p - p[0], full_matrices=False)
        normal = vt[-1]
        offset = float(np.dot(normal, p[0]))
        if offset < 0:
            normal = -normal
            offset = -offset
        expected = float(np.abs(generators @ normal).sum() * .5)
        if abs(offset - expected) > TOLERANCE * length:
            raise GeometryError('Zonohedron support differs from its segment sum.')
        supports.append({'vertexIds': ids, 'normal': normal.tolist(),
                         'offset': offset, 'segmentSupport': expected})
    result['metadata']['zonohedron'] = {
        'algorithmVersion': VERSION, 'sourceDirections': deepcopy(directions),
        'edgeLength': length, 'maxZones': max_zones, 'distinctZoneCount': len(groups),
        'selectedZones': deepcopy(selected), 'edgeZoneIds': edge_zones,
        'vertexSignVectors': vertex_signs,
        'signSumsEnumerated': len(sums), 'supports': supports,
        'antipodalPolicy': 'exact supplied binary64 proportionality; first occurrence',
        'numeric': {'mode': 'float64-approximate', 'certified': False,
                    'exactScope': 'supplied generator collinearity only',
                    'reconstructionTolerance': TOLERANCE,
                    'minimumNormalizedSeparation': MIN_SEPARATION},
        'resourceBounds': {'inputDirections': MAX_INPUT_DIRECTIONS,
                           'selectedZones': MAX_ZONES, 'signSums': MAX_SUMS},
        'classification': classification,
        'resultModelId': result['id'], 'resultFingerprint': result['fingerprint']}
    validate_project({'format': 'polytope-laboratory', 'version': 1, 'active': 0,
                      'documents': [{'id': 'zonohedron-check', 'cursor': 0,
                                     'states': [{'model': result, 'view': {}}]}]})
    return result


def verify_zonohedron_evidence(model):
    """Reconstruct declared operation and compare full literal current evidence."""
    try:
        _json_bytes(model, 8 * 1024 * 1024)
        evidence = model['metadata']['zonohedron']
        if evidence['algorithmVersion'] != VERSION:
            raise GeometryError('Unknown zonohedron evidence version.')
        reconstructed = zonohedron(evidence['sourceDirections'],
                                   edge_length=evidence['edgeLength'],
                                   max_zones=evidence['maxZones'])
        def encoded(value):
            return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
        if encoded(reconstructed) != encoded(model):
            raise GeometryError('Zonohedron full attributes or evidence changed.')
    except (KeyError, TypeError, ValueError, OverflowError, RecursionError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Malformed zonohedron evidence.') from exc
    return {'passed': True, 'certified': False,
            'modelId': model['id'], 'fingerprint': identity(model)}
