from copy import deepcopy
import json
import math
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.face_subdivision import subdivide_faces
from engine.sphere_projection import project_sphere
from engine.sphere_targets import reference_spheres
from engine.conway import conway, parse_notation
from engine.zonohedron_extensions import symmetry_axes, axis_zonohedron, add_zones
from engine.server import dispatch
from engine.recipes import run_recipe, replay_document, branch_recipe
from engine.formats import save_project, load_file


def counts(model):
    return [len(model[k]) for k in ('vertices', 'edges', 'faces')]


def document(model):
    return {'id': 'w12-doc', 'cursor': 0, 'states': [{'model': model, 'view': {}, 'notes': 'Keep notes.'}]}


@pytest.mark.parametrize(
    'notation,expected',
    [
        ('kC', [14, 36, 24]),
        ('aC', [12, 24, 14]),
        ('tI', [60, 90, 32]),
        ('jC', [14, 24, 12]),
        ('eC', [24, 48, 26]),
        ('dC', [6, 12, 8]),
    ],
)
def test_conway_counts(notation, expected):
    result = conway(regular('cube'), notation)
    assert counts(result) == expected
    assert result['interpretation'] == 'convex-polytope'
    assert validate(result)['passed']
    assert result['numeric']['certified'] is False


def test_parser_composition_and_refusal():
    assert parse_notation('atI') == {'operators': ['t', 'a'], 'seed': 'I'}
    assert parse_notation('dak') == {'operators': ['k', 'a', 'd'], 'seed': None}
    assert parse_notation('C') == {'operators': [], 'seed': 'C'}
    cube = regular('cube')
    assert counts(conway(cube, 'atI')) == [90, 180, 92]
    for text in ('', 'sC', 'gD', 'xC', 't(1/3)I', 'a C', 'c', 'I;exit', 'aaaaaaaaaC', None):
        with pytest.raises(GeometryError):
            parse_notation(text)
    with pytest.raises(GeometryError):
        conway(regular('tesseract'), 'a')
    with pytest.raises(GeometryError):
        conway(cube, 'k', height=True)
    for seed in ('T', 'C', 'O', 'D', 'I'):
        result = conway(cube, 'k' + seed)
        assert result['interpretation'] == 'convex-polytope'
        assert result['metadata']['conway']['steps'][0]['heightAttempts'] >= 1


def test_kis_centroid_midpoint_counts_and_shared_vertices():
    cube = regular('cube')
    original = deepcopy(cube)
    assert counts(subdivide_faces(cube, 'kis', 0.5)) == [14, 36, 24]
    assert counts(subdivide_faces(cube, 'centroid')) == [14, 36, 24]
    split = subdivide_faces(cube, 'midpoint')
    assert counts(split) == [26, 48, 24]
    assert all(len(f) == 4 for f in split['faces'])
    assert split['vertices'][:8] == cube['vertices']
    assert len({tuple(v) for v in split['vertices']}) == 26
    assert cube == original


def test_rgba_units_and_source_face_mapping():
    cube = regular('cube')
    cube['metadata']['coordinateUnits'] = 'mm'
    colors = [{'encoding': 'unit', 'values': [i / 6, 0.2, 0.3, 0.4]} for i in range(6)]
    cube['metadata']['offColors'] = {'faces': colors, 'cells': []}
    result = subdivide_faces(cube, 'midpoint')
    mapping = result['metadata']['faceSubdivision']['sourceFaceIds']
    assert result['metadata']['coordinateUnits'] == 'mm'
    assert result['metadata']['offColors']['faces'] == [colors[i] for i in mapping]
    assert all(mapping.count(i) == 4 for i in range(6))
    cube['metadata']['offColors']['faces'] = None
    assert 'offColors' not in subdivide_faces(cube, 'midpoint')['metadata']


@pytest.mark.parametrize(
    'method,height', [('unknown', 0), ('centroid', 1), ('midpoint', 1), ('kis', -1), ('kis', True), ('kis', math.inf)]
)
def test_subdivision_control_refusals(method, height):
    with pytest.raises(GeometryError):
        subdivide_faces(regular('cube'), method, height)


def test_star_concave_nonplanar_and_compound_refusals():
    with pytest.raises(GeometryError, match='star|crossing'):
        subdivide_faces(regular('small-stellated-dodecahedron'))
    cube = regular('cube')
    cube['vertices'][0][0] += 0.2
    with pytest.raises(GeometryError, match='planar'):
        subdivide_faces(cube)
    cube = regular('cube')
    cube['components'] = []
    with pytest.raises(GeometryError, match='compound'):
        subdivide_faces(cube)
    concave = {
        'id': 'concave',
        'name': 'Concave polygon',
        'dimension': 3,
        'embeddingDimension': 3,
        'interpretation': 'generalized-complex',
        'vertices': [[0, 0, 0], [2, 0, 0], [1, 0.5, 0], [2, 2, 0], [0, 2, 0]],
        'faces': [[0, 1, 2, 3, 4]],
        'edges': [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
        'cells': [],
    }
    with pytest.raises(GeometryError, match='concave'):
        subdivide_faces(concave)


@pytest.mark.parametrize(
    'sphere,radius', [('circumsphere', math.sqrt(3)), ('midsphere', math.sqrt(2)), ('insphere', 1)]
)
def test_named_reference_spheres_after_cube_subdivision(sphere, radius):
    split = subdivide_faces(regular('cube'), 'centroid')
    result = project_sphere(split, sphere=sphere)
    assert counts(result) == counts(split)
    np.testing.assert_allclose(np.linalg.norm(result['vertices'], axis=1), radius, atol=1e-10)
    assert result['metadata']['sphereProjection']['referenceSphere'] == sphere
    with pytest.raises(GeometryError):
        project_sphere(split, sphere=sphere, radius=2)


def test_frequency_two_icosahedron_projection_and_geodesic_equivalence():
    ico = regular('icosahedron')
    split = subdivide_faces(ico, 'midpoint')
    assert counts(split) == [42, 120, 80]
    projected = project_sphere(split, sphere='circumsphere')
    assert counts(projected) == [42, 120, 80]
    assert projected['faces'] == split['faces'] and projected['edges'] == split['edges']
    variation = projected['metadata']['sphereProjection']['edgeVariation']
    assert variation['maxMinRatio'] == pytest.approx(1.1308263606396562)
    assert variation['coefficientOfVariation'] == pytest.approx(0.0613970068402859)
    geodesic = dispatch({'op': 'triangular-geodesic', 'model': ico, 'params': {'frequency': 2}})
    assert counts(geodesic) == counts(projected)
    a = sorted(tuple(np.round(row, 9)) for row in projected['vertices'])
    b = sorted(tuple(np.round(row, 9)) for row in geodesic['vertices'])
    assert a == b


def test_reference_sphere_is_not_inherited_after_unrelated_geometry_edit():
    split = subdivide_faces(regular('icosahedron'), 'midpoint')
    assert 'circumsphere' in reference_spheres(split)
    split['vertices'][0][0] += 0.01
    with pytest.raises(GeometryError, match='No checked common'):
        project_sphere(split, sphere='circumsphere')


@pytest.mark.parametrize(
    'key,fold,count',
    [('cube', 2, 6), ('cube', 3, 4), ('icosahedron', 2, 15), ('icosahedron', 3, 10), ('icosahedron', 5, 6)],
)
def test_symmetry_axis_types(key, fold, count):
    report = symmetry_axes(regular(key), fold)
    assert report['count'] == count and report['complete']
    assert report['maximumAxisResidual'] < 1e-7


def test_axis_zonohedron_and_selection():
    cube = regular('cube')
    result = axis_zonohedron(cube, 3)
    assert counts(result) == [14, 24, 12]
    assert all(len(face) == 4 for face in result['faces'])
    assert result['metadata']['axisZonohedron']['allOfType']
    assert counts(axis_zonohedron(cube, 3, [0, 1, 2])) == [8, 12, 6]
    assert counts(axis_zonohedron(regular('icosahedron'), 5)) == [32, 60, 30]
    numerical = axis_zonohedron(regular('icosahedron'), 2)
    assert counts(numerical) == [120, 180, 62]
    assert numerical['metadata']['axisZonohedron']['maximumSupportResidual'] < 1e-7
    assert 'numerical Minkowski' in numerical['metadata']['axisZonohedron']['constructionMethod']
    for fold, ids in [(5, None), (3, [0, 0]), (3, [999]), (3, [True]), (4, None)]:
        with pytest.raises(GeometryError):
            axis_zonohedron(cube, fold, ids)


def test_zone_addition_preserves_position_and_existing_lengths():
    cube = regular('cube')
    original = deepcopy(cube)
    result = add_zones(cube, [[1, 0, 0]], 2)
    assert counts(result) == [8, 12, 6]
    np.testing.assert_allclose(np.ptp(result['vertices'], axis=0), [4, 2, 2])
    assert counts(add_zones(cube, [[1, 1, 1]])) == [14, 24, 12]
    assert cube == original
    translated = deepcopy(cube)
    translated['vertices'] = (np.asarray(cube['vertices']) + [10, 20, 30]).tolist()
    translated.pop('facetEquations', None)
    translated.pop('facetVertices', None)
    result = add_zones(translated, [[1, 1, 1]])
    np.testing.assert_allclose(np.mean(result['vertices'], axis=0), [10, 20, 30])
    for source, directions in [
        (regular('tetrahedron'), [[1, 0, 0]]),
        (cube, [[0, 0, 0]]),
        (cube, [[True, 0, 0]]),
        (cube, []),
    ]:
        with pytest.raises(GeometryError):
            add_zones(source, directions)


@pytest.mark.parametrize(
    'operation,params',
    [
        ('subdivide-faces', {'method': 'midpoint'}),
        ('conway', {'notation': 'tI'}),
        ('axis-zonohedron', {'fold': 3}),
        ('add-zones', {'directions': [[1, 1, 1]]}),
    ],
)
def test_history_save_open_replay_branch_and_source_unchanged(operation, params, tmp_path):
    doc = document(regular('cube'))
    before = deepcopy(doc)
    edited = run_recipe(doc, operation, params, dispatch)
    assert doc == before and edited['cursor'] == 1 and len(edited['states']) == 2
    assert edited['states'][1]['notes'] == 'Keep notes.'
    file = tmp_path / 'w12.polyproj'
    save_project(file, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [edited]})
    opened = load_file(file)['project']['documents'][0]
    replayed = replay_document(opened, dispatch)
    expected = opened['states'][1]['model']
    actual = replayed['states'][0]['model']
    assert identity(actual) == identity(expected)
    assert json.dumps(actual['metadata'], sort_keys=True) == json.dumps(expected['metadata'], sort_keys=True)
    branched = branch_recipe(opened, params, dispatch)
    assert identity(branched['states'][branched['cursor']]['model']) == identity(expected)


def test_subdivide_project_chain_history_and_unsupported_dispatch_controls():
    doc = run_recipe(document(regular('icosahedron')), 'subdivide-faces', {'method': 'midpoint'}, dispatch)
    doc = run_recipe(doc, 'sphere-project', {'sphere': 'circumsphere'}, dispatch)
    assert counts(replay_document(doc, dispatch)['states'][0]['model']) == [42, 120, 80]
    for op in ('subdivide-faces', 'conway', 'axis-zonohedron', 'add-zones', 'symmetry-axes'):
        with pytest.raises(GeometryError):
            dispatch({'op': op, 'model': regular('cube'), 'params': {'bogus': 1}})
        with pytest.raises(GeometryError):
            dispatch({'op': op, 'model': regular('cube'), 'params': {}, 'algorithmVersion': '99'})


def test_numerical_axis_realization_replays_and_zero_height_keeps_wires():
    doc = run_recipe(document(regular('icosahedron')), 'axis-zonohedron', {'fold': 2}, dispatch)
    assert counts(replay_document(doc, dispatch)['states'][0]['model']) == [120, 180, 62]
    cube = regular('cube')
    cube['interpretation'] = 'generalized-complex'
    cube['vertices'].append([3, 3, 3])
    cube['edges'].append([0, 8])
    result = subdivide_faces(cube, 'midpoint')
    assert [0, 8] in result['edges'] and result['vertices'][8] == [3, 3, 3]
