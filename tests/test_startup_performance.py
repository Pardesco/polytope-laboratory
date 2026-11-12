"""Catalog metadata reuse never replaces native geometry/source qualification."""

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

from engine import catalog_index as index


@pytest.fixture(autouse=True)
def reset_index(monkeypatch):
    monkeypatch.setattr(index, '_memory', None)
    monkeypatch.delenv('POLYTOPE_CATALOG_CACHE', raising=False)


def test_memory_and_disk_return_detached_identical_metadata(tmp_path):
    path = tmp_path / 'catalog.json'
    calls = []

    def build():
        calls.append(1)
        return [{'key': 'cube', 'aliases': ['Hexahedron'], 'counts': [8, 12, 6, 0]}]

    first = index.catalog_index(build, signature=lambda: 'one', cache_path=path)
    first[0]['aliases'].append('mutated')
    assert index.catalog_index(build, signature=lambda: 'one', cache_path=path)[0]['aliases'] == ['Hexahedron']
    index._memory = None
    assert index.catalog_index(build, signature=lambda: 'one', cache_path=path)[0]['counts'] == [8, 12, 6, 0]
    assert len(calls) == 1


@pytest.mark.parametrize(
    'corrupt', ['{bad', '{}', '{"key":"one","payload":123}', '{"key":"one","payload":"[]","sha256":"wrong"}']
)
def test_bad_disk_cache_rebuilds(corrupt, tmp_path):
    path = tmp_path / 'catalog.json'
    path.write_text(corrupt)
    assert index.catalog_index(lambda: [{'key': 'rebuilt'}], signature=lambda: 'one', cache_path=path) == [
        {'key': 'rebuilt'}
    ]
    assert json.loads(path.read_text())['key'] == 'one'


def test_manifest_and_code_mtimes_and_added_files_invalidate(tmp_path):
    data = tmp_path / 'catalog_data'
    data.mkdir()
    code = tmp_path / 'catalog.py'
    code.write_text('one')
    manifest = data / 'manifest.json'
    manifest.write_text('{}')
    signatures = [index.source_signature(tmp_path)]
    for path in (manifest, code):
        stat = path.stat()
        os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1000000))
        signatures.append(index.source_signature(tmp_path))
    (data / 'new.json').write_text('{}')
    signatures.append(index.source_signature(tmp_path))
    assert len(set(signatures)) == 4


def test_changed_key_rebuilds_and_rejects_build_races(tmp_path):
    path = tmp_path / 'cache.json'
    assert index.catalog_index(lambda: ['first'], signature=lambda: 'one', cache_path=path) == ['first']
    assert index.catalog_index(lambda: ['second'], signature=lambda: 'two', cache_path=path) == ['second']
    keys = iter(('three', 'changed'))
    with pytest.raises(ValueError, match='changed while loading'):
        index.catalog_index(lambda: [], signature=lambda: next(keys), cache_path=path)


def test_changed_manifest_drops_existing_provider_metadata_cache(tmp_path, monkeypatch):
    from engine import catalog

    data = tmp_path / 'catalog_data'
    provider = data / 'miratope'
    provider.mkdir(parents=True)
    manifest = provider / 'manifest.json'
    entry = {'key': 'test-star', 'name': 'First', 'registration': 'regular-star', 'counts': [5, 5, 1, 0]}
    manifest.write_text(json.dumps({'entries': [entry]}))
    monkeypatch.setattr(catalog, 'DATA', data)
    read = lambda: [row[2] for row in catalog._sources().values()]
    signature = lambda: index.source_signature(tmp_path)
    try:
        assert index.catalog_index(read, signature=signature)[0]['name'] == 'First'
        entry['name'] = 'Other'
        manifest.write_text(json.dumps({'entries': [entry]}))
        stat = manifest.stat()
        os.utime(manifest, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1000000))
        assert index.catalog_index(read, signature=signature)[0]['name'] == 'Other'
    finally:
        catalog._sources.cache_clear()


def test_readonly_cache_is_optional_and_build_errors_are_preserved(tmp_path):
    blocker = tmp_path / 'file'
    blocker.write_text('x')
    assert index.catalog_index(lambda: [1], signature=lambda: 'one', cache_path=blocker / 'cache.json') == [1]

    def invalid():
        raise ValueError('invalid manifest')

    with pytest.raises(ValueError, match='invalid manifest'):
        index.catalog_index(invalid, signature=lambda: 'changed')


def test_real_catalog_matches_uncached_builder_and_source_validation_remains(monkeypatch):
    from engine.catalog import get_catalog, _build_catalog, load_catalog_model
    from engine.geometry import GeometryError

    assert get_catalog() == _build_catalog()
    entry = get_catalog()[0]
    entry['name'] = 'mutated'
    assert get_catalog()[0]['name'] != 'mutated'
    original = Path.read_bytes

    def changed(path):
        raw = original(path)
        return raw + b'\n' if path.suffix == '.off' else raw

    monkeypatch.setattr(Path, 'read_bytes', changed)
    with pytest.raises(GeometryError, match='hash mismatch'):
        load_catalog_model('antiprism-u1')


def test_engine_readiness_flag_preserves_json_lines_and_lazy_solver_import():
    root = Path(__file__).resolve().parents[1]
    code = "import sys;import engine.server;assert 'scipy.optimize' not in sys.modules;assert 'engine.spring_workflow' not in sys.modules"
    subprocess.run([sys.executable, '-c', code], cwd=root, check=True, capture_output=True)
    for enabled in (False, True):
        env = dict(os.environ)
        env.pop('POLYTOPE_STARTUP_PROFILE', None)
        if enabled:
            env['POLYTOPE_STARTUP_PROFILE'] = '1'
        result = subprocess.run(
            [sys.executable, 'engine/server.py'],
            input='{"op":"expression","params":{"expression":"1+1"},"id":"test"}\n',
            text=True,
            capture_output=True,
            cwd=root,
            env=env,
            check=True,
        )
        assert json.loads(result.stdout)['result']['value'] == 2
        assert ('POLYTOPE_ENGINE_READY' in result.stderr) == enabled
