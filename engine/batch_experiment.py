"""Bounded generate/analyze experiments over the ordinary JSON-lines engine."""

import argparse
from collections import Counter
import hashlib
from importlib.metadata import version
import json
import math
import os
from pathlib import Path
from queue import Queue, Empty
import signal
import subprocess
import sys
from threading import Event, Thread
import time

from .audit_checkpoint import append_checkpoint, read_checkpoint

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = {
    'schemaVersion': 1,
    'id': 'regular-3d-4d-analysis',
    'models': [
        {'id': 'tetrahedron', 'key': 'tetrahedron'},
        {'id': 'cube', 'key': 'cube'},
        {'id': '5-cell', 'key': 'simplex4'},
        {'id': 'tesseract', 'key': 'tesseract'},
    ],
}
MAX_BYTES = 16 * 1024 * 1024
NUMERIC_CONTRACT = (
    'Float64 source-coordinate analysis; residuals and precision scope are retained. No exact measurement certificate.'
)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def source_manifest(root=ROOT):
    paths = sorted((root / 'engine').rglob('*.py'))
    files = sorted(
        set(paths)
        | {
            p
            for p in (root / 'engine/catalog_data').rglob('*')
            if p.is_file() and p.suffix.lower() in ('.json', '.off')
        }
    )
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(bytes.fromhex(sha256_file(path)))
    return {
        'schemaVersion': 1,
        'appVersion': json.loads((root / 'package.json').read_text())['version'],
        'sourceSha256': digest.hexdigest(),
        'sourceFiles': {p.relative_to(root).as_posix(): sha256_file(p) for p in paths},
    }


def runtime_identity():
    frozen = bool(getattr(sys, 'frozen', False))
    manifest = (
        json.loads((Path(sys._MEIPASS) / 'experiment-runtime.json').read_text(encoding='utf-8'))
        if frozen
        else source_manifest()
    )
    return {
        **manifest,
        'frozen': frozen,
        'executableSha256': sha256_file(sys.executable),
        'python': sys.version,
        'numpy': version('numpy'),
        'scipy': version('scipy'),
    }


def validate_spec(spec):
    if not isinstance(spec, dict) or spec.get('schemaVersion') != 1:
        raise ValueError('Experiment requires schemaVersion 1.')
    if set(spec) - {'schemaVersion', 'id', 'models'}:
        raise ValueError('Unknown experiment fields.')
    if not isinstance(spec.get('id'), str) or not 1 <= len(spec['id']) <= 120:
        raise ValueError('Experiment id must contain 1–120 characters.')
    rows = spec.get('models')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 32:
        raise ValueError('Experiment requires 1–32 model records.')
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'id', 'key'}:
            raise ValueError('Each model requires only id and catalog generation key.')
        if any(not isinstance(row[k], str) or not 1 <= len(row[k]) <= 120 for k in ('id', 'key')):
            raise ValueError('Model ids and keys must contain 1–120 characters.')
        if row['id'] in seen:
            raise ValueError('Model ids must be unique.')
        seen.add(row['id'])
    return spec


class InterruptedJob(Exception):
    pass


class EngineClient:
    def __init__(self, timeout, cancelled):
        self.timeout = timeout
        self.cancelled = cancelled
        self.process = None
        self.sequence = 0

    def close(self):
        if self.process:
            self.process.kill()
            self.process.wait()
            for stream in (self.process.stdin, self.process.stdout):
                stream.close()
            self.process = None

    def request(self, op, **fields):
        if self.cancelled():
            raise InterruptedJob('Experiment cancelled.')
        if self.process is None:
            command = [sys.executable] if getattr(sys, 'frozen', False) else [sys.executable, '-m', 'engine.server']
            self.process = subprocess.Popen(
                command,
                cwd=None if getattr(sys, 'frozen', False) else ROOT,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                env={**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'PYTHONIOENCODING': 'utf-8'},
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
            )
        self.sequence += 1
        request = {'id': self.sequence, 'op': op, **fields}
        raw = (json.dumps(request, allow_nan=False) + '\n').encode('utf-8')
        if len(raw) > MAX_BYTES:
            raise ValueError('Experiment request exceeds 16 MiB limit.')
        output = Queue()
        process = self.process

        def exchange():
            try:
                process.stdin.write(raw)
                process.stdin.flush()
                output.put(process.stdout.readline(MAX_BYTES + 1))
            except Exception as exc:
                output.put(exc)

        thread = Thread(target=exchange, daemon=True)
        thread.start()
        deadline = time.monotonic() + self.timeout
        while True:
            if self.cancelled():
                raise InterruptedJob('Experiment cancelled.')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f'{op} exceeded {self.timeout}s limit.')
            try:
                line = output.get(timeout=min(0.05, remaining))
                break
            except Empty:
                pass
        if isinstance(line, Exception):
            raise line
        if not line:
            raise RuntimeError(f'Engine exited ({process.poll()}) before replying.')
        if len(line) > MAX_BYTES or not line.endswith(b'\n'):
            raise ValueError('Engine response exceeds 16 MiB limit or is truncated.')
        response = json.loads(line)
        if response.get('id') != self.sequence or type(response.get('ok')) is not bool:
            raise ValueError('Engine response identity/framing mismatch.')
        if not response['ok']:
            raise RuntimeError(response.get('type', 'EngineError') + ': ' + response.get('error', 'Unknown error'))
        return response['result']


def analyze_item(item, timeout, cancelled):
    from .geometry import identity

    client = EngineClient(timeout, cancelled)
    started = time.monotonic()
    phase = 'generate'
    row = {**item, 'status': 'fail'}
    try:
        model = client.request('generate', params={'kind': 'regular', 'key': item['key']})
        row['sourceModelSha256'] = identity(model)
        row['sourceRecordSha256'] = hashlib.sha256(
            json.dumps(model, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
        ).hexdigest()
        row['interpretation'] = model.get('interpretation')
        row['dimension'] = model['dimension']
        phase = 'analyze'
        row['analysis'] = client.request('analyze', model=model)
        row['status'] = 'pass' if row['analysis']['validation']['passed'] else 'fail'
    except Exception as exc:
        row.update(
            status='cancelled' if isinstance(exc, InterruptedJob) else 'fail',
            failure={'phase': phase, 'type': type(exc).__name__, 'message': str(exc)},
        )
    finally:
        client.close()
    row['elapsedSeconds'] = round(time.monotonic() - started, 6)
    return row


def run_experiment(spec, directory, *, timeout=30, resume=False, cancel_file=None, cancelled=None):
    validate_spec(spec)
    if not math.isfinite(timeout) or not 0 < timeout <= 120:
        raise ValueError('Timeout must be positive and at most 120 seconds per operation.')
    runtime = runtime_identity()
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    spec_sha = hashlib.sha256(json.dumps(spec, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    header = {
        'schemaVersion': 1,
        'experiment': spec,
        'experimentSha256': spec_sha,
        'runtime': runtime,
        'timeoutSeconds': timeout,
    }
    checkpoint = directory / 'checkpoint.jsonl'
    attempts = []
    if checkpoint.exists():
        if not resume:
            raise ValueError('Checkpoint already exists; use --resume or a fresh output directory.')
        attempts = read_checkpoint(checkpoint, header)
    latest = {}
    ids = {item['id'] for item in spec['models']}
    for row in attempts:
        if (
            not isinstance(row, dict)
            or row.get('id') not in ids
            or row.get('status') not in ('pass', 'fail', 'cancelled')
        ):
            raise ValueError('Invalid checkpoint model record.')
        if row['id'] in latest and latest[row['id']]['status'] != 'cancelled':
            raise ValueError('Duplicate terminal checkpoint record.')
        latest[row['id']] = row

    def is_cancelled():
        return bool((cancelled and cancelled()) or (cancel_file and Path(cancel_file).exists()))

    with checkpoint.open('a' if checkpoint.exists() else 'x', encoding='utf-8', newline='\n') as stream:
        if stream.tell() == 0:
            append_checkpoint(stream, header)
        for item in spec['models']:
            if latest.get(item['id'], {}).get('status') in ('pass', 'fail'):
                continue
            row = analyze_item(item, timeout, is_cancelled)
            row['attempt'] = 1 + sum(r['id'] == item['id'] for r in attempts)
            append_checkpoint(stream, row)
            attempts.append(row)
            latest[item['id']] = row
    rows = [latest[item['id']] for item in spec['models']]
    totals = dict(Counter(r['status'] for r in rows))
    report = {
        **header,
        'numericContract': NUMERIC_CONTRACT,
        'complete': not totals.get('cancelled'),
        'successful': all(r['status'] == 'pass' for r in rows),
        'totals': totals,
        'models': rows,
        'attempts': attempts,
    }
    from .formats import atomic_write

    atomic_write(directory / 'report.json', json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + '\n')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('spec', nargs='?', type=Path, help='JSON spec; omitted uses built-in four-model sample')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--cancel-file', type=Path, help='Creation requests cancellation; remove before resume')
    args = parser.parse_args(argv)
    stop = Event()
    previous = signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        spec = SAMPLE
        if args.spec:
            if args.spec.stat().st_size > 1024 * 1024:
                raise ValueError('Experiment spec exceeds 1 MiB limit.')
            spec = json.loads(args.spec.read_text(encoding='utf-8-sig'))
        report = run_experiment(
            spec,
            args.output,
            timeout=args.timeout,
            resume=args.resume,
            cancel_file=args.cancel_file,
            cancelled=stop.is_set,
        )
        print(
            json.dumps(
                {
                    'output': str(args.output),
                    'complete': report['complete'],
                    'successful': report['successful'],
                    'totals': report['totals'],
                }
            )
        )
        return 130 if report['totals'].get('cancelled') else 0 if report['successful'] else 1
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    finally:
        signal.signal(signal.SIGINT, previous)


if __name__ == '__main__':
    sys.exit(main())
