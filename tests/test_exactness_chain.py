"""Independent box/polar/diamond oracles across real native and project paths."""

from copy import deepcopy
from fractions import Fraction
from itertools import product
import json
from pathlib import Path

import pytest
from unittest.mock import patch

from engine import server
from engine.exact_surface_sections import exact_surface_section, revalidate_exact_surface_section
from engine.formats import save_project, load_file, validate_project
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.operations import transform
from engine.precision_report import precision_report
from engine.rational import rational_hull, rational_dual, revalidate_rational_model, fraction
from engine.recipes import run_recipe, replay_document
from engine.source_reflection import reflect_source

ORACLE = json.loads((Path(__file__).parent / 'fixtures/rational_exact_chain.json').read_text())


def points(model):
    return {tuple(map(Fraction, row)) for row in model['rationalCoordinates']}


def expected(rows):
    return {tuple(map(Fraction, row)) for row in rows}


def counts(model):
    return [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')]


def project(models):
    return {
        'format': 'polytope-laboratory',
        'version': 1,
        'active': 0,
        'documents': [{'cursor': len(models) - 1, 'states': [{'model': m, 'view': {}} for m in models]}],
    }


def js_numbers(value):
    if type(value) is dict:
        return {k: js_numbers(v) for k, v in value.items()}
    if type(value) is list:
        return [js_numbers(v) for v in value]
    if type(value) is float and value.is_integer():
        return int(value)
    return value


def assert_section(model):
    assert counts(model) == ORACLE['sectionCounts']
    assert points(model) == expected(ORACLE['sectionPoints'])
    actual_edges = {
        frozenset(tuple(map(Fraction, model['rationalCoordinates'][v])) for v in edge) for edge in model['edges']
    }
    oracle_edges = {
        frozenset(tuple(map(Fraction, ORACLE['sectionPoints'][v])) for v in edge) for edge in ORACLE['sectionEdges']
    }
    assert actual_edges == oracle_edges
    assert all(Fraction(row[2]) == Fraction(1, 3) for row in model['rationalCoordinates'])


def test_independent_exact_support_polar_and_section_expectations():
    box = server.dispatch({'op': 'rational-hull', 'params': {'points': ORACLE['points']}})
    assert counts(box) == ORACLE['boxCounts']
    assert points(box) == expected(ORACLE['points'][:8])
    assert box['certificate']['candidatePlaneCount'] == 165
    assert box['certificate']['exactFacetCount'] == 6
    normalized = {tuple(Fraction(x) / -Fraction(row[-1]) for x in row) for row in box['rationalFacetEquations']}
    assert normalized == expected(ORACLE['boxSupports'])
    dual = server.dispatch({'op': 'rational-dual', 'params': ORACLE['dual'], 'model': box})
    assert counts(dual) == ORACLE['dualCounts'] and points(dual) == expected(ORACLE['dualPoints'])
    # The box polar is |x|/2 + |y|/3 + |z|/4 <= 1.
    polar_supports = {
        tuple([Fraction(s[0], 2), Fraction(s[1], 3), Fraction(s[2], 4), Fraction(-1)])
        for s in product((-1, 1), repeat=3)
    }
    assert {
        tuple(Fraction(x) / -Fraction(row[-1]) for x in row) for row in dual['rationalFacetEquations']
    } == polar_supports
    packet = server.dispatch({'op': 'exact-surface-section-preview', 'model': dual, 'params': ORACLE['section']})
    assert_section(packet['model'])
    report = precision_report(packet['model'])
    assert report['certificateStatus'] == 'revalidated'
    assert report['properties'][0]['status'] == 'exact'
    assert 'no filled-solid interior' in report['properties'][0]['scope']
    assert report['properties'][2] == {
        'property': 'measurements',
        'status': 'approximate',
        'arithmetic': 'IEEE-754 binary64',
        'inheritedExactness': False,
    }
    assert report['residuals']['exactPredicateResidual'].startswith('0 ')
    assert Fraction(report['residuals']['maxDisplayCoordinateRoundingError']) > 0
    assert Fraction(report['residuals']['maxDisplayPlaneEquationResidual']) == abs(
        Fraction(float(Fraction(1, 3))) - Fraction(1, 3)
    )


def test_real_history_save_reload_undo_replay_and_deliberate_transform_loss(tmp_path):
    box = rational_hull(ORACLE['points'])
    box['metadata']['coordinateUnits'] = 'mm'
    doc = {
        'id': 'exact-chain',
        'cursor': 0,
        'states': [
            {'model': box, 'view': {'coordinateUnit': 'mm'}, 'notes': 'Literal rational box; numerical measurements.'}
        ],
    }
    doc = run_recipe(doc, 'rational-dual', ORACLE['dual'], server.dispatch)
    doc = run_recipe(doc, 'exact-surface-section', ORACLE['section'], server.dispatch)
    section_node = doc['states'][2]['operationNode']
    assert_section(doc['states'][2]['model'])
    doc = run_recipe(doc, 'transform', {'scale': 2}, server.dispatch)
    changed = doc['states'][3]['model']
    assert 'rationalCoordinates' not in changed and 'certificate' not in changed
    assert 'exactSurfaceSection' not in changed['metadata'] and 'exactConstruction' not in changed['numeric']
    loss = precision_report(changed)
    assert loss['guaranteeLoss']['operation'] == 'transform' and not any(
        p['status'] == 'exact' for p in loss['properties']
    )
    value = {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [js_numbers(doc)]}
    path = tmp_path / 'rational-chain.polyproj'
    save_project(path, value)
    reopened = load_file(path)['project']['documents'][0]
    assert reopened['cursor'] == 3 and len(reopened['states']) == 4
    for i in (0, 1, 2):
        assert precision_report(reopened['states'][i]['model'])['certificateStatus'] == 'revalidated'
    assert reopened['states'][0]['model']['certificate']['sourceCoordinates'] == ORACLE['points']
    assert all(
        s['notes'] == doc['states'][0]['notes'] and s['view']['coordinateUnit'] == 'mm' for s in reopened['states']
    )
    replay = replay_document(reopened, server.dispatch, target=section_node)
    assert_section(replay['states'][0]['model'])
    assert precision_report(replay['states'][0]['model'])['certificateStatus'] == 'revalidated'
    reopened['cursor'] = 1
    replay_dual = replay_document(reopened, server.dispatch)['states'][0]['model']
    assert points(replay_dual) == expected(ORACLE['dualPoints'])
    reopened['cursor'] = 2
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [reopened]})
    assert load_file(path)['project']['documents'][0]['cursor'] == 2


@pytest.mark.parametrize(
    'edit',
    [
        lambda m: m['certificate'].update(property='all measurements are exact'),
        lambda m: m['certificate'].update(exhausted=False),
        lambda m: m['certificate'].update(candidatePlaneCount=1),
        lambda m: m['certificate'].update(doesNotCertify=[]),
        lambda m: m['numeric'].update(measurementMode='exact'),
        lambda m: m['numeric'].update(displayMode='rational-exact'),
        lambda m: m['rationalFacetEquations'][0].__setitem__(-1, '-999'),
    ],
)
def test_forged_hull_property_claims_refuse_reload_dual_and_exact_badge(edit):
    model = rational_hull(ORACLE['points'])
    edit(model)
    assert precision_report(model)['certificateStatus'] == 'unresolved'
    with pytest.raises(GeometryError):
        validate_project(project([model]))
    with pytest.raises(GeometryError):
        rational_dual(model)


@pytest.mark.parametrize(
    'edit',
    [
        lambda m: m['metadata']['exactSurfaceSection'].update(solidInteriorInferred=True),
        lambda m: m['metadata']['exactSurfaceSection'].update(edgeSourceReferences=[]),
        lambda m: m['metadata']['exactSurfaceSection'].update(sourceSnapshotSha256='0' * 64),
        lambda m: m['metadata']['exactSurfaceSection'].update(measurementMode='exact'),
        lambda m: m['rationalCoordinates'][0].__setitem__(2, '0.3333333333333333'),
        lambda m: m['numeric'].update(certified=True),
        lambda m: m['numeric'].update(measurementMode='exact'),
    ],
)
def test_forged_section_properties_recompute_instead_of_inheriting(edit):
    source = rational_dual(rational_hull(ORACLE['points']))
    model = exact_surface_section(source, **ORACLE['section'])['model']
    edit(model)
    assert precision_report(model)['certificateStatus'] == 'unresolved'
    with pytest.raises(GeometryError):
        validate_project(project([model]))


def test_legacy_section_evidence_recomputes_after_numeric_json_spelling_changes():
    model = exact_surface_section(regular('cube'), [0, 0, 1], '1/3')['model']
    evidence = model['metadata']['exactSurfaceSection']
    for key in ('sourceHashPolicy', 'property', 'measurementMode', 'displayMode'):
        evidence.pop(key)
    model = js_numbers(model)
    assert identity(revalidate_exact_surface_section(model)) == identity(model)
    assert precision_report(model)['certificateStatus'] == 'revalidated'


@pytest.mark.parametrize('scale', [1, 2, -1])
def test_ordinary_transform_never_inherits_exact_predicates_even_for_integer_scale(scale):
    source = rational_hull(ORACLE['points'])
    before = deepcopy(source)
    result = transform(source, scale=scale)
    assert source == before and result['numeric']['certified'] is False
    assert not {'predicates', 'constructions', 'exactConstruction'} & set(result['numeric'])
    report = server.dispatch({'op': 'validate', 'model': result})['precision']
    assert report['certificateStatus'] == 'absent' and report['properties'][0]['status'] == 'unresolved'
    assert not report['fallback']['implemented']
    validate_project(project([source, result]))


def test_unresolved_float_candidate_and_unvalidated_exact_inputs_are_explicit():
    with pytest.raises(GeometryError, match='unresolved.*no exact certificate or fallback'):
        rational_hull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, '1/100000000000000000000']])
    for value in (True, {}, None, '1e_'):
        with pytest.raises(GeometryError):
            rational_hull([[value, 0], [1, 0], [0, 1]])
    source = rational_hull(ORACLE['points'])
    source['certificate']['exhausted'] = False
    with pytest.raises(GeometryError):
        exact_surface_section(source)
    numerical = server.dispatch({'op': 'analyze', 'model': regular('cube')})
    assert numerical['validation']['passed']
    assert numerical['validation']['precision']['properties'][0]['status'] == 'unresolved'
    assert numerical['validation']['precision']['properties'][2]['status'] == 'approximate'


def test_near_planar_float_checks_do_not_turn_an_unresolved_equality_into_a_proof():
    model = regular('cube')
    model['vertices'][0][0] += 1e-12
    model['numeric']['tolerance'] = 0.5
    report = server.dispatch({'op': 'validate', 'model': model})
    assert report['passed']
    assert report['precision']['properties'][0]['status'] == 'unresolved'
    assert 'no certified error interval' in ' '.join(report['precision']['unresolved'])
    assert report['precision']['tolerance'] == 1e-8
    assert report['precision']['modelCoordinateSpan'] == 2


def test_literal_reflection_drops_exact_predicate_labels_and_retains_the_source():
    source = rational_hull(ORACLE['points'])
    before = deepcopy(source)
    reflected = reflect_source(source)
    assert source == before and 'rationalCoordinates' not in reflected
    assert not {'predicates', 'constructions', 'exactConstruction'} & set(reflected['numeric'])
    assert precision_report(reflected)['guaranteeLoss']['operation'] == 'reflect-source'
    validate_project(project([source, reflected]))


def test_revalidation_accepts_support_plane_rescaling_but_not_incomplete_tables():
    source = rational_hull(ORACLE['points'])
    source['rationalFacetEquations'] = [[str(3 * Fraction(x)) for x in row] for row in source['rationalFacetEquations']]
    assert identity(revalidate_rational_model(source)) == identity(source)
    source['rationalFacetEquations'].pop()
    with pytest.raises(GeometryError):
        revalidate_rational_model(source)


@pytest.mark.parametrize('literal', ['1e99999999999999999', '1E-99999999999999999', '1e1_000_000', '1e1025'])
def test_literal_exponent_work_bound_precedes_fraction_allocation(literal):
    from engine.exact_surface_sections import _fraction

    with patch(
        'engine.rational.Fraction', side_effect=AssertionError('Exponent must be refused before Fraction allocation.')
    ):
        for parser in (fraction, _fraction):
            with pytest.raises(GeometryError, match='exponent magnitude'):
                parser(literal)
