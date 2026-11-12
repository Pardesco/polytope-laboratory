"""R5 mathematical harness for a cube--snub cube--octahedron path.

Canonical math reused by the source-bound production method in dual_morph_snub.
The topology is a proper signed-axis orbit, never a per-frame convex hull.
"""

from itertools import permutations, product
import math
import numpy as np
from .geometry import GeometryError

VERSION = 1
MIN_INTERIOR_RATIO = 1e-3
FORMS = ('A', 'B')


def actions():
    result = []
    for p in permutations(range(3)):
        parity = (-1) ** sum(p[i] > p[j] for i in range(3) for j in range(i + 1, 3))
        for signs in product((-1, 1), repeat=3):
            if parity * math.prod(signs) == 1:
                result.append((p, signs))
    return result


def orbit(q, form='A'):
    if form not in FORMS:
        raise GeometryError('Snub contract form must be A or B; B reflects coordinate X of A.')
    seed = (q * q, q, 1)
    return [[s[k] * seed[p[k]] * (-1 if form == 'B' and k == 0 else 1) for k in range(3)] for p, s in actions()]


def _cycle(face):
    start = face.index(min(face))
    return tuple(face[start:] + face[:start])


def topology(form='A'):
    if form not in FORMS:
        raise GeometryError('Snub contract form must be A or B.')
    codes = [tuple(s[k] * (p[k] + 1) for k in range(3)) for p, s in actions()]
    lookup = {code: i for i, code in enumerate(codes)}
    faces = {}
    for p, signs in actions():
        mapping = [lookup[tuple(signs[k] * code[p[k]] for k in range(3))] for code in codes]
        for kind, prototype in (
            ('square', (0, 10, 3, 9)),
            ('diagonal-triangle', (3, 19, 15)),
            ('bridge-triangle', (3, 5, 9)),
        ):
            cycle = [mapping[v] for v in prototype]
            if form == 'B':
                cycle.reverse()
            faces[_cycle(cycle)] = kind
    ordered = sorted(faces)
    edges = sorted({tuple(sorted((a, b))) for face in ordered for a, b in zip(face, face[1:] + face[:1])})
    return {
        'edges': [list(e) for e in edges],
        'faces': [list(f) for f in ordered],
        'cells': [],
        'faceKinds': [faces[f] for f in ordered],
    }


def uniform_q():
    lo, hi = 0.0, 1.0
    for _ in range(60):
        q = (lo + hi) / 2
        if q * q * q + q * q + q < 1:
            lo = q
        else:
            hi = q
    return (lo + hi) / 2


def _positive(value, label):
    if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
        raise GeometryError(label + ' must be finite and positive.')
    return float(value)


def canonical_frame(ratio, *, form='A', half_width=1.0, radius=1.0):
    """Canonical centered axis-aligned cube only; endpoint IDs are fixture IDs.

    dual_morph_snub binds literal source/dual snapshots and their entity IDs.
    A fixed normalized collar refuses ill-conditioned floating-point interiors.
    """
    if type(ratio) not in (int, float) or not math.isfinite(ratio) or not 0 <= ratio <= 1:
        raise GeometryError('Snub contract ratio must lie in [0,1]; extrapolation is unsupported.')
    if ratio not in (0, 1) and not MIN_INTERIOR_RATIO <= ratio <= 1 - MIN_INTERIOR_RATIO:
        raise GeometryError(
            'Snub contract interior is numerically unresolved near an endpoint; no endpoint snap was applied.'
        )
    a = _positive(half_width, 'Cube half-width')
    r = _positive(radius, 'Reciprocal radius')
    b = r * r / a
    if not math.isfinite(b) or b <= 0:
        raise GeometryError('Snub contract reciprocal axis support overflowed or vanished.')
    t = float(ratio)
    q = 1 - t
    support = (1 - t) * a + t * b
    unit = np.asarray(orbit(q, form), dtype=float)
    top = topology(form)
    quotient = None
    if t in (0.0, 1.0):
        unique = sorted(set(map(tuple, unit.tolist())))
        quotient = [unique.index(tuple(point)) for point in unit.tolist()]
        faces = set()
        for face in top['faces']:
            cycle = []
            for v in face:
                mapped = quotient[v]
                if not cycle or cycle[-1] != mapped:
                    cycle.append(mapped)
            if len(cycle) > 1 and cycle[-1] == cycle[0]:
                cycle.pop()
            if len(set(cycle)) >= 3:
                faces.add(_cycle(cycle))
        faces = sorted(faces)
        top = {
            'faces': [list(f) for f in faces],
            'cells': [],
            'edges': [
                list(e) for e in sorted({tuple(sorted((x, y))) for f in faces for x, y in zip(f, f[1:] + f[:1])})
            ],
        }
        unit = np.asarray(unique)
    residuals = {'planarity': 0.0, 'supportViolation': 0.0, 'minimumStrictSupportGap': math.inf}
    for face in top['faces']:
        cloud = unit[face]
        normal = np.cross(cloud[1] - cloud[0], cloud[2] - cloud[0])
        norm = float(np.linalg.norm(normal))
        if norm <= 1e-12:
            raise GeometryError('Snub contract face is numerically unresolved.')
        normal /= norm
        gaps = float(normal @ cloud[0]) - unit @ normal
        residuals['planarity'] = max(residuals['planarity'], float(np.max(np.abs(gaps[face]))))
        residuals['supportViolation'] = max(residuals['supportViolation'], float(max(0.0, -min(gaps))))
        residuals['minimumStrictSupportGap'] = min(
            residuals['minimumStrictSupportGap'], min(float(gap) for i, gap in enumerate(gaps) if i not in face)
        )
    if (
        residuals['planarity'] > 1e-10
        or residuals['supportViolation'] > 1e-10
        or residuals['minimumStrictSupportGap'] < 1e-10
    ):
        raise GeometryError('Snub contract support is numerically unresolved; no hull repair was applied.')
    points = unit * support
    if not np.isfinite(points).all() or float(np.max(np.abs(points))) == 0:
        raise GeometryError('Snub contract coordinates overflowed or vanished.')
    return {
        'version': VERSION,
        'ratio': t,
        'q': q,
        'form': form,
        'axisSupport': support,
        'vertices': points.tolist(),
        **top,
        'endpointQuotient': quotient,
        'endpoint': 'cube' if t == 0 else 'octahedron' if t == 1 else None,
        'certified': False,
        'numeric': 'float64-approximate',
        'normalizedResiduals': residuals,
    }
