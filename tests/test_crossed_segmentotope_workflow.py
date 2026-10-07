"""Actual crossed-family generation, native persistence, recipes and JSON lines.

The square fixture is literal crossed incidence, never a convex-hull reference.
Generated-source evidence stays historical after subsequent coordinate edits.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import numpy as np
import pytest

from engine.geometry import GeometryError, canonical_cycle, identity, validate
from engine.history import canonical_model
from engine.server import dispatch


KIND = 'crossed-antiprism-segmentotope'
KINDS = ('vertices', 'edges', 'faces', 'cells')
UNIT = {'encoding': 'unit', 'values': [.1, .4, .7, .3]}
BYTE = {'encoding': 'byte', 'values': [20, 50, 210, 128]}


def make(**params):
    request = {'op': 'generate', 'params': {'kind': KIND, **params}}
    before = deepcopy(request)
    model = dispatch(request)
    assert request == before
    assert model['provenance']['generator'] == {'kind': KIND, 'parameters': params}
    assert model['fingerprint'] == identity(model) and validate(model)['passed']
    assert model['interpretation'] == 'generalized-complex'
    assert model['numeric']['certified'] is False
    assert all(field not in model for field in ('measure', 'facetEquations', 'facetVertices', 'rationalFacetEquations'))
    return model


def info(model):
    return model['metadata']['crossedAntiprismSegmentotope']


def counts(model):
    return tuple(len(model[key]) for key in KINDS)


def snapshot_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode('utf-8')).hexdigest()


def literal_square_reference(radius=1, height=1, depth=1):
    """Lower cardinal square and explicitly retrograde 135-degree upper ring."""
    q = radius / math.sqrt(2)
    factor = [[radius, 0, -height/2], [0, radius, -height/2], [-radius, 0, -height/2], [0, -radius, -height/2],
              [-q, q, height/2], [-q, -q, height/2], [q, -q, height/2], [q, q, height/2]]
    factor_faces = [[1, 2, 3, 0], [4, 7, 6, 5], [0, 3, 4], [4, 3, 7],
                    [1, 0, 5], [5, 0, 4], [2, 1, 6], [6, 1, 5], [3, 2, 7], [7, 2, 6]]
    factor_edges = sorted({tuple(sorted((a, b))) for face in factor_faces
                           for a, b in zip(face, face[1:]+face[:1])})
    vertices = [[x, y, t, z] for t in (-depth/2, depth/2) for x, y, z in factor]
    faces = [face[::-1] for face in factor_faces] + [[v+8 for v in face] for face in factor_faces]
    faces += [[a, b, b+8, a+8] for a, b in factor_edges]
    cells = [set(range(10)), set(range(10, 20))]
    side_face = {edge: 20+i for i, edge in enumerate(factor_edges)}
    for i, face in enumerate(factor_faces):
        cells.append({i, i+10} | {side_face[tuple(sorted((a, b)))] for a, b in zip(face, face[1:]+face[:1])})
    return vertices, faces, cells


def verify_square(model, radius=1, height=1, depth=1):
    vertices, faces, cells = literal_square_reference(radius, height, depth)
    assert counts(model) == (16, 40, 36, 12)
    assert np.allclose(model['vertices'], vertices, rtol=0, atol=6e-16*max(radius, height, depth))
    cycles = {tuple(canonical_cycle(face)) for face in faces}
    assert {tuple(canonical_cycle(face)) for face in model['faces']} == cycles
    expected_edges = {frozenset((a, b)) for face in faces for a, b in zip(face, face[1:]+face[:1])}
    assert {frozenset(edge) for edge in model['edges']} == expected_edges
    expected_cells = {frozenset(tuple(canonical_cycle(faces[f])) for f in cell) for cell in cells}
    assert {frozenset(tuple(canonical_cycle(model['faces'][f])) for f in cell) for cell in model['cells']} == expected_cells
    assert set(Counter(f for cell in model['cells'] for f in cell).values()) == {2}
    assert np.linalg.matrix_rank(np.asarray(model['vertices'])-model['vertices'][0]) == 4


def verify_source(model):
    evidence = info(model)
    factor = evidence['sourceFactorModel']
    assert evidence['sourceFactorModelId'] == factor['id']
    assert evidence['sourceFactorFingerprint'] == identity(factor)
    assert evidence['sourceFactorSnapshotSha256'] == snapshot_hash(factor)
    assert evidence['resultSourceModelId'] == model['id']
    assert evidence['resultSourceFingerprint'] == model['fingerprint']
    assert evidence['coordinateOwnership']['sourcePrismToOutputAxisOrder'] == [0, 1, 3, 2]
    for key in KINDS:
        assert len(evidence['maps'][key]) == len(model[key])
    matrix = evidence['commonOrientation']['matrix']
    for output, owner in zip(model['vertices'], evidence['maps']['vertices']):
        x, y, z = factor['vertices'][owner['sourceVertexId']]
        t = (-1 if owner['intervalEndpoint'] == 0 else 1)*evidence['depth']/2
        transformed = [sum(row[i]*p for i, p in enumerate((x, y, t))) for row in matrix]
        assert output == transformed+[z]
    for key in KINDS:
        partitions = Counter(i for part in evidence['componentPartitions'] for i in part['maps'][key])
        assert set(partitions) == set(range(len(model[key]))) and set(partitions.values()) == {1}
    assert evidence['recoverableCompoundComponents'] is False and 'components' not in model
    assert factor['interpretation'] == 'generalized-complex' and 'measure' not in factor


def document(model):
    return {'id': 'crossed-workflow-source', 'cursor': 0, 'states': [{'model': model,
            'view': {'coordinateUnit': 'mm', 'angles': [3, 7, 11, 13, 17, 19], 'projection': 'orthographic',
                     'surfaceOpacity': .7, 'viewportLayout': 'single'},
            'notes': 'Raw crossed layers; source RGBA retained', 'label': 'Crossed source'}]}


def current(doc):
    return doc['states'][doc['cursor']]


def test_generate_dispatch_matches_complete_independent_square_and_generalized_scope():
    model = make(symbol='4/3', radius=1, height=1, depth=1)
    verify_square(model)
    verify_source(model)
    evidence = info(model)
    assert len(evidence['layerCapCellIds']) == 2
    assert len(evidence['crossedAntiprismLateralCellIds']) == 2
    assert len(evidence['triangularPrismLateralCellIds']) == 8
    assert all(layer['convexCaps'] and layer['singleConvexLayer'] for layer in evidence['layers'])
    assert evidence['rawUpperRotationRadians'] == math.pi*3/4


@pytest.mark.parametrize('base,side', [('radius', 'height'), ('base_edge', 'height'),
                                      ('radius', 'side_edge'), ('base_edge', 'side_edge')])
def test_all_four_sizing_modes_have_independent_literal_dimensions(base, side):
    radius, height, depth = 1.2, .8, 1.5
    base_edge = radius*math.sqrt(2)
    side_edge = math.sqrt(height**2+radius**2*(2+math.sqrt(2)))
    params = {'symbol': '4/3', 'depth': depth, base: radius if base == 'radius' else base_edge,
              side: height if side == 'height' else side_edge}
    model = make(**params)
    verify_square(model, radius, height, depth)
    verify_source(model)
    for key, expected in [('radius', radius), ('height', height), ('depth', depth), ('baseEdge', base_edge), ('sideEdge', side_edge)]:
        assert info(model)[key] == pytest.approx(expected, rel=1e-14)
    # Explicit numeric inputs survive independently from resolved dimensions.
    assert model['provenance']['generator']['parameters'] == params


@pytest.mark.parametrize('symbol,n,d,cycles', [
    ('4/-3', 4, -3, [[0, 1, 2, 3]]),
    (' 6 / +4 ', 6, 4, [[0, 4, 2], [1, 5, 3]]),
    ('6/-4', 6, -4, [[0, 2, 4], [1, 3, 5]]),
    ('10/6', 10, 6, [[0, 6, 2, 8, 4], [1, 7, 3, 9, 5]])])
def test_signed_unreduced_symbol_full_polygon_and_factor_snapshot_remain_literal(symbol, n, d, cycles):
    model = make(symbol=symbol, radius=.75, height=1.2, depth=2)
    verify_source(model)
    evidence = info(model)
    factor = evidence['sourceFactorModel']
    source = factor['metadata']['rationalAntiprism']
    assert evidence['symbol'] == symbol and (evidence['n'], evidence['d']) == (n, d)
    assert evidence['rawUpperRotationRadians'] == math.pi*d/n
    assert source['orderedSourceCycles'] == cycles
    assert source['sourceModel']['faces'] == cycles
    assert (source['n'], source['d']) == (n, d)
    assert source['sourceModel']['metadata']['regularStarPolygon']['n'] == n
    assert source['sourceModel']['metadata']['regularStarPolygon']['d'] == d
    assert len(model['vertices']) == 4*n
    for i in range(n):
        lower = [.75*math.cos(2*math.pi*i/n), .75*math.sin(2*math.pi*i/n), -.6]
        upper = [.75*math.cos(2*math.pi*i/n+math.pi*d/n), .75*math.sin(2*math.pi*i/n+math.pi*d/n), .6]
        assert factor['vertices'][i] == pytest.approx(lower, abs=1e-15)
        assert factor['vertices'][i+n] == pytest.approx(upper, abs=1e-15)


def test_explicit_common_reflection_changes_only_xyz_and_retains_crossed_incidence():
    ordinary = make(symbol='4/3', height=1, depth=1.5)
    matrix = [[0, -1, 0], [1, 0, 0], [0, 0, -1]]
    oriented = make(symbol='4/3', height=1, depth=1.5, orientation=matrix)
    assert oriented['vertices'] == [[-y, x, -t, w] for x, y, t, w in ordinary['vertices']]
    assert all(oriented[key] == ordinary[key] for key in ('edges', 'faces', 'cells'))
    assert info(oriented)['commonOrientation']['determinant'] == -1
    verify_source(oriented)


def test_native_save_open_retains_units_raw_parameters_ordered_geometry_full_snapshots_and_rgba(tmp_path):
    colors = [deepcopy(UNIT), deepcopy(BYTE)]
    params = {'symbol': ' 6 / -4 ', 'radius': .75, 'height': 1.25, 'depth': 2, 'cap_colors': colors}
    before = deepcopy(params)
    model = make(**params)
    verify_source(model)
    source = info(model)['sourceFactorModel']
    assert source['metadata']['rationalAntiprism']['sourceModel']['metadata']['offColors']['faces'] == colors
    for i, owner in enumerate(info(model)['maps']['faces']):
        expected = source['metadata']['offColors']['faces'][owner['sourceFaceId']] if owner['role'] == 'source-face' else None
        assert model['metadata']['offColors']['faces'][i] == expected
    assert set(value is None for value in model['metadata']['offColors']['cells']) == {True}
    doc = document(model)
    project = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]}
    original = deepcopy(project)
    path = tmp_path/'raw-crossed.polyproj'
    dispatch({'op': 'save', 'params': {'path': str(path), 'project': project}})
    restored = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]
    assert project == original and params == before
    assert current(restored)['view']['coordinateUnit'] == 'mm'
    assert current(restored)['notes'] == current(doc)['notes']
    loaded = current(restored)['model']
    assert canonical_model(loaded) == canonical_model(model)
    assert loaded['metadata'] == model['metadata'] and loaded['provenance'] == model['provenance']
    verify_source(loaded)
    assert loaded['interpretation'] == 'generalized-complex' and 'measure' not in loaded


def test_actual_scale_recipe_save_replay_and_original_parent_branch_are_atomic(tmp_path):
    source = document(make(symbol='6/-4', height=1.25, depth=2, cap_colors=[UNIT, BYTE]))
    original = deepcopy(source)
    scaled = dispatch({'op': 'recipe-run', 'params': {'document': source, 'operation': 'transform',
                       'parameters': {'scale': 2}, 'label': 'Scale crossed source'}})
    assert source == original and len(scaled['states']) == 2
    transformed = current(scaled)['model']
    assert transformed['vertices'] == [[2*x for x in point] for point in current(source)['model']['vertices']]
    assert all(transformed[key] == current(source)['model'][key] for key in ('edges', 'faces', 'cells'))
    retained = deepcopy(info(current(source)['model']))
    assert info(transformed) == retained
    assert retained['resultSourceFingerprint'] != transformed['fingerprint'], 'Generated-source maps are historical after coordinate transformation'
    assert transformed['metadata']['offColors'] == current(source)['model']['metadata']['offColors']
    assert transformed['interpretation'] == 'generalized-complex' and 'measure' not in transformed
    assert current(scaled)['view']['coordinateUnit'] == 'mm'
    path = tmp_path/'crossed-history.polyproj'
    dispatch({'op': 'save', 'params': {'path': str(path), 'project': {
        'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [scaled]}}})
    reopened = dispatch({'op': 'load', 'params': {'path': str(path)}})['project']['documents'][0]
    before = deepcopy(reopened)
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': reopened}})
    assert canonical_model(current(replay)['model']) == canonical_model(transformed)
    branch = dispatch({'op': 'recipe-branch', 'params': {'document': reopened, 'parameters': {'scale': 3}}})
    assert current(branch)['model']['vertices'] == [[3*x for x in point] for point in current(source)['model']['vertices']]
    assert canonical_model(branch['states'][0]['model']) == canonical_model(current(source)['model'])
    assert branch['operationHistory']['nodes'][-1]['params'] == {'scale': 3}
    assert len(branch['operationHistory']['nodes']) == 3
    assert info(current(branch)['model']) == retained
    assert reopened == before and source == original


@pytest.mark.parametrize('params', [
    {'symbol': True, 'height': 1}, {'symbol': {'n': 4, 'd': 3}, 'height': 1},
    {'symbol': '5/2', 'height': 1}, {'symbol': '4/3'}, {'symbol': '4/3', 'height': '1/2'},
    {'symbol': '4/3', 'height': True}, {'symbol': '4/3', 'height': 0},
    {'symbol': '4/3', 'height': 1, 'depth': 0}, {'symbol': '4/3', 'height': 1, 'depth': []},
    {'symbol': '4/3', 'height': 1, 'radius': 1, 'base_edge': 1},
    {'symbol': '4/3', 'height': 1, 'side_edge': 2},
    {'symbol': '4/3', 'height': 1, 'orientation': 'gyro'},
    {'symbol': '4/3', 'height': 1, 'orientation': [[1, 1, 0], [0, 1, 0], [0, 0, 1]]},
    {'symbol': '4/3', 'height': 1, 'cap_colors': []},
    {'symbol': '4/3', 'height': 1, 'cap_colors': [{'encoding': 'byte', 'values': [10, 20, 30, 256]}]},
    {'symbol': '4/3', 'height': 1, 'gyro': True}, {'symbol': '4/3', 'height': 1, 'crossed': True},
    {'symbol': '4/3', 'height': 1, 'unknown': {'retained': 'must refuse'}},
    {'symbol': '1001/1000', 'height': 1}, {'symbol': '4/3', 'height': 1e-20},
])
def test_malformed_json_fields_refuse_without_mutation_and_next_valid_dispatch_recovers(params):
    request = {'op': 'generate', 'params': {'kind': KIND, **params}}
    before = deepcopy(request)
    with pytest.raises(GeometryError):
        dispatch(request)
    assert request == before
    verify_square(make(symbol='4/3', height=1))


def test_generator_nonjson_and_oversized_retained_attributes_refuse_without_partial_model():
    cycle = {'symbol': '4/3', 'height': 1}
    cycle['orientation'] = cycle
    with pytest.raises(GeometryError):
        dispatch({'op': 'generate', 'params': {'kind': KIND, **cycle}})
    assert cycle['orientation'] is cycle
    for value in [float('nan'), float('inf'), 10**500]:
        with pytest.raises(GeometryError):
            dispatch({'op': 'generate', 'params': {'kind': KIND, 'symbol': '4/3', 'height': value}})
    verify_square(make(symbol='4/3', height=1))


def test_actual_jsonlines_process_reports_bad_request_then_complete_literal_valid_geometry():
    requests = [
        {'id': 'malformed', 'op': 'generate', 'params': {'kind': KIND, 'symbol': '4/3', 'height': True}},
        {'id': 'literal', 'op': 'generate', 'params': {'kind': KIND, 'symbol': '4/3', 'radius': 1, 'height': 1,
                                                    'depth': 1, 'cap_colors': [UNIT]}},
    ]
    process = subprocess.run([sys.executable, '-B', '-m', 'engine.server'],
                             input='\n'.join(json.dumps(request) for request in requests)+'\n',
                             text=True, encoding='utf-8', capture_output=True, check=True, timeout=30,
                             cwd=Path(__file__).resolve().parents[1])
    assert not process.stderr
    replies = [json.loads(line) for line in process.stdout.splitlines()]
    assert [reply['id'] for reply in replies] == ['malformed', 'literal']
    assert replies[0]['ok'] is False and isinstance(replies[0]['error'], str)
    assert replies[1]['ok'] is True
    model = replies[1]['result']
    verify_square(model)
    verify_source(model)
    assert model['provenance']['generator']['parameters'] == {
        key: value for key, value in requests[1]['params'].items() if key != 'kind'}
    assert 'measure' not in model
