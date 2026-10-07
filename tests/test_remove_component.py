"""Independent current-leaf removal with literal fixture incidence."""
from copy import deepcopy
from itertools import product
import json

import pytest

import engine.compounds as compounds
from engine.compounds import add_models, extract_component, remove_component, retrieve_source
from engine.geometry import GeometryError, identity, validate


def fixture(dimension, shift=0):
    if dimension == 2:
        vertices = [[0, 0], [1, 0], [1, 1], [0, 1]]
        faces, cells = [[0, 1, 2, 3]], []
    elif dimension == 3:
        vertices = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
        faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
                 [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
        cells = []
    else:
        vertices = [list(p) for p in product((0, 1), repeat=4)]
        vertex_ids = {tuple(p): i for i, p in enumerate(vertices)}
        faces, fixed_faces = [], []
        for a in range(4):
            for b in range(a+1, 4):
                fixed = [d for d in range(4) if d not in (a, b)]
                for values in product((0, 1), repeat=2):
                    cycle = []
                    for x, y in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        point = [0]*4
                        point[a], point[b] = x, y
                        for d, value in zip(fixed, values):
                            point[d] = value
                        cycle.append(vertex_ids[tuple(point)])
                    faces.append(cycle)
                    fixed_faces.append(dict(zip(fixed, values)))
        cells = [[i for i, fixed in enumerate(fixed_faces) if fixed.get(d) == value]
                 for d in range(4) for value in (0, 1)]
    vertices = [[p[0]+shift]+p[1:] for p in vertices]
    edges = sorted({tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:]+face[:1])})
    result = {'id': f'fixture-{dimension}-{shift}', 'name': f'{dimension}D literal {shift}',
              'dimension': dimension, 'embeddingDimension': dimension, 'interpretation': 'generalized-complex',
              'vertices': vertices, 'edges': [list(edge) for edge in edges], 'faces': faces, 'cells': cells,
              'metadata': {'attribute': f'source-{shift}'}, 'numeric': {'certified': False}}
    assert validate(result)['passed']
    return result


@pytest.mark.parametrize('dimension,counts', [(2, (4, 4, 1, 0)), (3, (8, 12, 6, 0)), (4, (16, 32, 24, 8))])
@pytest.mark.parametrize('removed_index', [0, 1])
def test_remove_one_leaf_preserves_remaining_literal_incidence_and_component_id(dimension, counts, removed_index):
    sources = [fixture(dimension), fixture(dimension, 3)]
    pair = add_models(*sources)
    original = deepcopy(pair)
    keep_index = 1-removed_index
    result = remove_component(pair, pair['components'][removed_index]['id'])
    assert tuple(len(result[k]) for k in compounds.KINDS) == counts
    for kind in compounds.KINDS:
        assert result[kind] == sources[keep_index][kind]
    assert len(result['components']) == 1
    assert result['components'][0]['id'] == pair['components'][keep_index]['id']
    assert result['components'][0]['sourcePath'] == pair['components'][keep_index]['sourcePath']
    assert identity(extract_component(result, result['components'][0]['id'])) == identity(sources[keep_index])
    assert result['validation']['passed'] and 'measure' not in result and 'facetEquations' not in result
    assert result['metadata']['compoundComponentEditing']['sourceModel'] == pair
    assert pair == original


@pytest.mark.parametrize('dimension', [2, 3, 4])
def test_nested_middle_leaf_removal_retains_both_other_current_leaf_maps(dimension):
    sources = [fixture(dimension, shift) for shift in (0, 3, 6)]
    source = add_models(add_models(sources[0], sources[1]), sources[2])
    # Change current geometry after addition; historical snapshots must stay historical.
    source['vertices'] = [[p[0]+10]+p[1:] for p in source['vertices']]
    original = deepcopy(source)
    result = remove_component(source, source['components'][1]['id'])
    assert [c['id'] for c in result['components']] == [source['components'][i]['id'] for i in (0, 2)]
    assert [c['sourceModelId'] for c in result['components']] == [sources[i]['id'] for i in (0, 2)]
    for component, leaf in zip(result['components'], (sources[0], sources[2])):
        extracted = extract_component(result, component['id'])
        assert extracted['vertices'] == [[p[0]+10]+p[1:] for p in leaf['vertices']]
        for kind in ('edges', 'faces', 'cells'):
            assert extracted[kind] == leaf[kind]
        assert extracted['metadata'] == leaf['metadata']
    assert source == original
    assert retrieve_source(result, 0) == original['metadata']['compound']['sourceModels'][0]


def test_deleted_color_slots_and_all_source_maps_correct_for_4d_nested_removal():
    leaves = [fixture(4, shift) for shift in (0, 3, 6)]
    colors = [{'encoding': 'byte', 'values': [20+i, 40, 60, 128]} for i in range(3)]
    for leaf, color in zip(leaves, colors):
        leaf['metadata']['offColors'] = {'faces': [color]*24, 'cells': [color]*8}
    source = add_models(add_models(leaves[0], leaves[1]), leaves[2])
    result = remove_component(source, source['components'][1]['id'])
    assert result['metadata']['offColors'] == {'faces': [colors[0]]*24+[colors[2]]*24,
                                             'cells': [colors[0]]*8+[colors[2]]*8}
    maps = result['metadata']['compoundComponentEditing']['sourceMaps']
    for kind, size in zip(compounds.KINDS, (16, 32, 24, 8)):
        assert maps[kind] == list(range(size))+[None]*size+list(range(size, size*2))
        assert result['metadata']['compound']['inputs'][0]['maps'][kind] == list(range(size))+[None]*size
        assert result['metadata']['compound']['inputs'][1]['maps'][kind] == list(range(size, size*2))


def test_owned_isolated_points_and_wires_survive_only_with_remaining_leaf():
    a, b = fixture(3), fixture(3, 3)
    for leaf in (a, b):
        offset = len(leaf['vertices'])
        leaf['vertices'] += [[10, 10, 10], [11, 10, 10], [12, 12, 12]]
        leaf['edges'].append([offset, offset+1])
    source = add_models(a, b)
    result = remove_component(source, source['components'][0]['id'])
    assert result['vertices'] == b['vertices'] and result['edges'] == b['edges']
    assert len(result['vertices']) == 11 and len(result['edges']) == 13
    assert result['components'][0]['maps']['vertices'] == list(range(11))


def test_coincident_components_remain_distinct_and_only_selected_leaf_is_removed():
    leaf = fixture(3)
    source = add_models(add_models(leaf, leaf), leaf)
    result = remove_component(source, source['components'][1]['id'])
    assert len(result['vertices']) == 16 and len(result['faces']) == 12
    assert len(result['components']) == 2
    assert result['vertices'][:8] == result['vertices'][8:] == leaf['vertices']


def test_repeated_removal_and_new_addition_preserve_nested_extraction_paths():
    leaves = [fixture(2, shift) for shift in (0, 3, 6)]
    source = add_models(add_models(leaves[0], leaves[1]), leaves[2])
    first = remove_component(source, source['components'][1]['id'])
    second = remove_component(first, source['components'][0]['id'])
    assert second['vertices'] == leaves[2]['vertices']
    assert second['metadata']['compound']['inputs'][0]['maps']['vertices'] == [None]*8
    extended = add_models(second, fixture(2, 9))
    extracted = extract_component(extended, extended['components'][0]['id'])
    assert identity(extracted) == identity(leaves[2])
    restored = json.loads(json.dumps(second))
    assert identity(extract_component(restored, restored['components'][0]['id'])) == identity(leaves[2])
    with pytest.raises(GeometryError, match='last compound component'):
        remove_component(second, second['components'][0]['id'])


@pytest.mark.parametrize('component_id', [None, True, 0, 'missing'])
def test_invalid_ids_and_plain_models_cannot_remove_an_implicit_component(component_id):
    source = add_models(fixture(3), fixture(3, 3))
    with pytest.raises(GeometryError, match='component ID'):
        remove_component(source, component_id)
    with pytest.raises(GeometryError, match='component ID'):
        remove_component(fixture(3), component_id)


def test_stale_component_maps_and_historical_input_maps_are_rejected():
    source = add_models(fixture(3), fixture(3, 3))
    source['components'][0]['maps']['faces'].pop()
    with pytest.raises(GeometryError, match='partition'):
        remove_component(source, source['components'][0]['id'])
    source = add_models(fixture(3), fixture(3, 3))
    source['metadata']['compound']['inputs'][0]['maps']['vertices'][0] = 999
    with pytest.raises(GeometryError, match='stale'):
        remove_component(source, source['components'][0]['id'])


def test_full_history_payload_budget_and_no_output_aliases(monkeypatch):
    source = add_models(fixture(3), fixture(3, 3))
    original = deepcopy(source)
    result = remove_component(source, source['components'][0]['id'])
    result['vertices'][0][0] = 900
    result['metadata']['compoundComponentEditing']['sourceModel']['vertices'][0][0] = 500
    result['components'][0]['maps']['vertices'].pop()
    assert source == original
    monkeypatch.setattr(compounds, 'MAX_PAYLOAD_BYTES', compounds._payload_size(source)+100)
    with pytest.raises(GeometryError, match='result payload resource'):
        remove_component(source, source['components'][0]['id'])
