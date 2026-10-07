"""Copy the exact qualified portable while preserving previous releases."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-proof', required=True, type=Path)
    parser.add_argument('--native-proof', required=True, type=Path)
    parser.add_argument('--frontend-proof', required=True, type=Path)
    args = parser.parse_args()
    release, native, frontend = [read(path) for path in
        (args.release_proof, args.native_proof, args.frontend_proof)]
    version = read(ROOT / 'package.json')['version']
    assert all(proof['version'] == version for proof in (release, native, frontend))
    assert release['fullFeatureGoalComplete'] is False
    assert native['passed'] is True and native['sourceUnchanged'] is True
    assert frontend['passed'] is True and frontend['currentInputsUnchanged'] is True
    unpacked = Path(native['unpackedRoot']).resolve()
    assert unpacked.is_relative_to(ROOT / 'release')
    assert frontend['archiveSha256'] == digest(unpacked / 'resources' / 'app.asar')
    assert native['packagedExecutableSha256'] == digest(unpacked / 'resources' / 'engine' / 'polytope-engine.exe')
    source_proof_path = Path(native['nativeSourceProof'])
    assert digest(source_proof_path) == native['nativeSourceProofSha256']
    source_proof = read(source_proof_path)
    assert source_proof['passed'] is True and source_proof['sourceUnchanged'] is True
    assert all(digest(ROOT / name) == value for name, value in source_proof['sourceHashes'].items())
    for item in release['validation']['qualifications']:
        assert digest(Path(item['path'])) == item['sha256']
        qualification = read(Path(item['path']))
        assert qualification['passed'] is True and qualification['runtimeUnchanged'] is True
        assert qualification['runtime']['archiveSha256'] == frontend['archiveSha256']
    portable = release['validation']['actualPortable']
    assert digest(Path(portable['path'])) == portable['sha256']
    assert portable['result']['passed'] is True and portable['result']['runtimeUnchanged'] is True
    assert portable['result']['developmentPythonDisabled'] is True
    source = Path(release['portable']['path']).resolve()
    assert source.is_relative_to(ROOT / 'release')
    expected = release['portable']['sha256']
    assert digest(source) == expected == portable['result']['executableSha256']
    destination = ROOT / 'release' / f'Polytope Laboratory {version}.exe'
    assert source != destination and not destination.exists(), 'Do not overwrite a promoted release'
    previous = {path.name: digest(path) for path in sorted(destination.parent.glob('Polytope Laboratory *.exe'))}
    destination.write_bytes(source.read_bytes())
    assert digest(destination) == expected
    assert all(digest(destination.parent / name) == value for name, value in previous.items())
    receipt = {'version': version, 'passed': True, 'createdUtc': datetime.now(timezone.utc).isoformat(),
        'scope': 'Exact qualified portable copied; previous releases preserved; original 73-requirement scope retained',
        'source': str(source), 'destination': str(destination), 'bytes': destination.stat().st_size,
        'sha256': expected, 'previousReleaseHashes': previous, 'previousReleasesUnchanged': True,
        'releaseProofSha256': digest(args.release_proof), 'nativeProofSha256': digest(args.native_proof),
        'frontendProofSha256': digest(args.frontend_proof), 'fullFeatureGoalComplete': False}
    output = ROOT / 'artifacts' / f'promoted-portable-{version}.json'
    output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(f'Promoted exact qualified portable: {destination}; {expected}')


if __name__ == '__main__':
    main()
