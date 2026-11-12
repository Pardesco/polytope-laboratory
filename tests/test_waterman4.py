from collections import Counter
from copy import deepcopy
from fractions import Fraction
from itertools import product
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.geometry import GeometryError, canonical_cycle, identity
from engine.history import create_history, record_source, record_operation, replay_history, canonical_model
from engine.server import dispatch

REFERENCE = json.loads((Path(__file__).parent / 'fixtures/waterman4-reference.json').read_text())['cases']


def generate(**params):
    return dispatch({'op': 'generate', 'params': {'kind': 'waterman-4d', **params}})


def info(model):
    return model['metadata']['waterman4']


def counts(model):
    return [len(model[key]) for key in ('vertices', 'edges', 'faces', 'cells')]


def state(model):
    return {'model': model, 'view': {'coordinateUnit': 'mm'}, 'notes': 'Exact lattice selection; numerical hull.'}


@pytest.mark.parametrize('case', REFERENCE, ids=lambda case: case['id'])
def test_independent_analytic_full_incidence_and_metric_reference(case):
    model = generate(**case['parameters'])
    data = info(model)
    assert counts(model) == case['counts']
    assert model['vertices'] == case['vertices']
    assert model['edges'] == case['edges']
    assert {canonical_cycle(f) for f in model['faces']} == {canonical_cycle(f) for f in case['faces']}
    cell_keys = lambda m: {frozenset(canonical_cycle(m['faces'][i]) for i in cell) for cell in m['cells']}
    assert cell_keys(model) == cell_keys(case)
    assert data['selectedPointCount'] == case['selectedSiteCount']
    assert model['measure']['content'] == pytest.approx(float(Fraction(case['fourVolume'])))
    cloud = np.asarray(model['vertices'])
    planes = np.asarray(case['supportPlanes'])
    residuals = cloud @ planes[:, :4].T - planes[:, 4]
    assert np.max(residuals) <= 0
    expected_facets = {tuple(np.flatnonzero(row == 0)) for row in residuals.T}
    assert {tuple(f) for f in model['facetVertices']} == expected_facets
    assert Counter(f for cell in model['cells'] for f in cell) == Counter({i: 2 for i in range(len(model['faces']))})
    for cell in model['cells']:
        links = Counter(
            tuple(sorted((a, b)))
            for f in cell
            for a, b in zip(model['faces'][f], model['faces'][f][1:] + model['faces'][f][:1])
        )
        assert set(links.values()) == {2}
    assert model['interpretation'] == 'convex-polytope' and not model['numeric']['certified']
    assert data['selectionCertificate']['certified'] and data['selectionCertificate']['exhausted']
    assert data['hullResiduals']['maximumOutsideSupportResidual'] < 1e-12
    assert data['hullResiduals']['maximumFacetPlanarityResidual'] < 1e-12
    assert data['sourceFingerprint'] == identity(model)


@pytest.mark.parametrize(
    'lattice,center,radius',
    [
        ('Z4', ['0'] * 4, '1'),
        ('D4', ['0'] * 4, '2'),
        ('Z4', ['1/2'] * 4, '1'),
        ('D4', ['1/2'] * 4, '1'),
        ('Z4', ['-1/2', '1/3', '0', '0'], '3'),
        ('D4', ['1', '0', '0', '0'], '1'),
    ],
)
def test_exact_sites_match_independent_fraction_exhaustion(lattice, center, radius):
    model = generate(lattice=lattice, center=center, radius_squared=radius)
    data = info(model)
    origin = list(map(Fraction, center))
    threshold = Fraction(radius)
    sites = [
        list(point)
        for point in product(range(-3, 4), repeat=4)
        if (lattice == 'Z4' or sum(point) % 2 == 0) and sum((p - c) ** 2 for p, c in zip(point, origin)) <= threshold
    ]
    assert data['sourceSnapshot']['coordinates'] == sites
    certificate = data['selectionCertificate']
    distances = [sum((p - c) ** 2 for p, c in zip(point, origin)) for point in sites]
    assert certificate['selectedSquaredDistances'] == list(map(str, distances))
    assert certificate['boundarySelectedPointIds'] == [i for i, d in enumerate(distances) if d == threshold]
    for output, selected in enumerate(data['outputVertexToSelectedPoint']):
        assert model['vertices'][output] == sites[selected]
        assert data['selectedPointToOutputVertex'][selected] == output


def test_exact_threshold_neighbors_and_sequence_keep_repeated_hulls():
    below = generate(
        lattice='Z4',
        radius_squared='19999999999999999999999999999999999999999/10000000000000000000000000000000000000000',
    )
    on = generate(lattice='Z4', radius_squared='2')
    above = generate(lattice='Z4', radius_squared='9/4')
    assert counts(below) == [8, 24, 32, 16] and counts(on) == [24, 96, 96, 24]
    assert identity(on) == identity(above)
    assert info(on)['sourceSnapshot']['radiusSquared'] != info(above)['sourceSnapshot']['radiusSquared']
    assert info(on)['selectionCertificate']['boundarySelectedPointIds']
    assert not info(above)['selectionCertificate']['boundarySelectedPointIds']
    for radius, expected in [('1', [8, 24, 32, 16]), ('2', [24, 96, 96, 24]), ('1', [8, 24, 32, 16])]:
        assert counts(generate(lattice='Z4', radius_squared=radius)) == expected


@pytest.mark.parametrize('case', REFERENCE, ids=lambda case: case['id'])
def test_generate_save_reopen_undo_redo_cursor_and_history_replay(case, tmp_path):
    parameters = {'kind': 'waterman-4d', **case['parameters']}
    before = deepcopy(parameters)
    source = state(dispatch({'op': 'generate', 'params': parameters}))
    graph = record_source(create_history(), 'source', source)
    generated = state(dispatch({'op': 'generate', 'params': parameters}))
    graph = record_operation(graph, 'generated', 'source', 'generate', parameters, generated)
    scaled = state(dispatch({'op': 'transform', 'model': generated['model'], 'params': {'scale': 2}}))
    graph = record_operation(graph, 'scaled', 'generated', 'transform', {'scale': 2}, scaled)
    graph = graph.to_dict()
    states = [
        {**value, 'operationNode': node}
        for value, node in [(source, 'source'), (generated, 'generated'), (scaled, 'scaled')]
    ]
    document = {'id': 'waterman4', 'cursor': 2, 'states': states, 'operationHistory': graph}
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [document]}
    path = tmp_path / 'waterman4.polytope'
    for cursor in (2, 1, 2):
        document['cursor'] = cursor
        dispatch({'op': 'save', 'params': {'path': str(path), 'project': project}})
        reopened = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]
        assert reopened['cursor'] == cursor
        assert reopened['states'][1]['model']['metadata'] == generated['model']['metadata']
        assert reopened['states'][1]['model']['provenance'] == generated['model']['provenance']
        replayed = replay_history(reopened['operationHistory'], dispatch)
        assert canonical_model(replayed['generated']['model']) == canonical_model(generated['model'])
        assert canonical_model(replayed['scaled']['model']) == canonical_model(scaled['model'])
    assert parameters == before


@pytest.mark.parametrize(
    'parameters,message',
    [
        ({'radius_squared': 0}, 'positive'),
        ({'radius_squared': 65}, '64'),
        ({'radius_squared': 2.0}, 'floats'),
        ({'radius_squared': True}, 'booleans'),
        ({'radius_squared': '1/0'}, 'positive.*denominator'),
        ({'radius_squared': '1/' + '9' * 100}, '256-bit'),
        ({'radius_squared': '1' * 257}, '256 characters'),
        ({'center': [0, 0, 0]}, 'four rational'),
        ({'center': [0, 0, 0, 0.0]}, 'floats'),
        ({'center': [0, 0, 0, 1001]}, 'coordinate bound'),
        ({'lattice': 'FCC'}, 'Z4'),
        ({'lattice': True}, 'Z4'),
        ({'dimension': 3}, 'Unknown'),
        ({'radius_squared': 64}, 'inspected-site'),
        ({'lattice': 'Z4', 'radius_squared': 16}, 'selected-point'),
        ({'lattice': 'D4', 'radius_squared': 1}, 'fewer than five'),
        ({'lattice': 'Z4', 'radius_squared': '1/4', 'center': ['1/2', 0, 0, 0]}, 'fewer than five'),
    ],
)
def test_unsupported_domains_refuse_atomically(parameters, message):
    before = deepcopy(parameters)
    with pytest.raises(GeometryError, match=message):
        generate(**parameters)
    assert parameters == before


def test_affine_dimension_and_origin_denominator_limits_are_explicit():
    with pytest.raises(GeometryError, match='affine dimension'):
        generate(lattice='Z4', radius_squared='3/4', center=['1/2', '1/2', '1/2', 0])
    with pytest.raises(GeometryError, match='common denominator'):
        generate(center=['1/' + str(2**251), '1/' + str(3**159), '1/' + str(5**109), '0'])


def test_output_bound_refuses_without_repairing_or_mutating_input(monkeypatch):
    monkeypatch.setattr('engine.waterman4.MAX_OUTPUT_VERTICES', 7)
    with pytest.raises(GeometryError, match='output vertex'):
        generate(lattice='Z4', radius_squared=1)


def test_real_json_lines_dispatch_preserves_4d_choice_and_refusal():
    requests = [
        {'id': i, 'op': 'generate', 'params': {'kind': 'waterman-4d', **parameters}}
        for i, parameters in enumerate(
            [{'lattice': 'D4', 'radius_squared': '2'}, {'dimension': 3}, {'lattice': 'Z4', 'radius_squared': '1'}]
        )
    ]
    completed = subprocess.run(
        [sys.executable, '-B', '-u', 'engine/server.py'],
        input=''.join(json.dumps(r) + '\n' for r in requests),
        text=True,
        capture_output=True,
        check=True,
        timeout=30,
        cwd=Path(__file__).parents[1],
    )
    replies = [json.loads(line) for line in completed.stdout.splitlines()]
    assert [r['id'] for r in replies] == [0, 1, 2] and [r['ok'] for r in replies] == [True, False, True]
    assert counts(replies[0]['result']) == [24, 96, 96, 24] and counts(replies[2]['result']) == [8, 24, 32, 16]
    assert 'Unknown 4D Waterman parameters' in replies[1]['error']
    assert completed.stderr == ''
