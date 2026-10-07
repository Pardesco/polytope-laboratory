"""Read-only source/evidence checks and a new stop-point manifest."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'artifacts/session-stop-0.22.json'
FROZEN = ROOT / 'artifacts/frozen-0.21.0-release-qualified-source'
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def log_text(name):
    raw = (ROOT / name).read_bytes()
    return raw.decode('utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8')


def inventory(folder):
    return {str(path.relative_to(ROOT)).replace('\\', '/'): digest(path)
        for path in sorted((ROOT / folder).rglob('*'))
        if path.is_file() and not any(part in ('__pycache__', 'node_modules', '.git') for part in path.parts)
        and path.suffix not in ('.pyc', '.pyo')}


def main():
    if DEST.exists():
        raise RuntimeError('Preserve the existing session checkpoint; do not overwrite.')
    base = json.loads((FROZEN / 'source-hashes.json').read_text(encoding='utf-8'))
    for name, sha in base['sourceHashes'].items():
        assert digest(FROZEN / 'source' / name) == sha, name
    allowed = {'package.json', 'tests/stereographic-normals.test.mjs',
        'tests/stereographic-conforming-quality.test.mjs', 'ui/stereographic-normals.mjs',
        'ui/stereographic-dense-refiner.mjs', 'ui/stereographic-conforming-surface.mjs',
        'ui/viewer-stereographic.mjs'}
    drift = {name: {'releaseSHA256': sha, 'currentSHA256': digest(ROOT / name)}
        for name, sha in base['sourceHashes'].items() if digest(ROOT / name) != sha}
    assert set(drift) == allowed, sorted(drift)
    for name in ('engine/__init__.py', 'engine/formats.py', 'engine/geometry.py'):
        assert digest(ROOT / name) == base['sourceHashes'][name]
    frontend = log_text('artifacts/frontend-normal-mounted-0.22-source-order.log')
    assert re.search(r'^# pass 1584\s*$', frontend, re.M)
    assert re.search(r'^# fail 0\s*$', frontend, re.M)
    assert re.search(r'^# cancelled 0\s*$', frontend, re.M)
    native = log_text('artifacts/element-content-integration-0.22-ownership-first.log')
    assert 'Ran 19 tests' in native and native.rstrip().endswith('OK')
    gpu = json.loads((ROOT / 'artifacts/stereographic-surface-seams-iRftEQ/result.json').read_text(encoding='utf-8'))
    assert gpu['passed'] and not gpu['packaged'] and not gpu['failures'] and not gpu['pageErrors']
    ledger = json.loads((ROOT / 'docs/parity-ledger.json').read_text(encoding='utf-8'))
    counts = {status: sum(row['implementation_status'] == status for row in ledger['requirements'])
        for status in ('validated', 'prototype', 'unstarted')}
    assert len(ledger['requirements']) == 73 and counts == {'validated': 2, 'prototype': 65, 'unstarted': 6}
    assert '2 independently closed gates; 71 open gates' in log_text('artifacts/parity-ledger-session-stop-0.22.log')
    release = ROOT / 'release/Polytope Laboratory 0.21.0.exe'
    assert release.stat().st_size == 131830707
    assert digest(release) == 'f69deb34be6c7856c575f05a3c61f9d3d74f1c5fe856f679c4ec3d0fb5b64077'
    test_adapters = []
    for name in ('development/dual-morph-integration-0.22', 'development/element-content-viewport-0.22',
                 'development/element-annotations-integration-0.22'):
        for protected in ('engine/__init__.py', 'engine/formats.py', 'engine/geometry.py'):
            path = ROOT / name / protected
            if path.exists():
                if name == 'development/dual-morph-integration-0.22' and protected == 'engine/__init__.py':
                    # This tree does not copy the complete engine: its NEW
                    # test-only package adapter extends the native module path.
                    # It is never a transplantable importer or production file.
                    expected = json.loads((ROOT / name / 'source-hashes.json').read_text(encoding='utf-8'))['files'][protected]['sha256']
                    assert digest(path) == expected
                    test_adapters.append({'file': str(path.relative_to(ROOT)).replace('\\', '/'),
                        'sha256': expected, 'mustNeverTransplant': True,
                        'scope': 'New test-only namespace path adapter; not a byte-identical copy of the protected initializer.'})
                    continue
                assert digest(path) == base['sourceHashes'][protected], str(path)
    sources = {}
    for folder in ('development/faceting-diagram-integration-0.22',
                   'development/dual-morph-integration-0.22',
                   'development/element-content-viewport-0.22',
                   'development/element-annotations-integration-0.22', 'dist'):
        sources.update(inventory(folder))
    for name in allowed | {'tests/signed-normal-integration.test.mjs', 'scripts/transplant-stereographic-normals-0.22.py',
            'scripts/collect-session-stop-0.22.py', 'docs/SESSION_HANDOFF.md', 'docs/BUILD_STATUS.md'}:
        sources[name] = digest(ROOT / name)
    proofs = {name: digest(ROOT / name) for name in (
        'artifacts/stereographic-normal-transplant-0.22.json',
        'artifacts/stereographic-surface-seams-iRftEQ/result.json',
        'artifacts/frontend-normal-mounted-0.22-source-order.log',
        'artifacts/frontend-normal-mounted-0.22-build.log',
        'artifacts/element-content-integration-0.22-ownership-first.log',
        'artifacts/parity-ledger-session-stop-0.22.log')}
    result = {'createdUtc': datetime.now(timezone.utc).isoformat(), 'scope':
        'User-requested stopping checkpoint; goal incomplete; current source plus separate development integrations. Not a release receipt.',
        'releaseVersion': '0.21.0', 'releaseSHA256': digest(release), 'packageVersion': json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'],
        'ledger': counts, 'requirements': 73, 'strictPercentageComplete': 100 * 2 / 73,
        'frozenReleaseInputsVerified': len(base['sourceHashes']), 'currentReleaseInputDrift': drift,
        'checks': {'mountedFrontendPass': 1584, 'stagedNativeContentPass': 19, 'developmentGPU': True,
                   'packagedNormalFix': False, 'fullFeatureComplete': False},
        'testOnlyNamespaceAdapters': test_adapters,
        'proofHashes': proofs, 'sourceHashes': sources}
    DEST.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'checkpoint': str(DEST), 'frozenInputs': len(base['sourceHashes']),
                     'sourceInputs': len(sources), 'intentionalDrift': len(drift), 'ledger': counts}))


if __name__ == '__main__':
    main()
