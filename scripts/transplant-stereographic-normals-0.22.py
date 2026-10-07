"""Mount the reviewed signed-normal patch, retaining qualified 0.21 inputs."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'development/stereographic-normal-integration-0.22'
FROZEN = ROOT / 'artifacts/frozen-0.21.0-release-qualified-source'
RECEIPT = ROOT / 'artifacts/stereographic-normal-transplant-0.22.json'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if RECEIPT.exists():
        raise RuntimeError('Retained transplant receipt already exists; inspect current state.')
    snapshot = json.loads((STAGE / 'snapshot.json').read_text(encoding='utf-8'))
    frozen = json.loads((FROZEN / 'source-hashes.json').read_text(encoding='utf-8'))
    for name, sha in frozen['sourceHashes'].items():
        assert digest(FROZEN / 'source' / name) == sha, name
    changes = {}
    for row in snapshot['changedModules']:
        name = row['file']
        assert digest(ROOT / name) == row['originalSHA256'], name
        assert digest(STAGE / name) == row['copiedSHA256'], name
        changes[name] = (STAGE / name).read_bytes()
    for row in snapshot['tests']:
        assert digest(STAGE / row['file']) == row['SHA256'], row['file']
    normal_test = 'tests/stereographic-normals.test.mjs'
    assert digest(ROOT / normal_test) == frozen['sourceHashes'][normal_test]
    changes[normal_test] = (STAGE / normal_test).read_bytes()
    new_test = 'tests/signed-normal-integration.test.mjs'
    adapter = 'tests/stereographic-dense-worker-entry.mjs'
    assert not (ROOT / new_test).exists()
    assert digest(ROOT / adapter) == digest(STAGE / adapter) == frozen['sourceHashes'][adapter]
    test = (STAGE / new_test).read_text(encoding='utf-8')
    old_import = "../../../ui/stereographic-worker-geometry.mjs"
    assert test.count(old_import) == 1
    test = test.replace(old_import, '../artifacts/frozen-0.21.0-release-qualified-source/source/ui/stereographic-worker-geometry.mjs')
    changes[new_test] = test.encode('utf-8')
    package = (ROOT / 'package.json').read_text(encoding='utf-8')
    marker = 'tests/vp8-webm.test.mjs"'
    assert package.count(marker) == 1
    changes['package.json'] = package.replace(marker, 'tests/vp8-webm.test.mjs tests/signed-normal-integration.test.mjs"').encode('utf-8')
    before = {name: digest(ROOT / name) if (ROOT / name).exists() else None for name in changes}
    for name, data in changes.items():
        (ROOT / name).write_bytes(data)
    for name in ('engine/__init__.py', 'engine/formats.py', 'engine/geometry.py'):
        assert digest(ROOT / name) == frozen['sourceHashes'][name], name
    receipt = {'createdUtc': datetime.now(timezone.utc).isoformat(), 'scope':
        'Mounted source only; runtime/GPU and packaged qualification pending. Full goal remains open.',
        'stageSnapshotSHA256': digest(STAGE / 'snapshot.json'),
        'frozenManifestSHA256': digest(FROZEN / 'source-hashes.json'),
        'preservedFrozenInputs': len(frozen['sourceHashes']),
        'changes': [{'file': name, 'beforeSHA256': before[name], 'afterSHA256': digest(ROOT / name)} for name in changes]}
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'mounted': len(changes), 'frozenInputsVerified': len(frozen['sourceHashes']), 'receipt': str(RECEIPT)}))


if __name__ == '__main__':
    main()
