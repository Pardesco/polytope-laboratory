"""Independent literal fixtures for disjoint compound incidence."""
from copy import deepcopy
from itertools import product
import json
import math

import pytest

import engine.compounds as compounds
from engine.compounds import add_models, extract_component, retrieve_source
from engine.geometry import GeometryError, identity, validate


CUBE_VERTICES = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                 [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
CUBE_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
              [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
CUBE_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6],
              [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]


def source(vertices, edges, faces, cells=None, dimension=None, name='Fixture', source_id='fixture'):
    model = {'id': source_id, 'name': name, 'dimension': dimension or len(vertices[0]),
             'embeddingDimension': len(vertices[0]), 'interpretation': 'generalized-complex',
             'vertices': deepcopy(vertices), 'edges': deepcopy(edges), 'faces': deepcopy(faces),
             'cells': deepcopy(cells or []), 'metadata': {'note': 'source metadata'},
             'numeric': {'mode': 'float64-approximate', 'certified': False},
             'provenance': {'operation': 'independent-fixture'}}
    assert validate(model)['passed']
    return model


def cube(shift=0, source_id='cube'):
    return source([[x+shift, y, z] for x, y, z in CUBE_VERTICES], CUBE_EDGES, CUBE_FACES, source_id=source_id)


def tesseract():
    vertices = [list(v) for v in product((0, 1), repeat=4)]
    ids = {tuple(v): i for i, v in enumerate(vertices)}
    edges = [[a, b] for a in range(16) for b in range(a+1, 16)
             if sum(x != y for x, y in zip(vertices[a], vertices[b])) == 1]
    faces, fixed_faces = [], []
    for first in range(4):
        for second in range(first+1, 4):
            fixed = [d for d in range(4) if d not in (first, second)]
            for values in product((0, 1), repeat=2):
                points = []
                for x, y in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    p = [0]*4
                    p[first], p[second] = x, y
                    for d, value in zip(fixed, values):
                        p[d] = value
                    points.append(ids[tuple(p)])
                faces.append(points)
                fixed_faces.append(dict(zip(fixed, values)))
    cells = [[i for i, fixed in enumerate(fixed_faces) if fixed.get(d) == value]
             for d in range(4) for value in (0, 1)]
    assert tuple(map(len, (vertices, edges, faces, cells))) == (16, 32, 24, 8)
    return source(vertices, edges, faces, cells, source_id='tesseract')


def star():
    vertices = [[math.cos(2*math.pi*i/5), math.sin(2*math.pi*i/5)] for i in range(5)]
    cycle = [0, 2, 4, 1, 3]
    edges = [[a, b] for a, b in zip(cycle, cycle[1:]+cycle[:1])]
    model = source(vertices, edges, [cycle], source_id='pentagram')
    model['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [1, 20, 240, 128]}], 'cells': []}
    return model


@pytest.mark.parametrize('shift', [0, 5.25])
def test_literal_cube_add_keeps_coincident_or_translated_incidence_distinct(shift):
    base, other = cube(), cube(shift)
    original = deepcopy([base, other])
    result = add_models(base, other)
    assert tuple(len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')) == (16, 24, 12, 0)
    assert result['vertices'] == base['vertices'] + other['vertices']
    assert result['edges'] == CUBE_EDGES + [[a+8, b+8] for a, b in CUBE_EDGES]
    assert result['faces'] == CUBE_FACES + [[v+8 for v in f] for f in CUBE_FACES]
    assert len(result['components']) == 2 and result['components'][0]['id'] != result['components'][1]['id']
    assert result['components'][0]['sourceModelId'] == result['components'][1]['sourceModelId'] == 'cube'
    assert result['interpretation'] == 'generalized-complex' and result['validation']['passed']
    assert 'measure' not in result and 'facetEquations' not in result and 'convexPieces' not in result
    assert [base, other] == original
    result['vertices'][0][0] = 999
    result['metadata']['compound']['sourceModels'][1]['metadata']['note'] = 'edited'
    assert [base, other] == original


def test_4d_full_incidence_cell_color_offsets_and_input_maps():
    a, b = tesseract(), tesseract()
    b['vertices'] = [[x+3, y, z, w] for x, y, z, w in b['vertices']]
    b['metadata']['offColors'] = {'faces': [None]*24, 'cells': [{'encoding': 'unit', 'values': [.1, .3, .9, .5]}]+[None]*7}
    result = add_models(a, b)
    assert tuple(len(result[k]) for k in ('vertices', 'edges', 'faces', 'cells')) == (32, 64, 48, 16)
    assert result['cells'][8:] == [[f+24 for f in c] for c in b['cells']]
    colors = result['metadata']['offColors']
    assert colors['cells'][:8] == [None]*8
    assert colors['cells'][8] == b['metadata']['offColors']['cells'][0]
    assert colors['faces'] == [None]*48
    mapped = result['metadata']['compound']['inputs'][1]['maps']
    assert mapped == {'vertices': list(range(16, 32)), 'edges': list(range(32, 64)),
                      'faces': list(range(24, 48)), 'cells': list(range(8, 16))}
    assert result['validation']['passed']


def test_2d_ordered_star_cycle_and_rgba_survive_add_extract_and_json():
    base, other = star(), star()
    other['metadata']['offColors']['faces'][0] = {'encoding': 'unit', 'values': [.2, .6, .4, .25]}
    result = add_models(base, other)
    assert result['faces'] == [[0, 2, 4, 1, 3], [5, 7, 9, 6, 8]]
    assert result['metadata']['offColors']['faces'] == base['metadata']['offColors']['faces'] + other['metadata']['offColors']['faces']
    restored = json.loads(json.dumps(result))
    extracted = extract_component(restored, restored['components'][1]['id'])
    assert extracted['vertices'] == other['vertices'] and extracted['faces'] == other['faces']
    assert extracted['edges'] == other['edges']
    assert extracted['metadata']['offColors'] == other['metadata']['offColors']
    assert extracted['provenance']['originalSourceModelId'] == 'pentagram'


def test_nested_components_are_retained_with_leaf_paths_and_source_ids():
    first, second, third = cube(source_id='first'), cube(3, 'second'), cube(6, 'third')
    pair = add_models(first, second)
    original = deepcopy(pair)
    result = add_models(pair, third)
    assert len(result['components']) == 3
    assert [c['sourceModelId'] for c in result['components']] == ['first', 'second', 'third']
    assert [c['sourcePath'] for c in result['components']] == [[0, 0], [0, 1], [1]]
    assert [c['sourceComponentId'] for c in result['components'][:2]] == [c['id'] for c in pair['components']]
    assert result['components'][2]['maps']['faces'] == list(range(12, 18))
    for component, original_source in zip(result['components'], (first, second, third)):
        retrieved = extract_component(result, component['id'])
        assert identity(retrieved) == identity(original_source)
        assert retrieved['metadata'] == original_source['metadata']
    assert retrieve_source(result, 0) == pair
    assert pair == original


def test_retrieval_returns_full_independent_source_and_current_extraction_geometry():
    base = cube()
    base['measure'] = {'content': 1, 'description': 'historical source field'}
    result = add_models(base, cube(2))
    saved = retrieve_source(result, 0)
    assert saved == base and saved['id'] == base['id']
    saved['vertices'][0][0] = 999
    assert retrieve_source(result, 0) == base
    result['vertices'] = [[x+10, y, z] for x, y, z in result['vertices']]
    extracted = extract_component(result, result['components'][0]['id'])
    assert extracted['vertices'] == [[x+10, y, z] for x, y, z in base['vertices']]
    assert 'measure' not in extracted and 'facetEquations' not in extracted
    assert retrieve_source(result, 0)['vertices'] == base['vertices']


def test_nested_added_side_offsets_all_leaf_maps_and_cell_sources():
    first, second, third = tesseract(), tesseract(), tesseract()
    first['id'], second['id'], third['id'] = 'first', 'second', 'third'
    pair = add_models(second, third)
    result = add_models(first, pair)
    assert [c['sourcePath'] for c in result['components']] == [[0], [1, 0], [1, 1]]
    assert [c['maps']['cells'] for c in result['components']] == [list(range(8)), list(range(8, 16)), list(range(16, 24))]
    for component, original in zip(result['components'], (first, second, third)):
        extracted = extract_component(result, component['id'])
        assert identity(extracted) == identity(original)
        assert extracted['provenance']['originalSourceModelId'] == original['id']


def test_embedding_is_retained_and_dimension_mismatch_rejected():
    embedded = star()
    embedded['vertices'] = [v+[0, 0] for v in embedded['vertices']]
    embedded['embeddingDimension'] = 4
    result = add_models(embedded, embedded)
    assert result['dimension'] == 2 and result['embeddingDimension'] == 4
    for a, b in ((star(), cube()), (star(), embedded)):
        with pytest.raises(GeometryError, match='matching'):
            add_models(a, b)


@pytest.mark.parametrize('value', [math.nan, math.inf, True, '1', 1e101, 10**500])
def test_nonfinite_or_out_of_domain_coordinates_rejected(value):
    invalid = cube()
    invalid['vertices'][0][0] = value
    with pytest.raises(GeometryError, match='coordinates'):
        add_models(cube(), invalid)


@pytest.mark.parametrize('mutation', ['edge', 'face', 'cell', 'embedding', 'array', 'duplicate-edge'])
def test_malformed_source_incidence_not_hidden_by_generalized_result(mutation):
    invalid = cube()
    if mutation == 'edge':
        invalid['edges'][0][1] = 100
    elif mutation == 'face':
        invalid['faces'][0][1] = invalid['faces'][0][0]
    elif mutation == 'cell':
        invalid['cells'] = [[100]]
    elif mutation == 'embedding':
        invalid['embeddingDimension'] = 2
    elif mutation == 'array':
        invalid['faces'] = 'invalid'
    else:
        invalid['edges'].append(invalid['edges'][0])
    with pytest.raises(GeometryError):
        add_models(cube(), invalid)


@pytest.mark.parametrize('color', [{'encoding': 'byte', 'values': [0, 0, 256]},
                                  {'encoding': 'unit', 'values': [0, 0, 1.1]},
                                  {'encoding': 'byte', 'values': [1., 2, 3]},
                                  {'encoding': 'byte', 'values': [True, 2, 3]},
                                  {'encoding': 'unit', 'values': [0, 0]},
                                  {'encoding': 'bad', 'values': [1, 2, 3]}])
def test_invalid_colors_rejected_instead_of_offsetting_bad_metadata(color):
    invalid = cube()
    invalid['metadata']['offColors'] = {'faces': [color]+[None]*5}
    with pytest.raises(GeometryError, match='color'):
        add_models(invalid, cube())


def test_bad_color_count_and_non_json_source_metadata_rejected():
    invalid = cube()
    invalid['metadata']['offColors'] = {'faces': [None]}
    with pytest.raises(GeometryError, match='color count'):
        add_models(invalid, cube())
    for value in (math.nan, object()):
        invalid = cube()
        invalid['metadata']['bad'] = value
        with pytest.raises(GeometryError, match='JSON'):
            add_models(invalid, cube())


@pytest.mark.parametrize('limit,value', [('MAX_VERTICES', 15), ('MAX_ELEMENTS', 20),
                                       ('MAX_INCIDENCES', 140), ('MAX_COMPONENTS', 1)])
def test_aggregate_resource_limits_fail_without_partial_result(monkeypatch, limit, value):
    a, b = cube(), cube()
    original = deepcopy([a, b])
    monkeypatch.setattr(compounds, limit, value)
    with pytest.raises(GeometryError, match='resource limit'):
        add_models(a, b)
    assert [a, b] == original


def test_payload_budget_applies_to_preserved_full_source_snapshots(monkeypatch):
    a, b = cube(), cube()
    monkeypatch.setattr(compounds, 'MAX_PAYLOAD_BYTES', compounds._payload_size(a)+100)
    with pytest.raises(GeometryError, match='result payload'):
        add_models(a, b)


def test_source_boundary_and_payload_caps_apply_before_validation(monkeypatch):
    monkeypatch.setattr(compounds, 'MAX_FACE_VERTICES', 3)
    with pytest.raises(GeometryError, match='face-boundary resource limit'):
        add_models(cube(), cube())
    monkeypatch.setattr(compounds, 'MAX_FACE_VERTICES', 2048)
    monkeypatch.setattr(compounds, 'MAX_PAYLOAD_BYTES', 10)
    with pytest.raises(GeometryError, match='source payload resource limit'):
        add_models(cube(), cube())


@pytest.mark.parametrize('mutation', ['overlap', 'missing', 'crossing', 'duplicate-id', 'path'])
def test_stale_or_malformed_component_maps_rejected(mutation):
    invalid = add_models(cube(), cube(2))
    components = invalid['components']
    if mutation == 'overlap':
        components[1]['maps']['vertices'][0] = 0
    elif mutation == 'missing':
        components[0]['maps']['edges'].pop()
    elif mutation == 'crossing':
        components[0]['maps']['faces'][0], components[1]['maps']['faces'][0] = components[1]['maps']['faces'][0], components[0]['maps']['faces'][0]
    elif mutation == 'duplicate-id':
        components[1]['id'] = components[0]['id']
    else:
        components[1]['sourcePath'] = [3]
    with pytest.raises(GeometryError, match='component'):
        add_models(invalid, cube(4))


def test_invalid_input_and_retrieval_identifiers_fail():
    with pytest.raises(GeometryError):
        add_models(None, cube())
    result = add_models(cube(), cube())
    for index in (-1, 2, True, '0'):
        with pytest.raises(GeometryError, match='source index'):
            retrieve_source(result, index)
    with pytest.raises(GeometryError, match='component ID'):
        extract_component(result, 'missing')
    with pytest.raises(GeometryError, match='snapshots'):
        retrieve_source(cube(), 0)


def test_source_validation_is_recomputed_cached_pass_and_hash_are_not_trusted():
    invalid = cube()
    invalid['validation'] = {'passed': True, 'errors': []}
    invalid['fingerprint'] = 'fake'
    invalid['faces'][0] = [0, 1, 2, 4]
    with pytest.raises(GeometryError, match='planar'):
        add_models(invalid, cube())
    valid = cube()
    valid['fingerprint'] = 'fake'
    result = add_models(valid, cube())
    assert result['provenance']['inputs'][0]['sourceFingerprint'] == identity(valid)


def test_malformed_numeric_and_source_support_objects_are_diagnosed():
    invalid = cube()
    invalid['numeric'] = 'bad'
    with pytest.raises(GeometryError, match='objects'):
        add_models(invalid, cube())
    invalid = cube()
    invalid['interpretation'] = 'polyhedral-region-union'
    invalid['convexPieces'] = ['bad']
    with pytest.raises(GeometryError, match='validation'):
        add_models(invalid, cube())
