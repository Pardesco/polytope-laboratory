"""Independent regular simplex/cross-polytope and step-inverse checks."""
from copy import deepcopy
from itertools import combinations
import json
import math

import numpy as np
import pytest

from engine.formats import validate_project
from engine.geometry import GeometryError, validate
from engine.step_prisms import step_prism


def counts(model):
    return [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')]


def test_five_two_is_complete_regular_simplex_with_independent_gram_and_incidence():
    model = step_prism(5, 2)
    assert counts(model) == [5, 10, 10, 5]
    points = np.asarray(model['vertices'])
    gram = points @ points.T
    np.testing.assert_allclose(gram, 2.5*np.eye(5)-.5*np.ones((5, 5)), atol=1e-14)
    assert {frozenset(e) for e in model['edges']} == {frozenset(e) for e in combinations(range(5), 2)}
    assert {frozenset(f) for f in model['faces']} == {frozenset(f) for f in combinations(range(5), 3)}
    assert {frozenset(v for f in c for v in model['faces'][f]) for c in model['cells']} == {frozenset(c) for c in combinations(range(5), 4)}
    assert model['interpretation'] == 'convex-polytope'
    assert model['numeric']['certified'] is False
    assert validate(model)['passed']


def test_eight_three_is_complete_cross_polytope_with_four_antipodal_pairs():
    model = step_prism(8, 3)
    assert counts(model) == [8, 24, 32, 16]
    points = np.asarray(model['vertices']); gram = points @ points.T
    for i in range(8):
        for j in range(8):
            assert gram[i, j] == pytest.approx(2 if i == j else -2 if j == (i+4) % 8 else 0, abs=1e-14)
    def valid(ids):return all((i+4) % 8 not in ids for i in ids)
    assert {frozenset(e) for e in model['edges']} == {frozenset(e) for e in combinations(range(8), 2) if valid(e)}
    assert {frozenset(f) for f in model['faces']} == {frozenset(f) for f in combinations(range(8), 3) if valid(f)}
    assert {frozenset(v for f in c for v in model['faces'][f]) for c in model['cells']} == {frozenset(c) for c in combinations(range(8), 4) if valid(c)}


def test_inverse_steps_thirteen_two_and_six_preserve_full_metric_and_incidence():
    a, b = step_prism(13, 2), step_prism(13, 6)
    mapping = [(2*i) % 13 for i in range(13)]
    q = np.asarray(b['vertices'])[mapping]
    p = np.asarray(a['vertices'])
    np.testing.assert_allclose(q, p[:, [2, 3, 0, 1]]*[1, 1, 1, -1], atol=2e-14)
    for kind in ('edges', 'faces'):
        assert {frozenset(mapping[i] for i in row) for row in a[kind]} == {frozenset(row) for row in b[kind]}
    assert {frozenset(mapping[v] for f in c for v in a['faces'][f]) for c in a['cells']} == {frozenset(v for f in c for v in b['faces'][f]) for c in b['cells']}


def test_signed_step_retains_raw_parameters_and_reflects_second_factor():
    positive, negative = step_prism(7, 2), step_prism(7, -2)
    np.testing.assert_allclose(negative['vertices'], np.asarray(positive['vertices'])*[1, 1, 1, -1], atol=1e-14)
    assert negative['metadata']['stepPrism']['parameters']['step'] == -2
    assert negative['metadata']['stepPrism']['selectedFactorVertexIds'] == [[i, (-2*i) % 7] for i in range(7)]
    for kind in ('edges', 'faces'):
        assert {frozenset(row) for row in positive[kind]} == {frozenset(row) for row in negative[kind]}


def test_native_roundtrip_preserves_all_selected_vertex_ids_and_definition():
    model = step_prism(7, 2, 3); original = deepcopy(model)
    project = validate_project(json.loads(json.dumps({'format': 'polytope-laboratory',
        'version': 1, 'active': 0, 'documents': [{'cursor': 0, 'states': [{'model': model, 'view': {}}]}]})))
    restored = project['documents'][0]['states'][0]['model']
    assert counts(restored) == [7, 21, 28, 14]
    assert restored['vertices'] == original['vertices']
    assert restored['metadata']['stepPrism'] == original['metadata']['stepPrism']
    assert restored['metadata']['stepPrism']['certified'] is False
    assert restored['metadata']['stepPrism']['generatedSourceFingerprint'] == original['fingerprint']
    assert restored['metadata']['stepPrism']['generatedSourceModelId'] == original['id']


@pytest.mark.parametrize('n,step,radius', [(True,2,1),(4,2,1),(129,2,1),(5,True,1),
    (5,0,1),(5,5,1),(5,1,1),(5,-1,1),(6,3,1),
    (5,2,0),(5,2,True),(5,2,math.inf),(5,2,1e101),(5,2,1e-71),(5,2,1e71),(5,2,10**500)])
def test_unsupported_domain_is_diagnosed_before_a_result_escapes(n,step,radius):
    with pytest.raises(GeometryError):step_prism(n, step, radius)


@pytest.mark.parametrize('radius', [1e-70, 1e70])
def test_scale_endpoints_keep_finite_positive_measure_and_native_serialization(radius):
    model = step_prism(5, 2, radius)
    assert all(math.isfinite(model['measure'][key]) and model['measure'][key] > 0 for key in ('content', 'boundaryMeasure'))
    assert model['measure']['content']/radius**4 == pytest.approx(25*math.sqrt(5)/96)
    json.dumps(model, allow_nan=False)


@pytest.mark.parametrize('n,step', [(6, 2), (8, 2), (9, 3), (12, 4)])
def test_non_coprime_steps_preserve_all_source_vertices_and_full_rank(n,step):
    model = step_prism(n, step)
    assert len(model['vertices']) == n
    points = np.asarray(model['vertices'])
    # Discrete Fourier orthogonality gives four independent equal-norm columns
    # for these frequencies even though the second polygon wraps repeatedly.
    np.testing.assert_allclose(points.T @ points, n/2*np.eye(4), atol=2e-14)
    assert model['metadata']['stepPrism']['selectedFactorVertexIds'] == [[i, step*i % n] for i in range(n)]
    assert validate(model)['passed']
