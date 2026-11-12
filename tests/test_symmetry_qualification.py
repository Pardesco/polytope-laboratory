from copy import deepcopy
import json
import subprocess
import sys

import pytest

from engine.generators import regular
from engine.geometry import GeometryError
from engine.symmetry import geometric_symmetry
from engine.symmetry_qualification import (
    FIXTURES,
    REPORT,
    build_report,
    dispatch_qualification,
    fixture_model,
    independent_actions,
    qualify,
    read_report,
    sha,
    source_binding,
)

FIXTURE = json.loads(FIXTURES.read_text(encoding='utf-8'))


def scenario(key, variant='source'):
    return next(r for r in FIXTURE['scenarios'] if r['key'] == key and r.get('variant', 'source') == variant)


def test_shipped_evidence_covers_declared_families_and_all_expected_outcomes():
    report = read_report()
    receipts = report['receipts']
    rows = FIXTURE['scenarios']
    assert len(rows) == len(receipts) == 67
    assert len({r['id'] for r in rows}) == 67
    assert report['fixturesSha256'] == sha(FIXTURE) and report['binding']['fixturesCurrent']
    assert report['certified'] is False and report['numericMode'] == 'float64-approximate'
    for row, receipt in zip(rows, receipts):
        assert row['id'] == receipt['id'] and row['expected'] == receipt['expected']
        assert receipt['status'] == row.get('expectedStatus', 'passed') and not receipt.get('unexpectedOutcome')
        assert len(receipt['source']['coordinateSha256']) == len(receipt['source']['incidenceSha256']) == 64
        if receipt['status'] == 'passed':
            assert receipt['search']['complete'] and receipt['search']['closureVerified']
            assert receipt['search']['order'] == row['expected']['order']
            assert receipt['search']['properOrder'] == row['expected']['properOrder']
            assert receipt['independent']['actionsMetricChecked'] == receipt['search']['order']
            assert receipt['independent']['normalizedCoordinateResidual'] < receipt['search']['tolerance'] * 4
            if 'regular4dKey' in row:
                assert receipt['regularFlagCheck']['reachedFlags'] == row['expected']['order']
            if receipt['variant'] == 'rotated-scaled':
                assert receipt['sameSourceActionPermutations']
        else:
            assert 'independent' not in receipt and 'regularFlagCheck' not in receipt
    assert sum(r['family'] == 'Classical regular 4D' for r in receipts) == 16
    assert (
        sum(
            r['variant'] == 'source' and r['family'] in ('Platonic', 'Archimedean', 'Catalan', 'Kepler-Poinsot')
            for r in receipts
        )
        == 39
    )
    assert sum(r['status'] == 'passed' for r in receipts) == 65


@pytest.mark.parametrize(
    'key', ('tetrahedron', 'cube', 'snub-cube', 'pentagonal-icositetrahedron', 'great-icosahedron', 'uniform4-rap')
)
def test_live_independent_expected_order_and_flag_qualification(key):
    receipt = qualify(scenario(key))
    assert receipt['status'] == 'passed', receipt
    stored = next(r for r in read_report(key)['receipts'] if r['id'] == receipt['id'])
    assert receipt == stored


@pytest.mark.parametrize('key,variant', (('icosahedron', 'missing-face'), ('tesseract', 'extra-open-cell')))
def test_altered_incidence_has_its_own_group_and_cannot_inherit_source_receipt(key, variant):
    row = scenario(key, variant)
    receipt = qualify(row)
    original = regular(key)
    assert receipt['status'] == 'passed'
    assert receipt['source']['coordinateSha256'] == source_binding(original)['coordinateSha256']
    assert receipt['source']['incidenceSha256'] != source_binding(original)['incidenceSha256']
    assert not read_report(key, fixture_model(row))['sourceMatch']


def test_similarity_preserves_complete_permutations_with_distinct_source_binding():
    base = qualify(scenario('icosahedron'))
    changed = qualify(scenario('icosahedron', 'rotated-scaled'))
    assert changed['status'] == 'passed' and base['actionPermutationSha256'] == changed['actionPermutationSha256']
    assert base['source'] != changed['source']
    assert base['source']['incidenceSha256'] == changed['source']['incidenceSha256']


def test_frame_and_vertex_limits_are_explicit_and_never_complete():
    row = next(r for r in FIXTURE['scenarios'] if r['id'].endswith('-frame-limit'))
    receipt = qualify(row)
    assert receipt['status'] == 'limited' and receipt['search']['termination'] == 'frame-limit'
    assert receipt['search']['complete'] is False and receipt['search']['closureVerified'] is None
    large = next(r for r in read_report()['receipts'] if r['key'] == 'goursat-wythoff-rigogishi')
    assert large['counts'][0] == 1200 and large['status'] == 'limited' and 'search' not in large


def test_unexpected_vertex_domain_limitation_is_not_a_passing_scenario(monkeypatch):
    import engine.symmetry_qualification as module

    model = regular('cube')
    model['vertices'] *= 126
    monkeypatch.setattr(module, 'fixture_model', lambda row: model)
    receipt = qualify(scenario('cube'))
    assert receipt['status'] == 'limited' and receipt['unexpectedOutcome']


def test_implementation_changes_during_execution_refuse_a_mixed_report(monkeypatch, tmp_path):
    import engine.symmetry_qualification as module

    root = tmp_path / 'engine'
    root.mkdir()
    path = root / 'symmetry.py'
    path.write_text('before')
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    monkeypatch.setattr(module, 'IMPLEMENTATION', ('symmetry.py',))
    original = module.qualify

    def qualify_changed(row):
        receipt = original(row)
        path.write_text('after')
        return receipt

    monkeypatch.setattr(module, 'qualify', qualify_changed)
    with pytest.raises(GeometryError, match='changed during execution'):
        build_report({**FIXTURE, 'scenarios': [scenario('tetrahedron')]})


def test_independent_scalar_checker_detects_metric_and_cycle_forgery():
    model = regular('cube')
    group = geometric_symmetry(model)
    changed = deepcopy(group)
    changed['actions'][0]['matrix'][0][0] += 0.01
    with pytest.raises(GeometryError, match='residual'):
        independent_actions(model, changed)
    changed = deepcopy(group)
    i = changed['generatorIndices'][0]
    changed['actions'][i]['permutation'][0], changed['actions'][i]['permutation'][1] = (
        changed['actions'][i]['permutation'][1],
        changed['actions'][i]['permutation'][0],
    )
    with pytest.raises(GeometryError):
        independent_actions(model, changed)


def test_runtime_matches_hashes_not_catalog_metadata_and_does_not_mutate_source():
    source = regular('cube')
    source['metadata']['key'] = 'bogus'
    original = deepcopy(source)
    assert read_report('cube', source)['sourceMatch'] and source == original
    source['vertices'][0][0] += 0.0001
    assert not read_report('cube', source)['sourceMatch']
    assert read_report('not-covered', source)['receipts'] == []
    assert read_report(scenario='r7-symmetry-cube-frame-limit', model=regular('cube'))['sourceMatch'] is False


def test_report_source_version_is_checked_without_caching(monkeypatch, tmp_path):
    import engine.symmetry_qualification as module

    monkeypatch.setattr(module, 'ROOT', tmp_path)
    report = read_report('cube')
    assert set(report['binding']['implementation'].values()) == {'unavailable'}
    path = tmp_path / 'engine'
    path.mkdir()
    (path / 'symmetry.py').write_text('changed', encoding='utf-8')
    assert read_report('cube')['binding']['implementation']['symmetry.py'] == 'changed'


def test_fixture_changes_are_reported_and_build_is_reproducible(monkeypatch, tmp_path):
    import engine.symmetry_qualification as module

    path = tmp_path / 'fixtures.json'
    changed = deepcopy(FIXTURE)
    changed['scope'] = 'changed'
    path.write_text(json.dumps(changed))
    monkeypatch.setattr(module, 'FIXTURES', path)
    assert not read_report()['binding']['fixturesCurrent']
    small = {**FIXTURE, 'scenarios': [scenario('tetrahedron')]}
    first = build_report(small)
    second = build_report(small)
    assert first == second and first['receipts'][0]['status'] == 'passed'


@pytest.mark.parametrize(
    'payload',
    (
        {'params': {'file': '../report.json'}},
        {'params': []},
        {'params': {'key': []}},
        {'params': {'scenario': False}},
        {'model': {}},
    ),
)
def test_dispatch_refuses_unsupported_inputs(payload):
    with pytest.raises(GeometryError):
        dispatch_qualification(payload)


def test_native_json_lines_report_is_read_only_and_source_bound():
    source = regular('cube')
    request = {'id': 'qualification', 'op': 'symmetry-qualification', 'params': {'key': 'cube'}, 'model': source}
    result = subprocess.run(
        [sys.executable, '-m', 'engine.server'],
        input=json.dumps(request) + '\n',
        text=True,
        capture_output=True,
        check=True,
    )
    response = json.loads(result.stdout)
    assert response['ok'], response
    assert response['result']['sourceMatch'] and len(response['result']['receipts']) == 2
