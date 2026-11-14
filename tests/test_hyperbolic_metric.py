"""Independent metric, incidence and sphere-inversion checks (no prototypes imported)."""

from itertools import combinations, permutations
import math

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine.hyperbolic import (
    J,
    PRESETS,
    boost,
    coxeter_matrix,
    generator_residuals,
    gram_matrix,
    gram_symbolic,
    local_analysis,
    lorentz_gram_schmidt,
    lorentz_inner,
    mirror_normals,
    reflection_matrix,
    regular_cell_template,
    seed_point,
    DEVELOPMENT_RELATIVE_GATE,
    matrix_discrepancy,
    matrix_metric_residual,
    point_discrepancy,
    point_metric_residual,
)


@pytest.mark.parametrize('pqr', PRESETS)
def test_gram_signature_definitions_angles_and_generator_gates(pqr):
    g, m, symbolic = gram_matrix(pqr), coxeter_matrix(pqr), gram_symbolic(pqr)
    assert np.issubdtype(m.dtype, np.integer)
    assert (np.linalg.eigvalsh(g) < 0).sum() == 1
    for size in (1, 2, 3):
        for ids in combinations(range(4), size):
            assert np.linalg.eigvalsh(g[np.ix_(ids, ids)]).min() > 0
    for i, value in enumerate(pqr):
        assert symbolic[i][i + 1] == f'-cos(pi/{value})'
        assert math.acos(-g[i, i + 1]) == pytest.approx(math.pi / value, abs=1e-15)
    n = mirror_normals(pqr)
    np.testing.assert_allclose(n @ J @ n.T, g, atol=1e-14)
    point = seed_point(pqr, [1, 0, 0, 0])
    assert point[0] > 0 and lorentz_inner(point, point) == pytest.approx(-1, abs=1e-14)
    assert np.max(np.abs(n[1:] @ J @ point)) < 1e-14
    assert max(generator_residuals(pqr).values()) < 1e-12


@pytest.mark.parametrize(
    'pqr,vef,link',
    [
        ((5, 3, 4), (20, 30, 12), (6, 12, 8)),
        ((4, 3, 5), (8, 12, 6), (12, 30, 20)),
        ((5, 3, 5), (20, 30, 12), (12, 30, 20)),
        ((3, 5, 3), (12, 30, 20), (20, 30, 12)),
    ],
)
def test_stabilizer_templates_closed_ordered_incidence_and_tangent_links(pqr, vef, link):
    t = regular_cell_template(pqr)
    v, e, f = np.array(t['vertices']), t['edges'], t['faces']
    assert tuple(map(len, (v, e, f))) == vef
    edge_set = {tuple(edge) for edge in e}
    for face, plane in zip(f, t['facePlanes']):
        assert len(face) == pqr[0] == len(set(face))
        assert np.max(np.abs(v[face] @ J @ plane)) < 1e-13
        assert all(tuple(sorted((a, b))) in edge_set for a, b in zip(face, face[1:] + face[:1]))
        xyz = v[face, 1:]
        assert np.cross(xyz[1] - xyz[0], xyz[2] - xyz[1]) @ np.array(plane)[1:] > 0
    assert all(sum(a in face and b in face for face in f) == 2 for a, b in e)
    assert all(sum(i in edge for edge in e) == pqr[1] for i in range(len(v)))
    analysis = local_analysis(pqr)
    assert tuple(analysis['vertexFigure'][k] for k in ('vertices', 'edges', 'faces')) == link
    cycles = analysis['vertexFigure']['faceCycles']
    link_edges = [tuple(sorted((a, b))) for face in cycles for a, b in zip(face, face[1:] + face[:1])]
    assert len(set(link_edges)) == link[1]
    assert all(link_edges.count(e) == 2 for e in set(link_edges))
    assert len(cycles) == link[2] and all(len(face) == pqr[1] for face in cycles)
    assert analysis['cellsPerEdge'] == pqr[2]
    assert analysis['cellDihedral'] == pytest.approx(2 * math.pi / pqr[2], abs=1e-13)
    assert analysis['edgeSectorResidual'] < 1e-12
    assert analysis['edgeRelativeSpread'] < 1e-12
    assert analysis['faceAxisRotationResidual'] < 1e-12
    assert analysis['totalVolume'] is None and analysis['eulerCharacteristic'] is None
    # A p-fold face-axis rotation permutes the initial face in one p-cycle.
    normals = mirror_normals(pqr)
    rotation = reflection_matrix(normals[0]) @ reflection_matrix(normals[1])
    face = f[0]
    visited = []
    x = v[face[0]]
    for _ in range(pqr[0]):
        distances = np.max(np.abs(v[face] - x), axis=1)
        assert distances.min() < 1e-12
        visited.append(face[int(distances.argmin())])
        x = rotation @ x
    assert len(set(visited)) == pqr[0]


def test_534_independent_sphere_inversions_with_prototype_vertex_convention():
    phi = (1 + math.sqrt(5)) / 2
    directions = []
    independent_vertices = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for s in (-1, 1):
        for u in (-1, 1):
            directions.extend([(0, s * phi, u), (u, 0, s * phi), (s * phi, u, 0)])
            independent_vertices.extend([(0, s / phi, u * phi), (s / phi, u * phi, 0), (u * phi, 0, s / phi)])
    directions = np.array(directions, dtype=float)
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    sphere_centers = directions * 5**0.25
    sphere_radius2 = math.sqrt(5) - 1
    normals = np.column_stack((np.ones(12), sphere_centers)) / math.sqrt(sphere_radius2)
    template = regular_cell_template([5, 3, 4])
    ours = np.array(template['facePlanes'])
    # Independently find the orthogonal change of spatial basis, retaining
    # the pinned (0,±phi,±1) cyclic convention rather than swapping it.
    triple = next(ids for ids in combinations(range(12), 3) if abs(np.linalg.det(ours[list(ids), 1:])) > 0.1)
    basis = ours[list(triple), 1:]
    q = None
    for ids in permutations(range(12), 3):
        target = normals[list(ids), 1:]
        if np.max(np.abs(basis @ basis.T - target @ target.T)) < 1e-12:
            candidate = np.linalg.solve(basis, target).T
            transformed = ours[:, 1:] @ candidate.T
            if max(min(np.max(np.abs(x - y)) for y in normals[:, 1:]) for x in transformed) < 1e-12:
                q = candidate
                break
    assert q is not None
    np.testing.assert_allclose(q.T @ q, np.eye(3), atol=1e-12)
    points = np.array(template['vertices'])
    ball = points[:, 1:] @ q.T / (points[:, :1] + 1)
    iv = np.array(independent_vertices, dtype=float)
    iv /= np.linalg.norm(iv, axis=1)[:, None]
    cosine = (directions @ iv[0]).max()
    c = 2 * 5**0.25 * cosine
    iv *= (c - math.sqrt(c * c - 4)) / 2
    assert max(min(np.max(np.abs(x - y)) for y in iv) for x in ball) < 1e-12
    for plane in ours:
        direction = q @ plane[1:]
        i = int(np.argmin(np.linalg.norm(normals[:, 1:] - direction, axis=1)))
        for b in ([0.1, -0.2, 0.05], *ball[:3]):
            b = np.array(b)
            x = np.r_[(1 + b @ b) / (1 - b @ b), 2 * b / (1 - b @ b)]
            reflected = reflection_matrix(normals[i]) @ x
            inversion = sphere_centers[i] + sphere_radius2 * (b - sphere_centers[i]) / np.sum(
                (b - sphere_centers[i]) ** 2
            )
            np.testing.assert_allclose(reflected[1:] / (1 + reflected[0]), inversion, atol=2e-14)


def test_boost_and_lorentz_frame_repair():
    direction = np.array([2.0, -1.0, 3.0])
    boost(direction, 1)
    np.testing.assert_array_equal(direction, [2.0, -1.0, 3.0])
    b = boost([2, -1, 3], 2)
    np.testing.assert_allclose(b.T @ J @ b, J, atol=2e-14)
    np.testing.assert_allclose(boost([2, -1, 3], -2) @ b, np.eye(4), atol=2e-14)
    perturbed = b + np.arange(16).reshape(4, 4) * 1e-12
    frame = lorentz_gram_schmidt(perturbed)
    assert np.max(np.abs(frame.T @ J @ frame - J)) < 1e-13
    assert frame[0, 0] > 0 and np.linalg.det(frame) > 0
    for invalid in (-np.eye(4), np.diag([1, -1, 1, 1]), np.zeros((4, 4)), np.full((4, 4), np.nan)):
        with pytest.raises(GeometryError):
            lorentz_gram_schmidt(invalid)


@pytest.mark.parametrize('pqr', [(6, 3, 3), [5, 3, 3], [5.0, 3, 4], [True, 3, 4], [], None])
def test_unsupported_diagrams_refused(pqr):
    with pytest.raises(GeometryError):
        regular_cell_template(pqr)


@pytest.mark.parametrize('rings', [[0, 1, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0], [True, 0, 0, 0], None])
def test_uniform_masks_are_not_exposed(rings):
    with pytest.raises(GeometryError, match='1000'):
        seed_point([5, 3, 4], rings)


def test_template_returns_owned_arrays():
    a = regular_cell_template([5, 3, 4])
    a['vertices'][0][0] = 999
    assert regular_cell_template([5, 3, 4])['vertices'][0][0] != 999


def test_dimensionless_normalizers_reduce_to_absolute_at_the_anchor():
    origin = np.array([1.0, 0.0, 0.0, 0.0])
    assert point_metric_residual(origin) == {'absolute': 0.0, 'relative': 0.0, 'scale': 1.0}
    a = origin + [0, 1e-8, 0, 0]
    assert point_discrepancy(origin, a) == {'absolute': 1e-8, 'relative': 1e-8, 'scale': 1.0}
    m = np.eye(4)
    m[1, 2] = 1e-8
    assert matrix_discrepancy(m, np.eye(4)) == {'absolute': 1e-8, 'relative': 1e-8, 'scale': 1.0}
    measurement = matrix_metric_residual(m)
    assert measurement['relative'] == measurement['absolute'] and measurement['scale'] == 1
    assert measurement['relative'] > DEVELOPMENT_RELATIVE_GATE


def test_point_metric_normalizes_each_point_before_taking_the_maximum():
    far = boost([1, 0, 0], 8)[:, 0]
    points = np.array([[1 + 1e-6, 0, 0, 0], far])
    measurement = point_metric_residual(points)
    assert measurement['scale'] > 1000
    assert measurement['relative'] > 1e-6  # a far valid point cannot dilute near-anchor corruption
