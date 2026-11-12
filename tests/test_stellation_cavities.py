from copy import deepcopy
from itertools import product
from pathlib import Path
import json
import numpy as np
import pytest
from engine.geometry import GeometryError, identity
from engine.generators import regular
from engine.stellation import arrangement, region_union
from engine.stellation_cells import cell_graph, inaccessible_regions
from engine.stellation_cavities import cavity_analysis
from engine.stellation_diagrams import make_base
from engine.generalized_nets import unfold_source
from engine.formats import validate_project
from engine.server import dispatch

FIXTURE = json.loads((Path(__file__).parent / 'fixtures' / 'stellation-cavity-grid.json').read_text())


@pytest.fixture(scope='module')
def grid():
    source = regular('cube')
    a = arrangement(source, planes=FIXTURE['planes'], bounds=FIXTURE['bounds'])
    g = cell_graph(a, source)
    ends = FIXTURE['interval_endpoints']
    lookup = {}
    for index in product(range(5), repeat=3):
        midpoint = np.array([(ends[i] + ends[i + 1]) / 2 for i in index])
        signs = tuple(1 if np.dot(p[:3], midpoint) + p[3] < 0 else -1 for p in FIXTURE['planes'])
        lookup[index] = next(r['id'] for r in a['regions'] if tuple(r['signs']) == signs)
    inside = {index for index in lookup if all(1 <= i <= 3 for i in index)}
    shell = sorted(lookup[index] for index in inside - {(2, 2, 2)})
    return source, a, g, lookup, shell


def test_entire_cartesian_cell_set_and_every_facet_action_are_independent(grid):
    source, a, g, lookup, shell = grid
    e = FIXTURE['expected']
    assert len(a['regions']) == len(set(lookup.values())) == e['observed_region_count']
    assert len(shell) == e['selected_region_count']
    for index, region_id in lookup.items():
        node = g['nodes'][region_id]
        expected = sorted(lookup[other] for other in lookup if sum(abs(i - j) for i, j in zip(index, other)) == 1)
        assert g['adjacency'][str(region_id)] == expected
        assert node['selectable'] == all(1 <= i <= 3 for i in index)
        assert (node['boundedness'] == 'bounded-numerical') == node['selectable']
        if not node['selectable']:
            assert region_id in g['exteriorSeedIds']
    assert len(g['links']) == 3 * 4 * 5 * 5
    assert g['completeWithinObservedFacetDomain'] and not g['unresolvedFacetRegionIds']
    assert sum(n['selectable'] for n in g['nodes']) == e['bounded_region_count']


def test_native_cavity_receipt_names_entire_expected_set_and_removed_facets(grid):
    source, a, g, lookup, shell = grid
    before = deepcopy(a)
    core = lookup[(2, 2, 2)]
    e = FIXTURE['expected']
    report = dispatch(
        {'op': 'stellation-cavity-analysis', 'model': source, 'params': {'arrangement': a, 'region_ids': shell}}
    )
    assert report['selectedRegionIds'] == shell and report['cavityRegionIds'] == [core]
    assert report['filledRegionIds'] == sorted(shell + [core])
    assert report['addedVolume'] == pytest.approx(e['added_volume'])
    assert report['boundaryFacetCounts'] == {'preserve': 60, 'fill': 54}
    assert report['arrangementSha256'] == g['arrangementSha256']
    assert report['partitionVolumeResidual'] < 1e-10 and report['relativePartitionVolumeResidual'] < 1e-12
    hidden = report['removedBoundaryFacets']
    assert len(hidden) == 6
    assert {r['selectedRegionId'] for r in hidden} == set(g['adjacency'][str(core)])
    assert all(r['cavityRegionId'] == core and r['planeIds'] for r in hidden)
    assert not report['certified'] and not report['unrestrictedStellationEnumerationComplete']
    assert a == before


def face_points(model):
    return {tuple(sorted(tuple(round(x, 9) for x in model['vertices'][i]) for i in face)) for face in model['faces']}


def test_preserve_fill_have_identical_outer_surface_and_independent_net_parts(grid):
    source, a, g, lookup, shell = grid
    e = FIXTURE['expected']
    hollow = region_union(a, shell, source=source)
    filled = region_union(a, sorted(shell + [lookup[(2, 2, 2)]]), source=source)
    outer = face_points(filled)
    inner = face_points(hollow) - outer
    assert outer < face_points(hollow) and len(inner) == e['removed_inner_square_faces']
    assert all(
        any(all(abs(p[axis] - side) == 0 for p in face) for axis in range(3) for side in (-1, 1)) for face in inner
    )
    assert all(
        any(all(abs(p[axis] - side) == 0 for p in face) for axis in range(3) for side in (-2, 2)) for face in outer
    )
    for policy, model in [('preserve', hollow), ('fill', filled)]:
        assert len(model['faces']) == e[policy + '_boundary_faces']
        assert model['measure']['content'] == pytest.approx(e[policy + '_volume'])
        assert model['measure']['boundaryMeasure'] == pytest.approx(e[policy + '_boundary_area'])
        net = unfold_source(model, tabs=False)
        assert len(net['components']) == e[policy + '_net_components']
        assert len(net['faces']) == len(model['faces'])
        assert net['validation']['allFacesRepresented'] and net['validation']['areaPreserved']


def test_all_26_single_cell_removals_distinguish_facet_from_edge_vertex_openings(grid):
    source, a, g, lookup, shell = grid
    core = lookup[(2, 2, 2)]
    for index, region_id in lookup.items():
        if region_id not in shell:
            continue
        opening = sum(abs(i - 2) for i in index) == 1
        assert inaccessible_regions(g, [i for i in shell if i != region_id]) == ([] if opening else [core])


@pytest.mark.parametrize('index,expected', [((1, 2, 2), []), ((1, 1, 2), [(2, 2, 2)]), ((1, 1, 1), [(2, 2, 2)])])
def test_native_report_open_face_and_edge_vertex_contact_conventions(grid, index, expected):
    source, a, g, lookup, shell = grid
    report = cavity_analysis(a, [i for i in shell if i != lookup[index]], source)
    assert report['cavityRegionIds'] == [lookup[key] for key in expected]


def test_uncertain_core_and_observation_contact_remain_exterior(grid):
    source, a, g, lookup, shell = grid
    core = lookup[(2, 2, 2)]
    for field, value in [('boundedness', 'unresolved'), ('touchesObservationBox', True)]:
        changed = deepcopy(a)
        changed['regions'][core][field] = value
        report = cavity_analysis(changed, shell, source)
        assert core in report['exteriorSeedIds'] and not report['cavityRegionIds']
    clipped = arrangement(source, planes=FIXTURE['planes'], bounds=[[-1.5] * 3, [1.5] * 3])
    assert not cavity_analysis(clipped, [], source)['cavityRegionIds']
    clipped_ids = [r['id'] for r in clipped['regions'] if r['touchesObservationBox']]
    with pytest.raises(GeometryError, match='enclosed'):
        cavity_analysis(clipped, clipped_ids[:1], source)


@pytest.mark.parametrize('policy', ['preserve', 'fill'])
def test_native_policy_adoption_undo_redo_reopen_and_replay(grid, policy):
    source, a, g, lookup, shell = grid
    e = FIXTURE['expected']
    params = {
        'region_signs': [a['regions'][i]['signs'] for i in shell],
        'planes': FIXTURE['planes'],
        'bounds': FIXTURE['bounds'],
        'cavity_policy': policy,
    }
    state = {
        'model': source,
        'notes': 'cavity source',
        'arrangement': a,
        'view': {'derivedMode': 'stellation', 'stellation': {'selectedRegions': shell, 'diagramFill': False}},
    }
    doc = {'id': 'cavity-grid', 'cursor': 0, 'states': [state]}
    result = dispatch(
        {'op': 'recipe-run', 'params': {'document': doc, 'operation': 'stellation-make-base', 'parameters': params}}
    )
    model = result['states'][1]['model']
    receipt = model['metadata']['stellationCavities']
    assert model['measure']['content'] == pytest.approx(e[policy + '_volume'])
    assert len(model['faces']) == e[policy + '_boundary_faces']
    assert receipt['policy'] == policy and receipt['cavityRegionSigns'] == [a['regions'][lookup[(2, 2, 2)]]['signs']]
    assert receipt['addedVolume'] == (8 if policy == 'fill' else 0) and not receipt['certified']
    assert model['provenance']['parameters']['cavity_policy'] == policy
    assert (
        all(result['states'][0][key] == value for key, value in state.items())
        and result['states'][1]['notes'] == 'cavity source'
    )
    for cursor in (0, 1):
        result['cursor'] = cursor
        saved = validate_project(
            json.loads(json.dumps({'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [result]}))
        )['documents'][0]
        assert saved['cursor'] == cursor
        assert saved['states'][0]['view']['stellation']['selectedRegions'] == shell
        assert saved['states'][1]['model']['metadata']['stellationCavities'] == receipt
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': saved}})
    assert identity(replay['states'][0]['model']) == identity(model)
    assert replay['states'][0]['model']['metadata']['stellationCavities'] == receipt


def test_refuses_unsupported_policy_or_stale_source_without_mutation(grid):
    source, a, g, lookup, shell = grid
    before = deepcopy(a)
    changed = deepcopy(source)
    changed['id'] = 'stale'
    with pytest.raises(GeometryError, match='source changed'):
        cavity_analysis(a, shell, changed)
    with pytest.raises(GeometryError, match='Cavity policy'):
        make_base(source, [a['regions'][shell[0]]['signs']], cavity_policy='visibility-rays')
    incomplete = deepcopy(a)
    incomplete['completeWithinDeclaredDomain'] = False
    with pytest.raises(GeometryError, match='completed'):
        cavity_analysis(incomplete, shell, source)
    missing = deepcopy(a)
    missing['regions'].pop()
    with pytest.raises(GeometryError, match='volume conservation'):
        cavity_analysis(missing, shell, source)
    assert a == before
