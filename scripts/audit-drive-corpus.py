"""Read-only Drive OFF importer audit, with bounded or resumable full coverage.

The default remains a bounded sample. --all explicitly validates every eligible
manifest entry. Results are durably checkpointed after each isolated import.
"""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import importlib.util
from importlib.metadata import version
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_corpus_auditor', ROOT / 'scripts/audit-local-corpus.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


def safe_source(root, relative):
    parts = relative.split('/')
    if not parts or any(part in ('', '.', '..') or '\\' in part or ':' in part for part in parts):
        raise ValueError('Acquisition manifest contains an invalid relative path.')
    target = root.joinpath(*parts).resolve()
    target.relative_to(root.resolve())
    return target


def inventory_manifest(root, manifest):
    records = []
    seen = set()
    for entry in manifest['files']:
        relative = entry['relativePath']
        if relative.casefold() in seen:
            raise ValueError(f'Duplicate manifest relative path: {relative}')
        seen.add(relative.casefold())
        record = {'relativePath': relative, 'sourceClassification': relative.rpartition('/')[0] or '.',
                  'classificationVerified': False, 'sourceId': entry['id'],
                  'sourceUrl': entry.get('sourceUrl'), 'downloadStatus': entry.get('status', 'listed'),
                  'expectedSha256': entry.get('sha256'), 'status': 'not-downloaded'}
        if entry.get('error'):
            record['downloadError'] = entry['error']
        try:
            path = safe_source(root, relative)
            record['file'] = str(path)
            if record['downloadStatus'] != 'downloaded':
                records.append(record)
                continue
            if not path.is_file():
                raise ValueError('Manifest claims downloaded, but local source file is missing.')
            record.update(bytes=path.stat().st_size, sha256=local.digest(path), **local.header(path))
            record['downloadHashMatches'] = record['sha256'] == record['expectedSha256']
            if not record['downloadHashMatches']:
                record.update(status='source-hash-mismatch', error='Local file differs from its acquisition hash.')
            elif record['dimension'] not in (3, 4):
                record.update(status='skipped-unsupported-dimension', reason='Current importer supports source dimensions 3 and 4 only.')
            else:
                record['status'] = 'inventory-only-unsampled'
            counts = record.get('declaredCountRecord')
            if record.get('dimension') in (3, 4) and counts and len(counts) == record['dimension']:
                record['declaredCounts'] = [counts[0], counts[2], counts[1], counts[3] if len(counts) == 4 else 0]
                record['withinImporterResourceDomain'] = (record['bytes'] <= 128 * 1024 * 1024
                    and 1 <= counts[0] <= 20000 and all(0 <= value <= 1000000 for value in counts[1:]))
        except (OSError, UnicodeError, ValueError) as exc:
            record.update(status='inventory-error', error=str(exc))
        records.append(record)
    return records


def select_sample(records, count, explicit=()):
    candidates = {r['relativePath']: r for r in records if r['status'] == 'inventory-only-unsampled'}
    selected = []
    def choose(relative, reason):
        record = candidates.pop(relative, None)
        if record is not None and len(selected) < count:
            record['sampleReason'] = reason
            selected.append(record)
    for relative in explicit:
        if relative not in candidates:
            raise ValueError(f'Explicit sample file is unavailable, unsupported or not hash-verified: {relative}')
        choose(relative, 'explicit-selection')
    # Named regular and regular-star routes provide known small/large anchors.
    # Categories remain source labels; abbreviations do not certify classification.
    anchors = ['Cat1/1-Pen.off', 'Cat1/2-Tes.off', 'Cat1/5-Hi.off', 'Cat1/6-Ex.off',
               'Cat1/7-Fix.off', 'Cat1/10-Sishi.off', 'Cat1/15-Gax.off', 'Cat1/16-Gogishi.off']
    for relative in anchors:
        choose(relative, 'regular-and-star-source-anchor')
    incidence_order = sorted(candidates.values(), key=lambda r: (-sum(r.get('declaredCounts', [0])), r['relativePath']))
    for record in incidence_order[:4]:
        choose(record['relativePath'], 'largest-declared-incidence')
    # Cover source label groups separately, including snub/prismatic/compound folders.
    groups = defaultdict(list)
    for record in candidates.values():
        groups[record['sourceClassification']].append(record)
    preferred_groups = ['CatS1', 'CatS19', 'CatP3', 'Compounds', 'Cat29', 'Cat30']
    for category in preferred_groups:
        if category in groups:
            smallest = min(groups[category], key=lambda r: (sum(r.get('declaredCounts', [0])), r['relativePath']))
            choose(smallest['relativePath'], 'source-category-representative')
    priority = lambda category: (0 if category.startswith('CatS') else 1 if category.startswith('CatP') else 2 if category.startswith('Compounds') else 3, category)
    for category in sorted(groups, key=priority):
        smallest = min(groups[category], key=lambda r: (sum(r.get('declaredCounts', [0])), r['relativePath']))
        choose(smallest['relativePath'], 'source-category-representative')
    return selected


RESULT_STATUSES = {'parsed', 'diagnosed', 'timeout', 'worker-error', 'validation-failed',
                   'count-mismatch', 'source-changed'}
RETRY_STATUSES = RESULT_STATUSES - {'parsed', 'diagnosed'}


def validator_hashes():
    paths = list((ROOT / 'engine').glob('*.py')) + [Path(__file__), ROOT / 'scripts/audit-local-corpus.py']
    return {path.relative_to(ROOT).as_posix(): local.digest(path) for path in sorted(paths)}


def context_hash(context):
    return hashlib.sha256(json.dumps(context, sort_keys=True).encode('utf-8')).hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def load_checkpoint(path, expected_context):
    """Ignore only an incomplete final append; corruption elsewhere is an error."""
    results = {}
    if not path.exists():
        return results
    with path.open('rb') as stream:
        for number, line in enumerate(stream, 1):
            if not line.endswith(b'\n'):
                break
            try:
                event = json.loads(line)
                if event['contextSha256'] != expected_context:
                    continue
                record = event['record']
                if record['status'] not in RESULT_STATUSES:
                    raise ValueError('Unknown importer result status')
                if record['status'] == 'parsed' and not record.get('validation', {}).get('passed'):
                    raise ValueError('Parsed checkpoint lacks passing validation')
                results[record['relativePath']] = record
            except (ValueError, KeyError, TypeError) as exc:
                raise ValueError(f'Invalid checkpoint line {number}: {exc}') from exc
    return results


def repair_checkpoint_tail(path):
    # A crash can leave half a JSON line. Remove it before any later append, so
    # the next durable result does not become part of that incomplete line.
    if not path.exists():
        return
    with path.open('rb+') as stream:
        end = stream.seek(0, os.SEEK_END)
        position = end
        while position:
            size = min(position, 65536)
            position -= size
            stream.seek(position)
            block = stream.read(size)
            newline = block.rfind(b'\n')
            if newline >= 0:
                stream.truncate(position + newline + 1)
                break
        else:
            stream.truncate(0)
        stream.flush()
        os.fsync(stream.fileno())


def append_checkpoint(stream, context, record):
    stream.write(json.dumps({'contextSha256': context, 'record': record}, ensure_ascii=False) + '\n')
    stream.flush()
    os.fsync(stream.fileno())


def reuse_results(selected, saved, retry_failures=False, timeout=90):
    reused = 0
    for record in selected:
        previous = saved.get(record['relativePath'])
        if not previous or previous.get('sha256') != record.get('sha256'):
            continue
        if previous.get('sourceUnchanged') is not True:
            continue
        if retry_failures and previous['status'] in RETRY_STATUSES:
            continue
        if previous['status'] == 'timeout' and previous.get('timeoutSeconds') != timeout:
            continue
        # Preserve the current inventory/provenance rather than copying the old
        # absolute path, acquisition metadata or selection reason wholesale.
        for key in ('status', 'error', 'errorType', 'returnCode', 'interpretation', 'counts',
                    'fingerprint', 'validation', 'numericMode', 'certified', 'seconds',
                    'wallSeconds', 'sourceUnchanged', 'timeoutSeconds', 'auditedUtc'):
            if key in previous:
                record[key] = previous[key]
        record['resumed'] = True
        reused += 1
    return reused


class ImportWorkers:
    """Track child processes so interruption also stops in-flight imports."""
    def __init__(self, worker_script=None):
        self.worker_script = worker_script or ROOT / 'scripts/audit-local-corpus.py'
        self.lock = threading.Lock()
        self.children = set()
        self.stopping = False

    def stop(self):
        with self.lock:
            self.stopping = True
            for child in self.children:
                if child.poll() is None:
                    child.kill()

    def audit(self, record, timeout):
        result = dict(record)
        start = time.perf_counter()
        environment = {**os.environ, 'OPENBLAS_NUM_THREADS': '1', 'OMP_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}
        child = None
        try:
            with self.lock:
                if self.stopping:
                    return None
                child = subprocess.Popen([sys.executable, str(self.worker_script), '--worker', record['file']],
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                         encoding='utf-8', env=environment, cwd=ROOT)
                self.children.add(child)
            try:
                stdout, stderr = child.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
                result.update(status='timeout', error=f'Importer exceeded the {timeout:g}-second per-file limit.')
            else:
                if child.returncode:
                    result.update(status='worker-error', error=stderr.strip(), returnCode=child.returncode)
                else:
                    payload = json.loads(stdout)
                    if payload.get('status') not in ('parsed', 'diagnosed'):
                        raise ValueError('Worker returned an unknown result status.')
                    # A worker may return evidence, never source identity/provenance.
                    for key in ('status', 'error', 'errorType', 'interpretation', 'counts', 'fingerprint',
                                'validation', 'numericMode', 'certified', 'seconds'):
                        if key in payload:
                            result[key] = payload[key]
                    if result['status'] == 'parsed':
                        if not result.get('validation', {}).get('passed'):
                            result.update(status='validation-failed', error='Importer validation did not pass.')
                        elif 'declaredCounts' in result:
                            declared = result['declaredCounts']
                            actual = result.get('counts')
                            # OFF permits zero as an unspecified edge count.
                            if not isinstance(actual, list) or len(actual) != 4 or any(
                                value != actual[i] for i, value in enumerate(declared) if i != 1 or value != 0
                            ):
                                result.update(status='count-mismatch', error=f'Declared {declared} differs from imported {actual}.')
        except (OSError, ValueError, TypeError) as exc:
            result.update(status='worker-error', error=str(exc))
        finally:
            if child is not None:
                if child.poll() is None:
                    child.kill()
                child.communicate()
                with self.lock:
                    self.children.discard(child)
        with self.lock:
            if self.stopping:
                return None
        result.update(wallSeconds=time.perf_counter() - start, timeoutSeconds=timeout,
                      auditedUtc=datetime.now(timezone.utc).isoformat())
        try:
            result['sourceUnchanged'] = local.digest(Path(record['file'])) == record['sha256']
        except OSError:
            result['sourceUnchanged'] = False
        if not result['sourceUnchanged']:
            result.update(status='source-changed', error='Source changed or disappeared during import.')
        return result


def validate_records(pending, timeout, workers, checkpoint, context, importer=None):
    importer = importer or ImportWorkers()
    executor = ThreadPoolExecutor(max_workers=workers)
    iterator = iter(pending)
    active = {}
    completed = 0
    interrupted = False
    def submit_one():
        record = next(iterator, None)
        if record is not None:
            active[executor.submit(importer.audit, record, timeout)] = record
    try:
        for _ in range(workers):
            submit_one()
        while active:
            finished, _ = wait(active, return_when=FIRST_COMPLETED)
            for future in finished:
                record = active.pop(future)
                result = future.result()
                if result is not None:
                    append_checkpoint(checkpoint, context, result)
                    record.update(result)
                    completed += 1
                    print(f"[{completed}/{len(pending)}] {record['status']}: {record['relativePath']}", flush=True)
                submit_one()
    except KeyboardInterrupt:
        interrupted = True
        print('Interrupted; stopping active importers and retaining completed checkpoints.', flush=True)
    finally:
        importer.stop()
        executor.shutdown(wait=True, cancel_futures=True)
    return completed, interrupted


def failure_records(records):
    return [{key: record[key] for key in ('relativePath', 'status', 'error', 'errorType', 'reason',
                                         'sha256', 'declaredCounts', 'counts', 'wallSeconds') if key in record}
            for record in records if record['status'] not in
            ('parsed', 'inventory-only-unsampled', 'inventory-only-pending')]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, nargs='?', default=ROOT / 'data/drive-uniforms')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--sample-size', type=int, default=24, help='Full importer sample size; 0 inventories only, maximum 200.')
    parser.add_argument('--sample-relative', action='append', default=[], help='Prioritize an exact manifest relative path.')
    parser.add_argument('--all', action='store_true', help='Explicitly import every eligible manifest file.')
    parser.add_argument('--resume', action='store_true', help='Reuse matching results from the output checkpoint journal.')
    parser.add_argument('--retry-failures', action='store_true', help='With --resume, retry timeout/worker/validation failures; deterministic importer diagnostics remain recorded.')
    parser.add_argument('--limit', type=int, default=0, help='Maximum NEW imports in this run; 0 processes every pending selection.')
    parser.add_argument('--timeout', type=float, default=90)
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    parser.add_argument('--output', type=Path, help='Report path; full audits default to artifacts/drive-corpus-full-audit.json.')
    args = parser.parse_args()
    if not 0 <= args.sample_size <= 200 or len(args.sample_relative) > args.sample_size or not math.isfinite(args.timeout) or not 0 < args.timeout <= 3600:
        parser.error('Sample size must be 0-200, include all explicit selections, and timeout must be (0, 3600].')
    if args.limit < 0 or (args.retry_failures and not args.resume):
        parser.error('--limit must be nonnegative; --retry-failures requires --resume.')
    if args.all and (args.sample_relative or args.sample_size != 24):
        parser.error('--all cannot be combined with sample selection options.')
    args.directory = args.directory.resolve()
    args.output = (args.output or ROOT / ('artifacts/drive-corpus-full-audit.json' if args.all else 'artifacts/drive-corpus-audit.json')).resolve()
    if args.output == args.directory or args.directory in args.output.parents or args.output.suffix != '.json':
        parser.error('--output must be a .json report outside the read-only source directory.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    journal_path = args.output.with_suffix('.checkpoint.jsonl')
    # OS advisory lock releases even on a crash; the small lock file may remain.
    with args.output.with_suffix('.lock').open('a+b') as lock:
        try:
            if os.name == 'nt':
                import msvcrt
                lock.seek(0)
                lock.write(b'0')
                lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            parser.error('Another audit is using this output/checkpoint; choose a different --output.')
        try:
            return run(args, journal_path)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            parser.error(str(exc))


def run(args, journal_path):
    manifest_path = args.manifest or args.directory / 'download-manifest.json'
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode('utf-8'))
    manifest_hash = hashlib.sha256(manifest_bytes).hexdigest()
    start = time.perf_counter()
    engine_before = local.engine_hashes()
    validators_before = validator_hashes()
    records = inventory_manifest(args.directory, manifest)
    selected = ([record for record in records if record['status'] == 'inventory-only-unsampled']
                if args.all else select_sample(records, args.sample_size, args.sample_relative))
    for record in selected:
        record['status'] = 'inventory-only-pending'
    context = {'sourceDirectory': str(args.directory), 'manifestSha256': manifest_hash,
               'validatorHashes': validators_before, 'pythonVersion': sys.version,
               'dependencyVersions': {name: version(name) for name in ('numpy', 'scipy')}}
    signature = context_hash(context)
    saved = load_checkpoint(journal_path, signature) if args.resume else {}
    reused = reuse_results(selected, saved, args.retry_failures, args.timeout)
    pending = [record for record in selected if record['status'] == 'inventory-only-pending']
    if args.limit:
        pending = pending[:args.limit]
    print(f'Inventory: {len(records)} files; selected: {len(selected)}; resumed: {reused}; new imports: {len(pending)}.', flush=True)
    if args.resume:
        repair_checkpoint_tail(journal_path)
    with journal_path.open('a' if args.resume else 'w', encoding='utf-8', newline='\n') as checkpoint:
        completed, interrupted = validate_records(pending, args.timeout, args.workers, checkpoint, signature)
    categories = defaultdict(list)
    duplicate_hashes = defaultdict(list)
    for record in records:
        categories[record['sourceClassification']].append(record)
        if record.get('sha256'):
            duplicate_hashes[record['sha256']].append(record['relativePath'])
    engine_after = local.engine_hashes()
    validators_after = validator_hashes()
    manifest_unchanged = local.digest(manifest_path) == manifest_hash
    all_attempted = bool(records) and all(r['status'] in RESULT_STATUSES for r in records)
    complete = all_attempted and all(r['status'] in ('parsed', 'diagnosed') for r in records)
    complete = complete and manifest_unchanged and validators_before == validators_after and all(r.get('sourceUnchanged') for r in records)
    failures = failure_records(records)
    failure_path = args.output.with_suffix('.failures.json')
    report = {'schemaVersion': 2, 'createdUtc': datetime.now(timezone.utc).isoformat(),
              'sourceDirectory': str(args.directory.resolve()), 'sourceUrl': manifest['sourceUrl'],
              'acquisitionManifest': str(manifest_path.resolve()), 'acquisitionManifestSha256': manifest_hash,
              'acquisitionManifestUnchangedDuringAudit': manifest_unchanged,
              'listingMethod': manifest.get('listingMethod'), 'listingCompleteness': manifest.get('listingCompleteness'),
              'downloadCompleteAtAuditStart': manifest.get('downloadComplete', False),
              'downloadStatuses': dict(Counter(r['downloadStatus'] for r in records)),
              'readOnlySourceAudit': True, 'completeImporterAudit': complete,
              'allManifestEntriesAttempted': all_attempted,
              'auditMode': 'all' if args.all else 'sample', 'interrupted': interrupted,
              'checkpointJournal': str(journal_path), 'resumeContext': context, 'resumeContextSha256': signature,
              'progress': {'selected': len(selected), 'resumed': reused, 'completedThisRun': completed,
                           'pendingSelected': sum(r['status'] == 'inventory-only-pending' for r in selected),
                           'failureCount': len(failures)}, 'failureReport': str(failure_path),
              'samplingContract': ('Every eligible hash-verified supported manifest entry; --limit bounds new imports per invocation.' if args.all else 'Deterministic bounded sample: explicit selections, regular/star source anchors, four largest declared incidence counts, preferred source-category representatives, then further source categories.'),
              'classificationContract': 'Directory labels and abbreviations are unverified source metadata. No mathematical library completeness or uniformity certificate is asserted.',
              'limits': {'sampleSizeRequested': None if args.all else args.sample_size, 'sampleSizeActual': len(selected),
                         'maxNewImportsThisRun': args.limit or None,
                         'perFileTimeoutSeconds': args.timeout, 'parallelWorkers': args.workers,
                         'supportedDimensions': [3, 4], 'maxImporterFileBytes': 128 * 1024 * 1024, 'maxImporterVertices': 20000},
              'engineHashesBefore': engine_before, 'engineHashesAfter': engine_after,
              'engineUnchangedDuringAudit': engine_before == engine_after,
              'validatorHashesBefore': validators_before, 'validatorHashesAfter': validators_after,
              'validatorsUnchangedDuringAudit': validators_before == validators_after,
              'summary': local.summarize(records),
              'categories': {category: local.summarize(rows) for category, rows in sorted(categories.items())},
              'outsideImporterResourceDomain': [r['relativePath'] for r in records if r.get('withinImporterResourceDomain') is False],
              'duplicateContentGroups': [{'sha256': value, 'relativePaths': paths} for value, paths in sorted(duplicate_hashes.items()) if len(paths) > 1],
              'seconds': time.perf_counter() - start, 'records': records}
    atomic_json(args.output, report)
    atomic_json(failure_path, {'schemaVersion': 1, 'createdUtc': report['createdUtc'],
                             'sourceReport': str(args.output), 'completeImporterAudit': complete,
                             'progress': report['progress'], 'summary': report['summary'], 'failures': failures})
    print(json.dumps({'summary': report['summary'], 'progress': report['progress'],
                      'completeImporterAudit': complete, 'output': str(args.output), 'failureReport': str(failure_path)}))
    # A complete audit may still contain deterministic importer rejections.
    return 130 if interrupted else 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
