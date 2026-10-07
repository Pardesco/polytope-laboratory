from copy import deepcopy
import hashlib
import json
from pathlib import Path

import pytest

from engine.geometry import GeometryError
from engine.library import index_library
import engine.library_audit as audit


def write_index(tmp_path, root, status='parsed', **changes):
    path = root / 'Cat1' / 'shape.off'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('OFF\n4 4 6\n', encoding='utf-8')
    record = {'sourceHash': hashlib.sha256(path.read_bytes()).hexdigest(), 'status': status,
              'sourceUnchanged': True, 'validationPassed': status == 'parsed',
              'warnings': ['Generalized open shell'], 'warningCount': 1,
              'errors': ['Example source incidence rejected'] if status == 'diagnosed' else []}
    record.update(changes)
    index = {'format': audit.FORMAT, 'schemaVersion': 1, 'sourceDirectory': str(root),
             'importer': audit.importer_fingerprint(), 'records': {'Cat1/shape.off': record}}
    evidence = tmp_path / 'evidence.library-index.json'
    evidence.write_text(json.dumps(index), encoding='utf-8')
    return evidence, path, index


@pytest.mark.parametrize('status,expected', [('parsed', 'passed'), ('diagnosed', 'rejected'),
                                           ('timeout', 'untested'), ('worker-error', 'untested')])
def test_fresh_evidence_status_warnings_without_geometry(tmp_path, monkeypatch, status, expected):
    root = tmp_path / 'sources'
    evidence, _, _ = write_index(tmp_path, root, status)
    monkeypatch.setattr('engine.formats.hull', lambda *args, **kwargs: pytest.fail('Geometry reconstructed'))
    row = index_library(root, audit_path=evidence)[0]
    assert row['auditStatus'] == expected
    assert row['auditWarnings'] == ['Generalized open shell'] and row['auditWarningCount'] == 1
    assert row['status'] == 'ready' and row['supported'] and row['validation'] == 'header-only'
    if expected == 'rejected':
        assert row['auditErrors'] == ['Example source incidence rejected']


@pytest.mark.parametrize('changed', ['sourceHashes', 'pythonVersion', 'dependencyVersions'])
def test_importer_python_and_dependencies_invalidate_audit(tmp_path, changed):
    root = tmp_path / 'sources'
    evidence, _, index = write_index(tmp_path, root)
    index['importer'][changed] = {} if changed != 'pythonVersion' else 'old-python'
    evidence.write_text(json.dumps(index), encoding='utf-8')
    row = index_library(root, audit_path=evidence)[0]
    assert row['auditStatus'] == 'stale' and 'changed' in row['auditDiagnostic']


def test_source_changed_missing_hash_unverified_source_and_new_file(tmp_path, monkeypatch):
    root = tmp_path / 'sources'
    evidence, source, _ = write_index(tmp_path, root)
    source.write_text('OFF\n8 6 12\n', encoding='utf-8')
    assert index_library(root, audit_path=evidence)[0]['auditStatus'] == 'stale'
    evidence, _, _ = write_index(tmp_path, root, sourceUnchanged=False)
    assert 'unchanged' in index_library(root, audit_path=evidence)[0]['auditDiagnostic']
    evidence, _, _ = write_index(tmp_path, root)
    monkeypatch.setattr('engine.library.MAX_LIBRARY_HASH_BYTES', 1)
    assert 'hash was not computed' in index_library(root, audit_path=evidence)[0]['auditDiagnostic']
    (root / 'new.off').write_text('OFF\n4 4 6\n', encoding='utf-8')
    new = next(row for row in index_library(root, audit_path=evidence) if row['name'] == 'new')
    assert new['auditStatus'] == 'untested'


def test_other_directory_cannot_reuse_evidence(tmp_path):
    root = tmp_path / 'sources'
    evidence, _, _ = write_index(tmp_path, root)
    other = tmp_path / 'other'
    other.mkdir()
    (other / 'shape.off').write_text('OFF\n4 4 6\n', encoding='utf-8')
    row = index_library(other, audit_path=evidence)[0]
    assert row['auditStatus'] == 'untested' and 'different' in row['auditDiagnostic']


def test_explicit_hash_verification_resolves_size_and_budget_staleness(tmp_path, monkeypatch):
    root = tmp_path / 'sources'
    evidence, source, index = write_index(tmp_path, root)
    source.write_text('OFF\n4 4 6\n' + '# comment\n' * 100, encoding='utf-8')
    index['records']['Cat1/shape.off']['sourceHash'] = hashlib.sha256(source.read_bytes()).hexdigest()
    evidence.write_text(json.dumps(index), encoding='utf-8')
    monkeypatch.setattr('engine.library.MAX_LIBRARY_HASH_FILE_BYTES', 100)
    row = index_library(root, audit_path=evidence)[0]
    assert row['auditStatus'] == 'stale' and 'per-file' in row['auditDiagnostic']
    verified = index_library(root, audit_path=evidence, verify_audit_hashes=True)[0]
    assert verified['auditStatus'] == 'passed' and verified['hashVerification'] == 'explicit'
    monkeypatch.setattr('engine.library.MAX_LIBRARY_HASH_BYTES', 1)
    assert index_library(root, audit_path=evidence, verify_audit_hashes=True)[0]['auditStatus'] == 'passed'
    monkeypatch.setattr('engine.library.MAX_VERIFIED_LIBRARY_HASH_BYTES', 1)
    bounded = index_library(root, audit_path=evidence, verify_audit_hashes=True)[0]
    assert bounded['auditStatus'] == 'stale' and 'aggregate hash budget' in bounded['auditDiagnostic']
    monkeypatch.setattr('engine.library.MAX_FILE_BYTES', 100)
    oversized = index_library(root, audit_path=evidence, verify_audit_hashes=True)[0]
    assert oversized['status'] == 'resource-limit' and oversized['auditStatus'] == 'stale'
    with pytest.raises(GeometryError, match='boolean'):
        index_library(root, verify_audit_hashes='true')


def write_report(tmp_path, root, context=None):
    fingerprint = audit.importer_fingerprint()
    context = context or {'sourceDirectory': str(root), 'validatorHashes': fingerprint['sourceHashes'],
               'pythonVersion': fingerprint['pythonVersion'], 'dependencyVersions': fingerprint['dependencyVersions']}
    signature = hashlib.sha256(json.dumps(context, sort_keys=True).encode('utf-8')).hexdigest()
    report = tmp_path / 'audit.json'
    metadata = {'schemaVersion': 2, 'sourceDirectory': str(root), 'resumeContext': context,
                'resumeContextSha256': signature}
    # Deliberately unparseable body proves compilation never reads full records.
    report.write_text(json.dumps(metadata)[:-1] + ', "files": [' + 'x' * 300000, encoding='utf-8')
    journal = report.with_suffix('.checkpoint.jsonl')
    return report, journal, signature


def test_compile_streams_journal_compacts_warnings_and_preserves_provenance(tmp_path):
    root = tmp_path / 'sources'
    _, source, index = write_index(tmp_path, root)
    report, journal, signature = write_report(tmp_path, root)
    record = {'relativePath': 'Cat1/shape.off', 'status': 'parsed',
              'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceUnchanged': True,
              'validation': {'passed': True, 'warnings': ['warning' * 1000] * 100, 'errors': []}}
    journal.write_text(json.dumps({'contextSha256': signature, 'record': record}) + '\n{"incomplete":', encoding='utf-8', newline='')
    output = tmp_path / 'compiled.library-index.json'
    result = audit.compile_audit_index(report, output)
    assert result['recordCount'] == 1 and result['importerFresh'] and result['ignoredIncompleteTail']
    assert result['bytes'] < 10000
    assert index_library(root, audit_path=output)[0]['auditStatus'] == 'passed'
    compiled = audit.read_audit_index(output)
    saved = compiled['records']['Cat1/shape.off']
    assert saved['warningCount'] == 100 and len(saved['warnings']) == 8
    assert len(saved['warnings'][0]) == 512
    assert compiled['importer'] == index['importer']
    copied = tmp_path / 'copied.library-index.json'
    assert audit.compile_audit_index(output, copied)['importerFresh']


def test_compile_rejects_unverified_context_corrupt_records_and_source_output(tmp_path):
    root = tmp_path / 'sources'
    _, source, _ = write_index(tmp_path, root)
    report, journal, signature = write_report(tmp_path, root)
    journal.write_text('bad json\n', encoding='utf-8', newline='')
    with pytest.raises(GeometryError, match='checkpoint line'):
        audit.compile_audit_index(report, tmp_path / 'out.json')
    journal.write_text('', encoding='utf-8')
    with pytest.raises(GeometryError, match='outside'):
        audit.compile_audit_index(report, root / 'out.json')
    text = report.read_text(encoding='utf-8').replace(signature, '0' * 64)
    report.write_text(text, encoding='utf-8')
    with pytest.raises(GeometryError, match='verified resumable'):
        audit.compile_audit_index(report, tmp_path / 'out.json')


@pytest.mark.parametrize('change', ['traversal', 'hash', 'passed', 'version'])
def test_compact_reader_rejects_malformed_evidence(tmp_path, change):
    root = tmp_path / 'sources'
    evidence, _, index = write_index(tmp_path, root)
    record = index['records']['Cat1/shape.off']
    if change == 'traversal':
        index['records']['../shape.off'] = index['records'].pop('Cat1/shape.off')
    elif change == 'hash':
        record['sourceHash'] = 'fake'
    elif change == 'passed':
        record['validationPassed'] = False
    else:
        index['schemaVersion'] = 99
    evidence.write_text(json.dumps(index), encoding='utf-8')
    with pytest.raises(GeometryError):
        audit.read_audit_index(evidence)
