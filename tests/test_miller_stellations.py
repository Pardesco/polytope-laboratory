from copy import deepcopy
import json
import pytest
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.stellation import arrangement
from engine.stellation_cells import inaccessible_regions
from engine.stellation_diagrams import diagram_data
from engine.miller_stellations import enumerate_miller, miller_criterion, cell_label, CELL_TYPES
from engine.server import dispatch
from engine.formats import validate_project


@pytest.fixture(scope='module')
def ico():
    m = regular('icosahedron')
    a = arrangement(m, box_scale=10)
    g = diagram_data(a, m)
    return m, a, g


@pytest.fixture
def search(ico, monkeypatch):
    m, a, g = ico
    monkeypatch.setattr('engine.miller_stellations.diagram_data', lambda *_: g)
    return enumerate_miller(a, m)


def test_exhausted_59_and_independent_published_cell_code_list(search):
    expected = {
        1,
        3,
        7,
        15,
        16,
        31,
        32,
        47,
        63,
        64,
        80,
        95,
        96,
        111,
        127,
        192,
        208,
        223,
        255,
        256,
        288,
        303,
        319,
        352,
        367,
        383,
        511,
        512,
        576,
        592,
        607,
        608,
        623,
        639,
        704,
        720,
        735,
        767,
        864,
        879,
        895,
        1023,
        1024,
        1088,
        1104,
        1119,
        1280,
        1312,
        1327,
        1343,
        1344,
        1360,
        1375,
        1376,
        1391,
        1407,
        1535,
        2047,
        4095,
    }
    assert {r['cellCode'] for r in search['candidates']} == expected
    assert search['counts'] == {'reflexible': 32, 'chiral': 27}
    assert search['subsetsEvaluated'] == search['totalOrbitSubsets'] == 4095
    assert search['criteria']['millerRules'] and search['completeWithinDeclaredCriteria']
    assert search['termination'] == 'exhausted' and not search['certified']
    assert not search['unrestrictedStellationEnumerationComplete']
    assert search['maxVertexResidual'] < search['tolerance']
    assert sum(miller_criterion(code)['accepted'] for code in range(1, 4096)) == 86


@pytest.mark.parametrize(
    'index,label,types,count',
    [
        (1, 'A', ['a'], 1),
        (2, 'B', ['a', 'b'], 21),
        (3, 'C', ['a', 'b', 'c'], 51),
        (7, 'G', list(CELL_TYPES[:-1]), 413),
        (8, 'H', list(CELL_TYPES), 473),
        (9, 'e1', ['e1'], 20),
        (10, 'f1*', ['f1', "f1'"], 120),
        (16, 'f2', ['f2'], 12),
        (21, 'De1', ['a', 'b', 'c', 'd', 'e1'], 131),
        (33, 'f1', ['f1'], 60),
        (47, 'Ef1', ['a', 'b', 'c', 'd', 'e1', 'e2', 'f1'], 251),
    ],
)
def test_named_stellations(search, index, label, types, count):
    row = search['candidates'][index - 1]
    assert (row['bookIndex'], row['coxeterLabel'], row['cellTypes'], row['regionCount']) == (index, label, types, count)


def test_five_rules_have_distinct_effects_and_mirror_exception():
    assert not miller_criterion(2)['accessible']  # b alone hides the central cavity
    assert not miller_criterion(16 | 256)['accepted']  # e1 + f2: separated symmetric shells
    assert miller_criterion(16)['accepted'] and miller_criterion(256)['accepted']
    pair = miller_criterion(192)
    assert pair['accepted'] and pair['enantiomorphicPairException'] and pair['symmetricShellComponents'] == 2
    assert not miller_criterion(64)['reflexible'] and miller_criterion(192)['reflexible']
    assert not miller_criterion(95 | 256)['accepted']  # lost De1f1f2 has only edge contacts
    for invalid in (0, 4096, True, 1.0):
        with pytest.raises(GeometryError):
            miller_criterion(invalid)


def test_every_candidate_accessible_and_native_cell_actions_match_reflexibility(ico, search):
    m, a, g = ico
    s = g['symmetry']
    reverse = next(x for x in s['actions'] if x['orientation'] == -1)
    idx = {i: j for j, i in enumerate(s['regionIds'])}
    for row in search['candidates']:
        selected = set(row['regionIds'])
        assert not inaccessible_regions(g, row['regionIds'])
        assert ({reverse['regionIds'][idx[i]] for i in selected} == selected) == row['reflexibleWithinSourceGroup']
        assert all(set(orbit) <= selected or not set(orbit) & selected for orbit in s['orbits']['proper'])


@pytest.mark.parametrize('index', [3, 7, 8, 33])
def test_named_native_boundary_models_have_expected_volume_and_only_original_face_planes(ico, search, index):
    import numpy as np

    m, a, g = ico
    row = search['candidates'][index - 1]
    result = dispatch(
        {'op': 'stellation-union', 'model': m, 'params': {'arrangement': a, 'region_ids': row['regionIds']}}
    )
    assert result['measure']['content'] == pytest.approx(row['volume'])
    assert result['faces'] and result['vertices']
    p = np.asarray(result['vertices'])
    planes = np.asarray(a['planes'])
    for face in result['faces']:
        assert np.min(np.max(abs(p[face] @ planes[:, :3].T + planes[:, 3]), axis=0)) < 1e-7
    validate_project(
        {
            'format': 'polytope-laboratory',
            'version': 1,
            'active': 0,
            'documents': [{'id': 'boundary', 'cursor': 0, 'states': [{'model': result, 'view': {}}]}],
        }
    )


def test_book_order_dispatch_and_determinism(ico, search):
    m, a, g = ico
    before = deepcopy(a)
    again = dispatch({'op': 'stellation-miller-enumerate', 'model': m, 'params': {'arrangement': a}})
    assert again == search and a == before
    assert [r['coxeterLabel'] for r in again['candidates'][:8]] == list('ABCDEFGH')
    assert all(r['reflexibleWithinSourceGroup'] == (i < 32) for i, r in enumerate(again['candidates']))
    assert cell_label(80) == 'e1f1' and cell_label(223) == 'De1f1*'


def test_unsupported_seeds_partial_planes_and_uncertain_domains_refused(ico, monkeypatch):
    m, a, g = ico
    with pytest.raises(GeometryError, match='regular convex'):
        enumerate_miller(a, regular('octahedron'))
    bad = deepcopy(m)
    bad['vertices'][0][0] += 0.01
    with pytest.raises(GeometryError):
        enumerate_miller(a, bad)
    partial = deepcopy(a)
    partial['source']['faceIds'] = partial['source']['faceIds'][:-1]
    with pytest.raises(GeometryError, match='twenty'):
        enumerate_miller(partial, m)
    for key in ('clipped', 'facets', 'group', 'multiplicity', 'topology', 'mirror'):
        bad = deepcopy(g)
        if key == 'clipped':
            bad['symmetry']['clippedBoundedRegionIds'] = [0]
        if key == 'facets':
            bad['completeWithinObservedFacetDomain'] = False
        if key == 'group':
            bad['symmetry']['preservesFullGroup'] = False
        if key == 'multiplicity':
            bad['symmetry']['orbits']['proper'][0].pop()
        if key == 'topology':
            bad['adjacency'][str(bad['symmetry']['regionIds'][0])] = [bad['symmetry']['regionIds'][-1]]
        if key == 'mirror':
            bad['symmetry']['actions'] = [r for r in bad['symmetry']['actions'] if r['orientation'] == 1]
        monkeypatch.setattr('engine.miller_stellations.diagram_data', lambda *_, bad=bad: bad)
        with pytest.raises(GeometryError):
            enumerate_miller(a, m)


def test_actual_clipped_arrangement_and_source_binding(ico):
    m, a, g = ico
    small = arrangement(m, box_scale=3)
    with pytest.raises(GeometryError, match='enlarge'):
        enumerate_miller(small, m)
    forged = deepcopy(a)
    forged['source']['fingerprint'] = 'changed'
    with pytest.raises(GeometryError, match='source changed'):
        enumerate_miller(forged, m)


def test_make_named_base_saved_history_undo_and_replay(ico, search, monkeypatch):
    m, a, g = ico
    row = search['candidates'][8]
    monkeypatch.setattr('engine.stellation_diagrams.arrangement', lambda *args, **kwargs: deepcopy(a))
    params = {
        'box_scale': 10,
        'plane_ids': a['source']['faceIds'],
        'bounds': a['bounds'],
        'region_signs': [a['regions'][i]['signs'] for i in row['regionIds']],
    }
    view = {
        'derivedMode': 'stellation',
        'stellation': {'searchCriteria': 'miller', 'searchCandidateIndex': 8, 'selectedRegions': row['regionIds']},
    }
    doc = {'id': 'miller', 'cursor': 0, 'states': [{'model': m, 'view': view, 'notes': 'Miller e1'}]}
    built = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': doc,
                'operation': 'stellation-make-base',
                'parameters': params,
                'label': 'Miller 9: e1',
            },
        }
    )
    assert len(built['states']) == 2 and built['cursor'] == 1
    assert built['states'][1]['model']['measure']['content'] == pytest.approx(row['volume'])
    assert built['states'][1]['notes'] == 'Miller e1' and 'stellation' not in built['states'][1]['view']
    saved = validate_project(
        json.loads(json.dumps({'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]}))
    )['documents'][0]
    saved['cursor'] = 0
    assert saved['states'][0]['view'] == view
    saved['cursor'] = 1
    replayed = dispatch({'op': 'recipe-replay', 'params': {'document': saved}})
    assert identity(replayed['states'][0]['model']) == identity(saved['states'][1]['model'])
