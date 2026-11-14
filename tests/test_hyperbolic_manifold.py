"""Pinned gluing, independently assembled chains, and continuous local navigation."""

from collections import Counter
from copy import deepcopy
import json
import math

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine import hyperbolic_manifold as hm

J = np.diag([-1.0, 1.0, 1.0, 1.0])


@pytest.fixture(scope='module')
def domain():
    return hm.fundamental_domain()


@pytest.fixture(scope='module')
def receipt(domain):
    return hm.analyze(domain)


def test_pinned_prototype_numbering_hash_and_vectors():
    data = hm.load_data()
    assert data['dataHash'] == hm.DATA_HASH
    assert hm.canonical_hash({k: v for k, v in data.items() if k != 'dataHash'}) == hm.DATA_HASH
    assert data['faceColors'] == [0, 1, 2, 3, 2, 3, 0, 1, 1, 2, 0, 3]
    colors = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]]
    assert data['lambda'] == [colors[c] for c in data['faceColors']]
    assert data['faces'] == [
        [0, 8, 4, 15, 9],
        [0, 8, 14, 2, 10],
        [0, 9, 1, 16, 10],
        [1, 9, 15, 5, 11],
        [4, 8, 14, 6, 13],
        [2, 10, 16, 3, 12],
        [2, 12, 18, 6, 14],
        [1, 11, 17, 3, 16],
        [4, 13, 19, 5, 15],
        [3, 12, 18, 7, 17],
        [5, 11, 17, 7, 19],
        [6, 13, 19, 7, 18],
    ]
    # Prototype directions are (0,+-phi,+-1) cyclic, in time-first native coordinates.
    phi = (1 + math.sqrt(5)) / 2
    assert np.allclose(data['faceDirections'][0], np.array([0, -phi, -1]) / math.sqrt(phi * phi + 1))
    assert set(data['prototypeHashes']) == {
        'small_cover_quotient.py',
        'honeycomb_534_frames.py',
        'weave_crossings.py',
        'output/small_cover_quotient.json',
    }


def test_rank_orientation_and_counts_reconstructed_from_pairings(receipt):
    assert receipt['pass']
    assert receipt['characteristic']['vertexRanks'] == [3] * 20
    assert receipt['characteristic']['rank'] == 3
    assert receipt['characteristic']['surjective']
    assert receipt['characteristic']['torsionFreeKernel']
    assert receipt['characteristic']['oddParity']
    assert receipt['counts'] == {'vertices': 20, 'edges': 60, 'faces': 48, 'cells': 8}
    assert receipt['eulerCharacteristic'] == 0
    assert receipt['connected'] and receipt['orientable']
    assert receipt['chainComplex']['boundarySquaredResidual'] == 0


def test_data_tampering_is_rejected(monkeypatch):
    original = hm.Path.read_text

    def tampered(path, *args, **kwargs):
        text = original(path, *args, **kwargs)
        if path.name == 'small-cover-v1.json':
            data = json.loads(text)
            data['lambda'][0] = [1, 1, 0]
            return json.dumps(data)
        return text

    monkeypatch.setattr(hm.Path, 'read_text', tampered)
    with pytest.raises(GeometryError, match='hash mismatch'):
        hm.load_data()


def test_face_pairing_deck_formula_and_inverse(domain, receipt):
    generators = hm._generators(domain['template'])
    reps = {c['quotientState']: np.array(c['matrix']).reshape(4, 4) for c in domain['cells']}
    table = {(p['cell'], p['face']): p for p in domain['pairings']}
    vertices = np.array(domain['template']['vertices'])
    for p in domain['pairings']:
        g, h, f = p['cell'], p['toCell'], p['face']
        deck = np.array(p['isometry']).reshape(4, 4)
        local = np.array(p['localIsometry']).reshape(4, 4)
        other = table[h, f]
        expected = reps[g] @ generators[f] @ np.linalg.inv(reps[h])
        assert np.max(abs(deck - expected)) < 1e-8
        assert np.max(abs(deck @ np.array(other['isometry']).reshape(4, 4) - np.eye(4))) < 1e-8
        assert np.max(abs(deck.T @ J @ deck - J)) < 1e-8
        assert np.linalg.det(deck) == pytest.approx(1, abs=1e-8)
        assert np.linalg.det(local) == pytest.approx(-1, abs=1e-12)
        face = vertices[domain['template']['faces'][f]]
        assert np.max(abs((local @ face.T).T - face)) < 1e-12
        assert p['vertexPermutation'] == [0, 1, 2, 3, 4]
    assert receipt['pairings']['pass']
    assert receipt['pairings']['orientationPreservingDeckMaps']


def test_edge_holonomy_and_spherical_vertex_links(receipt):
    cycles = receipt['edgeCycles']
    assert len(cycles) == 60 and len({c['edge'] for c in cycles}) == 60
    for cycle in cycles:
        assert cycle['incidentCells'] == 4 and cycle['closedFourCycle']
        assert cycle['angleSum'] == pytest.approx(2 * math.pi, abs=1e-12)
        assert cycle['angleSumResidual'] < 1e-12 and cycle['holonomyResidual'] < 1e-12
    assert len(receipt['vertexLinks']) == 20
    assert all(link['counts'] == [6, 12, 8] and link['spherical'] for link in receipt['vertexLinks'])


def test_integral_h1_agrees_with_independent_triangulation(receipt, domain, monkeypatch):
    h1 = receipt['H1']
    assert h1['verified'] and h1['independentConstructionAgrees']
    assert h1['freeRank'] == 0 and h1['torsion'] == [2] * 9
    assert Counter(h1['smithDiagonal']) == {1: 32, 2: 9}
    triangulation = receipt['triangulation']
    assert triangulation['simplexCounts'] == [136, 1096, 1920, 960]
    assert triangulation['chainSquaredResidual'] == 0
    assert triangulation['everyTriangleHasTwoTetrahedra']
    assert triangulation['H1']['freeRank'] == 0 and triangulation['H1']['torsion'] == [2] * 9

    # A separate gluing path: neither the cellular identifications nor chains are reused.
    def forbidden(*args):
        raise AssertionError('Triangulation must not reuse cellular reconstruction')

    monkeypatch.setattr(hm, '_incidence', forbidden)
    monkeypatch.setattr(hm, '_cellular_chains', forbidden)
    assert hm._triangulation(domain) == triangulation


def test_h1_verification_requires_second_construction_agreement(monkeypatch):
    original = hm._triangulation

    def disagree(domain):
        result = original(domain)
        result['H1']['torsion'] = [2]
        return result

    monkeypatch.setattr(hm, '_triangulation', disagree)
    result = hm.analyze()
    assert not result['pass']
    assert not result['H1']['verified'] and not result['H1']['independentConstructionAgrees']


@pytest.mark.parametrize(
    ('matrix', 'expected'),
    [
        ([[0, 0], [0, 0]], []),
        ([[2, 0], [0, 3]], [1, 6]),
        ([[4, 0], [0, 6]], [2, 12]),
        ([[2, 4, 4], [-6, 6, 12], [10, -4, -16]], [2, 6, 12]),
        ([[0, 0, 0], [0, -12, 0]], [12]),
        ([[3, 6, 9]], [3]),
    ],
)
def test_integer_smith_reduction_nonunit_divisibility_and_rank(matrix, expected):
    assert hm._smith_dense(matrix) == expected
    columns = [{i: row[j] for i, row in enumerate(matrix) if row[j]} for j in range(len(matrix[0]))]
    assert hm._smith_sparse(columns, len(matrix)) == expected


def test_integer_smith_invariant_under_unimodular_changes():
    rng = np.random.default_rng(534)
    for expected in ([1, 2, 6], [2, 4, 12], [3, 9], [2, 2, 2, 2], []):
        a = np.zeros((6, 7), dtype=object)
        for i, value in enumerate(expected):
            a[i, i] = value
        for _ in range(35):
            i, j = rng.choice(6, 2, replace=False)
            a[i] += int(rng.choice([-2, -1, 1, 2])) * a[j]
            i, j = rng.choice(7, 2, replace=False)
            a[:, i] += int(rng.choice([-2, -1, 1, 2])) * a[:, j]
        assert hm._smith_dense(a.tolist()) == expected
        cols = [{i: int(a[i, j]) for i in range(6) if a[i, j]} for j in range(7)]
        assert hm._smith_sparse(cols, 6) == expected


@pytest.mark.parametrize('corruption', ['permutation', 'noninverse', 'lambda', 'deck', 'local', 'missing', 'duplicate'])
def test_corrupted_gluing_is_rejected(domain, corruption):
    bad = deepcopy(domain)
    if corruption == 'permutation':
        # Still a bijection, even its own inverse: geometric matching must catch it.
        bad['pairings'][0]['vertexPermutation'] = [1, 0, 2, 3, 4]
        bad['pairings'][12]['vertexPermutation'] = [1, 0, 2, 3, 4]
    elif corruption == 'noninverse':
        bad['pairings'][12]['toCell'] = 2
    elif corruption == 'lambda':
        bad['lambda'][0] = [1, 1, 0]
    elif corruption == 'deck':
        bad['pairings'][0]['isometry'][0] += 0.01
    elif corruption == 'local':
        bad['pairings'][0]['localIsometry'] = np.eye(4).ravel().tolist()
    elif corruption == 'missing':
        bad['pairings'].pop()
    elif corruption == 'duplicate':
        bad['pairings'][0] = deepcopy(bad['pairings'][1])
    with pytest.raises(GeometryError):
        hm.analyze(bad)


@pytest.mark.parametrize('corruption', ['template', 'chart', 'word', 'handedness', 'state'])
def test_corrupted_domain_is_rejected(domain, corruption):
    bad = deepcopy(domain)
    if corruption == 'template':
        bad['template']['vertices'][0][0] += 0.01
    elif corruption == 'chart':
        bad['cells'][0]['matrix'][0] += 0.01
    elif corruption == 'word':
        bad['cells'][0]['word'] = [1]
    elif corruption == 'handedness':
        bad['cells'][1]['handedness'] = 1
    elif corruption == 'state':
        bad['cells'][0]['quotientState'] = True
    with pytest.raises(GeometryError):
        hm.analyze(bad)


def test_geometry_gates_and_honest_volume(receipt):
    assert receipt['gates']['development'] == 1e-12
    assert receipt['gates']['finiteDomainAbsolute'] == 1e-8
    for key in ('generatorMetric', 'generatorInvolution', 'hyperboloidVertices', 'unitFaceNormals', 'edgeHolonomy'):
        assert receipt['residuals'][key] < 1e-12
    assert receipt['residuals']['edgeLengthRelativeSpread'] < 1e-7
    assert receipt['volume']['value'] == 8 * receipt['volume']['domainVolume'] == 34.4496
    assert receipt['volume']['status'] == 'coarse published reference; not certified'
    assert 'float64 approximations' in receipt['coordinateStatus']
    json.dumps(receipt, allow_nan=False)


def test_connected_lifts_have_correct_adjacency_and_permutations(domain):
    patch = hm.develop_patch(depth=2, radius=3, epoch=8)
    assert patch['epoch'] == 8 and patch['sourceHash'] == hm.canonical_hash(hm.source_descriptor())
    assert patch['anchor']['frame'] == 'observer-centered'
    assert patch['anchor']['observerMatrix'] == np.eye(4).ravel().tolist()
    assert patch['coverage']['complete'] and patch['coverage']['completedLayers'] == [0, 1, 2]
    assert Counter(len(i['word']) for i in patch['instances']) == {0: 1, 1: 12, 2: 102}
    assert len(patch['neighbors']) == 12 * len(patch['instances'])
    matrices = [np.array(i['matrix']).reshape(4, 4) for i in patch['instances']]
    vertices = np.array(domain['template']['vertices'])
    bits = [sum(x << i for i, x in enumerate(v)) for v in domain['lambda']]
    for instance, matrix in zip(patch['instances'], matrices):
        g = 0
        for f in instance['word']:
            g ^= bits[f]
        assert instance['quotientState'] == g
        assert np.max(abs(matrix.T @ J @ matrix - J)) < 1e-8
    for neighbor in patch['neighbors']:
        i, j, f = neighbor['cell'], neighbor['toCell'], neighbor['face']
        if j is None:
            assert neighbor['toCell'] is None
            continue
        assert not (neighbor['toCell'] is None)
        assert patch['instances'][j]['quotientState'] == patch['instances'][i]['quotientState'] ^ bits[f]
        src = domain['template']['faces'][f]
        dst = domain['template']['faces'][neighbor['toFace']]
        dst = [neighbor['vertexPermutation'][k] for k in src]
        assert np.max(abs((matrices[i] @ vertices[src].T) - (matrices[j] @ vertices[dst].T))) < 1e-8
        assert sorted(neighbor['vertexPermutation']) == list(range(20))
    assert patch['residuals']['transformMetric'] < 1e-8
    assert patch['residuals']['hyperboloidVertices'] < 1e-8
    assert patch['residuals']['mergeDiscrepancy'] < 1e-8
    for name in ('transformMetric', 'hyperboloidVertices', 'mergeDiscrepancy', 'mergeCenterDiscrepancy'):
        assert patch['residuals'][name + 'Relative'] <= 1e-12
        assert patch['residuals'][name + 'Scale'] >= 1
    assert len(json.dumps(patch, allow_nan=False).encode()) < 4 * 1024 * 1024


def test_patch_is_deterministic_without_runtime_caches():
    assert hm.develop_patch() == hm.develop_patch()


@pytest.mark.parametrize('limit', [1, 7, 256])
def test_page_cap_does_not_claim_a_complete_layer(limit):
    result = hm.develop_patch(depth=12, max_instances=limit, radius=0)
    assert len(result['instances']) == limit
    assert len(result['neighbors']) == limit * 12
    coverage = result['coverage']
    assert coverage['stopReason'] == 'pageLimit' and not coverage['complete']
    assert coverage['completedLayers'] == list(range((2 if limit == 256 else 0) + 1))
    assert coverage['publishedThrough'] == limit
    assert coverage['frontierCount'] > 0
    assert result['nextCursor'] is not None and coverage['resumable']
    assert len(json.dumps(result, allow_nan=False).encode()) < 4 * 1024 * 1024


def test_time_cap_publishes_explicit_frontier(monkeypatch):
    times = iter([0.0, 3.0])
    monkeypatch.setattr(hm.time, 'monotonic', lambda: next(times))
    patch = hm.develop_patch(depth=3)
    assert len(patch['instances']) == 1 and len(patch['neighbors']) == 12
    assert patch['coverage']['stopReason'] == 'timeLimit'
    assert not patch['coverage']['complete']
    assert patch['coverage']['completedLayers'] == [0]


def _boost(direction, distance):
    direction = np.asarray(direction, dtype=float)
    direction /= np.linalg.norm(direction)
    c, s = math.cosh(distance), math.sinh(distance)
    result = np.eye(4)
    result[0, 0] = c
    result[0, 1:] = s * direction
    result[1:, 0] = s * direction
    result[1:, 1:] += (c - 1) * np.outer(direction, direction)
    return result


@pytest.mark.parametrize('g', range(8))
def test_chart_crossing_roundtrip_and_continuous_observer_development(g):
    data = hm.load_data()
    # Approach the middle of face 0 from inside, then use its opposite local chart.
    normal = hm.fundamental_domain()['template']['facePlanes'][0]
    distance = math.asinh(normal[0]) - 0.02
    pose = _boost(data['faceDirections'][0], distance) @ np.diag([1, (-1) ** g.bit_count(), 1, 1])
    before = hm.develop_patch(g, pose, depth=1)
    crossing = hm.cross_face(g, pose, 0)
    h = crossing['quotientState']
    assert h == g ^ 1
    after = hm.develop_patch(h, crossing['localPose'], depth=1)
    a = next(i for i in before['instances'] if i['word'] == [0])
    b = next(i for i in after['instances'] if i['word'] == [])
    assert a['quotientState'] == b['quotientState'] == h
    assert np.max(abs(np.array(a['matrix']) - np.array(b['matrix']))) < 1e-12
    a = next(i for i in before['instances'] if i['word'] == [])
    b = next(i for i in after['instances'] if i['word'] == [0])
    assert a['quotientState'] == b['quotientState'] == g
    assert np.max(abs(np.array(a['matrix']) - np.array(b['matrix']))) < 1e-12
    returned = hm.cross_face(h, crossing['localPose'], 0)
    assert returned['quotientState'] == g
    assert np.max(abs(np.array(returned['localPose']) - pose.ravel())) < 1e-12


def test_long_crossing_walk_uses_bounded_local_pose():
    g, pose = 0, np.eye(4).ravel().tolist()
    for i in range(200):
        # Each out/back pair leaves the observer near the initial point.
        face = (i // 2) % 12
        crossed = hm.cross_face(g, pose, face)
        g, pose = crossed['quotientState'], crossed['localPose']
    assert g == 0
    assert np.max(abs(np.array(pose) - np.eye(4).ravel())) < 1e-10


@pytest.mark.parametrize(
    'kwargs',
    [
        {'depth': -1},
        {'depth': 13},
        {'depth': 1.2},
        {'depth': True},
        {'radius': float('nan')},
        {'radius': float('inf')},
        {'radius': 5.1},
        {'radius': -1},
        {'radius': True},
        {'max_instances': 257},
        {'max_instances': 0},
        {'max_instances': True},
        {'epoch': -1},
        {'epoch': 0.5},
        {'quotient_state': 8},
        {'quotient_state': True},
        {'local_pose': [float('nan')] * 16},
        {'local_pose': [1] * 15},
        {'local_pose': np.zeros((4, 4))},
        {'local_pose': np.full((4, 4), 1e308)},
        {'local_pose': np.array(1)},
        {'local_pose': -np.eye(4)},
        {'quotient_state': 1, 'local_pose': np.eye(4)},
        {'source': {'type': 'manifold', 'key': 'other'}},
        {'source': {'type': 'honeycomb', 'key': hm.KEY}},
        {'source': {'type': 'manifold', 'key': hm.KEY, 'dataHash': 'wrong'}},
    ],
)
def test_invalid_patch_inputs_are_refused(kwargs):
    with pytest.raises(GeometryError):
        hm.develop_patch(**kwargs)


@pytest.mark.parametrize('face', [-1, 12, 1.2, True])
def test_invalid_crossing_face_is_refused(face):
    with pytest.raises(GeometryError):
        hm.cross_face(0, None, face)
