from copy import deepcopy
from itertools import combinations, product
import json
import math

import numpy as np
import pytest

from engine.zonohedron import zonohedron, verify_zonohedron_evidence
from engine.geometry import GeometryError

AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def counts(model):
    return tuple(len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells'))


def independent_supports(model, directions, length=1):
    generators = np.array(directions, dtype=float)
    generators /= np.linalg.norm(generators, axis=1)[:, None]
    generators *= length
    vertices = np.array(model['vertices'])
    for direction in [[1, 2, 3], [-2, 1, .25], [0, 0, 1], [1, -1, 0]]:
        normal = np.array(direction)
        expected = np.abs(generators @ normal).sum() * .5
        assert max(vertices @ normal) == pytest.approx(expected)
        assert min(vertices @ normal) == pytest.approx(-expected)
    volume = sum(abs(np.linalg.det(generators[list(ids)])) for ids in combinations(range(len(generators)), 3))
    assert model['measure']['content'] == pytest.approx(volume)
    for a, b in model['edges']:
        assert np.linalg.norm(vertices[b] - vertices[a]) == pytest.approx(length)
    sign_vectors = model['metadata']['zonohedron']['vertexSignVectors']
    assert len(sign_vectors) == len(vertices)
    assert np.allclose(np.array(sign_vectors) @ generators * .5, vertices)
    # Literal output faces must be centrally symmetric even for >4-sided zones.
    for face in model['faces']:
        points = vertices[face]
        center = points.mean(axis=0)
        assert len(points) % 2 == 0
        for point in points:
            assert min(np.linalg.norm(points - (2 * center - point), axis=1)) < 1e-8 * length
    assert len(model['vertices']) - len(model['edges']) + len(model['faces']) == 2


def test_orthogonal_cube_independent_vertices_volume_and_native_boundary():
    source = deepcopy(AXES)
    model = zonohedron(source)
    assert counts(model) == (8, 12, 6, 0)
    assert {tuple(p) for p in model['vertices']} == set(product((-.5, .5), repeat=3))
    assert model['measure']['boundaryMeasure'] == pytest.approx(6)
    independent_supports(model, AXES)
    assert source == AXES
    assert model['numeric']['certified'] is False
    assert model['metadata']['zonohedron']['classification']['status'] == 'passed'
    assert verify_zonohedron_evidence(model)['passed']


def test_skew_parallelepiped_and_diagonal_generator_independent_support_formula():
    skew = [[1, 0, 0], [1, 1, 0], [0, 0, 1]]
    model = zonohedron(skew)
    assert counts(model) == (8, 12, 6, 0)
    assert model['measure']['content'] == pytest.approx(1 / math.sqrt(2))
    independent_supports(model, skew)
    four = AXES + [[1, 1, 1]]
    model = zonohedron(four)
    assert counts(model) == (14, 24, 12, 0)
    assert model['measure']['content'] == pytest.approx(1 + math.sqrt(3))
    independent_supports(model, four)


def test_exact_antipodal_dedup_unequal_source_radii_and_first_zone_order():
    directions = [[2, 0, 0], [-7, 0, 0], [0, 9, 0], [0, -3, 0], [0, 0, .25], [0, 0, 4], [1, 1, 1]]
    model = zonohedron(directions, max_zones=3)
    e = model['metadata']['zonohedron']
    assert e['distinctZoneCount'] == 4
    assert [g['sourceDirectionIds'] for g in e['selectedZones']] == [[0, 1], [2, 3], [4, 5]]
    assert counts(model) == (8, 12, 6, 0)
    assert model['vertices'] == zonohedron(AXES)['vertices']
    assert e['sourceDirections'] == directions
    assert e['signSumsEnumerated'] == 8
    directions[0][0] = 99
    assert e['sourceDirections'][0][0] == 2


@pytest.mark.parametrize('length', [1e-6, .25, 7, 1e6])
def test_scale_covariance_at_declared_bounds(length):
    model = zonohedron(AXES, edge_length=length)
    independent_supports(model, AXES, length)
    assert model['measure']['boundaryMeasure'] == pytest.approx(6 * length**2)


@pytest.mark.parametrize('directions', [None, (), [], AXES * 22, [[0, 0, 0]] + AXES,
    [[1, 0], *AXES], [[True, 0, 0], *AXES], [[float('nan'), 0, 0], *AXES],
    [[float('inf'), 0, 0], *AXES], [[10**1000, 0, 0], *AXES],
    [[1, 0, 0], [0, 1, 0], [1, 1, 0]],
    AXES + [[1, 1e-8, 0]], [[1, 0, 0], [0, 1, 0], [1, 1, 1e-8]]])
def test_malformed_singular_or_nearparallel_generators_refused(directions):
    with pytest.raises(GeometryError):
        zonohedron(directions)


@pytest.mark.parametrize('length', [True, None, '1', 0, -1, 1e-7, 1e7, float('nan'), float('inf'), 10**1000])
def test_invalid_edge_length_refused(length):
    with pytest.raises(GeometryError):
        zonohedron(AXES, edge_length=length)


@pytest.mark.parametrize('maximum', [True, 0, -1, 2, 13, 3.0, '3'])
def test_invalid_or_low_rank_prefix_refused(maximum):
    with pytest.raises(GeometryError):
        zonohedron(AXES, max_zones=maximum)


def test_full_evidence_tamper_deterministic_identity_and_json_roundtrip():
    model = zonohedron(AXES + [[1, 1, 1]])
    assert model == zonohedron(AXES + [[1, 1, 1]])
    assert verify_zonohedron_evidence(json.loads(json.dumps(model)))['passed']
    for change in [lambda m: m['vertices'][0].__setitem__(0, 99),
                   lambda m: m['faces'][0].reverse(),
                   lambda m: m['metadata']['zonohedron']['edgeZoneIds'].__setitem__(0, 99),
                   lambda m: m['metadata']['zonohedron'].__setitem__('edgeLength', 2),
                   lambda m: m.__setitem__('id', 'forged'),
                   lambda m: m['numeric'].__setitem__('certified', True)]:
        broken = deepcopy(model)
        change(broken)
        with pytest.raises(GeometryError):
            verify_zonohedron_evidence(broken)


def test_full_zone_budget_and_allocation_refusal_before_sign_sum_enumeration():
    directions = [[1, i, i*i + 1] for i in range(12)]
    model = zonohedron(directions)
    assert model['metadata']['zonohedron']['signSumsEnumerated'] == 4096
    independent_supports(model, directions)
    with pytest.raises(GeometryError, match='3 to 12'):
        zonohedron(directions + [[0, 1, 0]])
    small = zonohedron(directions + [[0, 1, 0]], max_zones=3)
    assert small['metadata']['zonohedron']['signSumsEnumerated'] == 8


def test_evidence_guard_rejects_cycles_deep_data_and_unknown_versions():
    model = zonohedron(AXES)
    broken = deepcopy(model)
    broken['metadata']['cycle'] = broken
    with pytest.raises(GeometryError):
        verify_zonohedron_evidence(broken)
    broken = deepcopy(model)
    node = broken['metadata']
    for _ in range(70):
        node['nested'] = {}
        node = node['nested']
    with pytest.raises(GeometryError):
        verify_zonohedron_evidence(broken)
    broken = deepcopy(model)
    broken['metadata']['zonohedron']['algorithmVersion'] = 'future-version'
    with pytest.raises(GeometryError, match='Unknown'):
        verify_zonohedron_evidence(broken)
