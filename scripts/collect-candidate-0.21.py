"""Collect the actual 43-suite candidate proof using structured arguments."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    assert version == '0.21.0', 'This helper only names the retained actual 0.21 proof.'
    series = json.loads((ROOT / 'artifacts/desktop-series-hCyNxk/result.json').read_text(encoding='utf-8'))
    assert series['passed'] is True and series['version'] == version and len(series['qualifications']) == 43
    assert series['scriptUnchanged'] is True and series['scriptSha256'] == digest(ROOT / 'scripts/qualify-desktop-series.cjs')
    directories = []
    for entry in series['qualifications']:
        assert entry['passed'] is True and entry['exitCode'] == 0
        path = Path(entry['path']).resolve()
        assert path.is_relative_to(ROOT / 'artifacts')
        proof = json.loads(path.read_text(encoding='utf-8'))
        assert proof['qualificationScriptUnchanged'] is True
        assert proof['qualificationScriptSha256'] == digest(ROOT / 'scripts/qualify-desktop.cjs')
        assert len(proof['suites']) == 1 and proof['suites'][0]['name'] == entry['suite']
        suite = proof['suites'][0]
        harness = (ROOT / 'scripts' / suite['script']).resolve()
        assert harness.is_relative_to(ROOT / 'scripts')
        assert suite['scriptUnchanged'] is True and suite['scriptSha256'] == digest(harness)
        directories.append(str(path.parent))
    for name in ('native-development', 'frontend-source-tests'):
        proof = json.loads((ROOT / f'artifacts/{name}-{version}.json').read_text(encoding='utf-8'))
        assert proof['passed'] is True and proof['sourceUnchanged'] is True and proof['changedPaths'] == []
        for relative, expected in proof['sourceHashes'].items():
            assert digest(ROOT / relative) == expected, relative
    features = ['conforming-stereographic-surfaces', 'triangular-geodesic', 'convex-core-3d',
        'convex-core-4d', 'face-placement', 'full-source-construction-history', 'projection-auto-fit',
        'source-zonohedron', 'cell-attributes', 'animated-tours', 'net-expressions', 'spring-relaxation',
        'regular4d-validation', 'workspace-expressions', 'automatic-faceting',
        'incremental-stereographic-refinement', 'explicit-pose-video']
    command = [sys.executable, '-B', str(ROOT / 'scripts/collect-release-evidence.py'),
        '--qualification', *directories,
        '--executable', str(ROOT / f'release/0.21-candidate/Polytope Laboratory {version}.exe'),
        '--unpacked-root', str(ROOT / 'release/0.21-candidate/win-unpacked'),
        '--python-log', str(ROOT / f'artifacts/native-development-{version}.log'),
        '--native-source-proof', str(ROOT / f'artifacts/native-development-{version}.json'),
        '--node-log', str(ROOT / f'artifacts/frontend-source-tests-{version}.log'),
        '--portable-proof', str(ROOT / f'artifacts/portable-candidate-{version}/portable-smoke.json'),
        '--audit', str(ROOT / 'artifacts/drive-corpus-0.11.0.library-index.json'),
        '--expected-suites', '43', '--features', *features]
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
