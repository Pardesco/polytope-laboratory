from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import time

import pytest

from engine import batch_experiment as batch
from engine.audit_checkpoint import append_checkpoint, read_checkpoint


@pytest.mark.parametrize(
    'change',
    [
        {'schemaVersion': 2},
        {'id': ''},
        {'models': []},
        {'extra': True},
        {'models': [{'id': 'a', 'key': 'cube', 'op': 'save'}]},
        {'models': [{'id': 'a', 'key': 'cube'}] * 2},
        {'models': [{'id': str(i), 'key': 'cube'} for i in range(33)]},
        {'models': [{'id': 'a', 'key': False}]},
    ],
)
def test_spec_refuses_unsupported_and_unbounded_inputs(change):
    with pytest.raises(ValueError):
        batch.validate_spec({**deepcopy(batch.SAMPLE), **change})


def test_sample_file_matches_installed_builtin():
    assert json.loads((batch.ROOT / 'examples/batch-experiment.json').read_text()) == batch.SAMPLE


def test_source_digest_tracks_bundled_sources_and_assets_but_not_optional_library(tmp_path):
    (tmp_path / 'engine/catalog_data').mkdir(parents=True)
    (tmp_path / 'engine/a.py').write_text('source')
    (tmp_path / 'engine/catalog_data/a.json').write_text('{}')
    (tmp_path / 'package.json').write_text('{"version":"1.2.3"}')
    first = batch.source_manifest(tmp_path)
    (tmp_path / 'data').mkdir()
    (tmp_path / 'data/optional.off').write_text('OFF')
    assert batch.source_manifest(tmp_path) == first
    (tmp_path / 'engine/catalog_data/a.json').write_text('[]')
    assert batch.source_manifest(tmp_path)['sourceSha256'] != first['sourceSha256']
    (tmp_path / 'engine/a.py').write_text('modified')
    assert batch.source_manifest(tmp_path)['sourceFiles'] != first['sourceFiles']


def test_shared_audit_checkpoint_detects_source_changes_and_truncation(tmp_path):
    path = tmp_path / 'checkpoint.jsonl'
    header = {'sourceSha256': 'a'}
    with path.open('w', encoding='utf-8') as stream:
        append_checkpoint(stream, header)
        append_checkpoint(stream, {'id': 'cube', 'status': 'pass'})
    assert read_checkpoint(path, header) == [{'id': 'cube', 'status': 'pass'}]
    with pytest.raises(ValueError, match='source/inventory changed'):
        read_checkpoint(path, {'sourceSha256': 'b'})
    with path.open('a') as stream:
        stream.write('{')
    with pytest.raises(ValueError, match='truncated'):
        read_checkpoint(path, header)


def test_cancel_resume_preserves_attempts_and_never_repeats_terminal_failures(tmp_path, monkeypatch):
    monkeypatch.setattr(batch, 'runtime_identity', lambda: {'sourceSha256': 'a'})
    stop = [False]
    calls = []

    def analyze(item, timeout, cancelled):
        calls.append(item['id'])
        status = 'cancelled' if cancelled() else 'fail' if item['key'] == 'cube' else 'pass'
        stop[0] = True
        return {**item, 'status': status}

    monkeypatch.setattr(batch, 'analyze_item', analyze)
    first = batch.run_experiment(batch.SAMPLE, tmp_path, cancelled=lambda: stop[0])
    assert first['totals'] == {'pass': 1, 'cancelled': 3} and not first['complete']
    stop[0] = False
    second = batch.run_experiment(batch.SAMPLE, tmp_path, resume=True)
    assert second['totals'] == {'pass': 3, 'fail': 1} and second['complete'] and not second['successful']
    assert len(second['attempts']) == 7 and len(calls) == 7
    assert batch.run_experiment(batch.SAMPLE, tmp_path, resume=True) == second
    assert len(calls) == 7
    monkeypatch.setattr(batch, 'runtime_identity', lambda: {'sourceSha256': 'b'})
    with pytest.raises(ValueError, match='changed'):
        batch.run_experiment(batch.SAMPLE, tmp_path, resume=True)


@pytest.mark.parametrize('timeout', [0, -1, float('nan'), float('inf'), 121])
def test_timeout_bound(tmp_path, timeout):
    with pytest.raises(ValueError, match='Timeout'):
        batch.run_experiment(batch.SAMPLE, tmp_path, timeout=timeout)


def fake_process(monkeypatch, script):
    original = subprocess.Popen
    monkeypatch.setattr(
        batch.subprocess, 'Popen', lambda *args, **kwargs: original([sys.executable, '-c', script], **kwargs)
    )


@pytest.mark.parametrize(
    'script,message',
    [
        ('raise SystemExit(9)', 'exited'),
        ('import sys; sys.stdin.readline(); print(\'{"id":99,"ok":true,"result":{}}\',flush=True)', 'identity'),
        (
            'import sys; sys.stdin.readline(); print(\'{"id":1,"ok":false,"type":"DomainError","error":"unsupported"}\',flush=True)',
            'unsupported',
        ),
    ],
)
def test_protocol_failures_are_reviewable_and_worker_is_closed(monkeypatch, script, message):
    fake_process(monkeypatch, script)
    row = batch.analyze_item({'id': 'cube', 'key': 'cube'}, 2, lambda: False)
    assert row['status'] == 'fail' and message in row['failure']['message']
    assert row['failure']['phase'] == 'generate'


def test_timeout_and_active_cancellation_kill_child(monkeypatch):
    fake_process(monkeypatch, 'import time; time.sleep(30)')
    client = batch.EngineClient(0.1, lambda: False)
    with pytest.raises(TimeoutError):
        try:
            client.request('generate')
        finally:
            process = client.process
            client.close()
    assert process.poll() is not None
    start = time.monotonic()
    client = batch.EngineClient(5, lambda: time.monotonic() - start > 0.1)
    with pytest.raises(batch.InterruptedJob):
        try:
            client.request('generate')
        finally:
            process = client.process
            client.close()
    assert process.poll() is not None


def test_response_limit(monkeypatch):
    fake_process(monkeypatch, 'import sys; sys.stdin.readline(); print("x"*500,flush=True)')
    monkeypatch.setattr(batch, 'MAX_BYTES', 100)
    client = batch.EngineClient(2, lambda: False)
    with pytest.raises(ValueError, match='16 MiB'):
        try:
            client.request('generate')
        finally:
            client.close()


def test_frozen_manifest_needs_no_source_tree(tmp_path, monkeypatch):
    manifest = {'sourceSha256': 'a' * 64, 'appVersion': '1.2.3', 'sourceFiles': {}}
    (tmp_path / 'experiment-runtime.json').write_text(json.dumps(manifest))
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path), raising=False)
    monkeypatch.setattr(batch, 'source_manifest', lambda: pytest.fail('Source tree accessed'))
    runtime = batch.runtime_identity()
    assert runtime['frozen'] and runtime['sourceSha256'] == manifest['sourceSha256']
    assert len(runtime['executableSha256']) == 64


def test_real_source_cli_sample_resume_and_jsonlines(tmp_path):
    command = [sys.executable, '-m', 'engine.cli', 'experiment', '--output', str(tmp_path)]
    result = subprocess.run(command, cwd=batch.ROOT, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stderr
    report = json.loads((tmp_path / 'report.json').read_text())
    expected = [[4, 6, 4, 0], [8, 12, 6, 0], [5, 10, 10, 5], [16, 32, 24, 8]]
    assert report['totals'] == {'pass': 4} and report['successful']
    for row, counts in zip(report['models'], expected):
        assert list(row['analysis']['counts'].values()) == counts
        assert len(row['sourceModelSha256']) == 64
    checkpoint = (tmp_path / 'checkpoint.jsonl').read_bytes()
    result = subprocess.run(command + ['--resume'], cwd=batch.ROOT, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / 'checkpoint.jsonl').read_bytes() == checkpoint
    result = subprocess.run(
        [sys.executable, '-m', 'engine.server'],
        cwd=batch.ROOT,
        input='{"id":"bad","op":"bad"}\n{"id":"cube","op":"generate","params":{"key":"cube","kind":"regular"}}\n',
        capture_output=True,
        text=True,
        timeout=20,
    )
    replies = [json.loads(line) for line in result.stdout.splitlines()]
    assert [r['id'] for r in replies] == ['bad', 'cube'] and [r['ok'] for r in replies] == [False, True]
