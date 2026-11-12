"""Validate the evidence inventory, not operation or competitor conformance."""

from copy import deepcopy
from functools import lru_cache
from pathlib import Path, PurePosixPath
import ast
import json
import re

import pytest


ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs' / 'conformance'
PARTIAL_ROWS = {
    'CON-02',
    'CON-03',
    'CON-05',
    'CON-06',
    'CON-07',
    'CON-08',
    'CON-09',
    'CON-10',
    'CON-11',
    'CON-12',
    'CON-13',
    'CON-14',
    'FAC-02',
    'FAC-03',
    'FAC-04',
    'STEL-01',
    'STEL-03',
    'STEL-04',
    'STEL-05',
    'VIS-02',
    'VIS-03',
    'IO-01',
    'IO-02',
    'IO-03',
    'IO-04',
    'NET-02',
    'NET-03',
    'NET-05',
    'SEC-05',
}
COMMON_ROWS = {'CON-03', 'CON-04', 'SEC-01', 'SEC-02', 'NET-01', 'NET-04', 'NET-06', 'CON-09', 'IO-01', 'IO-02'}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f'Duplicate JSON key: {key}'
        result[key] = value
    return result


def read_json(path):
    return json.loads(
        path.read_text(encoding='utf-8'),
        object_pairs_hook=unique_object,
        parse_constant=lambda value: pytest.fail('Nonfinite JSON: ' + value),
    )


def repo_file(path):
    assert isinstance(path, str) and path and '\\' not in path
    parts = PurePosixPath(path)
    assert not parts.is_absolute() and '..' not in parts.parts and ':' not in path
    target = (ROOT / path).resolve()
    assert target.is_relative_to(ROOT) and target.is_file(), path
    return target


MANIFEST = read_json(DIRECTORY / 'inventory.json')
SOURCES = read_json(DIRECTORY / MANIFEST['source_file'])['sources']
DOMAINS = read_json(DIRECTORY / MANIFEST['domain_file'])['domains']
CASES = [case for name in MANIFEST['scenario_files'] for case in read_json(DIRECTORY / name)['scenarios']]
SOURCE_MAP = {source['id']: source for source in SOURCES}
DOMAIN_MAP = {domain['id']: domain for domain in DOMAINS}
CASE_MAP = {case['id']: case for case in CASES}


@lru_cache(None)
def fixture_test_selectors(path):
    tree = ast.parse(repo_file(path).read_text(encoding='utf-8-sig'))
    result = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
            result.add(node.name)
        if isinstance(node, ast.ClassDef):
            result.update(
                node.name + '::' + method.name
                for method in node.body
                if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name.startswith('test_')
            )
    return result


def validate_case(case):
    assert re.fullmatch(r'(con|sec|net|stel|fac|vis|io)-\d{2}-[a-z0-9-]+', case['id'])
    assert case['id'] == case['requirement_id'].lower() + '-' + case['option']
    assert case['title'] and case['domain_id'] in DOMAIN_MAP
    assert case['implementation'] in {'supported', 'restricted', 'engine-only', 'unsupported', 'unverified'}
    assert case['input']['description'] and isinstance(case['input']['parameters'], dict)
    assert case['input']['executable'] is False
    scope = case['case_domain']
    assert scope['source_dimensions'] and set(scope['source_dimensions']) <= {3, 4}
    assert set(scope['source_dimensions']) <= set(DOMAIN_MAP[case['domain_id']]['dimensions'])
    assert set(scope['supported_source_dimensions']) <= set(scope['source_dimensions'])
    assert scope['object_class'] and scope['support_note']
    if case['implementation'] in {'unsupported', 'unverified'}:
        assert scope['supported_source_dimensions'] == []
    else:
        assert scope['supported_source_dimensions']
    expected = case['expected']
    assert expected['basis'] in {'independent-invariant', 'documented-or-local-contract'}
    assert expected['checks'] and all(isinstance(check, str) and check.strip() for check in expected['checks'])
    assert expected['source_refs']
    for ref in expected['source_refs']:
        assert ref['source_id'] in SOURCE_MAP and ref['locator']
        assert ref['role'] in {
            'requirement-scope',
            'implementation-contract',
            'expectation-oracle',
            'documented-options',
            'historical-metadata',
            'unretrieved-scope-link',
        }
    if expected['basis'] == 'independent-invariant':
        assert any(
            ref['source_id'] == 'independent-fixtures' and ref['role'] == 'expectation-oracle'
            for ref in expected['source_refs']
        )
    assert case['fixtures']
    for fixture in case['fixtures']:
        target = repo_file(fixture['path'])
        assert target.is_relative_to(ROOT / 'tests')
        assert fixture['role'] in {'direct', 'related-not-oracle'}
        if fixture['selector'] is not None:
            assert target.suffix == '.py' and fixture['selector'] in fixture_test_selectors(fixture['path'])
            assert fixture['evidence'] == 'existing-test-inspected'
        else:
            assert fixture['evidence'] == 'existing-suite-inspected'
    assert case['benchmark']['target_version'] == '6.0'
    assert case['benchmark']['installed_version'] == '5.4'
    assert case['benchmark']['status'] == 'unverified' and case['benchmark']['reason']
    assert case['qualification'] == {
        'native_fixture_run': 'not-recorded-per-case',
        'desktop_run': 'not-run',
        'competitor_run': 'not-run',
    }
    follow = case['follow_up']
    assert follow['kind'] in {
        'baseline-semantics',
        'ui-domain',
        'domain-extension',
        'desktop-qualification',
        'hardware-qualification',
    }
    assert follow['owner'].startswith(('R5-', 'R6-', 'R7-')) and follow['priority'] in {'P1', 'P2'}
    assert len(follow['unverified']) >= 20 and len(follow['next_action']) >= 35
    assert case['ui']['route'] and isinstance(case['ui']['element_ids'], list)
    if case['implementation'] == 'engine-only':
        assert case['ui']['element_ids'] == [] and follow['kind'] == 'ui-domain'


def test_manifest_pins_scope_and_does_not_promote_ledger_status():
    assert MANIFEST['schema_version'] == 1
    assert MANIFEST['target_version'] == '6.0' and MANIFEST['baseline_audit_complete'] is False
    assert re.fullmatch('[0-9a-f]{40}', MANIFEST['audited_baseline_commit'])
    assert re.fullmatch('[0-9a-f]{40}', MANIFEST['gap_audit_baseline_commit'])
    assert set(MANIFEST['partial_requirement_ids']) == PARTIAL_ROWS
    assert COMMON_ROWS <= {case['requirement_id'] for case in CASES}
    assert MANIFEST['excluded_packages'] and MANIFEST['evidence_policy']


def test_manifest_lists_every_data_file_once():
    listed = [MANIFEST['source_file'], MANIFEST['domain_file'], *MANIFEST['scenario_files']]
    assert len(listed) == len(set(listed))
    assert set(listed) == {p.name for p in DIRECTORY.glob('*.json')} - {'inventory.json'}
    for name in listed:
        assert '/' not in name and '\\' not in name
        assert read_json(DIRECTORY / name)['schema_version'] == 1


def test_ids_are_unique_and_domain_and_source_references_resolve():
    assert len(CASE_MAP) == len(CASES)
    assert len(SOURCE_MAP) == len(SOURCES) and len(DOMAIN_MAP) == len(DOMAINS)
    assert {case['domain_id'] for case in CASES} == set(DOMAIN_MAP)
    used = {ref['source_id'] for case in CASES for ref in case['expected']['source_refs']}
    assert used <= set(SOURCE_MAP)


@pytest.mark.parametrize('source', SOURCES, ids=lambda source: source['id'])
def test_source_provenance_is_versioned_and_portable(source):
    assert source['version'] and source['scope'] and source['locator']
    if 'path' in source:
        repo_file(source['path'])
    if 'external_path' in source:
        assert re.fullmatch('[0-9a-f]{64}', source['sha256'])
        assert source['kind'] in {'installed-manual', 'installed-static-report'}
    if 'url' in source:
        assert source['url'].startswith(('https://www.software3d.com/', 'https://software3d.com/'))
        if source['kind'] != 'unretrieved-reference':
            assert source['retrieved_on'] == '2026-11-09'
    assert any(key in source for key in ('path', 'external_path', 'url'))


@pytest.mark.parametrize('domain', DOMAINS, ids=lambda domain: domain['id'])
def test_domain_has_classes_limits_numeric_and_refusal_contracts(domain):
    assert domain['dimensions'] and set(domain['dimensions']) <= {3, 4}
    assert domain['object_classes'] and domain['parameter_limits'] and domain['unsupported']
    assert 'approximate' in domain['numeric_contract']
    for path in domain['implementation']:
        repo_file(path)


@pytest.mark.parametrize('case', CASES, ids=lambda case: case['id'])
def test_scenario_is_actionable_and_evidence_is_not_conformance(case):
    validate_case(case)


@pytest.mark.parametrize('row', MANIFEST['requirements'], ids=lambda row: row['id'])
def test_requirement_index_covers_every_option_and_open_case(row):
    cases = [case for case in CASES if case['requirement_id'] == row['id']]
    assert cases and set(row['case_ids']) == {case['id'] for case in cases}
    assert len(row['case_ids']) == len(set(row['case_ids']))
    assert set(row['qualification_case_ids']) == set(row['case_ids'])
    assert set(row['implementation_gap_case_ids']) == {
        case['id'] for case in cases if case['implementation'] in {'unsupported', 'engine-only', 'unverified'}
    }
    assert row['title'] and row['cross_products']
    if row['id'] in PARTIAL_ROWS:
        assert row['audit_status'] == 'partial'
        assert all(case['follow_up']['next_action'] for case in cases)


def test_no_unindexed_requirement_or_hidden_duplicate_option():
    ids = [row['id'] for row in MANIFEST['requirements']]
    assert len(ids) == len(set(ids)) and set(ids) == {case['requirement_id'] for case in CASES}
    assert len({(case['requirement_id'], case['option']) for case in CASES}) == len(CASES)


@pytest.mark.parametrize(
    'bad_path', ['../outside.py', 'C:/outside.py', '/tmp/outside', 'tests/../missing.py', 'tests\\bad.py']
)
def test_paths_cannot_escape_repository(bad_path):
    with pytest.raises(AssertionError):
        repo_file(bad_path)


@pytest.mark.parametrize('mutation', ['benchmark', 'fixture', 'source', 'dimension', 'follow-up', 'engine-only'])
def test_invalid_or_inflated_evidence_is_rejected(mutation):
    case = deepcopy(CASES[0])
    if mutation == 'benchmark':
        case['benchmark']['status'] = 'validated'
    if mutation == 'fixture':
        case['fixtures'][0]['selector'] = 'test_invented_fixture'
    if mutation == 'source':
        case['expected']['source_refs'][0]['source_id'] = 'unversioned-guess'
    if mutation == 'dimension':
        case['case_domain']['source_dimensions'] = [5]
    if mutation == 'follow-up':
        case['follow_up']['next_action'] = ''
    if mutation == 'engine-only':
        case['implementation'] = 'engine-only'
    with pytest.raises(AssertionError):
        validate_case(case)


def test_duplicate_json_keys_are_rejected():
    with pytest.raises(AssertionError, match='Duplicate JSON key'):
        json.loads('{"status":"unverified","status":"validated"}', object_pairs_hook=unique_object)


# R5 assertions above remain unchanged; R8 is a separate, additive successor.
import importlib.util

_revision_spec = importlib.util.spec_from_file_location('conformance_revision', DIRECTORY / 'verify.py')
REVISION = importlib.util.module_from_spec(_revision_spec)
_revision_spec.loader.exec_module(REVISION)
R8_MANIFEST, R8_CASES, R8_RECEIPTS = REVISION.load()


def test_r8_preserves_frozen_r5_and_validates_source_bound_execution():
    # Receipt freshness against the live tree is a release check (`python docs/conformance/verify.py`);
    # every later commit legitimately changes pinned sources, so the everyday suite checks the rest.
    report = REVISION.validate(check_pins=False)
    assert report == {'legacy_scenarios': 139, 'revision_scenarios': 54, 'requirements': 73, 'runs': 3}


@pytest.mark.parametrize('case', R8_CASES, ids=lambda case: case['id'])
def test_r8_actual_fixture_selectors_and_separate_evidence_levels(case):
    for fixture in case['fixtures']:
        REVISION.validate_fixture(fixture)
        matches = REVISION.fixture_results(fixture, R8_RECEIPTS['runs'][fixture['run_id']])
        assert matches and all(row['status'] == fixture.get('observed_status', 'passed') for row in matches)
    assert case['benchmark_status'] == 'unverified' and case['platform_status'] == 'not-run'


def test_r8_all_broad_ids_have_scenarios_or_actionable_remaining_inventory():
    canonical = read_json(ROOT / 'docs/parity-ledger.json')
    ids = {row['requirement_id'] for row in canonical['requirements']}
    assert {row['id'] for row in R8_MANIFEST['requirements']} == ids and len(ids) == 73
    assert sum(not row['case_ids'] for row in R8_MANIFEST['requirements']) == 20
    assert all(
        row['case_ids'] or row['remaining_inventory_task']['status'] == 'open' for row in R8_MANIFEST['requirements']
    )


def test_r8_closes_named_implementation_gaps_without_promoting_broad_rows():
    closed = {
        legacy
        for case in R8_CASES
        for legacy, status in case['closure']['legacy_disposition'].items()
        if status == 'implementation-gap-closed'
    }
    assert closed == {'stel-01-arbitrary-planes', 'stel-04-editor-subgroups'}
    cases = {case['id']: case for case in R8_CASES}
    assert (
        cases['fac-02-r6-pyritohedron-candidates']['closure']['legacy_disposition']['fac-02-dodecahedron-frontier']
        == 'still-open'
    )
    assert cases['con-09-r6-separated-components']['closure']['kind'] != 'scenario-closed'
    assert cases['sec-05-r6-pentagram-prism-independent']['closure']['kind'] == 'local-tranche'


def test_r8_nine_morph_options_preserve_sampled_and_refused_source_rows():
    matrix = read_json(ROOT / 'tests/fixtures/morph_method_inventory_r7.json')
    methods = [case for case in R8_CASES if case['option'].startswith('r8-method-')]
    assert len(methods) == 9
    for case in methods:
        params = case['parameters']
        rows = [r for r in matrix['rows'] if r['method'] == params['method']]
        assert len(rows) == 13 and case['closure']['kind'] == 'inventory-only'
        assert params['sampledSources'] == [r['source'] for r in rows if r['status'] == 'sampled']
        assert params['refusedSources'] == {r['source']: r['reason'] for r in rows if r['status'] == 'refused'}
        assert all(f['role'] == 'related-not-oracle' for f in case['fixtures'] if f['kind'] == 'node-test')


def test_r8_parent_subtest_failure_cannot_inherit_a_passing_parent(monkeypatch):
    fixture = next(
        f for case in R8_CASES for f in case['fixtures'] if f['selector'].startswith('mounted arbitrary planes')
    )
    run = R8_RECEIPTS['runs']['ui']
    assert not any(row['name'] == fixture['selector'] for row in run['tests'])
    assert REVISION.fixture_results(fixture, run)[0]['status'] == 'passed'
    report = deepcopy(REVISION.parse_xml(REVISION.repo_file(run['report_path'])))
    suite = next(s for s in report.getroot().iter('testsuite') if s.attrib['name'] == fixture['selector'])
    REVISION.ET.SubElement(next(suite.iter('testcase')), 'failure').text = 'Failed child assertion'
    monkeypatch.setattr(REVISION, 'parse_xml', lambda path: report)
    assert REVISION.fixture_results(fixture, run)[0]['status'] == 'failed'


def test_r8_node_ansi_failure_messages_parse_without_rewriting_raw_evidence(tmp_path):
    report = tmp_path / 'node.xml'
    report.write_bytes(
        b'<testsuites><testcase name="failed" failure="\x1b[2mtimeout\x1b[22m"><failure>timeout</failure></testcase></testsuites>'
    )
    before = REVISION.sha(report)
    parsed = REVISION.parse_xml(report)
    assert parsed.getroot()[0].attrib['failure'] == 'timeout'
    assert parsed.getroot()[0].find('failure') is not None
    assert REVISION.sha(report) == before and b'\x1b' in report.read_bytes()


def test_r8_other_malformed_xml_is_not_silently_repaired(tmp_path):
    report = tmp_path / 'node.xml'
    report.write_bytes(b'<testsuites>\x00</testsuites>')
    with pytest.raises(REVISION.ET.ParseError):
        REVISION.parse_xml(report)


@pytest.mark.parametrize(
    'mutation',
    [
        'benchmark',
        'platform',
        'duplicate',
        'missing-row',
        'missing-task',
        'invented-python',
        'invented-node',
        'invented-ui',
        'missing-pin',
        'failed-result',
        'forged-count',
        'empty-selector',
        'tranche-promotion',
        'false-level',
        'unbound-source',
        'raw-report',
        'frozen-pin',
    ],
)
def test_r8_rejects_missing_inventory_and_inflated_receipts(mutation):
    inventory, cases, receipts = deepcopy((R8_MANIFEST, R8_CASES, R8_RECEIPTS))
    if mutation == 'benchmark':
        cases[0]['benchmark_status'] = 'validated'
    if mutation == 'platform':
        cases[0]['platform_status'] = 'passed'
    if mutation == 'duplicate':
        cases.append(deepcopy(cases[0]))
    if mutation == 'missing-row':
        inventory['requirements'].pop()
    if mutation == 'missing-task':
        next(r for r in inventory['requirements'] if not r['case_ids'])['remaining_inventory_task'] = None
    if mutation == 'invented-python':
        cases[0]['fixtures'][0]['selector'] = 'test_invented_fixture'
    if mutation == 'invented-node':
        cases[0]['fixtures'][-1]['selector'] = 'invented mounted receipt'
    if mutation == 'invented-ui':
        cases[0]['ui']['element_ids'] = ['invented-r8-control']
    if mutation == 'missing-pin':
        receipts['runs']['native']['source_sha256'].pop(cases[0]['fixtures'][0]['path'])
    if mutation == 'failed-result':
        next(r for r in receipts['runs']['native']['tests'] if r['status'] == 'passed')['status'] = 'failed'
    if mutation == 'forged-count':
        receipts['runs']['ui']['counts']['passed'] += 1
    if mutation == 'empty-selector':
        cases[0]['fixtures'][0]['selector'] = None
    if mutation == 'tranche-promotion':
        case = next(c for c in cases if c['closure']['kind'] == 'local-tranche' and c['closure']['legacy_case_ids'])
        case['closure']['legacy_disposition'][case['closure']['legacy_case_ids'][0]] = 'implementation-gap-closed'
    if mutation == 'false-level':
        cases[0]['fixtures'][0]['level'] = 'ui-mounted'
    if mutation == 'unbound-source':
        cases[0]['source_files'].append('docs/GAP_AUDIT_2026-11-10.md')
    if mutation == 'frozen-pin':
        inventory['supersedes']['sha256'].pop('docs/conformance/inventory.json')
    if mutation == 'raw-report':
        receipts['runs']['ui']['tests'].append({'id': 'invented', 'path': '', 'name': 'invented', 'status': 'passed'})
        receipts['runs']['ui']['counts']['passed'] += 1
    with pytest.raises(AssertionError):
        REVISION.validate(inventory, cases, receipts, check_pins=False)


def test_r8_changed_source_revokes_receipt(monkeypatch):
    inventory, cases, receipts = deepcopy((R8_MANIFEST, R8_CASES, R8_RECEIPTS))
    current = REVISION.source_snapshot(inventory, cases)
    for run in receipts['runs'].values():
        run['source_sha256'] = dict(current)
    REVISION.validate(inventory, cases, receipts)
    original = REVISION.sha
    changed = ROOT / 'engine/server.py'
    monkeypatch.setattr(REVISION, 'sha', lambda path: '0' * 64 if path == changed else original(path))
    with pytest.raises(AssertionError, match='Stale receipt'):
        REVISION.validate(inventory, cases, receipts)


@pytest.mark.parametrize('bad_path', ['../outside.json', '/tmp/outside', 'C:/outside', 'tests\\bad.py'])
def test_r8_receipt_paths_cannot_escape_repository(bad_path):
    with pytest.raises(AssertionError):
        REVISION.repo_file(bad_path)
