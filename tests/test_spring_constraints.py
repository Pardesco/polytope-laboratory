"""CON-14 constraints/initialization: independent bounded metric and lifecycle oracles."""

from copy import deepcopy
import json
import math
from pathlib import Path

import numpy as np
import pytest

from engine.geometry import GeometryError
from engine.server import dispatch

CASES = json.loads((Path(__file__).parent / 'fixtures/r8_spring_constraints.json').read_text())


def source(key='tetra'):
    return deepcopy(CASES[key])


def pins(m):
    return [{'vertex': i, 'position': p[:]} for i, p in enumerate(m['vertices'])]


def preview(m, solver):
    return dispatch({'op': 'spring-relaxation-preview', 'model': m, 'params': {'solver': solver}})['result']


def current(d):
    return d['states'][d['cursor']]['model']


def independent_oracle(result, m, solver):
    p = np.asarray((result['model'] or result['preview'])['vertices'])
    scale = solver.get('edge_length', 1)
    pairs = [
        (a, b, length, weight)
        for (a, b), length, weight in zip(
            m['edges'],
            solver.get('edge_lengths', [scale] * len(m['edges'])),
            solver.get('edge_weights', [1] * len(m['edges'])),
        )
    ]
    if solver.get('regular_faces'):
        for face, weight in zip(m['faces'], solver.get('face_weights', [1] * len(m['faces']))):
            assert len(face) == 4  # Ordinary square oracle: four sides and two sqrt(2) diagonals.
            for i in range(4):
                for j in range(i + 1, 4):
                    pairs.append((face[i], face[j], scale * (math.sqrt(2) if j - i == 2 else 1), weight))
    pairs += [(r['vertices'][0], r['vertices'][1], r['length'], r['weight']) for r in solver.get('extra_springs', [])]
    errors = np.array([(np.linalg.norm(p[a] - p[b]) - length) / scale for a, b, length, _ in pairs])
    evidence = result['evidence']
    metrics = evidence['residuals']
    assert len(metrics['perConstraint']) == len(pairs)
    assert metrics['maximumAbsoluteNormalizedResidual'] == pytest.approx(max(abs(errors)), abs=1e-13)
    assert metrics['rmsNormalizedResidual'] == pytest.approx(math.sqrt(np.mean(errors**2)), abs=1e-13)
    assert metrics['weightedSpringEnergy'] == pytest.approx(
        sum(e * e * row[3] / 2 for e, row in zip(errors, pairs)), abs=1e-13
    )
    for row in solver.get('pins', []):
        assert p[row['vertex']].tolist() == row['position']
    # Independently test rank by tetrahedral determinants and face planarity by scalar triple products.
    rank3 = (
        max(
            abs(np.linalg.det(p[[a, b, c]] - p[0]))
            for a in range(1, len(p))
            for b in range(a + 1, len(p))
            for c in range(b + 1, len(p))
        )
        > 1e-8
    )
    distinct = min(np.linalg.norm(p[a] - p[b]) for a in range(len(p)) for b in range(a)) > 1e-8
    planar = True
    for f in m['faces']:
        normal = np.cross(p[f[1]] - p[f[0]], p[f[2]] - p[f[0]])
        planar &= np.linalg.norm(normal) > 1e-8 and all(abs(normal @ (p[v] - p[f[0]])) < 1e-8 for v in f)
    assert evidence['geometricValidity']['passed'] == bool(rank3 and distinct and planar)
    assert evidence['geometricValidity']['selfIntersectionChecked'] is False
    return p


@pytest.mark.parametrize('width', [1, 1.25])
def test_ordinary_face_distance_and_explicit_pair_equivalence_with_independent_residuals(width):
    m = source('cube')
    for p in m['vertices']:
        p[0] *= width
    common = {'pins': pins(m), 'face_weights': [2, 3, 4, 5, 6, 7]}
    face = {**common, 'regular_faces': True}
    extra = []
    for f, w in zip(m['faces'], common['face_weights']):
        for i in range(4):
            for j in range(i + 1, 4):
                extra.append({'vertices': [f[i], f[j]], 'length': math.sqrt(2) if j - i == 2 else 1, 'weight': w})
    explicit = {**common, 'extra_springs': extra}
    a = preview(m, face)
    b = preview(m, explicit)
    independent_oracle(a, m, face)
    independent_oracle(b, m, explicit)
    assert a['model']['vertices'] == b['model']['vertices'] == m['vertices']
    for key in ('maximumAbsoluteNormalizedResidual', 'rmsNormalizedResidual', 'weightedSpringEnergy'):
        assert a['evidence']['residuals'][key] == pytest.approx(b['evidence']['residuals'][key], abs=1e-13)
    assert a['evidence']['requestedConstraintsSatisfied'] == (width == 1)
    assert a['evidence']['geometricValidity']['passed']


@pytest.mark.parametrize('kind', ['satisfied', 'conflict', 'collapsed', 'nonplanar', 'flat-satisfied'])
def test_preview_adopt_save_reopen_replay_and_invalid_refusal(tmp_path, kind):
    m = source('cube' if kind == 'nonplanar' else 'tetra')
    solver = {'extra_springs': [{'vertices': [2, 3], 'length': 5 / 3, 'weight': 3}]} if kind == 'conflict' else {}
    if kind == 'satisfied':
        solver = {
            'pins': [{'vertex': 0, 'position': m['vertices'][0]}],
            'extra_springs': [{'vertices': [2, 3], 'length': 1, 'weight': 3}],
        }
    if kind == 'collapsed':
        solver = {'pins': [{'vertex': i, 'position': [0, 0, 0]} for i in range(4)]}
    if kind == 'nonplanar':
        positions = deepcopy(m['vertices'])
        positions[0][0] += 0.3
        solver = {'pins': [{'vertex': i, 'position': p} for i, p in enumerate(positions)]}
    if kind == 'flat-satisfied':
        positions = [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0]]
        solver = {
            'pins': [{'vertex': i, 'position': p} for i, p in enumerate(positions)],
            'edge_lengths': [math.dist(positions[a], positions[b]) for a, b in m['edges']],
        }
    before = deepcopy(m)
    result = preview(m, solver)
    p = independent_oracle(result, m, solver)
    assert m == before
    if kind == 'conflict':
        assert np.linalg.norm(p[2] - p[3]) == pytest.approx(1.5, abs=2e-6)
        assert result['evidence']['residuals']['weightedSpringEnergy'] == pytest.approx(1 / 6, abs=2e-6)
    params = {'solver': solver}
    if kind in ('collapsed', 'nonplanar', 'flat-satisfied'):
        assert result['status'] == 'invalid-realization' and result['model'] is None
        if kind == 'flat-satisfied':
            assert result['evidence']['requestedConstraintsSatisfied']
            assert result['evidence']['residuals']['maximumAbsoluteNormalizedResidual'] == 0
        for adoption in ('constraints-satisfied', 'valid-near-miss'):
            with pytest.raises(GeometryError, match='not publishable'):
                dispatch({'op': 'spring-relaxation', 'model': m, 'params': {**params, 'adoption': adoption}})
        return
    if kind == 'conflict':
        with pytest.raises(GeometryError, match='unresolved'):
            dispatch({'op': 'spring-relaxation', 'model': m, 'params': params})
        params['adoption'] = 'valid-near-miss'
    doc = {'id': 'r8-source', 'cursor': 0, 'states': [{'model': m, 'view': {}, 'notes': 'Keep this note'}]}
    made = dispatch(
        {'op': 'recipe-run', 'params': {'document': doc, 'operation': 'spring-relaxation', 'parameters': params}}
    )
    assert current(made)['vertices'] == result['model']['vertices']
    assert current(made)['edges'] == m['edges'] and current(made)['faces'] == m['faces']
    assert made['states'][1]['notes'] == 'Keep this note'
    node = made['operationHistory']['nodes'][-1]
    assert node['params']['solver'] == solver
    path = tmp_path / (kind + '.polyproj')
    dispatch(
        {
            'op': 'save',
            'params': {
                'path': str(path),
                'project': {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [made]},
            },
        }
    )
    restored = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': restored}})
    assert current(replay) == current(restored) == current(made)
    assert restored['states'][0]['model']['vertices'] == m['vertices']


@pytest.mark.parametrize('seed', [0, 19, 4294967295])
def test_recorded_pcg64_initialization_and_pin_override_have_independent_oracle(seed):
    m = source()
    solver = {
        'initialization': 'random',
        'seed': seed,
        'random_scale': 2,
        'max_evaluations': 1,
        'pins': [{'vertex': 0, 'position': [1, 2, 3]}],
    }
    a = preview(m, solver)
    b = preview(m, solver)
    expected = np.random.Generator(np.random.PCG64(seed)).uniform(-1, 1, (4, 3)) * 2
    expected -= expected.mean(axis=0)
    expected[0] = [1, 2, 3]
    np.testing.assert_array_equal(a['evidence']['initialNormalizedVertices'], expected)
    assert a == b
    independent_oracle(a, m, solver)
