"""Independent coordinate/incidence and analytic planar-union expectations."""
from copy import deepcopy
import math

import pytest

import engine.face_blending as editing
from engine.face_blending import analyze_coincidences, remove_coincident_pairs, blend_faces
from engine.compounds import add_models
from engine.geometry import GeometryError, validate


def model(points, faces, dimension=2):
    edges = sorted({tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:]+f[:1])})
    result = {'id': 'fixture', 'name': 'Literal face fixture', 'dimension': dimension,
              'embeddingDimension': len(points[0]), 'interpretation': 'generalized-complex',
              'vertices': deepcopy(points), 'edges': [list(e) for e in edges], 'faces': deepcopy(faces), 'cells': [],
              'metadata': {'originalAttribute': 'keep'}, 'numeric': {'certified': False}}
    assert validate(result)['passed']
    return result


def square():
    return model([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1, 2, 3]])


def cube():
    return model([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
                 [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5],
                  [2, 3, 7, 6], [3, 0, 4, 7]], 3)


def test_coincident_double_cube_pairs_without_implicit_welding_or_mutation():
    source = add_models(cube(), cube())
    original = deepcopy(source)
    evidence = analyze_coincidences(source)
    assert evidence['pairs'] == [[i, i+6] for i in range(6)]
    assert len(evidence['groups']) == 6 and not evidence['welding']['applied']
    result = remove_coincident_pairs(source)
    assert result['vertices'] == source['vertices'] and result['edges'] == source['edges']
    assert result['faces'] == [] and result['validation']['passed']
    assert result['metadata']['faceEditing']['sourceMaps']['faces'] == [[]]*12
    assert result['metadata']['faceEditing']['sourceModel'] == source
    assert source == original and 'measure' not in result


def test_triple_faces_pair_deterministically_and_preserve_last_rgba():
    source = model(square()['vertices'], [[0, 1, 2, 3], [3, 2, 1, 0], [2, 3, 0, 1]])
    color = {'encoding': 'byte', 'values': [10, 20, 30, 128]}
    source['metadata']['offColors'] = {'faces': [None, None, color], 'cells': []}
    evidence = analyze_coincidences(source)
    assert evidence['pairs'] == [[0, 1]] and evidence['unpairedFaceIds'] == [2]
    result = remove_coincident_pairs(source)
    assert result['faces'] == [[2, 3, 0, 1]]
    assert result['metadata']['offColors']['faces'] == [color]
    assert result['metadata']['faceEditing']['sourceMaps']['faces'] == [[], [], [0]]


def test_same_coordinate_set_with_different_cyclic_adjacency_is_not_coincidence():
    points = [[math.cos(2*math.pi*i/5), math.sin(2*math.pi*i/5)] for i in range(5)]
    source = model(points, [[0, 1, 2, 3, 4], [0, 2, 4, 1, 3]])
    assert analyze_coincidences(source)['pairs'] == []
    assert remove_coincident_pairs(source)['faces'] == source['faces']


def test_near_faces_require_explicit_tolerance_and_weld_requires_explicit_policy():
    other = square()
    other['vertices'] = [[x+1e-5, y] for x, y in other['vertices']]
    source = add_models(square(), other)
    assert analyze_coincidences(source)['pairs'] == []
    assert analyze_coincidences(source, 1e-4)['pairs'] == [[0, 1]]
    untouched = remove_coincident_pairs(source, 1e-4)
    assert untouched['vertices'] == source['vertices'] and len(untouched['edges']) == 8
    welded = remove_coincident_pairs(source, 1e-4, weld=True)
    assert welded['vertices'] == square()['vertices'] and len(welded['edges']) == 4
    maps = welded['metadata']['faceEditing']['sourceMaps']
    assert maps['vertices'] == [0, 1, 2, 3, 0, 1, 2, 3]
    assert maps['edges'][:4] == maps['edges'][4:]
    assert welded['provenance']['parameters']['coordinateWeld']


@pytest.mark.parametrize('tolerance', [-1, math.nan, math.inf, True, '0', 10**500])
def test_invalid_tolerance_rejected(tolerance):
    with pytest.raises(GeometryError, match='tolerance'):
        analyze_coincidences(square(), tolerance)


def test_collapsed_weld_and_malformed_source_are_diagnosed():
    with pytest.raises(GeometryError, match='collapses'):
        analyze_coincidences(square(), 2)
    invalid = square()
    invalid['faces'][0][1] = 99
    with pytest.raises(GeometryError, match='source incidence'):
        remove_coincident_pairs(invalid)
    with pytest.raises(GeometryError, match='boolean'):
        remove_coincident_pairs(square(), weld='yes')


def test_welding_resource_budget_is_explicit(monkeypatch):
    source = square()
    source['vertices'].append([.01, .01])
    monkeypatch.setattr(editing, 'MAX_WELD_COMPARISONS', 0)
    with pytest.raises(GeometryError, match='resource limit'):
        analyze_coincidences(source, .1)


def tiles(coordinates, embedding=2):
    points, ids, faces = [], {}, []
    for x, y in coordinates:
        face = []
        for point in ((x, y), (x+1, y), (x+1, y+1), (x, y+1)):
            if point not in ids:
                ids[point] = len(points)
                points.append(list(point)+[0]*(embedding-2))
            face.append(ids[point])
        faces.append(face)
    return model(points, faces, embedding)


def boundary_coordinates(source, face):
    return {tuple(sorted((tuple(source['vertices'][a]), tuple(source['vertices'][b]))))
            for a, b in zip(face, face[1:]+face[:1])}


def signed_xy_area(points):
    return sum(a[0]*b[1]-a[1]*b[0] for a, b in zip(points, points[1:]+points[:1]))/2


@pytest.mark.parametrize('embedding', [2, 3, 4])
def test_adjacent_unit_squares_blend_shared_edge_and_preserve_literal_vertices(embedding):
    source = tiles([(0, 0), (1, 0)], embedding)
    original = deepcopy(source)
    result = blend_faces(source, [1, 0])
    assert result['vertices'] == source['vertices'] and len(result['vertices']) == 6
    assert len(result['edges']) == 6 and len(result['faces']) == 1
    xy = [result['vertices'][v] for v in result['faces'][0]]
    assert abs(signed_xy_area(xy)) == pytest.approx(2)
    assert result['validation']['passed'] and result['dimension'] == embedding
    maps = result['metadata']['faceEditing']['sourceMaps']
    assert maps['faces'] == [[0], [0]] and maps['edges'].count(None) == 1
    assert result['metadata']['faceEditing']['faceSources'] == [[0, 1]]
    assert source == original and 'measure' not in result


def test_three_square_l_preserves_concavity_and_analytic_area_membership():
    source = tiles([(0, 0), (1, 0), (0, 1)])
    result = blend_faces(source, [0, 1, 2])
    assert len(result['faces']) == 1 and len(result['edges']) == 8
    polygon = [result['vertices'][v] for v in result['faces'][0]]
    expected = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 1]]
    assert boundary_coordinates(result, result['faces'][0]) == boundary_coordinates(model(expected, [list(range(8))]), list(range(8)))
    assert abs(signed_xy_area(polygon)) == pytest.approx(3)
    # Triangulate the independent L boundary as three literal rectangles, not a hull.
    assert [1, 1] in polygon and [2, 2] not in polygon
    import numpy as np
    for point, inside in (([.5, .5], True), ([1.5, .5], True), ([.5, 1.5], True), ([1.5, 1.5], False), ([3, 3], False)):
        assert (editing._membership(np.array(point), np.array(polygon)) == 1) == inside


def test_disconnected_regions_remain_separate_faces_and_lineages():
    source = tiles([(0, 0), (1, 0), (5, 0), (6, 0)])
    result = blend_faces(source, [0, 1, 2, 3])
    assert len(result['faces']) == 2
    assert result['metadata']['faceEditing']['faceSources'] == [[0, 1], [2, 3]]
    assert result['metadata']['faceEditing']['sourceMaps']['faces'] == [[0], [0], [1], [1]]
    assert result['metadata']['faceEditing']['evidence']['disconnectedRegions'] == 2
    assert sum(abs(signed_xy_area([result['vertices'][v] for v in face])) for face in result['faces']) == pytest.approx(4)


def test_six_quadrilateral_annulus_hole_diagnosed_without_filling_or_mutation():
    outer = [[2*math.cos(i*math.pi/3), 2*math.sin(i*math.pi/3)] for i in range(6)]
    inner = [[math.cos(i*math.pi/3), math.sin(i*math.pi/3)] for i in range(6)]
    faces = [[i, (i+1)%6, (i+1)%6+6, i+6] for i in range(6)]
    source = model(outer+inner, faces)
    original = deepcopy(source)
    with pytest.raises(GeometryError, match='hole'):
        blend_faces(source, list(range(6)))
    assert source == original


def test_compound_adjacent_faces_require_explicit_coordinate_weld_and_map_all_sources():
    other = square()
    other['vertices'] = [[x+1, y] for x, y in other['vertices']]
    source = add_models(square(), other)
    with pytest.raises(GeometryError, match='welding'):
        blend_faces(source, [0, 1])
    result = blend_faces(source, [0, 1], weld=True)
    assert len(result['vertices']) == 6 and len(result['edges']) == 6
    assert result['metadata']['faceEditing']['sourceMaps']['vertices'] == [0, 1, 2, 3, 1, 4, 5, 2]
    assert result['metadata']['faceEditing']['evidence']['coordinateWeld']


def test_near_adjacent_compound_faces_only_merge_under_requested_tolerance():
    other = square()
    other['vertices'] = [[x+1+1e-5, y] for x, y in other['vertices']]
    source = add_models(square(), other)
    separate = blend_faces(source, [0, 1], weld=True)
    assert len(separate['faces']) == 2 and len(separate['vertices']) == 8
    merged = blend_faces(source, [0, 1], 1e-4, weld=True)
    assert len(merged['faces']) == 1 and len(merged['vertices']) == 6
    assert source['vertices'][-1] == [1+1e-5, 1]


def test_blended_color_policy_explicit_and_unselected_attributes_offset_correctly():
    source = tiles([(0, 0), (1, 0), (5, 0)])
    first = {'encoding': 'byte', 'values': [255, 0, 30, 128]}
    second = {'encoding': 'unit', 'values': [0., .4, .2, .25]}
    source['metadata']['offColors'] = {'faces': [first, second, None], 'cells': []}
    with pytest.raises(GeometryError, match='different source colors'):
        blend_faces(source, [0, 1])
    result = blend_faces(source, [1, 0], color_policy='first-source')
    assert result['metadata']['offColors']['faces'] == [first, None]
    assert result['metadata']['faceEditing']['sourceMaps']['faces'] == [[0], [0], [1]]
    assert result['metadata']['faceEditing']['sourceModel']['metadata'] == source['metadata']
    source['metadata']['offColors']['faces'][1] = deepcopy(first)
    assert blend_faces(source, [0, 1])['metadata']['offColors']['faces'][0] == first


@pytest.mark.parametrize('ids', [[], [0], [0, 0], [0, 2], [0, True], 'all'])
def test_invalid_selected_face_ids_diagnosed(ids):
    with pytest.raises(GeometryError, match='face IDs'):
        blend_faces(tiles([(0, 0), (1, 0)]), ids)


def test_nonplanar_plane_shared_vertex_only_and_overlapping_cases_diagnosed():
    planes = add_models(model([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2, 3]], 3),
                        model([[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 1, 2, 3]], 3))
    with pytest.raises(GeometryError, match='coplanar'):
        blend_faces(planes, [0, 1], weld=True)
    with pytest.raises(GeometryError, match='shared vertex'):
        blend_faces(tiles([(0, 0), (1, 1)]), [0, 1])
    with pytest.raises(GeometryError, match='coincide'):
        blend_faces(add_models(square(), square()), [0, 1], weld=True)
    with pytest.raises(GeometryError, match='cross|overlap|nonconforming'):
        blend_faces(tiles([(0, 0), (.5, .5)]), [0, 1])


def test_star_face_blending_diagnosed_but_analysis_preserves_star_adjacency():
    points = [[math.cos(2*math.pi*i/5), math.sin(2*math.pi*i/5)] for i in range(5)]
    source = model(points, [[0, 2, 4, 1, 3], [0, 1, 2, 3, 4]])
    assert analyze_coincidences(source)['pairs'] == []
    with pytest.raises(GeometryError, match='Star|self-intersecting'):
        blend_faces(source, [0, 1])


def test_blend_budgets_and_policy_validation(monkeypatch):
    source = tiles([(0, 0), (1, 0)])
    with pytest.raises(GeometryError, match='color policy'):
        blend_faces(source, [0, 1], color_policy='average')
    monkeypatch.setattr(editing, 'MAX_BLEND_CORNERS', 7)
    with pytest.raises(GeometryError, match='corner resource'):
        blend_faces(source, [0, 1])
    monkeypatch.setattr(editing, 'MAX_BLEND_CORNERS', 4096)
    monkeypatch.setattr(editing, 'MAX_SEGMENT_COMPARISONS', 0)
    with pytest.raises(GeometryError, match='segment-comparison resource'):
        blend_faces(source, [0, 1])


def test_reversed_source_winding_does_not_change_union_membership():
    source = tiles([(0, 0), (1, 0)])
    original = blend_faces(source, [0, 1])
    source['faces'][1].reverse()
    result = blend_faces(source, [0, 1])
    assert boundary_coordinates(result, result['faces'][0]) == boundary_coordinates(original, original['faces'][0])


def cell_with_split_face():
    original = cube()
    faces = [[0, 3, 2], [0, 2, 1]]+original['faces'][1:]
    source = model([p+[0] for p in original['vertices']], faces, 4)
    source['cells'] = [list(range(7))]
    assert validate(source)['passed']
    return source


def test_4d_cell_boundary_and_cell_rgba_remapped_only_with_equal_membership():
    source = cell_with_split_face()
    rgba = {'encoding': 'byte', 'values': [50, 80, 120, 128]}
    source['metadata']['offColors'] = {'faces': [None]*7, 'cells': [rgba]}
    result = blend_faces(source, [0, 1])
    assert len(result['faces']) == 6 and result['cells'] == [list(range(6))]
    assert result['metadata']['offColors']['cells'] == [rgba]
    assert result['metadata']['faceEditing']['sourceMaps']['cells'] == [0]
    assert result['validation']['passed']
    source['cells'] = [[0]+list(range(2, 7)), [1]+list(range(2, 7))]
    source['metadata'].pop('offColors')
    assert validate(source)['passed']
    with pytest.raises(GeometryError, match='distinct source cell'):
        blend_faces(source, [0, 1])


def test_4d_pair_removal_reports_empty_cell_deletion_explicitly():
    one = cell_with_split_face()
    source = add_models(one, one)
    result = remove_coincident_pairs(source)
    assert result['faces'] == [] and result['cells'] == []
    assert result['vertices'] == source['vertices'] and result['edges'] == source['edges']
    assert result['metadata']['faceEditing']['sourceMaps']['cells'] == [None, None]
    assert result['validation']['passed']


def test_output_face_and_payload_budgets_are_enforced(monkeypatch):
    source = tiles([(0, 0), (1, 0)])
    monkeypatch.setattr(editing, 'MAX_FACE_VERTICES', 5)
    with pytest.raises(GeometryError, match='face-boundary resource'):
        blend_faces(source, [0, 1])
    monkeypatch.setattr(editing, 'MAX_FACE_VERTICES', 2048)
    monkeypatch.setattr(editing, 'MAX_PAYLOAD_BYTES', 10)
    with pytest.raises(GeometryError, match='payload resource'):
        remove_coincident_pairs(source)


def test_result_metadata_and_colors_have_no_aliases_to_sources():
    source = tiles([(0, 0), (1, 0)])
    source['metadata']['offColors'] = {'faces': [{'encoding': 'byte', 'values': [1, 2, 3, 100]}]*2, 'cells': []}
    original = deepcopy(source)
    result = blend_faces(source, [0, 1])
    result['metadata']['offColors']['faces'][0]['values'][0] = 255
    result['metadata']['faceEditing']['sourceModel']['vertices'][0][0] = 20
    assert source == original


def test_simple_concave_input_polygon_can_blend_without_convexification():
    source = model([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [2, 2]],
                   [[0, 1, 2, 3, 4, 5], [3, 2, 6, 4]])
    result = blend_faces(source, [0, 1])
    assert len(result['faces']) == 1
    polygon = [result['vertices'][v] for v in result['faces'][0]]
    assert abs(signed_xy_area(polygon)) == pytest.approx(4)
    assert [1, 1] not in polygon and len(result['vertices']) == 7


def test_six_square_staircase_retains_concave_notches_and_area_six():
    source = tiles([(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (0, 2)])
    result = blend_faces(source, list(range(6)))
    polygon = [result['vertices'][v] for v in result['faces'][0]]
    assert len(result['faces']) == 1 and abs(signed_xy_area(polygon)) == pytest.approx(6)
    assert [2, 1] in polygon and [1, 2] in polygon and [3, 3] not in polygon
