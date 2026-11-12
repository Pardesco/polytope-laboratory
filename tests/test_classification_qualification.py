from collections import Counter
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pytest
from engine.classification_qualification import (
    binding,
    manifest,
    qualify,
    qualify_dual,
    metric_checks,
    report,
    source_pins_current,
)
from engine.classification_duals import generated_dual_catalog, load_generated_dual
from engine.generators import regular
from engine.geometry import GeometryError, identity, validate
from engine.server import dispatch

ROOT = Path(__file__).resolve().parents[1]
ROWS = [(tranche, r) for tranche in ('3d', '4d') for r in manifest(tranche)['entries']]


@pytest.mark.parametrize('tranche,row', ROWS, ids=[r['id'] for _, r in ROWS])
def test_every_named_receipt_rechecks_current_geometry_or_retains_explicit_failure(tranche, row):
    assert source_pins_current(manifest(tranche))
    if row['receipt']['status'] == 'numerical-pass':
        actual = qualify(row)
        assert actual == row['receipt']
        assert not actual['certified'] and not actual['releaseQualified']
    else:
        with pytest.raises(GeometryError, match='.') as failure:
            qualify(row)
        assert str(failure.value) == row['receipt']['reason']


def test_scenario_fixture_counts_separate_both_tranches_and_keep_every_missing_dual():
    fixtures = json.loads((ROOT / 'tests/fixtures/classification-relationships.json').read_text())
    for scenario in fixtures['scenarios']:
        rows = [r for t, r in ROWS if t == scenario['tranche'] and r['kind'] == scenario['kind']]
        assert len(rows) == scenario['records']
        assert sum(r['receipt']['status'] == 'numerical-pass' for r in rows) == scenario['numericalPasses']
        if scenario['kind'] == 'dual':
            assert (
                sorted(int(r['id'].split('U')[-1]) for r in rows if r['receipt']['status'] != 'numerical-pass')
                == scenario['unresolved']
            )
    original = json.loads((ROOT / 'engine/catalog_data/corpus_reconciliation.json').read_text())
    assert {r['id'] for r in original['identities'] if r['group'] == 'dual3' and not r['links']} == {
        r['id'] for _, r in ROWS if r['kind'] == 'dual'
    }
    assert all(r['qualification'] is None for r in original['identities'])


@pytest.mark.parametrize('entry', generated_dual_catalog(), ids=lambda r: r['key'])
def test_generated_catalog_load_preserves_polarity_and_distinguishes_generated_from_supplied(entry):
    model = dispatch({'op': 'generate', 'params': {'kind': 'regular', 'key': entry['key']}})
    assert validate(model)['passed']
    assert [len(model[k]) for k in ('vertices', 'edges', 'faces', 'cells')] == entry['counts']
    receipt = model['metadata']['generatedIdentity']
    assert receipt['origin'] == 'generated' and not receipt['suppliedSource'] and not receipt['releaseQualified']
    assert receipt['relationship']['maximumPolarityResidual'] < 1e-10
    assert receipt['relationship']['maximumInvolutionCoordinateResidual'] < 1e-10
    assert receipt['source'] == binding(regular(entry['dualOf']))
    assert model['provenance']['convexified'] is False
    assert model['id'] == load_generated_dual(entry['key'])['id']


def test_source_and_generated_binding_changes_refuse_named_identity_substitution():
    from engine.operations import transform

    original = regular('antiprism-u13')
    changed = transform(original, scale=1.01)
    with patch('engine.generators.regular', return_value=changed):
        response = report({'id': 'dual3:U13', 'verify': True})
        assert response['verification']['status'] == 'unresolved'
        assert 'source geometry changed' in response['verification']['reason']
        with pytest.raises(GeometryError, match='source no longer matches'):
            load_generated_dual('generated-dual-u13')
    with patch('engine.classification_duals.source_pins_current', return_value=False):
        with pytest.raises(GeometryError, match='pins changed'):
            load_generated_dual('generated-dual-u13')


def test_separate_coordinate_and_incidence_bindings_never_weld_or_deduplicate_topology():
    source = regular('scaliform4-koho')
    changed = deepcopy(source)
    changed['faces'][0] = changed['faces'][0][1:] + changed['faces'][0][:1]
    assert binding(source)['coordinatesSha256'] == binding(changed)['coordinatesSha256']
    assert binding(source)['incidenceSha256'] != binding(changed)['incidenceSha256']
    r = qualify(next(r for t, r in ROWS if r['kind'] == 'regiment'))['comparison']
    assert r['sameVertexArrangement'] and r['sameEdgeArrangement']
    assert not r['sameFaceArrangement'] and not r['sameCellArrangement']
    assert r['maximumVertexResidual'] < 1e-12
    assert r['sourceFingerprints'][0] != r['sourceFingerprints'][1]
    compound = qualify(next(r for t, r in ROWS if t == '4d' and r['sourceKey'] == 'compound4-three-tesseracts'))
    assert compound['components']['literalVertexCount'] == 48
    assert compound['components']['distinctCoordinateCount'] == 24
    assert not compound['components']['welded']


def test_adversarial_polarity_and_regularity_are_independently_detected():
    source = regular('antiprism-u13')
    dual = load_generated_dual('generated-dual-u13')
    from engine.operations import transform

    shifted = transform(dual, translation=[0.01, 0, 0])
    with pytest.raises(GeometryError, match='residual'):
        qualify_dual(source, shifted)
    distorted = transform(source, matrix=[[1.01, 0, 0], [0, 1, 0], [0, 0, 1]])
    assert metric_checks(distorted)['maximumRelativeEdgeDeviation'] > 1e-4
    malformed = deepcopy(dual)
    malformed['faces'][0] = list(reversed(malformed['faces'][1]))
    with pytest.raises(GeometryError):
        qualify_dual(source, malformed)


def test_manifest_regeneration_is_deterministic_without_aggregate_writes():
    spec = importlib.util.spec_from_file_location(
        'classification_builder', ROOT / 'scripts/build-classification-qualification.py'
    )
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    for tranche in ('3d', '4d'):
        assert builder.build(tranche) == manifest(tranche)


def test_runtime_provider_pins_use_bundled_json_and_definition_records_in_frozen_builds():
    for tranche in ('3d', '4d'):
        value = manifest(tranche)
        assert all(p.startswith('engine/catalog_data/') and p.endswith('.json') for p in value['sourcePins'])
        assert value['definitionPins'] and value['implementationEvidence']
        assert all(p.endswith('.py') for p in value['implementationEvidence'])
        assert source_pins_current(value)
        stale = deepcopy(value)
        stale['definitionPins'][next(iter(stale['definitionPins']))] = '0' * 64
        assert not source_pins_current(stale)


def test_report_and_dispatch_keep_recorded_unchecked_and_current_numerical_evidence_separate():
    summary = dispatch({'op': 'classification-qualification', 'params': {'tranche': '3d'}})
    assert not summary['releaseQualified']
    assert next(r for r in summary['entries'] if r['id'] == 'dual3:U13')['status'] == 'recorded-unchecked'
    result = dispatch({'op': 'classification-qualification', 'params': {'id': 'dual3:U13', 'verify': True}})
    assert result['entry']['status'] == result['verification']['status'] == 'numerical-pass'
    assert not result['entry']['releaseQualified']
    singular = report({'id': 'dual3:U3', 'verify': True})
    assert singular['verification']['status'] == 'unresolved' and 'singular' in singular['verification']['reason']
    with patch('engine.classification_qualification.source_pins_current', return_value=False):
        assert report()['sourcePinsCurrent'] is False
        with pytest.raises(GeometryError, match='manifests changed'):
            report({'id': 'dual3:U13', 'verify': True})


@pytest.mark.parametrize(
    'params', [[], {'tranche': 'bad'}, {'id': 'missing'}, {'verify': True}, {'verify': 1}, {'path': 'external.off'}]
)
def test_request_boundaries_refuse_unknown_domains(params):
    with pytest.raises(GeometryError):
        dispatch({'op': 'classification-qualification', 'params': params})


def test_no_arbitrary_model_or_unsupported_generated_identity():
    with pytest.raises(GeometryError, match='no model input'):
        dispatch({'op': 'classification-qualification', 'model': regular('cube')})
    for key in ['generated-dual-u3', 'generated-dual-u75', 'generated-dual-u999']:
        with pytest.raises(GeometryError, match='No qualified finite'):
            regular(key)


def test_generated_identity_and_source_dual_survive_project_history_undo_and_replay(tmp_path):
    from engine.formats import save_project, load_file
    from engine.history import canonical_model

    doc = {
        'id': 'source',
        'cursor': 0,
        'states': [{'model': regular('cube'), 'view': {}, 'notes': 'Preserve generated identity.'}],
    }
    built = dispatch(
        {
            'op': 'recipe-run',
            'params': {
                'document': doc,
                'operation': 'generate',
                'parameters': {'kind': 'regular', 'key': 'generated-dual-u74'},
            },
        }
    )
    assert doc['cursor'] == 0 and len(doc['states']) == 1
    assert built['cursor'] == 1 and built['states'][1]['model']['metadata']['generatedIdentity']['id'] == 'dual3:U74'
    path = tmp_path / 'generated-dual.polyproj'
    save_project(path, {'format': 'polytope-laboratory', 'version': 1, 'active': 0, 'documents': [built]})
    restored = load_file(path)['project']['documents'][0]
    assert (
        restored['states'][1]['model']['metadata']['generatedIdentity']
        == built['states'][1]['model']['metadata']['generatedIdentity']
    )
    restored['cursor'] = 0
    assert identity(restored['states'][0]['model']) == identity(doc['states'][0]['model'])
    restored['cursor'] = 1
    replay = dispatch({'op': 'recipe-replay', 'params': {'document': restored}})
    assert canonical_model(replay['states'][0]['model']) == canonical_model(restored['states'][1]['model'])
