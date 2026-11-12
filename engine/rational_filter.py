"""Bounded XYZ support reconstruction, independently checked on binary64 values."""

from fractions import Fraction
from itertools import combinations
import uuid

import numpy as np
from .geometry import GeometryError, TOLERANCE, rank, validate, polygon_area

MAX_FILTER_POINTS = 12
FILTER_VERSION = 'rational-support-filter-1'


def supports(points):
    from .rational import null_plane

    rows = [row + [Fraction(1)] for row in points]
    result = {}
    count = 0
    for ids in combinations(range(len(points)), len(points[0])):
        count += 1
        plane = null_plane([rows[i] for i in ids])
        if plane is None:
            continue
        values = [sum(a * b for a, b in zip(row, plane)) for row in rows]
        if any(v > 0 for v in values) and any(v < 0 for v in values) or not any(values):
            continue
        if any(v > 0 for v in values):
            plane = [-v for v in plane]
        result.setdefault(tuple(i for i, v in enumerate(values) if not v), plane)
    return result, count


def extreme_indices(points, support):
    from .rational import _rank

    seen = set()
    result = []
    for i, row in enumerate(points):
        key = tuple(row)
        if key not in seen and _rank([plane[:-1] for ids, plane in support.items() if i in ids]) == len(row):
            seen.add(key)
            result.append(i)
    return result


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def filtered_hull(points, approx, support, name):
    if len(points[0]) != 3 or len(points) > MAX_FILTER_POINTS:
        raise GeometryError('Bounded exact support fallback requires XYZ3D and at most 12 supplied points.')
    p = np.asarray(approx)
    span = float(np.max(np.ptp(p, axis=0)))
    if not span or rank((p - p.mean(axis=0)) / span) != 3:
        raise GeometryError('Binary64 display adapter loses source rank at the unchanged structural tolerance.')
    identities = {}
    for exact, display in zip(points, approx):
        key = tuple(display)
        literal = tuple(exact)
        if key in identities and identities[key] != literal:
            raise GeometryError('Binary64 display adapter loses distinct source identities.')
        identities[key] = literal
    display = [[Fraction(x) for x in row] for row in approx]
    display_support, count = supports(display)
    if set(display_support) != set(support):
        raise GeometryError(
            'Binary64 display support incidence differs from the rational source; rounding changed a support sign or equality.'
        )
    used = extreme_indices(points, support)
    if used != extreme_indices(display, display_support):
        raise GeometryError('Binary64 display extreme intersections differ from the rational source.')
    compact = {v: i for i, v in enumerate(used)}
    facets = sorted(tuple(compact[i] for i in ids if i in compact) for ids in support)
    planes = {tuple(compact[i] for i in ids if i in compact): plane for ids, plane in support.items()}
    edges = set()
    for a, b in combinations(facets, 2):
        common = sorted(set(a) & set(b))
        if len(common) == 2:
            edges.add(tuple(common))
        elif len(common) > 2:
            raise GeometryError('Exact support intersection is not an ordinary convex edge.')
    faces = []
    rp = [points[i] for i in used]
    for facet in facets:
        adjacent = {
            i: sorted(b if a == i else a for a, b in edges if i in (a, b) and a in facet and b in facet) for i in facet
        }
        if any(len(v) != 2 for v in adjacent.values()):
            raise GeometryError('Exact facet edge links do not form a polygon.')
        face = [min(facet)]
        previous = None
        while True:
            next_id = next(i for i in adjacent[face[-1]] if i != previous)
            if next_id == face[0]:
                break
            if next_id in face:
                raise GeometryError('Exact facet cycle is disconnected.')
            previous = face[-1]
            face.append(next_id)
        if set(face) != set(facet):
            raise GeometryError('Exact facet cycle is incomplete.')
        a, b, c = [rp[i] for i in face[:3]]
        normal = _cross([y - x for x, y in zip(a, b)], [y - x for x, y in zip(b, c)])
        if sum(x * y for x, y in zip(normal, planes[facet][:-1])) < 0:
            face.reverse()
        faces.append(face)
    equations = []
    for facet in facets:
        plane = planes[facet]
        scale = max(abs(x) for x in plane[:-1])
        equations.append([float(x / scale) for x in plane])
    model = {
        'id': str(uuid.uuid4()),
        'name': name,
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'convex-polytope',
        'vertices': [approx[i] for i in used],
        'edges': [list(e) for e in sorted(edges)],
        'faces': faces,
        'cells': [],
        'facetVertices': [list(f) for f in facets],
        'facetEquations': equations,
        'numeric': {
            'mode': 'float64-approximate',
            'certified': False,
            'tolerance': TOLERANCE,
            'predicateScale': span,
            'algorithm': FILTER_VERSION,
            'version': '0.1.0',
        },
        'metadata': {},
        'provenance': {
            'operation': 'rational-hull',
            'algorithmVersion': '0.1.0',
            'inputVertexCount': len(points),
            'extremeInputIndices': used,
        },
    }
    check = validate(model)
    if not check['passed']:
        raise GeometryError(
            'Exact fallback display incidence failed unchanged validation: ' + '; '.join(check['errors'])
        )
    adapter = {
        'algorithm': FILTER_VERSION,
        'inputPointLimit': MAX_FILTER_POINTS,
        'dimension': 3,
        'binary64SupportPlaneCount': count,
        'binary64ExactFacetCount': len(display_support),
        'binary64SupportIncidenceAgreement': True,
        'exhausted': True,
    }
    model['measure'] = display_measures(model)
    return model, adapter


def display_measures(model):
    p = np.asarray(model['vertices'], dtype=float)
    center = p.mean(axis=0)
    volume = 0.0
    for face in model['faces']:
        a = p[face[0]] - center
        for i in range(1, len(face) - 1):
            volume += float(np.dot(a, np.cross(p[face[i]] - center, p[face[i + 1]] - center))) / 6
    return {
        'content': abs(volume),
        'boundaryMeasure': sum(polygon_area(p[f]) for f in model['faces']),
        'dimension': 3,
        'units': 'model-units',
    }


def filtered_measures(model):
    certificate = model.get('certificate')
    adapter = certificate.get('displayAdapter') if type(certificate) is dict else None
    if type(adapter) is not dict or adapter.get('algorithm') != FILTER_VERSION:
        return None
    from .rational import revalidate_rational_model

    revalidate_rational_model(model)
    return display_measures(model)
