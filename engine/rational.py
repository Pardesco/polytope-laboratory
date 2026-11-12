"""Small exhaustive rational hull certificates and rational polar construction.

Every d-point candidate support plane is tested against all supplied points.
This bounded algorithm is independent of Qhull's facet predicates. A candidate
boundary must agree with exact supports; a smaller XYZ fallback additionally
exhausts the exact binary64 adapter's supports and rechecks display incidence.
Measurements and display remain float64, even for certified rational topology.
"""

from fractions import Fraction
from itertools import combinations
import math
import re
import numpy as np
from .geometry import hull, GeometryError, identity, validate

MAX_EXACT_POINTS = 32


def fraction(x):
    if type(x) not in (int, float, str) or type(x) is bool:
        raise GeometryError('Use finite decimal, integer, or numerator/denominator rational coordinates.')
    if len(str(x)) > 256:
        raise GeometryError('Rational literal exceeds 256 characters.')
    exponent = re.search(r'[eE]([+-]?\d[\d_]*)', str(x))
    if exponent:
        digits = exponent[1].replace('_', '')
        if len(digits.lstrip('+-')) > 4 or abs(int(digits)) > 1024:
            raise GeometryError('Rational exponent magnitude exceeds 1,024; no arithmetic was attempted.')
    try:
        value = Fraction(str(x))
    except (ValueError, ZeroDivisionError) as exc:
        raise GeometryError('Use finite decimal, integer, or numerator/denominator rational coordinates.') from exc
    if value.numerator.bit_length() > 4096 or value.denominator.bit_length() > 4096:
        raise GeometryError('Rational magnitude exceeds the 4,096-bit arithmetic limit.')
    return value


def null_plane(rows):
    """One-dimensional nullspace of d × (d+1) homogeneous point rows."""
    a = [list(row) for row in rows]
    cols = len(a[0])
    pivot_cols = []
    row = 0
    for col in range(cols):
        pivot = next((i for i in range(row, len(a)) if a[i][col]), None)
        if pivot is None:
            continue
        a[row], a[pivot] = a[pivot], a[row]
        divisor = a[row][col]
        a[row] = [x / divisor for x in a[row]]
        for i in range(len(a)):
            if i != row and a[i][col]:
                factor = a[i][col]
                a[i] = [x - factor * y for x, y in zip(a[i], a[row])]
        pivot_cols.append(col)
        row += 1
        if row == len(a):
            break
    if len(pivot_cols) != cols - 1:
        return None
    free = next(i for i in range(cols) if i not in pivot_cols)
    vector = [Fraction(0)] * cols
    vector[free] = Fraction(1)
    for i, col in enumerate(pivot_cols):
        vector[col] = -a[i][free]
    return vector


def _rank(rows):
    a = [list(row) for row in rows]
    row = 0
    for col in range(len(a[0]) if a else 0):
        pivot = next((i for i in range(row, len(a)) if a[i][col]), None)
        if pivot is None:
            continue
        a[row], a[pivot] = a[pivot], a[row]
        divisor = a[row][col]
        a[row] = [x / divisor for x in a[row]]
        for i in range(row + 1, len(a)):
            factor = a[i][col]
            a[i] = [x - factor * y for x, y in zip(a[i], a[row])]
        row += 1
        if row == len(a):
            break
    return row


def rational_hull(points, name='Rational convex hull'):
    if not isinstance(points, list) or not 3 <= len(points) <= MAX_EXACT_POINTS:
        raise GeometryError(f'Exact hull input is limited to 3–{MAX_EXACT_POINTS} points.')
    d = len(points[0]) if type(points[0]) is list else 0
    if d not in (2, 3, 4) or any(type(p) is not list or len(p) != d for p in points):
        raise GeometryError('Exact hull requires a rectangular 2D/3D/4D coordinate array.')
    p = [[fraction(x) for x in row] for row in points]
    try:
        approx = [[float(x) for x in row] for row in p]
    except OverflowError as exc:
        raise GeometryError('Rational coordinates cannot be represented by the display float64 adapter.') from exc
    if not np.isfinite(approx).all():
        raise GeometryError('Rational coordinates cannot be represented by the display float64 adapter.')
    from .rational_filter import supports, extreme_indices, filtered_hull

    candidate_error = None
    adapter = None
    try:
        result = hull(approx, name)
    except GeometryError as exc:
        result = None
        candidate_error = str(exc)
    support, candidate_count = supports(p)
    if result is not None:
        used = result['provenance']['extremeInputIndices']
        extreme = {tuple(p[i]) for i in extreme_indices(p, support)}
        exact_sets = {frozenset(i for i in key if i in used) for key in support}
        candidate_sets = {frozenset(used[i] for i in facet) for facet in result['facetVertices']}
        if extreme != {tuple(p[i]) for i in used} or exact_sets != candidate_sets:
            result = None
            candidate_error = (
                'Float candidate incidence or extreme intersections disagree with exhaustive exact support predicates.'
            )
    if result is None:
        try:
            result, adapter = filtered_hull(p, approx, support, name)
        except GeometryError as exc:
            raise GeometryError(
                'Float hull candidate is unresolved; no exact certificate or fallback result was produced. '
                + candidate_error
                + ' '
                + str(exc)
            ) from exc
    used = result['provenance']['extremeInputIndices']
    planes = {frozenset(i for i in key if i in used): plane for key, plane in support.items()}
    result['rationalCoordinates'] = [[str(x) for x in p[i]] for i in used]
    result['rationalFacetEquations'] = [
        [str(x) for x in planes[frozenset(used[i] for i in facet)]] for facet in result['facetVertices']
    ]
    result['numeric'].update(
        {
            'mode': 'rational-exact',
            'certified': True,
            'predicates': 'Fraction exact exhaustive supporting-plane enumeration',
            'constructions': 'exact supplied rational extreme vertices',
            'measurementMode': 'float64-approximate',
            'displayMode': 'float64',
        }
    )
    result['certificate'] = {
        'property': 'complete convex facet support set relative to supplied rational input',
        'arithmetic': 'Python Fraction',
        'candidatePlaneCount': candidate_count,
        'exactFacetCount': len(support),
        'sourceCoordinates': [[str(x) for x in row] for row in p],
        'extremeInputIndices': used,
        'algorithmVersion': '0.1.0',
        'exhausted': True,
        'doesNotCertify': ['intended algebraic values', 'float measurements', 'generalized or nonconvex geometry'],
    }
    if adapter is not None:
        result['certificate']['displayAdapter'] = adapter
    result['provenance']['operation'] = 'rational-hull'
    result['fingerprint'] = identity(result)
    result['validation'] = validate(result)
    return result


def revalidate_rational_model(model):
    """Recompute the literal source certificate, including its claimed scope."""
    if (
        model.get('numeric', {}).get('mode') != 'rational-exact'
        or model.get('numeric', {}).get('certified') is not True
    ):
        raise GeometryError('Exact hull requires a certified rational numeric contract.')
    certificate = model.get('certificate')
    if type(certificate) is not dict:
        raise GeometryError('Exact model requires a literal property certificate.')
    source = certificate.get('sourceCoordinates')
    if not source:
        raise GeometryError('Exact model is missing its original certificate inputs.')
    rebuilt = rational_hull(source)
    if identity(rebuilt) != identity(model) or model.get('certificate') != rebuilt['certificate']:
        raise GeometryError(
            'Exact model differs from its independently recomputed input certificate or property assertions.'
        )

    def planes(m):
        result = {}
        for vertices, plane in zip(m.get('facetVertices', []), m.get('rationalFacetEquations', [])):
            values = [fraction(x) for x in plane]
            scale = next((x for x in values if x), None)
            if scale is None:
                raise GeometryError('Exact support plane must be nonzero.')
            result[frozenset(vertices)] = tuple(x / scale for x in values)
        return result

    if planes(model) != planes(rebuilt) or not validate(model)['passed']:
        raise GeometryError('Exact source coordinates, incidence, or support table failed revalidation.')
    if (
        model['numeric'].get('measurementMode') != 'float64-approximate'
        or model['numeric'].get('displayMode') != 'float64'
    ):
        raise GeometryError('Exact hull certificates do not certify measurements or display arithmetic.')
    return rebuilt


def rational_dual(model, center=None, radius='1'):
    if (
        model.get('numeric', {}).get('mode') != 'rational-exact'
        or not model.get('rationalCoordinates')
        or not model.get('rationalFacetEquations')
    ):
        raise GeometryError('Exact polar dual requires a certified rational hull source.')
    source = revalidate_rational_model(model)
    p = [[fraction(x) for x in row] for row in source['rationalCoordinates']]
    d = model['dimension']
    center = [sum(row[i] for row in p) / len(p) for i in range(d)] if center is None else [fraction(x) for x in center]
    radius = fraction(radius)
    if len(center) != d or radius <= 0:
        raise GeometryError('Exact dual requires a center of the correct dimension and positive rational radius.')
    points = []
    for plane in source['rationalFacetEquations']:
        a = [fraction(x) for x in plane]
        offset = -(sum(x * y for x, y in zip(a[:-1], center)) + a[-1])
        if offset <= 0:
            raise GeometryError('Exact reciprocation center must lie strictly inside every supporting half-space.')
        points.append([str(c + radius**2 * n / offset) for c, n in zip(center, a[:-1])])
    result = rational_hull(points, 'Exact dual of ' + model['name'])
    result['provenance'] = {
        'operation': 'rational-dual',
        'sourceId': model['id'],
        'sourceFingerprint': model.get('fingerprint'),
        'parameters': {'center': [str(x) for x in center], 'radius': str(radius)},
        'algorithmVersion': '0.1.0',
    }
    return result
