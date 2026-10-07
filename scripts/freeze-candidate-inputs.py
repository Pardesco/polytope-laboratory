"""Preserve qualified native and frontend inputs without replacing old evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def preserve(destination, hashes, version, scope):
    destination.mkdir(parents=True, exist_ok=False)
    for relative, expected in hashes.items():
        source = (ROOT / relative).resolve()
        assert source.is_relative_to(ROOT), relative
        data = source.read_bytes()
        assert digest(data) == expected, relative + ': source changed'
        target = destination / 'source' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        assert digest(target.read_bytes()) == expected
    (destination / 'source-hashes.json').write_text(json.dumps({
        'version': version, 'createdUtc': datetime.now(timezone.utc).isoformat(),
        'scope': scope, 'sourceHashes': hashes,
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Preserved {len(hashes)} inputs: {destination}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-proof', required=True, type=Path)
    args = parser.parse_args()
    proof = json.loads(args.native_proof.read_text(encoding='utf-8-sig'))
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    assert proof['passed'] is True and proof['sourceUnchanged'] is True
    assert proof['changedPaths'] == [] and proof['version'] == version
    native = ROOT / 'artifacts' / f'frozen-{version}-qualified-native-source'
    frontend = ROOT / 'artifacts' / f'frozen-{version}-candidate-inputs'
    assert not native.exists() and not frontend.exists(), 'Existing freezes must be preserved'
    preserve(native, proof['sourceHashes'], version,
             'Exact qualified native/catalog/test inputs; future mutations cannot replace this evidence')
    paths = {ROOT / name for name in ['package.json', 'package-lock.json', 'vite.config.mjs']}
    for folder in ['ui', 'desktop']:
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    hashes = {path.relative_to(ROOT).as_posix(): digest(path.read_bytes()) for path in sorted(paths)}
    preserve(frontend, hashes, version,
             'Frontend/desktop build inputs; retaining a module does not claim that it is mounted')


if __name__ == '__main__':
    main()
