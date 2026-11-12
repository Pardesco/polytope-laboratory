from copy import deepcopy
import hashlib
import importlib.util
import json

import pytest

from engine.corpus_reconciliation import (
    ROOT,
    coverage,
    dispatch_reconciliation,
    load_manifest,
    report,
    validate_manifest,
)
from engine.geometry import GeometryError


@pytest.fixture(scope='module')
def summary():
    return report()


def test_manifest_rebuild_is_deterministic_and_source_pinned():
    spec = importlib.util.spec_from_file_location('build_crosswalk', ROOT / 'scripts/build-corpus-reconciliation.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    assert builder.build() == load_manifest()
    for source in load_manifest()['sources']:
        if source['file']:
            assert hashlib.sha256((ROOT / source['file']).read_bytes()).hexdigest() == source['sha256']


@pytest.mark.parametrize(
    'group,required,named,mapped,candidates',
    [
        ('regular4', 16, 16, 16, 0),
        ('uniform3', 75, 75, 75, 0),
        ('dual3', 75, 75, 22, 0),
        ('johnson', 92, 92, 92, 0),
        ('near-miss', None, 10, 10, 0),
        ('uniform4', 2191, 0, 0, 216),
        ('specialized3', None, 0, 0, 121),
        ('specialized4', None, 0, 0, 923),
    ],
)
def test_coverage_separates_obligations_source_matches_and_candidates(
    summary, group, required, named, mapped, candidates
):
    row = next(g for g in summary['groups'] if g['id'] == group)
    assert [row[k] for k in ('required', 'namedIdentities', 'mappedIdentities', 'candidateRealizations')] == [
        required,
        named,
        mapped,
        candidates,
    ]
    assert row['qualifiedIdentities'] == 0
    assert row['qualifiedPercent'] == (None if required is None else 0)
    assert row['unqualifiedObligations'] == required


def test_every_named_number_and_dual_obligation_is_explicit():
    rows = {r['id']: r for r in load_manifest()['identities']}
    for n in range(1, 76):
        assert rows[f'uniform3:U{n}']['links'][0]['entry'] == f'antiprism-u{n}'
        assert rows[f'dual3:U{n}']['dualOf'] == f'uniform3:U{n}'
    for n in range(1, 93):
        assert rows[f'johnson:J{n}']['links'][0]['entry'] == f'antiprism-j{n}'
    for row in rows.values():
        if row['group'] == 'regular4':
            assert rows[row['dualOf']]['dualOf'] == row['id']


def test_reflections_and_alternate_regular_sources_remain_distinct_realizations():
    row = report({'identity': 'uniform3:U12'})['identity']
    variants = row['realizations']
    assert len({r['id'] for r in variants}) == 3
    assert len({r['coordinateSet']['id'] for r in variants}) == 3
    assert len({r['topology']['id'] for r in variants}) == 3
    reflected = next(r for r in variants if r['relation'] == 'reflected-realization')
    assert reflected['construction']['axis'] == 0
    assert reflected['chirality']['complete']
    regular = report({'identity': 'regular4:tes'})['identity']['realizations']
    assert len(regular) == 2 and {r['source'] for r in regular} == {'native', 'regular-source'}
    dual = report({'identity': 'dual3:U12'})['identity']['realizations']
    assert len(dual) == 2 and dual[0]['catalogKey'] != dual[1]['catalogKey']


def test_missing_duals_and_missing_benchmark_rosters_remain_visible(summary):
    row = report({'identity': 'dual3:U3'})['identity']
    assert row['status'] == 'unmatched' and not row['realizations'] and not row['qualified']
    assert 'No current source' in row['blockers'][0]
    uniform = next(g for g in summary['groups'] if g['id'] == 'uniform4')
    assert uniform['unnamedObligations'] == 2191
    assert uniform['rosterStatus'] == 'benchmark-roster-missing'
    assert len(summary['blockers']) >= 5


def test_near_miss_names_keep_approximation_metrics_and_unknown_license():
    row = report({'identity': 'near-miss:near-miss-chamfered-cube'})['identity']['realizations'][0]
    evidence = row['sourceEvidence']['nearMissRealization']
    assert evidence['approximate'] and evidence['metrics']['maximumEdgeDeviationPercent'] > 0
    assert not evidence['certified']
    assert row['license']['status'] == 'unverified'


def test_source_counts_and_external_inventory_are_not_coverage(summary):
    assert {r['id']: r['actualCount'] for r in summary['sources']}['expanded'] == 980
    drive = summary['externalInventories'][0]
    assert drive['entryCount'] == 3064 and drive['downloadedCount'] == 3064
    assert sum(drive['groups'].values()) == 3064 and drive['licenseStatus'] == 'unverified'
    assert drive['baselineIdentityStatus'] == 'unmatched'
    assert all(g['qualifiedIdentities'] == 0 for g in summary['groups'])


def test_duplicate_realizations_never_increase_identity_coverage():
    group = {'id': 'x', 'required': 4}
    records = [
        {'id': 'one', 'group': 'x', 'qualified': True, 'realizations': [{'status': 'mapped-unverified'}] * 50}
    ] * 3
    row = coverage(group, records)
    assert row['qualifiedIdentities'] == 1 and row['qualifiedPercent'] == 25 and row['mappedIdentities'] == 1


@pytest.mark.parametrize(
    'identity', ['uniform3:U1', 'uniform3:U3', 'uniform3:U75', 'johnson:J1', 'near-miss:near-miss-chamfered-cube']
)
def test_current_numerical_audit_reuses_catalog_checks_without_promoting_identity(identity):
    result = dispatch_reconciliation({'op': 'corpus-reconciliation', 'params': {'identity': identity, 'verify': True}})
    audit = result['audit']
    assert audit['identity'] == identity and audit['status'] == 'pass'
    assert audit['checks']['incidence']['status'] == 'pass'
    assert audit['checks']['face_planarity']['maxRelativeResidual'] <= 1e-9
    assert len(audit['coordinateSet']['sha256']) == len(audit['topology']['sha256']) == 64
    assert audit['qualified'] is False and result['identity']['qualified'] is False


def test_coordinate_and_incidence_receipts_are_independent(monkeypatch):
    import engine.generators

    original = engine.generators.regular
    first = report({'identity': 'uniform3:U1', 'verify': True})['audit']

    def rotated_cycle(key):
        model = original(key)
        model['faces'][0] = model['faces'][0][1:] + model['faces'][0][:1]
        return model

    monkeypatch.setattr(engine.generators, 'regular', rotated_cycle)
    second = report({'identity': 'uniform3:U1', 'verify': True})['audit']
    assert first['coordinateSet'] == second['coordinateSet']
    assert first['topology'] != second['topology']
    assert second['status'] == 'pass'


def test_source_changes_and_missing_metadata_revoke_matches(tmp_path):
    manifest = deepcopy(load_manifest())
    manifest['sources'] = [manifest['sources'][0]]
    manifest['sources'][0]['file'] = 'source.json'
    manifest['candidateGroups'] = []
    manifest['externalInventories'] = []
    manifest['identities'] = [deepcopy(next(r for r in manifest['identities'] if r['id'] == 'johnson:J1'))]
    document = {'entries': [{'key': 'antiprism-j1', 'name': 'Source'}]}
    raw = json.dumps(document).encode()
    (tmp_path / 'source.json').write_bytes(raw)
    manifest['sources'][0].update(sha256=hashlib.sha256(raw).hexdigest(), entryCount=1)
    assert report(manifest=manifest, root=tmp_path)['groups'][3]['mappedIdentities'] == 1
    (tmp_path / 'source.json').write_text(json.dumps({'entries': []}))
    changed = report(manifest=manifest, root=tmp_path)
    assert changed['sources'][0]['status'] == 'stale' and changed['groups'][3]['mappedIdentities'] == 0
    (tmp_path / 'source.json').unlink()
    assert report(manifest=manifest, root=tmp_path)['sources'][0]['status'] == 'missing'


@pytest.mark.parametrize(
    'params',
    [
        {'identity': '../../secret'},
        {'group': 'absent'},
        {'verify': True},
        {'verify': 1},
        {'group': []},
        {'identity': 'uniform3:U1', 'group': 'johnson'},
        {'path': 'source.off'},
        {'realization': 'native:cube'},
        {'identity': 'dual3:U3', 'verify': True},
        {'identity': 'uniform3:U1', 'verify': True, 'realization': 'native:cube'},
    ],
)
def test_invalid_and_unavailable_queries_are_diagnosed(params):
    with pytest.raises(GeometryError):
        report(params)


@pytest.mark.parametrize(
    'mutate',
    [
        lambda m: m['identities'].append(deepcopy(m['identities'][0])),
        lambda m: m['identities'][0].update(qualification={'qualified': True}),
        lambda m: m['identities'][0]['links'][0].update(source='unknown'),
        lambda m: m['sources'][0].update(file='../escape.json'),
        lambda m: m['candidateGroups'][0].update(identityStatus='qualified'),
        lambda m: m['groups'][0].update(required=True),
    ],
)
def test_schema_rejects_false_qualification_duplicates_and_bad_sources(mutate):
    manifest = deepcopy(load_manifest())
    mutate(manifest)
    with pytest.raises(GeometryError):
        validate_manifest(manifest)


def test_read_only_dispatch_refuses_model_and_unknown_parameters():
    with pytest.raises(GeometryError):
        dispatch_reconciliation({'op': 'corpus-reconciliation', 'model': {}})
    with pytest.raises(GeometryError):
        dispatch_reconciliation({'op': 'corpus-reconciliation', 'path': 'elsewhere'})


def test_candidates_keep_every_distinct_source_key():
    result = report({'group': 'uniform4'})
    groups = result['candidateGroups']
    assert [len(g['records']) for g in groups] == [65, 79, 41, 31]
    assert len({r['id'] for g in groups for r in g['records']}) == 216
    assert all(r['identityStatus'] == 'unmatched' for g in groups for r in g['records'])


def test_cli_export_is_portable_json_and_includes_native_audit(tmp_path):
    from engine.corpus_reconciliation import main

    path = tmp_path / 'report.json'
    assert main(['--identity', 'uniform3:U1', '--verify', '--output', str(path)]) == 0
    value = json.loads(path.read_text(encoding='utf-8'))
    assert value['audit']['status'] == 'pass' and value['audit']['qualified'] is False
