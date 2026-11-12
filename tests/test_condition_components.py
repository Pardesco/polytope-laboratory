"""Independent primitive geometry and persisted generalized fitting gates."""

from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pytest

from engine import server
from engine.condition_fitting import near_miss_deviation
from engine.formats import save_project, load_file
from engine.generators import regular
from engine.geometry import GeometryError, identity
from engine.recipes import run_recipe, replay_document

CASES = json.loads((Path(__file__).parent / 'fixtures' / 'condition-component-cases.json').read_text())


def source(key='tetrahedra', seed=None):
    m = deepcopy(CASES[key])
    p = np.asarray(m['vertices'], dtype=float)
    n = len(p) // 2
    for ids in (slice(0, n), slice(n, None)):
        center = p[ids].mean(axis=0)
        p[ids] = center + (p[ids] - center) * [1.1, 0.9, 1.03]
    if seed is not None:
        p += np.random.default_rng(seed).normal(0, 0.005, p.shape)
    m['vertices'] = p.tolist()
    m['fingerprint'] = identity(m)
    return m


def preview(m, params):
    return server.dispatch({'op': 'geometry-fit-preview', 'model': m, 'params': params})


def adopt(m, params):
    return server.dispatch({'op': 'geometry-fit', 'model': m, 'params': params})


def test_named_separated_tetrahedra_independent_edges_centroids_separation_and_repeatability():
    m = source(seed=19)
    before = deepcopy(m)
    params = {'objectives': ['regular-faces'], 'max_evaluations': 60}
    first = preview(m, params)
    second = preview(m, params)
    e = first['evidence']
    result = first['model']
    assert first == second and m == before
    assert e['requestedConstraintsSatisfied'] and e['conditionResidualsSatisfied'] and e['geometricValidity']['passed']
    assert not e['uniformityEstablished'] and not e['certified'] and not e['hullRepair']
    assert result['interpretation'] == 'generalized-complex' and result['validation']['passed']
    assert (
        result['metadata']['offColors'] == m['metadata']['offColors'] and result['metadata']['coordinateUnits'] == 'mm'
    )
    p = np.asarray(result['vertices'])
    q = np.asarray(m['vertices'], dtype=float)
    edges = np.asarray(m['edges'])
    for ids in (slice(0, 4), slice(4, 8)):
        assert np.max(np.abs(p[ids].mean(axis=0) - q[ids].mean(axis=0))) < 1e-12
        distances = np.linalg.norm(p[ids][:, None] - p[ids][None, :], axis=2)
        assert np.ptp(distances[np.triu_indices(4, 1)]) < 1e-7
    lengths = lambda v: np.linalg.norm(v[edges[:, 0]] - v[edges[:, 1]], axis=1)
    assert lengths(p).mean() == pytest.approx(lengths(q).mean(), abs=1e-12)
    for key in ('edges', 'faces', 'cells'):
        assert result[key] == m[key]
    qualification = e['generalizedComponents']['qualification']
    witness = qualification['separations'][0]
    axis = np.asarray(witness['axis'])
    gap = np.min(p[4:] @ axis) - np.max(p[:4] @ axis)
    assert gap > 0 and gap / lengths(q).mean() == pytest.approx(witness['gapMeanEdgeUnits'], abs=1e-10)
    assert near_miss_deviation(result)['classificationEstablished'] is False


@pytest.mark.parametrize(
    'key,params,unresolved',
    [
        ('tetrahedra', {'objectives': ['regular-faces']}, False),
        ('pyramids', {'objectives': ['regular-faces', 'equal-areas']}, True),
    ],
)
def test_success_and_incompatible_conditions_preview_adopt_save_reopen_replay(tmp_path, key, params, unresolved):
    m = source(key)
    before = deepcopy(m)
    packet = preview(m, params)
    e = packet['evidence']
    assert e['geometricValidity']['passed'] and e['requestedConstraintsSatisfied'] is (not unresolved)
    if unresolved:
        # A connected regular-faced square pyramid shares one side length:
        # equilateral triangles have area sqrt(3)/4*s^2; its square has s^2.
        assert e['solverTermination']['success'] and not e['converged']
        assert e['residuals']['maximum'] > 0.1 and not e['globalFeasibilityEstablished']
        with pytest.raises(GeometryError, match='remain unresolved'):
            adopt(m, params)
        params = {**params, 'adoption': 'valid-near-miss'}
    else:
        assert e['converged']
    adopted = adopt(m, params)
    doc = {
        'id': 'component-fit',
        'cursor': 0,
        'states': [{'model': m, 'view': {'coordinateUnit': 'mm'}, 'notes': 'Keep component notes.'}],
    }
    built = run_recipe(doc, 'geometry-fit', params, server.dispatch)
    assert len(built['states']) == 2 and doc['cursor'] == 0 and m == before
    assert identity(built['states'][1]['model']) == identity(adopted)
    path = tmp_path / 'components.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]})
    opened = load_file(path)['project']['documents'][0]
    assert opened['states'][0]['model'] == m and opened['states'][1]['notes'] == 'Keep component notes.'
    replayed = replay_document(opened, server.dispatch)['states'][0]['model']
    assert replayed == opened['states'][1]['model']
    assert replayed['metadata']['geometryFitting']['adoption'] == (
        'valid-near-miss' if unresolved else 'constraints-satisfied'
    )


def test_selected_face_oracle_leaves_unselected_face_residual_out_of_regular_objective():
    m = source()
    packet = preview(m, {'objectives': ['regular-faces'], 'face_ids': [0]})
    p = np.asarray(packet['model']['vertices'])
    face = m['faces'][0]
    q = p[face]
    sides = np.linalg.norm(q - np.roll(q, -1, axis=0), axis=1)
    assert np.ptp(sides) < 1e-7
    assert packet['evidence']['conditions']['regular-faces']['after']['maximum'] < 1e-7
    other = p[m['faces'][4]]
    assert np.ptp(np.linalg.norm(other - np.roll(other, -1, axis=0), axis=1)) > 0.01
    assert near_miss_deviation(packet['model'])['conditions']['regular-faces']['maximum'] > 0.01


@pytest.mark.parametrize('shift', [0, 2, 1e-8])
def test_overlapping_touching_or_unresolved_source_components_refuse(shift):
    m = deepcopy(CASES['tetrahedra'])
    p = np.asarray(m['vertices'], dtype=float)
    p[4:] -= [10 - shift, 0, 0]
    m['vertices'] = p.tolist()
    with pytest.raises(GeometryError, match='separation|touch|intersect|coincident|unresolved'):
        preview(m, {'objectives': ['regular-faces']})


def test_nested_components_refuse_even_with_disjoint_surfaces():
    m = deepcopy(CASES['tetrahedra'])
    p = np.asarray(m['vertices'], dtype=float)
    p[:4] += [5, 0, 0]
    p[4:] = (p[4:] - [5, 0, 0]) * 0.2
    m['vertices'] = p.tolist()
    with pytest.raises(GeometryError, match='contain|intersect|separation'):
        preview(m, {'objectives': ['regular-faces']})


def test_candidate_intersection_cannot_adopt_even_when_condition_residuals_are_zero():
    m = deepcopy(CASES['tetrahedra'])
    params = {'objectives': ['equal-edges'], 'fix_scale': False, 'target': 30}
    packet = preview(m, params)
    assert packet['model'] is None and packet['status'] == 'invalid-realization'
    assert packet['evidence']['conditionResidualsSatisfied'] and not packet['evidence']['geometricValidity']['passed']
    assert not packet['evidence']['converged']
    with pytest.raises(GeometryError, match='invalid'):
        adopt(m, {**params, 'adoption': 'valid-near-miss'})


def test_flips_and_collapses_remain_invalid_despite_optimizer_success():
    m = source()
    for collapse in (False, True):

        def solve(fun, x, **options):
            p = x.reshape((-1, 3)).copy()
            if collapse:
                p[1] = p[0]
            else:
                p[:4, 0] = 2 * p[:4, 0].mean() - p[:4, 0]
            fun(p.ravel())
            return SimpleNamespace(success=True, status=1, message='mock success', nfev=1)

        with patch('engine.condition_fitting.least_squares', solve):
            packet = preview(m, {'objectives': ['equal-edges']})
            assert packet['model'] is None
            with pytest.raises(GeometryError, match='invalid'):
                adopt(m, {'objectives': ['equal-edges'], 'adoption': 'valid-near-miss'})


def test_unsupported_connected_and_four_dimensional_domains_and_symmetry_refuse():
    for key in ('tetrahedron', 'tesseract'):
        m = regular(key)
        m['interpretation'] = 'generalized-complex'
        with pytest.raises(GeometryError, match='unsupported'):
            preview(m, {'objectives': ['regular-faces']})
    with pytest.raises(GeometryError, match='Keep symmetry'):
        preview(source(), {'objectives': ['regular-faces'], 'keep_symmetry': True})


def test_source_incidence_defects_are_not_repaired_by_component_qualification():
    for mutate in (lambda m: m['edges'].append([0, 4]), lambda m: m['faces'].pop(), lambda m: m['faces'][0].append(4)):
        m = source()
        mutate(m)
        with pytest.raises(GeometryError):
            preview(m, {'objectives': ['regular-faces']})


@pytest.mark.parametrize(
    'name,objectives,satisfied',
    [
        ('fitting-separated-tetrahedra.off', ['regular-faces'], True),
        ('fitting-incompatible-pyramids.off', ['regular-faces', 'equal-areas'], False),
    ],
)
def test_importable_examples_use_the_ordinary_off_workflow(name, objectives, satisfied):
    m = load_file(Path(__file__).parents[1] / 'examples' / name)['model']
    assert m['interpretation'] == 'generalized-complex'
    packet = preview(m, {'objectives': objectives})
    assert packet['model'] is not None
    assert packet['evidence']['requestedConstraintsSatisfied'] is satisfied


def test_component_bound_and_source_relative_orientation_are_explicit():
    base = regular('tetrahedron')
    n = len(base['vertices'])
    m = deepcopy(CASES['tetrahedra'])
    for count in (8, 9):
        m['vertices'] = [[p[0] + i * 10, p[1], p[2]] for i in range(count) for p in base['vertices']]
        m['edges'] = [[v + i * n for v in e] for i in range(count) for e in base['edges']]
        m['faces'] = [[v + i * n for v in f] for i in range(count) for f in base['faces']]
        m['metadata'] = {}
        if count == 8:
            packet = preview(m, {'objectives': ['regular-faces'], 'max_evaluations': 1})
            assert (
                packet['evidence']['requestedConstraintsSatisfied']
                and len(packet['evidence']['generalizedComponents']['maps']) == 8
            )
        else:
            with pytest.raises(GeometryError, match='2–8'):
                preview(m, {'objectives': ['regular-faces']})


def test_residuals_describe_realized_source_units_after_large_translation_roundoff():
    m = source()
    m['vertices'] = (np.asarray(m['vertices']) * 1e79 + [1e90, -1e90, 1e90]).tolist()
    m['fingerprint'] = identity(m)
    packet = preview(m, {'objectives': ['equal-edges']})
    assert packet['model'] is not None
    p = np.asarray(packet['model']['vertices'])
    edges = np.asarray(m['edges'])
    lengths = np.linalg.norm(p[edges[:, 0]] - p[edges[:, 1]], axis=1)
    maximum = float(np.max(np.abs(lengths / lengths.mean() - 1)))
    assert packet['evidence']['residuals']['maximum'] == pytest.approx(maximum, abs=1e-12)
    assert packet['evidence']['conditionResidualsSatisfied'] is (maximum <= 1e-7)
