"""Read-only recursive OFF inventory and bounded importer compatibility audit.

Source names/categories are labels, not independently certified classifications.
Full geometry runs use isolated child processes with explicit per-file timeouts.
"""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def header(path):
    """Read the first two non-comment records, without guessing geometry."""
    records = []
    with path.open(encoding='utf-8-sig') as stream:
        for line in stream:
            line = line.split('#', 1)[0].strip()
            if line:
                records.append(line)
                if len(records) == 2:
                    break
    marker = records[0] if records else ''
    match = re.fullmatch(r'(\d*)OFF', marker)
    dimension = (int(match[1]) if match[1] else 3) if match else None
    counts = None
    if len(records) > 1:
        try:
            counts = [int(value) for value in records[1].split()]
        except ValueError:
            pass
    return {'marker': marker, 'dimension': dimension, 'declaredCountRecord': counts}


def inventory(directory, collection):
    records = []
    for path in sorted(directory.rglob('*'), key=lambda p: str(p).casefold()):
        if not path.is_file() or path.suffix.lower() != '.off':
            continue
        relative = path.relative_to(directory).as_posix()
        record = {'collection': collection, 'file': str(path.resolve()),
                  'relativePath': relative, 'name': path.stem,
                  'sourceClassification': Path(relative).parent.as_posix(),
                  'classificationVerified': False, 'bytes': path.stat().st_size}
        try:
            record.update({'sha256': digest(path), **header(path)})
            record['status'] = 'inventory-only'
        except (OSError, UnicodeError, ValueError) as exc:
            record.update(status='inventory-error', error=str(exc))
        records.append(record)
    return records


def parse_worker(path):
    from engine.formats import parse_off
    start = time.perf_counter()
    try:
        model = parse_off(path.read_text(encoding='utf-8-sig'), path.stem)
        result = {'status': 'parsed', 'interpretation': model['interpretation'],
                  'counts': [len(model[key]) for key in ('vertices', 'edges', 'faces', 'cells')],
                  'fingerprint': model['fingerprint'], 'validation': model['validation'],
                  'numericMode': model['numeric']['mode'], 'certified': model['numeric'].get('certified', False)}
    except Exception as exc:
        result = {'status': 'diagnosed', 'error': str(exc), 'errorType': type(exc).__name__}
    result['seconds'] = time.perf_counter() - start
    return result


def audit_record(record, timeout):
    start = time.perf_counter()
    environment = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}
    try:
        child = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--worker', record['file']],
                               capture_output=True, text=True, encoding='utf-8',
                               timeout=timeout, env=environment, cwd=ROOT)
        if child.returncode:
            record.update(status='worker-error', error=child.stderr.strip(), returnCode=child.returncode)
        else:
            record.update(json.loads(child.stdout))
    except subprocess.TimeoutExpired:
        record.update(status='timeout', error=f'Importer exceeded the {timeout:g}-second per-file limit.')
    except (OSError, ValueError) as exc:
        record.update(status='worker-error', error=str(exc))
    record['wallSeconds'] = time.perf_counter() - start
    try:
        record['sourceUnchanged'] = digest(Path(record['file'])) == record['sha256']
    except OSError:
        record['sourceUnchanged'] = False
    return record


def summarize(records):
    return {'fileCount': len(records), 'statusCounts': dict(sorted(Counter(r['status'] for r in records).items())),
            'dimensionCounts': dict(sorted(Counter(str(r.get('dimension')) for r in records).items())),
            'sourceClassificationCounts': dict(sorted(Counter(r['sourceClassification'] for r in records).items())),
            'interpretationCounts': dict(sorted(Counter(r['interpretation'] for r in records if 'interpretation' in r).items()))}


def engine_hashes():
    return {name: digest(ROOT / name) for name in ('engine/formats.py', 'engine/geometry.py')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, nargs='?')
    parser.add_argument('--inventory-directory', type=Path, action='append', default=[])
    parser.add_argument('--limit', type=int, default=0, help='Maximum supported files to validate; 0 audits all.')
    parser.add_argument('--timeout', type=float, default=90, help='Seconds allowed per importer process.')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/local-corpus-audit.json')
    parser.add_argument('--worker', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(parse_worker(args.worker), ensure_ascii=False))
        return
    if not args.directory or not args.directory.is_dir():
        parser.error('directory must be an existing corpus directory')
    if args.limit < 0 or not 0 < args.timeout <= 3600:
        parser.error('limit must be nonnegative and timeout must be in (0, 3600]')
    for path in args.inventory_directory:
        if not path.is_dir():
            parser.error(f'inventory directory does not exist: {path}')
    start = time.perf_counter()
    before = engine_hashes()
    records = inventory(args.directory.resolve(), 'library')
    supported = []
    for record in records:
        if record['status'] == 'inventory-error':
            continue
        if record['dimension'] not in (3, 4):
            record.update(status='skipped-unsupported-dimension',
                          reason='The current OFF importer supports source dimensions 3 and 4 only.')
        elif args.limit and len(supported) >= args.limit:
            record.update(status='not-audited-limit', reason='Explicit --limit prevented importer validation.')
        else:
            supported.append(record)
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        for done in executor.map(lambda record: audit_record(record, args.timeout), supported):
            print(f"{done['status']}: {done['relativePath']}", flush=True)
    collections = [{'kind': 'library', 'directory': str(args.directory.resolve()), **summarize(records)}]
    for index, directory in enumerate(args.inventory_directory):
        extra = inventory(directory.resolve(), f'inventory-{index + 1}')
        records.extend(extra)
        collections.append({'kind': 'inventory-only', 'directory': str(directory.resolve()), **summarize(extra)})
    duplicates = defaultdict(list)
    for record in records:
        if 'sha256' in record:
            duplicates[record['sha256']].append(record['file'])
    after = engine_hashes()
    output = {'schemaVersion': 2, 'createdUtc': datetime.now(timezone.utc).isoformat(),
              'readOnlySourceAudit': True, 'completeLibraryEnumeration': True,
              'completeSupportedLibraryAudit': all(r['status'] not in ('not-audited-limit', 'timeout', 'worker-error', 'inventory-error')
                                                   for r in records if r['collection'] == 'library'),
              'scope': 'Importer compatibility for local 3D/4D library files; additional collections are header/hash inventories only.',
              'limits': {'supportedDimensions': [3, 4], 'maxValidatedFiles': args.limit or None,
                         'perFileTimeoutSeconds': args.timeout, 'parallelWorkers': args.workers,
                         'maxImporterFileBytes': 128 * 1024 * 1024, 'maxImporterVertices': 20000},
              'classificationContract': 'Directory labels are retained verbatim; uniformity, regularity, naming and corpus completeness are not certified.',
              'engineHashesBefore': before, 'engineHashesAfter': after, 'engineUnchangedDuringAudit': before == after,
              'collections': collections, 'summary': summarize(records),
              'duplicateContentGroups': [{'sha256': value, 'files': paths} for value, paths in sorted(duplicates.items()) if len(paths) > 1],
              'seconds': time.perf_counter() - start, 'records': records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'summary': output['summary'], 'engineUnchangedDuringAudit': before == after}))


if __name__ == '__main__':
    main()
