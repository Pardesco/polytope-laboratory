"""Native source/history/project boundaries for ordered star products."""
from copy import deepcopy
import json
import math

import pytest

from engine.formats import validate_project
from engine.geometry import GeometryError
from engine.history import canonical_model
from engine.server import dispatch


def source_document(symbol='6/-2'):
    polygon = dispatch({'op': 'generate', 'params': {
        'kind': 'regular-star-polygon', 'symbol': symbol, 'radius': 2}})
    return {'id': 'source', 'cursor': 0, 'states': [{'model': polygon,
        'view': {'sectionNormal': [0, 1], 'sectionOffset': .5,
                 'derivedMode': 'dual', 'entity': 3, 'coordinateUnit': 'mm',
                 'surfaceOpacity': .6, 'camera': {'position': [1, 1, 1]},
                 'net': {'root': 99}, 'foldFraction': .8,
                 'explosionAmount': .5}, 'notes': 'signed literal retained'}]}


def prism(document, height):
    return dispatch({'op': 'recipe-run', 'params': {'document': document,
        'operation': 'polygon-prism', 'parameters': {'height': height}}})


@pytest.mark.parametrize('symbol,counts', [('5/2', [10, 15, 7, 0]),
    ('5/3', [10, 15, 7, 0]), ('6/-2', [12, 18, 10, 0])])
def test_prism_actual_recipe_project_replay_and_height_branch(symbol, counts):
    source = source_document(symbol); before = deepcopy(source)
    result = prism(source, 3)
    assert source == before
    current = result['states'][1]; model = current['model']
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == counts
    assert model['interpretation'] == 'generalized-complex'
    for i, point in enumerate(source['states'][0]['model']['vertices']):
        assert model['vertices'][i] == point + [-1.5]
        assert model['vertices'][i+len(source['states'][0]['model']['vertices'])] == point + [1.5]
    assert current['notes'] == source['states'][0]['notes']
    assert current['view']['sectionNormal'] == [0, 0, 1]
    assert current['view']['derivedMode'] == 'section'
    assert current['view']['sectionOffset'] == current['view']['entity'] == 0
    assert current['view']['coordinateUnit'] == 'mm'
    assert current['view']['surfaceOpacity'] == .6
    assert not ({'net', 'camera', 'foldFraction', 'explosionAmount'} & current['view'].keys())
    graph = result['operationHistory']
    assert graph['nodes'][-1]['op'] == 'polygon-prism'
    assert graph['nodes'][-1]['algorithmVersion'] == '0.2.0'
    project = validate_project(json.loads(json.dumps({'format': 'polytope-laboratory',
        'version': 1, 'active': 0, 'documents': [result]})))
    reopened = project['documents'][0]
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': reopened}})
    assert canonical_model(replay['states'][0]['model']) == canonical_model(model)
    replay_model = replay['states'][0]['model']
    replay_info = deepcopy(replay_model['metadata']['orderedProduct'])
    result_info = deepcopy(model['metadata']['orderedProduct'])
    assert replay_info.pop('resultSourceModelId') == replay_model['id']
    assert result_info.pop('resultSourceModelId') == model['id']
    assert replay_info == result_info
    branch = dispatch({'op': 'recipe-branch', 'params': {
        'document': reopened, 'parameters': {'height': 5}}})
    assert set(p[2] for p in branch['states'][-1]['model']['vertices']) == {-2.5, 2.5}
    assert canonical_model(branch['states'][0]['model']) == canonical_model(source['states'][0]['model'])
    assert reopened['states'][1]['model']['vertices'] == model['vertices']
    # Native undo cursor returns the complete original polygon, then redo the prism.
    reopened['cursor'] = 0
    assert reopened['states'][reopened['cursor']]['model']['faces'] == source['states'][0]['model']['faces']
    reopened['cursor'] = 1
    assert reopened['states'][reopened['cursor']]['model']['faces'] == model['faces']


@pytest.mark.parametrize('height', [0, -1, True, math.inf, 1e101])
def test_refused_recipe_is_atomic_and_following_valid_dispatch_succeeds(height):
    source = source_document(); before = deepcopy(source)
    with pytest.raises(GeometryError):
        prism(source, height)
    assert source == before
    assert len(prism(source, 1)['states']) == 2


def test_four_dimensional_product_roundtrip_keeps_literal_factor_snapshots():
    model = dispatch({'op': 'generate', 'params': {'kind': 'polygon-product',
        'left': {'symbol': '6/-2', 'radius': 2},
        'right': {'symbol': '5/3', 'radius': 1}}})
    original = deepcopy(model)
    project = validate_project(json.loads(json.dumps({'format': 'polytope-laboratory',
        'version': 1, 'active': 0, 'documents': [{'cursor': 0,
        'states': [{'model': model, 'view': {'coordinateUnit': 'mm'}}]}]})))
    reopened = project['documents'][0]['states'][0]['model']
    assert [len(reopened[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == [30, 60, 46, 16]
    assert canonical_model(reopened) == canonical_model(original)
    assert reopened['metadata']['orderedProduct'] == original['metadata']['orderedProduct']
    assert reopened['provenance']['generator']['parameters']['left']['symbol'] == '6/-2'
