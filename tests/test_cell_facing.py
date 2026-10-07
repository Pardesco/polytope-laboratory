"""Independent literal-facet and observer fixtures for convex 4D facing."""
from copy import deepcopy
from itertools import combinations, product
import json
import math

import numpy as np
import pytest

from engine.cell_facing import classify_cells
from engine.geometry import GeometryError, identity
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


def rotation():
    # Explicit coordinate changes independent of orientation/classifier helpers.
    matrix = np.eye(4)
    for i, j, angle in ((0, 3, .37), (1, 2, -.61), (0, 1, 1.17), (2, 3, .23)):
        plane = np.eye(4)
        plane[i, i] = plane[j, j] = math.cos(angle)
        plane[i, j] = -math.sin(angle)
        plane[j, i] = math.sin(angle)
        matrix = plane @ matrix
    return matrix


def assert_partition(result):
    size = len(result['sourceCellIds'])
    assert result['sourceCellIds'] == list(range(size))
    assert sum(sum(result['masks'][kind]) for kind in result['masks']) == size
    for i in range(size):
        assert sum(result['masks'][kind][i] for kind in result['masks']) == 1
        for kind in result['masks']:
            assert result['masks'][kind][i] == (i in result[kind + 'CellIds'])


@pytest.mark.parametrize('sign', (-1, 1))
def test_literal_tesseract_parallel_one_front_one_back_six_grazing(sign):
    model = tesseract(); before = deepcopy(model)
    result = classify_cells(model, direction=[0, 0, 0, sign])
    assert result['frontCellIds'] == [7 if sign == 1 else 6]
    assert result['backCellIds'] == [6 if sign == 1 else 7]
    assert result['grazingCellIds'] == list(range(6))
    assert result['normalization']['center'] == [0, 0, 0, 0]
    assert result['normalization']['radius'] == pytest.approx(2)
    for cell in result['cells']:
        axis, parity = divmod(cell['cell'], 2)
        expected = np.zeros(4); expected[axis] = -1 if parity == 0 else 1
        assert cell['sourcePlane']['normal'] == pytest.approx(expected)
        assert cell['sourcePlane']['offset'] == pytest.approx(1)
        assert cell['normalizedPlane']['offset'] == pytest.approx(.5)
        assert cell['displayPlane']['normal'] == pytest.approx(expected)
        assert cell['signedFacing'] == pytest.approx(sign * expected[3])
    assert_partition(result); assert model == before


@pytest.mark.parametrize('sign', (-1, 1))
def test_literal_tesseract_finite_eye_three_one_front_seven_back(sign):
    result = classify_cells(tesseract(), projection='perspective', eye=[0, 0, 0, sign * 3])
    assert result['frontCellIds'] == [7 if sign == 1 else 6]
    assert len(result['backCellIds']) == 7
    assert result['grazingCellIds'] == []
    for cell in result['cells']:
        normal = cell['sourcePlane']['normal']
        assert cell['signedFacing'] == pytest.approx(sign * 3 * normal[3] - .5)
    assert_partition(result)


def test_projection_defaults_match_current_renderer_eye_locations():
    model = tesseract()
    assert classify_cells(model)['observer'] == {'kind': 'parallel', 'direction': [0, 0, 0, 1]}
    perspective = classify_cells(model, projection='perspective')
    assert perspective['observer']['eye'] == [0, 0, 0, 3]
    stereographic = classify_cells(model, projection='stereographic')
    assert stereographic['observer']['eye'] == [0, 0, 0, 1.0]
    assert stereographic['frontCellIds'] == [7]
    assert stereographic['cells'][7]['signedFacing'] == pytest.approx(.5)


@pytest.mark.parametrize('w,expected', ((.5-2e-8, 'back'), (.5-5e-9, 'grazing'), (.5, 'grazing'), (.5+5e-9, 'grazing'), (.5+2e-8, 'front')))
def test_eye_crossing_facet_uses_explicit_normalized_distance_band(w, expected):
    result = classify_cells(tesseract(), projection='perspective', eye=[0, 0, 0, w])
    assert result['cells'][7]['facing'] == expected
    assert result['classificationTolerance'] == pytest.approx(1e-8)
    assert result['cells'][7]['signedFacing'] == pytest.approx(w-.5)
    assert_partition(result)


def test_interior_eye_and_parallel_direction_have_distinct_geometric_semantics():
    inside = classify_cells(tesseract(), projection='perspective', eye=[0, 0, 0, 0])
    assert inside['backCellIds'] == list(range(8)); assert inside['frontCellIds'] == []
    diagonal = classify_cells(tesseract(), direction=[1, 1, 1, 1])
    assert diagonal['frontCellIds'] == [1, 3, 5, 7]; assert diagonal['backCellIds'] == [0, 2, 4, 6]
    assert diagonal['grazingCellIds'] == []
    for cell in diagonal['cells']: assert abs(cell['signedFacing']) == pytest.approx(.5)


@pytest.mark.parametrize('scale', (1e-9, 1., 1e9))
@pytest.mark.parametrize('projection,sign', (('orthographic', 1), ('orthographic', -1), ('perspective', 1), ('perspective', -1)))
def test_signed_plane_evaluation_covaries_under_rigid_translation_and_scale(scale, projection, sign):
    original = tesseract(); rotated = deepcopy(original)
    q = rotation(); shift = np.array([2, -3, 5, 7]) * scale
    old_points = np.array(original['vertices'])
    rotated['vertices'] = (scale * old_points @ q.T + shift).tolist()
    old_observer = np.array([0, 0, 0, sign * (3 if projection == 'perspective' else 1.)])
    parameter = 'eye' if projection == 'perspective' else 'direction'
    old = classify_cells(original, projection=projection, **{parameter: old_observer})
    # Rotating the normalized observer with the source leaves all scores equal.
    new = classify_cells(rotated, projection=projection, **{parameter: q @ old_observer})
    # Inverse display frame instead restores the complete original display scene.
    restored = classify_cells(rotated, projection=projection, matrix=q.T, **{parameter: old_observer})
    assert new['masks'] == old['masks'] == restored['masks']
    for prior, changed, displayed in zip(old['cells'], new['cells'], restored['cells']):
        assert changed['signedFacing'] == pytest.approx(prior['signedFacing'], abs=1e-12)
        assert displayed['signedFacing'] == pytest.approx(prior['signedFacing'], abs=1e-12)
        normal = q @ np.array(prior['sourcePlane']['normal'])
        assert changed['sourcePlane']['normal'] == pytest.approx(normal)
        assert changed['sourcePlane']['offset'] == pytest.approx(scale + normal @ shift)
        assert displayed['displayPlane']['normal'] == pytest.approx(prior['sourcePlane']['normal'])
        # Source supporting-plane signed distances also scale as the geometry.
        old_residual = old_points @ prior['sourcePlane']['normal'] - prior['sourcePlane']['offset']
        new_residual = (np.array(rotated['vertices']) @ normal - changed['sourcePlane']['offset']) / scale
        assert new_residual == pytest.approx(old_residual, abs=1e-12)


@pytest.mark.parametrize('mode,selected_kind', (('first', 'front'), ('last', 'back')))
@pytest.mark.parametrize('projection', ('orthographic', 'perspective'))
def test_cell_zero_first_last_interacts_with_outward_planes(mode, selected_kind, projection):
    model = tesseract(); before = deepcopy(model)
    frame = orient_entity(model, {'kind': 'cell', 'index': 0}, mode)
    result = classify_cells(model, projection=projection, matrix=frame['matrix'])
    assert result['cells'][0]['facing'] == selected_kind
    expected = np.array([0, 0, 0, 1 if mode == 'first' else -1])
    assert result['cells'][0]['displayPlane']['normal'] == pytest.approx(expected)
    assert result['cells'][1]['displayPlane']['normal'] == pytest.approx(-expected)
    assert result['frontCellIds'] == [0 if mode == 'first' else 1]
    assert len(result['backCellIds']) == (1 if projection == 'orthographic' else 7)
    assert model == before


def test_nonregular_literal_simplex_offsets_and_facing_are_independent_of_cell_centroid():
    vertices = np.vstack((np.eye(4), -np.ones((1, 4)))).tolist()
    faces = [list(ids) for ids in combinations(range(5), 3)]
    model = {'dimension': 4, 'vertices': vertices, 'edges': [list(ids) for ids in combinations(range(5), 2)], 'faces': faces,
             'cells': [[i for i, face in enumerate(faces) if excluded not in face] for excluded in range(5)], 'interpretation': 'convex-polytope'}
    result = classify_cells(model, projection='perspective', eye=[0, 0, 0, 3])
    # Facet of the four unit-axis vertices has n=(1,1,1,1)/2, h=1/2.
    cell = result['cells'][4]
    assert cell['sourcePlane']['normal'] == pytest.approx([.5]*4)
    assert cell['sourcePlane']['offset'] == pytest.approx(.5)
    assert cell['normalizedPlane']['offset'] == pytest.approx(.25) # radius is 2.
    assert cell['signedFacing'] == pytest.approx(1.25)
    # Facet excluding eW has outward n=(1,1,1,-4)/sqrt(19), h=1/sqrt(19).
    assert result['cells'][3]['sourcePlane']['normal'] == pytest.approx(np.array([1,1,1,-4])/math.sqrt(19))
    assert result['frontCellIds'] == [0, 1, 2, 4]; assert result['backCellIds'] == [3]


def test_numeric_repeatability_copy_and_complete_source_reference_preservation():
    model = tesseract(); before = deepcopy(model); matrix = rotation(); matrix_before = matrix.copy()
    a = classify_cells(model, matrix=matrix); b = classify_cells(model, matrix=matrix)
    assert json.dumps(a, sort_keys=True, allow_nan=False) == json.dumps(b, sort_keys=True, allow_nan=False)
    assert a['sourceFingerprint'] == identity(model)
    for cell in a['cells']:
        assert cell['sourceVertexIds'] == sorted({v for f in model['cells'][cell['cell']] for v in model['faces'][f]})
    a['matrix'][0][0] = 99; a['cells'][0]['sourceVertexIds'][0] = 99
    assert matrix == pytest.approx(matrix_before); assert model == before


def test_large_observer_vectors_normalize_safely_and_unrepresentable_eye_rejects():
    result = classify_cells(tesseract(), direction=[0, 0, 0, 1e300]); assert result['frontCellIds'] == [7]
    result = classify_cells(tesseract(), projection='perspective', eye=[0, 0, 0, 1e200]); assert result['frontCellIds'] == [7]
    assert result['classificationTolerance'] == pytest.approx(1e192)
    with pytest.raises(GeometryError, match='finite arithmetic'):
        classify_cells(tesseract(), projection='perspective', eye=[1.7e308]*4)


@pytest.mark.parametrize('matrix', ([[1,2]], np.ones((4,4)), np.diag([-1,1,1,1]), np.diag([1,1,1,2]), [['bad']*4]*4, np.full((4,4),float('nan')), np.full((4,4),float('inf')), np.eye(4)*1e200))
def test_malformed_display_matrices_reject(matrix):
    with pytest.raises(GeometryError): classify_cells(tesseract(), matrix=matrix)


@pytest.mark.parametrize('vector', ([1,2,3], [0,0,0,float('nan')], [0,0,0,float('inf')], ['bad',0,0,0]))
def test_malformed_eyes_and_parallel_directions_reject(vector):
    with pytest.raises(GeometryError): classify_cells(tesseract(), direction=vector)
    with pytest.raises(GeometryError): classify_cells(tesseract(), projection='perspective', eye=vector)


def test_observer_option_ambiguity_and_tolerance_errors_are_explicit():
    model = tesseract()
    for kwargs in ({'projection':'unknown'}, {'eye':[0,0,0,3]}, {'direction':[0,0,0,0]}, {'projection':'perspective','direction':[0,0,0,1]}):
        with pytest.raises(GeometryError): classify_cells(model, **kwargs)
    for tolerance in (0, -1, .01, float('nan'), float('inf'), '1e-8', True):
        with pytest.raises(GeometryError): classify_cells(model, grazing_tolerance=tolerance)


def test_generalized_and_invalid_or_lower_rank_domains_are_never_convexified():
    generalized = tesseract(); generalized['interpretation'] = 'generalized-complex'; before = deepcopy(generalized)
    with pytest.raises(GeometryError, match='source-orientation semantics'): classify_cells(generalized)
    assert generalized == before
    for dimension, embedding in ((3,3),(4,3)):
        source = tesseract(); source['dimension'] = dimension; source['embeddingDimension'] = embedding
        with pytest.raises(GeometryError, match='intrinsic 4D'): classify_cells(source)
    bad = tesseract(); bad['vertices'] = [p[:3]+[0] for p in bad['vertices']]
    with pytest.raises(GeometryError, match='invalid convex source'): classify_cells(bad)
    bad = tesseract(); bad['cells'][0][0] = 99
    with pytest.raises(GeometryError, match='source face IDs'): classify_cells(bad)
    bad = tesseract(); bad['faces'][0] = 99
    with pytest.raises(GeometryError, match='incidence tables'): classify_cells(bad)
    bad = tesseract(); bad['edges'][0] = [0,99]
    with pytest.raises(GeometryError, match='invalid convex source'): classify_cells(bad)


@pytest.mark.parametrize('constant,limit', (('MAX_SOURCE_VERTICES',15),('MAX_SOURCE_INCIDENCES',1),('MAX_CELLS',7),('MAX_SUPPORT_TESTS',127),('MAX_CELL_VERTEX_VISITS',1)))
def test_explicit_caps_refuse_complete_result_instead_of_partial_masks(monkeypatch, constant, limit):
    import engine.cell_facing as module
    monkeypatch.setattr(module, constant, limit)
    with pytest.raises(GeometryError, match='resource limit'): classify_cells(tesseract())
