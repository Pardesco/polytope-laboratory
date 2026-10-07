"""Durable resume, actual subprocess timeout/cancellation, and CLI coverage."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time

import pytest

from engine.formats import export_off
from engine.generators import regular

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('drive_audit', ROOT / 'scripts/audit-drive-corpus.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def collection(tmp_path, shapes=('simplex4', 'tesseract')):
    directory = tmp_path / 'source'
    directory.mkdir()
    entries = []
    for index, shape in enumerate(shapes):
        relative = f'Cat1/{index}-{shape}.off'
        path = directory / relative
        path.parent.mkdir(exist_ok=True)
        path.write_text(export_off(regular(shape)), encoding='utf-8')
        entries.append({'id': f'source_{index}', 'relativePath': relative, 'status': 'downloaded',
                        'sha256': audit.local.digest(path)})
    manifest = {'sourceUrl': 'fixture://local', 'downloadComplete': True, 'files': entries}
    (directory / 'download-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    return directory, manifest


def cli(directory, output, *flags):
    return subprocess.run([sys.executable, str(ROOT / 'scripts/audit-drive-corpus.py'), str(directory),
                           '--output', str(output), *flags], capture_output=True, text=True,
                          encoding='utf-8', timeout=30, cwd=ROOT)


def read_report(output):
    return json.loads(output.read_text(encoding='utf-8'))


def test_cli_full_audit_limit_then_resume_and_noop(tmp_path):
    directory, manifest = collection(tmp_path)
    output = tmp_path / 'report.json'
    first = cli(directory, output, '--all', '--limit', '1')
    assert first.returncode == 0, first.stderr
    report = read_report(output)
    assert not report['completeImporterAudit']
    assert report['progress']['completedThisRun'] == 1
    assert report['progress']['pendingSelected'] == 1
    original = report['records'][0]['auditedUtc']
    resumed = cli(directory, output, '--all', '--resume')
    assert resumed.returncode == 0, resumed.stderr
    report = read_report(output)
    assert report['completeImporterAudit'] and report['allManifestEntriesAttempted']
    assert report['progress']['resumed'] == 1 and report['progress']['completedThisRun'] == 1
    assert report['records'][0]['auditedUtc'] == original
    assert report['summary']['statusCounts'] == {'parsed': 2}
    noop = cli(directory, output, '--all', '--resume')
    assert noop.returncode == 0, noop.stderr
    assert read_report(output)['progress']['completedThisRun'] == 0
    assert read_report(output)['progress']['resumed'] == 2
    assert read_report(output.with_suffix('.failures.json'))['failures'] == []
    for entry in manifest['files']:
        assert audit.local.digest(directory / entry['relativePath']) == entry['sha256']


def test_cli_corrupt_source_is_reported_and_never_reuses_pass(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    output = tmp_path / 'report.json'
    assert cli(directory, output, '--all').returncode == 0
    source = directory / manifest['files'][0]['relativePath']
    source.write_text('4OFF\n1 0 0 0\n0 0 0 0\n', encoding='utf-8')
    result = cli(directory, output, '--all', '--resume')
    assert result.returncode == 1
    report = read_report(output)
    assert report['progress']['resumed'] == 0 and not report['completeImporterAudit']
    assert report['summary']['statusCounts'] == {'source-hash-mismatch': 1}
    assert read_report(output.with_suffix('.failures.json'))['failures'][0]['relativePath'] == manifest['files'][0]['relativePath']


def test_cli_changed_manifest_invalidates_cached_results(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    output = tmp_path / 'report.json'
    assert cli(directory, output, '--all').returncode == 0
    manifest['listingCompleteness'] = 'New acquisition evidence'
    (directory / 'download-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    result = cli(directory, output, '--all', '--resume')
    assert result.returncode == 0, result.stderr
    report = read_report(output)
    assert report['progress']['resumed'] == 0 and report['progress']['completedThisRun'] == 1
    assert report['listingCompleteness'] == 'New acquisition evidence'


def test_inventory_only_mode_preserves_explicit_unsampled_status(tmp_path):
    directory, _ = collection(tmp_path, ('simplex4',))
    output = tmp_path / 'report.json'
    result = cli(directory, output, '--sample-size', '0')
    assert result.returncode == 0, result.stderr
    report = read_report(output)
    assert report['summary']['statusCounts'] == {'inventory-only-unsampled': 1}
    assert not report['completeImporterAudit'] and not report['progress']['completedThisRun']


def test_unavailable_entries_are_accounted_for_and_prevent_complete_coverage(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    manifest['files'].extend([
        {'id': 'pending', 'relativePath': 'pending.off', 'status': 'pending'},
        {'id': 'missing', 'relativePath': 'missing.off', 'status': 'downloaded', 'sha256': 'absent'},
    ])
    (directory / 'download-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    output = tmp_path / 'report.json'
    assert cli(directory, output, '--all').returncode == 1
    report = read_report(output)
    assert report['summary']['statusCounts'] == {'inventory-error': 1, 'not-downloaded': 1, 'parsed': 1}
    assert not report['completeImporterAudit']
    assert len(read_report(output.with_suffix('.failures.json'))['failures']) == 2


def test_cli_diagnostic_completes_coverage_but_is_a_failure(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    source = directory / manifest['files'][0]['relativePath']
    source.write_text('4OFF\n5 10 10 5\n0 0 0 0\n', encoding='utf-8')
    manifest['files'][0]['sha256'] = audit.local.digest(source)
    (directory / 'download-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    output = tmp_path / 'report.json'
    result = cli(directory, output, '--all')
    assert result.returncode == 1, result.stderr
    report = read_report(output)
    assert report['completeImporterAudit']
    assert report['summary']['statusCounts'] == {'diagnosed': 1}
    assert 'Truncated' in report['records'][0]['error']
    assert cli(directory, output, '--all', '--resume').returncode == 1
    assert read_report(output)['progress']['resumed'] == 1


def saved_result(status='parsed'):
    return {'relativePath': 'Cat1/a.off', 'sha256': 'hash', 'status': status, 'sourceUnchanged': True,
            'timeoutSeconds': 1, 'validation': {'passed': True}, 'counts': [5, 10, 10, 5]}


def test_checkpoint_partial_tail_is_repaired_and_new_results_survive(tmp_path):
    path = tmp_path / 'checkpoint.jsonl'
    record = saved_result()
    with path.open('w', encoding='utf-8') as stream:
        audit.append_checkpoint(stream, 'context', record)
    with path.open('ab') as stream:
        stream.write(b'{"contextSha256":"cont')
    assert audit.load_checkpoint(path, 'context') == {record['relativePath']: record}
    audit.repair_checkpoint_tail(path)
    second = {**record, 'relativePath': 'Cat1/b.off'}
    with path.open('a', encoding='utf-8') as stream:
        audit.append_checkpoint(stream, 'context', second)
    assert len(audit.load_checkpoint(path, 'context')) == 2


def test_checkpoint_context_change_and_interior_corruption(tmp_path):
    path = tmp_path / 'checkpoint.jsonl'
    with path.open('w', encoding='utf-8') as stream:
        audit.append_checkpoint(stream, 'old-code', saved_result())
    assert not audit.load_checkpoint(path, 'new-code')
    with path.open('a', encoding='utf-8') as stream:
        stream.write('corrupt\n')
    with pytest.raises(ValueError, match='line 2'):
        audit.load_checkpoint(path, 'old-code')


@pytest.mark.parametrize('changed', ['sha256', 'sourceUnchanged'])
def test_resume_refuses_changed_or_unverified_source(changed):
    record = saved_result()
    previous = deepcopy(record)
    previous[changed] = 'different' if changed == 'sha256' else False
    record['status'] = 'inventory-only-pending'
    assert audit.reuse_results([record], {record['relativePath']: previous}) == 0


def test_timeout_reuse_and_explicit_retry():
    previous = saved_result('timeout')
    for timeout, retry, expected in [(1, False, 1), (2, False, 0), (1, True, 0)]:
        record = {**previous, 'status': 'inventory-only-pending'}
        assert audit.reuse_results([record], {record['relativePath']: previous}, retry, timeout) == expected


def test_actual_worker_timeout_is_killed_and_reaped(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    record = audit.inventory_manifest(directory, manifest)[0]
    script = tmp_path / 'slow.py'
    script.write_text('import time\ntime.sleep(30)\n', encoding='utf-8')
    importer = audit.ImportWorkers(script)
    start = time.perf_counter()
    result = importer.audit(record, 0.1)
    assert result['status'] == 'timeout' and result['sourceUnchanged']
    assert time.perf_counter() - start < 5
    assert not importer.children


def test_cancellation_stops_active_worker_and_discards_incomplete_result(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    record = audit.inventory_manifest(directory, manifest)[0]
    script = tmp_path / 'slow.py'
    marker = tmp_path / 'started'
    script.write_text(f'import pathlib, time\npathlib.Path({str(marker)!r}).touch()\ntime.sleep(30)\n', encoding='utf-8')
    importer = audit.ImportWorkers(script)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(importer.audit, record, 30)
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert marker.exists()
        importer.stop()
        assert future.result(timeout=5) is None
    assert not importer.children


def test_source_mutation_during_worker_is_not_accepted(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    record = audit.inventory_manifest(directory, manifest)[0]
    script = tmp_path / 'mutating.py'
    script.write_text('import json, pathlib, sys\npathlib.Path(sys.argv[2]).write_text("changed")\n'
                      'print(json.dumps({"status":"diagnosed","error":"fixture rejection"}))\n', encoding='utf-8')
    result = audit.ImportWorkers(script).audit(record, 10)
    assert result['status'] == 'source-changed' and not result['sourceUnchanged']
    assert 'changed' in result['error']


def test_interruption_retains_only_completed_results(tmp_path):
    class InterruptedImporter:
        stopped = False
        def audit(self, record, timeout):
            if record['relativePath'] == 'b':
                raise KeyboardInterrupt
            return {**record, 'status': 'parsed', 'validation': {'passed': True}}
        def stop(self):
            self.stopped = True
    records = [{'relativePath': name, 'status': 'inventory-only-pending'} for name in ('a', 'b', 'c')]
    path = tmp_path / 'journal'
    importer = InterruptedImporter()
    with path.open('w', encoding='utf-8') as stream:
        completed, interrupted = audit.validate_records(records, 1, 1, stream, 'context', importer)
    assert interrupted and completed == 1 and importer.stopped
    assert list(audit.load_checkpoint(path, 'context')) == ['a']
    assert records[2]['status'] == 'inventory-only-pending'


def test_count_mismatch_and_unspecified_edge_count(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    record = audit.inventory_manifest(directory, manifest)[0]
    record['declaredCounts'][1] = 0
    assert audit.ImportWorkers().audit(record, 10)['status'] == 'parsed'
    record['declaredCounts'][0] += 1
    result = audit.ImportWorkers().audit(record, 10)
    assert result['status'] == 'count-mismatch'
    assert result['counts'] == [5, 10, 10, 5]


def test_atomic_report_failure_preserves_previous_report(tmp_path, monkeypatch):
    path = tmp_path / 'report.json'
    path.write_text('{"previous":true}', encoding='utf-8')
    def failed_write(*args, **kwargs):
        raise OSError('Interrupted write')
    monkeypatch.setattr(audit.json, 'dump', failed_write)
    with pytest.raises(OSError):
        audit.atomic_json(path, {'new': True})
    assert read_report(path) == {'previous': True}


def test_duplicate_manifest_paths_are_rejected(tmp_path):
    directory, manifest = collection(tmp_path, ('simplex4',))
    manifest['files'].append({**manifest['files'][0], 'relativePath': manifest['files'][0]['relativePath'].upper()})
    with pytest.raises(ValueError, match='Duplicate manifest'):
        audit.inventory_manifest(directory, manifest)


@pytest.mark.parametrize('flags', [('--timeout', 'nan'), ('--retry-failures',), ('--limit', '-1'),
                                  ('--all', '--sample-size', '3')])
def test_cli_rejects_invalid_controls(tmp_path, flags):
    directory, _ = collection(tmp_path, ('simplex4',))
    assert cli(directory, tmp_path / 'report.json', *flags).returncode == 2


def test_cli_never_writes_reports_inside_source_tree(tmp_path):
    directory, _ = collection(tmp_path, ('simplex4',))
    assert cli(directory, directory / 'report.json', '--all').returncode == 2
    assert not (directory / 'report.json').exists()
