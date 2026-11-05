"""Disposable catalog metadata index; model loading retains all source checks."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 8 * 1024 * 1024
_memory = None


def source_signature(root=ROOT):
    paths = sorted(set(root.glob('*.py')) | set((root/'catalog_data').rglob('*.json')))
    if getattr(sys, 'frozen', False): paths.append(Path(sys.executable))
    rows = [(str(path), path.stat().st_size, path.stat().st_mtime_ns) for path in paths]
    return hashlib.sha256(json.dumps([1, sys.version, rows], separators=(',', ':')).encode()).hexdigest()


def _clear_metadata():
    for name, module in list(sys.modules.items()):
        if name.startswith('engine.') and ('catalog' in name or name in ('engine.uniform4', 'engine.star_uniform4', 'engine.library_navigation')):
            for key in ('_manifest', '_entries', '_sources', 'manifest', 'crosswalk', 'cell_types'):
                clear = getattr(getattr(module, key, None), 'cache_clear', None)
                if clear: clear()


def catalog_index(build, *, signature=source_signature, cache_path=None):
    global _memory
    key = signature()
    if _memory and _memory[0] == key: return json.loads(_memory[1])
    _clear_metadata()
    path = cache_path or os.environ.get('POLYTOPE_CATALOG_CACHE')
    path = Path(path) if path else None
    if path:
        try:
            if path.stat().st_size <= MAX_BYTES:
                with path.open('rb') as stream: raw = stream.read(MAX_BYTES+1)
                if len(raw) > MAX_BYTES: raise ValueError('Catalog index grew beyond its bound.')
                envelope = json.loads(raw)
                payload = envelope['payload']
                if envelope['key'] == key and hashlib.sha256(payload.encode()).hexdigest() == envelope['sha256']:
                    result = json.loads(payload)
                    if type(result) is list:
                        _memory = (key, payload)
                        return result
        except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError): pass
    result = build()
    payload = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    if signature() != key:
        from .geometry import GeometryError
        raise GeometryError('Catalog metadata changed while loading. Retry loading the Library.')
    if len(payload.encode()) > MAX_BYTES // 2: return result
    _memory = (key, payload)
    if path:
        temporary = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
                temporary = stream.name
                json.dump({'key':key, 'sha256':hashlib.sha256(payload.encode()).hexdigest(), 'payload':payload}, stream, ensure_ascii=False, separators=(',', ':'))
            os.replace(temporary, path)
        except OSError: pass
        finally:
            if temporary:
                try: os.unlink(temporary)
                except OSError: pass
    return result
