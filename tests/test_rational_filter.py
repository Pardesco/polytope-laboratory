"""Literal seven-halfspace oracle; no Qhull output supplies expected incidence."""

from copy import deepcopy
from fractions import Fraction as F
from itertools import combinations
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from engine import server
from engine.formats import save_project, load_file, validate_project
from engine.geometry import GeometryError, hull, identity, intrinsic_measures, validate
from engine.precision_report import precision_report
from engine.rational import rational_hull, revalidate_rational_model
from engine.recipes import run_recipe, replay_document

ORACLE = json.loads((Path(__file__).parent / 'fixtures/rational_raised_corner.json').read_text())


def solve(rows):
    a = [list(map(F, row[:-1])) + [-F(row[-1])] for row in rows]
    for col in range(3):
        pivot = next((i for i in range(col, 3) if a[i][col]), None)
        if pivot is None:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        s = a[col][col]
        a[col] = [v / s for v in a[col]]
        for i in range(3):
            if i != col:
                s = a[i][col]
                a[i] = [x - s * y for x, y in zip(a[i], a[col])]
    return tuple(row[-1] for row in a)


def project(doc):
    return {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [doc]}


def model():
    return server.dispatch({'op': 'rational-hull', 'params': {'points': ORACLE['points']}})


def normalized(rows):
    return {tuple(F(v) / -F(row[-1]) for v in row) for row in rows}


def test_con_03_rational_raised_corner_independent_supports_and_intersections():
    planes = [list(map(F, row)) for row in ORACLE['supports']]
    intersections = set()
    for triple in combinations(planes, 3):
        point = solve(triple)
        if point is not None and all(sum(x * y for x, y in zip(point, p[:-1])) + p[-1] <= 0 for p in planes):
            intersections.add(point)
    assert intersections == {tuple(map(F, row)) for row in ORACLE['points']}
    for plane, ids in zip(planes, ORACLE['supportVertices']):
        assert [
            i for i, p in enumerate(ORACLE['points']) if sum(F(x) * y for x, y in zip(p, plane[:-1])) + plane[-1] == 0
        ] == ids
    approximate = hull([[float(F(v)) for v in row] for row in ORACLE['points']])
    assert len(approximate['faces']) == 6
    exact = model()
    assert [len(exact[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == ORACLE['counts']
    assert exact['facetVertices'] == ORACLE['supportVertices'] and exact['edges'] == ORACLE['edges']
    assert normalized(exact['rationalFacetEquations']) == normalized(ORACLE['supports'])
    assert exact['certificate']['candidatePlaneCount'] == 56 and exact['certificate']['exactFacetCount'] == 7
    assert exact['certificate']['displayAdapter']['binary64SupportPlaneCount'] == 56
    assert validate(exact)['passed'] and identity(revalidate_rational_model(exact)) == identity(exact)
    report = server.dispatch({'op': 'analyze', 'model': exact})
    assert report['measure']['content'] == pytest.approx(float(F(ORACLE['exactVolume'])), abs=4e-15, rel=0)
    assert report['validation']['precision']['certificateStatus'] == 'revalidated'
    precision = precision_report(exact)
    assert (
        precision['fallback']['implemented']
        and 'General floating hulls are not certified' in precision['fallback']['scope']
    )
    assert precision['residuals']['maxDisplayCoordinateRoundingError'] == ORACLE['coordinateRoundingError']
    assert precision['residuals']['maxDisplayPlaneEquationResidual'] == ORACLE['supportEquationRoundingResidual']
    assert precision['properties'][2]['status'] == 'approximate'


def test_candidate_failure_also_uses_bounded_reconstruction_without_a_qhull_result():
    with patch('engine.rational.hull', side_effect=GeometryError('unresolved test candidate')):
        result = model()
        assert result['facetVertices'] == ORACLE['supportVertices']
        assert precision_report(result)['certificateStatus'] == 'revalidated'


def test_reopen_undo_redo_replay_and_deliberate_guarantee_loss(tmp_path):
    doc = {
        'id': 'raised-corner',
        'cursor': 0,
        'states': [{'model': model(), 'view': {'coordinateUnit': 'mm'}, 'notes': 'Rational raised corner.'}],
    }
    params = {'normal': [0, 0, 1], 'offset': '1/3', 'fill_rule': 'nonzero'}
    doc = run_recipe(doc, 'exact-surface-section', params, server.dispatch)
    target = doc['states'][1]['operationNode']
    doc = run_recipe(doc, 'transform', {'scale': 2}, server.dispatch)
    path = tmp_path / 'raised.polyproj'
    save_project(path, project(doc))
    reopened = load_file(path)['project']['documents'][0]
    assert reopened['cursor'] == 2 and len(reopened['states']) == 3
    source = reopened['states'][0]['model']
    assert source['certificate'] == doc['states'][0]['model']['certificate']
    assert precision_report(source)['certificateStatus'] == 'revalidated'
    replay = replay_document(reopened, server.dispatch, target=target)['states'][0]['model']
    assert identity(replay) == identity(reopened['states'][1]['model'])
    assert precision_report(replay)['certificateStatus'] == 'revalidated'
    assert replay['metadata']['exactSurfaceSection']['sourceModel']['certificate'] == source['certificate']
    loss = precision_report(reopened['states'][2]['model'])
    assert loss['certificateStatus'] == 'absent' and loss['guaranteeLoss']['operation'] == 'transform'
    for cursor in (0, 1, 2):
        reopened['cursor'] = cursor
        save_project(path, project(reopened))
        assert load_file(path)['project']['documents'][0]['cursor'] == cursor
    assert all(
        s['view']['coordinateUnit'] == 'mm' and s['notes'] == 'Rational raised corner.' for s in reopened['states']
    )


@pytest.mark.parametrize(
    'edit',
    [
        lambda m: m['certificate']['displayAdapter'].update(exhausted=False),
        lambda m: m['certificate']['displayAdapter'].update(binary64SupportPlaneCount=1),
        lambda m: m['certificate']['displayAdapter'].update(binary64SupportIncidenceAgreement=False),
        lambda m: m['certificate'].pop('displayAdapter'),
        lambda m: m['faces'][3].reverse(),
        lambda m: m['vertices'][7].__setitem__(2, 1.0),
        lambda m: m['rationalFacetEquations'][3].__setitem__(0, '0'),
    ],
)
def test_modified_fallback_assertions_never_authorize_reopen_or_measures(edit):
    source = model()
    edit(source)
    assert precision_report(source)['certificateStatus'] == 'unresolved'
    with pytest.raises(GeometryError):
        validate_project(project({'cursor': 0, 'states': [{'model': source, 'view': {}}]}))
    with pytest.raises(GeometryError):
        intrinsic_measures(source)


def test_measures_are_recomputed_and_source_is_not_mutated():
    source = model()
    source['measure'] = {'content': 999, 'boundaryMeasure': 999}
    before = deepcopy(source)
    assert intrinsic_measures(source)['content'] == pytest.approx(float(F(ORACLE['exactVolume'])))
    assert source == before


@pytest.mark.parametrize('scale', [1, 2])
def test_unresolved_direct_transform_retains_filtered_source_and_reports_blocker(scale):
    source = model()
    before = deepcopy(source)
    doc = {'id': 'filtered-transform', 'cursor': 0, 'states': [{'model': source, 'view': {}}]}
    with pytest.raises(GeometryError, match='Float transform cannot preserve source facet incidence'):
        run_recipe(doc, 'transform', {'scale': scale}, server.dispatch)
    assert source == before and doc['cursor'] == 0 and len(doc['states']) == 1
    assert precision_report(source)['certificateStatus'] == 'revalidated'


@pytest.mark.parametrize(
    'case,message',
    [
        ('rank', 'loses source rank'),
        ('identity', 'loses distinct source identities'),
        ('incidence', 'rounding changed a support sign or equality'),
        ('budget', 'at most 12'),
        ('dimension', 'requires XYZ3D'),
        ('face-rank', 'unchanged validation'),
    ],
)
def test_con_03_rational_adapter_representation_blockers(case, message):
    p = deepcopy(ORACLE['points'])
    if case == 'rank':
        p = [['0', '0', '0'], ['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1e-20']]
    elif case == 'identity':
        p.append(['1', '1', '100000000100000000001/100000000000000000000'])
    elif case == 'incidence':
        p[0] = ['-1', '-1', '-100000000000000000001/100000000000000000000']
    elif case == 'budget':
        p += [['0', '0', str(F(i, 100))] for i in range(5)]
    elif case == 'dimension':
        p = [row + ['-1'] for row in p] + [row + ['1'] for row in p]
    elif case == 'face-rank':
        p = p[:-1] + [['.9999999999', 1, 1], [1, '.9999999999', 1], [1, 1, '.9999999999']]
    with pytest.raises(GeometryError, match=message):
        rational_hull(p)
