from collections import Counter
from copy import deepcopy
from itertools import product
import json
import math
import numpy as np
import pytest
from engine.geometry import GeometryError, identity
from engine.history import create_history, record_source, record_operation, replay_history, canonical_model
from engine.server import dispatch


def generate(kind, **parameters):
    return dispatch({'op': 'generate', 'params': {'kind': kind, **parameters}})


def counts(m):
    return [len(m[k]) for k in ('vertices', 'edges', 'faces', 'cells')]


def state(m):
    return {'model': m, 'view': {}, 'notes': 'W34 source'}


@pytest.mark.parametrize('subdivisions', [[1, 1, 1], [3, 2, 1], [2, 3, 4]])
def test_block_exterior_tiles_are_closed_with_independent_counts_area_and_volume(subdivisions):
    x, y, z = subdivisions
    s = x * y + x * z + y * z
    m = generate('block', dimensions=subdivisions, subdivisions=subdivisions, coordinate_unit='mm')
    assert counts(m) == [2 * s + 2, 4 * s, 2 * s, 0]
    cloud = np.asarray(m['vertices'])
    area = 0
    volume = 0
    directed = Counter()
    for face in m['faces']:
        a, b, c, d = cloud[face]
        assert np.linalg.norm(b - a) == pytest.approx(1)
        normal = np.cross(b - a, c - a)
        area += np.linalg.norm(normal)
        volume += np.dot(a, normal) / 3
        directed.update(zip(face, face[1:] + face[:1]))
    assert all(directed[a, b] == directed[b, a] == 1 for a, b in m['edges'])
    assert area == pytest.approx(2 * s) and volume == pytest.approx(x * y * z)
    assert m['metadata']['coordinateUnits'] == 'mm'
    assert m['interpretation'] == 'generalized-complex' and 'measure' not in m


@pytest.mark.parametrize('shape,n', [('triangle', 1), ('triangle', 4), ('hexagon', 1), ('hexagon', 2), ('hexagon', 4)])
@pytest.mark.parametrize('fold', [0, 60, -110])
def test_grids_have_complete_independent_triangles_and_isometric_crease(shape, n, fold):
    if shape == 'triangle' and n == 1 and fold:
        with pytest.raises(GeometryError, match='at least two'):
            generate('triangular-grid', shape=shape, subdivisions=n, fold_angle=fold)
        return
    m = generate('triangular-grid', shape=shape, subdivisions=n, fold_angle=fold, edge_length=2)
    v, e, f = (
        ((n + 1) * (n + 2) // 2, 3 * n * (n + 1) // 2, n * n)
        if shape == 'triangle'
        else (3 * n * (n + 1) + 1, 9 * n * n + 3 * n, 6 * n * n)
    )
    assert counts(m) == [v, e, f, 0]
    cloud = np.asarray(m['vertices'])
    assert m['dimension'] == (3 if fold else 2)
    for a, b in m['edges']:
        assert np.linalg.norm(cloud[a] - cloud[b]) == pytest.approx(2)
    assert m['metadata']['basicConstruction']['tiledArea'] == pytest.approx(f * math.sqrt(3))
    assert m['metadata']['basicConstruction']['maximumRelativeEdgeResidual'] < 1e-14
    incidences = Counter(tuple(sorted(edge)) for face in m['faces'] for edge in zip(face, face[1:] + face[:1]))
    assert all(k in (1, 2) for k in incidences.values())
    assert sum(k == 1 for k in incidences.values()) == (3 * n if shape == 'triangle' else 6 * n)


def test_cayley_menger_rejects_impossible_tetrahedron_even_with_valid_triangle_faces():
    with pytest.raises(GeometryError, match='Cayley'):
        generate('edge-tetrahedron', edges=[1, 1, 1, 1.9, 1.9, 1.9])
    m = generate('edge-tetrahedron', edges=[3, 4, 5, 5, math.sqrt(34), math.sqrt(41)])
    assert m['metadata']['basicConstruction']['cayleyMenger']['volume'] == pytest.approx(10)
    assert m['metadata']['basicConstruction']['cayleyMenger']['normalizedDeterminant'] > 0
    assert m['metadata']['basicConstruction']['cayleyMenger']['relativeVolumeResidual'] < 1e-14


@pytest.mark.parametrize(
    'lattice,radius,center,expected,selected',
    [
        ('SC', '1', ['0'] * 3, [6, 12, 8, 0], 7),
        ('SC', '3', ['0'] * 3, [8, 12, 6, 0], 27),
        ('BCC', '3', ['0'] * 3, [8, 12, 6, 0], 9),
        ('FCC', '2', ['0'] * 3, [12, 24, 14, 0], 13),
        ('SC', '3/4', ['1/2'] * 3, [8, 12, 6, 0], 8),
    ],
)
def test_waterman_lattices_match_exhaustive_independent_site_selection(lattice, radius, center, expected, selected):
    from fractions import Fraction

    m = generate('waterman-lattice', lattice=lattice, radius_squared=radius, center=center)
    info = m['metadata'].get('watermanBall', m['metadata'].get('watermanFcc'))
    r = Fraction(radius)
    c = list(map(Fraction, center))
    sites = [
        list(p)
        for p in product(range(-3, 4), repeat=3)
        if (lattice != 'FCC' or sum(p) % 2 == 0)
        and (lattice != 'BCC' or len({v % 2 for v in p}) == 1)
        and sum((v - q) ** 2 for v, q in zip(p, c)) <= r
    ]
    assert counts(m) == expected and info['selectedPointCount'] == selected
    assert info['sourceSnapshot']['coordinates'] == sites
    assert info['selectionCertificate']['certified'] and not m['numeric']['certified']


@pytest.mark.parametrize('twist', [-2, -1, 1, 2])
def test_twisted_torus_periodic_seam_orientation_and_exact_grid_counts(twist):
    n, m = 7, 5
    model = generate('torus', ring_segments=n, arm_segments=m, twist=twist)
    assert counts(model) == [n * m, 3 * n * m, 2 * n * m, 0]

    def v(i, j):
        return (i % n) * m + (j + (i // n) * twist) % m

    assert model['faces'][-2:] == [[v(n - 1, m - 1), v(n, m - 1), v(n, m)], [v(n - 1, m - 1), v(n, m), v(n - 1, m)]]
    directed = Counter((a, b) for face in model['faces'] for a, b in zip(face, face[1:] + face[:1]))
    assert all(directed[a, b] == directed[b, a] == 1 for a, b in model['edges'])
    for i in range(n):
        for j in range(m):
            p = np.asarray(model['vertices'][i * m + j])
            u = math.tau * i / n
            angle = math.tau * (j + twist * i / n) / m
            np.testing.assert_allclose(
                p,
                [
                    (1 + 0.5 * math.cos(angle)) * math.cos(u),
                    (1 + 0.5 * math.cos(angle)) * math.sin(u),
                    0.5 * math.sin(angle),
                ],
                atol=1e-14,
            )
    assert model['metadata']['polyhedralTorus']['geometricEvidence']['selfIntersectionsChecked'] is False
    assert 'measure' not in model


def test_twist_colors_follow_both_triangles_without_altering_input():
    colors = [{'encoding': 'unit', 'values': [0.1, 0.3, 0.5, 0.7]}] + [None] * 19
    before = deepcopy(colors)
    m = generate('torus', ring_segments=5, arm_segments=4, twist=1, face_colors=colors)
    assert m['metadata']['offColors']['faces'][:2] == [colors[0], colors[0]]
    assert colors == before and m['provenance']['parameters']['face_colors'] == before


@pytest.mark.parametrize('n,step,expected', [(5, 2, [5, 10, 10, 5]), (8, 3, [16, 32, 24, 8]), (7, -2, [14, 28, 21, 7])])
def test_gyrochoron_is_actual_origin_polar_with_reversed_face_vector(n, step, expected):
    m = generate('gyrochoron', n=n, step=step)
    source = generate('step-prism', n=n, step=step)
    assert counts(m) == expected
    p = np.asarray(source['vertices'])
    q = np.asarray(m['vertices'])
    products = q @ p.T
    assert np.max(products) <= 1 + 1e-8
    assert all(np.count_nonzero(abs(row - 1) < 1e-8) >= 4 for row in products)
    assert m['numeric']['certified'] is False


@pytest.mark.parametrize(
    'kind,parameters',
    [
        ('block', {'dimensions': [3, 2, 1], 'subdivisions': [3, 2, 1]}),
        ('triangular-grid', {'shape': 'hexagon', 'subdivisions': 2, 'fold_angle': 45}),
        ('triangular-grid', {'shape': 'triangle', 'subdivisions': 4, 'fold_angle': -45}),
        ('edge-tetrahedron', {'edges': [1] * 6}),
        ('triangular-prism', {'sides': [3, 4, 5], 'height': 2, 'shear': [1, -2]}),
        ('torus', {'ring_segments': 7, 'arm_segments': 5, 'twist': -1}),
        ('waterman-lattice', {'lattice': 'SC', 'radius_squared': '3/4', 'center': ['1/2'] * 3}),
        ('waterman-lattice', {'lattice': 'BCC', 'radius_squared': 3}),
        ('gyrochoron', {'n': 8, 'step': 3}),
    ],
)
def test_deterministic_generation_native_save_and_source_history_replay(kind, parameters, tmp_path):
    before = deepcopy(parameters)
    m = generate(kind, **parameters)
    again = generate(kind, **parameters)
    assert identity(m) == identity(again) and parameters == before
    source = state(m)
    graph = record_source(create_history(), 'generated', source)
    transformed = {**source, 'model': dispatch({'op': 'transform', 'model': m, 'params': {'scale': 2}})}
    graph = record_operation(graph, 'scale', 'generated', 'transform', {'scale': 2}, transformed)
    replay = replay_history(graph, dispatch)
    assert canonical_model(replay['generated']['model']) == canonical_model(m)
    assert canonical_model(replay['scale']['model']) == canonical_model(transformed['model'])
    project = {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': 0, 'states': [source]}],
    }
    path = tmp_path / 'generated.polytope'
    dispatch({'op': 'save', 'params': {'path': str(path), 'project': project}})
    restored = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored) == canonical_model(m)
    assert restored['provenance']['generator'] == m['provenance']['generator']
    json.dumps(restored, allow_nan=False)


@pytest.mark.parametrize(
    'kind,parameters,message',
    [
        ('block', {'dimensions': [1, 0, 1]}, 'dimensions'),
        ('block', {'subdivisions': [1, True, 2]}, 'integers'),
        ('block', {'subdivisions': [32] * 3}, '4000'),
        ('block', {'dimensions': [10000, 0.0001, 1]}, 'unresolved'),
        ('triangular-grid', {'shape': 'hexagon', 'subdivisions': 37}, '4000'),
        ('triangular-grid', {'fold_angle': 180}, 'angle'),
        ('triangular-grid', {'shape': 'square'}, 'boundary'),
        ('triangular-grid', {'fold_angle': True}, 'angle'),
        ('triangular-prism', {'sides': [1, 1, 2]}, 'triangle'),
        ('triangular-prism', {'height': -1}, 'Height'),
        ('waterman-lattice', {'lattice': 'HCP'}, 'lattice'),
        ('waterman-lattice', {'lattice': True}, 'lattice'),
        ('waterman-lattice', {'lattice': 'BCC', 'radius_squared': 1}, 'fewer than four'),
        ('waterman-lattice', {'lattice': 'SC', 'radius_squared': 100000}, 'resource'),
        ('torus', {'twist': 0.5}, 'integer'),
        ('torus', {'twist': 129}, 'integer'),
        ('torus', {'ring_segments': 3, 'arm_segments': 3, 'twist': 3}, 'quarter'),
        ('gyrochoron', {'n': 6, 'step': 3}, 'dimension'),
        ('gyrochoron', {'n': 5, 'step': 1}, 'dimension'),
        ('gyrochoron', {'n': 7, 'step': 2, 'twist': 1}, 'Unknown'),
    ],
)
def test_new_option_refusals_are_clear_and_atomic(kind, parameters, message):
    before = deepcopy(parameters)
    with pytest.raises(GeometryError, match=message):
        generate(kind, **parameters)
    assert parameters == before
