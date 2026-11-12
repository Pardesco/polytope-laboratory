"""Offline R8 evidence validation and focused receipt reproduction; never launches Electron."""
import argparse
import ast
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path, PurePosixPath
import platform
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = Path(__file__).resolve().parent
REVISION = DIRECTORY / 'r8'


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f'Duplicate JSON key: {key}'
        result[key] = value
    return result


def read(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object,
                      parse_constant=lambda value: (_ for _ in ()).throw(AssertionError(value)))


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def repo_file(path):
    assert isinstance(path, str) and path and '\\' not in path
    parts = PurePosixPath(path)
    assert not parts.is_absolute() and '..' not in parts.parts and ':' not in path
    target = (ROOT / path).resolve()
    assert target.is_relative_to(ROOT) and target.is_file(), path
    return target


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_xml(path):
    # Node's JUnit reporter can leave terminal color controls in failure messages.
    raw = path.read_text(encoding='utf-8')
    return ET.ElementTree(ET.fromstring(re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', raw)))


def load():
    inventory = read(REVISION / 'inventory.json')
    assert inventory['scenario_files'] == ['scenarios-r6.json', 'scenarios-options.json']
    assert {p.name for p in REVISION.glob('*.json')} == {
        'inventory.json', 'scenarios-r6.json', 'scenarios-options.json', 'receipts.json'}
    assert all(read(REVISION / name)['schema_version'] == 2 for name in inventory['scenario_files'])
    scenarios = [case for name in inventory['scenario_files']
                 for case in read(REVISION / name)['scenarios']]
    return inventory, scenarios, read(REVISION / 'receipts.json')


@lru_cache(None)
def python_selectors(path):
    tree = ast.parse(path.read_text(encoding='utf-8-sig'))
    selectors = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
            selectors.add(node.name)
        if isinstance(node, ast.ClassDef):
            selectors.update(node.name+'::'+method.name for method in node.body
                             if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef))
                             and method.name.startswith('test_'))
    return selectors


def validate_fixture(fixture):
    path = repo_file(fixture['path'])
    assert fixture['path'].startswith('tests/') and fixture['selector']
    if fixture['kind'] == 'pytest':
        assert fixture['selector'] in python_selectors(path), fixture
    else:
        assert fixture['kind'] == 'node-test'
        assert path.suffix in {'.mjs', '.cjs'}
        literal = fixture.get('template', fixture['selector'])
        assert re.search(r'\btest\(\s*([\'"`])'+re.escape(literal)+r'\1',
                         path.read_text(encoding='utf-8')), fixture
        if 'template' in fixture:
            for key, value in fixture['bindings'].items():
                literal = literal.replace('${'+key+'}', value)
            assert literal == fixture['selector']
    assert fixture['level'] in {'native', 'ui-unit', 'ui-mounted', 'tooling-unit'}
    assert (fixture['kind'] == 'pytest') == (fixture['level'] == 'native')
    assert fixture['role'] in {'direct', 'related-not-oracle'} and fixture['scope']


def source_snapshot(inventory, scenarios):
    paths = set(inventory['source_files'])
    for case in scenarios:
        paths.update(case['source_files'])
        paths.update(f['path'] for f in case['fixtures'])
    # Pin transitive application code, native catalog assets and fixture bytes too.
    for scope in inventory['source_scopes']:
        assert scope in {'engine', 'ui', 'desktop', 'tests/fixtures'}
        paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / scope).rglob('*')
                     if p.is_file() and p.suffix in {'.py', '.json', '.js', '.mjs', '.cjs',
                                                   '.html', '.css', '.off', '.4off', '.dxf',
                                                   '.polyproj', '.png'}
                     and '__pycache__' not in p.parts)
    return {path: sha(repo_file(path)) for path in sorted(paths)}


def fixture_results(fixture, run):
    if fixture['kind'] == 'pytest':
        prefix = fixture['path']+'::'+fixture['selector']
        return [row for row in run['tests'] if row['id'] == prefix or row['id'].startswith(prefix+'[')]
    rows = [row for row in run['tests'] if row['name'] == fixture['selector']
            and row['path'] == fixture['path']]
    if rows:
        return rows
    # Node emits a parent with subtests as a JUnit suite, not a leaf testcase.
    for suite in parse_xml(repo_file(run['report_path'])).getroot().iter('testsuite'):
        if suite.attrib.get('name') != fixture['selector']:
            continue
        children = list(suite.iter('testcase'))
        paths = {reported_test_path(c.attrib['file']) for c in children}
        assert children and paths == {fixture['path']}
        failed = any(c.find('failure') is not None or c.find('error') is not None for c in children)
        skipped = any(c.find('skipped') is not None for c in children)
        failed |= int(suite.attrib.get('failures', 0))+int(suite.attrib.get('errors', 0)) > 0
        skipped |= int(suite.attrib.get('skipped', 0)) > 0
        rows.append({'id': fixture['path']+'::'+fixture['selector'], 'path': fixture['path'],
                     'name': fixture['selector'], 'status': 'failed' if failed else 'skipped' if skipped else 'passed'})
    return rows


def validate(inventory=None, scenarios=None, receipts=None, check_pins=True):
    if inventory is None:
        inventory, scenarios, receipts = load()
    assert inventory['schema_version'] == 2 and inventory['baseline_audit_complete'] is False
    assert inventory['target_version'] == '6.0'
    assert re.fullmatch('[0-9a-f]{40}', inventory['inspected_commit'])
    legacy = read(DIRECTORY / 'inventory.json')
    assert inventory['supersedes']['version'] == legacy['inventory_version']
    frozen = ['inventory.json', 'sources.json', 'domains.json', 'INDEX.md', 'VERIFICATION.md',
              *legacy['scenario_files']]
    assert set(inventory['supersedes']['sha256']) == {'docs/conformance/'+name for name in frozen}
    for path, digest in inventory['supersedes']['sha256'].items():
        assert sha(repo_file(path)) == digest, 'Frozen R5 evidence changed: '+path
    legacy_cases = [c for name in legacy['scenario_files'] for c in read(DIRECTORY / name)['scenarios']]
    old_ids = {c['id'] for c in legacy_cases}
    ids = [case['id'] for case in scenarios]
    assert len(ids) == len(set(ids)) and not old_ids.intersection(ids)
    aliases = [alias for case in scenarios for alias in case.get('audit_local_case_ids', [])]
    assert len(aliases) == len(set(aliases)) and not set(aliases).intersection(ids+list(old_ids))
    audit = repo_file(inventory['predecessor_audit']).read_text(encoding='utf-8')
    assert all(alias in audit for alias in aliases)
    ledger_ids = {r['requirement_id'] for r in read(ROOT / 'docs/parity-ledger.json')['requirements']}
    mapping = inventory['requirements']
    assert len(mapping) == len(ledger_ids) == 73
    assert {row['id'] for row in mapping} == ledger_ids
    assert len({(c['requirement_id'], c['option']) for c in scenarios}) == len(scenarios)
    source_text = '\n'.join(p.read_text(encoding='utf-8') for p in (ROOT / 'ui').glob('*')
                            if p.suffix in {'.js', '.mjs', '.html'})
    for case in scenarios:
        assert case['id'] == case['requirement_id'].lower()+'-'+case['option']
        assert re.fullmatch(r'[a-z]+-\d{2}-[a-z0-9-]+', case['id'])
        assert case['requirement_id'] in ledger_ids
        assert case['title'] and case['source']['description'] and case['parameters']
        assert case['parameters_are_executable'] is False
        domain = case['domain']
        assert domain['dimensions'] and set(domain['dimensions']) <= {3, 4}
        assert domain['object_classes'] and domain['limits'] and 'approximate' in domain['numeric_contract'].lower()
        assert domain['refusals'] and case['checks'] and case['remaining']
        assert case['closure']['kind'] in {'scenario-closed', 'local-tranche', 'inventory-only'}
        assert set(case['closure']['legacy_case_ids']) <= old_ids
        assert set(case['closure']['legacy_case_ids']) <= {
            c['id'] for c in legacy_cases if c['requirement_id'] == case['requirement_id']}
        assert case['closure']['scope'] and case['benchmark_status'] == 'unverified'
        dispositions = case['closure']['legacy_disposition']
        assert set(dispositions) == set(case['closure']['legacy_case_ids'])
        assert set(dispositions.values()) <= {'implementation-gap-closed', 'local-tranche-only',
                                             'strengthened-existing-coverage', 'still-open'}
        if case['closure']['kind'] != 'scenario-closed':
            assert 'implementation-gap-closed' not in dispositions.values()
        assert case['platform_status'] == 'not-run' and case['competitor_status'] == 'not-run'
        assert case['ui']['route'] and case['ui']['element_ids']
        for element in case['ui']['element_ids']:
            assert element in source_text, element
        for path in case['source_files']:
            repo_file(path)
        assert case['fixtures']
        if case['closure']['kind'] != 'inventory-only':
            assert any(f['level'] == 'native' and f['role'] == 'direct' for f in case['fixtures'])
        assert any(f['level'] != 'native' for f in case['fixtures'])
        if case['closure']['kind'] == 'scenario-closed':
            assert any(f['level'] == 'ui-mounted' and f['role'] == 'direct' for f in case['fixtures'])
        for fixture in case['fixtures']:
            validate_fixture(fixture)
            run = receipts['runs'][fixture['run_id']]
            assert run['kind'] == ('native' if fixture['kind'] == 'pytest' else 'ui')
            matches = fixture_results(fixture, run)
            observed = fixture.get('observed_status', 'passed')
            assert observed in {'passed', 'failed'}
            if observed == 'failed':
                assert case['closure']['kind'] == 'inventory-only'
                assert case['evidence_status'] == 'incomplete' and len(case['remaining']) > 80
            assert matches and all(r['status'] == observed for r in matches), fixture
            assert fixture['path'] in run['source_sha256']
            assert set(case['source_files']) <= set(run['source_sha256'])
    all_cases = {c['id']: c for c in legacy_cases+scenarios}
    for row in mapping:
        assert row['title']
        linked = row['case_ids']
        assert len(linked) == len(set(linked))
        assert all(i in all_cases and all_cases[i]['requirement_id'] == row['id'] for i in linked)
        assert set(linked) == {c['id'] for c in legacy_cases+scenarios if c['requirement_id'] == row['id']}
        task = row['remaining_inventory_task']
        assert linked or task
        if task:
            assert task['owner'] and len(task['next_action']) >= 35 and task['status'] == 'open'
            assert task['fixture_candidates']
            for path in task['fixture_candidates']:
                repo_file(path)
        assert row['benchmark_status'] == 'unverified' and row['platform_status'] == 'not-run'
    assert receipts['schema_version'] == 2
    assert not receipts.get('pending_runs'), 'Qualification is still running'
    for attempt in receipts.get('failed_attempts', []):
        report = repo_file(attempt['report_path'])
        assert sha(report) == attempt['report_sha256']
        rows = parse_report(report, attempt['kind'], scenarios)
        assert attempt['counts'] == {s: sum(r['status'] == s for r in rows)
                                     for s in ('passed', 'failed', 'skipped')}
        assert attempt['counts']['failed'] > 0 and attempt['exit_code'] != 0
        assert attempt['source_binding'] == 'not-retained-for-failed-attempt'
    current = source_snapshot(inventory, scenarios) if check_pins else None
    for run in receipts['runs'].values():
        assert run['kind'] in {'native', 'ui', 'build'} and run['command']
        assert run['environment']
        if not (run['started_utc'] and run['finished_utc']):
            assert run['recovered_utc'] and run['timing_note']
            assert run['source_capture_basis'] == 'recovered-after-successful-equality-check'
        assert run['source_unchanged'] is True
        if check_pins:
            assert set(run['source_sha256']) == set(current), 'Incomplete source bindings'
            for path, digest in run['source_sha256'].items():
                assert current[path] == digest, 'Stale receipt: '+path
        report = repo_file(run['report_path'])
        assert sha(report) == run['report_sha256']
        if run['kind'] != 'build':
            assert run['tests'] and len({r['id'] for r in run['tests']}) == len(run['tests'])
            assert run['counts']['passed'] == sum(r['status'] == 'passed' for r in run['tests'])
            assert run['counts']['failed'] == sum(r['status'] == 'failed' for r in run['tests'])
            assert run['counts']['skipped'] == sum(r['status'] == 'skipped' for r in run['tests'])
            assert run['counts']['skipped'] == 0
            assert (run['exit_code'] == 0) == (run['counts']['failed'] == 0)
            parsed = parse_report(report, run['kind'], scenarios)
            assert run['tests'] == parsed, 'Receipt results differ from raw execution report'
        else:
            assert run['exit_code'] == 0
    return {'legacy_scenarios': len(legacy_cases), 'revision_scenarios': len(scenarios),
            'requirements': len(mapping), 'runs': len(receipts['runs'])}


def reported_test_path(reported):
    reported = re.sub('/+', '/', reported.replace('\\', '/'))
    assert '/tests/' in reported
    path = 'tests/'+reported.rsplit('/tests/', 1)[1]
    repo_file(path)
    return path


def parse_report(report, kind, scenarios):
    rows = []
    root = parse_xml(report).getroot()
    for case in root.iter('testcase'):
        name = case.attrib['name']
        if kind == 'native':
            parts = case.attrib['classname'].split('.')
            class_name = parts.pop() if parts[-1][0].isupper() else None
            path = '/'.join(parts)+'.py'
            selector = (class_name+'::' if class_name else '')+name
            identity = path+'::'+selector
        else:
            path = reported_test_path(case.attrib['file'])
            identity = path+'::'+name
        status = 'failed' if case.find('failure') is not None or case.find('error') is not None else (
            'skipped' if case.find('skipped') is not None else 'passed')
        rows.append({'id': identity, 'path': path, 'name': name, 'status': status})
    return rows


def run_checks(kind):
    inventory, scenarios, receipts = load()
    before = source_snapshot(inventory, scenarios)
    started = datetime.now(timezone.utc).isoformat()
    report = REVISION / (kind+'.xml' if kind != 'build' else 'build.txt')
    if kind == 'native':
        selectors = sorted({f['path']+'::'+f['selector'] for c in scenarios for f in c['fixtures']
                            if f['kind'] == 'pytest'})
        command = [sys.executable, '-B', '-m', 'pytest', *selectors, '-q', '-p', 'no:cacheprovider',
                   '--junitxml='+str(report)]
    elif kind == 'ui':
        files = sorted({f['path'] for c in scenarios for f in c['fixtures'] if f['kind'] == 'node-test'})
        command = ['node', '--test', '--test-concurrency', '1', '--test-reporter=junit', *files]
    else:
        command = ['npx.cmd', 'vite', 'build', '--configLoader', 'native']
    print('Running', kind, 'receipt', flush=True)
    receipts = read(REVISION / 'receipts.json')
    receipts.setdefault('pending_runs', {})[kind] = {
        'command': command, 'started_utc': started, 'source_sha256': before,
        'report_path': report.relative_to(ROOT).as_posix(),
    }
    write(REVISION / 'receipts.json', receipts)
    result = subprocess.run(command, cwd=ROOT, capture_output=kind != 'native', encoding='utf-8', errors='replace')
    if kind != 'native':
        report.write_text(result.stdout if kind == 'ui' else result.stdout+result.stderr, encoding='utf-8')
    if kind != 'native':
        print(result.stdout[-2500:] if kind != 'ui' else result.stderr[-2500:], flush=True)
    if result.returncode:
        if result.stderr:
            print(result.stderr[-4000:], file=sys.stderr)
    assert before == source_snapshot(inventory, scenarios), 'Sources changed during execution'
    rows = parse_report(report, kind, scenarios) if kind != 'build' else []
    receipts = read(REVISION / 'receipts.json')
    receipts.get('pending_runs', {}).pop(kind, None)
    receipts['runs'][kind] = {
        'kind': kind, 'command': command, 'started_utc': started,
        'finished_utc': datetime.now(timezone.utc).isoformat(), 'exit_code': result.returncode,
        'environment': {'platform': platform.platform(), 'python': platform.python_version(),
                        'node': subprocess.check_output(['node', '--version'], text=True).strip()},
        'source_unchanged': True, 'source_sha256': before,
        'report_path': report.relative_to(ROOT).as_posix(), 'report_sha256': sha(report),
        'counts': {s: sum(r['status'] == s for r in rows) for s in ('passed', 'failed', 'skipped')},
        'tests': rows,
    }
    write(REVISION / 'receipts.json', receipts)
    print(kind, receipts['runs'][kind]['counts'], flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', choices=['native', 'ui', 'build', 'all'])
    args = parser.parse_args()
    if args.run:
        for kind in ('native', 'ui', 'build') if args.run == 'all' else (args.run,):
            run_checks(kind)
    else:
        print(json.dumps(validate(), indent=2))
