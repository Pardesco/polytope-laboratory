"""Independent exact supporting-plane oracle and all-parameter proof (stdlib only).

No engine imports, nonlinear solve, Qhull, or floating-point predicates.
Run this file to print the reproducible rational fixture as JSON.
"""

from fractions import Fraction
from itertools import combinations, permutations, product
from math import comb
import json


def trim(a):
    a = list(a)
    while len(a) > 1 and a[-1] == 0:
        a.pop()
    return a


def add(a, b):
    return trim([(a[i] if i < len(a) else 0) + (b[i] if i < len(b) else 0) for i in range(max(len(a), len(b)))])


def sub(a, b):
    return add(a, [-v for v in b])


def mul(a, b):
    c = [0] * (len(a) + len(b) - 1)
    for i, x in enumerate(a):
        for j, y in enumerate(b):
            c[i + j] += x * y
    return trim(c)


def dot(a, b, multiply=lambda a, b: a * b, plus=lambda a, b: a + b, zero=0):
    total = zero
    for x, y in zip(a, b):
        total = plus(total, multiply(x, y))
    return total


def cross(a, b, multiply=lambda a, b: a * b, minus=lambda a, b: a - b):
    return [
        minus(multiply(a[1], b[2]), multiply(a[2], b[1])),
        minus(multiply(a[2], b[0]), multiply(a[0], b[2])),
        minus(multiply(a[0], b[1]), multiply(a[1], b[0])),
    ]


def difference(a, b, minus=lambda a, b: a - b):
    return [minus(x, y) for x, y in zip(a, b)]


def polynomial_vertices():
    # Coxeter's two cyclic-permutation classes, not a matrix-orbit traversal.
    points = []
    for p in permutations(range(3)):
        even = sum(p[i] > p[j] for i in range(3) for j in range(i + 1, 3)) % 2 == 0
        for signs in product((-1, 1), repeat=3):
            if (sum(s < 0 for s in signs) % 2 == 0) == even:
                points.append([[0] * (2 - p[k]) + [signs[k]] for k in range(3)])
    return points


def evaluate(poly, q):
    return sum(c * q**i for i, c in enumerate(poly))


def rational_vertices(q):
    return [tuple(evaluate(poly, q) for poly in v) for v in polynomial_vertices()]


def canonical_cycle(face):
    i = face.index(min(face))
    return tuple(face[i:] + face[:i])


def supporting_boundary(q=Fraction(1, 2)):
    points = rational_vertices(q)
    supports = {}
    for i, j, k in combinations(range(24), 3):
        normal = cross(difference(points[j], points[i]), difference(points[k], points[i]))
        if not any(normal):
            continue
        gaps = [dot(normal, difference(v, points[i])) for v in points]
        if min(gaps) < 0 < max(gaps):
            continue
        if max(gaps) > 0:
            normal = [-v for v in normal]
        supports[tuple(v for v, gap in enumerate(gaps) if gap == 0)] = normal
    edges = {tuple(sorted(set(a) & set(b))) for a, b in combinations(supports, 2) if len(set(a) & set(b)) == 2}
    faces = []
    for support, normal in supports.items():
        first = min(support)
        cycle = [first]
        previous = None
        current = first
        while True:
            adjacent = sorted(v for v in support if v != previous and tuple(sorted((current, v))) in edges)
            following = adjacent[0]
            if following == first:
                break
            if following in cycle:
                raise AssertionError('Oracle face link is not a simple cycle.')
            cycle.append(following)
            previous, current = current, following
        if set(cycle) != set(support):
            raise AssertionError('Oracle face link did not exhaust its support.')
        a, b, c = [points[v] for v in cycle[:3]]
        if dot(cross(difference(b, a), difference(c, a)), normal) < 0:
            cycle.reverse()
        faces.append(canonical_cycle(cycle))
    return {
        'vertices': [[str(c) for c in point] for point in points],
        'edges': [list(e) for e in sorted(edges)],
        'faces': [list(f) for f in sorted(faces)],
    }


def positive_on_open_unit_interval(poly):
    """Factor q^a(1-q)^b, then check strictly positive Bernstein coefficients."""
    p = trim(poly)
    a = b = 0
    if not any(p):
        return None
    while p[0] == 0:
        p = p[1:]
        a += 1
    while sum(p) == 0:
        carry = 0
        quotient = []
        for c in p[:-1]:
            carry += c
            quotient.append(carry)
        if -carry != p[-1]:
            raise AssertionError('Polynomial division failed.')
        p = trim(quotient)
        b += 1
    n = len(p) - 1
    bernstein = [sum(Fraction(p[i] * comb(k, i), comb(n, i)) for i in range(k + 1)) for k in range(n + 1)]
    if min(bernstein) <= 0:
        raise AssertionError('Supporting gap positivity was not proved: ' + str(poly))
    return {'qPower': a, 'oneMinusQPower': b, 'remainder': p, 'bernstein': [str(v) for v in bernstein]}


def support_certificate(faces):
    points = polynomial_vertices()
    gaps = {}
    incidences = 0
    for face in faces:
        a, b, c = [points[v] for v in face[:3]]
        normal = cross(difference(b, a, sub), difference(c, a, sub), mul, sub)
        height = dot(normal, a, mul, add, [0])
        for i, point in enumerate(points):
            gap = sub(height, dot(normal, point, mul, add, [0]))
            if i in face:
                if any(gap):
                    raise AssertionError('Face is not identically coplanar.')
                incidences += 1
            else:
                proof = positive_on_open_unit_interval(gap)
                if proof is None:
                    raise AssertionError('Unexpected coplanar vertex.')
                gaps[tuple(gap)] = proof
    return {
        'identicallyCoplanarIncidences': incidences,
        'strictGapChecks': 24 * len(faces) - incidences,
        'gapPolynomials': [{'coefficients': list(p), **gaps[p]} for p in sorted(gaps)],
    }


def fixture():
    boundary = supporting_boundary()
    endpoints = {}
    for label, q in (('cube', Fraction(1)), ('octahedron', Fraction(0))):
        points = rational_vertices(q)
        unique = sorted(set(points))
        endpoints[label] = {
            'vertices': [[int(x) for x in point] for point in unique],
            'quotient': [unique.index(point) for point in points],
        }
    proof = support_certificate(boundary['faces'])
    return {
        'version': 1,
        'scope': 'R5 canonical B3 contract only; not a registered morph',
        'q': '1/2',
        'seed': ['q^2', 'q', '1'],
        'form': 'A',
        **boundary,
        'endpoints': endpoints,
        'supportProof': proof,
        'uniformRoot': {
            'polynomialAscending': [-1, 1, 1, 1],
            'bracket': ['543689012692076/1000000000000000', '543689012692077/1000000000000000'],
        },
        'catalogConventions': {
            'snub-cube': 'A',
            'snub-cube-mirror': 'B',
            'antiprism-u12': 'B',
            'antiprism-u12-mirror': 'A',
        },
        'antiprismU12SourceSha256': '608fe0a85d05b587213228d67397dae86548a5eb83c2bf689d03df21a84b7531',
    }


if __name__ == '__main__':
    print(json.dumps(fixture(), indent=2))
