"""Independent full-dimensional incidence fixtures for product ownership."""
from collections import Counter
from copy import deepcopy
import json
import math
import uuid

import numpy as np
import pytest

import engine.product_components as attachment
from engine.compounds import add_models, extract_component, remove_component, retrieve_source
from engine.formats import validate_project
from engine.geometry import GeometryError, identity
from engine.history import canonical_model
from engine.product_components import attach_product_components
from engine.products import polygon_prism, polygon_product
from engine.server import dispatch
from engine.star_polygons import regular_star_polygon


KINDS = ('vertices', 'edges', 'faces', 'cells')
HEXAGON = [[1, 0], [.5, math.sqrt(3)/2], [-.5, math.sqrt(3)/2],
           [-1, 0], [-.5, -math.sqrt(3)/2], [.5, -math.sqrt(3)/2]]
TRIANGLE = [[1, 0], [-.5, math.sqrt(3)/2], [-.5, -math.sqrt(3)/2]]
HEX_CYCLES = [[0, 2, 4], [1, 3, 5]]
HEX_EDGES = [[0, 2], [0, 4], [1, 3], [1, 5], [2, 4], [3, 5]]
TRI_EDGES = [[0, 1], [0, 2], [1, 2]]
BYTE_RGBA = {'encoding': 'byte', 'values': [10, 40, 200, 128]}
UNIT_RGBA = {'encoding': 'unit', 'values': [.1, .7, .3, .25]}


def factor(n=6, step=2):
    source = regular_star_polygon(n, step)
    source['metadata']['offColors'] = {
        'faces': deepcopy([BYTE_RGBA, UNIT_RGBA][:len(source['faces'])]), 'cells': []}
    source['metadata']['fixtureNote'] = {'literal': f'{n}/{step}', 'retain': ['all', 'fields']}
    if n == 6:
        assert np.asarray(source['vertices']) == pytest.approx(np.asarray(HEXAGON), abs=1e-15)
        assert source['faces'] == HEX_CYCLES and source['edges'] == HEX_EDGES
    else:
        assert np.asarray(source['vertices']) == pytest.approx(np.asarray(TRIANGLE), abs=1e-15)
        assert source['faces'] == [[0, 1, 2]] and source['edges'] == TRI_EDGES
    return source


def generated(kind):
    if kind == 'prism':
        return polygon_prism(factor(), 2)
    return polygon_product(factor(), factor(3, 1) if kind == '6x3' else factor())


def expected_prism():
    vertices = [p + [z] for z in (-1, 1) for p in HEXAGON]
    edges = deepcopy(HEX_EDGES) + [[a+6, b+6] for a, b in HEX_EDGES] + [[v, v+6] for v in range(6)]
    faces = [list(reversed(c)) for c in HEX_CYCLES] + [[v+6 for v in c] for c in HEX_CYCLES]
    faces += [[a, b, b+6, a+6] for cycle in HEX_CYCLES for a, b in zip(cycle, cycle[1:]+cycle[:1])]
    return dict(vertices=vertices, edges=edges, faces=faces, cells=[])


def expected_product(right_hex):
    """Literal Cartesian IDs and all cap/wall/cell boundaries, no product maps."""
    right_points, right_edges, right_cycles = ((HEXAGON, HEX_EDGES, HEX_CYCLES)
        if right_hex else (TRIANGLE, TRI_EDGES, [[0, 1, 2]]))
    vb, eb, fb = len(right_points), len(right_edges), len(right_cycles)
    point = lambda a, b: a*vb+b
    vertices = [a+b for a in HEXAGON for b in right_points]
    edges = [[point(a0,b), point(a1,b)] for a0,a1 in HEX_EDGES for b in range(vb)]
    edges += [[point(a,b0), point(a,b1)] for a in range(6) for b0,b1 in right_edges]
    faces = [[point(a,b) for a in cycle] for cycle in HEX_CYCLES for b in range(vb)]
    faces += [[point(a,b) for b in cycle] for a in range(6) for cycle in right_cycles]
    faces += [[point(a0,b0),point(a1,b0),point(a1,b1),point(a0,b1)]
              for a0,a1 in HEX_EDGES for b0,b1 in right_edges]
    quad = lambda a,b: 2*vb+6*fb+a*eb+b
    left_edge_id = {tuple(edge): i for i,edge in enumerate(HEX_EDGES)}
    right_edge_id = {tuple(edge): i for i,edge in enumerate(right_edges)}
    cells = [[c*vb+b0,c*vb+b1] + [quad(left_edge_id[tuple(sorted((a0,a1)))],b)
        for a0,a1 in zip(cycle,cycle[1:]+cycle[:1])]
        for c,cycle in enumerate(HEX_CYCLES) for b,(b0,b1) in enumerate(right_edges)]
    cells += [[2*vb+a0*fb+c,2*vb+a1*fb+c] + [quad(a,right_edge_id[tuple(sorted((b0,b1)))])
        for b0,b1 in zip(cycle,cycle[1:]+cycle[:1])]
        for a,(a0,a1) in enumerate(HEX_EDGES) for c,cycle in enumerate(right_cycles)]
    return dict(vertices=vertices, edges=edges, faces=faces, cells=cells)


def expected_maps(model, vertices):
    vertices = set(vertices)
    faces = [i for i,row in enumerate(model['faces']) if set(row) <= vertices]
    return {'vertices': sorted(vertices),
            'edges': [i for i,row in enumerate(model['edges']) if set(row) <= vertices],
            'faces': faces,
            'cells': [i for i,row in enumerate(model['cells']) if set(row) <= set(faces)]}


def expected_vertex_partitions(kind):
    if kind == 'prism':
        return [[v+6*layer for layer in (0,1) for v in range(parity,6,2)] for parity in (0,1)]
    vb = 3 if kind == '6x3' else 6
    right = [list(range(3))] if vb == 3 else [[0,2,4],[1,3,5]]
    return [[a*vb+b for a in range(parity,6,2) for b in cycle] for parity in (0,1) for cycle in right]


def full_source(root, path):
    for index in path:
        root = retrieve_source(root, index)
    return root


def verify_historical_input_maps(model):
    """Every binary input's maps reproduce its complete local ordered incidence."""
    if 'compound' not in model['metadata']:
        return
    for index, info in enumerate(model['metadata']['compound']['inputs']):
        source = retrieve_source(model, index)
        assert info['sourceModelId'] == source['id']
        assert info['sourceFingerprint'] == identity(source)
        maps = info['maps']
        assert [model['vertices'][i] for i in maps['vertices']] == source['vertices']
        for kind in ('edges','faces','cells'):
            lower = 'faces' if kind == 'cells' else 'vertices'
            assert [model[kind][i] for i in maps[kind]] == [[maps[lower][v] for v in row] for row in source[kind]]
        verify_historical_input_maps(source)


def verify_leaf_links(leaf):
    assert np.linalg.matrix_rank(np.asarray(leaf['vertices'])-leaf['vertices'][0]) == leaf['dimension']
    if leaf['dimension'] == 3:
        links = Counter(tuple(sorted((a,b))) for face in leaf['faces'] for a,b in zip(face,face[1:]+face[:1]))
        assert set(links) == {tuple(sorted(edge)) for edge in leaf['edges']}
        assert set(links.values()) == {2}
    else:
        assert Counter(face for cell in leaf['cells'] for face in cell) == Counter({i:2 for i in range(15)})
        for cell in leaf['cells']:
            links = Counter(tuple(sorted((a,b))) for f in cell for a,b in zip(leaf['faces'][f],leaf['faces'][f][1:]+leaf['faces'][f][:1]))
            assert set(links.values()) == {2}


@pytest.mark.parametrize('kind', ['prism','6x3','6x6'])
def test_literal_geometry_full_leaves_all_maps_rgba_and_source_immutability(kind):
    model = generated(kind)
    # Current cell RGBA is independent of uncolored factor-derived cell defaults.
    if model['cells']:
        model['metadata']['offColors']['cells'][0] = deepcopy(UNIT_RGBA)
        model['metadata']['offColors']['cells'][-1] = deepcopy(BYTE_RGBA)
    before = deepcopy(model)
    literal = expected_prism() if kind == 'prism' else expected_product(kind == '6x6')
    assert np.asarray(model['vertices']) == pytest.approx(np.asarray(literal['vertices']), abs=1e-15)
    for key in ('edges','faces','cells'):
        assert model[key] == literal[key]
    result = attach_product_components(model)
    assert model == before
    for key in ('id','fingerprint','name','numeric','provenance') + KINDS:
        assert result[key] == before[key]
    assert result['metadata']['offColors'] == before['metadata']['offColors']
    for key,value in before['metadata']['orderedProduct'].items():
        if key not in ('recoverableCompoundComponents','componentDefinition'):
            assert result['metadata']['orderedProduct'][key] == value
    assert result['metadata']['orderedProduct']['recoverableCompoundComponents'] is True
    expected = [expected_maps(before,vertices) for vertices in expected_vertex_partitions(kind)]
    assert [record['maps'] for record in result['components']] == expected
    verify_historical_input_maps(result)
    assert len({record['id'] for record in result['components']}) == len(expected)
    for record, maps in zip(result['components'],expected):
        uuid.UUID(record['id']); uuid.UUID(record['sourceModelId'])
        source = full_source(result, record['sourcePath'])
        assert source['id'] == record['sourceModelId']
        assert identity(source) == source['fingerprint'] == record['sourceFingerprint']
        assert source['dimension'] == source['embeddingDimension'] == before['dimension']
        assert tuple(len(source[k]) for k in KINDS) == ((6,9,5,0) if kind == 'prism' else (9,18,15,6))
        assert source['metadata']['orderedProductLeaf']['sourceFactorModels'] == before['metadata']['orderedProduct']['sourceModels']
        assert source['metadata']['orderedProductLeaf']['generatedSourceMaps'] == maps
        leaf = dispatch({'op':'compound-component','model':result,'params':{'component_id':record['id']}})
        assert identity(leaf) == identity(source)
        assert leaf['vertices'] == [before['vertices'][i] for i in maps['vertices']]
        for color_kind in ('faces','cells'):
            assert leaf['metadata']['offColors'][color_kind] == [before['metadata']['offColors'][color_kind][i] for i in maps[color_kind]]
        verify_leaf_links(leaf)
    # Returned snapshots, trees and factor provenance share no mutable caller arrays.
    result['vertices'][0][0] = 999
    result['metadata']['compound']['sourceModels'][0]['vertices'][0][0] = 888
    result['metadata']['orderedProduct']['sourceModels'][0]['metadata']['fixtureNote']['retain'].append('changed')
    assert model == before


@pytest.mark.parametrize('kind', ['prism','6x3','6x6'])
def test_drop_keeps_original_order_current_colors_and_historical_sources(kind):
    attached = attach_product_components(generated(kind)); before = deepcopy(attached)
    removed = attached['components'][1]
    result = dispatch({'op':'compound-drop','model':attached,'params':{'component_id':removed['id']}})
    assert attached == before
    keep = {kind:[i for i in range(len(attached[kind])) if i not in removed['maps'][kind]] for kind in KINDS}
    reverse = {kind:{v:i for i,v in enumerate(keep[kind])} for kind in KINDS}
    assert result['vertices'] == [attached['vertices'][i] for i in keep['vertices']]
    for kind in ('edges','faces','cells'):
        lower = 'faces' if kind == 'cells' else 'vertices'
        assert result[kind] == [[reverse[lower][v] for v in attached[kind][i]] for i in keep[kind]]
    assert result['metadata']['compound']['sourceModels'] == attached['metadata']['compound']['sourceModels']
    assert result['metadata']['orderedProduct']['sourceModels'] == attached['metadata']['orderedProduct']['sourceModels']
    for record in result['components']:
        old = next(c for c in attached['components'] if c['id'] == record['id'])
        assert record['sourcePath'] == old['sourcePath']
        assert identity(extract_component(result,record['id'])) == identity(extract_component(attached,record['id']))
    for old,new in zip(attached['metadata']['compound']['inputs'],result['metadata']['compound']['inputs']):
        for kind in KINDS:
            assert new['maps'][kind] == [reverse[kind].get(i) for i in old['maps'][kind]]


@pytest.mark.parametrize('kind', ['prism','6x3','6x6'])
def test_native_project_roundtrip_undo_redo_existing_compound_recipe_replay(kind):
    generated_model = generated(kind); attached = attach_product_components(generated_model)
    doc = {'id':'product-fixture','cursor':0,'states':[{'model':attached,'view':{},'notes':'full product source'}]}
    result = dispatch({'op':'recipe-run','params':{'document':doc,'operation':'compound-drop',
        'parameters':{'component_id':attached['components'][0]['id']}}})
    project = validate_project(json.loads(json.dumps({'format':'polytope-laboratory','version':1,
        'active':0,'documents':[result]})))
    reopened = project['documents'][0]
    assert reopened['states'][0]['model']['components'] == attached['components']
    replay = dispatch({'op':'recipe-replay','params':{'document':reopened}})
    assert canonical_model(replay['states'][0]['model']) == canonical_model(reopened['states'][1]['model'])
    assert replay['states'][0]['model']['components'] == reopened['states'][1]['model']['components']
    reopened['cursor'] = 0
    assert reopened['states'][reopened['cursor']]['model']['faces'] == generated_model['faces']
    reopened['cursor'] = 1
    assert reopened['states'][reopened['cursor']]['model']['cells'] == result['states'][1]['model']['cells']


def test_reattachment_and_regeneration_ids_are_geometry_deterministic():
    a,b = generated('6x6'),generated('6x6')
    first,second = attach_product_components(a),attach_product_components(b)
    assert a['id'] != b['id'] and first['id'] == a['id'] and second['id'] == b['id']
    assert first['components'] == second['components']
    assert attach_product_components(a) == first
    with pytest.raises(GeometryError,match='already'):
        attach_product_components(first)


def test_coincident_full_leaves_keep_distinct_original_incidence_and_source_paths():
    coincident = add_models(factor(3,1), factor(3,1))
    model = polygon_product(coincident,coincident); before = deepcopy(model)
    result = attach_product_components(model)
    assert model == before and len(result['components']) == 4
    blocks = [[a*6+b for a in range(left,left+3) for b in range(right,right+3)]
              for left in (0,3) for right in (0,3)]
    assert [c['maps'] for c in result['components']] == [expected_maps(model,v) for v in blocks]
    assert len({c['sourceModelId'] for c in result['components']}) == 4
    assert len({tuple(c['sourcePath']) for c in result['components']}) == 4
    assert len({identity(extract_component(result,c['id'])) for c in result['components']}) == 1
    verify_historical_input_maps(result)


def test_single_full_dimensional_leaf_requires_no_fake_second_source():
    model = polygon_prism(factor(3,1),2); before = deepcopy(model)
    result = attach_product_components(model)
    assert len(result['components']) == 1
    record = result['components'][0]
    assert record['sourcePath'] == [] and record['sourceModelId'] == model['id']
    snapshot = result['metadata']['productComponents']['directLeafSource']
    assert snapshot['dimension'] == 3 and snapshot['cells'] == []
    assert tuple(len(snapshot[k]) for k in KINDS) == (6,9,5,0)
    assert identity(snapshot) == identity(model)
    assert canonical_model(extract_component(result,record['id'])) == canonical_model(model)
    with pytest.raises(GeometryError,match='last'):
        remove_component(result,record['id'])
    assert model == before


def test_attachment_after_json_integral_number_normalization_retains_source_evidence():
    def numbers(value):
        if type(value) is dict:
            return {key:numbers(item) for key,item in value.items()}
        if type(value) is list:
            return [numbers(item) for item in value]
        return int(value) if type(value) is float and value.is_integer() else value
    model = numbers(generated('6x6')); before = deepcopy(model)
    result = attach_product_components(model)
    assert model == before
    assert result['metadata']['orderedProduct']['sourceModels'] == before['metadata']['orderedProduct']['sourceModels']
    assert identity(result) == model['fingerprint']
    verify_historical_input_maps(result)


@pytest.mark.parametrize('mutation', ['fingerprint','model-id','binding-id','binding-hash','partition',
    'partition-bool','partition-float','factor-snapshot','factor-map','factor-map-bool','source-map',
    'schema-bool','geometry','interval','embedding','color'])
def test_stale_or_malformed_attachment_refused_atomically(mutation):
    model = generated('prism'); info = model['metadata']['orderedProduct']
    if mutation == 'fingerprint': model['fingerprint'] = 'stale'
    elif mutation == 'model-id': model['id'] = str(uuid.uuid4())
    elif mutation == 'binding-id': info['resultSourceModelId'] = 'bad'
    elif mutation == 'binding-hash': info['resultSourceFingerprint'] = 'bad'
    elif mutation == 'partition': info['componentPartitions'][0]['maps']['vertices'][0] = 1
    elif mutation == 'partition-bool': info['componentPartitions'][0]['maps']['vertices'][0] = False
    elif mutation == 'partition-float': info['componentPartitions'][0]['maps']['vertices'][0] = 0.0
    elif mutation == 'factor-snapshot': info['sourceModels'][0]['metadata']['fixtureNote']['literal'] = 'stale'
    elif mutation == 'factor-map': info['maps']['vertices'][0]['factors'][0][2] = 1
    elif mutation == 'factor-map-bool': info['maps']['vertices'][0]['factors'][0][2] = False
    elif mutation == 'source-map': info['sourceMaps'][0]['vertices'][0] = []
    elif mutation == 'schema-bool': info['schemaVersion'] = True
    elif mutation == 'geometry': model['vertices'][0][0] += .1
    elif mutation == 'interval': info['interval']['height'] = 4
    elif mutation == 'embedding': model['embeddingDimension'] = 4
    elif mutation == 'color': model['metadata']['offColors']['faces'][0]['values'][3] = 999
    before = deepcopy(model)
    with pytest.raises(GeometryError):
        attach_product_components(model)
    assert model == before


@pytest.mark.parametrize('limit', ['MAX_PRODUCT_VERTICES','MAX_COMPONENTS','MAX_LEAF_SNAPSHOT_BYTES',
    'MAX_TREE_WORK_BYTES','MAX_PAYLOAD_BYTES'])
def test_each_attachment_budget_refuses_before_publication(monkeypatch,limit):
    model = generated('6x6'); before = deepcopy(model)
    monkeypatch.setattr(attachment,limit,1)
    with pytest.raises(GeometryError,match='resource limit'):
        attach_product_components(model)
    assert model == before


def test_non_generated_cycle_and_cyclic_provenance_are_explicit_refusals():
    with pytest.raises(GeometryError):
        attach_product_components(factor())
    model = generated('prism'); info = model['metadata']['orderedProduct']
    info['maliciousCycle'] = info
    with pytest.raises(GeometryError):
        attach_product_components(model)
    assert info['maliciousCycle'] is info and 'components' not in model


def test_overdeep_retained_metadata_is_bounded_before_attachment():
    model = generated('prism')
    nested = model['metadata']
    for _ in range(70):
        nested['deep'] = {}; nested = nested['deep']
    before = deepcopy(model)
    with pytest.raises(GeometryError,match='source JSON resource limit'):
        attach_product_components(model)
    assert model == before
