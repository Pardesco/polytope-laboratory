"""Preserve source, executed harnesses and references for a promoted release."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    version = args.version
    assert version == read(ROOT / 'package.json')['version']
    release_path = ROOT / f'artifacts/release-{version}.json'
    promoted_path = ROOT / f'artifacts/promoted-portable-{version}.json'
    release, promoted = read(release_path), read(promoted_path)
    assert promoted['passed'] is True and promoted['version'] == release['version'] == version
    assert release['fullFeatureGoalComplete'] is False
    assert digest(release_path) == promoted['releaseProofSha256']
    assert digest(Path(promoted['destination'])) == promoted['sha256'] == release['portable']['sha256']
    hashes = {}
    references = {}
    for prefix in ('native-development', 'frontend-source-tests'):
        path = ROOT / f'artifacts/{prefix}-{version}.json'
        proof = read(path)
        assert proof['passed'] is True and proof['sourceUnchanged'] is True and proof['version'] == version
        assert proof['changedPaths'] == []
        references[prefix] = {'path': str(path), 'sha256': digest(path)}
        for relative, expected in proof['sourceHashes'].items():
            source = (ROOT / relative).resolve()
            assert source.is_relative_to(ROOT) and digest(source) == expected, relative
            if relative in hashes:
                assert hashes[relative] == expected
            hashes[relative] = expected
    for path in (ROOT / 'scripts').rglob('*'):
        if path.is_file() and path.suffix in ('.py', '.cjs', '.mjs') and '__pycache__' not in path.parts:
            hashes[path.relative_to(ROOT).as_posix()] = digest(path)
    specification = ROOT / 'STELLA4D_FEATURE_COMPLETE_BUILD_SPEC.md'
    assert digest(specification) == '7dafec36e99c7c883a7222f753f67f1c0818638359419a17f7ecbdf8b875df8d'
    hashes[specification.name] = digest(specification)
    for key, path in [('release', release_path), ('promotion', promoted_path),
                      ('native-bundle', ROOT / f'artifacts/native-bundle-candidate-{version}.json'),
                      ('frontend-bundle', ROOT / f'artifacts/frontend-candidate-{version}.json'),
                      ('portable', Path(release['validation']['actualPortable']['path']))]:
        references[key] = {'path': str(path), 'sha256': digest(path)}
    destination = ROOT / f'artifacts/frozen-{version}-release-qualified-source'
    destination.mkdir(exist_ok=False)
    for relative, expected in sorted(hashes.items()):
        original = (ROOT / relative).resolve()
        assert original.is_relative_to(ROOT) and digest(original) == expected, relative
        target = destination / 'source' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(original.read_bytes())
        assert digest(target) == expected
    manifest = {'schema': 1, 'version': version, 'createdUtc': datetime.now(timezone.utc).isoformat(),
        'scope': 'All qualified native/frontend/test/oracle inputs, original specification and current executed/dependent scripts; unfinished unmounted development excluded',
        'sourceHashes': dict(sorted(hashes.items())), 'evidenceReferences': references,
        'packagedSuites': release['validation']['packagedSuites'], 'portableSha256': promoted['sha256'],
        'fullFeatureGoalComplete': False}
    (destination / 'source-hashes.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Preserved {len(hashes)} release-qualified inputs: {destination}')


if __name__ == '__main__':
    main()
