"""Actual unequal-ring dispatch, persistence and 4D history boundaries."""
from copy import deepcopy
import json
import pytest

from engine.geometry import GeometryError
from engine.history import canonical_model
from engine.server import dispatch


def generate(kind, **parameters):
    return dispatch({'op': 'generate', 'params': {'kind': kind, **parameters}})


def project(model):
    return {'format': 'polytope-laboratory', 'version': 1, 'active': 0,
            'documents': [{'id': 'unequal-ring-source', 'cursor': 0, 'states': [
                {'model': model, 'view': {'coordinateUnit': 'mm', 'sectionNormal': [0, 0, 1]},
                 'notes': 'Retained unequal-ring source'}]}]}


@pytest.mark.parametrize('kind', ['rational-podium', 'rational-antipodium'])
@pytest.mark.parametrize('sizing', ['radius', 'edge'])
@pytest.mark.parametrize('elevation', ['height', 'side_edge'])
def test_four_modes_actual_generate_save_and_reopen(kind, sizing, elevation, tmp_path):
    params = {'symbol': '6/-2', 'base_'+sizing: 2, 'top_'+sizing: 1, elevation: 5}
    rgba = {'encoding': 'unit', 'values': [.2, .4, .8, .25]}
    params['cap_colors'] = [rgba, {'encoding': 'byte', 'values': [9, 64, 255, 128]}]
    request = {'op': 'generate', 'params': {'kind': kind, **params}}
    before = deepcopy(request)
    model = dispatch(request)
    key = 'rationalPodium' if kind == 'rational-podium' else 'rationalAntipodium'
    info = model['metadata'][key]
    assert info['sourceModels'][0]['metadata']['regularStarPolygon']['symbol'] == '6/-2'
    assert info['sourceModels'][1]['metadata']['regularStarPolygon']['symbol'] == '6/-2'
    assert model['provenance']['generator'] == {'kind': kind, 'parameters': params}
    assert model['numeric']['certified'] is False
    snapshot = deepcopy(model)
    file = str(tmp_path/'unequal-rings.polyproj')
    dispatch({'op': 'save', 'params': {'path': file, 'project': project(model)}})
    restored = dispatch({'op': 'load', 'params': {'path': file}})['project']['documents'][0]['states'][0]['model']
    assert canonical_model(restored) == canonical_model(snapshot)
    assert restored['metadata'] == snapshot['metadata'] and restored['provenance'] == snapshot['provenance']
    assert model == snapshot and request == before


@pytest.mark.parametrize('kind', ['rational-podium', 'rational-antipodium'])
def test_literal_unequal_rings_survive_real_prism_history_replay_branch(kind):
    model = generate(kind, symbol='5/2', base_radius=2, top_radius=1, height=3)
    doc = project(model)['documents'][0]
    original = deepcopy(doc)
    lifted = dispatch({'op': 'recipe-run', 'params': {'document': doc,
        'operation': 'polyhedron-prism', 'parameters': {'height': 2}}})
    result = lifted['states'][-1]['model']
    assert result['interpretation'] == 'generalized-complex'
    assert result['vertices'] == [p+[w] for w in [-1, 1] for p in model['vertices']]
    assert result['metadata']['polyhedronPrism']['sourceModel'] == model
    checked = dispatch({'op': 'validate-project', 'params': {'project': json.loads(json.dumps(
        {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [lifted]}, allow_nan=False))}})['documents'][0]
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': checked}})
    assert canonical_model(replayed['states'][0]['model']) == canonical_model(result)
    branched = dispatch({'op': 'recipe-branch', 'params': {'document': checked, 'parameters': {'height': 4}}})
    assert {p[3] for p in branched['states'][-1]['model']['vertices']} == {-2, 2}
    assert branched['states'][-1]['model']['metadata']['polyhedronPrism']['sourceModel'] == model
    assert doc == original


@pytest.mark.parametrize('params', [{'unknown': 1}, {'base_radius': 2},
    {'base_radius': 2, 'top_radius': 1, 'base_edge': 1, 'height': 1},
    {'base_radius': 2, 'top_radius': 1, 'side_edge': .5},
    {'base_radius': 2, 'top_radius': 1, 'height': True},
    {'base_radius': 10**500, 'top_radius': 1, 'height': 1}])
def test_invalid_native_requests_are_atomic_and_next_valid_request_succeeds(params):
    request = {'op': 'generate', 'params': {'kind': 'rational-podium', **params}}
    before = deepcopy(request)
    with pytest.raises(GeometryError):
        dispatch(request)
    assert request == before
    assert len(generate('rational-podium', base_radius=1, top_radius=1, height=1)['vertices']) == 6
