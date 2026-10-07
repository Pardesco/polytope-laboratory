"""Mount reviewed morph modules/tests and narrow Viewer hunks, never the adapter."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'development/dual-morph-integration-0.22'
RECEIPT = ROOT / 'artifacts/dual-morph-transplant-0.22.json'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if RECEIPT.exists():
        raise RuntimeError('Retained transplant receipt already exists; inspect current state.')
    manifest = json.loads((STAGE / 'source-hashes.json').read_text(encoding='utf-8'))
    for name, row in manifest['files'].items():
        assert digest(STAGE / name) == row['sha256'], name
    protected = {name: digest(ROOT / name) for name in (
        'engine/__init__.py', 'engine/formats.py', 'engine/geometry.py',
        'ui/stereographic-normals.mjs', 'ui/stereographic-dense-refiner.mjs',
        'ui/stereographic-conforming-surface.mjs', 'ui/viewer-stereographic.mjs')}
    changes = {}
    for name in ('engine/dual_morph.py', 'engine/dual_morph_expansion.py',
                 'engine/dual_morph_sizing.py', 'engine/dual_morph_truncation.py',
                 'ui/dual-morph-session.mjs', 'ui/dual-morph-controls.mjs',
                 'ui/dual-morph-picking.mjs', 'tests/dual-morph-session.test.mjs',
                 'tests/dual-morph-viewer.test.mjs', 'tests/test_dual_morph_integration.py'):
        assert not (ROOT / name).exists(), name
        content = (STAGE / name).read_text(encoding='utf-8')
        if name == 'tests/test_dual_morph_integration.py':
            content = content.replace('Run from the copied tree, never import the mounted production server.',
                                      'Production dispatch, storage and complete native package integration.')
            content = content.replace('class MountedCopy(unittest.TestCase):', 'class MountedMorph(unittest.TestCase):')
            content = content.replace('test_copied_server_and_validator_are_the_actual_targets',
                                      'test_production_server_and_validator_are_the_actual_targets')
        if name == 'tests/dual-morph-viewer.test.mjs':
            content = content.replace('actual copied native dispatch', 'actual production native dispatch')
        if name.startswith('engine/'):
            content = content.replace('Copied integration only:', 'Read-only production runtime:')
            content = content.replace('Unmounted incidence-product', 'Incidence-product')
            content = content.replace('Unmounted sizing morph', 'Sizing morph')
            content = content.replace('Unmounted finite 3D', 'Finite 3D')
        changes[name] = content.encode('utf-8')
    name = 'ui/viewer.js'
    content = (ROOT / name).read_text(encoding='utf-8')
    for hunk in json.loads((STAGE / 'viewer-hunks.json').read_text(encoding='utf-8')):
        assert hunk['file'] == name
        assert content.count(hunk['old']) == 1, hunk['old']
        content = content.replace(hunk['old'], hunk['new'], 1)
    changes[name] = content.encode('utf-8')
    before = {name: digest(ROOT / name) if (ROOT / name).exists() else None for name in changes}
    for name, content in changes.items():
        (ROOT / name).write_bytes(content)
    for name, sha in protected.items():
        assert digest(ROOT / name) == sha, name
    receipt = {'createdUtc': datetime.now(timezone.utc).isoformat(),
               'scope': 'Production modules/tests and Viewer only; shared app/native dispatch integration and actual GPU qualification separately required.',
               'stageManifestSHA256': digest(STAGE / 'source-hashes.json'),
               'frozenIntegrationInputsVerified': len(manifest['files']),
               'protectedUnchanged': protected,
               'changes': [{'file': name, 'beforeSHA256': before[name], 'afterSHA256': digest(ROOT / name)} for name in changes]}
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'mounted': len(changes), 'receipt': str(RECEIPT)}))


if __name__ == '__main__':
    main()
