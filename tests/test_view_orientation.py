"""Intrinsic orientation checks on literal incidence and independent transforms."""
from copy import deepcopy
from itertools import combinations, product
import math

import numpy as np
import pytest

from engine.geometry import GeometryError, identity, validate
from engine.view_orientation import orient_entity


def tesseract():
    vertices = [list(p) for p in product((-1., 1.), repeat=4)]
    lookup = {tuple(p): i for i, p in enumerate(vertices)}
    edges = [[i, j] for i, a in enumerate(vertices) for j, b in enumerate(vertices) if i < j and sum(x != y for x, y in zip(a, b)) == 1]
    faces = []
    for fixed in combinations(range(4), 2):
        variable = [axis for axis in range(4) if axis not in fixed]
        for values in product((-1., 1.), repeat=2):
            face = []
            for corners in ((-1., -1.), (1., -1.), (1., 1.), (-1., 1.)):
                p = [0.] * 4
                for axis, value in zip(fixed, values): p[axis] = value
                for axis, value in zip(variable, corners): p[axis] = value
                face.append(lookup[tuple(p)])
            faces.append(face)
    cells = [[i for i, face in enumerate(faces) if all(vertices[v][axis] == value for v in face)] for axis in range(4) for value in (-1., 1.)]
    return {'dimension': 4, 'embeddingDimension': 4, 'vertices': vertices, 'edges': edges, 'faces': faces, 'cells': cells, 'interpretation': 'convex-polytope'}


def entity_ids(model, kind, index):
    if kind == 'vertex': return [index]
    if kind == 'cell': return sorted({v for f in model['cells'][index] for v in model['faces'][f]})
    return model[{'edge': 'edges', 'face': 'faces'}[kind]][index]


def display(model, result):
    return (np.asarray(model['vertices']) - result['center']) @ np.asarray(result['matrix']).T


def proper_rotation():
    # Explicit plane rotations independent of the application display helper.
    result = np.eye(4)
    for i, j, angle in ((0, 3, .37), (1, 2, -.61), (0, 1, 1.17), (2, 3, .23)):
        rotation = np.eye(4)
        rotation[i, i] = rotation[j, j] = math.cos(angle)
        rotation[i, j] = -math.sin(angle)
        rotation[j, i] = math.sin(angle)
        result = rotation @ result
    return result


def test_literal_tesseract_cell_first_last_support_normal_and_vertex_depth():
    source = tesseract(); before = deepcopy(source)
    assert validate(source)['passed']
    for mode, sign in (('first', 1), ('last', -1)):
        result = orient_entity(source, {'kind': 'cell', 'index': 7}, mode)
        assert result['sourceDirection'] == pytest.approx([0, 0, 0, 1])
        assert result['supportingPlane']['offset'] == pytest.approx(1)
        p = display(source, result)
        ids = entity_ids(source, 'cell', 7)
        assert p[ids, 3] == pytest.approx(np.full(8, sign))
        assert p[[v for v in range(16) if v not in ids], 3] == pytest.approx(np.full(8, -sign))
        assert result['checks']['determinant'] == pytest.approx(1)
        assert result['sourceFingerprint'] == identity(source)
    first = np.asarray(orient_entity(source, {'kind': 'cell', 'index': 7})['matrix'])
    last = np.asarray(orient_entity(source, {'kind': 'cell', 'index': 7}, 'last')['matrix'])
    assert last == pytest.approx(np.diag([1, 1, -1, -1]) @ first)
    assert source == before


def test_independent_simplex_support_direction_and_unequal_vertex_depths():
    vertices = np.vstack((np.eye(4), -np.ones((1, 4)))).tolist()
    faces = [list(ids) for ids in combinations(range(5), 3)]
    cells = [[i for i, face in enumerate(faces) if missing not in face] for missing in range(5)]
    source = {'dimension': 4, 'vertices': vertices, 'edges': [list(e) for e in combinations(range(5), 2)], 'faces': faces, 'cells': cells, 'interpretation': 'convex-polytope'}
    before = deepcopy(source)
    result = orient_entity(source, {'kind': 'cell', 'index': 4})
    assert result['sourceDirection'] == pytest.approx([.5, .5, .5, .5])
    assert display(source, result)[:4, 3] == pytest.approx(np.full(4, .5))
    assert display(source, result)[4, 3] == pytest.approx(-2)
    assert source == before


def test_anisotropic_affine_realization_uses_inverse_transpose_support_normal():
    source = tesseract(); before = deepcopy(source)
    affine = np.array([[2, .4, 0, 0], [0, 3, .5, 0], [.2, 0, 4, .3], [0, .1, 0, 5]])
    source['vertices'] = (np.asarray(source['vertices']) @ affine.T + np.array([2, -3, 5, 7])).tolist()
    result = orient_entity(source, {'kind': 'cell', 'index': 7})
    expected = np.linalg.solve(affine.T, [0, 0, 0, 1]); expected /= np.linalg.norm(expected)
    assert result['sourceDirection'] == pytest.approx(expected)
    assert np.ptp(display(source, result)[entity_ids(source, 'cell', 7), 3]) < 1e-12
    raw = np.asarray(source['vertices']); projected = display(source, result)
    assert np.linalg.norm(raw[:, None]-raw[None, :], axis=2) == pytest.approx(np.linalg.norm(projected[:, None]-projected[None, :], axis=2))
    assert source['faces'] == before['faces'] and source['cells'] == before['cells']


@pytest.mark.parametrize('kind,dimension', [('vertex', 0), ('edge', 1), ('face', 2), ('cell', 3)])
def test_every_tesseract_entity_has_the_declared_span_and_preserved_metric(kind, dimension):
    source = tesseract(); before = deepcopy(source)
    raw = np.asarray(source['vertices']); pair_distances = np.linalg.norm(raw[:, None] - raw[None, :], axis=2)
    field = {'vertex': 'vertices', 'edge': 'edges', 'face': 'faces', 'cell': 'cells'}[kind]
    for index in range(len(source[field])):
        for mode in ('first', 'last'):
            result = orient_entity(source, {'kind': kind, 'index': index}, mode)
            matrix = np.asarray(result['matrix']); points = display(source, result)
            assert matrix @ matrix.T == pytest.approx(np.eye(4), abs=1e-12)
            assert np.linalg.det(matrix) == pytest.approx(1)
            selected = points[entity_ids(source, kind, index)]
            assert np.ptp(selected[:, dimension:], axis=0) == pytest.approx(np.zeros(4-dimension), abs=1e-12)
            assert np.linalg.norm(points[:, None] - points[None, :], axis=2) == pytest.approx(pair_distances, abs=1e-12)
            assert matrix @ result['sourceDirection'] == pytest.approx(result['targetDirection'], abs=1e-12)
            assert selected[:, 3].mean() * (1 if mode == 'first' else -1) > 0
    assert source == before


@pytest.mark.parametrize('kind', ['vertex', 'edge', 'face', 'cell'])
@pytest.mark.parametrize('scale', [1e-9, 1., 1e9])
def test_frames_are_covariant_under_proper_rigid_coordinates_translation_and_scale(kind, scale):
    source = tesseract(); rotation = proper_rotation(); translation = np.array([3, -4, 7, 2]) * scale
    moved = deepcopy(source); moved['vertices'] = (np.asarray(source['vertices']) @ rotation.T * scale + translation).tolist()
    before = deepcopy(moved)
    for mode in ('first', 'last'):
        original = orient_entity(source, {'kind': kind, 'index': 0}, mode)
        result = orient_entity(moved, {'kind': kind, 'index': 0}, mode)
        assert np.asarray(result['matrix']) @ rotation == pytest.approx(np.asarray(original['matrix']), abs=1e-7)
        assert result['sourceDirection'] == pytest.approx(rotation @ original['sourceDirection'], abs=1e-7)
        assert display(moved, result) / scale == pytest.approx(display(source, original), abs=1e-7)
        assert moved['faces'] == source['faces'] and moved['cells'] == source['cells']
    assert moved == before


def test_star_face_and_explicit_measured_plane_keep_source_cycle_and_span():
    vertices = [[math.cos(i*2*math.pi/5), math.sin(i*2*math.pi/5), 1, 1] for i in range(5)] + [[0, 0, -1, 0], [0, 0, 0, -1]]
    cycle = [0, 2, 4, 1, 3]
    source = {'dimension': 4, 'vertices': vertices, 'edges': [[a, cycle[(i+1)%5]] for i, a in enumerate(cycle)], 'faces': [cycle], 'cells': [], 'interpretation': 'generalized-complex'}
    before = deepcopy(source)
    face = orient_entity(source, {'kind': 'face', 'index': 0})
    plane = orient_entity(source, {'kind': 'plane', 'vertices': [0, 1, 2, 3, 4]})
    assert np.asarray(face['matrix']) == pytest.approx(np.asarray(plane['matrix']), abs=1e-12)
    assert np.ptp(display(source, face)[:5, 2:], axis=0) == pytest.approx([0, 0], abs=1e-12)
    assert source == before


def test_central_entity_requires_explicit_direction_and_reports_its_zero_depth():
    source = tesseract(); source['interpretation'] = 'generalized-complex'; source['vertices'].append([0, 0, 0, 0])
    entity = {'kind': 'vertex', 'index': 16}
    with pytest.raises(GeometryError, match='explicit intrinsic direction'): orient_entity(source, entity)
    for mode in ('first', 'last'):
        result = orient_entity(source, entity, mode, direction=[0, 0, 0, 1e200])
        assert result['centeredEntity'] and result['displayEntityCentroid'] == [0, 0, 0, 0]
        assert np.asarray(result['matrix']) @ result['sourceDirection'] == pytest.approx(result['targetDirection'])
    plane = {'kind': 'plane', 'vertices': [0, 15, 6]}
    with pytest.raises(GeometryError, match='explicit intrinsic direction'): orient_entity(source, plane)
    result = orient_entity(source, plane, direction=[1, -1, 0, 0])
    assert result['centeredEntity']


def test_explicit_axis_and_reference_roll_remain_proper_without_geometry_mutation():
    source = tesseract(); before = deepcopy(source); entity = {'kind': 'face', 'index': 0}
    original = orient_entity(source, entity); normal = np.asarray(original['sourceDirection'])
    explicit = orient_entity(source, entity, direction=-normal)
    assert explicit['sourceDirection'] == pytest.approx(normal)
    matrix = np.asarray(original['matrix']); roll = np.eye(4); angle = .31
    roll[:2, :2] = [[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]]
    reference = roll @ matrix
    result = orient_entity(source, entity, reference_matrix=reference)
    assert result['matrix'] == pytest.approx(reference, abs=1e-12)
    assert result['checks']['selectedSpanResidual'] < 1e-12
    assert source == before


@pytest.mark.parametrize('entity', [{'kind': 'cell', 'index': True}, {'kind': 'cell', 'index': 8}, {'kind': 'unknown'}, {'kind': 'line', 'vertices': [0, 0]}, {'kind': 'plane', 'vertices': [0, 1, 2, 4]}])
def test_invalid_entity_and_affine_rank_are_diagnostic(entity):
    with pytest.raises(GeometryError): orient_entity(tesseract(), entity)


def test_dimension_invalid_source_bad_options_and_resource_limits():
    source = tesseract(); entity = {'kind': 'face', 'index': 0}
    for mode in ('auto', 'FIRST', None):
        with pytest.raises(GeometryError): orient_entity(source, entity, mode)
    for direction in ([0, 0, 0, 0], [1, 2, 3], [1, float('nan'), 0, 0], ['bad', 0, 0, 0]):
        with pytest.raises(GeometryError): orient_entity(source, entity, direction=direction)
    tangent = np.asarray(source['vertices'][source['faces'][0][1]]) - source['vertices'][source['faces'][0][0]]
    with pytest.raises(GeometryError, match='entity span'): orient_entity(source, entity, direction=tangent)
    for reference in (np.diag([-1, 1, 1, 1]), np.ones((4, 4)), [[1, 2]], [['bad']*4]*4):
        with pytest.raises(GeometryError): orient_entity(source, entity, reference_matrix=reference)
    invalid = deepcopy(source); invalid['edges'][0] = [0, 99]
    with pytest.raises(GeometryError, match='invalid source'): orient_entity(invalid, entity)
    lower = deepcopy(source); lower['dimension'] = 3
    with pytest.raises(GeometryError, match='intrinsic 4D'): orient_entity(lower, entity)
    lower = deepcopy(source); lower['interpretation'] = 'generalized-complex'; lower['cells'] = []; lower['vertices'] = [p[:3]+[0] for p in lower['vertices']]
    with pytest.raises(GeometryError): orient_entity(lower, {'kind': 'vertex', 'index': 0})
    large = deepcopy(source); large['vertices'] = large['vertices'] * 1300
    with pytest.raises(GeometryError, match='resource limit'): orient_entity(large, entity)
    large = deepcopy(source); large['interpretation'] = 'generalized-complex'
    large['vertices'] += [[i/600, (i%7)/10, (i%11)/10, 1] for i in range(513)]
    with pytest.raises(GeometryError, match='selected-entity vertex resource limit'):
        orient_entity(large, {'kind': 'hyperplane', 'vertices': list(range(16, 529))})
    flat_source = {'dimension': 4, 'vertices': [[0,0,0,0],[1,0,0,0],[0,1,0,0],[0,0,1,0]], 'edges': [], 'faces': [], 'cells': [], 'interpretation': 'generalized-complex'}
    with pytest.raises(GeometryError, match='full affine dimension 4'):
        orient_entity(flat_source, {'kind': 'vertex', 'index': 0})
    malformed = deepcopy(source); malformed['faces'][0] = 5
    with pytest.raises(GeometryError, match='incidence tables must be lists'):
        orient_entity(malformed, entity)


def test_numeric_repeatability_result_copy_and_json_serialization():
    import json
    source = tesseract(); entity = {'kind': 'edge', 'index': 3}
    a = orient_entity(source, entity); b = orient_entity(source, entity)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    a['entity']['index'] = 1
    assert entity['index'] == 3
