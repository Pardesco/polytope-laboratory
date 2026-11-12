from copy import deepcopy
from itertools import product
import json
import numpy as np
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.stellation import arrangement, region_union, enumerate_unions
from engine.stellation_cells import cell_graph
from engine.stellation_diagrams import diagram_data
from engine.server import dispatch
from engine.formats import validate_project

PLANES = [[2, 0, 0, -2], [-1, 0, 0, -1], [0, 1, 0, -1], [0, -1, 0, -1], [0, 0, 1, -1], [0, 0, -1, -1]]
ORBITS = [[19, 51], [30, 54], [39, 56], [44, 57], [58]]


@pytest.fixture(scope='module')
def octa():
    m = regular('octahedron')
    a = arrangement(m)
    return m, a, diagram_data(a, m, generator_ids=[8])


def test_editor_subgroup_has_independent_reflection_orbits_and_source_matrix(octa):
    m, a, g = octa
    s = g['symmetry']
    reflection = next(x for x in s['actions'] if x['sourceActionId'] == 8)
    assert np.asarray(reflection['matrix']) == pytest.approx(np.diag([-1, 1, 1]))
    assert s['subgroup']['order'] == 2 and s['subgroup']['complete']
    assert s['orbits']['subgroup'] == ORBITS
    assert s['actingOrder'] == s['sourceOrder'] == 48 and s['preservesFullGroup']
    # Analytic octahedron x/y/z intercepts ±1: core plus eight corner tetrahedra.
    corners = list(product((-0.5, 0.5), repeat=3))
    ids = [19, 30, 39, 44, 51, 54, 56, 57]
    for i, center in zip(ids, corners):
        assert a['regions'][i]['centroid'] == pytest.approx(center)
    assert a['regions'][58]['centroid'] == pytest.approx([0, 0, 0])
    mapping = dict(zip(s['regionIds'], reflection['regionIds']))
    assert mapping == {19: 51, 30: 54, 39: 56, 44: 57, 51: 19, 54: 30, 56: 39, 57: 44, 58: 58}
    assert all(mapping[mapping[i]] == i for i in mapping)
    assert s['maxVertexResidual'] < 1e-8 and not s['certified']


def test_subgroup_allowed_unions_equal_independently_exhausted_pair_sets(octa):
    m, a, g = octa
    result = enumerate_unions(a, m, symmetry_options={'generator_ids': [8]})
    expected = {
        tuple(sorted([58] + [i for k, pair in enumerate(ORBITS[:4]) if mask & (1 << k) for i in pair]))
        for mask in range(16)
    }
    assert {tuple(c['regionIds']) for c in result['candidates']} == expected
    assert result['totalOrbitSubsets'] == 32 and result['completeWithinDeclaredCriteria']
    assert not result['group']['fullSourceGroupVerified']
    assert region_union(a, [19, 51], source=m)['measure']['content'] == pytest.approx(2 / 3)


def test_editor_identity_and_proper_variants_remain_distinct(octa):
    m, a, g = octa
    trivial = diagram_data(a, m, generator_ids=[])
    assert trivial['symmetry']['subgroup']['order'] == 1
    assert trivial['symmetry']['orbits']['subgroup'] == [[i] for i in [19, 30, 39, 44, 51, 54, 56, 57, 58]]
    assert sorted(map(len, g['symmetry']['orbits']['full'])) == [1, 8]
    assert sorted(map(len, g['symmetry']['orbits']['proper'])) == [1, 8]
    with pytest.raises(GeometryError):
        diagram_data(a, m, generator_ids=[999])


def test_arbitrary_source_binding_retains_entered_coefficients_and_safe_union():
    source = regular('cube')
    before = deepcopy(source)
    a = arrangement(source, planes=PLANES, bounds=[[-3, -3, -3], [3, 3, 3]])
    assert source == before and a['parameters']['planes'] == PLANES
    assert a['source']['planeMode'] == 'arbitrary' and a['source']['fingerprint'] == identity(source)
    assert len(a['regions']) == 27 and a['validation']['partitionVolume'] == pytest.approx(216)
    g = cell_graph(a, source)
    enclosed = [r['id'] for r in g['nodes'] if r['selectable']]
    assert len(enclosed) == 1 and g['completeWithinObservedFacetDomain']
    assert region_union(a, enclosed, source=source)['measure']['content'] == pytest.approx(8)
    with pytest.raises(GeometryError, match='Original-seed'):
        enumerate_unions(a, source)
    assert len(enumerate_unions(a, source, include_seed=False)['candidates']) == 1
    altered = deepcopy(a)
    altered['parameters']['planes'][0][3] = -1
    with pytest.raises(GeometryError, match='recorded parameters'):
        cell_graph(altered, source)


def test_arbitrary_octants_and_region_budget_use_existing_dispatch():
    m = regular('cube')
    params = {'planes': [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]], 'bounds': [[-1, -1, -1], [1, 1, 1]]}
    a = dispatch({'op': 'arrangement', 'model': m, 'params': params})
    assert len(a['regions']) == 8
    assert {tuple(r['signs']) for r in a['regions']} == set(product((-1, 1), repeat=3))
    assert all(r['volume'] == pytest.approx(1) and r['boundedness'] == 'unbounded-numerical' for r in a['regions'])
    assert a['completeWithinDeclaredDomain'] and not a['unrestrictedEnumerationComplete']
    with pytest.raises(GeometryError, match='no result was committed'):
        arrangement(m, **params, max_regions=7)
    with pytest.raises(GeometryError, match='3D reference'):
        arrangement(regular('tesseract'), **params)


@pytest.mark.parametrize('arbitrary', [False, True])
def test_plane_settings_subgroup_selection_and_promoted_model_survive_project_replay(octa, arbitrary):
    m, a, g = octa
    if arbitrary:
        a = arrangement(m, planes=PLANES, bounds=[[-3, -3, -3], [3, 3, 3]])
    selection = [r['id'] for r in a['regions'] if r['boundedness'] == 'bounded-numerical'] if arbitrary else [19, 51]
    params = {'region_signs': [a['regions'][i]['signs'] for i in selection], 'bounds': a['bounds'], 'box_scale': 3}
    if arbitrary:
        params['planes'] = PLANES
    view = {
        'derivedMode': 'stellation',
        'stellation': {'diagramGeneratorIds': [8], 'diagramSymmetry': 'subgroup', 'selectedRegions': selection},
    }
    if arbitrary:
        view['stellation'].update(
            planeMode='arbitrary',
            arbitraryPlanes=PLANES,
            arbitraryBounds=a['bounds'],
            arbitraryPlaneText='2, 0, 0, -sqrt(4)',
            arbitraryBoundsText=['-3,-3,-3', '3,3,3'],
            maxRegions=2048,
        )
    doc = {
        'id': 'input',
        'cursor': 0,
        'states': [{'model': m, 'view': view, 'notes': 'source notes', 'arrangement': a}],
    }
    result = dispatch(
        {'op': 'recipe-run', 'params': {'document': doc, 'operation': 'stellation-make-base', 'parameters': params}}
    )
    saved = validate_project(
        json.loads(json.dumps({'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]}))
    )['documents'][0]
    assert saved['states'][0]['view'] == view and saved['states'][1]['notes'] == 'source notes'
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': saved}})
    assert identity(replay['states'][0]['model']) == identity(saved['states'][1]['model'])
    graph = diagram_data(saved['states'][0]['arrangement'], m, generator_ids=[8])
    assert graph['symmetry']['subgroup']['order'] == 2


def test_subgroup_refuses_a_box_that_does_not_preserve_requested_action():
    m = regular('dodecahedron')
    a = arrangement(m)
    g = diagram_data(a, m)
    preserved = {x['sourceActionId'] for x in g['symmetry']['actions']}
    missing = next(i for i in range(120) if i not in preserved)
    with pytest.raises(GeometryError, match='does not preserve every'):
        diagram_data(a, m, generator_ids=[missing])
