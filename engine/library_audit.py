"""Compact, provenance-aware library evidence; no geometry is reconstructed.

Full audit JSON bodies can be hundreds of MiB. Compilation reads just the
bounded report header and streams the adjacent checkpoint once. GUI indexing
reads only the resulting compact index and the ordinary bounded source hashes.
"""
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path, PurePosixPath
import sys

from .formats import atomic_write
from .geometry import GeometryError

FORMAT = 'polytope-library-audit'
MAX_INDEX_BYTES = 32 * 1024 * 1024
MAX_HEADER_BYTES = 256 * 1024
MAX_JOURNAL_BYTES = 512 * 1024 * 1024
MAX_JOURNAL_LINE_BYTES = 16 * 1024 * 1024
MAX_RECORDS = 10000
IMPORTER_SOURCES = ('engine/__init__.py', 'engine/formats.py', 'engine/geometry.py')
ROOT = Path(__file__).resolve().parents[1]
RESULT_STATUSES = {'parsed', 'diagnosed', 'validation-failed', 'count-mismatch',
                   'timeout', 'worker-error', 'source-changed'}


def importer_fingerprint():
    return {'sourceHashes': {relative: hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
                             for relative in IMPORTER_SOURCES},
            'pythonVersion': sys.version,
            'dependencyVersions': {name: version(name) for name in ('numpy', 'scipy')}}


def _relative(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise GeometryError('Audit record has an invalid relative source path.')
    path = PurePosixPath(value)
    if (not value or path.is_absolute() or '\\' in value or ':' in value
            or any(part in ('', '.', '..') for part in value.split('/'))):
        raise GeometryError('Audit record has an invalid relative source path.')
    return value


def _sha(value):
    return isinstance(value, str) and len(value) == 64 and all(char in '0123456789abcdef' for char in value)


def _messages(values):
    if not isinstance(values, list):
        return []
    return [str(value)[:512] for value in values[:8]]


def _header(path):
    # Decode top-level pairs sequentially rather than searching inside arbitrary
    # nested record strings. Stop before the unbounded result body.
    with path.open('rb') as stream:
        prefix = stream.read(MAX_HEADER_BYTES).decode('utf-8-sig')
    decoder, result, position = json.JSONDecoder(), {}, 0
    try:
        position = len(prefix) - len(prefix.lstrip())
        if prefix[position] != '{':
            raise ValueError('Expected an audit report object')
        position += 1
        while True:
            while position < len(prefix) and prefix[position] in ' \t\r\n,':
                position += 1
            key, position = decoder.raw_decode(prefix, position)
            while prefix[position] in ' \t\r\n':
                position += 1
            if prefix[position] != ':':
                raise ValueError('Expected report property separator')
            position += 1
            while prefix[position] in ' \t\r\n':
                position += 1
            if key in ('files', 'records', 'results'):
                break
            value, position = decoder.raw_decode(prefix, position)
            result[key] = value
            if key == 'resumeContextSha256' or result.get('format') == FORMAT:
                break
        return result
    except (ValueError, IndexError, TypeError) as exc:
        raise GeometryError('Audit report lacks bounded provenance metadata: ' + str(exc)) from exc


def read_audit_index(path):
    path = Path(path).expanduser().resolve()
    if not path.is_file() or path.stat().st_size > MAX_INDEX_BYTES:
        raise GeometryError('Compact audit index must be a file no larger than 32 MiB.')
    try:
        index = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(index, dict):
            raise GeometryError('Compact audit index must be an object.')
        if index.get('format') != FORMAT or index.get('schemaVersion') != 1:
            raise GeometryError('Select or compile a version 1 compact library audit index.')
        if not isinstance(index.get('sourceDirectory'), str) or not index['sourceDirectory']:
            raise GeometryError('Compact audit index lacks its source directory.')
        if not isinstance(index.get('importer'), dict):
            raise GeometryError('Compact audit index lacks importer provenance.')
        records = index.get('records')
        if not isinstance(records, dict) or len(records) > MAX_RECORDS:
            raise GeometryError('Compact audit index exceeds the 10,000-record limit.')
        for relative, record in records.items():
            _relative(relative)
            if not isinstance(record, dict) or record.get('status') not in RESULT_STATUSES or not _sha(record.get('sourceHash')):
                raise GeometryError('Compact audit index contains an invalid source result.')
            if record.get('status') == 'parsed' and record.get('validationPassed') is not True:
                raise GeometryError('Compact parsed result lacks passing incidence validation.')
            if (type(record.get('sourceUnchanged')) is not bool
                    or type(record.get('validationPassed')) is not bool):
                raise GeometryError('Compact audit index lacks explicit source and validation evidence.')
            for key in ('warnings', 'errors'):
                values = record.get(key, [])
                if (not isinstance(values, list) or len(values) > 8
                        or any(not isinstance(value, str) or len(value) > 512 for value in values)):
                    raise GeometryError('Compact audit diagnostics exceed the bounded message limits.')
            if type(record.get('warningCount', 0)) is not int or record.get('warningCount', 0) < 0:
                raise GeometryError('Compact audit warning count must be a nonnegative integer.')
        return index
    except (ValueError, UnicodeError, OSError, TypeError) as exc:
        if isinstance(exc, GeometryError):
            raise
        raise GeometryError('Cannot read compact audit index: ' + str(exc)) from exc


def compile_audit_index(report_path, output_path):
    """Explicitly compile a Drive audit report or copy an existing compact index.

    Output must be outside the linked source tree. Referenced arbitrary journal
    paths are ignored; only the adjacent matching-name checkpoint is consumed.
    Historical provenance is retained, never rewritten as current validation.
    """
    report_path = Path(report_path).expanduser().resolve()
    output_path = Path(output_path).expanduser().resolve()
    if not report_path.is_file():
        raise GeometryError('Audit evidence path must be an existing file.')
    metadata = _header(report_path)
    if metadata.get('format') == FORMAT:
        index = read_audit_index(report_path)
    else:
        context = metadata.get('resumeContext')
        signature = metadata.get('resumeContextSha256')
        if (metadata.get('schemaVersion') != 2 or not isinstance(context, dict)
                or not _sha(signature) or hashlib.sha256(json.dumps(context, sort_keys=True).encode('utf-8')).hexdigest() != signature):
            raise GeometryError('Report does not contain a verified resumable audit context.')
        source = metadata.get('sourceDirectory')
        if not source or source != context.get('sourceDirectory'):
            raise GeometryError('Report and checkpoint source-directory provenance disagree.')
        hashes = context.get('validatorHashes', {})
        importer = {'sourceHashes': {relative: hashes.get(relative) for relative in IMPORTER_SOURCES},
                    'pythonVersion': context.get('pythonVersion'),
                    'dependencyVersions': context.get('dependencyVersions')}
        journal = report_path.with_suffix('.checkpoint.jsonl')
        if not journal.is_file() or journal.stat().st_size > MAX_JOURNAL_BYTES:
            raise GeometryError('Expected adjacent checkpoint journal no larger than 512 MiB.')
        records, ignored_tail = {}, False
        with journal.open('rb') as stream:
            number = 0
            while True:
                line = stream.readline(MAX_JOURNAL_LINE_BYTES + 1)
                if not line:
                    break
                number += 1
                if len(line) > MAX_JOURNAL_LINE_BYTES:
                    raise GeometryError('Audit checkpoint line exceeds the 16 MiB record limit.')
                if not line.endswith(b'\n'):
                    ignored_tail = True
                    break
                try:
                    event = json.loads(line)
                    if event.get('contextSha256') != signature:
                        continue
                    record = event['record']
                    relative = _relative(record['relativePath'])
                    validation = record.get('validation', {})
                    if record.get('status') not in RESULT_STATUSES or not _sha(record.get('sha256')):
                        raise ValueError('Invalid source hash or importer status')
                    if record['status'] == 'parsed' and validation.get('passed') is not True:
                        raise ValueError('Parsed result lacks passing validation')
                    warnings = validation.get('warnings', [])
                    errors = validation.get('errors', [])
                    if record.get('error'):
                        errors = [record['error']] + (errors if isinstance(errors, list) else [])
                    records[relative] = {'sourceHash': record['sha256'], 'status': record['status'],
                        'sourceUnchanged': record.get('sourceUnchanged') is True,
                        'validationPassed': validation.get('passed') is True,
                        'warnings': _messages(warnings), 'errors': _messages(errors),
                        'warningCount': len(warnings) if isinstance(warnings, list) else 0,
                        'interpretation': record.get('interpretation'), 'auditedUtc': record.get('auditedUtc')}
                    if len(records) > MAX_RECORDS:
                        raise GeometryError('Audit exceeds the 10,000-record library limit.')
                except (ValueError, KeyError, TypeError, AttributeError) as exc:
                    raise GeometryError(f'Invalid audit checkpoint line {number}: {exc}') from exc
        index = {'format': FORMAT, 'schemaVersion': 1, 'sourceDirectory': source,
                 'createdUtc': datetime.now(timezone.utc).isoformat(),
                 'sourceReport': str(report_path), 'sourceContextSha256': signature,
                 'importer': importer, 'records': records, 'ignoredIncompleteTail': ignored_tail}
    source_root = Path(index['sourceDirectory']).expanduser().resolve()
    if output_path == report_path or output_path == source_root or source_root in output_path.parents:
        raise GeometryError('Write the compact audit index outside the linked source directory and original report.')
    encoded = json.dumps(index, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    if len(encoded.encode('utf-8')) > MAX_INDEX_BYTES:
        raise GeometryError('Compiled audit index exceeds the 32 MiB limit.')
    atomic_write(output_path, encoded)
    return {'path': str(output_path), 'sourceDirectory': index['sourceDirectory'],
            'recordCount': len(index['records']), 'bytes': len(encoded.encode('utf-8')),
            'importerFresh': index['importer'] == importer_fingerprint(),
            'ignoredIncompleteTail': index.get('ignoredIncompleteTail', False)}


def attach_audit(entries, audit_path):
    index = read_audit_index(audit_path)
    fresh = index['importer'] == importer_fingerprint()
    source_root = Path(index['sourceDirectory']).expanduser().resolve()
    for entry in entries:
        entry.update(auditStatus='untested', auditWarnings=[], auditErrors=[], auditWarningCount=0)
        entry['auditPath'] = str(Path(audit_path).expanduser().resolve())
        root = Path(entry['libraryRoot']).resolve()
        if root != source_root:
            entry['auditDiagnostic'] = 'Audit belongs to a different linked source directory.'
            continue
        record = index['records'].get(entry['relativePath'])
        if record is None:
            entry['auditDiagnostic'] = 'No importer result is recorded for this source file.'
            continue
        entry.update(auditWarnings=record.get('warnings', []), auditErrors=record.get('errors', []),
                     auditWarningCount=record.get('warningCount', 0), auditResultStatus=record['status'])
        if not fresh:
            entry.update(auditStatus='stale', auditDiagnostic='Importer source, Python, or dependency versions have changed since this audit.')
        elif not record.get('sourceUnchanged'):
            entry.update(auditStatus='stale', auditDiagnostic='Audit did not verify that source bytes remained unchanged.')
        elif not entry.get('sourceHash'):
            reasons = {'not-computed-size': 'file exceeds the startup per-file hash limit',
                       'not-computed-budget': 'aggregate hash budget exhausted',
                       'not-computed-file-changed': 'source grew beyond the hash allowance during reading'}
            reason = reasons.get(entry.get('hashStatus'), entry.get('hashStatus', 'unknown hash status'))
            entry.update(auditStatus='stale', auditDiagnostic='Current source hash was not computed within the catalog resource limits: ' + reason + '.')
        elif entry['sourceHash'] != record['sourceHash']:
            entry.update(auditStatus='stale', auditDiagnostic='Source bytes have changed since the audit.')
        elif record['status'] == 'parsed':
            entry.update(auditStatus='passed', auditDiagnostic='Complete importer incidence validation passed for these source bytes.')
        elif record['status'] in ('diagnosed', 'validation-failed', 'count-mismatch'):
            entry.update(auditStatus='rejected', auditDiagnostic='; '.join(record.get('errors', [])) or 'Importer rejected this source.')
        else:
            entry['auditDiagnostic'] = 'Audit did not complete importer validation: ' + record['status']
    return entries
