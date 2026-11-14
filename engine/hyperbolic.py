"""Compact regular H³ templates. Float64, time first, curvature -1."""

from functools import lru_cache
from itertools import combinations
from decimal import Decimal, localcontext
import math

import numpy as np

from .geometry import GeometryError

J = np.diag([-1.0, 1.0, 1.0, 1.0])
_METRIC_DIAGONAL = J.diagonal()
PRESETS = ((5, 3, 4), (4, 3, 5), (5, 3, 5), (3, 5, 3))
GENERATOR_GATE = 1e-12
DEVELOPMENT_GATE = 1e-8
DEVELOPMENT_RELATIVE_GATE = 1e-12
EDGE_GATE = 1e-7
COORDINATE_LIMIT = 1e4
# Inputs may contain accumulated drift; repair at chart boundaries. All
# published metric errors use t², all linear discrepancies use t.
FRAME_INPUT_GATE = 1e-8
FRAME_REPAIR_GATE = 1e-12


def preset(pqr):
    if not isinstance(pqr, (list, tuple)) or len(pqr) != 3 or any(type(x) is not int for x in pqr):
        raise GeometryError('pqr must be one of the four compact regular integer triples.')
    if tuple(pqr) not in PRESETS:
        raise GeometryError('Supported compact regular presets: {5,3,4}, {4,3,5}, {5,3,5}, {3,5,3}.')
    return tuple(pqr)


def lorentz_inner(a, b):
    return np.sum(np.asarray(a, dtype=np.float64) * np.asarray(b, dtype=np.float64) * _METRIC_DIAGONAL, axis=-1)


def _scaled_residual(errors, scales, power=2):
    if np.isscalar(errors) and np.isscalar(scales):
        error, scale = float(errors), float(scales)
        if not math.isfinite(error) or not math.isfinite(scale):
            raise GeometryError('Nonfinite developed-geometry residual or scale.')
        scale = max(1.0, scale)
        if scale > COORDINATE_LIMIT:
            raise GeometryError('Hyperbolic coordinate scale exceeds 10000; rebase nearer the observer.')
        return {'absolute': error, 'relative': error / scale**power, 'scale': scale}
    errors = np.asarray(errors, dtype=float)
    scales = np.maximum(1.0, np.asarray(scales, dtype=float))
    if not np.isfinite(errors).all() or not np.isfinite(scales).all():
        raise GeometryError('Nonfinite developed-geometry residual or scale.')
    if scales.max() > COORDINATE_LIMIT:
        raise GeometryError('Hyperbolic coordinate scale exceeds 10000; rebase nearer the observer.')
    return {
        'absolute': float(errors.max()),
        'relative': float((errors / scales**power).max()),
        'scale': float(scales.max()),
    }


def point_metric_residual(points):
    points = np.asarray(points, dtype=float)
    return _scaled_residual(np.abs(lorentz_inner(points, points) + 1), np.abs(points[..., 0]))


def point_discrepancy(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    scale = max(float(np.abs(a[..., 0]).max()), float(np.abs(b[..., 0]).max()))
    return _scaled_residual(np.abs(a - b).max(), scale, power=1)


def matrix_metric_residual(matrix):
    matrix = np.asarray(matrix, dtype=float)
    return _scaled_residual(np.abs(matrix.T @ J @ matrix - J).max(), np.abs(matrix).max())


def matrix_discrepancy(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    return _scaled_residual(np.abs(a - b).max(), max(float(np.abs(a).max()), float(np.abs(b).max())), power=1)


def record_residual(receipt, name, measurement):
    for suffix, key in (('', 'absolute'), ('Relative', 'relative'), ('Scale', 'scale')):
        field = name + suffix
        receipt[field] = max(receipt.get(field, 0.0), measurement[key])


def coxeter_matrix(pqr):
    pqr = preset(pqr)
    m = np.full((4, 4), 2, dtype=int)
    np.fill_diagonal(m, 1)
    for i, value in enumerate(pqr):
        m[i, i + 1] = m[i + 1, i] = value
    return m


def gram_symbolic(pqr):
    m = coxeter_matrix(pqr)
    return [['1' if i == j else '0' if m[i, j] == 2 else f'-cos(pi/{m[i, j]})' for j in range(4)] for i in range(4)]


def gram_matrix(pqr):
    m = coxeter_matrix(pqr)
    g = np.eye(4)
    for i in range(4):
        for j in range(i):
            g[i, j] = g[j, i] = 0.0 if m[i, j] == 2 else -math.cos(math.pi / int(m[i, j]))
    eig = np.linalg.eigvalsh(g)
    if np.count_nonzero(eig > 0) != 3 or np.count_nonzero(eig < 0) != 1:
        raise GeometryError('The Gram signature must be (3+,1-).')
    for size in (1, 2, 3):
        for ids in combinations(range(4), size):
            if np.linalg.eigvalsh(g[np.ix_(ids, ids)])[0] <= 0:
                raise GeometryError('Every proper principal Gram submatrix must be positive definite.')
    return g


def mirror_normals(pqr):
    g = gram_matrix(pqr)
    # Port of the prototype's indefinite Cholesky, explicitly permuted from
    # (x,y,z,t) to (t,x,y,z). The cell center is already (1,0,0,0).
    old = np.zeros((4, 4))
    for i in range(4):
        for j in range(min(i, 3)):
            old[i, j] = (g[i, j] - old[i, :j] @ old[j, :j]) / old[j, j]
        if i < 3:
            old[i, i] = math.sqrt(1 - old[i, :i] @ old[i, :i])
        else:
            old[i, 3] = math.sqrt(old[i, :3] @ old[i, :3] - 1)
    return old[:, [3, 0, 1, 2]]


def reflection_matrix(n):
    n = np.asarray(n, dtype=np.float64)
    if n.shape != (4,) or not np.isfinite(n).all() or abs(float(lorentz_inner(n, n)) - 1) > GENERATOR_GATE:
        raise GeometryError('A reflection requires a finite unit spacelike normal.')
    return np.eye(4) - 2 * np.outer(n, n @ J)


def seed_point(pqr, rings=(1, 0, 0, 0)):
    preset(pqr)
    if (
        not isinstance(rings, (tuple, list))
        or len(rings) != 4
        or any(type(x) is not int for x in rings)
        or list(rings) != [1, 0, 0, 0]
    ):
        raise GeometryError('Only regular rings 1000 are supported; uniform ringings are deferred.')
    x = np.linalg.solve(mirror_normals(pqr) @ J, np.asarray(rings, dtype=float))
    if lorentz_inner(x, x) >= 0:
        raise GeometryError('The seed is not timelike.')
    x /= math.sqrt(-float(lorentz_inner(x, x)))
    return x if x[0] > 0 else -x


def lorentz_gram_schmidt(M):
    """Orthonormalize columns, rejecting nonfuture/nonproper input frames."""
    m = np.asarray(M, dtype=np.float64)
    if m.shape != (4, 4) or not np.isfinite(m).all() or m[0, 0] <= 0 or np.linalg.det(m) <= 0:
        raise GeometryError('Observer frame must be finite, future pointing and proper.')
    if np.max(np.abs(m)) > 4:
        # Avoid amplifying float64 cancellation while repairing a large frame.
        # The returned frame and every publication check remain float64.
        with localcontext() as ctx:
            ctx.prec = max(32, 2 * math.ceil(math.log10(float(np.max(np.abs(m))))) + 20)
            columns = []
            for i in range(4):
                v = [Decimal.from_float(float(x)) for x in m[:, i]]
                for j, q in enumerate(columns):
                    dot = -v[0] * q[0] + v[1] * q[1] + v[2] * q[2] + v[3] * q[3]
                    coefficient = -dot if j == 0 else dot
                    v = [a - coefficient * b for a, b in zip(v, q)]
                norm = -v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3]
                if (i == 0 and norm >= 0) or (i > 0 and norm <= 0):
                    raise GeometryError('Observer frame is Lorentz degenerate.')
                inverse_length = 1 / abs(norm).sqrt()
                columns.append([x * inverse_length for x in v])
            result = np.asarray(columns, dtype=float).T
            if result[0, 0] <= 0 or np.linalg.det(result) <= 0:
                raise GeometryError('Observer frame changed time orientation or handedness.')
            return result
    columns = []
    for i in range(4):
        v = m[:, i].copy()
        for j, q in enumerate(columns):
            v -= (-1 if j == 0 else 1) * lorentz_inner(v, q) * q
        norm = float(lorentz_inner(v, v))
        if (i == 0 and norm >= 0) or (i > 0 and norm <= 0):
            raise GeometryError('Observer frame is Lorentz degenerate.')
        columns.append(v / math.sqrt(abs(norm)))
    result = np.column_stack(columns)
    if result[0, 0] <= 0 or np.linalg.det(result) <= 0:
        raise GeometryError('Observer frame changed time orientation or handedness.')
    return result


def boost(direction, distance):
    u = np.array(direction, dtype=float, copy=True)
    if u.shape != (3,) or not np.isfinite(u).all() or not math.isfinite(distance) or abs(distance) > 20:
        raise GeometryError('Boost needs a finite 3-vector and distance with absolute value at most 20.')
    length = float(np.linalg.norm(u))
    if length == 0:
        if distance == 0:
            return np.eye(4)
        raise GeometryError('Boost direction must be nonzero.')
    u /= length
    c, s = math.cosh(distance), math.sinh(distance)
    b = np.eye(4)
    b[0, 0] = c
    b[0, 1:] = b[1:, 0] = s * u
    b[1:, 1:] += (c - 1) * np.outer(u, u)
    return b


def _finite_group(generators, limit=120):
    group = [np.eye(4)]
    buckets = {tuple(np.round(group[0].ravel(), 8)): [0]}
    for t in group:
        for r in generators:
            candidate = t @ r
            key = tuple(np.round(candidate.ravel(), 8))
            if any(np.max(np.abs(candidate - group[i])) < 1e-9 for i in buckets.get(key, [])):
                continue
            if len(group) >= limit:
                raise GeometryError('Finite parabolic stabilizer did not close.')
            buckets.setdefault(key, []).append(len(group))
            group.append(candidate)
    return group


def _unique_points(points, tolerance=1e-9):
    result = []
    for v in points:
        if not any(np.max(np.abs(v - w)) < tolerance for w in result):
            result.append(v)
    return np.asarray(result)


def _indices(points, vertices):
    ids = []
    for x in points:
        error = np.max(np.abs(vertices - x), axis=1)
        i = int(np.argmin(error))
        if error[i] > 1e-9:
            raise GeometryError('Parabolic incidence did not close.')
        ids.append(i)
    return ids


def _cycle(ids, edges):
    ids = set(ids)
    cycle = [min(ids)]
    while len(cycle) < len(ids):
        choices = sorted(b if a == cycle[-1] else a for a, b in edges if cycle[-1] in (a, b))
        cycle.append(next(v for v in choices if v in ids and v not in cycle))
    if sorted((cycle[-1], cycle[0])) not in [list(e) for e in edges]:
        raise GeometryError('Face boundary is not a cycle.')
    return cycle


@lru_cache(maxsize=4)
def _template(pqr):
    n = mirror_normals(pqr)
    r = [reflection_matrix(v) for v in n]
    group = _finite_group(r[:3])
    seed = seed_point(pqr)
    vertices = _unique_points(t @ seed for t in group)
    edges = sorted({tuple(sorted(_indices([t @ seed, t @ r[0] @ seed], vertices))) for t in group})
    base = _unique_points(t @ seed for t in _finite_group(r[:2]))
    faces, planes, seen = [], [], set()
    for t in group:
        ids = _indices((t @ base.T).T, vertices)
        key = tuple(sorted(ids))
        if key in seen:
            continue
        seen.add(key)
        cycle = _cycle(ids, edges)
        normal = t @ n[3]
        xyz = vertices[cycle, 1:]
        if np.dot(np.cross(xyz[1] - xyz[0], xyz[2] - xyz[1]), normal[1:]) < 0:
            cycle = [cycle[0]] + cycle[:0:-1]
        faces.append(cycle)
        planes.append(normal)
    return {
        'vertices': vertices.tolist(),
        'edges': [list(e) for e in edges],
        'faces': faces,
        'facePlanes': np.asarray(planes).tolist(),
    }


def regular_cell_template(pqr):
    """Fresh JSON-compatible template, incidence from finite Wythoff stabilizers."""
    import copy

    return copy.deepcopy(_template(preset(pqr)))


def generator_residuals(pqr):
    n = mirror_normals(pqr)
    r = [reflection_matrix(v) for v in n]
    m = coxeter_matrix(pqr)
    residuals = {
        'hyperboloid': abs(float(lorentz_inner(seed_point(pqr), seed_point(pqr))) + 1),
        'gram': float(np.max(np.abs(n @ J @ n.T - gram_matrix(pqr)))),
        'reflectionMetric': max(float(np.max(np.abs(t.T @ J @ t - J))) for t in r),
        'reflectionSquare': max(float(np.max(np.abs(t @ t - np.eye(4)))) for t in r),
        'coxeter': max(
            float(np.max(np.abs(np.linalg.matrix_power(r[i] @ r[j], int(m[i, j])) - np.eye(4))))
            for i, j in combinations(range(4), 2)
        ),
    }
    if max(residuals.values()) > GENERATOR_GATE:
        raise GeometryError(f'Generator residual gate {GENERATOR_GATE} failed: {residuals}.')
    return residuals


def local_analysis(pqr):
    p, q, r = preset(pqr)
    template = regular_cell_template(pqr)
    vertices = np.asarray(template['vertices'])
    planes = np.asarray(template['facePlanes'])
    edges, faces = template['edges'], template['faces']
    lengths = np.array([math.acosh(max(1, -float(lorentz_inner(vertices[a], vertices[b])))) for a, b in edges])
    angles = []
    for a, b in edges:
        fs = [i for i, f in enumerate(faces) if a in f and b in f]
        angles.append(math.acos(np.clip(-lorentz_inner(planes[fs[0]], planes[fs[1]]), -1, 1)))
    # Vertex stabilizer acts on the unit tangent sphere, including incidence.
    mirrors = [reflection_matrix(v) for v in mirror_normals(pqr)]
    stabilizer = _finite_group(mirrors[1:])
    v = vertices[0]
    adjacent = [b if a == 0 else a for a, b in edges if 0 in (a, b)]
    tangent = vertices[adjacent] + lorentz_inner(vertices[adjacent], v)[:, None] * v
    tangent /= np.sqrt(lorentz_inner(tangent, tangent))[:, None]
    link_vertices = _unique_points(t @ tangent[0] for t in stabilizer)
    link_faces = sorted({tuple(sorted(_indices((t @ tangent.T).T, link_vertices))) for t in stabilizer})
    link_edges = set()
    # Two link vertices are adjacent precisely when they share a cell corner
    # and span one of its incident faces (q=3 or 5).
    for f in link_faces:
        distances = [(float(lorentz_inner(link_vertices[a], link_vertices[b])), a, b) for a, b in combinations(f, 2)]
        maximum = max(x[0] for x in distances)
        link_edges.update((min(a, b), max(a, b)) for d, a, b in distances if abs(d - maximum) < 1e-9)
    link_cycles = [_cycle(f, sorted(link_edges)) for f in link_faces]
    a, b = edges[0]
    incident = [i for i, f in enumerate(faces) if a in f and b in f]
    edge_normals = planes[incident]
    sectors = _unique_points(t[:, 0] for t in _finite_group([reflection_matrix(n) for n in edge_normals]))
    e1 = edge_normals[0]
    e2 = edge_normals[1] - lorentz_inner(edge_normals[1], e1) * e1
    e2 /= math.sqrt(float(lorentz_inner(e2, e2)))
    sector_angles = np.sort(np.arctan2(lorentz_inner(sectors, e2), lorentz_inner(sectors, e1)))
    sector_gaps = np.diff(np.r_[sector_angles, sector_angles[0] + 2 * math.pi])
    sector_error = float(np.max(np.abs(sector_gaps - 2 * math.pi / r)))
    rotation = mirrors[0] @ mirrors[1]
    rotation_error = float(np.max(np.abs(np.linalg.matrix_power(rotation, p) - np.eye(4))))
    spread = float(np.ptp(lengths) / lengths.mean())
    if (
        spread > EDGE_GATE
        or max(abs(a - 2 * math.pi / r) for a in angles) > GENERATOR_GATE
        or len(sectors) != r
        or sector_error > GENERATOR_GATE
        or rotation_error > GENERATOR_GATE
    ):
        raise GeometryError('Regular cell metric checks failed.')
    return {
        'approximate': True,
        'cell': {'p': p, 'q': q, 'vertices': len(vertices), 'edges': len(edges), 'faces': len(faces)},
        'vertexFigure': {
            'p': q,
            'q': r,
            'vertices': len(link_vertices),
            'edges': len(link_edges),
            'faces': len(link_faces),
            'faceCycles': link_cycles,
        },
        'cellsPerEdge': len(sectors),
        'edgeSectorResidual': sector_error,
        'faceAxisRotationResidual': rotation_error,
        'edgeLength': float(lengths.mean()),
        'cellDihedral': float(np.mean(angles)),
        'dihedralResidual': max(abs(a - 2 * math.pi / r) for a in angles),
        'edgeRelativeSpread': spread,
        'residuals': generator_residuals(pqr),
        'totalVolume': None,
        'eulerCharacteristic': None,
    }
